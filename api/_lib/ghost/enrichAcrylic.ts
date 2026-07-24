/**
 * Port of ai_erp map_to_extract.enrich_acrylic_attrs_with_llm.
 * Document AI owns money; LLM fills acrylic thickness/size/color when missing.
 */
import type { DocumentExtract, InvoiceLineExtract, LineKind } from '../../../shared/ghost';

const LINE_KINDS: LineKind[] = ['acrylic', 'packing', 'ddp', 'freight', 'duty', 'other'];

export function llmEnrichConfigured(): boolean {
  return Boolean(process.env.OPENAI_API_KEY?.trim());
}

export function resolveParseModel(): string {
  return (
    process.env.GHOST_PO_PARSE_MODEL ||
    process.env.DEFAULT_MODEL ||
    'gpt-4o-mini'
  );
}

export function needsAcrylicEnrichment(doc: DocumentExtract): boolean {
  if (doc.document_role !== 'purchase_invoice' && doc.document_role !== 'unknown') {
    return false;
  }
  const acrylic = doc.lines.filter((ln) => ln.is_acrylic && ln.line_kind === 'acrylic');
  if (!acrylic.length) return true;
  return acrylic.some((ln) => ln.thickness_mm == null || !ln.size);
}

export function stripJsonFence(raw: string): string {
  const trimmed = raw.trim();
  const m = /```(?:json)?\s*([\s\S]*?)```/.exec(trimmed);
  return m ? m[1]!.trim() : trimmed;
}

function asLineKind(value: unknown, fallback: LineKind): LineKind {
  return typeof value === 'string' && LINE_KINDS.includes(value as LineKind)
    ? (value as LineKind)
    : fallback;
}

function mergeLine(
  original: InvoiceLineExtract,
  upd: Record<string, unknown>,
): InvoiceLineExtract {
  const candidate: InvoiceLineExtract = {
    ...original,
    is_acrylic:
      typeof upd.is_acrylic === 'boolean' ? upd.is_acrylic : original.is_acrylic,
    is_packing_or_misc:
      typeof upd.is_packing_or_misc === 'boolean'
        ? upd.is_packing_or_misc
        : original.is_packing_or_misc,
    line_kind: asLineKind(upd.line_kind, original.line_kind),
    product_code:
      upd.product_code != null ? String(upd.product_code) : original.product_code,
    color_code: upd.color_code != null ? String(upd.color_code) : original.color_code,
    color_name: upd.color_name != null ? String(upd.color_name) : original.color_name,
    thickness_mm:
      upd.thickness_mm != null && upd.thickness_mm !== ''
        ? Number(upd.thickness_mm)
        : original.thickness_mm,
    size: upd.size != null && upd.size !== '' ? String(upd.size) : original.size,
    quantity: original.quantity,
    unit_price: original.unit_price,
    amount: original.amount,
    raw_description: original.raw_description,
  };

  const qty = original.quantity || Number(upd.quantity ?? 0) || candidate.quantity;
  let unit = original.unit_price || Number(upd.unit_price ?? 0) || candidate.unit_price;
  const amount =
    original.amount != null
      ? original.amount
      : upd.amount != null
        ? Number(upd.amount)
        : candidate.amount;
  if (amount != null && qty > 0) unit = Number(amount) / Number(qty);

  return {
    ...candidate,
    quantity: qty,
    unit_price: unit,
    amount: amount ?? null,
    thickness_mm:
      candidate.thickness_mm != null && Number.isFinite(Number(candidate.thickness_mm))
        ? Number(candidate.thickness_mm)
        : null,
  };
}

