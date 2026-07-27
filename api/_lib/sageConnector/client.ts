/**
 * HTTP client for the Windows-hosted Sage 50 connector
 * (Synpath-ai/ai_erp: project_ghost_acrylics/sage_connector) — the real Ghost Acrylics
 * company's books. This is a different product/integration from api/_lib/sage/* (Sage
 * Business Cloud Accounting) and deliberately kept separate.
 *
 * Mirrors project_ghost_acrylics/po_write_entry/sage_client.py's payload shapes exactly
 * (`_po_payload`, `_receive_payload`) plus the connector README's documented sales_order
 * shape. Config: SAGE_CONNECTOR_URL (base URL, e.g. an SSM port-forward to localhost:8080
 * locally, or the connector host's persistent tunnel URL in production) and
 * SAGE_CONNECTOR_API_KEY (sent as X-API-Key, matching the connector's SAGE_API_KEY).
 */
import type {
  AcrylicSkuLine,
  PurchaseWritePlan,
  SalesOrderLine,
  SalesOrderPlan,
  VendorExtract,
} from '../../../shared/ghost';

function baseUrl(): string {
  return (process.env.SAGE_CONNECTOR_URL || '').trim().replace(/\/+$/, '');
}

function apiKey(): string {
  return (process.env.SAGE_CONNECTOR_API_KEY || '').trim();
}

export function sageConnectorConfigured(): boolean {
  return Boolean(baseUrl());
}

async function connectorFetch<T>(path: string, init: RequestInit = {}): Promise<T> {
  const base = baseUrl();
  if (!base) throw new Error('SAGE_CONNECTOR_URL is not set');
  const key = apiKey();
  const resp = await fetch(`${base}${path}`, {
    ...init,
    headers: {
      'Content-Type': 'application/json',
      ...(key ? { 'X-API-Key': key } : {}),
      ...(init.headers as Record<string, string> | undefined),
    },
  });
  if (!resp.ok) {
    const detail = await resp.text().catch(() => '');
    throw new Error(
      `Sage connector ${init.method ?? 'GET'} ${path} -> HTTP ${resp.status}: ${detail.slice(0, 400)}`,
    );
  }
  if (resp.status === 204) return undefined as T;
  const text = await resp.text();
  return (text ? JSON.parse(text) : undefined) as T;
}

/** Forces the connector to drop its warm Sage session and re-acquire a fresh one —
 * needed after the Sage 50 desktop UI was opened on the connector host, since Sage
 * is single-writer and the connector otherwise keeps hanging against a stale session. */
export async function resetSageSession(): Promise<unknown> {
  return connectorFetch('/session/reset', { method: 'POST' });
}

export async function pingSageConnector(): Promise<{ ok: boolean; detail: string }> {
  if (!sageConnectorConfigured()) {
    return { ok: false, detail: 'SAGE_CONNECTOR_URL not set — Sage write disabled, preview only' };
  }
  try {
    await connectorFetch('/health');
    return { ok: true, detail: `Sage connector reachable at ${baseUrl()}` };
  } catch (error) {
    return { ok: false, detail: error instanceof Error ? error.message : String(error) };
  }
}

// --- Master data (Customer/Vendor — idempotent create-or-get on `id`) ---

interface PartyPayload {
  id: string;
  name: string;
  company_name: string;
  email: string | null;
  address: {
    address1: string | null;
    address2: string | null;
    city: string | null;
    state: string | null;
    zip: string | null;
    country: string | null;
  };
}

function partyPayload(id: string, name: string, extract: Partial<VendorExtract> = {}): PartyPayload {
  return {
    id,
    name,
    company_name: extract.company_name || name,
    email: extract.email ?? null,
    address: {
      address1: extract.address1 ?? null,
      address2: extract.address2 ?? null,
      city: extract.city ?? null,
      state: extract.state ?? null,
      zip: extract.zip ?? null,
      country: extract.country ?? null,
    },
  };
}

export async function upsertVendor(vendor: VendorExtract): Promise<unknown> {
  return connectorFetch('/vendors', {
    method: 'POST',
    body: JSON.stringify(partyPayload(vendor.id, vendor.name, vendor)),
  });
}

export async function upsertCustomer(id: string, name: string): Promise<unknown> {
  return connectorFetch('/customers', { method: 'POST', body: JSON.stringify(partyPayload(id, name)) });
}

