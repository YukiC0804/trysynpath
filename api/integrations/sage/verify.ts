import type { VercelRequest, VercelResponse } from '@vercel/node';
import { json, requireMethod } from '../../_lib/http';
import { getValidAccessToken } from '../../_lib/sageAuth';
import { findStockItemBySku, getStockItem } from '../../_lib/sageClient';

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (!requireMethod(req, res, ['POST'])) return;
  try {
    const auth = await getValidAccessToken(req, res);
    if (!auth?.session.businessId) return json(res, 401, { error: 'Sage is not connected' });

    const body = typeof req.body === 'string' ? JSON.parse(req.body) : req.body;
    const expected = body?.expected ?? {};
    let item =
      body?.id != null
        ? await getStockItem(auth.accessToken, auth.session.businessId, String(body.id))
        : body?.sku
          ? await findStockItemBySku(auth.accessToken, auth.session.businessId, String(body.sku))
          : null;

    if (!item) return json(res, 404, { error: 'Stock item not found for verification' });

    const fields = ['sku', 'description', 'costPrice', 'salesPrice', 'reorderLevel', 'quantityInStock'] as const;
    const results = fields.map((field) => {
      if (expected[field] === undefined) return null;
      const actual = item![field];
      const expectedValue = expected[field];
      const ok =
        typeof expectedValue === 'number' || typeof actual === 'number'
          ? Number(expectedValue) === Number(actual)
          : String(expectedValue) === String(actual);
      return { field, expected: expectedValue, actual, ok };
    }).filter(Boolean);

    const verified = results.every((r) => r && r.ok);

    return json(res, 200, {
      verified,
      item,
      results,
      message: verified ? 'Created and verified in Sage' : 'Verification mismatch',
    });
  } catch (error) {
    return json(res, 500, { error: error instanceof Error ? error.message : 'Verification failed' });
  }
}
