import type { VercelRequest, VercelResponse } from '@vercel/node';
import { handleSageRequest } from '../../../src/server/sage/router';
import { errorMessage } from '../../../src/server/sage/config';

/**
 * Single Hobby-plan-safe Vercel Function for all Sage integration routes.
 * Path: /api/integrations/sage/*
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
