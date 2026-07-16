import type { VercelRequest, VercelResponse } from '@vercel/node';
import { deflateRawSync, inflateRawSync } from 'zlib';
import type { DemoRunRecord } from '../../../shared/demoRun';
import { clearCookie, parseCookies, setCookie } from '../sage/http';
import { decryptJson, encryptJson } from '../sage/tokenStore';

const memory = new Map<string, string>();
const COOKIE_DEMO_RUN = 'synpath_demo_run';
const COOKIE_DEMO_RUN_CHUNKS = 'synpath_demo_run_chunks';
const COOKIE_CHUNK_SIZE = 3000;
const MAX_COOKIE_CHUNKS = 8;

let cookieContext: { req?: VercelRequest; res?: VercelResponse } = {};

export function bindDemoRunCookieContext(req: VercelRequest, res: VercelResponse) {
  cookieContext = { req, res };
}

function kvConfigured() {
  return Boolean(process.env.KV_REST_API_URL && process.env.KV_REST_API_TOKEN);
}

function useMemoryStore() {
  return (
    process.env.DEMO_RUN_MEMORY_STORE === '1' ||
    process.env.VITEST === 'true' ||
    process.env.NODE_ENV === 'test'
  );
}

async function upstash(command: unknown[]): Promise<unknown> {
  const url = process.env.KV_REST_API_URL;
  const token = process.env.KV_REST_API_TOKEN;
  if (!url || !token) {
    throw new Error(
      'Persistent demo-run storage is not configured. Set KV_REST_API_URL and KV_REST_API_TOKEN.',
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
    throw new Error(payload.error || `Demo-run store request failed (${response.status})`);
  }
  return payload.result;
}

function readCookieRecord(): DemoRunRecord | null {
  const req = cookieContext.req;
  if (!req) return null;
  const cookies = parseCookies(req);
  const count = Number(cookies[COOKIE_DEMO_RUN_CHUNKS] ?? 0);
  const raw =
    count > 0
      ? Array.from(
          { length: count },
          (_, index) => cookies[`${COOKIE_DEMO_RUN}_${index}`] ?? '',
        ).join('')
      : cookies[COOKIE_DEMO_RUN];
  if (!raw) return null;
  try {
    const wrapped = decryptJson<{ compressed: string }>(raw);
    return JSON.parse(
      inflateRawSync(Buffer.from(wrapped.compressed, 'base64url')).toString('utf8'),
    ) as DemoRunRecord;
  } catch {
    return null;
  }
}

function writeCookieRecord(record: DemoRunRecord | null) {
  const res = cookieContext.res;
  if (!res) return;
  if (!record) {
    clearCookie(res, COOKIE_DEMO_RUN);
    clearCookie(res, COOKIE_DEMO_RUN_CHUNKS);
    for (let index = 0; index < MAX_COOKIE_CHUNKS; index += 1) {
      clearCookie(res, `${COOKIE_DEMO_RUN}_${index}`);
    }
    return;
  }
  const compressed = deflateRawSync(Buffer.from(JSON.stringify(record), 'utf8')).toString(
    'base64url',
  );
  const encrypted = encryptJson({ compressed });
  const chunks = encrypted.match(new RegExp(`.{1,${COOKIE_CHUNK_SIZE}}`, 'g')) ?? [];
  if (chunks.length > MAX_COOKIE_CHUNKS) {
    throw new Error('Demo run state exceeded encrypted cookie storage limit');
  }
  clearCookie(res, COOKIE_DEMO_RUN);
  setCookie(res, COOKIE_DEMO_RUN_CHUNKS, String(chunks.length), {
    maxAge: 60 * 60 * 24 * 14,
  });
  chunks.forEach((chunk, index) =>
    setCookie(res, `${COOKIE_DEMO_RUN}_${index}`, chunk, {
      maxAge: 60 * 60 * 24 * 14,
    }),
  );
  for (let index = chunks.length; index < MAX_COOKIE_CHUNKS; index += 1) {
    clearCookie(res, `${COOKIE_DEMO_RUN}_${index}`);
  }
}

export function demoRunStorageReady() {
  return true;
}

export function demoRunStorageMode(): 'kv' | 'memory' | 'cookie' {
  if (kvConfigured()) return 'kv';
  if (useMemoryStore()) return 'memory';
  return 'cookie';
}

export async function saveDemoRun(record: DemoRunRecord): Promise<void> {
  const key = `demo-run:${record.id}`;
  const value = JSON.stringify(record);
  if (kvConfigured()) {
    await upstash(['SET', key, value]);
    await upstash(['SET', `demo-run-ref:${record.demoRunReference}`, record.id]);
    await upstash(['SET', `demo-run-business-active:${record.sageBusinessId}`, record.id]);
  } else if (useMemoryStore()) {
    memory.set(key, value);
    memory.set(`demo-run-ref:${record.demoRunReference}`, record.id);
    memory.set(`demo-run-business-active:${record.sageBusinessId}`, record.id);
  }
  // Always mirror into encrypted HttpOnly cookies when response context exists.
  writeCookieRecord(record);
  if (cookieContext.res) {
    setCookie(cookieContext.res, 'synpath_demo_run_id', record.id, {
      maxAge: 60 * 60 * 24 * 14,
    });
  }
}

export async function getDemoRun(id: string): Promise<DemoRunRecord | null> {
  const key = `demo-run:${id}`;
  if (kvConfigured()) {
    const raw = await upstash(['GET', key]);
    if (typeof raw === 'string' && raw) return JSON.parse(raw) as DemoRunRecord;
  } else if (useMemoryStore()) {
    const raw = memory.get(key);
    if (raw) return JSON.parse(raw) as DemoRunRecord;
  }
  const cookieRecord = readCookieRecord();
  if (cookieRecord?.id === id) return cookieRecord;
  return cookieRecord;
}

export async function getActiveDemoRunForBusiness(
  businessId: string,
): Promise<DemoRunRecord | null> {
  if (kvConfigured()) {
    const id = await upstash(['GET', `demo-run-business-active:${businessId}`]);
    if (typeof id === 'string' && id) {
      const record = await getDemoRun(id);
      if (record) return record;
    }
  } else if (useMemoryStore()) {
    const id = memory.get(`demo-run-business-active:${businessId}`);
    if (id) {
      const record = await getDemoRun(id);
      if (record) return record;
    }
  }
  const cookieRecord = readCookieRecord();
  if (cookieRecord && cookieRecord.sageBusinessId === businessId) return cookieRecord;
  return cookieRecord;
}

export async function clearActiveDemoRunPointer(businessId: string): Promise<void> {
  if (kvConfigured()) {
    await upstash(['DEL', `demo-run-business-active:${businessId}`]);
  } else if (useMemoryStore()) {
    memory.delete(`demo-run-business-active:${businessId}`);
  }
  // Keep the verified demo run record for audit until a new run overwrites it.
}

export function __resetMemoryDemoRunStore() {
  memory.clear();
}
