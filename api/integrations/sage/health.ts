import type { VercelRequest, VercelResponse } from '@vercel/node';

/** Minimal health probe with no shared imports — used to verify function runtime. */
export default function handler(_req: VercelRequest, res: VercelResponse) {
  res.status(200).json({
    ok: true,
    service: 'sage-integration',
    runtime: 'vercel-node',
  });
}
