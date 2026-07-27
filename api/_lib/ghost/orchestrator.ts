import type { DocumentExtract, PurchaseWritePlan, SkuCatalogEntry } from '../../../shared/ghost';
import { allocateLandedCost } from './landedCost';
import { acrylicLinesNeedingDims, completeAcrylicLines } from './mapToExtract';

export function toMmDdYyyy(isoDate: string): string {
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(isoDate);
  return m ? `${m[2]}/${m[3]}/${m[1]}` : isoDate;
}

/** SKU catalog rows to persist for a finalized purchase write plan. */
export function buildSkuCatalogEntries(plan: PurchaseWritePlan): SkuCatalogEntry[] {
  const date = toMmDdYyyy(plan.invoice_date);
  return plan.lines.map((ln) => ({
    sku_id: ln.sku_id,
    description: ln.description,
    product_code: ln.product_code ?? null,
    color_code: ln.color_code ?? null,
    color_name: ln.color_name ?? null,
    thickness_mm: ln.thickness_mm,
    size: ln.size,
    vendor_id: plan.vendor.id,
    vendor_name: plan.vendor.name,
    vendor_company_name: plan.vendor.company_name ?? null,
    vendor_email: plan.vendor.email ?? null,
    vendor_address1: plan.vendor.address1 ?? null,
    vendor_address2: plan.vendor.address2 ?? null,
    vendor_city: plan.vendor.city ?? null,
    vendor_state: plan.vendor.state ?? null,
    vendor_zip: plan.vendor.zip ?? null,
    vendor_country: plan.vendor.country ?? null,
    quantity: ln.quantity,
    raw_unit_price: ln.raw_unit_price,
    sheet_weight_kg: ln.sheet_weight_kg,
    land_cost_per_sheet: ln.land_cost_per_sheet,
    landed_unit_cost: ln.landed_unit_cost,
    amount: ln.amount,
    raw_description: ln.raw_description ?? null,
    price_decimals: ln.price_decimals,
    freight_cost: plan.landed.freight_amount ?? null,
    duty_cost: plan.landed.duty_amount ?? null,
    ddp_cost: plan.landed.ddp_amount ?? null,
    customer_names: ln.customer_names,
    invoice_number: plan.invoice_number,
    date,
  }));
}

export class MissingAcrylicDimsError extends Error {
  readonly code = 'MISSING_ACRYLIC_DIMS';
  constructor(
    message: string,
    readonly incomplete: ReturnType<typeof acrylicLinesNeedingDims>,
    readonly completeCount: number,
  ) {
    super(message);
    this.name = 'MissingAcrylicDimsError';
  }
}

export function buildWritePlan(
  purchase: DocumentExtract,
  opts: {
    freight?: DocumentExtract | null;
    duty?: DocumentExtract | null;
    glAccountId?: string;
    poReferenceNumber?: string | null;
    receiveReferenceNumber?: string | null;
  } = {},
): PurchaseWritePlan {
  if (!purchase.vendor) throw new Error('purchase invoice extract is missing vendor');
  if (!purchase.invoice_number) {
    throw new Error('purchase invoice extract is missing invoice_number');
  }
  const invDate = purchase.invoice_date || new Date().toISOString().slice(0, 10);

  const incomplete = acrylicLinesNeedingDims(purchase);
  const complete = completeAcrylicLines(purchase);
  if (!complete.length) {
    const descs = purchase.lines
      .filter((ln) => ln.is_acrylic)
      .slice(0, 12)
      .map(
        (ln) =>
          `${JSON.stringify(ln.raw_description.slice(0, 80))} (thick=${ln.thickness_mm ?? 'missing'}, size=${ln.size ?? 'missing'})`,
      );
    throw new MissingAcrylicDimsError(
      'Acrylic lines were detected but thickness_mm and/or size are missing (Document AI often omits table columns). Fill thickness (mm) and size (e.g. 18x24) then continue. Got: ' +
        (descs.join('; ') || '(no acrylic rows)'),
      incomplete,
      complete.length,
    );
  }

  const { lines, breakdown, excluded } = allocateLandedCost(purchase, {
    vendorId: purchase.vendor.id,
    vendorName: purchase.vendor.name,
    freight: opts.freight,
    duty: opts.duty,
  });
  if (!lines.length) {
    throw new MissingAcrylicDimsError(
      'no allocatable acrylic lines after filtering — ensure each acrylic row has thickness_mm and size',
      incomplete,
      0,
    );
  }
  const inv = purchase.invoice_number.trim();
  return {
    vendor: purchase.vendor,
    invoice_number: inv,
    invoice_date: invDate,
    po_reference_number: opts.poReferenceNumber || `PO-${inv}`,
    receive_reference_number: opts.receiveReferenceNumber || inv,
    gl_account_id: opts.glAccountId || '1200',
    landed: breakdown,
    lines,
    packing_and_other_excluded: excluded,
    sageWrite: 'preview_only',
  };
}
