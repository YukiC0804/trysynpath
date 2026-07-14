import type { VercelRequest, VercelResponse } from '@vercel/node';
import { appendAudit } from '../../_lib/audit';
import { clearCookie, getEnv, json, requireMethod, sageConfigStatus } from '../../_lib/http';
import {
  clearSession,
  exchangeCodeForTokens,
  validateOAuthState,
  writeSession,
} from '../../_lib/sageAuth';
import { listBusinesses, pickAccountingBusiness } from '../../_lib/sageClient';
import { COOKIE_OAUTH_STATE } from '../../_lib/types';

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (!requireMethod(req, res, ['GET'])) return;

  const appBase = getEnv('APP_BASE_URL') ?? 'https://www.getsynpath-ai.com';
  const config = sageConfigStatus();

  if (!config.configured) {
    return json(res, 503, {
      error: 'Sage OAuth callback is available, but credentials are not configured in this environment.',
      configured: false,
    });
  }

  const code = typeof req.query.code === 'string' ? req.query.code : undefined;
  const state = typeof req.query.state === 'string' ? req.query.state : undefined;
  const oauthError = typeof req.query.error === 'string' ? req.query.error : undefined;

  if (oauthError) {
    appendAudit(req, res, {
      action: 'sage.callback',
      detail: `Sage authorization denied: ${oauthError}`,
      status: 'error',
    });
    res.writeHead(302, { Location: `${appBase}/sage-integration?connected=false&error=denied` });
    return res.end();
  }

  if (!code) {
    return json(res, 400, {
      error: 'Missing OAuth authorization code. Start again from /api/integrations/sage/connect.',
      hint: 'This endpoint exchanges a Sage authorization code for tokens. It is not a 404.',
    });
  }

  if (!validateOAuthState(req, state)) {
    appendAudit(req, res, {
      action: 'sage.callback',
      detail: 'Invalid or missing OAuth state',
      status: 'error',
    });
    return json(res, 400, { error: 'Invalid OAuth state. Restart the Sage connection.' });
  }

  try {
    const tokens = await exchangeCodeForTokens(code);
    const businesses = await listBusinesses(tokens.accessToken);
    const business = pickAccountingBusiness(businesses);

    writeSession(res, {
      tokens,
      businessId: business?.id,
      businessName: business?.name ?? business?.displayed_as,
      businessType:
        typeof business?.business_type === 'string'
          ? business.business_type
          : business?.business_type?.id,
      connectedAt: new Date().toISOString(),
      country: business?.country,
    });
    clearCookie(res, COOKIE_OAUTH_STATE);

    appendAudit(req, res, {
      action: 'sage.callback',
      detail: `Sage connected${business ? ` · ${business.name ?? business.displayed_as}` : ''}`,
      status: 'success',
    });

    res.writeHead(302, { Location: `${appBase}/sage-integration?connected=true` });
    res.end();
  } catch (error) {
    clearSession(res);
    appendAudit(req, res, {
      action: 'sage.callback',
      detail: error instanceof Error ? error.message : 'Callback failed',
      status: 'error',
    });
    res.writeHead(302, { Location: `${appBase}/sage-integration?connected=false&error=token_exchange` });
    res.end();
  }
}
