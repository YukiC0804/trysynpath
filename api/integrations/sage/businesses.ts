import type { VercelRequest, VercelResponse } from '@vercel/node';
import { appendAudit } from '../../_lib/audit';
import { json, requireMethod } from '../../_lib/http';
import { getValidAccessToken, writeSession } from '../../_lib/sageAuth';
import { listBusinesses, pickAccountingBusiness } from '../../_lib/sageClient';

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (!requireMethod(req, res, ['GET'])) return;

  try {
    const auth = await getValidAccessToken(req, res);
    if (!auth) return json(res, 401, { error: 'Sage is not connected' });

    const businesses = await listBusinesses(auth.accessToken);
    const selected = pickAccountingBusiness(businesses);

    if (selected && selected.id !== auth.session.businessId) {
      writeSession(res, {
        ...auth.session,
        businessId: selected.id,
        businessName: selected.name ?? selected.displayed_as,
        businessType:
          typeof selected.business_type === 'string'
            ? selected.business_type
            : selected.business_type?.id,
      });
    }

    appendAudit(req, res, {
      action: 'sage.businesses',
      detail: `Loaded ${businesses.length} business(es)`,
      status: 'success',
    });

    return json(res, 200, {
      businesses: businesses.map((b) => ({
        id: b.id,
        name: b.name ?? b.displayed_as,
        type: typeof b.business_type === 'string' ? b.business_type : b.business_type?.id,
        country: b.country,
      })),
      selected: selected
        ? {
            id: selected.id,
            name: selected.name ?? selected.displayed_as,
            type: typeof selected.business_type === 'string' ? selected.business_type : selected.business_type?.id,
          }
        : null,
    });
  } catch (error) {
    return json(res, 500, { error: error instanceof Error ? error.message : 'Business discovery failed' });
  }
}
