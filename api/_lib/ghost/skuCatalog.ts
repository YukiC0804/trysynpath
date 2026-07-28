/**
 * Persistent SKU catalog — built from Supply & Costing results, queried by
 * Sales Order to resolve a customer's SKU/price without re-parsing a purchase
 * invoice. One JSON blob under a single Redis key, keyed by invoice_number
 * (not sku_id): reprocessing the same invoice replaces ALL of its lines in
 * one shot, matching how Sales Order records are stored. The same sku_id can
 * therefore still be present under more than one invoice_number if it was
 * ordered again later — reads pick the most recent by invoice date.
 *
 * Storage mirrors demoRun/store.ts: Upstash Redis REST (KV_REST_API_URL /
 * KV_REST_API_TOKEN) in production, an in-memory Map fallback for local/test
 * runs. No cookie fallback — this data isn't tied to one user's session and
 * can grow past what fits in a cookie.
 */
import type { SkuCatalogEntry } from '../../../shared/ghost';

const CATALOG_KEY = 'sku-catalog:all';
const memory = new Map<string, string>();

type CatalogStore = Record<string, SkuCatalogEntry[]>;

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

async function readCatalog(): Promise<CatalogStore> {
  if (kvConfigured()) {
    const raw = await upstash(['GET', CATALOG_KEY]);
    return typeof raw === 'string' && raw ? (JSON.parse(raw) as CatalogStore) : {};
  }
  if (useMemoryStore()) {
    const raw = memory.get(CATALOG_KEY);
    return raw ? (JSON.parse(raw) as CatalogStore) : {};
  }
  throw new Error(
    'SKU catalog storage is not configured. Set KV_REST_API_URL and KV_REST_API_TOKEN.',
  );
}

async function writeCatalog(catalog: CatalogStore): Promise<void> {
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

/** mm/dd/yyyy → sortable number; unparseable dates sort oldest. */
function dateRank(date: string): number {
  const m = /^(\d{1,2})\/(\d{1,2})\/(\d{4})$/.exec(date.trim());
  if (!m) return -Infinity;
  return Number(m[3]) * 10000 + Number(m[1]) * 100 + Number(m[2]);
}

function mostRecentFirst(entries: SkuCatalogEntry[]): SkuCatalogEntry[] {
  return [...entries].sort((a, b) => dateRank(b.date) - dateRank(a.date));
}

/** Full overwrite per invoice_number — reprocessing the same invoice replaces all its lines. */
export async function upsertSkuCatalogEntries(entries: SkuCatalogEntry[]): Promise<void> {
  if (!entries.length) return;
  const catalog = await readCatalog();
  const byInvoice = new Map<string, SkuCatalogEntry[]>();
  for (const entry of entries) {
    const list = byInvoice.get(entry.invoice_number);
    if (list) list.push(entry);
    else byInvoice.set(entry.invoice_number, [entry]);
  }
  for (const [invoiceNumber, list] of byInvoice) {
    catalog[invoiceNumber] = list;
  }
  await writeCatalog(catalog);
}

/** Most recent (by invoice date) entry with this sku_id, across all invoices. */
export async function getSkuCatalogEntry(skuId: string): Promise<SkuCatalogEntry | null> {
  const catalog = await readCatalog();
  const matches = Object.values(catalog)
    .flat()
    .filter((entry) => entry.sku_id === skuId);
  return mostRecentFirst(matches)[0] ?? null;
}

/** All matches for (customer, thickness), most recent invoice first. */
export async function findSkuCatalogByCustomerAndThickness(
  customerName: string,
  thicknessMm: number,
): Promise<SkuCatalogEntry[]> {
  const key = normalizeCustomerName(customerName);
  const catalog = await readCatalog();
  const matches = Object.values(catalog)
    .flat()
    .filter(
      (entry) =>
        Math.abs(entry.thickness_mm - thicknessMm) < 1e-6 &&
        entry.customer_names.some((c) => normalizeCustomerName(c) === key),
    );
  return mostRecentFirst(matches);
}

export async function listSkuCatalog(): Promise<SkuCatalogEntry[]> {
  return Object.values(await readCatalog()).flat();
}

/** Wipes the entire catalog — every invoice's entries, no way back. */
export async function clearSkuCatalog(): Promise<void> {
  if (kvConfigured()) {
    await upstash(['DEL', CATALOG_KEY]);
    return;
  }
  if (useMemoryStore()) {
    memory.delete(CATALOG_KEY);
    return;
  }
  throw new Error(
    'SKU catalog storage is not configured. Set KV_REST_API_URL and KV_REST_API_TOKEN.',
  );
}

export function __resetMemorySkuCatalog(): void {
  memory.clear();
}
