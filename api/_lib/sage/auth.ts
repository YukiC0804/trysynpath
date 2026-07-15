import type { VercelRequest, VercelResponse } from '@vercel/node';
import { getEnv } from './config';
import { decryptJson, encryptJson } from './tokenStore';
import {
  clearCookie,
  generateRandomToken,
  parseCookies,
  setCookie,
} from './http';
import {
  COOKIE_FORCE_REAUTH,
  COOKIE_OAUTH_STATE,
  COOKIE_SESSION,
  type SageSession,
  type SageTokens,
} from './types';

const AUTH_URL = 'https://www.sageone.com/oauth2/auth/central';
const TOKEN_URL = 'https://oauth.accounting.sage.com/token';
/** Top-level Sage Accounting logout (federates through id.sage.com). Iframes cannot use this. */
export const SAGE_BROWSER_LOGOUT_URL = 'https://app.sageone.com/logout';
/** Clears Sage One browser country/session cookies before authorize. */
export const SAGE_BROWSER_CLEAR_URL = 'https://www.sageone.com/?clear';

export type AuthorizeOptions = {
  /** Force Sage to show the login / account selection UI instead of SSO auto-approve. */
  forceLogin?: boolean;
};

export function buildAuthorizeUrl(state: string, options: AuthorizeOptions = {}): string {
  const clientId = getEnv('SAGE_CLIENT_ID');
  const redirectUri = getEnv('SAGE_REDIRECT_URI');
  if (!clientId || !redirectUri) {
    throw new Error('Sage OAuth is not configured');
  }
  const params = new URLSearchParams({
    response_type: 'code',
    client_id: clientId,
    redirect_uri: redirectUri,
    scope: 'full_access',
    state,
    filter: 'apiv3.1',
  });
  if (options.forceLogin) {
    // OIDC-style hints so Sage does not silently reuse the previous browser SSO session.
    params.set('prompt', 'login');
    params.set('max_age', '0');
  }
  // Country/locale forces the central auth router through a country-specific login host.
  params.set('country', 'gb');
  params.set('locale', 'en_GB');
  return `${AUTH_URL}?${params.toString()}`;
}

export function beginOAuth(
  res: VercelResponse,
  options: AuthorizeOptions = {},
): { url: string; state: string } {
  const state = generateRandomToken(24);
  setCookie(res, COOKIE_OAUTH_STATE, state, { maxAge: 600 });
  return { url: buildAuthorizeUrl(state, options), state };
}

export function validateOAuthState(req: VercelRequest, state: string | undefined): boolean {
  if (!state) return false;
  const cookies = parseCookies(req);
  return cookies[COOKIE_OAUTH_STATE] === state;
}

export async function exchangeCodeForTokens(code: string): Promise<SageTokens> {
  const clientId = getEnv('SAGE_CLIENT_ID');
  const clientSecret = getEnv('SAGE_CLIENT_SECRET');
  const redirectUri = getEnv('SAGE_REDIRECT_URI');
  if (!clientId || !clientSecret || !redirectUri) {
    throw new Error('Sage OAuth credentials are not configured');
  }

  const body = new URLSearchParams({
    grant_type: 'authorization_code',
    code,
    client_id: clientId,
    client_secret: clientSecret,
    redirect_uri: redirectUri,
  });

  const response = await fetch(TOKEN_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded', Accept: 'application/json' },
    body,
  });

  if (!response.ok) {
    throw new Error(`Token exchange failed (${response.status})`);
  }

  const data = (await response.json()) as {
    access_token: string;
    refresh_token: string;
    expires_in?: number;
    token_type?: string;
    scope?: string;
  };

  return {
    accessToken: data.access_token,
    refreshToken: data.refresh_token,
    expiresAt: Date.now() + (data.expires_in ?? 300) * 1000 - 30_000,
    tokenType: data.token_type,
    scope: data.scope,
  };
}

