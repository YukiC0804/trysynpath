import type { AcrylicSkuLine, InvoiceLineExtract } from '../../../shared/ghost';

export const COMPANY_CODE = 'GHO';

function alnumUpper(s: string): string {
  return s.replace(/[^A-Za-z0-9]/g, '').toUpperCase();
}

function thicknessToken(mm: number): string {
  if (Number.isInteger(mm)) return `${mm}mm`;
  return `${Number(mm.toString())}mm`.replace(/mm$/, '') + 'mm';
}

export function normalizeSheetSize(size: string): string {
  let s = size.trim().toLowerCase().replace(/['"]/g, '');
  s = s.replace(/\s*[x×]\s*/g, 'x').replace(/\s+/g, '');
  const parts = s.split('x');
  if (parts.length !== 2) return s;
  const a = Number(parts[0]);
  const b = Number(parts[1]);
  if (!Number.isFinite(a) || !Number.isFinite(b)) return s;
  if (a >= 100 && b >= 100) {
    const ftA = Math.round(a / 304.8);
    const ftB = Math.round(b / 304.8);
    if (ftA > 0 && ftB > 0) return `${ftA}x${ftB}`;
  }
  const fmt = (v: number) => (Number.isInteger(v) ? String(v) : String(Number(v.toPrecision(6))));
  return `${fmt(a)}x${fmt(b)}`;
}

function prettySize(size: string): string {
  const tok = normalizeSheetSize(size);
  const parts = tok.split('x');
  if (parts.length === 2 && parts[0] && parts[1]) return `${parts[0]}' x ${parts[1]}'`;
  return size.trim();
}

function vendorDisplayName(vendorId: string, vendorName: string | null | undefined): string {
  if (vendorName?.trim()) return vendorName.trim().split(/\s+/)[0]!;
  return vendorId;
}

export function buildSkuId(input: {
  vendorId: string;
  productCode: string;
  colorCode: string;
  thicknessMm: number;
  size: string;
  companyCode?: string;
}): string {
  return (
    alnumUpper(input.companyCode ?? COMPANY_CODE) +
    alnumUpper(input.vendorId) +
    alnumUpper(input.productCode) +
    alnumUpper(input.colorCode) +
    thicknessToken(input.thicknessMm) +
    normalizeSheetSize(input.size)
  );
}

export function buildDescription(input: {
  vendorId: string;
  vendorName?: string | null;
  thicknessMm: number;
  size: string;
  colorName?: string | null;
  productWord?: string;
}): string {
  const vendor = vendorDisplayName(input.vendorId, input.vendorName);
  const thick = thicknessToken(input.thicknessMm);
  const pretty = prettySize(input.size);
  const color = (input.colorName || '').trim() || 'Clear';
  return `Ghost ${vendor} ${input.productWord ?? 'Acrylic'} ${thick} x ${pretty} ${color}.`;
}

export function acrylicLineFromExtract(
  line: InvoiceLineExtract,
  vendorId: string,
  vendorName: string | null | undefined,
): AcrylicSkuLine {
  if (line.thickness_mm == null || !line.size) {
    throw new Error(`acrylic line needs thickness_mm and size: ${line.raw_description}`);
  }
  const product = line.product_code || 'ACR';
  const colorCode = line.color_code || 'CLR';
  const colorName = line.color_name || 'Clear';
  const sku = buildSkuId({
    vendorId,
    productCode: product,
    colorCode,
    thicknessMm: line.thickness_mm,
    size: line.size,
  });
  const desc = buildDescription({
    vendorId,
    vendorName,
    thicknessMm: line.thickness_mm,
    size: line.size,
    colorName,
  });
  const qty = Number(line.quantity);
  const unit =
    line.amount != null && qty > 0 ? Number(line.amount) / qty : Number(line.unit_price);
  return {
    sku_id: sku,
    description: desc,
    thickness_mm: Number(line.thickness_mm),
    size: normalizeSheetSize(line.size),
    quantity: qty,
    raw_unit_price: unit,
    sheet_weight_kg: 0,
    land_cost_per_sheet: 0,
    landed_unit_cost: unit,
    amount: qty * unit,
    raw_description: line.raw_description,
  };
}
