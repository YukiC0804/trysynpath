import { afterEach, describe, expect, it, vi } from 'vitest';
import { updateStockItem } from '../api/_lib/sage/client';

afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

describe('updateStockItem sales price', () => {
  it('zeros existing sales_prices and fills missing product_sales_price_type_id', async () => {
    const fetchMock = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = String(input);
      if (url.includes('/product_sales_price_types')) {
        return new Response(
          JSON.stringify({
            $items: [{ id: 'price-type-sales', displayed_as: 'Sales Price' }],
          }),
          { status: 200, headers: { 'Content-Type': 'application/json' } },
        );
      }
      if (url.includes('/stock_items/stock-1') && (!init?.method || init.method === 'GET')) {
        return new Response(
          JSON.stringify({
            id: 'stock-1',
            item_code: 'ACR-WHT-3MM-48X96',
            cost_price: 24.16,
            sales_prices: [{ price_name: 'Sales Price', price: 39.45, price_includes_tax: false }],
          }),
          { status: 200, headers: { 'Content-Type': 'application/json' } },
        );
      }
      if (url.includes('/stock_items/stock-1') && init?.method === 'PUT') {
        const body = JSON.parse(String(init.body));
        expect(body.stock_item.cost_price).toBe(0);
        expect(body.stock_item.sales_prices).toEqual([
          {
            price_name: 'Sales Price',
            price: 0,
            price_includes_tax: false,
            product_sales_price_type_id: 'price-type-sales',
          },
        ]);
        return new Response(
          JSON.stringify({
            id: 'stock-1',
            item_code: 'ACR-WHT-3MM-48X96',
            cost_price: 0,
            sales_prices: body.stock_item.sales_prices,
          }),
          { status: 200, headers: { 'Content-Type': 'application/json' } },
        );
      }
      throw new Error(`Unexpected fetch ${url} ${init?.method ?? 'GET'}`);
    });
    vi.stubGlobal('fetch', fetchMock);

    const updated = await updateStockItem('token', 'biz-1', 'stock-1', {
      cost_price: 0,
      sales_price: 0,
    });

    expect(updated.costPrice).toBe(0);
    expect(updated.salesPrice).toBe(0);
  });
});
