/**
 * Persistent SKU catalog — built from Supply & Costing results, queried by
 * Sales Order to resolve a customer's SKU/price without re-parsing a purchase
 * invoice. One JSON blob keyed by sku_id under a single Redis key: at this
 * business's scale (low hundreds of SKUs) that's simpler and cheaper than a
 * secondary index, and it makes "reprocessing overwrites, no history" trivial
 * — each upsert just replaces that sku_id's entry in the blob.
 *
 * Storage mirrors demoRun/store.ts: Upstash Redis REST (KV_REST_API_URL /
 * KV_REST_API_TOKEN) in production, an in-memory Map fallback for local/test
 * runs. No cookie fallback — this data isn't tied to one user's session and
 * can grow past what fits in a cookie.
 */
import type { SkuCatalogEntry } from '../../../shared/ghost';

const CATALOG_KEY = 'sku-catalog:all';
const memory = new Map<string, string>();

function kvConfigured(): boolean {
  return Boolean(process.env.KV_REST_API_URL && process.env.KV_REST_API_TOKEN);
}

function useMemoryStore(): boolean {
  return (
    process.env.SKU_CATALOG_MEMORY_STORE === '1' ||
    process.env.VITEST === 'true' ||
    process.env.NODE_ENV === 'test'
  );
}

export function skuCatalogStorageMode(): 'kv' | 'memory' | 'unconfigured' {
  if (kvConfigured()) return 'kv';
  if (useMemoryStore()) return 'memory';
  return 'unconfigured';
}

async function upstash(command: unknown[]): Promise<unknown> {
  const url = process.env.KV_REST_API_URL;
  const token = process.env.KV_REST_API_TOKEN;
  if (!url || !token) {
    throw new Error(
      'SKU catalog storage is not configured. Set KV_REST_API_URL and KV_REST_API_TOKEN.',
    );
  }
  const response = await fetch(url, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(command),
  });
  const payload = (await response.json()) as { result?: unknown; error?: string };
  if (!response.ok || payload.error) {
    throw new Error(payload.error || `SKU catalog store request failed (${response.status})`);
  }
  return payload.result;
}

async function readCatalog(): Promise<Record<string, SkuCatalogEntry>> {
  if (kvConfigured()) {
    const raw = await upstash(['GET', CATALOG_KEY]);
    return typeof raw === 'string' && raw ? (JSON.parse(raw) as Record<string, SkuCatalogEntry>) : {};
  }
  if (useMemoryStore()) {
    const raw = memory.get(CATALOG_KEY);
    return raw ? (JSON.parse(raw) as Record<string, SkuCatalogEntry>) : {};
  }
  throw new Error(
    'SKU catalog storage is not configured. Set KV_REST_API_URL and KV_REST_API_TOKEN.',
  );
}

async function writeCatalog(catalog: Record<string, SkuCatalogEntry>): Promise<void> {
  const value = JSON.stringify(catalog);
  if (kvConfigured()) {
    await upstash(['SET', CATALOG_KEY, value]);
    return;
  }
  if (useMemoryStore()) {
    memory.set(CATALOG_KEY, value);
    return;
  }
  throw new Error(
    'SKU catalog storage is not configured. Set KV_REST_API_URL and KV_REST_API_TOKEN.',
  );
}

export function normalizeCustomerName(name: string): string {
  return name.trim().toUpperCase().replace(/\s+/g, ' ');
}

/** Full overwrite per sku_id — reprocessing the same (or any) invoice replaces the old entry. */
export async function upsertSkuCatalogEntries(entries: SkuCatalogEntry[]): Promise<void> {
  if (!entries.length) return;
  const catalog = await readCatalog();
  for (const entry of entries) {
    catalog[entry.sku_id] = entry;
  }
  await writeCatalog(catalog);
}

export async function getSkuCatalogEntry(skuId: string): Promise<SkuCatalogEntry | null> {
  const catalog = await readCatalog();
  return catalog[skuId] ?? null;
}

export async function findSkuCatalogByCustomerAndThickness(
  customerName: string,
  thicknessMm: number,
): Promise<SkuCatalogEntry[]> {
  const key = normalizeCustomerName(customerName);
  const catalog = await readCatalog();
  return Object.values(catalog).filter(
    (entry) =>
      Math.abs(entry.thickness_mm - thicknessMm) < 1e-6 &&
      entry.customer_names.some((c) => normalizeCustomerName(c) === key),
  );
}

export async function listSkuCatalog(): Promise<SkuCatalogEntry[]> {
  return Object.values(await readCatalog());
}

export function __resetMemorySkuCatalog(): void {
  memory.clear();
}
