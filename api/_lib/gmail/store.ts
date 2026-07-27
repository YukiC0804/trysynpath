/**
 * Server-side persistence for the Gmail session — same Upstash Redis REST
 * pattern as skuCatalog.ts/salesOrderStore.ts, with an in-memory fallback for
 * local/test runs. This is what lets a Vercel Cron invocation (no browser,
 * no cookies) read/refresh the Gmail token; the encrypted HttpOnly cookie
 * (gmail/auth.ts) stays as the fast path for interactive browser requests
 * and as a fallback when KV isn't configured.
 *
 * Single global session — this app connects one company mailbox, not a
 * per-user session, so there's exactly one row, not a table keyed by user.
 */
import { decryptJson, encryptJson } from '../sage/tokenStore';
import type { GmailSession } from './types';

const SESSION_KEY = 'gmail-session:default';
const GOOGLE_KEY_ENV = 'GOOGLE_TOKEN_ENCRYPTION_KEY';
const memory = new Map<string, string>();

function kvConfigured(): boolean {
  return Boolean(process.env.KV_REST_API_URL && process.env.KV_REST_API_TOKEN);
}

function useMemoryStore(): boolean {
  return (
    process.env.GMAIL_SESSION_MEMORY_STORE === '1' ||
    process.env.VITEST === 'true' ||
    process.env.NODE_ENV === 'test'
  );
}

async function upstash(command: unknown[]): Promise<unknown> {
  const url = process.env.KV_REST_API_URL;
  const token = process.env.KV_REST_API_TOKEN;
  if (!url || !token) throw new Error('KV_REST_API_URL/KV_REST_API_TOKEN not set');
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
    throw new Error(payload.error || `Gmail session store request failed (${response.status})`);
  }
  return payload.result;
}

export async function readGmailSessionKv(): Promise<GmailSession | null> {
  let raw: string | undefined;
  if (kvConfigured()) {
    const value = await upstash(['GET', SESSION_KEY]);
    raw = typeof value === 'string' ? value : undefined;
  } else if (useMemoryStore()) {
    raw = memory.get(SESSION_KEY);
  } else {
    return null;
  }
  if (!raw) return null;
  try {
    return decryptJson<GmailSession>(raw, GOOGLE_KEY_ENV);
  } catch {
    return null;
  }
}

export async function writeGmailSessionKv(session: GmailSession): Promise<void> {
  const encrypted = encryptJson(session, GOOGLE_KEY_ENV);
  if (kvConfigured()) {
    await upstash(['SET', SESSION_KEY, encrypted]);
    return;
  }
  if (useMemoryStore()) {
    memory.set(SESSION_KEY, encrypted);
  }
  // Neither configured (local dev without KV): the cookie in gmail/auth.ts remains
  // the only store — fine for interactive use, just won't work from a cron context.
}

export async function clearGmailSessionKv(): Promise<void> {
  if (kvConfigured()) {
    await upstash(['DEL', SESSION_KEY]);
    return;
  }
  if (useMemoryStore()) {
    memory.delete(SESSION_KEY);
  }
}

export function __resetMemoryGmailStore(): void {
  memory.clear();
}
