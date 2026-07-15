import type { VercelRequest, VercelResponse } from '@vercel/node';
import { appendAudit, readAudit } from './audit';
import {
  beginOAuth,
  clearForceReauth,
  clearSession,
  exchangeCodeForTokens,
  getValidAccessToken,
  markForceReauth,
  readSession,
  revokeSageToken,
  SAGE_BROWSER_CLEAR_URL,
  SAGE_BROWSER_LOGOUT_URL,
  shouldForceLogin,
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
import { clearCookie, json, missingConfigResponse, parseCookies, sageConfigStatus } from './http';
import { COOKIE_OAUTH_STATE, SAGE_REQUIRED_ENV } from './types';

function segments(req: VercelRequest): string[] {
  // Preferred: path remainder injected by vercel.json rewrite.
  const rewritten = req.query.__sagePath;
  if (Array.isArray(rewritten) && rewritten.length > 0) {
    return rewritten.flatMap((part) => String(part).split('/')).filter(Boolean);
  }
  if (typeof rewritten === 'string' && rewritten.length > 0) {
    return rewritten.split('/').filter(Boolean);
  }

  // Legacy catch-all query param (if ever invoked as a directory route).
  const raw = req.query.path;
  if (Array.isArray(raw) && raw.length > 0) {
    return raw.flatMap((part) => String(part).split('/')).filter(Boolean);
  }
  if (typeof raw === 'string' && raw.length > 0) {
    return raw.split('/').filter(Boolean);
  }

  // Fallback: parse from the request URL.
  const pathname = (req.url ?? '').split('?')[0] ?? '';
  const markers = ['/api/integrations/sage/', '/api/sage/'];
  for (const marker of markers) {
    const idx = pathname.indexOf(marker);
    if (idx >= 0) {
      return pathname
        .slice(idx + marker.length)
        .split('/')
        .map((part) => decodeURIComponent(part))
        .filter(Boolean);
    }
  }

  if (/\/api\/(integrations\/)?sage\/?$/.test(pathname)) {
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

async function applyStockItemUpdate(
  req: VercelRequest,
  res: VercelResponse,
  accessToken: string,
  businessId: string,
  id: string,
  body: Record<string, unknown>,
) {
  const before = await getStockItem(accessToken, businessId, id);
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
  if (Object.keys(updates).length === 0) {
    return json(res, 400, { error: 'No updatable fields provided' });
  }
  await updateStockItem(accessToken, businessId, id, updates);
  const after = await getStockItem(accessToken, businessId, id);
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

      const stage = typeof req.query.stage === 'string' ? req.query.stage.toLowerCase() : '';
      const cookies = parseCookies(req);
      const ssoCleared = cookies.sage_sso_cleared === '1';

      // Drop any leftover app session so Connect always starts a fresh OAuth round-trip.
      clearSession(res);
      const forceLogin = shouldForceLogin(req) || stage === 'reauth';
      const { url } = beginOAuth(res, { forceLogin: true });

      // After a real Sage browser logout, skip the bounce and go straight to authorize.
      if (stage === 'authorize' || ssoCleared) {
        clearForceReauth(res);
        clearCookie(res, 'sage_sso_cleared');
        appendAudit(req, res, {
          action: 'sage.connect',
          detail: 'Redirecting to Sage OAuth authorize after SSO clear',
          status: 'info',
        });
        res.writeHead(302, { Location: url });
        return res.end();
      }

      if (forceLogin) {
        appendAudit(req, res, {
          action: 'sage.connect',
          detail: 'Starting Sage browser logout before OAuth (SSO cannot be cleared via iframe)',
          status: 'info',
        });
        // Sage blocks iframe logout (frame-ancestors: none). Use a popup for federated
        // logout, then continue to authorize on this tab. If the popup is blocked, fall
        // back to a full-page Sage logout; the user returns and Connect uses stage=authorize.
        res.statusCode = 200;
        res.setHeader('Content-Type', 'text/html; charset=utf-8');
        res.setHeader('Cache-Control', 'no-store');
        res.end(`<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>Reconnect Sage</title>
  <style>
    body{font-family:system-ui,sans-serif;background:#0a0a0a;color:#e5e5e5;display:flex;min-height:100vh;align-items:center;justify-content:center;margin:0}
    .box{max-width:420px;padding:24px;text-align:center}
    p{opacity:.85;font-size:14px;line-height:1.5}
    button{margin-top:16px;background:#fff;color:#111;border:0;border-radius:8px;padding:10px 16px;font-weight:600;cursor:pointer}
    a{color:#a78bfa}
  </style>
</head>
<body>
  <div class="box">
    <p id="msg">Opening Sage sign-out so you can choose an account…</p>
    <button type="button" id="continue" hidden>Continue to Sage login</button>
    <p id="hint" hidden style="margin-top:12px;font-size:12px;opacity:.65">
      If nothing opens, allow popups for this site, then click Continue.
      Or <a href="${SAGE_BROWSER_LOGOUT_URL}">sign out of Sage</a>, return here, and
      <a href="/api/integrations/sage/connect?stage=authorize&amp;force=1">Connect again</a>.
    </p>
  </div>
  <script>
    (function () {
      var authUrl = ${JSON.stringify(url)};
      var clearUrl = ${JSON.stringify(SAGE_BROWSER_CLEAR_URL)};
      var logoutUrl = ${JSON.stringify(SAGE_BROWSER_LOGOUT_URL)};
      var proceeded = false;
      function proceed() {
        if (proceeded) return;
        proceeded = true;
        document.cookie = 'sage_sso_cleared=1; Path=/; Max-Age=600; SameSite=Lax';
        window.location.replace(authUrl);
      }
      var popup = window.open(clearUrl, 'sage_reauth', 'width=520,height=720');
      if (!popup) {
        document.getElementById('msg').textContent =
          'Popup blocked. Sign out of Sage in this tab, then come back and Connect again.';
        document.getElementById('hint').hidden = false;
        document.getElementById('continue').hidden = false;
        document.getElementById('continue').onclick = function () {
          document.cookie = 'sage_sso_cleared=1; Path=/; Max-Age=600; SameSite=Lax';
          window.location.replace(logoutUrl);
        };
        return;
      }
      setTimeout(function () {
        try { popup.location = logoutUrl; } catch (e) {}
      }, 900);
      var ticks = 0;
      var timer = setInterval(function () {
        ticks += 1;
        var closed = false;
        try { closed = popup.closed; } catch (e) { closed = true; }
        if (closed || ticks >= 18) {
          clearInterval(timer);
          try { popup.close(); } catch (e) {}
          proceed();
        }
      }, 400);
      document.getElementById('continue').hidden = false;
      document.getElementById('continue').onclick = function () {
        try { popup.close(); } catch (e) {}
        proceed();
      };
      document.getElementById('hint').hidden = false;
    })();
  </script>
</body>
</html>`);
        return;
      }

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
        clearForceReauth(res);
        appendAudit(req, res, {
          action: 'sage.callback',
          detail: `Sage connected${business ? ` · ${business.name ?? business.displayed_as}` : ''}`,
          status: 'success',
        });
        res.writeHead(302, { Location: `${appBase}/sage-integration?connected=true` });
        return res.end();
      } catch (error) {
        clearSession(res);
        markForceReauth(res);
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
      const session = readSession(req);
      let revoked = false;
      if (session?.tokens) {
        const accessRevoked = await revokeSageToken(session.tokens.accessToken, session.country);
        const refreshRevoked = await revokeSageToken(session.tokens.refreshToken, session.country);
        revoked = accessRevoked || refreshRevoked;
      }
      clearSession(res);
      markForceReauth(res);
      appendAudit(req, res, {
        action: 'sage.disconnect',
        detail: revoked
          ? 'Sage tokens revoked and session cleared — redirecting to Sage browser logout'
          : 'Sage session cleared — redirecting to Sage browser logout',
        status: 'info',
      });

      const redirect =
        typeof req.query.redirect === 'string' ? req.query.redirect.toLowerCase() : '';
      // Full-page disconnect: leave Synpath and federated-logout of Sage so the next
      // Connect cannot silently reuse the previous SSO session.
      if (method === 'GET' && (redirect === 'logout' || redirect === '1' || redirect === 'true')) {
        const appBase = getEnv('APP_BASE_URL') ?? 'https://www.getsynpath-ai.com';
        res.writeHead(302, {
          Location: SAGE_BROWSER_LOGOUT_URL,
          // Soft hint for humans who inspect the response; browsers follow Location.
          'X-Synpath-Return': `${appBase}/sage-integration`,
        });
        return res.end();
      }

      return json(res, 200, {
        disconnected: true,
        requireReauth: true,
        revoked,
        logoutUrl: SAGE_BROWSER_LOGOUT_URL,
      });
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
        // Single-segment update avoids Vercel NOT_FOUND on nested /stock-items/:id paths.
        if (String(body.action ?? '').toLowerCase() === 'update') {
          const id = String(body.id ?? '').trim();
          if (!id) return json(res, 400, { error: 'id is required for stock item update' });
          return applyStockItemUpdate(req, res, auth.accessToken, businessId, id, body);
        }

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
          sales_ledger_account_id: body.sales_ledger_account_id
            ? String(body.sales_ledger_account_id)
            : body.salesLedgerAccountId
              ? String(body.salesLedgerAccountId)
              : undefined,
          purchase_ledger_account_id: body.purchase_ledger_account_id
            ? String(body.purchase_ledger_account_id)
            : body.purchaseLedgerAccountId
              ? String(body.purchaseLedgerAccountId)
              : undefined,
          sales_tax_rate_id: body.sales_tax_rate_id
            ? String(body.sales_tax_rate_id)
            : body.salesTaxRateId
              ? String(body.salesTaxRateId)
              : undefined,
          purchase_tax_rate_id: body.purchase_tax_rate_id
            ? String(body.purchase_tax_rate_id)
            : body.purchaseTaxRateId
              ? String(body.purchaseTaxRateId)
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

      // Nested /stock-items/update and /stock-items/:id after rewrite (optional).
      if (method === 'POST' && path[1] === 'update') {
        const body = parseBody(req);
        const id = String(body.id ?? '').trim();
        if (!id) return json(res, 400, { error: 'id is required' });
        return applyStockItemUpdate(req, res, auth.accessToken, businessId, id, body);
      }

      if (path.length === 2 && path[1] && path[1] !== 'update') {
        const id = decodeURIComponent(path[1]);
        if (method === 'GET') {
          const item = await getStockItem(auth.accessToken, businessId, id);
          return json(res, 200, { item });
        }
        if (method === 'PUT' || method === 'POST') {
          const body = parseBody(req);
          return applyStockItemUpdate(req, res, auth.accessToken, businessId, id, body);
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
