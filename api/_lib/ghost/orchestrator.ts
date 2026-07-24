import type { DocumentExtract, PurchaseWritePlan } from '../../../shared/ghost';
import { allocateLandedCost } from './landedCost';
import { acrylicLinesNeedingDims, completeAcrylicLines } from './mapToExtract';

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
