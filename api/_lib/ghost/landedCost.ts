import type {
  AcrylicSkuLine,
  DocumentExtract,
  ImportCostMethod,
  InvoiceLineExtract,
  LandedCostBreakdown,
} from '../../../shared/ghost';
import { acrylicLineFromExtract } from './sku';

const WEIGHT_FACTOR = 1.22 * 2.44 * 1.2;

export function sheetWeightKg(thicknessMm: number): number {
  return WEIGHT_FACTOR * Number(thicknessMm);
}

function acrylicProductCost(lines: InvoiceLineExtract[]): number {
  let total = 0;
  for (const ln of lines) {
    if (!ln.is_acrylic || ln.is_packing_or_misc || ln.line_kind !== 'acrylic') continue;
    if (ln.amount != null) total += Number(ln.amount);
    else total += Number(ln.quantity) * Number(ln.unit_price);
  }
  return total;
}

export function resolveImportPool(
  purchase: DocumentExtract,
  freight?: DocumentExtract | null,
  duty?: DocumentExtract | null,
): {
  method: ImportCostMethod;
  importPool: number;
  meta: {
    ddp_amount: number | null;
    freight_amount: number | null;
    duty_amount: number | null;
    invoice_total: number | null | undefined;
  };
} {
  let ddp = purchase.ddp_amount ?? null;
  if (ddp == null && purchase.includes_ddp && purchase.invoice_total != null) {
    ddp = Number(purchase.invoice_total) - acrylicProductCost(purchase.lines);
    if (ddp < 0) ddp = 0;
  }

  let freightAmt = purchase.freight_amount ?? null;
  if (freight) {
    let docFreight = freight.freight_amount;
    if (docFreight == null) docFreight = freight.invoice_total ?? null;
    if (docFreight != null) freightAmt = Number(docFreight);
  }
  let dutyAmt = purchase.duty_amount ?? null;
  if (duty) {
    let docDuty = duty.duty_amount;
    if (docDuty == null) docDuty = duty.invoice_total ?? null;
    if (docDuty != null) dutyAmt = Number(docDuty);
  }

  for (const ln of purchase.lines) {
    const lineAmt =
      ln.amount != null ? Number(ln.amount) : Number(ln.quantity) * Number(ln.unit_price);
    if (ln.line_kind === 'freight') freightAmt = (freightAmt ?? 0) + lineAmt;
    else if (ln.line_kind === 'duty') dutyAmt = (dutyAmt ?? 0) + lineAmt;
    else if (ln.line_kind === 'ddp' && ddp == null) ddp = lineAmt;
  }

  const hasDdp = ddp != null && Number(ddp) > 0;
  const hasFd = (freightAmt ?? 0) > 0 || (dutyAmt ?? 0) > 0;
  const meta = {
    ddp_amount: ddp != null ? Number(ddp) : null,
    freight_amount: freightAmt != null ? Number(freightAmt) : null,
    duty_amount: dutyAmt != null ? Number(dutyAmt) : null,
    invoice_total: purchase.invoice_total,
  };

  if (hasDdp && hasFd) {
    throw new Error(
      'import cost is ambiguous: purchase invoice has DDP and separate freight/duty were also provided — use one method only to avoid double-counting landed cost',
    );
  }
  if (hasDdp) return { method: 'ddp_on_invoice', importPool: Number(ddp), meta };
  if (hasFd) {
    return {
      method: 'freight_and_duty',
      importPool: Number(freightAmt ?? 0) + Number(dutyAmt ?? 0),
      meta,
    };
  }
  return { method: 'none', importPool: 0, meta };
}

export function allocateLandedCost(
  purchase: DocumentExtract,
  opts: {
    vendorId: string;
    vendorName?: string | null;
    freight?: DocumentExtract | null;
    duty?: DocumentExtract | null;
  },
): {
  lines: AcrylicSkuLine[];
  breakdown: LandedCostBreakdown;
  excluded: InvoiceLineExtract[];
} {
  let { method, importPool, meta } = resolveImportPool(purchase, opts.freight, opts.duty);

  const acrylicExtracts = purchase.lines.filter(
    (ln) =>
      ln.is_acrylic &&
      !ln.is_packing_or_misc &&
      ln.line_kind === 'acrylic' &&
      ln.thickness_mm != null &&
      ln.size,
  );
  const excluded = purchase.lines.filter((ln) => !acrylicExtracts.includes(ln));

  const productCost = acrylicProductCost(acrylicExtracts);
  if (method === 'ddp_on_invoice' && purchase.invoice_total != null) {
    const residual = Number(purchase.invoice_total) - productCost;
    if (residual >= 0) {
      importPool = residual;
      meta = { ...meta, ddp_amount: residual };
    }
  }

  const lines: AcrylicSkuLine[] = [];
  let totalWeight = 0;
  for (const ln of acrylicExtracts) {
    const skuLine = acrylicLineFromExtract(ln, opts.vendorId, opts.vendorName);
    const w = sheetWeightKg(skuLine.thickness_mm);
    skuLine.sheet_weight_kg = w;
    totalWeight += w * skuLine.quantity;
    lines.push(skuLine);
  }

  const perKg = totalWeight > 0 ? importPool / totalWeight : 0;
  for (const skuLine of lines) {
    const land = skuLine.sheet_weight_kg * perKg;
    skuLine.land_cost_per_sheet = land;
    skuLine.landed_unit_cost = skuLine.raw_unit_price + land;
    skuLine.amount = skuLine.quantity * skuLine.landed_unit_cost;
  }

  return {
    lines,
    breakdown: {
      method,
      import_pool: importPool,
      total_acrylic_product_cost: productCost,
      total_weight_kg: totalWeight,
      import_cost_per_kg: perKg,
      invoice_total: meta.invoice_total ?? null,
      ddp_amount: meta.ddp_amount,
      freight_amount: meta.freight_amount,
      duty_amount: meta.duty_amount,
    },
    excluded,
  };
}

export function reapplyLandedCost(
  lines: AcrylicSkuLine[],
  opts: {
    importPool: number;
    method?: ImportCostMethod;
    freightAmount?: number | null;
    dutyAmount?: number | null;
    invoiceTotal?: number | null;
    ddpAmount?: number | null;
  },
): { lines: AcrylicSkuLine[]; breakdown: LandedCostBreakdown } {
  const method = opts.method ?? 'freight_and_duty';
  const totalWeight = lines.reduce((sum, ln) => sum + ln.sheet_weight_kg * ln.quantity, 0);
  const productCost = lines.reduce((sum, ln) => sum + ln.raw_unit_price * ln.quantity, 0);
  const pool = Number(opts.importPool);
  const perKg = totalWeight > 0 ? pool / totalWeight : 0;
  const updated = lines.map((ln) => {
    const land = ln.sheet_weight_kg * perKg;
    const landed = ln.raw_unit_price + land;
    return {
      ...ln,
      land_cost_per_sheet: land,
      landed_unit_cost: landed,
      amount: ln.quantity * landed,
    };
  });
  return {
    lines: updated,
    breakdown: {
      method,
      import_pool: pool,
      total_acrylic_product_cost: productCost,
      total_weight_kg: totalWeight,
      import_cost_per_kg: perKg,
      invoice_total: opts.invoiceTotal ?? null,
      ddp_amount: opts.ddpAmount ?? null,
      freight_amount: opts.freightAmount ?? null,
      duty_amount: opts.dutyAmount ?? null,
    },
  };
}
