import type { VercelRequest, VercelResponse } from '@vercel/node';
import { handleSageRequest } from '../_lib/sage/router';
import { errorMessage } from '../_lib/sage/config';

/**
 * Single Hobby-plan-safe Vercel Function for all Sage integration routes.
 * Public URLs stay under /api/integrations/sage/* via vercel.json rewrites,
 * so the registered OAuth callback does not need to change.
 */
export default async function handler(req: VercelRequest, res: VercelResponse) {
  try {
    await handleSageRequest(req, res);
  } catch (error) {
    if (!res.headersSent) {
      res.status(500).json({
        ok: false,
        error: errorMessage(error),
      });
    }
  }
}
