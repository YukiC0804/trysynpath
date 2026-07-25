/**
 * Port of ai_erp parse_pdf LLM helpers:
 * - parse_document_text
 * - parse_document_images (vision over PNG pages)
 * - parse_document_two_pass
 */
import type {
  DocumentExtract,
  DocumentRole,
  InvoiceLineExtract,
  LineKind,
  VendorExtract,
} from '../../../shared/ghost';
import { EXTRACT_SCHEMA_HINT, OCR_MARKDOWN_HINT } from './extractSchema';
import { resolveParseModel, stripJsonFence } from './enrichAcrylic';
import { sanitizeExtract } from './sanitize';

const LINE_KINDS: LineKind[] = ['acrylic', 'packing', 'ddp', 'freight', 'duty', 'other'];
const ROLES: DocumentRole[] = ['purchase_invoice', 'freight', 'duty', 'unknown'];

export type PageImage = { mime: string; base64: string };

function asRole(v: unknown, fallback: DocumentRole): DocumentRole {
  return typeof v === 'string' && ROLES.includes(v as DocumentRole)
    ? (v as DocumentRole)
    : fallback;
}

function asKind(v: unknown, fallback: LineKind): LineKind {
  return typeof v === 'string' && LINE_KINDS.includes(v as LineKind)
    ? (v as LineKind)
    : fallback;
}

function num(v: unknown, fallback = 0): number {
  const n = Number(v);
  return Number.isFinite(n) ? n : fallback;
}

function numOrNull(v: unknown): number | null {
  if (v == null || v === '') return null;
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
}

function normalizeInvoiceDate(raw: unknown): string | null {
  if (raw == null || raw === '') return null;
  const s = String(raw).trim();
  const iso = /^(\d{4})-(\d{2})-(\d{2})/.exec(s);
  if (iso) return `${iso[1]}-${iso[2]}-${iso[3]}`;
  const us = /^(\d{1,2})\/(\d{1,2})\/(\d{4})/.exec(s);
  if (us) {
    return `${us[3]}-${us[1]!.padStart(2, '0')}-${us[2]!.padStart(2, '0')}`;
  }
  const d = new Date(s);
  if (!Number.isNaN(d.getTime())) return d.toISOString().slice(0, 10);
  return null;
}

function mapLine(raw: Record<string, unknown>): InvoiceLineExtract {
  const isAcrylic = Boolean(raw.is_acrylic);
  const qty = num(raw.quantity);
  let unit = num(raw.unit_price);
  const amount = numOrNull(raw.amount);
  if (amount != null && qty > 0) unit = amount / qty;
  return {
    raw_description: String(raw.raw_description || '(no description)'),
    is_acrylic: isAcrylic,
    is_packing_or_misc: Boolean(raw.is_packing_or_misc),
    product_code:
      raw.product_code != null ? String(raw.product_code) : isAcrylic ? 'ACR' : null,
    color_code: raw.color_code != null ? String(raw.color_code) : null,
    color_name: raw.color_name != null ? String(raw.color_name) : null,
    vendor_product_name:
      raw.vendor_product_name != null ? String(raw.vendor_product_name) : null,
    thickness_mm: numOrNull(raw.thickness_mm),
    size: raw.size != null && raw.size !== '' ? String(raw.size) : null,
    quantity: qty,
    unit_price: unit,
    amount,
    line_kind: asKind(raw.line_kind, isAcrylic ? 'acrylic' : 'other'),
  };
}

function mapVendor(raw: unknown): VendorExtract | null {
  if (!raw || typeof raw !== 'object') return null;
  const v = raw as Record<string, unknown>;
  if (!v.name && !v.id) return null;
  const idRaw = String(v.id || 'UNK')
    .replace(/[^A-Za-z0-9]/g, '')
    .toUpperCase()
    .slice(0, 4);
  return {
    id: idRaw || 'UNK',
    name: String(v.name || v.company_name || 'Unknown'),
    company_name: v.company_name != null ? String(v.company_name) : null,
    email: v.email != null ? String(v.email) : null,
    address1: v.address1 != null ? String(v.address1) : null,
    address2: v.address2 != null ? String(v.address2) : null,
    city: v.city != null ? String(v.city) : null,
    state: v.state != null ? String(v.state) : null,
    zip: v.zip != null ? String(v.zip) : null,
    country: v.country != null ? String(v.country) : null,
  };
}

/** ai_erp _parse_llm_json + sanitize_extract */
export function documentExtractFromLlmJson(
  data: Record<string, unknown>,
  opts: { hintRole?: string | null; note?: string } = {},
): DocumentExtract {
  const fallbackRole = asRole(opts.hintRole, 'unknown');
  const linesRaw = Array.isArray(data.lines) ? data.lines : [];
  const lines = linesRaw.map((x) => mapLine((x || {}) as Record<string, unknown>));
  const base: DocumentExtract = {
    document_role: asRole(data.document_role, fallbackRole),
    vendor: mapVendor(data.vendor),
    invoice_number: data.invoice_number != null ? String(data.invoice_number) : null,
    invoice_date: normalizeInvoiceDate(data.invoice_date),
    currency: data.currency != null ? String(data.currency) : 'USD',
    invoice_total: numOrNull(data.invoice_total),
    includes_ddp: Boolean(data.includes_ddp),
    ddp_amount: numOrNull(data.ddp_amount),
    freight_amount: numOrNull(data.freight_amount),
    duty_amount: numOrNull(data.duty_amount),
    lines,
    notes:
      [data.notes != null ? String(data.notes) : null, opts.note]
        .filter(Boolean)
        .join(' ')
        .trim() || null,
  };
  return sanitizeExtract(base);
}

