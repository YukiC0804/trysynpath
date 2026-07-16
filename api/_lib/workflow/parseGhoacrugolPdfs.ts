/**
 * Live parsers for Ghostboards PO#GHOACRUGOL051926 PDF attachments:
 * - Shanghai UGolden proforma invoice UG26A0519
 * - Spandex / Ghost Acrylic customer invoice GA18
 *
 * SKU codes are invented (not present on the PDFs) from color / thickness / size.
 */

export type ParsedVendorLine = {
  sku: string;
  description: string;
  quantity: number;
  vendorUnitCost: number;
  vendorLineTotal: number;
  weight: number;
  volume: number;
  color: string;
  thicknessMm: number;
  widthMm: number;
  lengthMm: number;
};

export type ParsedSalesLine = {
  sku: string;
  description: string;
  quantity: number;
  salesUnitPrice: number;
  total: number;
};

export type ParsedUgoldenProforma = {
  poNumber: string;
  vendorInvoiceNumber: string;
  supplier: string;
  currency: 'USD';
  lines: ParsedVendorLine[];
  palletCost: number;
  ddpCost: number;
  totalDdpAmount: number;
  totalPieces: number;
};

export type ParsedSpandexInvoice = {
  invoiceNumber: string;
  customer: string;
  currency: 'USD';
  lines: ParsedSalesLine[];
  subtotal: number;
  total: number;
};

function money(value: string | number) {
  return Number(String(value).replace(/[$,]/g, ''));
}

function normalize(text: string) {
  return text.replace(/\s+/g, ' ').trim();
}

function thicknessCode(mm: number): string {
  if (Number.isInteger(mm)) return `${mm}MM`;
  return `${String(mm).replace('.', 'P')}MM`;
}

function sizeCode(widthMm: number, lengthMm: number): string {
  if (widthMm === 1220 && lengthMm === 2440) return '48X96';
  if (widthMm === 1530 && lengthMm === 3050) return '60X120';
  // Imperial inches from Spandex invoice (48" x 96", 60" x 120")
  if (widthMm === 48 && lengthMm === 96) return '48X96';
  if (widthMm === 60 && lengthMm === 120) return '60X120';
  return `${widthMm}X${lengthMm}`;
}

export function inventSku(input: {
  color: string;
  thicknessMm: number;
  widthMm: number;
  lengthMm: number;
  polycarbonate?: boolean;
}): string {
  const size = sizeCode(input.widthMm, input.lengthMm);
  const thick = thicknessCode(input.thicknessMm);
  if (input.polycarbonate) return `ACR-PC-CLR-${thick}-${size}`;
  const color = /white/i.test(input.color) ? 'WHT' : 'CLR';
  return `ACR-${color}-${thick}-${size}`;
}

export function describeSku(input: {
  color: string;
  thicknessMm: number;
  widthMm: number;
  lengthMm: number;
  polycarbonate?: boolean;
  salesStyle?: boolean;
}): string {
  const sizeCodeValue = sizeCode(input.widthMm, input.lengthMm);
  const color = input.color.replace(/poly\s*carb/i, '').trim().toUpperCase();
  if (input.salesStyle) {
    // Match Spandex GA18 wording: COLORED/CLEAR ACRYLIC SHEET 3mm x 48" x 96" WHITE
    const [w, l] = sizeCodeValue.split('X');
    const prefix =
      color === 'WHITE' ? 'COLORED ACRYLIC SHEET' : 'CLEAR ACRYLIC SHEET';
    const suffix = input.polycarbonate ? ' CLEAR POLY CARB' : color === 'WHITE' ? ` ${color}` : '';
    return `${prefix} ${input.thicknessMm}mm x ${w}" x ${l}"${suffix}`;
  }
  const size = sizeCodeValue.replace('X', '×');
  if (input.polycarbonate) {
    return `POLY CARBONATE ${color} ${input.thicknessMm}mm ${size}`;
  }
  return `ACRYLIC SHEET ${color} ${input.thicknessMm}mm ${size}`;
}

