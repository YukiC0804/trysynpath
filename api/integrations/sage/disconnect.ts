import type { VercelRequest, VercelResponse } from '@vercel/node';
import { appendAudit } from '../../_lib/audit';
import { json, requireMethod } from '../../_lib/http';
import { clearSession } from '../../_lib/sageAuth';

export default function handler(req: VercelRequest, res: VercelResponse) {
  if (!requireMethod(req, res, ['POST', 'GET'])) return;
  clearSession(res);
  appendAudit(req, res, {
    action: 'sage.disconnect',
    detail: 'Sage session cleared',
    status: 'info',
  });
  return json(res, 200, { disconnected: true });
}
