import type {
  DocumentExtract,
  SalesOrderLine,
  SalesOrderPlan,
  SalesReviewReason,
} from '../../../shared/ghost';
import { parseThicknessSize } from './mapToExtract';
import { findSkuCatalogByCustomerAndThickness } from './skuCatalog';

/** Demo fixture catalog for Sales Order review rules not yet backed by real data. */
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

/**
 * Sales Order PDFs are customer invoices Ghost sends out — `vendor` on the
 * generic extract is the seller (Ghost itself), not the buyer. The buyer is
 * the second line under "Ship To" (first line is usually a contact name),
 * e.g. Ship To "Cesar Orozco / CN Ledge" → customer = "CN Ledge".
 */
function customerNameFromShipTo(doc: DocumentExtract): string {
  const shipTo = (doc.ship_to ?? []).map((l) => l.trim()).filter(Boolean);
  if (shipTo.length >= 2) return shipTo[1]!;
  if (shipTo.length === 1) return shipTo[0]!;
  return doc.vendor?.name?.trim() || 'Unknown Customer';
}

function fallbackSku(description: string): string {
  const cleaned = description.replace(/[^A-Za-z0-9]/g, '').slice(0, 18).toUpperCase() || 'UNKNOWN';
  return `GHO${cleaned}`;
}

export async function buildSalesOrderPlan(
  doc: DocumentExtract,
  opts: { recentKeys?: string[] } = {},
): Promise<SalesOrderPlan> {
  const customerName = customerNameFromShipTo(doc);
  const customer = resolveCustomer(customerName);

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

    const qty = Number(ln.quantity || 0);
    const rate = Number(ln.unit_price || 0);
    // Deposit / balance-due placeholder rows print with rate 0 — not real product lines.
    if (rate === 0) continue;
    const amount = ln.amount != null ? Number(ln.amount) : qty * rate;

    const { thickness } = parseThicknessSize(ln.raw_description);
    let sku: string | null = null;
    let description = ln.raw_description;
    let costBasis: number | null = null;
    if (thickness != null) {
      const matches = await findSkuCatalogByCustomerAndThickness(customerName, thickness);
      const match = matches[0];
      if (match) {
        sku = match.sku_id;
        description = match.description;
        costBasis = match.landed_unit_cost;
      }
    }
    if (!sku) {
      sku = fallbackSku(ln.raw_description);
      reasons.push('no_catalog_match');
    }

    if (!qty) reasons.push('missing_data');
    if (costBasis != null && costBasis > 0) {
      if (Math.abs(rate - costBasis) / costBasis > SALES_FIXTURE.unusualPricePct) {
        reasons.push('unusual_price');
      }
    } else {
      const listPrice = SALES_FIXTURE.priceList.default;
      if (listPrice > 0 && Math.abs(rate - listPrice) / listPrice > SALES_FIXTURE.unusualPricePct) {
        reasons.push('unusual_price');
      }
    }
    const onHand = SALES_FIXTURE.inventory.defaultOnHand;
    if (qty > onHand) reasons.push('stock_conflict');

    const dupKey = `${customer.id}|${doc.invoice_number || ''}|${sku}|${qty}`;
    if (opts.recentKeys?.includes(dupKey)) reasons.push('possible_duplicate');

    lines.push({
      sku,
      description,
      quantity: qty,
      unit_price: rate,
      amount,
      line_kind: ln.line_kind === 'acrylic' ? 'acrylic' : 'other',
      list_price: costBasis,
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
