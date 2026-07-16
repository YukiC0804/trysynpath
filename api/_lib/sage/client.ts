import { getEnv } from './config';
import type { SageBusiness, SageStockItem } from './types';
import {
  sanitizeContactPayload,
  sanitizePurchaseInvoicePayload,
  sanitizeSalesInvoicePayload,
  sanitizeStockMovementPayload,
} from './payloadAllowlist';

export class SageApiError extends Error {
  status: number;
  constructor(message: string, status: number) {
    super(message);
    this.status = status;
  }
}

export async function sageFetch<T = unknown>(
  path: string,
  accessToken: string,
  options: { method?: string; businessId?: string; body?: unknown; query?: Record<string, string> } = {},
): Promise<T> {
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
    throw new SageApiError(
      `Sage API ${options.method ?? 'GET'} ${path} failed (${response.status})${detail ? `: ${detail.slice(0, 400)}` : ''}`,
      response.status,
    );
  }

  if (response.status === 204) return null as T;
  return response.json() as Promise<T>;
}

function salesPriceFromItem(item: SageStockItem): number {
  if (item.sales_price != null) return Number(item.sales_price);
  const first = item.sales_prices?.[0]?.price;
  return first != null ? Number(first) : 0;
}

function refId(value: unknown): string | undefined {
  if (!value) return undefined;
  if (typeof value === 'string') return value;
  if (typeof value === 'object' && value !== null && 'id' in value) {
    const id = (value as { id?: unknown }).id;
    return id != null ? String(id) : undefined;
  }
  return undefined;
}

function listItems<T>(data: { $items?: T[] } | T[]): T[] {
  return Array.isArray(data) ? data : data.$items ?? [];
}

async function sageListAll<T>(
  path: string,
  accessToken: string,
  businessId: string,
  query: Record<string, string> = {},
): Promise<T[]> {
  const all: T[] = [];
  for (let page = 1; page <= 50; page += 1) {
    const data = await sageFetch<
      { $items?: T[]; $next?: string | null } | T[]
    >(path, accessToken, {
      businessId,
      query: { items_per_page: '200', ...query, page: String(page) },
    });
    const items = listItems(data);
    all.push(...items);
    if (Array.isArray(data) || !data.$next || items.length === 0) break;
  }
  return all;
}

export function normalizeStockItem(item: SageStockItem) {
  return {
    id: item.id,
    sku: item.item_code ?? '',
    description: item.description ?? '',
    costPrice: Number(item.cost_price ?? 0),
    salesPrice: salesPriceFromItem(item),
    quantityInStock: Number(item.quantity_in_stock ?? 0),
    lastCostPrice: Number(item.last_cost_price ?? 0),
    averageCostPrice: Number(item.average_cost_price ?? 0),
    reorderLevel: Number(item.reorder_level ?? 0),
    reorderQuantity: Number(item.reorder_quantity ?? 0),
    supplier: item.usual_supplier?.displayed_as ?? '',
    supplierId: item.usual_supplier?.id ?? '',
    supplierPartNumber: item.supplier_part_number ?? '',
    active: item.active !== false,
    salesLedgerAccountId: refId(item.sales_ledger_account) ?? refId(item.sales_ledger_account_id),
    purchaseLedgerAccountId:
      refId(item.purchase_ledger_account) ?? refId(item.purchase_ledger_account_id),
    salesTaxRateId: refId(item.sales_tax_rate) ?? refId(item.sales_tax_rate_id),
    purchaseTaxRateId: refId(item.purchase_tax_rate) ?? refId(item.purchase_tax_rate_id),
    raw: item,
  };
}

export async function listBusinesses(accessToken: string): Promise<SageBusiness[]> {
  const data = (await sageFetch('/businesses', accessToken)) as { $items?: SageBusiness[] } | SageBusiness[];
  return listItems(data);
}

export function pickAccountingBusiness(businesses: SageBusiness[]): SageBusiness | undefined {
  return (
    businesses.find((b) => {
      const type = typeof b.business_type === 'string' ? b.business_type : b.business_type?.id;
      return (
        String(type ?? '').toLowerCase().includes('sbc_accounting') ||
        String(type ?? '').toLowerCase() === 'accounting'
      );
    }) ??
    businesses.find((b) => String(b.subscription ?? b.product ?? '').toLowerCase().includes('accounting')) ??
    businesses[0]
  );
}

