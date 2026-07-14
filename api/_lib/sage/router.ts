import type { VercelRequest, VercelResponse } from '@vercel/node';
import { appendAudit, readAudit } from './audit';
import {
  beginOAuth,
  clearSession,
  exchangeCodeForTokens,
  getValidAccessToken,
  readSession,
  validateOAuthState,
  writeSession,
} from './auth';
import {
  createStockItem,
  discoverCapabilities,
  findStockItemBySku,
  getStockItem,
  listBusinesses,
  listLedgerAccounts,
  listStockItems,
  listSuppliers,
  listTaxRates,
  pickAccountingBusiness,
  SageApiError,
  updateStockItem,
} from './client';
import { envPresence, errorMessage, getEnv } from './config';
import { clearCookie, json, missingConfigResponse, sageConfigStatus } from './http';
import { COOKIE_OAUTH_STATE, SAGE_REQUIRED_ENV } from './types';

function segments(req: VercelRequest): string[] {
  // Prefer catch-all query param when Vercel provides it.
  const raw = req.query.path;
  if (Array.isArray(raw) && raw.length > 0) {
    return raw.flatMap((part) => String(part).split('/')).filter(Boolean);
  }
  if (typeof raw === 'string' && raw.length > 0) {
    return raw.split('/').filter(Boolean);
  }

  // Fallback: parse from the request URL. Some Vercel Node runtimes leave
  // req.query.path empty for nested catch-all files even when the URL has segments.
  const pathname = (req.url ?? '').split('?')[0] ?? '';
  const marker = '/api/integrations/sage/';
  const idx = pathname.indexOf(marker);
  if (idx >= 0) {
    return pathname
      .slice(idx + marker.length)
      .split('/')
      .map((part) => decodeURIComponent(part))
      .filter(Boolean);
  }

  // Exact /api/integrations/sage with no trailing segment.
  if (/\/api\/integrations\/sage\/?$/.test(pathname)) {
    return [];
  }

  return [];
}

function parseBody(req: VercelRequest): Record<string, unknown> {
  if (!req.body) return {};
  if (typeof req.body === 'string') {
    try {
      return JSON.parse(req.body) as Record<string, unknown>;
    } catch {
      return {};
    }
  }
  return req.body as Record<string, unknown>;
}

async function requireAuth(req: VercelRequest, res: VercelResponse) {
  const config = sageConfigStatus();
  if (!config.configured) {
    missingConfigResponse(res, config.missing);
    return null;
  }
  try {
    const auth = await getValidAccessToken(req, res);
    if (!auth?.session.businessId) {
      json(res, 401, { error: 'Sage is not connected' });
      return null;
    }
    return auth;
  } catch (error) {
    json(res, 500, { error: errorMessage(error) });
    return null;
  }
}

