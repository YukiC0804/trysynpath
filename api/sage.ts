import type { VercelRequest, VercelResponse } from '@vercel/node';
import { handleSageRequest } from './_lib/sage/router';
import { errorMessage } from './_lib/sage/config';

/**
 * Single Hobby-plan-safe Vercel Function.
 * All public URLs under /api/integrations/sage/* are rewritten here via
 * vercel.json, with the remainder path passed as __sagePath so multi-segment
 * routes never rely on catch-all filesystem matching (which 404s on this project).
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
