/**
 * Persistent Sales Order record store — one row per invoice_number, built
 * from Sales Order PDF processing. Same storage pattern as skuCatalog.ts:
 * a single JSON blob keyed by invoice_number under one Redis key, so
 * reprocessing the same invoice fully overwrites what was there (no
 * history). Upstash Redis REST (KV_REST_API_URL / KV_REST_API_TOKEN) in
 * production, in-memory Map fallback for local/test runs.
 */
import type { SalesOrderRecord } from '../../../shared/ghost';

const STORE_KEY = 'sales-orders:all';
const memory = new Map<string, string>();

function kvConfigured(): boolean {
  return Boolean(process.env.KV_REST_API_URL && process.env.KV_REST_API_TOKEN);
}

function useMemoryStore(): boolean {
  return (
    process.env.SALES_ORDER_MEMORY_STORE === '1' ||
    process.env.VITEST === 'true' ||
    process.env.NODE_ENV === 'test'
  );
}

export function salesOrderStorageMode(): 'kv' | 'memory' | 'unconfigured' {
  if (kvConfigured()) return 'kv';
  if (useMemoryStore()) return 'memory';
  return 'unconfigured';
}

async function upstash(command: unknown[]): Promise<unknown> {
  const url = process.env.KV_REST_API_URL;
  const token = process.env.KV_REST_API_TOKEN;
  if (!url || !token) {
    throw new Error(
      'Sales order storage is not configured. Set KV_REST_API_URL and KV_REST_API_TOKEN.',
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
    throw new Error(payload.error || `Sales order store request failed (${response.status})`);
  }
  return payload.result;
}

async function readStore(): Promise<Record<string, SalesOrderRecord>> {
  if (kvConfigured()) {
    const raw = await upstash(['GET', STORE_KEY]);
    return typeof raw === 'string' && raw ? (JSON.parse(raw) as Record<string, SalesOrderRecord>) : {};
  }
  if (useMemoryStore()) {
    const raw = memory.get(STORE_KEY);
    return raw ? (JSON.parse(raw) as Record<string, SalesOrderRecord>) : {};
  }
  throw new Error(
    'Sales order storage is not configured. Set KV_REST_API_URL and KV_REST_API_TOKEN.',
  );
}

async function writeStore(store: Record<string, SalesOrderRecord>): Promise<void> {
  const value = JSON.stringify(store);
  if (kvConfigured()) {
    await upstash(['SET', STORE_KEY, value]);
    return;
  }
  if (useMemoryStore()) {
    memory.set(STORE_KEY, value);
    return;
  }
  throw new Error(
    'Sales order storage is not configured. Set KV_REST_API_URL and KV_REST_API_TOKEN.',
  );
}

/** Full overwrite per invoice_number — reprocessing the same invoice replaces all its lines. */
export async function upsertSalesOrderRecord(record: SalesOrderRecord): Promise<void> {
  if (!record.invoice_number) return;
  const store = await readStore();
  store[record.invoice_number] = record;
  await writeStore(store);
}

export async function getSalesOrderRecord(invoiceNumber: string): Promise<SalesOrderRecord | null> {
  const store = await readStore();
  return store[invoiceNumber] ?? null;
}

export async function listSalesOrderRecords(): Promise<SalesOrderRecord[]> {
  return Object.values(await readStore());
}

/** Wipes every Sales Order record — no way back. */
export async function clearSalesOrderRecords(): Promise<void> {
  if (kvConfigured()) {
    await upstash(['DEL', STORE_KEY]);
    return;
  }
  if (useMemoryStore()) {
    memory.delete(STORE_KEY);
    return;
  }
  throw new Error(
    'Sales order storage is not configured. Set KV_REST_API_URL and KV_REST_API_TOKEN.',
  );
}

export function __resetMemorySalesOrderStore(): void {
  memory.clear();
}
