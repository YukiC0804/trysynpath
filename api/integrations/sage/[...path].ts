import type { VercelRequest, VercelResponse } from '@vercel/node';
import { handleSageRequest } from '../../_lib/sage/router';
import { errorMessage } from '../../_lib/sage/config';

/**
 * Single Hobby-plan-safe Vercel Function for all Sage integration routes.
 * Helpers live under api/_lib (CommonJS scope) so they are bundled/required
 * correctly and are not counted as separate Serverless Functions.
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
