/**
 * Port of ai_erp parse_pdf.parse_document_text — LLM structures invoice text
 * into DocumentExtract (qty / unit_price / amount / thickness / size).
 */
import type {
  DocumentExtract,
  DocumentRole,
  InvoiceLineExtract,
  LineKind,
  VendorExtract,
} from '../../../shared/ghost';
import { EXTRACT_SCHEMA_HINT } from './extractSchema';
import { resolveParseModel, stripJsonFence } from './enrichAcrylic';
import { sanitizeExtract } from './sanitize';
import { propagateAcrylicDims } from './mapToExtract';

const LINE_KINDS: LineKind[] = ['acrylic', 'packing', 'ddp', 'freight', 'duty', 'other'];
const ROLES: DocumentRole[] = ['purchase_invoice', 'freight', 'duty', 'unknown'];

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
      raw.product_code != null
        ? String(raw.product_code)
        : isAcrylic
          ? 'ACR'
          : null,
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
  return {
    id: String(v.id || 'UNK').slice(0, 8).toUpperCase(),
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
    invoice_date: data.invoice_date != null ? String(data.invoice_date).slice(0, 10) : null,
    currency: data.currency != null ? String(data.currency) : 'USD',
    invoice_total: numOrNull(data.invoice_total),
    includes_ddp: Boolean(data.includes_ddp),
    ddp_amount: numOrNull(data.ddp_amount),
    freight_amount: numOrNull(data.freight_amount),
    duty_amount: numOrNull(data.duty_amount),
    lines,
    notes: [data.notes != null ? String(data.notes) : null, opts.note]
      .filter(Boolean)
      .join(' ')
      .trim() || null,
  };
  return sanitizeExtract(propagateAcrylicDims(base));
}

async function openaiJsonCompletion(messages: Array<{ role: string; content: string }>) {
  const apiKey = process.env.OPENAI_API_KEY?.trim();
  if (!apiKey) throw new Error('OPENAI_API_KEY is not set');
  const model = resolveParseModel();
  const resp = await fetch('https://api.openai.com/v1/chat/completions', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${apiKey}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ model, temperature: 0, messages }),
  });
  if (!resp.ok) {
    const detail = await resp.text().catch(() => '');
    throw new Error(`OpenAI parse failed HTTP ${resp.status}: ${detail.slice(0, 300)}`);
  }
  const body = (await resp.json()) as {
    choices?: Array<{ message?: { content?: string | null } }>;
  };
  return body.choices?.[0]?.message?.content || '';
}

/** ai_erp parse_document_text */
export async function parseDocumentText(
  text: string,
  opts: { hintRole?: string | null; model?: string; note?: string } = {},
): Promise<DocumentExtract> {
  if (!text.trim()) throw new Error('empty text for LLM invoice parse');
  const roleLine = opts.hintRole
    ? `This PDF is expected to be a ${opts.hintRole} document.\n`
    : '';
  const content = await openaiJsonCompletion([
    {
      role: 'system',
      content:
        'You extract Ghost Acrylics purchase / freight / duty invoice data for Sage 50 import. ' +
        EXTRACT_SCHEMA_HINT,
    },
    { role: 'user', content: roleLine + 'PDF text:\n\n' + text.slice(0, 50000) },
  ]);
  let data: Record<string, unknown>;
  try {
    data = JSON.parse(stripJsonFence(content)) as Record<string, unknown>;
  } catch (error) {
    throw new Error(
      `LLM returned non-JSON extract: ${error instanceof Error ? error.message : error}\n${content.slice(0, 500)}`,
    );
  }
  return documentExtractFromLlmJson(data, {
    hintRole: opts.hintRole,
    note: opts.note || '[parsed via text+LLM]',
  });
}
