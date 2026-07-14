import type { VercelRequest, VercelResponse } from '@vercel/node';
import crypto from 'crypto';

export function requireMethod(req: VercelRequest, res: VercelResponse, methods: string[]): boolean {
  if (!req.method || !methods.includes(req.method)) {
    res.status(405).json({ error: `Method ${req.method} not allowed` });
    return false;
  }
  return true;
}

export function json(res: VercelResponse, status: number, body: unknown) {
  res.status(status).json(body);
}

export function getEnv(name: string): string | undefined {
  const value = process.env[name];
  return value && value.trim() ? value.trim() : undefined;
}

export function sageConfigStatus() {
  const required = [
    'APP_BASE_URL',
    'SAGE_CLIENT_ID',
    'SAGE_CLIENT_SECRET',
    'SAGE_REDIRECT_URI',
    'SAGE_API_BASE_URL',
    'TOKEN_ENCRYPTION_KEY',
  ] as const;
  const missing = required.filter((key) => !getEnv(key));
  return {
    configured: missing.length === 0,
    missing,
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
  options: { maxAge?: number; httpOnly?: boolean; secure?: boolean; sameSite?: 'Lax' | 'Strict' | 'None'; path?: string } = {},
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
  const next = Array.isArray(existing) ? [...existing, parts.join('; ')] : existing ? [String(existing), parts.join('; ')] : [parts.join('; ')];
  res.setHeader('Set-Cookie', next);
}

export function clearCookie(res: VercelResponse, name: string) {
  setCookie(res, name, '', { maxAge: 0 });
}
