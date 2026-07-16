import type { VercelRequest, VercelResponse } from '@vercel/node';
import type {
  InventoryPostingStrategy,
  SafeMode,
} from '../../../shared/workflow';
import { getValidGmailAccessToken } from '../gmail/auth';
import { GmailSourceAdapter } from '../gmail/client';
import { getValidAccessToken } from '../sage/auth';
import { json } from '../sage/http';
import { FixtureDocumentExtractionAdapter, type ExtractionOverrides } from './extraction';
import { FixtureSourceAdapter, type SourceAdapter } from './sourceAdapters';
import {
  type ApprovalTarget,
  type ExecuteTarget,
  WorkflowOrchestrator,
} from './orchestrator';
import { SageGateway, type SagePayloadSelections } from './sageGateway';
import { EncryptedCookieWorkflowStore } from './store';

function pathSegments(req: VercelRequest): string[] {
  const raw = req.query.__workflowPath ?? req.query.__integrationPath ?? req.query.__sagePath;
  if (Array.isArray(raw)) return raw.flatMap((value) => String(value).split('/')).filter(Boolean);
  if (typeof raw === 'string') return raw.split('/').filter(Boolean);
  const marker = '/api/workflow/';
  const pathname = (req.url ?? '').split('?')[0] ?? '';
  const index = pathname.indexOf(marker);
  return index >= 0 ? pathname.slice(index + marker.length).split('/').filter(Boolean) : [];
}

function bodyOf(req: VercelRequest): Record<string, unknown> {
  if (!req.body) return {};
  if (typeof req.body === 'string') return JSON.parse(req.body || '{}') as Record<string, unknown>;
  return req.body as Record<string, unknown>;
}

function previewOptions(body: Record<string, unknown>) {
  return {
    mode: (body.mode ?? 'fixture_dry_run') as SafeMode,
    messageIds: Array.isArray(body.messageIds) ? body.messageIds.map(String) : undefined,
    searchQuery: typeof body.searchQuery === 'string' ? body.searchQuery : undefined,
    inventoryPostingStrategy: (body.inventoryPostingStrategy ?? 'none') as InventoryPostingStrategy,
    overrides: (body.overrides ?? {}) as ExtractionOverrides,
    selections: (body.selections ?? {}) as SagePayloadSelections & {
      accountingMappingConfirmed?: boolean;
    },
  };
}

async function dependencies(
  req: VercelRequest,
  res: VercelResponse,
  mode: SafeMode,
): Promise<{ source: SourceAdapter; gateway?: SageGateway }> {
  let source: SourceAdapter = new FixtureSourceAdapter();
  if (mode === 'gmail_dry_run' || (mode === 'live_sage_write' && bodySource(req) === 'gmail')) {
    const gmail = await getValidGmailAccessToken(req, res);
    if (!gmail) throw new Error('Connect Gmail before using Gmail source');
    source = new GmailSourceAdapter(gmail.accessToken);
  }
  const sage = await getValidAccessToken(req, res);
  const gateway =
    sage?.session.businessId
      ? new SageGateway(sage.accessToken, sage.session.businessId)
      : undefined;
  return { source, gateway };
}

function bodySource(req: VercelRequest) {
  const body = bodyOf(req);
  return body.sourceType === 'gmail' ? 'gmail' : 'fixture';
}

export async function handleWorkflowRequest(req: VercelRequest, res: VercelResponse) {
  const path = pathSegments(req);
  const method = (req.method ?? 'GET').toUpperCase();
  const body = bodyOf(req);
  const store = new EncryptedCookieWorkflowStore();
  const orchestrator = new WorkflowOrchestrator(store);

  if (method === 'GET' && (path.length === 0 || path[0] === 'status')) {
    return json(res, 200, { run: store.get(req) });
  }
  if (method === 'POST' && path[0] === 'reset') {
    store.clear(res);
    return json(res, 200, { reset: true });
  }

  if (method === 'POST' && path[0] === 'preview') {
    const options = previewOptions(body);
    const { source, gateway } = await dependencies(req, res, options.mode);
    const preview = await orchestrator.preview({
      ...options,
      source,
      gateway,
      extractor: new FixtureDocumentExtractionAdapter(),
      existingRun: store.get(req),
    });
    orchestrator.savePreviewRun(res, preview.run);
    return json(res, 200, preview);
  }

  if (method === 'POST' && path[0] === 'approve') {
    const run = store.get(req);
    if (!run) return json(res, 404, { error: 'Create a workflow preview first' });
    if (body.accountingMappingConfirmed !== true) {
      return json(res, 422, {
        error: 'Confirm the accounting ledger and tax mapping before approval',
      });
    }
    const target = String(body.target ?? '') as ApprovalTarget;
    const allowed: ApprovalTarget[] = [
      'purchaseInvoice',
      'inventoryReceipt',
      'customerSale',
      'purchaseInvoiceRelease',
      'salesInvoiceRelease',
    ];
    if (!allowed.includes(target)) return json(res, 400, { error: 'Invalid approval target' });
    try {
      const updated = orchestrator.approve(
        res,
        run,
        target,
        String(body.confirmation ?? ''),
        body.inventoryPostingStrategy as InventoryPostingStrategy | undefined,
      );
      return json(res, 200, { run: updated });
    } catch (error) {
      return json(res, 422, {
        error: error instanceof Error ? error.message : 'Approval failed',
      });
    }
  }

  if (method === 'POST' && path[0] === 'execute') {
    const run = store.get(req);
    if (!run) return json(res, 404, { error: 'Create a workflow preview first' });
    const target = String(body.target ?? '') as ExecuteTarget;
    const allowed: ExecuteTarget[] = [
      'purchase_invoice',
      'stock_movements',
      'sales_invoice',
      'purchase_invoice_release',
      'sales_invoice_release',
    ];
    if (!allowed.includes(target)) return json(res, 400, { error: 'Invalid execute target' });
    const { source, gateway } = await dependencies(req, res, run.mode);
    if (!gateway) return json(res, 401, { error: 'Sage is not connected' });
    const options = previewOptions({ ...body, mode: run.mode });
    const preview = await orchestrator.preview({
      ...options,
      inventoryPostingStrategy: run.inventoryPostingStrategy,
      source,
      gateway,
      extractor: new FixtureDocumentExtractionAdapter(),
      existingRun: run,
    });
    const blocking = preview.validationErrors.filter(
      (error) => !error.startsWith('Choose an inventory posting strategy'),
    );
    if (blocking.length) {
      return json(res, 422, { error: 'Workflow validation failed', validationErrors: blocking });
    }
    try {
      const result = await orchestrator.execute(res, run, preview, gateway, target);
      const refreshed = await gateway.loadReferenceData();
      preview.liveSage.stockItems = refreshed.stockItems.map((item) => ({
        id: item.id,
        itemCode: item.sku,
        description: item.description,
        quantityInStock: item.quantityInStock,
        costPrice: item.costPrice,
        lastCostPrice: item.lastCostPrice,
        averageCostPrice: item.averageCostPrice,
        purchaseLedgerAccountId: item.purchaseLedgerAccountId,
        purchaseTaxRateId: item.purchaseTaxRateId,
        salesLedgerAccountId: item.salesLedgerAccountId,
        salesTaxRateId: item.salesTaxRateId,
      }));
      return json(res, 200, { ...result, preview });
    } catch (error) {
      return json(res, 422, {
        error: error instanceof Error ? error.message : 'Sage write failed',
        run: store.get(req),
      });
    }
  }

  return json(res, 404, { error: 'Unknown workflow route', path });
}
