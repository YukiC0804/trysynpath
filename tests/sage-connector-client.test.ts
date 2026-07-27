import { afterEach, describe, expect, it, vi } from 'vitest';
import type { AcrylicSkuLine, PurchaseWritePlan, SalesOrderPlan, VendorExtract } from '../shared/ghost';
import {
  createPurchaseOrder,
  createPurchaseReceive,
  createSalesOrder,
  findMissingSkuIds,
  pingSageConnector,
  resetSageSession,
  sageConnectorConfigured,
  toPurchaseOrderPayload,
  toReceivePayload,
  toSalesOrderPayload,
  upsertCustomer,
  upsertVendor,
  verifySageReachable,
} from '../api/_lib/sageConnector/client';

afterEach(() => {
  vi.unstubAllGlobals();
  delete process.env.SAGE_CONNECTOR_URL;
  delete process.env.SAGE_CONNECTOR_API_KEY;
});

const vendor: VendorExtract = {
  id: 'JMK',
  name: 'JM Kaplan Co',
  company_name: 'JM Kaplan Co',
  email: 'ap@jmkaplan.com',
  address1: '1 Main St',
  city: 'Newark',
  state: 'NJ',
  zip: '07102',
  country: 'US',
};

const line: AcrylicSkuLine = {
  sku_id: '3ACR18X24',
  description: 'Acrylic 3mm 18x24',
  thickness_mm: 3,
  size: '18x24',
  quantity: 10,
  raw_unit_price: 5,
  sheet_weight_kg: 1.2,
  land_cost_per_sheet: 0.5,
  landed_unit_cost: 5.5,
  amount: 55,
  price_decimals: 4,
  customer_names: ['CN Ledge'],
};

const purchasePlan: PurchaseWritePlan = {
  vendor,
  invoice_number: 'INV-100',
  invoice_date: '2026-07-21',
  po_reference_number: 'PO-INV-100',
  receive_reference_number: 'INV-100',
  gl_account_id: '1200',
  landed: {
    method: 'freight_and_duty',
    import_pool: 10,
    total_acrylic_product_cost: 50,
    total_weight_kg: 12,
    import_cost_per_kg: 0.83,
  },
  lines: [line],
  packing_and_other_excluded: [],
  sageWrite: 'preview_only',
};

const salesPlan: SalesOrderPlan = {
  customer: 'CN Ledge',
  po_number: 'CUSTPO-1',
  invoice_number: 'SO-500',
  invoice_date: '2026-07-21',
  currency: 'USD',
  lines: [
    { sku: '3ACR18X24', description: 'Acrylic 3mm 18x24', quantity: 5, unit_price: 25, amount: 125, line_kind: 'acrylic' },
    { sku: 'FREIGHT', description: 'Freight', quantity: 1, unit_price: 15, amount: 15, line_kind: 'freight' },
  ],
  totals: { subtotal: 125, freight: 15, total: 140 },
  needs_review: false,
  review_reasons: [],
  sageWrite: 'preview_only',
};

describe('sageConnectorConfigured / pingSageConnector', () => {
  it('is unconfigured without SAGE_CONNECTOR_URL', async () => {
    delete process.env.SAGE_CONNECTOR_URL;
    expect(sageConnectorConfigured()).toBe(false);
    const result = await pingSageConnector();
    expect(result).toEqual({ ok: false, detail: expect.stringContaining('SAGE_CONNECTOR_URL not set') });
  });

  it('pings /health when configured', async () => {
    process.env.SAGE_CONNECTOR_URL = 'http://127.0.0.1:8080';
    const fetchMock = vi.fn(async () => new Response('{}', { status: 200 }));
    vi.stubGlobal('fetch', fetchMock);
    const result = await pingSageConnector();
    expect(result.ok).toBe(true);
    expect(fetchMock).toHaveBeenCalledWith(
      'http://127.0.0.1:8080/health',
      expect.objectContaining({ headers: expect.any(Object) }),
    );
  });
});

