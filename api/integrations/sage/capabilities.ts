import type { VercelRequest, VercelResponse } from '@vercel/node';
import { json, requireMethod } from '../../_lib/http';
import { discoverCapabilities } from '../../_lib/sageClient';

export default function handler(req: VercelRequest, res: VercelResponse) {
  if (!requireMethod(req, res, ['GET'])) return;
  return json(res, 200, { capabilities: discoverCapabilities() });
}
