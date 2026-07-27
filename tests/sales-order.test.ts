import { beforeEach, describe, expect, it } from 'vitest';
import { buildSalesOrderPlan } from '../api/_lib/ghost/salesOrder';
import { __resetMemorySkuCatalog, upsertSkuCatalogEntries } from '../api/_lib/ghost/skuCatalog';
import type { DocumentExtract, SkuCatalogEntry } from '../shared/ghost';

process.env.SKU_CATALOG_MEMORY_STORE = '1';
process.env.VITEST = 'true';

function catalogEntry(partial: Partial<SkuCatalogEntry> = {}): SkuCatalogEntry {
  return {
    sku_id: 'GHOGOKACRCLR18mm4x8',
    description: "Ghost Gokai Acrylic 18mm x 4' x 8' Clear.",
    thickness_mm: 18,
    size: '4x8',
    vendor_id: 'GOK',
    vendor_name: 'Gokai',
    quantity: 72,
    raw_unit_price: 118.53,
    sheet_weight_kg: 64.29888,
    land_cost_per_sheet: 1.5,
    landed_unit_cost: 220,
    amount: 15980.4,
    price_decimals: 3,
    customer_names: ['CN LEDGE'],
    invoice_number: 'GKGLB030126JN',
    date: '01/03/2026',
    ...partial,
  };
}

/** Mirrors Invoice 6866 from Ghost Boards, Inc. (Ship To: Cesar Orozco / CN Ledge). */
function invoice6866(): DocumentExtract {
  return {
    document_role: 'purchase_invoice',
    vendor: { id: 'GHO', name: 'Ghost Boards, Inc.' },
    invoice_number: '6866',
    invoice_date: '2026-01-08',
    currency: 'USD',
    invoice_total: 15420,
    includes_ddp: false,
    ship_to: ['Cesar Orozco', 'CN Ledge'],
    lines: [
      {
        raw_description: 'Acrylic 50% Deposit Due now',
        is_acrylic: false,
        is_packing_or_misc: false,
        quantity: 1,
        unit_price: 0,
        amount: 0,
        line_kind: 'other',
      },
      {
        raw_description: 'Acrylic Remaining Balance- Due On Arrival',
        is_acrylic: false,
        is_packing_or_misc: false,
        quantity: 1,
        unit_price: 0,
        amount: 0,
        line_kind: 'other',
      },
      {
        raw_description: 'Acrylic 18 MM Paper',
        is_acrylic: true,
        is_packing_or_misc: false,
        quantity: 36,
        unit_price: 220,
        amount: 7920,
        line_kind: 'acrylic',
      },
      {
        raw_description: 'Acrylic 30 MM Paper',
        is_acrylic: true,
        is_packing_or_misc: false,
        quantity: 10,
        unit_price: 420,
        amount: 4200,
        line_kind: 'acrylic',
      },
    ],
    notes: null,
  };
}

describe('Sales Order plan', () => {
  beforeEach(() => {
    __resetMemorySkuCatalog();
  });

  it('resolves customer from Ship To second line, not vendor', async () => {
    const plan = await buildSalesOrderPlan(invoice6866());
    expect(plan.customer).toBe('CN Ledge');
  });

  it('drops rate=0 deposit/balance placeholder rows', async () => {
    const plan = await buildSalesOrderPlan(invoice6866());
    expect(plan.lines).toHaveLength(2);
    expect(plan.lines.every((l) => l.unit_price > 0)).toBe(true);
  });

  it('reads rate/amount as printed, no amount/qty override', async () => {
    const plan = await buildSalesOrderPlan(invoice6866());
    const line18mm = plan.lines.find((l) => l.quantity === 36)!;
    expect(line18mm.unit_price).toBe(220);
    expect(line18mm.amount).toBe(7920);
  });

  it('matches SKU from catalog by (customer, thickness) when available', async () => {
    await upsertSkuCatalogEntries([
      catalogEntry(),
      catalogEntry({
        sku_id: 'GHOGOKACRCLR30mm4x8',
        thickness_mm: 30,
        description: "Ghost Gokai Acrylic 30mm x 4' x 8' Clear.",
      }),
    ]);
    const plan = await buildSalesOrderPlan(invoice6866());
    const line18mm = plan.lines.find((l) => l.quantity === 36)!;
    expect(line18mm.sku).toBe('GHOGOKACRCLR18mm4x8');
    expect(line18mm.description).toBe("Ghost Gokai Acrylic 18mm x 4' x 8' Clear.");
    expect(plan.review_reasons).not.toContain('no_catalog_match');
  });

  it('flags no_catalog_match when no catalog entry fits the customer + thickness', async () => {
    const plan = await buildSalesOrderPlan(invoice6866());
    expect(plan.review_reasons).toContain('no_catalog_match');
  });
});