export async function refreshTokens(refreshToken: string): Promise<SageTokens> {
  const clientId = getEnv('SAGE_CLIENT_ID');
  const clientSecret = getEnv('SAGE_CLIENT_SECRET');
  if (!clientId || !clientSecret) {
    throw new Error('Sage OAuth credentials are not configured');
  }

  const body = new URLSearchParams({
    grant_type: 'refresh_token',
    refresh_token: refreshToken,
    client_id: clientId,
    client_secret: clientSecret,
  });

  const response = await fetch(TOKEN_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded', Accept: 'application/json' },
    body,
  });

  if (!response.ok) {
    throw new Error(`Token refresh failed (${response.status})`);
  }

  const data = (await response.json()) as {
    access_token: string;
    refresh_token: string;
    expires_in?: number;
    token_type?: string;
    scope?: string;
  };

  return {
    accessToken: data.access_token,
    refreshToken: data.refresh_token,
    expiresAt: Date.now() + (data.expires_in ?? 300) * 1000 - 30_000,
    tokenType: data.token_type,
    scope: data.scope,
  };
}

/** Country-specific revoke endpoints for Sage Business Cloud Accounting. */
export function revokeEndpointForCountry(country?: string): string {
  const c = (country ?? 'GB').toUpperCase();
  if (c === 'US' || c === 'CA') return 'https://oauth.na.sageone.com/revoke';
  if (c === 'DE' || c === 'ES' || c === 'FR') return 'https://oauth.eu.sageone.com/revoke';
  return 'https://app.sageone.com/oauth2/revoke';
}

/**
 * Best-effort token revoke so disconnect invalidates Sage-side credentials.
 * Returns true when Sage acknowledged the revoke (2xx).
 */
export async function revokeSageToken(token: string, country?: string): Promise<boolean> {
  const clientId = getEnv('SAGE_CLIENT_ID');
  if (!clientId || !token) return false;
  try {
    const response = await fetch(revokeEndpointForCountry(country), {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded', Accept: 'application/json' },
      body: new URLSearchParams({ client_id: clientId, token }),
    });
    return response.ok || response.status === 204;
  } catch {
    return false;
  }
}

export function readSession(req: VercelRequest): SageSession | null {
  const cookies = parseCookies(req);
  const raw = cookies[COOKIE_SESSION];
  if (!raw) return null;
  try {
    return decryptJson<SageSession>(raw);
  } catch {
    return null;
  }
}

export function writeSession(res: VercelResponse, session: SageSession) {
  const encrypted = encryptJson(session);
  setCookie(res, COOKIE_SESSION, encrypted, { maxAge: 60 * 60 * 24 * 30 });
}

export function clearSession(res: VercelResponse) {
  clearCookie(res, COOKIE_SESSION);
  clearCookie(res, COOKIE_OAUTH_STATE);
}

export function markForceReauth(res: VercelResponse) {
  setCookie(res, COOKIE_FORCE_REAUTH, '1', { maxAge: 60 * 60 * 24 * 7 });
}

export function clearForceReauth(res: VercelResponse) {
  clearCookie(res, COOKIE_FORCE_REAUTH);
}

export function shouldForceLogin(req: VercelRequest): boolean {
  const cookies = parseCookies(req);
  if (cookies[COOKIE_FORCE_REAUTH] === '1') return true;
  const force =
    typeof req.query.force === 'string'
      ? req.query.force
      : typeof req.query.prompt === 'string'
        ? req.query.prompt
        : undefined;
  if (!force) return false;
  const normalized = force.toLowerCase();
  return normalized === '1' || normalized === 'true' || normalized === 'login' || normalized === 'reauth';
}

export async function getValidAccessToken(
  req: VercelRequest,
  res: VercelResponse,
): Promise<{ session: SageSession; accessToken: string } | null> {
  const session = readSession(req);
  if (!session?.tokens?.refreshToken) return null;

  if (session.tokens.expiresAt > Date.now() + 15_000) {
    return { session, accessToken: session.tokens.accessToken };
  }

  const refreshed = await refreshTokens(session.tokens.refreshToken);
  const next: SageSession = { ...session, tokens: refreshed };
  writeSession(res, next);
  return { session: next, accessToken: refreshed.accessToken };
}