export async function handleSageRequest(req: VercelRequest, res: VercelResponse) {
  const method = req.method ?? 'GET';
  let path = segments(req);

  try {
    // Empty path → treat GET as health so /api/integrations/sage is never a dead end.
    if (method === 'GET' && path.length === 0) {
      path = ['health'];
    }

    // Health: never throws from missing secrets; only reports presence.
    if (method === 'GET' && path[0] === 'health') {
      const { present, missing, configured, redeployHint } = envPresence(SAGE_REQUIRED_ENV);
      return json(res, 200, {
        ok: true,
        service: 'sage-integration',
        configured,
        env: present,
        missing,
        redeployHint: missing.length ? redeployHint : undefined,
      });
    }

    if (method === 'GET' && path[0] === 'capabilities') {
      return json(res, 200, { capabilities: discoverCapabilities() });
    }

    if (method === 'GET' && path[0] === 'audit') {
      return json(res, 200, { entries: readAudit(req) });
    }

    if (method === 'GET' && path[0] === 'status') {
      const config = sageConfigStatus();
      const session = readSession(req);
      let connected = false;
      try {
        const valid = await getValidAccessToken(req, res);
        connected = Boolean(valid?.session.tokens.accessToken);
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

    if (method === 'GET' && path[0] === 'connect') {
      const config = sageConfigStatus();
      if (!config.configured) {
        appendAudit(req, res, {
          action: 'sage.connect',
          detail: 'Sage OAuth is not configured for this environment',
          status: 'warning',
        });
        return missingConfigResponse(res, config.missing);
      }
      const { url } = beginOAuth(res);
      appendAudit(req, res, {
        action: 'sage.connect',
        detail: 'Redirecting to Sage OAuth authorization',
        status: 'info',
      });
      res.writeHead(302, { Location: url });
      return res.end();
    }

    if (method === 'GET' && path[0] === 'callback') {
      const config = sageConfigStatus();
      const appBase = getEnv('APP_BASE_URL') ?? 'https://www.getsynpath-ai.com';

      if (!config.configured) {
        return missingConfigResponse(res, config.missing);
      }

      const code = typeof req.query.code === 'string' ? req.query.code : undefined;
      const state = typeof req.query.state === 'string' ? req.query.state : undefined;
      const oauthError = typeof req.query.error === 'string' ? req.query.error : undefined;

      if (oauthError) {
        appendAudit(req, res, {
          action: 'sage.callback',
          detail: `Sage authorization denied: ${oauthError}`,
          status: 'error',
        });
        res.writeHead(302, { Location: `${appBase}/sage-integration?connected=false&error=denied` });
        return res.end();
      }

      if (!code) {
        return json(res, 400, {
          error: 'Missing OAuth authorization code. Start again from /api/integrations/sage/connect.',
          hint: 'This endpoint exchanges a Sage authorization code for tokens. It is not a 404.',
        });
      }

      if (!validateOAuthState(req, state)) {
        appendAudit(req, res, {
          action: 'sage.callback',
          detail: 'Invalid or missing OAuth state',
          status: 'error',
        });
        return json(res, 400, { error: 'Invalid OAuth state. Restart the Sage connection.' });
      }

      try {
        const tokens = await exchangeCodeForTokens(code);
        const businesses = await listBusinesses(tokens.accessToken);
        const business = pickAccountingBusiness(businesses);
        writeSession(res, {
          tokens,
          businessId: business?.id,
          businessName: business?.name ?? business?.displayed_as,
          businessType:
            typeof business?.business_type === 'string'
              ? business.business_type
              : business?.business_type?.id,
          connectedAt: new Date().toISOString(),
          country: business?.country,
        });
        clearCookie(res, COOKIE_OAUTH_STATE);
        appendAudit(req, res, {
          action: 'sage.callback',
          detail: `Sage connected${business ? ` · ${business.name ?? business.displayed_as}` : ''}`,
          status: 'success',
        });
        res.writeHead(302, { Location: `${appBase}/sage-integration?connected=true` });
        return res.end();
      } catch (error) {
        clearSession(res);
        appendAudit(req, res, {
          action: 'sage.callback',
          detail: errorMessage(error),
          status: 'error',
        });
        res.writeHead(302, {
          Location: `${appBase}/sage-integration?connected=false&error=token_exchange`,
        });
        return res.end();
      }
    }

    if ((method === 'POST' || method === 'GET') && path[0] === 'disconnect') {
      clearSession(res);
      appendAudit(req, res, {
        action: 'sage.disconnect',
        detail: 'Sage session cleared',
        status: 'info',
      });
      return json(res, 200, { disconnected: true });
    }

    if (method === 'GET' && path[0] === 'businesses') {
      const auth = await requireAuth(req, res);
      if (!auth) return;
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
              type:
                typeof selected.business_type === 'string'
                  ? selected.business_type
                  : selected.business_type?.id,
            }
          : null,
      });
    }

    if (path[0] === 'stock-items') {
      const auth = await requireAuth(req, res);
      if (!auth) return;
      const businessId = auth.session.businessId!;

      if (method === 'GET' && path.length === 1) {
        const sku = typeof req.query.sku === 'string' ? req.query.sku : undefined;
        if (sku) {
          const item = await findStockItemBySku(auth.accessToken, businessId, sku);
          return json(res, 200, { item });
        }
        const items = await listStockItems(auth.accessToken, businessId);
        appendAudit(req, res, {
          action: 'sage.stock_items.list',
          detail: `Retrieved ${items.length} stock item(s)`,
          status: 'success',
        });
        return json(res, 200, { items });
      }

      if (method === 'POST' && path.length === 1) {
        const body = parseBody(req);
        const sku = String(body.item_code ?? body.sku ?? '').trim();
        if (!sku) return json(res, 400, { error: 'item_code is required' });
        const existing = await findStockItemBySku(auth.accessToken, businessId, sku);
        if (existing) {
          return json(res, 409, {
            error: `Stock Item with SKU ${sku} already exists`,
            item: existing,
          });
        }
        const created = await createStockItem(auth.accessToken, businessId, {
          item_code: sku,
          description: String(body.description ?? ''),
          cost_price: Number(body.cost_price ?? body.costPrice ?? 0),
          sales_price: Number(body.sales_price ?? body.salesPrice ?? 0),
          reorder_level: Number(body.reorder_level ?? body.reorderLevel ?? 0),
          reorder_quantity: Number(body.reorder_quantity ?? body.reorderQuantity ?? 0),
          supplier_part_number: body.supplier_part_number
            ? String(body.supplier_part_number)
            : body.supplierPartNumber
              ? String(body.supplierPartNumber)
              : undefined,
          usual_supplier_id: body.usual_supplier_id
            ? String(body.usual_supplier_id)
            : body.usualSupplierId
              ? String(body.usualSupplierId)
              : undefined,
        });
        const verified = await findStockItemBySku(auth.accessToken, businessId, sku);
        const matches =
          verified &&
          verified.sku === created.sku &&
          Number(verified.costPrice) === Number(created.costPrice) &&
          verified.description === created.description;
        appendAudit(req, res, {
          action: 'sage.stock_items.create',
          detail: matches ? `Created and verified ${sku}` : `Created ${sku} (verification mismatch)`,
          status: matches ? 'success' : 'warning',
        });
        return json(res, 201, {
          item: verified ?? created,
          verified: Boolean(matches),
          message: matches
            ? 'Created and verified in Sage'
            : 'Created in Sage but verification mismatch',
        });
      }

      if (path.length === 2 && path[1]) {
        const id = path[1];
        if (method === 'GET') {
          const item = await getStockItem(auth.accessToken, businessId, id);
          return json(res, 200, { item });
        }
        if (method === 'PUT') {
          const body = parseBody(req);
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
            updates.supplier_part_number = String(
              body.supplier_part_number ?? body.supplierPartNumber,
            );
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
        }
      }
    }

    if (method === 'GET' && path[0] === 'suppliers') {
      const auth = await requireAuth(req, res);
      if (!auth) return;
      const suppliers = await listSuppliers(auth.accessToken, auth.session.businessId!);
      const acrylicOnly = suppliers.filter(
        (s) =>
          !/hmrc/i.test(s.name) &&
          (/(acrylic|plastics|nationwide|pacific|west coast)/i.test(s.name) ||
            /(NWA-003|PAC-ACRYLIC-001|WCP-002)/i.test(s.reference)),
      );
      return json(res, 200, {
        suppliers: acrylicOnly.length ? acrylicOnly : suppliers.filter((s) => !/hmrc/i.test(s.name)),
      });
    }

    if (method === 'GET' && path[0] === 'ledgers') {
      const auth = await requireAuth(req, res);
      if (!auth) return;
      const [ledgers, taxRates] = await Promise.all([
        listLedgerAccounts(auth.accessToken, auth.session.businessId!),
        listTaxRates(auth.accessToken, auth.session.businessId!),
      ]);
      return json(res, 200, { ledgers, taxRates });
    }

    if (method === 'POST' && path[0] === 'verify') {
      const auth = await requireAuth(req, res);
      if (!auth) return;
      const body = parseBody(req);
      const expected = (body.expected ?? {}) as Record<string, unknown>;
      const item =
        body.id != null
          ? await getStockItem(auth.accessToken, auth.session.businessId!, String(body.id))
          : body.sku
            ? await findStockItemBySku(auth.accessToken, auth.session.businessId!, String(body.sku))
            : null;
      if (!item) return json(res, 404, { error: 'Stock item not found for verification' });
      const fields = [
        'sku',
        'description',
        'costPrice',
        'salesPrice',
        'reorderLevel',
        'quantityInStock',
      ] as const;
      const results = fields
        .map((field) => {
          if (expected[field] === undefined) return null;
          const actual = item[field];
          const expectedValue = expected[field];
          const ok =
            typeof expectedValue === 'number' || typeof actual === 'number'
              ? Number(expectedValue) === Number(actual)
              : String(expectedValue) === String(actual);
          return { field, expected: expectedValue, actual, ok };
        })
        .filter(Boolean);
      const verified = results.every((r) => r && r.ok);
      return json(res, 200, {
        verified,
        item,
        results,
        message: verified ? 'Created and verified in Sage' : 'Verification mismatch',
      });
    }

    return json(res, 404, {
      error: 'Unknown Sage integration route',
      path,
      method,
      hint: 'Use /api/integrations/sage/health, /connect, /callback, /status, /stock-items, /suppliers',
    });
  } catch (error) {
    const status = error instanceof SageApiError ? error.status : 500;
    return json(res, status, { error: errorMessage(error) });
  }
}
