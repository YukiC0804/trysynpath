import type { VercelRequest, VercelResponse } from '@vercel/node';
import { appendAudit } from '../../_lib/audit';
import { json, requireMethod } from '../../_lib/http';
import { getValidAccessToken } from '../../_lib/sageAuth';
import {
  createStockItem,
  findStockItemBySku,
  listStockItems,
  SageApiError,
} from '../../_lib/sageClient';

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (!requireMethod(req, res, ['GET', 'POST'])) return;

  try {
    const auth = await getValidAccessToken(req, res);
    if (!auth?.session.businessId) return json(res, 401, { error: 'Sage is not connected' });
    const { accessToken, session } = auth;
    const businessId = session.businessId!;

    if (req.method === 'GET') {
      const sku = typeof req.query.sku === 'string' ? req.query.sku : undefined;
      if (sku) {
        const item = await findStockItemBySku(accessToken, businessId, sku);
        return json(res, 200, { item });
      }
      const items = await listStockItems(accessToken, businessId);
      appendAudit(req, res, {
        action: 'sage.stock_items.list',
        detail: `Retrieved ${items.length} stock item(s)`,
        status: 'success',
      });
      return json(res, 200, { items });
    }

    const body = typeof req.body === 'string' ? JSON.parse(req.body) : req.body;
    const sku = String(body?.item_code ?? body?.sku ?? '').trim();
    if (!sku) return json(res, 400, { error: 'item_code is required' });

    const existing = await findStockItemBySku(accessToken, businessId, sku);
    if (existing) {
      return json(res, 409, {
        error: `Stock Item with SKU ${sku} already exists`,
        item: existing,
      });
    }

    const created = await createStockItem(accessToken, businessId, {
      item_code: sku,
      description: String(body.description ?? ''),
      cost_price: Number(body.cost_price ?? body.costPrice ?? 0),
      sales_price: Number(body.sales_price ?? body.salesPrice ?? 0),
      reorder_level: Number(body.reorder_level ?? body.reorderLevel ?? 0),
      reorder_quantity: Number(body.reorder_quantity ?? body.reorderQuantity ?? 0),
      supplier_part_number: body.supplier_part_number ?? body.supplierPartNumber,
      usual_supplier_id: body.usual_supplier_id ?? body.usualSupplierId,
    });

    const verified = await findStockItemBySku(accessToken, businessId, sku);
    const matches =
      verified &&
      verified.sku === created.sku &&
      Number(verified.costPrice) === Number(created.costPrice) &&
      verified.description === created.description;

    appendAudit(req, res, {
      action: 'sage.stock_items.create',
      detail: matches
        ? `Created and verified ${sku}`
        : `Created ${sku} (verification mismatch)`,
      status: matches ? 'success' : 'warning',
    });

    return json(res, 201, {
      item: verified ?? created,
      verified: Boolean(matches),
      message: matches ? 'Created and verified in Sage' : 'Created in Sage but verification mismatch',
    });
  } catch (error) {
    const status = error instanceof SageApiError ? error.status : 500;
    return json(res, status, { error: error instanceof Error ? error.message : 'Stock items request failed' });
  }
}
