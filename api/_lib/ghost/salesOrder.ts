import type {
  DocumentExtract,
  SalesOrderLine,
  SalesOrderPlan,
  SalesReviewReason,
} from '../../../shared/ghost';
import { buildSkuId, normalizeSheetSize } from './sku';

/** Demo fixture catalog for Sales Order review rules. */
export const SALES_FIXTURE = {
  customers: [
    { id: 'CUST-SPAN', name: 'Spandex', aliases: ['spandex', 'ghost acrylics customer'] },
    { id: 'CUST-ACME', name: 'Acme Interiors', aliases: ['acme'] },
  ],
  priceList: {
    default: 85,
    bySkuPrefix: { GHO: 72 },
  },
  inventory: {
    defaultOnHand: 40,
  },
  unusualPricePct: 0.25,
};

function resolveCustomer(name: string | null | undefined): { id: string; name: string } {
  const raw = (name || 'Unknown Customer').trim();
  const lower = raw.toLowerCase();
  const hit = SALES_FIXTURE.customers.find(
    (c) => c.name.toLowerCase() === lower || c.aliases.some((a) => lower.includes(a)),
  );
  return hit ? { id: hit.id, name: hit.name } : { id: 'CUST-NEW', name: raw };
}

function guessSku(description: string, thickness?: number | null, size?: string | null): string {
  if (thickness != null && size) {
    try {
      return buildSkuId({
        vendorId: 'GOK',
        productCode: 'ACR',
        colorCode: /black/i.test(description) ? 'BLK' : 'CLR',
        thicknessMm: thickness,
        size: normalizeSheetSize(size),
      });
    } catch {
      /* fall through */
    }
  }
  const cleaned = description.replace(/[^A-Za-z0-9]/g, '').slice(0, 18).toUpperCase() || 'UNKNOWN';
  return `GHO${cleaned}`;
}

export function buildSalesOrderPlan(
  doc: DocumentExtract,
  opts: { recentKeys?: string[] } = {},
): SalesOrderPlan {
  const customerName =
    doc.vendor?.name ||
    (doc.notes?.match(/customer[=:]\s*([^|;]+)/i)?.[1] ?? null) ||
    'Unknown Customer';
  // For sales docs, receiver/supplier naming varies — prefer explicit vendor then invoice notes.
  const customer = resolveCustomer(
    /spandex|acme|customer/i.test(customerName) ? customerName : doc.vendor?.name || customerName,
  );

  const lines: SalesOrderLine[] = [];
  const reasons: SalesReviewReason[] = [];
  let freight = 0;

  for (const ln of doc.lines) {
    if (ln.line_kind === 'freight') {
      const amt = ln.amount != null ? Number(ln.amount) : Number(ln.quantity) * Number(ln.unit_price);
      freight += amt;
      lines.push({
        sku: 'FREIGHT',
        description: ln.raw_description,
        quantity: ln.quantity || 1,
        unit_price: ln.unit_price || amt,
        amount: amt,
        line_kind: 'freight',
      });
      continue;
    }
    if (ln.line_kind === 'packing' || ln.line_kind === 'ddp' || ln.line_kind === 'duty') continue;

    const sku = guessSku(ln.raw_description, ln.thickness_mm, ln.size);
    const qty = Number(ln.quantity || 0);
    const unit =
      ln.amount != null && qty > 0 ? Number(ln.amount) / qty : Number(ln.unit_price || 0);
    const amount = qty * unit;
    const listPrice = SALES_FIXTURE.priceList.default;
    const onHand = SALES_FIXTURE.inventory.defaultOnHand;

    if (!qty || !sku || sku.endsWith('UNKNOWN')) reasons.push('missing_data');
    if (listPrice > 0 && Math.abs(unit - listPrice) / listPrice > SALES_FIXTURE.unusualPricePct) {
      reasons.push('unusual_price');
    }
    if (qty > onHand) reasons.push('stock_conflict');

    const dupKey = `${customer.id}|${doc.invoice_number || ''}|${sku}|${qty}`;
    if (opts.recentKeys?.includes(dupKey)) reasons.push('possible_duplicate');

    lines.push({
      sku,
      description: ln.raw_description,
      quantity: qty,
      unit_price: unit,
      amount,
      line_kind: ln.line_kind === 'acrylic' ? 'acrylic' : 'other',
      list_price: listPrice,
      on_hand: onHand,
    });
  }

  const productLines = lines.filter((l) => l.line_kind !== 'freight');
  const subtotal = productLines.reduce((s, l) => s + l.amount, 0);
  const uniqueReasons = [...new Set(reasons)];

  return {
    customer: customer.name,
    customer_id: customer.id,
    po_number: doc.invoice_number,
    invoice_number: doc.invoice_number,
    invoice_date: doc.invoice_date,
    currency: doc.currency || 'USD',
    lines,
    totals: { subtotal, freight, total: subtotal + freight },
    needs_review: uniqueReasons.length > 0,
    review_reasons: uniqueReasons,
    sageWrite: 'preview_only',
  };
}
