import { afterEach, describe, expect, it, vi } from 'vitest';
import { createStockItem } from '../api/_lib/sage/client';

afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

describe('createStockItem sales price type', () => {
  it('includes product_sales_price_type_id when creating with a sales price', async () => {
    const fetchMock = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = String(input);
      if (url.includes('/product_sales_price_types')) {
        return new Response(
          JSON.stringify({
            $items: [
              { id: 'price-type-trade', displayed_as: 'Trade' },
              { id: 'price-type-sales', displayed_as: 'Sales Price' },
            ],
          }),
          { status: 200, headers: { 'Content-Type': 'application/json' } },
        );
      }
      if (url.includes('/stock_items') && init?.method === 'POST') {
        const body = JSON.parse(String(init.body));
        expect(body.stock_item.sales_prices).toEqual([
          {
            price_name: 'Sales Price',
            price: 39.45,
            price_includes_tax: false,
            product_sales_price_type_id: 'price-type-sales',
          },
        ]);
        return new Response(
          JSON.stringify({
            id: 'stock-1',
            item_code: 'ACR-WHT-3MM-48X96',
            description: 'White Acrylic',
            cost_price: 24.16,
            quantity_in_stock: 0,
            sales_ledger_account_id: 'sales-1',
            purchase_ledger_account_id: 'purchase-1',
          }),
          { status: 201, headers: { 'Content-Type': 'application/json' } },
        );
      }
      throw new Error(`Unexpected fetch ${url}`);
    });
    vi.stubGlobal('fetch', fetchMock);

    const created = await createStockItem('token', 'biz-1', {
      item_code: 'ACR-WHT-3MM-48X96',
      description: 'White Acrylic',
      cost_price: 24.16,
      sales_price: 39.45,
      sales_ledger_account_id: 'sales-1',
      purchase_ledger_account_id: 'purchase-1',
    });

    expect(created.sku).toBe('ACR-WHT-3MM-48X96');
    expect(fetchMock).toHaveBeenCalled();
  });

  it('omits sales_prices when sales_price is zero', async () => {
    const fetchMock = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = String(input);
      if (url.includes('/stock_items') && init?.method === 'POST') {
        const body = JSON.parse(String(init.body));
        expect(body.stock_item.sales_prices).toBeUndefined();
        return new Response(
          JSON.stringify({
            id: 'stock-2',
            item_code: 'ACR-CLR-4MM-48X96',
            description: 'Clear Acrylic',
            cost_price: 34.3,
            quantity_in_stock: 0,
            sales_ledger_account_id: 'sales-1',
            purchase_ledger_account_id: 'purchase-1',
          }),
          { status: 201, headers: { 'Content-Type': 'application/json' } },
        );
      }
      throw new Error(`Unexpected fetch ${url}`);
    });
    vi.stubGlobal('fetch', fetchMock);

    await createStockItem('token', 'biz-1', {
      item_code: 'ACR-CLR-4MM-48X96',
      description: 'Clear Acrylic',
      cost_price: 34.3,
      sales_price: 0,
      sales_ledger_account_id: 'sales-1',
      purchase_ledger_account_id: 'purchase-1',
    });
  });
});
