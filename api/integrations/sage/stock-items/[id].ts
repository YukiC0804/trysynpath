import type { VercelRequest, VercelResponse } from '@vercel/node';
import { appendAudit } from '../../../_lib/audit';
import { json, requireMethod } from '../../../_lib/http';
import { getValidAccessToken } from '../../../_lib/sageAuth';
import { getStockItem, SageApiError, updateStockItem } from '../../../_lib/sageClient';

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (!requireMethod(req, res, ['GET', 'PUT'])) return;

  const id = typeof req.query.id === 'string' ? req.query.id : undefined;
  if (!id) return json(res, 400, { error: 'Stock item id is required' });

  try {
    const auth = await getValidAccessToken(req, res);
    if (!auth?.session.businessId) return json(res, 401, { error: 'Sage is not connected' });
    const businessId = auth.session.businessId;

    if (req.method === 'GET') {
      const item = await getStockItem(auth.accessToken, businessId, id);
      return json(res, 200, { item });
    }

    const body = typeof req.body === 'string' ? JSON.parse(req.body) : req.body;
    const before = await getStockItem(auth.accessToken, businessId, id);
    const updates: Record<string, string | number> = {};
    if (body.description != null) updates.description = String(body.description);
    if (body.cost_price != null || body.costPrice != null) {
      updates.cost_price = Number(body.cost_price ?? body.costPrice);
    }
    if (body.sales_price != null || body.salesPrice != null) {
      updates.sales_price = Number(body.sales_price ?? body.salesPrice);
    }
    if (body.reorder_level != null || body.reorderLevel != null) {
      updates.reorder_level = Number(body.reorder_level ?? body.reorderLevel);
    }
    if (body.reorder_quantity != null || body.reorderQuantity != null) {
      updates.reorder_quantity = Number(body.reorder_quantity ?? body.reorderQuantity);
    }
    if (body.supplier_part_number != null || body.supplierPartNumber != null) {
      updates.supplier_part_number = String(body.supplier_part_number ?? body.supplierPartNumber);
    }

    await updateStockItem(auth.accessToken, businessId, id, updates);
    const after = await getStockItem(auth.accessToken, businessId, id);

    const verification = {
      description: {
        expected: updates.description ?? before.description,
        actual: after.description,
        ok: String(updates.description ?? before.description) === String(after.description),
      },
      costPrice: {
        expected: Number(updates.cost_price ?? before.costPrice),
        actual: after.costPrice,
        ok: Number(updates.cost_price ?? before.costPrice) === Number(after.costPrice),
      },
      reorderLevel: {
        expected: Number(updates.reorder_level ?? before.reorderLevel),
        actual: after.reorderLevel,
        ok: Number(updates.reorder_level ?? before.reorderLevel) === Number(after.reorderLevel),
      },
    };

    const reorderRequired = after.quantityInStock < after.reorderLevel;

    appendAudit(req, res, {
      action: 'sage.stock_items.update',
      detail: `Updated stock item ${after.sku || id}`,
      status: 'success',
    });

    return json(res, 200, {
      before,
      after,
      verification,
      reorderRequired,
      message: reorderRequired ? 'Reorder Required' : 'Updated and verified in Sage',
    });
  } catch (error) {
    const status = error instanceof SageApiError ? error.status : 500;
    return json(res, status, { error: error instanceof Error ? error.message : 'Stock item update failed' });
  }
}
