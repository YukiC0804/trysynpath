/**
 * Persistent Outreach sequence store — same single-JSON-blob-in-Upstash
 * pattern as skuCatalog.ts/salesOrderStore.ts, keyed by sequence id, with an
 * in-memory fallback for local/test runs.
 */
import type { OutreachSequence } from '../../../shared/outreach';

const STORE_KEY = 'outreach-sequences:all';
const memory = new Map<string, string>();

function kvConfigured(): boolean {
  return Boolean(process.env.KV_REST_API_URL && process.env.KV_REST_API_TOKEN);
}

function useMemoryStore(): boolean {
  return (
    process.env.OUTREACH_MEMORY_STORE === '1' ||
    process.env.VITEST === 'true' ||
    process.env.NODE_ENV === 'test'
  );
}

async function upstash(command: unknown[]): Promise<unknown> {
  const url = process.env.KV_REST_API_URL;
  const token = process.env.KV_REST_API_TOKEN;
  if (!url || !token) {
    throw new Error(
      'Outreach storage is not configured. Set KV_REST_API_URL and KV_REST_API_TOKEN.',
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
    throw new Error(payload.error || `Outreach store request failed (${response.status})`);
  }
  return payload.result;
}

async function readStore(): Promise<Record<string, OutreachSequence>> {
  if (kvConfigured()) {
    const raw = await upstash(['GET', STORE_KEY]);
    return typeof raw === 'string' && raw ? (JSON.parse(raw) as Record<string, OutreachSequence>) : {};
  }
  if (useMemoryStore()) {
    const raw = memory.get(STORE_KEY);
    return raw ? (JSON.parse(raw) as Record<string, OutreachSequence>) : {};
  }
  throw new Error('Outreach storage is not configured. Set KV_REST_API_URL and KV_REST_API_TOKEN.');
}

async function writeStore(store: Record<string, OutreachSequence>): Promise<void> {
  const value = JSON.stringify(store);
  if (kvConfigured()) {
    await upstash(['SET', STORE_KEY, value]);
    return;
  }
  if (useMemoryStore()) {
    memory.set(STORE_KEY, value);
    return;
  }
  throw new Error('Outreach storage is not configured. Set KV_REST_API_URL and KV_REST_API_TOKEN.');
}

export async function upsertOutreachSequence(sequence: OutreachSequence): Promise<void> {
  const store = await readStore();
  store[sequence.id] = sequence;
  await writeStore(store);
}

export async function getOutreachSequence(id: string): Promise<OutreachSequence | null> {
  const store = await readStore();
  return store[id] ?? null;
}

export async function listOutreachSequences(): Promise<OutreachSequence[]> {
  return Object.values(await readStore());
}

export function __resetMemoryOutreachStore(): void {
  memory.clear();
}
