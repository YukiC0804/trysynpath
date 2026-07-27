import type {
  AcrylicSkuLine,
  DocumentExtract,
  ImportCostMethod,
  InvoiceLineExtract,
  LandedCostBreakdown,
} from '../../../shared/ghost';
import { acrylicLineFromExtract, roundTo } from './sku';

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

/**
 * Same sku_id can come from multiple source lines within one processing pass
 * (different customers/pallets ordering the identical spec at different
 * prices). Merge them into a single catalog-ready line: quantities sum, unit
 * price / land cost per sheet are quantity-weighted averages, customer_names
 * is the union of every contributing customer.
 */
function mergeBySkuId(lines: AcrylicSkuLine[]): AcrylicSkuLine[] {
  const groups = new Map<string, AcrylicSkuLine[]>();
  for (const ln of lines) {
    const group = groups.get(ln.sku_id);
    if (group) group.push(ln);
    else groups.set(ln.sku_id, [ln]);
  }
  const merged: AcrylicSkuLine[] = [];
  for (const group of groups.values()) {
    const first = group[0]!;
    if (group.length === 1) {
      merged.push(first);
      continue;
    }
    const decimals = first.price_decimals;
    const totalQty = group.reduce((sum, ln) => sum + ln.quantity, 0);
    const weightedRawUnit =
      totalQty > 0
        ? group.reduce((sum, ln) => sum + ln.quantity * ln.raw_unit_price, 0) / totalQty
        : first.raw_unit_price;
    const weightedLand =
      totalQty > 0
        ? group.reduce((sum, ln) => sum + ln.quantity * ln.land_cost_per_sheet, 0) / totalQty
        : first.land_cost_per_sheet;
    const rawUnit = roundTo(weightedRawUnit, decimals);
    const land = roundTo(weightedLand, decimals);
    const landedUnit = roundTo(rawUnit + land, decimals);
    const customerNames = [...new Set(group.flatMap((ln) => ln.customer_names))];
    merged.push({
      ...first,
      quantity: totalQty,
      raw_unit_price: rawUnit,
      land_cost_per_sheet: land,
      landed_unit_cost: landedUnit,
      amount: totalQty * landedUnit,
      customer_names: customerNames,
    });
  }
  return merged;
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

  // Export pallet / packing line amounts are never used as a cost pool —
  // landed cost is freight + duty (or DDP) only.
  const { method, importPool, meta } = resolveImportPool(purchase, opts.freight, opts.duty);

  const rawLines = acrylicExtracts.map((ln) =>
    acrylicLineFromExtract(ln, opts.vendorId, opts.vendorName),
  );
  let totalWeight = 0;
  for (const skuLine of rawLines) {
    skuLine.sheet_weight_kg = sheetWeightKg(skuLine.thickness_mm);
    totalWeight += skuLine.sheet_weight_kg * skuLine.quantity;
  }
  const perKg = totalWeight > 0 ? importPool / totalWeight : 0;
  for (const skuLine of rawLines) {
    const land = roundTo(skuLine.sheet_weight_kg * perKg, skuLine.price_decimals);
    skuLine.land_cost_per_sheet = land;
    skuLine.landed_unit_cost = roundTo(skuLine.raw_unit_price + land, skuLine.price_decimals);
    skuLine.amount = skuLine.quantity * skuLine.landed_unit_cost;
  }

  // Same sku_id can still appear more than once (different customers ordering
  // the identical spec within one invoice) — merge into one catalog-ready row.
  const lines = mergeBySkuId(rawLines);

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
    const decimals = ln.price_decimals != null && ln.price_decimals >= 0 ? ln.price_decimals : 3;
    const land = roundTo(ln.sheet_weight_kg * perKg, decimals);
    const landed = roundTo(ln.raw_unit_price + land, decimals);
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
