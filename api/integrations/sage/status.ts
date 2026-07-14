import type { VercelRequest, VercelResponse } from '@vercel/node';
import { json, requireMethod, sageConfigStatus } from '../../_lib/http';
import { getValidAccessToken, readSession } from '../../_lib/sageAuth';
import { discoverCapabilities } from '../../_lib/sageClient';

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (!requireMethod(req, res, ['GET'])) return;

  const config = sageConfigStatus();
  const session = readSession(req);

  let connected = false;
  try {
    const valid = await getValidAccessToken(req, res);
    connected = Boolean(valid?.session.businessId || valid?.session.tokens.accessToken);
  } catch {
    connected = false;
  }

  return json(res, 200, {
    configured: config.configured,
    connected: connected && Boolean(session),
    business: session
      ? {
          id: session.businessId,
          name: session.businessName,
          type: session.businessType,
          connectedAt: session.connectedAt,
          country: session.country,
        }
      : null,
    message: connected ? 'Sage Accounting Connected' : 'Not connected',
    capabilities: discoverCapabilities(),
    redirectUri: config.redirectUri,
  });
}
