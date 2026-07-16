import type { VercelRequest, VercelResponse } from '@vercel/node';
import crypto from 'crypto';
import { getEnv } from './config';
import { SAGE_REQUIRED_ENV } from './types';

export function json(res: VercelResponse, status: number, body: unknown) {
  res.status(status).json(body);
}

export function missingConfigResponse(res: VercelResponse, missing: string[]) {
  return json(res, 500, {
    ok: false,
    error: 'Missing required server configuration',
    missing,
    hint: 'Environment variables are injected at deploy time. If the key exists in Vercel Project Settings, create a new deployment (redeploy Preview/Production) so process.env receives it.',
  });
}

export function sageConfigStatus() {
  const missing = SAGE_REQUIRED_ENV.filter((key) => !getEnv(key));
  return {
    configured: missing.length === 0,
    missing: [...missing],
    apiBaseUrl: getEnv('SAGE_API_BASE_URL') ?? 'https://api.accounting.sage.com/v3.1',
    redirectUri: getEnv('SAGE_REDIRECT_URI'),
    appBaseUrl: getEnv('APP_BASE_URL'),
  };
}

export function generateRandomToken(bytes = 32): string {
  return crypto.randomBytes(bytes).toString('base64url');
}

export function parseCookies(req: VercelRequest): Record<string, string> {
  const header = req.headers.cookie ?? '';
  return Object.fromEntries(
    header
      .split(';')
      .map((part) => part.trim())
      .filter(Boolean)
      .map((part) => {
        const idx = part.indexOf('=');
        if (idx === -1) return [part, ''];
        return [part.slice(0, idx), decodeURIComponent(part.slice(idx + 1))];
      }),
  );
}

export function setCookie(
  res: VercelResponse,
  name: string,
  value: string,
  options: {
    maxAge?: number;
    httpOnly?: boolean;
    secure?: boolean;
    sameSite?: 'Lax' | 'Strict' | 'None';
    path?: string;
  } = {},
) {
  const {
    maxAge = 60 * 60 * 24 * 30,
    httpOnly = true,
    secure = true,
    sameSite = 'Lax',
    path = '/',
  } = options;
  const parts = [
    `${name}=${encodeURIComponent(value)}`,
    `Path=${path}`,
    `SameSite=${sameSite}`,
    `Max-Age=${maxAge}`,
  ];
  if (httpOnly) parts.push('HttpOnly');
  if (secure) parts.push('Secure');
  const existing = res.getHeader('Set-Cookie');
  const previous = Array.isArray(existing)
    ? existing.map(String)
    : existing
      ? [String(existing)]
      : [];
  // Replace any prior Set-Cookie for the same name. Workflow 2 calls store.put
  // many times in one request; appending duplicates blows past Vercel header
  // limits and surfaces as FUNCTION_INVOCATION_FAILED.
  const prefix = `${name}=`;
  const next = [
    ...previous.filter((cookie) => !cookie.startsWith(prefix)),
    parts.join('; '),
  ];
  res.setHeader('Set-Cookie', next);
}

export function clearCookie(res: VercelResponse, name: string) {
  setCookie(res, name, '', { maxAge: 0 });
}
