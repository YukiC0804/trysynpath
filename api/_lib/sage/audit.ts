import type { VercelRequest, VercelResponse } from '@vercel/node';
import { decryptJson, encryptJson } from './tokenStore';
import { generateRandomToken, parseCookies, setCookie } from './http';
import { COOKIE_AUDIT, type AuditEntry } from './types';

export function readAudit(req: VercelRequest): AuditEntry[] {
  const cookies = parseCookies(req);
  const raw = cookies[COOKIE_AUDIT];
  if (!raw) return [];
  try {
    return decryptJson<AuditEntry[]>(raw);
  } catch {
    return [];
  }
}

export function appendAudit(
  req: VercelRequest,
  res: VercelResponse,
  entry: Omit<AuditEntry, 'id' | 'at'> & { at?: string },
): AuditEntry[] {
  const current = readAudit(req);
  const nextEntry: AuditEntry = {
    id: generateRandomToken(8),
    at: entry.at ?? new Date().toISOString(),
    action: entry.action,
    detail: entry.detail,
    status: entry.status,
  };
  const next = [nextEntry, ...current].slice(0, 50);
  try {
    setCookie(res, COOKIE_AUDIT, encryptJson(next), { maxAge: 60 * 60 * 24 * 14 });
  } catch {
    // Skip durable audit cookie if encryption key is unavailable.
  }
  return next;
}
