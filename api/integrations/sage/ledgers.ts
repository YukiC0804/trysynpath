import type { VercelRequest, VercelResponse } from '@vercel/node';
import { json, requireMethod } from '../../_lib/http';
import { getValidAccessToken } from '../../_lib/sageAuth';
import { listLedgerAccounts, listTaxRates } from '../../_lib/sageClient';

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (!requireMethod(req, res, ['GET'])) return;
  try {
    const auth = await getValidAccessToken(req, res);
    if (!auth?.session.businessId) return json(res, 401, { error: 'Sage is not connected' });
    const [ledgers, taxRates] = await Promise.all([
      listLedgerAccounts(auth.accessToken, auth.session.businessId),
      listTaxRates(auth.accessToken, auth.session.businessId),
    ]);
    return json(res, 200, { ledgers, taxRates });
  } catch (error) {
    return json(res, 500, { error: error instanceof Error ? error.message : 'Ledger/tax lookup failed' });
  }
}