export async function listStockItems(accessToken: string, businessId: string) {
  return (
    await sageListAll<SageStockItem>('/stock_items', accessToken, businessId, {
      attributes: 'all',
    })
  ).map(normalizeStockItem);
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

export type StockItemDefaults = {
  sales_ledger_account_id: string;
  purchase_ledger_account_id: string;
  sales_tax_rate_id?: string;
  purchase_tax_rate_id?: string;
};

export type LedgerLike = {
  id: string;
  displayed_as?: string;
  nominal_code?: string | number;
  name?: string;
};
export type TaxRateLike = {
  id: string;
  displayed_as?: string;
  name?: string;
  percentage?: string | number;
};

export function pickLedgerAccount(
  ledgers: LedgerLike[],
  kind: 'sales' | 'purchase',
): LedgerLike | undefined {
  const scored = ledgers
    .map((ledger) => {
      const label = `${ledger.displayed_as ?? ''} ${ledger.name ?? ''} ${ledger.nominal_code ?? ''}`.toLowerCase();
      let score = 0;
      if (kind === 'sales') {
        if (/sales/.test(label) && /product/.test(label)) score += 40;
        if (/sales/.test(label)) score += 25;
        if (ledger.nominal_code === '4000' || /4000/.test(label)) score += 30;
        if (/income|revenue/.test(label)) score += 10;
      } else {
        if (/\bstock\b/.test(label) && !/sales/.test(label)) score += 40;
        if (/purchase|cost of sales|cos\b/.test(label)) score += 25;
        if (ledger.nominal_code === '1000' || /1000/.test(label)) score += 30;
        if (/inventory/.test(label)) score += 20;
      }
      return { ledger, score };
    })
    .filter((row) => row.score > 0)
    .sort((a, b) => b.score - a.score);
  return scored[0]?.ledger ?? ledgers[0];
}

export function pickTaxRate(taxRates: TaxRateLike[]): TaxRateLike | undefined {
  const preferred = taxRates.find((rate) => /standard|gb_standard|20/.test(String(rate.id ?? rate.displayed_as ?? '').toLowerCase()));
  return preferred ?? taxRates[0];
}

/**
 * Sage requires sales_ledger_account_id + purchase_ledger_account_id on create.
 * Prefer copying from an existing stock item in the same business; fall back to chart of accounts.
 */
export async function resolveStockItemDefaults(
  accessToken: string,
  businessId: string,
  options: {
    salesLedgerAccountId?: string;
    purchaseLedgerAccountId?: string;
    salesTaxRateId?: string;
    purchaseTaxRateId?: string;
  } = {},
): Promise<StockItemDefaults> {
  if (options.salesLedgerAccountId && options.purchaseLedgerAccountId) {
    return {
      sales_ledger_account_id: options.salesLedgerAccountId,
      purchase_ledger_account_id: options.purchaseLedgerAccountId,
      sales_tax_rate_id: options.salesTaxRateId,
      purchase_tax_rate_id: options.purchaseTaxRateId,
    };
  }

  const existing = await listStockItems(accessToken, businessId);
  const template =
    existing.find((item) => item.salesLedgerAccountId && item.purchaseLedgerAccountId) ?? null;

  if (template?.salesLedgerAccountId && template.purchaseLedgerAccountId) {
    return {
      sales_ledger_account_id: options.salesLedgerAccountId ?? template.salesLedgerAccountId,
      purchase_ledger_account_id:
        options.purchaseLedgerAccountId ?? template.purchaseLedgerAccountId,
      sales_tax_rate_id: options.salesTaxRateId ?? template.salesTaxRateId,
      purchase_tax_rate_id: options.purchaseTaxRateId ?? template.purchaseTaxRateId,
    };
  }

  const [ledgers, taxRates] = await Promise.all([
    listLedgerAccounts(accessToken, businessId),
    listTaxRates(accessToken, businessId),
  ]);
  const sales = options.salesLedgerAccountId
    ? { id: options.salesLedgerAccountId }
    : pickLedgerAccount(ledgers, 'sales');
  const purchase = options.purchaseLedgerAccountId
    ? { id: options.purchaseLedgerAccountId }
    : pickLedgerAccount(ledgers, 'purchase');
  const tax = pickTaxRate(taxRates);

  if (!sales?.id || !purchase?.id) {
    throw new SageApiError(
      'Could not resolve sales/purchase ledger accounts required to create a Sage stock item. Create one stock item in Sage first, then retry.',
      422,
    );
  }

  return {
    sales_ledger_account_id: sales.id,
    purchase_ledger_account_id: purchase.id,
    sales_tax_rate_id: options.salesTaxRateId ?? tax?.id,
    purchase_tax_rate_id: options.purchaseTaxRateId ?? tax?.id,
  };
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
    sales_ledger_account_id?: string;
    purchase_ledger_account_id?: string;
    sales_tax_rate_id?: string;
    purchase_tax_rate_id?: string;
  },
) {
  const defaults = await resolveStockItemDefaults(accessToken, businessId, {
    salesLedgerAccountId: payload.sales_ledger_account_id,
    purchaseLedgerAccountId: payload.purchase_ledger_account_id,
    salesTaxRateId: payload.sales_tax_rate_id,
    purchaseTaxRateId: payload.purchase_tax_rate_id,
  });

  const body = {
    stock_item: {
      item_code: payload.item_code,
      description: payload.description,
      cost_price: payload.cost_price,
      ...(payload.sales_price != null
        ? {
            sales_prices: [
              {
                price_name: 'Sales Price',
                price: payload.sales_price,
                price_includes_tax: false,
              },
            ],
          }
        : {}),
      reorder_level: payload.reorder_level ?? 0,
      reorder_quantity: payload.reorder_quantity ?? 0,
      supplier_part_number: payload.supplier_part_number ?? '',
      sales_ledger_account_id: defaults.sales_ledger_account_id,
      purchase_ledger_account_id: defaults.purchase_ledger_account_id,
      ...(defaults.sales_tax_rate_id ? { sales_tax_rate_id: defaults.sales_tax_rate_id } : {}),
      ...(defaults.purchase_tax_rate_id
        ? { purchase_tax_rate_id: defaults.purchase_tax_rate_id }
        : {}),
      ...(payload.usual_supplier_id
        ? { usual_supplier_id: payload.usual_supplier_id }
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
  if (!id || id === 'undefined' || id === 'null') {
    throw new SageApiError('Stock item id is required for update', 400);
  }

  const { sales_price: salesPrice, ...openApiUpdates } = updates;
  let salesPrices:
    | Array<{
        price_name?: string;
        price: number;
        price_includes_tax?: boolean;
        product_sales_price_type_id?: string;
      }>
    | undefined;
  if (salesPrice != null) {
    const current = await sageFetch<SageStockItem>(`/stock_items/${id}`, accessToken, {
      businessId,
      query: { attributes: 'all' },
    });
    const existing = current.sales_prices ?? [];
    salesPrices = existing.length
      ? existing.map((price, index) => ({
          ...(price.price_name ? { price_name: price.price_name } : {}),
          price: index === 0 ? salesPrice : Number(price.price ?? 0),
          ...(price.price_includes_tax != null
            ? { price_includes_tax: price.price_includes_tax }
            : {}),
          ...(price.product_sales_price_type?.id
            ? {
                product_sales_price_type_id:
                  price.product_sales_price_type.id,
              }
            : {}),
        }))
      : [{ price_name: 'Sales Price', price: salesPrice, price_includes_tax: false }];
  }
  const body = {
    stock_item: {
      ...openApiUpdates,
      ...(salesPrices ? { sales_prices: salesPrices } : {}),
    },
  };
  const updated = (await sageFetch(`/stock_items/${id}`, accessToken, {
    method: 'PUT',
    businessId,
    body,
  })) as SageStockItem;
  return normalizeStockItem(updated);
}

export async function deleteStockItem(
  accessToken: string,
  businessId: string,
  id: string,
) {
  if (!id || id === 'undefined' || id === 'null') {
    throw new SageApiError('Stock item id is required for delete', 400);
  }
  await sageFetch(`/stock_items/${id}`, accessToken, {
    method: 'DELETE',
    businessId,
  });
}

export type NormalizedContact = {
  id: string;
  name: string;
  reference: string;
  typeIds: string[];
  currencyId?: string;
  defaultPurchaseLedgerAccountId?: string;
  defaultSalesLedgerAccountId?: string;
  defaultSalesTaxRateId?: string;
  mainAddress?: Record<string, unknown>;
};

export async function listContacts(
  accessToken: string,
  businessId: string,
  contactTypeId?: 'VENDOR' | 'CUSTOMER',
): Promise<NormalizedContact[]> {
  const data = await sageListAll<{
      id: string;
      name?: string;
      displayed_as?: string;
      reference?: string;
      contact_types?: Array<{ id?: string }>;
      currency?: { id?: string };
      default_purchase_ledger_account?: { id?: string };
      default_sales_ledger_account?: { id?: string };
      default_sales_tax_rate?: { id?: string };
      main_address?: Record<string, unknown>;
    }>('/contacts', accessToken, businessId, {
      ...(contactTypeId ? { contact_type_id: contactTypeId } : {}),
      attributes: 'all',
    });
  return data.map((c) => ({
    id: c.id,
    name: c.name ?? c.displayed_as ?? '',
    reference: c.reference ?? '',
    typeIds: (c.contact_types ?? []).map((type) => type.id ?? '').filter(Boolean),
    currencyId: c.currency?.id,
    defaultPurchaseLedgerAccountId: c.default_purchase_ledger_account?.id,
    defaultSalesLedgerAccountId: c.default_sales_ledger_account?.id,
    defaultSalesTaxRateId: c.default_sales_tax_rate?.id,
    mainAddress: c.main_address,
  }));
}

export async function createContact(
  accessToken: string,
  businessId: string,
  payload: {
    name: string;
    contact_type_ids: Array<'VENDOR' | 'CUSTOMER'>;
    reference?: string;
    default_sales_ledger_account_id?: string;
    default_sales_tax_rate_id?: string;
    default_purchase_ledger_account_id?: string;
    notes?: string;
    currency_id?: string;
    main_address?: Record<string, unknown>;
  },
): Promise<NormalizedContact> {
  const safe = sanitizeContactPayload(payload);
  const created = await sageFetch<Record<string, unknown>>('/contacts', accessToken, {
    method: 'POST',
    businessId,
    body: { contact: safe },
  });
  const entity =
    created.contact && typeof created.contact === 'object'
      ? (created.contact as Record<string, unknown>)
      : created;
  return {
    id: String(entity.id ?? ''),
    name: String(entity.name ?? entity.displayed_as ?? payload.name),
    reference: String(entity.reference ?? payload.reference ?? ''),
    typeIds: Array.isArray(entity.contact_types)
      ? (entity.contact_types as Array<{ id?: unknown }>)
          .map((type) => String(type.id ?? ''))
          .filter(Boolean)
      : payload.contact_type_ids,
    currencyId:
      entity.currency && typeof entity.currency === 'object'
        ? String((entity.currency as { id?: unknown }).id ?? '') || undefined
        : payload.currency_id,
    defaultPurchaseLedgerAccountId:
      entity.default_purchase_ledger_account &&
      typeof entity.default_purchase_ledger_account === 'object'
        ? String(
            (entity.default_purchase_ledger_account as { id?: unknown }).id ?? '',
          ) || undefined
        : payload.default_purchase_ledger_account_id,
    defaultSalesLedgerAccountId:
      entity.default_sales_ledger_account &&
      typeof entity.default_sales_ledger_account === 'object'
        ? String(
            (entity.default_sales_ledger_account as { id?: unknown }).id ?? '',
          ) || undefined
        : payload.default_sales_ledger_account_id,
    defaultSalesTaxRateId:
      entity.default_sales_tax_rate &&
      typeof entity.default_sales_tax_rate === 'object'
        ? String((entity.default_sales_tax_rate as { id?: unknown }).id ?? '') ||
          undefined
        : payload.default_sales_tax_rate_id,
    mainAddress:
      entity.main_address && typeof entity.main_address === 'object'
        ? (entity.main_address as Record<string, unknown>)
        : payload.main_address,
  };
}

export function listSuppliers(accessToken: string, businessId: string) {
  return listContacts(accessToken, businessId, 'VENDOR');
}

export async function listLedgerAccounts(accessToken: string, businessId: string) {
  const data = (await sageFetch('/ledger_accounts', accessToken, {
    businessId,
    query: { items_per_page: '200' },
  })) as { $items?: LedgerLike[] } | LedgerLike[];
  return listItems(data);
}

export const SAGE_PURCHASE_LEDGER_VISIBLE_IN = 'expenses';

export async function listPurchaseLedgerAccounts(accessToken: string, businessId: string) {
  const data = (await sageFetch('/ledger_accounts', accessToken, {
    businessId,
    // Sage exposes invoice expense accounts under "expenses"; "purchases" is
    // not a valid visible_in value and returns 422.
    query: { items_per_page: '200', visible_in: SAGE_PURCHASE_LEDGER_VISIBLE_IN },
  })) as { $items?: LedgerLike[] } | LedgerLike[];
  return listItems(data);
}

export async function listTaxRates(
  accessToken: string,
  businessId: string,
  usage?: 'purchase' | 'sales',
) {
  const data = (await sageFetch('/tax_rates', accessToken, {
    businessId,
    query: { items_per_page: '50', ...(usage ? { usage } : {}) },
  })) as { $items?: TaxRateLike[] } | TaxRateLike[];
  return listItems(data);
}

export type NormalizedPurchaseInvoice = {
  id: string;
  reference: string;
  vendorReference: string;
  displayedAs: string;
  totalAmount: number;
  status: string;
};

function normalizePurchaseInvoice(invoice: Record<string, unknown>): NormalizedPurchaseInvoice {
  const status = invoice.status as { displayed_as?: string; id?: string } | undefined;
  return {
    id: String(invoice.id ?? ''),
    reference: String(invoice.reference ?? ''),
    vendorReference: String(invoice.vendor_reference ?? ''),
    displayedAs: String(invoice.displayed_as ?? invoice.reference ?? ''),
    totalAmount: Number(invoice.total_amount ?? 0),
    status: status?.displayed_as ?? status?.id ?? '',
  };
}

export async function listPurchaseInvoices(
  accessToken: string,
  businessId: string,
  reference?: string,
) {
  return (
    await sageListAll<Record<string, unknown>>(
      '/purchase_invoices',
      accessToken,
      businessId,
      { attributes: 'all', ...(reference ? { search: reference } : {}) },
    )
  ).map(normalizePurchaseInvoice);
}

export async function createPurchaseInvoice(
  accessToken: string,
  businessId: string,
  purchaseInvoice: Record<string, unknown>,
) {
  const safe = sanitizePurchaseInvoicePayload(purchaseInvoice);
  const created = (await sageFetch('/purchase_invoices', accessToken, {
    method: 'POST',
    businessId,
    body: { purchase_invoice: safe },
  })) as Record<string, unknown>;
  const entity =
    created.purchase_invoice && typeof created.purchase_invoice === 'object'
      ? (created.purchase_invoice as Record<string, unknown>)
      : created;
  return normalizePurchaseInvoice(entity);
}

export async function deletePurchaseInvoice(
  accessToken: string,
  businessId: string,
  id: string,
) {
  if (!id || id === 'undefined' || id === 'null') {
    throw new SageApiError('Purchase invoice id is required for delete', 400);
  }
  await sageFetch(`/purchase_invoices/${id}`, accessToken, {
    method: 'DELETE',
    businessId,
  });
}

export async function getPurchaseInvoice(
  accessToken: string,
  businessId: string,
  id: string,
) {
  return sageFetch<Record<string, unknown>>(`/purchase_invoices/${id}`, accessToken, {
    businessId,
    query: { attributes: 'all' },
  });
}

export async function releasePurchaseInvoice(
  accessToken: string,
  businessId: string,
  id: string,
) {
  return sageFetch<Record<string, unknown>>(
    `/purchase_invoices/${id}/release`,
    accessToken,
    { method: 'POST', businessId },
  );
}

export async function createStockMovement(
  accessToken: string,
  businessId: string,
  stockMovement: Record<string, unknown>,
) {
  const safe = sanitizeStockMovementPayload(stockMovement);
  const created = await sageFetch<Record<string, unknown>>('/stock_movements', accessToken, {
    method: 'POST',
    businessId,
    body: { stock_movement: safe },
  });
  return created.stock_movement && typeof created.stock_movement === 'object'
    ? (created.stock_movement as Record<string, unknown>)
    : created;
}

export async function listStockMovements(
  accessToken: string,
  businessId: string,
  reference?: string,
  stockItemId?: string,
) {
  return sageListAll<Record<string, unknown>>(
    '/stock_movements',
    accessToken,
    businessId,
    {
      attributes: 'all',
      ...(reference ? { search: reference } : {}),
      ...(stockItemId ? { stock_item_id: stockItemId } : {}),
    },
  );
}

export async function getStockMovement(
  accessToken: string,
  businessId: string,
  id: string,
) {
  return sageFetch<Record<string, unknown>>(`/stock_movements/${id}`, accessToken, {
    businessId,
    query: { attributes: 'all' },
  });
}

export async function deleteStockMovement(
  accessToken: string,
  businessId: string,
  id: string,
) {
  if (!id || id === 'undefined' || id === 'null') {
    throw new SageApiError('Stock movement id is required for delete', 400);
  }
  await sageFetch(`/stock_movements/${id}`, accessToken, {
    method: 'DELETE',
    businessId,
  });
}

export async function createSalesInvoice(
  accessToken: string,
  businessId: string,
  salesInvoice: Record<string, unknown>,
) {
  const safe = sanitizeSalesInvoicePayload(salesInvoice);
  const created = await sageFetch<Record<string, unknown>>('/sales_invoices', accessToken, {
    method: 'POST',
    businessId,
    body: { sales_invoice: safe },
  });
  return created.sales_invoice && typeof created.sales_invoice === 'object'
    ? (created.sales_invoice as Record<string, unknown>)
    : created;
}

export async function listSalesInvoices(
  accessToken: string,
  businessId: string,
  reference?: string,
) {
  return sageListAll<Record<string, unknown>>(
    '/sales_invoices',
    accessToken,
    businessId,
    {
      attributes: 'all',
      ...(reference ? { search: reference } : {}),
    },
  );
}

export async function getSalesInvoice(
  accessToken: string,
  businessId: string,
  id: string,
) {
  return sageFetch<Record<string, unknown>>(`/sales_invoices/${id}`, accessToken, {
    businessId,
    query: { attributes: 'all' },
  });
}

/** Released (non-Draft) Sales Invoices require void_reason on DELETE. */
export const DEMO_SALES_INVOICE_VOID_REASON = 'Synpath Ghostboards demo reset';

export async function deleteSalesInvoice(
  accessToken: string,
  businessId: string,
  id: string,
  voidReason = DEMO_SALES_INVOICE_VOID_REASON,
) {
  if (!id || id === 'undefined' || id === 'null') {
    throw new SageApiError('Sales invoice id is required for delete/void', 400);
  }
  await sageFetch(`/sales_invoices/${id}`, accessToken, {
    method: 'DELETE',
    businessId,
    query: { void_reason: voidReason },
  });
}

export async function releaseSalesInvoice(
  accessToken: string,
  businessId: string,
  id: string,
) {
  return sageFetch<Record<string, unknown>>(
    `/sales_invoices/${id}/release`,
    accessToken,
    { method: 'POST', businessId },
  );
}

export async function listCurrencies(accessToken: string, businessId: string) {
  const data = await sageFetch<
    { $items?: Array<{ id: string; displayed_as?: string }> } |
      Array<{ id: string; displayed_as?: string }>
  >('/currencies', accessToken, { businessId, query: { items_per_page: '200' } });
  return listItems(data);
}

export async function listArtefactStatuses(accessToken: string, businessId: string) {
  const data = await sageFetch<
    { $items?: Array<{ id: string; displayed_as?: string }> } |
      Array<{ id: string; displayed_as?: string }>
  >('/artefact_statuses', accessToken, {
    businessId,
    query: { items_per_page: '200' },
  });
  return listItems(data);
}

export async function listSalesLedgerAccounts(accessToken: string, businessId: string) {
  const data = await sageFetch<{ $items?: LedgerLike[] } | LedgerLike[]>(
    '/ledger_accounts',
    accessToken,
    {
      businessId,
      query: { items_per_page: '200', visible_in: 'sales' },
    },
  );
  return listItems(data);
}

export function discoverCapabilities() {
  return {
    stockItems: { list: true, get: true, create: true, update: true, delete: true },
    purchaseInvoices: {
      list: true,
      get: true,
      create: true,
      update: true,
      delete: true,
      release: true,
    },
    stockMovements: {
      list: true,
      get: true,
      create: true,
      update: true,
      delete: true,
    },
    salesInvoices: {
      list: true,
      get: true,
      create: true,
      update: true,
      delete: true,
      release: true,
    },
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