function resolveVisionModel(): string {
  return process.env.GHOST_PO_VISION_MODEL || 'gpt-4o';
}

async function openaiChatCompletion(body: Record<string, unknown>): Promise<string> {
  const apiKey = process.env.OPENAI_API_KEY?.trim();
  if (!apiKey) throw new Error('OPENAI_API_KEY is not set');
  const resp = await fetch('https://api.openai.com/v1/chat/completions', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${apiKey}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(body),
  });
  if (!resp.ok) {
    const detail = await resp.text().catch(() => '');
    throw new Error(`OpenAI chat failed HTTP ${resp.status}: ${detail.slice(0, 400)}`);
  }
  const json = (await resp.json()) as {
    choices?: Array<{ message?: { content?: string | null } }>;
  };
  return json.choices?.[0]?.message?.content || '';
}

function parseLlmJsonContent(content: string): Record<string, unknown> {
  try {
    return JSON.parse(stripJsonFence(content)) as Record<string, unknown>;
  } catch (error) {
    throw new Error(
      `LLM returned non-JSON extract: ${error instanceof Error ? error.message : error}\n${content.slice(0, 500)}`,
    );
  }
}

/** ai_erp parse_document_text */
export async function parseDocumentText(
  text: string,
  opts: { hintRole?: string | null; note?: string } = {},
): Promise<DocumentExtract> {
  if (!text.trim()) throw new Error('empty text for LLM invoice parse');
  const roleLine = opts.hintRole
    ? `This PDF is expected to be a ${opts.hintRole} document.\n`
    : '';
  const content = await openaiChatCompletion({
    model: resolveParseModel(),
    temperature: 0,
    messages: [
      {
        role: 'system',
        content:
          'You extract Ghost Acrylics purchase / freight / duty invoice data for Sage 50 import. ' +
          EXTRACT_SCHEMA_HINT,
      },
      { role: 'user', content: roleLine + 'PDF text:\n\n' + text.slice(0, 50000) },
    ],
  });
  return documentExtractFromLlmJson(parseLlmJsonContent(content), {
    hintRole: opts.hintRole,
    note: opts.note || '[parsed via text+LLM]',
  });
}

/** ai_erp _vision_user_content + parse_document_images */
export async function parseDocumentImages(
  images: PageImage[],
  opts: { hintRole?: string | null; textHint?: string; note?: string } = {},
): Promise<DocumentExtract> {
  if (!images.length) throw new Error('no page images available for vision parse');
  const roleLine = opts.hintRole
    ? `This PDF is expected to be a ${opts.hintRole} document.\n`
    : 'Invoice / bill PDF page image(s).\n';
  const textPart =
    roleLine +
    'Read the document image(s) carefully (tables + totals). ' +
    EXTRACT_SCHEMA_HINT +
    (opts.textHint?.trim()
      ? `\n\nOptional text layer (may be incomplete):\n${opts.textHint.slice(0, 8000)}`
      : '');

  const userContent: Array<Record<string, unknown>> = [{ type: 'text', text: textPart }];
  for (const img of images) {
    userContent.push({
      type: 'image_url',
      image_url: { url: `data:${img.mime};base64,${img.base64}` },
    });
  }

  const content = await openaiChatCompletion({
    model: resolveVisionModel(),
    temperature: 0,
    messages: [
      {
        role: 'system',
        content:
          'You extract Ghost Acrylics purchase / freight / duty invoice data for Sage 50 import from document page images. Money fields must be currency amounts only.',
      },
      { role: 'user', content: userContent },
    ],
  });
  return documentExtractFromLlmJson(parseLlmJsonContent(content), {
    hintRole: opts.hintRole,
    note: opts.note || '[parsed via vision/PNG+LLM]',
  });
}

/** ai_erp parse_document_two_pass */
export async function parseDocumentTwoPass(
  images: PageImage[],
  opts: { hintRole?: string | null; textHint?: string } = {},
): Promise<DocumentExtract> {
  if (!images.length) throw new Error('no page images available for two-pass parse');
  const roleLine = opts.hintRole ? `Expected document type: ${opts.hintRole}.\n` : '';
  const ocrParts: Array<Record<string, unknown>> = [
    { type: 'text', text: roleLine + OCR_MARKDOWN_HINT },
  ];
  for (const img of images) {
    ocrParts.push({
      type: 'image_url',
      image_url: { url: `data:${img.mime};base64,${img.base64}` },
    });
  }
  const markdown = (
    await openaiChatCompletion({
      model: resolveVisionModel(),
      temperature: 0,
      messages: [
        { role: 'system', content: 'You are a careful invoice OCR transcriber.' },
        { role: 'user', content: ocrParts },
      ],
    })
  ).trim();
  if (!markdown) throw new Error('two-pass OCR returned empty markdown');

  let structUser = roleLine + 'OCR markdown from the PDF:\n\n' + markdown.slice(0, 50000);
  if (opts.textHint?.trim()) {
    structUser += '\n\nOptional PDF text layer:\n' + opts.textHint.slice(0, 8000);
  }
  const content = await openaiChatCompletion({
    model: resolveParseModel(),
    temperature: 0,
    messages: [
      {
        role: 'system',
        content:
          'You map invoice OCR markdown into structured JSON for Sage import. ' +
          EXTRACT_SCHEMA_HINT,
      },
      { role: 'user', content: structUser },
    ],
  });
  return documentExtractFromLlmJson(parseLlmJsonContent(content), {
    hintRole: opts.hintRole,
    note: '[parsed via two_pass OCR]',
  });
}