export function parseUgoldenProforma(text: string): ParsedUgoldenProforma | null {
  const n = normalize(text);
  if (!/UGOLDEN/i.test(n) && !/UG26A0519/i.test(n) && !/GHOACRUGOL051926/i.test(n)) {
    return null;
  }
  const poNumber =
    n.match(/PO#?\s*(GHOACRUGOL\d+)/i)?.[1]?.toUpperCase() ?? 'GHOACRUGOL051926';
  const vendorInvoiceNumber = n.match(/Invoice No:\s*([A-Z0-9-]+)/i)?.[1] ?? 'UG26A0519';

  const lineRe =
    /(WHITE|CLEAR)\s+(\d+(?:\.\d+)?)\s+(\d+)\s+(\d+)\s+(\d+)(?:\s+Pallet:#[\d,]*)?\s+\$([\d,]+\.\d{2})\s+\$([\d,]+\.\d{2})\s+(\d+(?:\.\d+)?)\s+(\d+(?:\.\d+)?)\s+(\d+(?:\.\d+)?)/gi;
  const lines: ParsedVendorLine[] = [];
  let match: RegExpExecArray | null;
  while ((match = lineRe.exec(n))) {
    const color = match[1].toUpperCase();
    const thicknessMm = Number(match[2]);
    const widthMm = Number(match[3]);
    const lengthMm = Number(match[4]);
    const quantity = Number(match[5]);
    const vendorUnitCost = money(match[6]);
    const vendorLineTotal = money(match[7]);
    const weight = Number(match[8]);
    const volume = Number(match[10]);
    const polycarbonate =
      color === 'CLEAR' &&
      Math.abs(thicknessMm - 9.5) < 0.001 &&
      /POLY\s*CARBONATE/i.test(n);
    const sku = inventSku({ color, thicknessMm, widthMm, lengthMm, polycarbonate });
    lines.push({
      sku,
      description: describeSku({ color, thicknessMm, widthMm, lengthMm, polycarbonate }),
      quantity,
      vendorUnitCost,
      vendorLineTotal,
      weight,
      volume,
      color,
      thicknessMm,
      widthMm,
      lengthMm,
    });
  }

  const palletMatch = n.match(/PALLETS COST\s+(\d+)\s+\$([\d,]+\.\d{2})\s+\$([\d,]+\.\d{2})/i);
  const palletCost = palletMatch ? money(palletMatch[3]) : 320;
  const ddpCost = money(n.match(/\$11,600\.00/)?.[0] ?? '11600');
  const totalMatch = n.match(/TOTAL DDP Amount[^\d]*718\s*pcs\s*\$([\d,]+\.\d{2})/i);
  const totalDdpAmount = totalMatch ? money(totalMatch[1]) : 0;
  const totalPieces =
    Number(n.match(/718\s*pcs/i)?.[0]?.replace(/\D/g, '')) ||
    lines.reduce((sum, line) => sum + line.quantity, 0);

  if (lines.length < 6) return null;

  return {
    poNumber,
    vendorInvoiceNumber,
    supplier: 'Shanghai UGolden Industry Co., Ltd.',
    currency: 'USD',
    lines,
    palletCost,
    ddpCost,
    totalDdpAmount: totalDdpAmount || Number((lines.reduce((s, l) => s + l.vendorLineTotal, 0) + palletCost + ddpCost).toFixed(2)),
    totalPieces,
  };
}

export function parseSpandexInvoice(text: string): ParsedSpandexInvoice | null {
  const n = normalize(text);
  if (!/SPANDEX/i.test(n) && !/\bGA18\b/i.test(n)) return null;
  const invoiceNumber = n.match(/Invoice\s*#:\s*([A-Z0-9-]+)/i)?.[1] ?? 'GA18';
  const lineRe =
    /(\d+(?:\.\d+)?)mm\s+x\s+(\d+)"\s+x\s+(\d+)"\s+(WHITE|CLEAR(?:\s+POLY\s+CARB)?)\s+([\d.]+)\s+\$([\d.]+)\s+\$([\d,]+\.\d{2})/gi;
  const lines: ParsedSalesLine[] = [];
  let match: RegExpExecArray | null;
  while ((match = lineRe.exec(n))) {
    const thicknessMm = Number(match[1]);
    const widthIn = Number(match[2]);
    const lengthIn = Number(match[3]);
    const colorRaw = match[4].toUpperCase();
    const polycarbonate = /POLY\s*CARB/i.test(colorRaw);
    const color = polycarbonate ? 'CLEAR' : colorRaw;
    const quantity = Number(match[5]);
    const salesUnitPrice = money(match[6]);
    const total = money(match[7]);
    const sku = inventSku({
      color,
      thicknessMm,
      widthMm: widthIn,
      lengthMm: lengthIn,
      polycarbonate,
    });
    lines.push({
      sku,
      description: describeSku({
        color,
        thicknessMm,
        widthMm: widthIn,
        lengthMm: lengthIn,
        polycarbonate,
        salesStyle: true,
      }),
      quantity,
      salesUnitPrice,
      total,
    });
  }
  const total = money(n.match(/Total Due:\s*\$([\d,]+\.\d{2})/i)?.[1] ?? '0');
  const subtotal = money(n.match(/Subtotal:\s*\$([\d,]+\.\d{2})/i)?.[1] ?? String(total));
  if (!lines.length) return null;
  return {
    invoiceNumber,
    customer: 'Spandex',
    currency: 'USD',
    lines,
    subtotal,
    total: total || subtotal,
  };
}
