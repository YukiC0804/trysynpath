export type NormalizedStockItem = {
  id: string;
  sku: string;
  description: string;
  costPrice: number;
  salesPrice: number;
  quantityInStock: number;
  reorderLevel: number;
  reorderQuantity: number;
  supplier: string;
  supplierId?: string;
  supplierPartNumber?: string;
  active?: boolean;
  salesLedgerAccountId?: string;
  purchaseLedgerAccountId?: string;
  salesTaxRateId?: string;
  purchaseTaxRateId?: string;
};

export type SageStatus = {
  configured: boolean;
  connected: boolean;
  business: {
    id?: string;
    name?: string;
    type?: string;
    connectedAt?: string;
    country?: string;
  } | null;
  message: string;
  capabilities?: unknown;
  redirectUri?: string;
};

async function parseJson(res: Response) {
  const text = await res.text();
  let data: Record<string, unknown> = {};
  if (text) {
    try {
      data = JSON.parse(text) as Record<string, unknown>;
    } catch {
      data = {};
    }
  }
  if (!res.ok) {
    const message =
      (typeof data.error === 'string' && data.error) ||
      (typeof data.message === 'string' && data.message) ||
      `Request failed (${res.status})${text && !data.error ? `: ${text.slice(0, 180)}` : ''}`;
    throw new Error(message);
  }
  return data;
}

export async function fetchSageStatus(): Promise<SageStatus> {
  const res = await fetch('/api/integrations/sage/status', { credentials: 'include' });
  return parseJson(res) as Promise<SageStatus>;
}

export async function disconnectSage() {
  const res = await fetch('/api/integrations/sage/disconnect', {
    method: 'POST',
    credentials: 'include',
  });
  return parseJson(res);
}

export async function listStockItems(): Promise<NormalizedStockItem[]> {
  const res = await fetch('/api/integrations/sage/stock-items', { credentials: 'include' });
  const data = (await parseJson(res)) as { items: NormalizedStockItem[] };
  return data.items ?? [];
}

export async function getStockItemBySku(sku: string): Promise<NormalizedStockItem | null> {
  const res = await fetch(`/api/integrations/sage/stock-items?sku=${encodeURIComponent(sku)}`, {
    credentials: 'include',
  });
  const data = (await parseJson(res)) as { item: NormalizedStockItem | null };
  return data.item ?? null;
}

export async function createStockItem(payload: Record<string, unknown>) {
  const res = await fetch('/api/integrations/sage/stock-items', {
    method: 'POST',
    credentials: 'include',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  });
  return parseJson(res) as Promise<{
    item: NormalizedStockItem;
    verified: boolean;
    message: string;
  }>;
}

export async function updateStockItem(id: string, payload: Record<string, unknown>) {
  // Body-based update avoids deep catch-all path 404s on some Vercel deployments.
  const res = await fetch('/api/integrations/sage/stock-items/update', {
    method: 'POST',
    credentials: 'include',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ id, ...payload }),
  });
  return parseJson(res) as Promise<{
    before: NormalizedStockItem;
    after: NormalizedStockItem;
    verification: Record<string, { expected: unknown; actual: unknown; ok: boolean }>;
    reorderRequired: boolean;
    message: string;
  }>;
}

export async function fetchCapabilities() {
  const res = await fetch('/api/integrations/sage/capabilities', { credentials: 'include' });
  return parseJson(res);
}

export async function fetchAuditLog() {
  const res = await fetch('/api/integrations/sage/audit', { credentials: 'include' });
  return parseJson(res) as Promise<{
    entries: Array<{ id: string; at: string; action: string; detail: string; status: string }>;
  }>;
}

export async function fetchBusinesses() {
  const res = await fetch('/api/integrations/sage/businesses', { credentials: 'include' });
  return parseJson(res);
}
