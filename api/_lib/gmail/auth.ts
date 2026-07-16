import type { VercelRequest, VercelResponse } from '@vercel/node';
import { getEnv } from '../sage/config';
import {
  clearCookie,
  generateRandomToken,
  parseCookies,
  setCookie,
} from '../sage/http';
import { decryptJson, encryptJson } from '../sage/tokenStore';
import {
  COOKIE_GMAIL_OAUTH_STATE,
  COOKIE_GMAIL_SESSION,
  DEFAULT_GMAIL_SCOPE,
  type GmailSession,
  type GoogleTokens,
} from './types';

const GOOGLE_AUTH_URL = 'https://accounts.google.com/o/oauth2/v2/auth';
const GOOGLE_TOKEN_URL = 'https://oauth2.googleapis.com/token';
const GOOGLE_KEY_ENV = 'GOOGLE_TOKEN_ENCRYPTION_KEY';

function googleCredentials() {
  const clientId = getEnv('GOOGLE_CLIENT_ID');
  const clientSecret = getEnv('GOOGLE_CLIENT_SECRET');
  const redirectUri = getEnv('GOOGLE_REDIRECT_URI');
  if (!clientId || !clientSecret || !redirectUri) {
    throw new Error('Google Gmail OAuth is not configured');
  }
  return { clientId, clientSecret, redirectUri };
}

export function buildGoogleAuthorizeUrl(state: string): string {
  const { clientId, redirectUri } = googleCredentials();
  const scope = getEnv('GOOGLE_GMAIL_SCOPES') ?? DEFAULT_GMAIL_SCOPE;
  const params = new URLSearchParams({
    client_id: clientId,
    redirect_uri: redirectUri,
    response_type: 'code',
    scope,
    state,
    access_type: 'offline',
    prompt: 'consent',
    include_granted_scopes: 'true',
  });
  return `${GOOGLE_AUTH_URL}?${params.toString()}`;
}

export function beginGmailOAuth(res: VercelResponse) {
  const state = generateRandomToken(24);
  setCookie(res, COOKIE_GMAIL_OAUTH_STATE, state, { maxAge: 600 });
  return { state, url: buildGoogleAuthorizeUrl(state) };
}

export function validateGmailOAuthState(req: VercelRequest, state?: string): boolean {
  if (!state) return false;
  return parseCookies(req)[COOKIE_GMAIL_OAUTH_STATE] === state;
}

async function tokenRequest(body: URLSearchParams): Promise<GoogleTokens> {
  const response = await fetch(GOOGLE_TOKEN_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body,
  });
  if (!response.ok) {
    throw new Error(`Google token exchange failed (${response.status})`);
  }
  const data = (await response.json()) as {
    access_token: string;
    refresh_token?: string;
    expires_in?: number;
    scope?: string;
    token_type?: string;
  };
  return {
    accessToken: data.access_token,
    refreshToken: data.refresh_token ?? '',
    expiresAt: Date.now() + (data.expires_in ?? 3600) * 1000 - 30_000,
    scope: data.scope,
    tokenType: data.token_type,
  };
}

export async function exchangeGmailCode(code: string): Promise<GoogleTokens> {
  const { clientId, clientSecret, redirectUri } = googleCredentials();
  return tokenRequest(
    new URLSearchParams({
      client_id: clientId,
      client_secret: clientSecret,
      redirect_uri: redirectUri,
      grant_type: 'authorization_code',
      code,
    }),
  );
}

export async function refreshGmailTokens(refreshToken: string): Promise<GoogleTokens> {
  const { clientId, clientSecret } = googleCredentials();
  const refreshed = await tokenRequest(
    new URLSearchParams({
      client_id: clientId,
      client_secret: clientSecret,
      grant_type: 'refresh_token',
      refresh_token: refreshToken,
    }),
  );
  return { ...refreshed, refreshToken };
}

export function readGmailSession(req: VercelRequest): GmailSession | null {
  const raw = parseCookies(req)[COOKIE_GMAIL_SESSION];
  if (!raw) return null;
  try {
    return decryptJson<GmailSession>(raw, GOOGLE_KEY_ENV);
  } catch {
    return null;
  }
}

export function writeGmailSession(res: VercelResponse, session: GmailSession) {
  setCookie(res, COOKIE_GMAIL_SESSION, encryptJson(session, GOOGLE_KEY_ENV), {
    maxAge: 60 * 60 * 24 * 30,
  });
}

export function clearGmailSession(res: VercelResponse) {
  clearCookie(res, COOKIE_GMAIL_SESSION);
  clearCookie(res, COOKIE_GMAIL_OAUTH_STATE);
}

export async function getValidGmailAccessToken(
  req: VercelRequest,
  res: VercelResponse,
): Promise<{ session: GmailSession; accessToken: string } | null> {
  const session = readGmailSession(req);
  if (!session?.tokens.refreshToken) return null;
  if (session.tokens.expiresAt > Date.now() + 15_000) {
    return { session, accessToken: session.tokens.accessToken };
  }
  const tokens = await refreshGmailTokens(session.tokens.refreshToken);
  const next = { ...session, tokens };
  writeGmailSession(res, next);
  return { session: next, accessToken: tokens.accessToken };
}