function lineFromLlm(upd: Record<string, unknown>): InvoiceLineExtract {
  const qty = Number(upd.quantity ?? 0);
  let unit = Number(upd.unit_price ?? 0);
  const amount = upd.amount != null ? Number(upd.amount) : null;
  if (amount != null && qty > 0) unit = amount / qty;
  const isAcrylic = Boolean(upd.is_acrylic);
  return {
    raw_description: String(upd.raw_description || '(no description)'),
    is_acrylic: isAcrylic,
    is_packing_or_misc: Boolean(upd.is_packing_or_misc),
    product_code: upd.product_code != null ? String(upd.product_code) : isAcrylic ? 'ACR' : null,
    color_code: upd.color_code != null ? String(upd.color_code) : null,
    color_name: upd.color_name != null ? String(upd.color_name) : null,
    thickness_mm:
      upd.thickness_mm != null && upd.thickness_mm !== ''
        ? Number(upd.thickness_mm)
        : null,
    size: upd.size != null && upd.size !== '' ? String(upd.size) : null,
    quantity: qty,
    unit_price: unit,
    amount,
    line_kind: asLineKind(upd.line_kind, isAcrylic ? 'acrylic' : 'other'),
  };
}

export async function enrichAcrylicAttrsWithLlm(
  doc: DocumentExtract,
  opts: { rawText?: string; model?: string } = {},
): Promise<DocumentExtract> {
  const apiKey = process.env.OPENAI_API_KEY?.trim();
  if (!apiKey) {
    throw new Error('OPENAI_API_KEY is not set (required for acrylic LLM enrich, same as ai_erp)');
  }

  const model = opts.model || resolveParseModel();
  const payload = {
    vendor: doc.vendor ?? null,
    invoice_number: doc.invoice_number,
    invoice_date: doc.invoice_date,
    invoice_total: doc.invoice_total,
    lines: doc.lines,
    ocr_text_excerpt: (opts.rawText || '').slice(0, 12000),
  };

  const resp = await fetch('https://api.openai.com/v1/chat/completions', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${apiKey}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      model,
      temperature: 0,
      messages: [
        {
          role: 'system',
          content:
            'You classify Ghost Acrylics purchase-invoice lines. ' +
            'Return ONLY JSON: {"lines":[...]} matching the input lines ' +
            '1:1 (same order/count). For each line set: is_acrylic, ' +
            'is_packing_or_misc, line_kind, product_code (default ACR), ' +
            'color_code, color_name, thickness_mm, size (e.g. 4x8 or 18x24), ' +
            'quantity, unit_price, amount, raw_description. ' +
            'Acrylic sheets need thickness_mm + size. ' +
            'Infer thickness_mm and size from OCR text, product codes (GK-*), ' +
            'and phrases like "cut to 18\\" x 24\\"" when line text is fragmented. ' +
            'Do NOT invent money — keep quantity/unit_price/amount from ' +
            'input when present. Density/kg/mm are NOT prices.',
        },
        {
          role: 'user',
          content: JSON.stringify(payload),
        },
      ],
    }),
  });

  if (!resp.ok) {
    const detail = await resp.text().catch(() => '');
    throw new Error(`OpenAI enrich failed HTTP ${resp.status}: ${detail.slice(0, 300)}`);
  }

  const body = (await resp.json()) as {
    choices?: Array<{ message?: { content?: string | null } }>;
  };
  const content = body.choices?.[0]?.message?.content || '';
  const data = JSON.parse(stripJsonFence(content)) as { lines?: unknown };
  const rawLines = data.lines;

  if (!Array.isArray(rawLines) || rawLines.length !== doc.lines.length) {
    if (doc.lines.length) return doc;
    if (!Array.isArray(rawLines) || !rawLines.length) return doc;
    const merged = rawLines.map((x) => lineFromLlm(x as Record<string, unknown>));
    return {
      ...doc,
      lines: merged,
      notes: `${doc.notes || ''} [acrylic attrs via LLM; new lines]`.trim(),
    };
  }

  const merged = doc.lines.map((original, i) => {
    try {
      return mergeLine(original, rawLines[i] as Record<string, unknown>);
    } catch {
      return original;
    }
  });

  return {
    ...doc,
    lines: merged,
    notes: `${doc.notes || ''} [acrylic attrs via LLM]`.trim(),
  };
}
