import { beforeEach, describe, expect, it } from 'vitest';
import {
  __resetMemorySkuCatalog,
  findSkuCatalogByCustomerAndThickness,
  getSkuCatalogEntry,
  upsertSkuCatalogEntries,
} from '../api/_lib/ghost/skuCatalog';
import type { SkuCatalogEntry } from '../shared/ghost';

process.env.SKU_CATALOG_MEMORY_STORE = '1';
process.env.VITEST = 'true';

function entry(partial: Partial<SkuCatalogEntry> = {}): SkuCatalogEntry {
  return {
    sku_id: 'GHOGOKACRCLR18mm4x8',
    description: "Ghost Gokai Acrylic 18mm x 4' x 8' Clear.",
    thickness_mm: 18,
    size: '4x8',
    vendor_id: 'GOK',
    vendor_name: 'Gokai',
    quantity: 112,
    raw_unit_price: 119.301,
    sheet_weight_kg: 64.29888,
    land_cost_per_sheet: 1.321,
    landed_unit_cost: 120.622,
    amount: 13509.664,
    price_decimals: 3,
    customer_names: ['CN LEDGE', 'TROPHY DEPOT'],
    invoice_number: 'GKGLB030126JN',
    date: '01/03/2026',
    ...partial,
  };
}

describe('SKU catalog', () => {
  beforeEach(() => {
    __resetMemorySkuCatalog();
  });

  it('upserts and reads back by sku_id', async () => {
    await upsertSkuCatalogEntries([entry()]);
    const found = await getSkuCatalogEntry('GHOGOKACRCLR18mm4x8');
    expect(found?.landed_unit_cost).toBe(120.622);
    expect(found?.customer_names).toEqual(['CN LEDGE', 'TROPHY DEPOT']);
  });

  it('finds by customer + thickness, case/whitespace insensitive', async () => {
    await upsertSkuCatalogEntries([entry()]);
    const byCn = await findSkuCatalogByCustomerAndThickness('cn  ledge', 18);
    expect(byCn).toHaveLength(1);
    expect(byCn[0]!.sku_id).toBe('GHOGOKACRCLR18mm4x8');

    const byTrophy = await findSkuCatalogByCustomerAndThickness('Trophy Depot', 18);
    expect(byTrophy).toHaveLength(1);

    const noMatch = await findSkuCatalogByCustomerAndThickness('GHOST', 18);
    expect(noMatch).toHaveLength(0);

    const wrongThickness = await findSkuCatalogByCustomerAndThickness('CN LEDGE', 30);
    expect(wrongThickness).toHaveLength(0);
  });

  it('reprocessing overwrites the old entry, no history kept', async () => {
    await upsertSkuCatalogEntries([entry({ quantity: 112, invoice_number: 'INV-1' })]);
    await upsertSkuCatalogEntries([
      entry({ quantity: 999, invoice_number: 'INV-2', landed_unit_cost: 200 }),
    ]);
    const found = await getSkuCatalogEntry('GHOGOKACRCLR18mm4x8');
    expect(found?.quantity).toBe(999);
    expect(found?.invoice_number).toBe('INV-2');
    expect(found?.landed_unit_cost).toBe(200);
  });
});
