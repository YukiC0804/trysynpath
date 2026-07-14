import type { VercelRequest, VercelResponse } from '@vercel/node';
import { appendAudit } from '../../_lib/audit';
import { beginOAuth } from '../../_lib/sageAuth';
import { json, requireMethod, sageConfigStatus } from '../../_lib/http';

export default function handler(req: VercelRequest, res: VercelResponse) {
  if (!requireMethod(req, res, ['GET'])) return;

  const config = sageConfigStatus();
  if (!config.configured) {
    appendAudit(req, res, {
      action: 'sage.connect',
      detail: 'Sage OAuth is not configured for this environment',
      status: 'warning',
    });
    return json(res, 503, {
      error: 'Sage OAuth is not configured. Set Production environment variables and use the registered redirect URI.',
      configured: false,
      missing: config.missing,
    });
  }

  try {
    const { url } = beginOAuth(res);
    appendAudit(req, res, {
      action: 'sage.connect',
      detail: 'Redirecting to Sage OAuth authorization',
      status: 'info',
    });
    res.writeHead(302, { Location: url });
    res.end();
  } catch (error) {
    return json(res, 500, {
      error: error instanceof Error ? error.message : 'Unable to start Sage OAuth',
    });
  }
}
