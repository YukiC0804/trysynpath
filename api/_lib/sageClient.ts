import { getEnv } from './http';
import type { SageBusiness, SageStockItem } from './types';

export class SageApiError extends Error {
  status: number;
  constructor(message: string, status: number) {
    super(message);
    this.status = status;
  }
}

async function sageFetch(
  path: string,
  accessToken: string,
  options: { method?: string; businessId?: string; body?: unknown; query?: Record<string, string> } = {},
) {
  const base = (getEnv('SAGE_API_BASE_URL') ?? 'https://api.accounting.sage.com/v3.1').replace(/\/$/, '');
  const url = new URL(`${base}${path.startsWith('/') ? path : `/${path}`}`);
  if (options.query) {
    for (const [k, v] of Object.entries(options.query)) {
      url.searchParams.set(k, v);
    }
  }

  const headers: Record<string, string> = {
    Authorization: `Bearer ${accessToken}`,
    Accept: 'application/json',
  };
  if (options.businessId) {
    headers['X-Business'] = options.businessId;
  }
  if (options.body !== undefined) {
    headers['Content-Type'] = 'application/json';
  }

  const response = await fetch(url.toString(), {
    method: options.method ?? 'GET',
    headers,
    body: options.body !== undefined ? JSON.stringify(options.body) : undefined,
  });

  if (!response.ok) {
    let detail = '';
    try {
      detail = await response.text();
    } catch {
      detail = '';
    }
    // Never include tokens; truncate response detail.
    throw new SageApiError(
      `Sage API ${options.method ?? 'GET'} ${path} failed (${response.status})${detail ? `: ${detail.slice(0, 240)}` : ''}`,
      response.status,
    );
  }

  if (response.status === 204) return null;
  return response.json();
}

function salesPriceFromItem(item: SageStockItem): number {
  if (item.sales_price != null) return Number(item.sales_price);
  const first = item.sales_prices?.[0]?.price;
  return first != null ? Number(first) : 0;
}

export function normalizeStockItem(item: SageStockItem) {
  return {
    id: item.id,
    sku: item.item_code ?? '',
    description: item.description ?? '',
    costPrice: Number(item.cost_price ?? 0),
    salesPrice: salesPriceFromItem(item),
    quantityInStock: Number(item.quantity_in_stock ?? 0),
    reorderLevel: Number(item.reorder_level ?? 0),
    reorderQuantity: Number(item.reorder_quantity ?? 0),
    supplier: item.usual_supplier?.displayed_as ?? '',
    supplierId: item.usual_supplier?.id ?? '',
    supplierPartNumber: item.supplier_part_number ?? '',
    active: item.active !== false,
    raw: item,
  };
}

export async function listBusinesses(accessToken: string): Promise<SageBusiness[]> {
  const data = (await sageFetch('/businesses', accessToken)) as { $items?: SageBusiness[] } | SageBusiness[];
  if (Array.isArray(data)) return data;
  return data.$items ?? [];
}

export function pickAccountingBusiness(businesses: SageBusiness[]): SageBusiness | undefined {
  return (
    businesses.find((b) => {
      const type = typeof b.business_type === 'string' ? b.business_type : b.business_type?.id;
      return String(type ?? '').toLowerCase().includes('sbc_accounting') || String(type ?? '').toLowerCase() === 'accounting';
    }) ??
    businesses.find((b) => String(b.subscription ?? b.product ?? '').toLowerCase().includes('accounting')) ??
    businesses[0]
  );
}

export async function listStockItems(accessToken: string, businessId: string): Promise<ReturnType<typeof normalizeStockItem>[]> {
  const data = (await sageFetch('/stock_items', accessToken, {
    businessId,
    query: { items_per_page: '200', attributes: 'all' },
  })) as { $items?: SageStockItem[] };
  return (data.$items ?? []).map(normalizeStockItem);
}

export async function getStockItem(accessToken: string, businessId: string, id: string) {
  const data = (await sageFetch(`/stock_items/${id}`, accessToken, {
    businessId,
    query: { attributes: 'all' },
  })) as SageStockItem;
  return normalizeStockItem(data);
}

export async function findStockItemBySku(accessToken: string, businessId: string, sku: string) {
  const items = await listStockItems(accessToken, businessId);
  return items.find((item) => item.sku.toLowerCase() === sku.toLowerCase()) ?? null;
}

export async function createStockItem(
  accessToken: string,
  businessId: string,
  payload: {
    item_code: string;
    description: string;
    cost_price: number;
    sales_price?: number;
    reorder_level?: number;
    reorder_quantity?: number;
    supplier_part_number?: string;
    usual_supplier_id?: string;
  },
) {
  const body = {
    stock_item: {
      item_code: payload.item_code,
      description: payload.description,
      cost_price: payload.cost_price,
      sales_price: payload.sales_price ?? 0,
      reorder_level: payload.reorder_level ?? 0,
      reorder_quantity: payload.reorder_quantity ?? 0,
      supplier_part_number: payload.supplier_part_number ?? '',
      ...(payload.usual_supplier_id
        ? { usual_supplier: { id: payload.usual_supplier_id } }
        : {}),
    },
  };
  const created = (await sageFetch('/stock_items', accessToken, {
    method: 'POST',
    businessId,
    body,
  })) as SageStockItem;
  return normalizeStockItem(created);
}

export async function updateStockItem(
  accessToken: string,
  businessId: string,
  id: string,
  updates: Partial<{
    description: string;
    cost_price: number;
    sales_price: number;
    reorder_level: number;
    reorder_quantity: number;
    supplier_part_number: string;
  }>,
) {
  const body = { stock_item: updates };
  const updated = (await sageFetch(`/stock_items/${id}`, accessToken, {
    method: 'PUT',
    businessId,
    body,
  })) as SageStockItem;
  return normalizeStockItem(updated);
}

export async function listSuppliers(accessToken: string, businessId: string) {
  const data = (await sageFetch('/contacts', accessToken, {
    businessId,
    query: { contact_type: 'VENDOR', items_per_page: '200' },
  })) as { $items?: Array<{ id: string; name?: string; displayed_as?: string; reference?: string }> };
  return (data.$items ?? []).map((c) => ({
    id: c.id,
    name: c.name ?? c.displayed_as ?? '',
    reference: c.reference ?? '',
  }));
}

export async function listLedgerAccounts(accessToken: string, businessId: string) {
  const data = (await sageFetch('/ledger_accounts', accessToken, {
    businessId,
    query: { items_per_page: '100' },
  })) as { $items?: Array<{ id: string; displayed_as?: string; nominal_code?: string }> };
  return data.$items ?? [];
}

export async function listTaxRates(accessToken: string, businessId: string) {
  const data = (await sageFetch('/tax_rates', accessToken, {
    businessId,
    query: { items_per_page: '50' },
  })) as { $items?: Array<{ id: string; displayed_as?: string }> };
  return data.$items ?? [];
}

export function discoverCapabilities() {
  return {
    stockItems: { list: true, get: true, create: true, update: true, delete: false },
    purchaseOrders: {
      available: false,
      reason:
        'Sage Accounting API v3.1 OpenAPI exposes no /purchase_orders endpoint for this edition. Use Sage 200 or Sage Intacct for PO write-back.',
    },
    suppliers: { list: true },
    ledgerAccounts: { list: true },
    taxRates: { list: true },
    businesses: { list: true },
  };
}
