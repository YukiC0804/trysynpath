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
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    throw new Error((data as { error?: string }).error ?? `Request failed (${res.status})`);
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
  const res = await fetch(`/api/integrations/sage/stock-items/${encodeURIComponent(id)}`, {
    method: 'PUT',
    credentials: 'include',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
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
  return parseJson(res) as Promise<{ entries: Array<{ id: string; at: string; action: string; detail: string; status: string }> }>;
}

export async function fetchBusinesses() {
  const res = await fetch('/api/integrations/sage/businesses', { credentials: 'include' });
  return parseJson(res);
}
