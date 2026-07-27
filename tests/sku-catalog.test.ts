import { beforeEach, describe, expect, it } from 'vitest';
import {
  __resetMemorySkuCatalog,
  findSkuCatalogByCustomerAndThickness,
  getSkuCatalogEntry,
  listSkuCatalog,
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

  it('reprocessing the same invoice_number overwrites all its lines, no history kept', async () => {
    await upsertSkuCatalogEntries([
      entry({ sku_id: 'A', quantity: 1, invoice_number: 'INV-1' }),
      entry({ sku_id: 'B', quantity: 2, invoice_number: 'INV-1' }),
    ]);
    await upsertSkuCatalogEntries([entry({ sku_id: 'C', quantity: 3, invoice_number: 'INV-1' })]);

    const all = await listSkuCatalog();
    expect(all.map((e) => e.sku_id)).toEqual(['C']);
    expect(await getSkuCatalogEntry('A')).toBeNull();
    expect(await getSkuCatalogEntry('B')).toBeNull();
    expect((await getSkuCatalogEntry('C'))?.quantity).toBe(3);
  });

  it('different invoice_numbers coexist; lookups prefer the most recent by date', async () => {
    await upsertSkuCatalogEntries([
      entry({ invoice_number: 'INV-OLD', date: '01/01/2026', landed_unit_cost: 100 }),
    ]);
    await upsertSkuCatalogEntries([
      entry({ invoice_number: 'INV-NEW', date: '02/01/2026', landed_unit_cost: 200 }),
    ]);

    const found = await getSkuCatalogEntry('GHOGOKACRCLR18mm4x8');
    expect(found?.invoice_number).toBe('INV-NEW');
    expect(found?.landed_unit_cost).toBe(200);

    const matches = await findSkuCatalogByCustomerAndThickness('CN LEDGE', 18);
    expect(matches.map((m) => m.invoice_number)).toEqual(['INV-NEW', 'INV-OLD']);
  });
});
