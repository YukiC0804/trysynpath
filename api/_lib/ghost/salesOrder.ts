import type {
  DocumentExtract,
  SalesOrderLine,
  SalesOrderPlan,
  SalesOrderRecord,
  SalesReviewReason,
} from '../../../shared/ghost';
import { parseThicknessSize } from './mapToExtract';
import { toMmDdYyyy } from './orchestrator';
import { findSkuCatalogByCustomerAndThickness, normalizeCustomerName } from './skuCatalog';

/** Flag a sold price as unusual once it strays this far from the catalog's landed cost. */
const UNUSUAL_PRICE_PCT = 0.25;

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
    // Only compare against a real cost basis from the catalog — no fixture price-list fallback.
    if (costBasis != null && costBasis > 0) {
      if (Math.abs(rate - costBasis) / costBasis > UNUSUAL_PRICE_PCT) {
        reasons.push('unusual_price');
      }
    }

    const dupKey = `${normalizeCustomerName(customerName)}|${doc.invoice_number || ''}|${sku}|${qty}`;
    if (opts.recentKeys?.includes(dupKey)) reasons.push('possible_duplicate');

    lines.push({
      sku,
      description,
      quantity: qty,
      unit_price: rate,
      amount,
      line_kind: ln.line_kind === 'acrylic' ? 'acrylic' : 'other',
    });
  }

  const productLines = lines.filter((l) => l.line_kind !== 'freight');
  const subtotal = productLines.reduce((s, l) => s + l.amount, 0);
  const uniqueReasons = [...new Set(reasons)];

  return {
    customer: customerName,
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

/** SalesOrderRecord to persist for a processed Sales Order plan (skipped when there's no invoice_number). */
export function buildSalesOrderRecord(plan: SalesOrderPlan): SalesOrderRecord | null {
  if (!plan.invoice_number) return null;
  return {
    customer_name: plan.customer,
    invoice_number: plan.invoice_number,
    date: plan.invoice_date ? toMmDdYyyy(plan.invoice_date) : '',
    currency: plan.currency,
    lines: plan.lines
      .filter((l) => l.line_kind !== 'freight')
      .map((l) => ({
        sku_id: l.sku,
        description: l.description,
        quantity: l.quantity,
        sales_price: l.unit_price,
        amount: l.amount,
      })),
  };
}
