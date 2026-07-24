import type { DocumentExtract, PurchaseWritePlan } from '../../../shared/ghost';
import { allocateLandedCost } from './landedCost';

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
  const { lines, breakdown, excluded } = allocateLandedCost(purchase, {
    vendorId: purchase.vendor.id,
    vendorName: purchase.vendor.name,
    freight: opts.freight,
    duty: opts.duty,
  });
  if (!lines.length) {
    const descs = purchase.lines
      .slice(0, 12)
      .map((ln) => `${JSON.stringify(ln.raw_description)} (kind=${ln.line_kind}, acrylic=${ln.is_acrylic})`);
    throw new Error(
      'no acrylic lines found on the purchase invoice — got: ' +
        (descs.join('; ') || '(Document AI returned zero lines)'),
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
