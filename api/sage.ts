import type { VercelRequest, VercelResponse } from '@vercel/node';
import { handleSageRequest } from './_lib/sage/router';
import { errorMessage } from './_lib/sage/config';

/**
 * Single Hobby-plan-safe Vercel Function.
 * All public URLs under /api/integrations/sage/* are rewritten here via
 * vercel.json, with the remainder path passed as __sagePath so multi-segment
 * routes never rely on catch-all filesystem matching (which 404s on this project).
 */
export const config = {
  // Workflow 2 issues many sequential Sage API calls (PI + stock movements).
  maxDuration: 60,
};

export default async function handler(req: VercelRequest, res: VercelResponse) {
  try {
    const integration =
      typeof req.query.__integration === 'string' ? req.query.__integration : 'sage';
    if (integration === 'gmail') {
      const { handleGmailRequest } = await import('./_lib/gmail/router');
      await handleGmailRequest(req, res);
    } else if (integration === 'workflow') {
      const { handleWorkflowRequest } = await import('./_lib/workflow/router');
      await handleWorkflowRequest(req, res);
    } else if (integration === 'agents') {
      const { handleAgentsRequest } = await import('./_lib/agents/router');
      await handleAgentsRequest(req, res);
    } else {
      await handleSageRequest(req, res);
    }
  } catch (error) {
    if (!res.headersSent) {
      res.status(500).json({
        ok: false,
        error: errorMessage(error),
      });
    }
  }
}
