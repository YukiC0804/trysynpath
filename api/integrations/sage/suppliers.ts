import type { VercelRequest, VercelResponse } from '@vercel/node';
import { json, requireMethod } from '../../_lib/http';
import { getValidAccessToken } from '../../_lib/sageAuth';
import { listSuppliers } from '../../_lib/sageClient';

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (!requireMethod(req, res, ['GET'])) return;
  try {
    const auth = await getValidAccessToken(req, res);
    if (!auth?.session.businessId) return json(res, 401, { error: 'Sage is not connected' });
    const suppliers = await listSuppliers(auth.accessToken, auth.session.businessId);
    const acrylicOnly = suppliers.filter(
      (s) =>
        !/hmrc/i.test(s.name) &&
        (/(acrylic|plastics|nationwide|pacific|west coast)/i.test(s.name) ||
          /(NWA-003|PAC-ACRYLIC-001|WCP-002)/i.test(s.reference)),
    );
    return json(res, 200, {
      suppliers: acrylicOnly.length ? acrylicOnly : suppliers.filter((s) => !/hmrc/i.test(s.name)),
    });
  } catch (error) {
    return json(res, 500, { error: error instanceof Error ? error.message : 'Supplier lookup failed' });
  }
}
