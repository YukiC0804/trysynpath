import type { VercelRequest, VercelResponse } from '@vercel/node';
import { readAudit } from '../../_lib/audit';
import { json, requireMethod } from '../../_lib/http';

export default function handler(req: VercelRequest, res: VercelResponse) {
  if (!requireMethod(req, res, ['GET'])) return;
  return json(res, 200, { entries: readAudit(req) });
}
