import { beforeEach, describe, expect, it } from 'vitest';
import { computePnlSummary } from '../api/_lib/ghost/pnl';
import { __resetMemorySkuCatalog, upsertSkuCatalogEntries } from '../api/_lib/ghost/skuCatalog';
import {
  __resetMemorySalesOrderStore,
  upsertSalesOrderRecord,
} from '../api/_lib/ghost/salesOrderStore';
import type { SalesOrderRecord, SkuCatalogEntry } from '../shared/ghost';

process.env.SKU_CATALOG_MEMORY_STORE = '1';
process.env.SALES_ORDER_MEMORY_STORE = '1';
process.env.VITEST = 'true';

function catalogEntry(partial: Partial<SkuCatalogEntry> = {}): SkuCatalogEntry {
  return {
    sku_id: 'SKU1',
    description: 'Sheet 1',
    thickness_mm: 4,
    size: '4x8',
    vendor_id: 'GOK',
    vendor_name: 'Gokai',
    quantity: 100,
    raw_unit_price: 8,
    sheet_weight_kg: 17.5,
    land_cost_per_sheet: 2,
    landed_unit_cost: 10,
    amount: 1000,
    price_decimals: 3,
    customer_names: ['CN LEDGE'],
    invoice_number: 'INV-A',
    date: '01/01/2026',
    ...partial,
  };
}

function salesRecord(partial: Partial<SalesOrderRecord> = {}): SalesOrderRecord {
  return {
    customer_name: 'CN Ledge',
    invoice_number: 'SO-1',
    date: '01/05/2026',
    currency: 'USD',
    lines: [{ sku_id: 'SKU1', description: 'Sheet 1', quantity: 60, sales_price: 15, amount: 900 }],
    ...partial,
  };
}

describe('computePnlSummary', () => {
  beforeEach(() => {
    __resetMemorySkuCatalog();
    __resetMemorySalesOrderStore();
  });

  it('returns zeros/empty lists when there is no data', async () => {
    const pnl = await computePnlSummary();
    expect(pnl).toEqual({
      total_revenue: 0,
      total_land_cost: 0,
      total_cost: 0,
      sku_margins: [],
      top_customers: [],
    });
  });

  it('computes totals, weighted-average per-sku margin, and top customers', async () => {
    await upsertSkuCatalogEntries([
      catalogEntry({ invoice_number: 'INV-A', sku_id: 'SKU1', quantity: 100, landed_unit_cost: 10, land_cost_per_sheet: 2, amount: 1000 }),
      catalogEntry({ invoice_number: 'INV-B', sku_id: 'SKU1', quantity: 50, landed_unit_cost: 12, land_cost_per_sheet: 3, amount: 600 }),
      catalogEntry({ invoice_number: 'INV-C', sku_id: 'SKU2', quantity: 20, landed_unit_cost: 5, land_cost_per_sheet: 1, amount: 100, description: 'Sheet 2' }),
    ]);

    await upsertSalesOrderRecord(
      salesRecord({
        invoice_number: 'SO-1',
        customer_name: 'CN Ledge',
        lines: [{ sku_id: 'SKU1', description: 'Sheet 1', quantity: 60, sales_price: 15, amount: 900 }],
      }),
    );
    await upsertSalesOrderRecord(
      salesRecord({
        invoice_number: 'SO-2',
        customer_name: 'GHOST',
        lines: [
          { sku_id: 'SKU1', description: 'Sheet 1', quantity: 40, sales_price: 16, amount: 640 },
          { sku_id: 'SKU2', description: 'Sheet 2', quantity: 10, sales_price: 8, amount: 80 },
        ],
      }),
    );
    await upsertSalesOrderRecord(
      salesRecord({
        invoice_number: 'SO-3',
        customer_name: 'CN Ledge',
        // SKU3 was sold but never bought via Supply — no cost data, must be excluded from margins.
        lines: [{ sku_id: 'SKU3', description: 'Unknown sheet', quantity: 5, sales_price: 20, amount: 100 }],
      }),
    );

    const pnl = await computePnlSummary();

    expect(pnl.total_land_cost).toBe(100 * 2 + 50 * 3 + 20 * 1); // 370
    expect(pnl.total_cost).toBe(1000 + 600 + 100); // 1700
    expect(pnl.total_revenue).toBe(900 + 640 + 80 + 100); // 1720

    expect(pnl.top_customers).toEqual([
      { customer_name: 'CN Ledge', total_amount: 1000 }, // 900 + 100
      { customer_name: 'GHOST', total_amount: 720 }, // 640 + 80
    ]);

    expect(pnl.sku_margins).toHaveLength(2); // SKU3 excluded — no matching Supply cost data
    const sku1 = pnl.sku_margins.find((m) => m.sku_id === 'SKU1')!;
    expect(sku1.quantity_sold).toBe(100); // 60 + 40
    expect(sku1.weighted_sales_price).toBeCloseTo((60 * 15 + 40 * 16) / 100, 6); // 15.4
    expect(sku1.weighted_cost_price).toBeCloseTo((100 * 10 + 50 * 12) / 150, 6); // 10.6667
    expect(sku1.margin_per_unit).toBeCloseTo(15.4 - (1600 / 150), 6);

    const sku2 = pnl.sku_margins.find((m) => m.sku_id === 'SKU2')!;
    expect(sku2.quantity_sold).toBe(10);
    expect(sku2.weighted_sales_price).toBe(8);
    expect(sku2.weighted_cost_price).toBe(5);
    expect(sku2.margin_per_unit).toBe(3);
    expect(sku2.margin_pct).toBeCloseTo(37.5, 6);

    // Sorted by total margin contribution (margin_per_unit * quantity_sold) descending.
    expect(pnl.sku_margins[0]!.sku_id).toBe('SKU1');
  });
});
