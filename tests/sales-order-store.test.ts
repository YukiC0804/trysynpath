import { beforeEach, describe, expect, it } from 'vitest';
import {
  __resetMemorySalesOrderStore,
  getSalesOrderRecord,
  upsertSalesOrderRecord,
} from '../api/_lib/ghost/salesOrderStore';
import type { SalesOrderRecord } from '../shared/ghost';

process.env.SALES_ORDER_MEMORY_STORE = '1';
process.env.VITEST = 'true';

function record(partial: Partial<SalesOrderRecord> = {}): SalesOrderRecord {
  return {
    customer_name: 'CN Ledge',
    invoice_number: '6866',
    date: '01/08/2026',
    currency: 'USD',
    lines: [
      { sku_id: 'GHOGOKACRCLR18mm4x8', description: 'desc', quantity: 36, sales_price: 220, amount: 7920 },
    ],
    ...partial,
  };
}

describe('Sales Order record store', () => {
  beforeEach(() => {
    __resetMemorySalesOrderStore();
  });

  it('upserts and reads back by invoice_number', async () => {
    await upsertSalesOrderRecord(record());
    const found = await getSalesOrderRecord('6866');
    expect(found?.customer_name).toBe('CN Ledge');
    expect(found?.lines).toHaveLength(1);
  });

  it('reprocessing the same invoice_number overwrites all lines, no history', async () => {
    await upsertSalesOrderRecord(
      record({
        lines: [
          { sku_id: 'A', description: 'a', quantity: 1, sales_price: 1, amount: 1 },
          { sku_id: 'B', description: 'b', quantity: 2, sales_price: 2, amount: 4 },
        ],
      }),
    );
    await upsertSalesOrderRecord(
      record({ lines: [{ sku_id: 'C', description: 'c', quantity: 3, sales_price: 3, amount: 9 }] }),
    );
    const found = await getSalesOrderRecord('6866');
    expect(found?.lines).toEqual([
      { sku_id: 'C', description: 'c', quantity: 3, sales_price: 3, amount: 9 },
    ]);
  });

  it('different invoice_numbers coexist independently', async () => {
    await upsertSalesOrderRecord(record({ invoice_number: '1001' }));
    await upsertSalesOrderRecord(record({ invoice_number: '1002', customer_name: 'GHOST' }));
    expect((await getSalesOrderRecord('1001'))?.customer_name).toBe('CN Ledge');
    expect((await getSalesOrderRecord('1002'))?.customer_name).toBe('GHOST');
  });
});