// --- Inventory (read-only — Sage 50 has no item-creation API; see HANDOFF_27_July.md) ---

interface InventoryItemOut {
  id: string;
  description?: string | null;
  inactive?: boolean;
}

export async function listInventoryItems(): Promise<InventoryItemOut[]> {
  const items = await connectorFetch<InventoryItemOut[]>('/inventory-items');
  return items ?? [];
}

/** SKUs that don't exist yet in Sage — must be created by hand/CSV import before a
 * receive or sales invoice against them can move quantity. */
export async function findMissingSkuIds(skuIds: string[]): Promise<string[]> {
  const wanted = [...new Set(skuIds.filter(Boolean))];
  if (!wanted.length) return [];
  const items = await listInventoryItems();
  const existing = new Set(items.map((i) => i.id));
  return wanted.filter((id) => !existing.has(id));
}

// --- Shared helpers ---

function isoDate(date: string | null | undefined): string {
  const d = (date || new Date().toISOString().slice(0, 10)).slice(0, 10);
  return `${d}T00:00:00`;
}

function round(n: number, decimals: number): number {
  const f = 10 ** decimals;
  return Math.round(n * f) / f;
}

// --- Purchases: PO + Receive (mirrors sage_client.py _po_payload / _receive_payload) ---

function purchaseLine(ln: AcrylicSkuLine, glAccountId: string) {
  return {
    description: ln.description,
    quantity: ln.quantity,
    unit_price: round(ln.landed_unit_cost, 4),
    amount: round(ln.amount, 2),
    item_id: ln.sku_id,
    gl_account_id: glAccountId,
  };
}

export function toPurchaseOrderPayload(plan: PurchaseWritePlan) {
  const v = plan.vendor;
  return {
    type: 'purchase_order' as const,
    vendor_id: v.id,
    vendor: partyPayload(v.id, v.name, v),
    reference_number: plan.po_reference_number,
    date: isoDate(plan.invoice_date),
    gl_account_id: plan.gl_account_id,
    lines: plan.lines.map((ln) => purchaseLine(ln, plan.gl_account_id)),
  };
}

export function toReceivePayload(plan: PurchaseWritePlan) {
  return {
    vendor_id: plan.vendor.id,
    reference_number: plan.receive_reference_number,
    purchase_order_reference: plan.po_reference_number,
    date: isoDate(plan.invoice_date),
    gl_account_id: plan.gl_account_id,
    lines: plan.lines.map((ln) => purchaseLine(ln, plan.gl_account_id)),
  };
}

export async function createPurchaseOrder(plan: PurchaseWritePlan): Promise<{ reference_number?: string }> {
  return connectorFetch('/orders', { method: 'POST', body: JSON.stringify(toPurchaseOrderPayload(plan)) });
}

export async function createPurchaseReceive(plan: PurchaseWritePlan): Promise<{ reference_number?: string }> {
  return connectorFetch('/purchases/receive', {
    method: 'POST',
    body: JSON.stringify(toReceivePayload(plan)),
  });
}

// --- Sales order (no ai_erp Python precedent — shape per sage_connector/api/README.md).
// Creates the order document only. The connector has no Sales Invoice endpoint yet, so
// this does not post revenue or reduce inventory (see HANDOFF_27_July.md §3/plan Phase 4). ---

function salesLine(ln: SalesOrderLine) {
  return {
    description: ln.description,
    quantity: ln.quantity,
    unit_price: round(ln.unit_price, 4),
    amount: round(ln.amount, 2),
    // Only acrylic lines carry a real Sage inventory item id; freight/other lines post
    // description-only (there is and will be no Sage inventory item for "freight").
    item_id: ln.line_kind === 'acrylic' ? ln.sku : null,
  };
}

export function toSalesOrderPayload(plan: SalesOrderPlan, customerId: string, referenceNumber: string) {
  return {
    type: 'sales_order' as const,
    customer_id: customerId,
    reference_number: referenceNumber,
    date: isoDate(plan.invoice_date),
    customer_po_number: plan.po_number ?? null,
    lines: plan.lines.map(salesLine),
  };
}

export async function createSalesOrder(
  plan: SalesOrderPlan,
  customerId: string,
  referenceNumber: string,
): Promise<{ reference_number?: string }> {
  return connectorFetch('/orders', {
    method: 'POST',
    body: JSON.stringify(toSalesOrderPayload(plan, customerId, referenceNumber)),
  });
}