describe('resetSageSession', () => {
  it('POSTs to /session/reset', async () => {
    process.env.SAGE_CONNECTOR_URL = 'http://127.0.0.1:8080';
    const fetchMock = vi.fn(async () => new Response('{}', { status: 200 }));
    vi.stubGlobal('fetch', fetchMock);
    await resetSageSession();
    expect(fetchMock).toHaveBeenCalledWith(
      'http://127.0.0.1:8080/session/reset',
      expect.objectContaining({ method: 'POST' }),
    );
  });
});

describe('verifySageReachable', () => {
  it('proves reachability with a real Sage-backed call, not just /health', async () => {
    process.env.SAGE_CONNECTOR_URL = 'http://127.0.0.1:8080';
    const fetchMock = vi.fn(async () => new Response('[]', { status: 200 }));
    vi.stubGlobal('fetch', fetchMock);
    const result = await verifySageReachable();
    expect(result.ok).toBe(true);
    expect(fetchMock).toHaveBeenCalledWith(
      'http://127.0.0.1:8080/customers',
      expect.objectContaining({ headers: expect.any(Object) }),
    );
  });

  it('reports not ok when the Sage-backed call fails even if the process is alive', async () => {
    process.env.SAGE_CONNECTOR_URL = 'http://127.0.0.1:8080';
    const fetchMock = vi.fn(async () => new Response('session stuck', { status: 500 }));
    vi.stubGlobal('fetch', fetchMock);
    const result = await verifySageReachable();
    expect(result.ok).toBe(false);
    expect(result.detail).toContain('500');
  });
});

describe('purchase order / receive payload builders', () => {
  it('toPurchaseOrderPayload matches sage_client.py _po_payload shape', () => {
    const payload = toPurchaseOrderPayload(purchasePlan);
    expect(payload).toEqual({
      type: 'purchase_order',
      vendor_id: 'JMK',
      vendor: {
        id: 'JMK',
        name: 'JM Kaplan Co',
        company_name: 'JM Kaplan Co',
        email: 'ap@jmkaplan.com',
        address: {
          address1: '1 Main St',
          address2: null,
          city: 'Newark',
          state: 'NJ',
          zip: '07102',
          country: 'US',
        },
      },
      reference_number: 'PO-INV-100',
      date: '2026-07-21T00:00:00',
      gl_account_id: '1200',
      lines: [
        {
          description: 'Acrylic 3mm 18x24',
          quantity: 10,
          unit_price: 5.5,
          amount: 55,
          item_id: '3ACR18X24',
          gl_account_id: '1200',
        },
      ],
    });
  });

  it('toReceivePayload matches sage_client.py _receive_payload shape', () => {
    const payload = toReceivePayload(purchasePlan);
    expect(payload).toEqual({
      vendor_id: 'JMK',
      reference_number: 'INV-100',
      purchase_order_reference: 'PO-INV-100',
      date: '2026-07-21T00:00:00',
      gl_account_id: '1200',
      lines: [
        {
          description: 'Acrylic 3mm 18x24',
          quantity: 10,
          unit_price: 5.5,
          amount: 55,
          item_id: '3ACR18X24',
          gl_account_id: '1200',
        },
      ],
    });
  });

  it('createPurchaseOrder / createPurchaseReceive POST to the right paths with X-API-Key', async () => {
    process.env.SAGE_CONNECTOR_URL = 'http://127.0.0.1:8080';
    process.env.SAGE_CONNECTOR_API_KEY = 'secret';
    const fetchMock = vi.fn(async (url: string) => {
      if (url.endsWith('/orders')) return new Response(JSON.stringify({ reference_number: 'PO-INV-100' }), { status: 201 });
      if (url.endsWith('/purchases/receive')) return new Response(JSON.stringify({ reference_number: 'INV-100' }), { status: 201 });
      throw new Error(`unexpected url ${url}`);
    });
    vi.stubGlobal('fetch', fetchMock);

    const po = await createPurchaseOrder(purchasePlan);
    const receive = await createPurchaseReceive(purchasePlan);

    expect(po.reference_number).toBe('PO-INV-100');
    expect(receive.reference_number).toBe('INV-100');
    for (const call of fetchMock.mock.calls) {
      const init = call[1] as RequestInit;
      expect((init.headers as Record<string, string>)['X-API-Key']).toBe('secret');
      expect(init.method).toBe('POST');
    }
  });
});

