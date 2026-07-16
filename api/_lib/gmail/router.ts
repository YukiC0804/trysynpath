import type { VercelRequest, VercelResponse } from '@vercel/node';
import { getEnv, envPresence, errorMessage } from '../sage/config';
import { clearCookie, json } from '../sage/http';
import {
  beginGmailOAuth,
  clearGmailSession,
  exchangeGmailCode,
  getValidGmailAccessToken,
  readGmailSession,
  validateGmailOAuthState,
  writeGmailSession,
} from './auth';
import {
  getGmailMessage,
  getGmailProfile,
  GmailSourceAdapter,
  listGmailMessageIds,
} from './client';
import {
  COOKIE_GMAIL_OAUTH_STATE,
  DEFAULT_GMAIL_SEARCH,
  GOOGLE_REQUIRED_ENV,
} from './types';

function pathSegments(req: VercelRequest): string[] {
  const raw = req.query.__gmailPath ?? req.query.__integrationPath ?? req.query.__sagePath;
  if (Array.isArray(raw)) return raw.flatMap((value) => String(value).split('/')).filter(Boolean);
  if (typeof raw === 'string') return raw.split('/').filter(Boolean);
  const marker = '/api/gmail/';
  const pathname = (req.url ?? '').split('?')[0] ?? '';
  const index = pathname.indexOf(marker);
  return index >= 0 ? pathname.slice(index + marker.length).split('/').filter(Boolean) : [];
}

export async function handleGmailRequest(req: VercelRequest, res: VercelResponse) {
  const path = pathSegments(req);
  const method = (req.method ?? 'GET').toUpperCase();
  const config = envPresence(GOOGLE_REQUIRED_ENV);

  if (method === 'GET' && (path.length === 0 || path[0] === 'status')) {
    const session = readGmailSession(req);
    let connected = false;
    let emailAddress = session?.emailAddress;
    if (config.configured && session) {
      try {
        const auth = await getValidGmailAccessToken(req, res);
        connected = Boolean(auth);
        if (auth && !emailAddress) {
          const profile = await getGmailProfile(auth.accessToken);
          emailAddress = profile.emailAddress;
          writeGmailSession(res, { ...auth.session, emailAddress });
        }
      } catch {
        connected = false;
      }
    }
    return json(res, 200, {
      configured: config.configured,
      connected,
      emailAddress,
      connectedAt: session?.connectedAt,
      lastSyncAt: session?.lastSyncAt,
      defaultSearch: DEFAULT_GMAIL_SEARCH,
      missing: config.missing,
    });
  }

  if (method === 'GET' && path[0] === 'oauth' && path[1] === 'connect') {
    if (!config.configured) return json(res, 500, { error: 'Google OAuth is not configured', missing: config.missing });
    const { url } = beginGmailOAuth(res);
    res.writeHead(302, { Location: url });
    return res.end();
  }

  if (method === 'GET' && path[0] === 'oauth' && path[1] === 'callback') {
    const appBase = getEnv('APP_BASE_URL') ?? 'https://www.getsynpath-ai.com';
    const state = typeof req.query.state === 'string' ? req.query.state : undefined;
    const code = typeof req.query.code === 'string' ? req.query.code : undefined;
    const oauthError = typeof req.query.error === 'string' ? req.query.error : undefined;
    if (oauthError || !code) {
      res.writeHead(302, {
        Location: `${appBase}/sage-integration?gmail=failed`,
      });
      return res.end();
    }
    if (!validateGmailOAuthState(req, state)) {
      return json(res, 400, { error: 'Invalid Google OAuth state. Restart Gmail connection.' });
    }
    try {
      const tokens = await exchangeGmailCode(code);
      if (!tokens.refreshToken) {
        throw new Error(
          'Google returned no refresh token. Remove prior app consent and connect again.',
        );
      }
      const profile = await getGmailProfile(tokens.accessToken);
      writeGmailSession(res, {
        tokens,
        emailAddress: profile.emailAddress,
        connectedAt: new Date().toISOString(),
      });
      clearCookie(res, COOKIE_GMAIL_OAUTH_STATE);
      res.writeHead(302, {
        Location: `${appBase}/sage-integration?gmail=connected`,
      });
      return res.end();
    } catch (error) {
      clearGmailSession(res);
      res.writeHead(302, {
        Location: `${appBase}/sage-integration?gmail=failed&reason=${encodeURIComponent(
          errorMessage(error),
        )}`,
      });
      return res.end();
    }
  }

  if ((method === 'POST' || method === 'GET') && path[0] === 'disconnect') {
    clearGmailSession(res);
    return json(res, 200, { disconnected: true });
  }

  const auth = await getValidGmailAccessToken(req, res);
  if (!auth) return json(res, 401, { error: 'Gmail is not connected' });

  if (method === 'GET' && path[0] === 'messages' && path.length === 1) {
    const q = typeof req.query.q === 'string' ? req.query.q : DEFAULT_GMAIL_SEARCH;
    const list = await listGmailMessageIds(auth.accessToken, q);
    const messages = await Promise.all(
      list.messages.map((message) => getGmailMessage(auth.accessToken, message.id)),
    );
    return json(res, 200, {
      query: q,
      resultSizeEstimate: list.resultSizeEstimate,
      messages: messages.map((message) => ({
        id: message.id,
        threadId: message.threadId,
        labelIds: message.labelIds ?? [],
        snippet: message.snippet ?? '',
        internalDate: message.internalDate,
        headers: message.payload?.headers ?? [],
      })),
    });
  }

  if (method === 'POST' && path[0] === 'sync') {
    const body =
      typeof req.body === 'string' ? JSON.parse(req.body || '{}') : (req.body ?? {});
    const query = typeof body.query === 'string' ? body.query : DEFAULT_GMAIL_SEARCH;
    const messageIds = Array.isArray(body.messageIds)
      ? body.messageIds.map(String)
      : undefined;
    const collection = await new GmailSourceAdapter(auth.accessToken).collect({
      searchQuery: query,
      messageIds,
    });
    const lastSyncAt = new Date().toISOString();
    writeGmailSession(res, { ...auth.session, lastSyncAt });
    return json(res, 200, {
      query,
      lastSyncAt,
      messages: collection.emails,
      documents: collection.documents.map((document) => document.metadata),
      messageCount: collection.emails.length,
      attachmentCount: collection.documents.length,
    });
  }

  return json(res, 404, { error: 'Unknown Gmail integration route', path });
}
