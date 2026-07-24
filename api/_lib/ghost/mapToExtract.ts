import type {
  DocumentExtract,
  DocumentRole,
  InvoiceLineExtract,
  LineKind,
  VendorExtract,
} from '../../../shared/ghost';
import type { DocAiLineItem, InvoiceData } from './documentAi';
import { parseInvoiceBytes } from './documentAi';
import { sanitizeExtract } from './sanitize';

const THICKNESS_RE = /(?<![A-Za-z])(\d+(?:\.\d+)?)\s*mm(?![A-Za-z])/i;
const SIZE_RE =
  /(?<![A-Za-z])(\d+(?:\.\d+)?)\s*['"]?\s*[x×]\s*(\d+(?:\.\d+)?)\s*['"]?(?![A-Za-z])/i;
const SKU_SIZE_RE = /(\d+(?:\.\d+)?)mm(\d+(?:\.\d+)?)x(\d+(?:\.\d+)?)/i;
const ACRYLIC_HINT_RE = /acrylic|plexiglass|perspex|sheet|gokai|\bacr\b|\bgho\b/i;
const PACKING_RE = /pack(?:ing|age)?|pallet|crate|misc|handling|sundry|wood\s*frame/i;
const DDP_RE = /\bDDP\b|delivered\s+duty\s+paid|landed\s+cost/i;
const FREIGHT_RE = /freight|shipping|courier|carrier|logistics/i;
const DUTY_RE = /\bduty\b|customs|tariff|brokerage/i;
const COLOR_MAP: Record<string, [string, string]> = {
  clear: ['CLR', 'Clear'],
  clr: ['CLR', 'Clear'],
  white: ['WHT', 'White'],
  black: ['BLK', 'Black'],
  opaq: ['OPQ', 'Opaque'],
  opaque: ['OPQ', 'Opaque'],
};

function vendorIdFromName(name: string): string {
  const words = name.match(/[A-Za-z]+/g) ?? [];
  if (!words.length) return 'UNK';
  if (words[0]!.length >= 3) return words[0]!.slice(0, 3).toUpperCase();
  return (words.map((w) => w[0]).join('').slice(0, 4) || 'UNK').toUpperCase();
}

function parseInvoiceDate(raw: string): string | null {
  if (!raw?.trim()) return null;
  const s = raw.trim();
  const tryFormats = [
    /^(\d{4})-(\d{2})-(\d{2})/,
    /^(\d{4})\/(\d{2})\/(\d{2})/,
    /^(\d{2})\/(\d{2})\/(\d{4})/,
    /^(\d{2})-(\d{2})-(\d{4})/,
  ];
  for (const re of tryFormats) {
    const m = s.match(re);
    if (!m) continue;
    if (re.source.startsWith('^(\\d{4})')) return `${m[1]}-${m[2]}-${m[3]}`;
    return `${m[3]}-${m[1]}-${m[2]}`;
  }
  const d = new Date(s);
  if (!Number.isNaN(d.getTime())) return d.toISOString().slice(0, 10);
  return null;
}

function parseThicknessSize(text: string): { thickness: number | null; size: string | null } {
  const sku = SKU_SIZE_RE.exec(text.replace(/ /g, ''));
  if (sku) return { thickness: Number(sku[1]), size: `${sku[2]}x${sku[3]}` };
  const thickM = THICKNESS_RE.exec(text);
  const sizeM = SIZE_RE.exec(text);
  return {
    thickness: thickM ? Number(thickM[1]) : null,
    size: sizeM ? `${sizeM[1]}x${sizeM[2]}` : null,
  };
}

function enrichLineFromDescription(desc: string, item: DocAiLineItem): InvoiceLineExtract {
  const text = (desc || item.description || '').trim();
  const { thickness, size } = parseThicknessSize(text);
  let colorCode = 'CLR';
  let colorName = 'Clear';
  const lower = text.toLowerCase();
  for (const [key, [code, name]] of Object.entries(COLOR_MAP)) {
    if (new RegExp(`\\b${key}\\b`, 'i').test(lower)) {
      colorCode = code;
      colorName = name;
      break;
    }
  }
  const qty = Number(item.quantity || 0);
  let unit = Number(item.unit_price || 0);
  const amount = item.amount != null ? Number(item.amount) : null;
  if (amount != null && qty > 0) unit = amount / qty;

  const isPacking = PACKING_RE.test(text);
  const isDdp = DDP_RE.test(text);
  const isFreight = FREIGHT_RE.test(text);
  const isDuty = DUTY_RE.test(text);
  const looksProduct = ACRYLIC_HINT_RE.test(text) || Boolean(item.product_code);
  const isAcrylic =
    !(isPacking || isDdp || isFreight || isDuty) &&
    (Boolean(thickness && size) ||
      (looksProduct && qty > 0 && (unit > 2.5 || (amount ?? 0) > 2.5)));

  let kind: LineKind = 'other';
  if (isDdp) kind = 'ddp';
  else if (isFreight) kind = 'freight';
  else if (isDuty) kind = 'duty';
  else if (isPacking) kind = 'packing';
  else if (isAcrylic) kind = 'acrylic';

  return {
    raw_description: text || '(no description)',
    is_acrylic: isAcrylic,
    is_packing_or_misc: isPacking,
    product_code: isAcrylic ? item.product_code || 'ACR' : item.product_code || null,
    color_code: isAcrylic ? colorCode : null,
    color_name: isAcrylic ? colorName : null,
    thickness_mm: thickness,
    size,
    quantity: qty,
    unit_price: unit,
    amount,
    line_kind: kind,
  };
}

export function documentAiToExtract(
  invoice: InvoiceData,
  hintRole?: string | null,
): DocumentExtract {
  let role = (hintRole || 'unknown') as DocumentRole;
  if (!['purchase_invoice', 'freight', 'duty', 'unknown'].includes(role)) role = 'unknown';

  let vendor: VendorExtract | null = null;
  if (invoice.supplier_name) {
    vendor = {
      id: vendorIdFromName(invoice.supplier_name),
      name: invoice.supplier_name,
      company_name: invoice.supplier_name,
      email: invoice.supplier_email || null,
      address1: invoice.supplier_address || null,
    };
  }

  let lines = invoice.line_items.map((li) => enrichLineFromDescription(li.description, li));
  let freightAmount = invoice.freight_amount;
  let dutyAmount: number | null = null;
  let ddpAmount: number | null = null;
  let includesDdp = false;
  const total = invoice.total_amount;

  if (role === 'freight') {
    freightAmount = freightAmount ?? total;
    lines =
      lines.map((ln) => ({ ...ln, is_acrylic: false, line_kind: 'freight' as const })) ||
      [];
    if (!lines.length) {
      lines = [
        {
          raw_description: 'Freight (Document AI total)',
          is_acrylic: false,
          is_packing_or_misc: false,
          quantity: 1,
          unit_price: Number(freightAmount || 0),
          amount: freightAmount != null ? Number(freightAmount) : null,
          line_kind: 'freight',
        },
      ];
    }
  } else if (role === 'duty') {
    dutyAmount = total;
    lines = lines.map((ln) => ({ ...ln, is_acrylic: false, line_kind: 'duty' as const }));
    if (!lines.length) {
      lines = [
        {
          raw_description: 'Duty (Document AI total)',
          is_acrylic: false,
          is_packing_or_misc: false,
          quantity: 1,
          unit_price: Number(dutyAmount || 0),
          amount: dutyAmount != null ? Number(dutyAmount) : null,
          line_kind: 'duty',
        },
      ];
    }
  } else {
    for (const ln of lines) {
      if (ln.line_kind === 'ddp' && ln.amount != null) {
        includesDdp = true;
        ddpAmount = (ddpAmount || 0) + Number(ln.amount);
      }
    }
    if (invoice.freight_amount && !includesDdp) freightAmount = invoice.freight_amount;
  }

  return {
    document_role: role,
    vendor,
    invoice_number: invoice.invoice_id || null,
    invoice_date: parseInvoiceDate(invoice.invoice_date),
    currency: invoice.currency || 'USD',
    invoice_total: total,
    includes_ddp: includesDdp,
    ddp_amount: ddpAmount,
    freight_amount: freightAmount,
    duty_amount: dutyAmount,
    lines,
    notes: `[parsed via Document AI invoice_id=${JSON.stringify(invoice.invoice_id)} lines=${lines.length}]`,
  };
}

export async function parseWithDocumentAi(
  content: Buffer,
  hintRole?: string | null,
): Promise<DocumentExtract> {
  const invoice = await parseInvoiceBytes(content);
  const doc = documentAiToExtract(invoice, hintRole);
  return sanitizeExtract(doc);
}