describe('sales order payload builder', () => {
  it('toSalesOrderPayload only sets item_id on acrylic lines', () => {
    const payload = toSalesOrderPayload(salesPlan, 'CNLEDGE', 'SO-SO-500');
    expect(payload).toEqual({
      type: 'sales_order',
      customer_id: 'CNLEDGE',
      reference_number: 'SO-SO-500',
      date: '2026-07-21T00:00:00',
      customer_po_number: 'CUSTPO-1',
      lines: [
        { description: 'Acrylic 3mm 18x24', quantity: 5, unit_price: 25, amount: 125, item_id: '3ACR18X24' },
        { description: 'Freight', quantity: 1, unit_price: 15, amount: 15, item_id: null },
      ],
    });
  });

  it('createSalesOrder POSTs to /orders', async () => {
    process.env.SAGE_CONNECTOR_URL = 'http://127.0.0.1:8080';
    const fetchMock = vi.fn(async () => new Response(JSON.stringify({ reference_number: 'SO-SO-500' }), { status: 201 }));
    vi.stubGlobal('fetch', fetchMock);
    const result = await createSalesOrder(salesPlan, 'CNLEDGE', 'SO-SO-500');
    expect(result.reference_number).toBe('SO-SO-500');
    expect(fetchMock).toHaveBeenCalledWith('http://127.0.0.1:8080/orders', expect.objectContaining({ method: 'POST' }));
  });
});

describe('upsertVendor / upsertCustomer', () => {
  it('upsertVendor POSTs the party payload to /vendors', async () => {
    process.env.SAGE_CONNECTOR_URL = 'http://127.0.0.1:8080';
    const fetchMock = vi.fn(async () => new Response('{}', { status: 200 }));
    vi.stubGlobal('fetch', fetchMock);
    await upsertVendor(vendor);
    expect(fetchMock).toHaveBeenCalledWith('http://127.0.0.1:8080/vendors', expect.objectContaining({ method: 'POST' }));
    const body = JSON.parse(((fetchMock.mock.calls[0][1] as RequestInit).body as string));
    expect(body.id).toBe('JMK');
  });

  it('upsertCustomer POSTs id+name to /customers', async () => {
    process.env.SAGE_CONNECTOR_URL = 'http://127.0.0.1:8080';
    const fetchMock = vi.fn(async () => new Response('{}', { status: 200 }));
    vi.stubGlobal('fetch', fetchMock);
    await upsertCustomer('CNLEDGE', 'CN Ledge');
    const body = JSON.parse(((fetchMock.mock.calls[0][1] as RequestInit).body as string));
    expect(body).toEqual({
      id: 'CNLEDGE',
      name: 'CN Ledge',
      company_name: 'CN Ledge',
      email: null,
      address: { address1: null, address2: null, city: null, state: null, zip: null, country: null },
    });
  });
});

describe('findMissingSkuIds', () => {
  it('returns sku ids not present in GET /inventory-items', async () => {
    process.env.SAGE_CONNECTOR_URL = 'http://127.0.0.1:8080';
    const fetchMock = vi.fn(async () =>
      new Response(JSON.stringify([{ id: '3ACR18X24' }, { id: 'OTHERSKU' }]), { status: 200 }),
    );
    vi.stubGlobal('fetch', fetchMock);
    const missing = await findMissingSkuIds(['3ACR18X24', 'NEWSKU', 'NEWSKU']);
    expect(missing).toEqual(['NEWSKU']);
  });

  it('short-circuits to [] without a network call for an empty input', async () => {
    process.env.SAGE_CONNECTOR_URL = 'http://127.0.0.1:8080';
    const fetchMock = vi.fn();
    vi.stubGlobal('fetch', fetchMock);
    expect(await findMissingSkuIds([])).toEqual([]);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('throws with a clear error on a non-2xx response', async () => {
    process.env.SAGE_CONNECTOR_URL = 'http://127.0.0.1:8080';
    const fetchMock = vi.fn(async () => new Response('unauthorized', { status: 401 }));
    vi.stubGlobal('fetch', fetchMock);
    await expect(findMissingSkuIds(['X'])).rejects.toThrow(/HTTP 401/);
  });
});
