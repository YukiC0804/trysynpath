import type { VercelRequest, VercelResponse } from '@vercel/node';
import type { DemoPrepareResult } from '../../../shared/demoRun';
import { getValidAccessToken } from '../sage/auth';
import { json } from '../sage/http';
import { getPurchaseInvoice, getSalesInvoice, getStockItem } from '../sage/client';
import { FixtureDocumentExtractionAdapter } from '../workflow/extraction';
import {
  type ExecuteTarget,
  WorkflowOrchestrator,
} from '../workflow/orchestrator';
import {
  assertReleasedInvoice,
  formatReadBackDifferences,
  SageGateway,
} from '../workflow/sageGateway';
import { EncryptedCookieWorkflowStore } from '../workflow/store';
import { DeferredWorkflowStore } from '../workflow/deferredStore';
import { GmailSourceAdapter } from '../gmail/client';
import { getValidGmailAccessToken } from '../gmail/auth';
import { FixtureSourceAdapter, type SourceAdapter } from '../workflow/sourceAdapters';
import type { InventoryPostingStrategy, SafeMode } from '../../../shared/workflow';
import {
  appendDemoTransaction,
  captureBaseline,
  ensureLandedCostPrice,
  getCurrentDemoRun,
  restoreDemoBaseline,
} from './service';
import { bindDemoRunCookieContext, getDemoRun } from './store';
import { parseCookies } from '../sage/http';

const DEMO_RUN_COOKIE = 'synpath_demo_run_id';

function bodyOf(req: VercelRequest): Record<string, unknown> {
  if (!req.body) return {};
  if (typeof req.body === 'string') {
    const raw = req.body.trim();
    if (!raw) return {};
    if (raw[0] !== '{' && raw[0] !== '[') return {};
    try {
      return JSON.parse(raw) as Record<string, unknown>;
    } catch {
      return {};
    }
  }
  return req.body as Record<string, unknown>;
}

function readDemoRunCookie(req: VercelRequest) {
  return parseCookies(req)[DEMO_RUN_COOKIE];
}

async function resolveSource(
  req: VercelRequest,
  res: VercelResponse,
  mode: SafeMode,
  sourceType: 'gmail' | 'fixture',
): Promise<SourceAdapter> {
  if (mode === 'gmail_dry_run' || (mode === 'live_sage_write' && sourceType === 'gmail')) {
    const gmail = await getValidGmailAccessToken(req, res);
    if (!gmail) throw new Error('Connect Gmail before using Gmail source');
    return new GmailSourceAdapter(gmail.accessToken);
  }
  return new FixtureSourceAdapter();
}

function missingSkusFromPreview(lines: Array<{ sku: string; matchingStatus: string }>) {
  return lines
    .filter((line) => line.matchingStatus !== 'exact' && line.matchingStatus !== 'confirmed')
    .map((line) => line.sku);
}

export async function handleDemoRunRequest(
  req: VercelRequest,
  res: VercelResponse,
  path: string[],
) {
  const method = (req.method ?? 'GET').toUpperCase();
  const body = bodyOf(req);
  const cookieStore = new EncryptedCookieWorkflowStore();
  const store = new DeferredWorkflowStore(cookieStore, req);
  const orchestrator = new WorkflowOrchestrator(store);
  bindDemoRunCookieContext(req, res);

  const respond = (status: number, payload: unknown) => {
    // Flush buffered workflow cookies once, before the response is sent.
    store.flush(res);
    return json(res, status, payload);
  };

  const sage = await getValidAccessToken(req, res);

  // Reset remains clickable when Sage is disconnected — queue reconnect.
  if (method === 'POST' && path[0] === 'reset' && !sage?.session.businessId) {
    return respond(401, {
      error: 'Connect Sage to restore the demo baseline.',
      needsSage: true,
      resetRequested: true,
    });
  }

  if (!sage?.session.businessId) {
    return respond(401, { error: 'Connect Sage before using demo run controls' });
  }
  const businessId = sage.session.businessId;
  const gateway = new SageGateway(sage.accessToken, businessId);

  if (method === 'GET' && (path.length === 0 || path[0] === 'run')) {
    const cookieId = readDemoRunCookie(req);
    const fromCookie = cookieId ? await getDemoRun(cookieId) : null;
    const active = fromCookie ?? (await getCurrentDemoRun(businessId));
    return respond(200, { run: active });
  }

  if (method === 'POST' && path[0] === 'prepare') {
    const workflow = store.get(req);
    if (!workflow) return respond(404, { error: 'Create a workflow preview first' });
    const mode = (body.mode ?? workflow.mode) as SafeMode;
    const sourceType = body.sourceType === 'fixture' ? 'fixture' : 'gmail';
    const source = await resolveSource(req, res, mode, sourceType);
    const preview = await orchestrator.preview({
      mode,
      source,
      gateway,
      extractor: new FixtureDocumentExtractionAdapter(),
      existingRun: workflow,
      messageIds: Array.isArray(body.messageIds) ? body.messageIds.map(String) : undefined,
      searchQuery: typeof body.searchQuery === 'string' ? body.searchQuery : undefined,
      inventoryPostingStrategy: 'stock_movement',
      selections: {
        ...(typeof body.selections === 'object' && body.selections
          ? (body.selections as Record<string, unknown>)
          : {}),
        accountingMappingConfirmed: true,
      },
    });
    const missingSkus = missingSkusFromPreview(preview.bundle.shipment.lines);
    const stockItems = await Promise.all(
      preview.bundle.shipment.lines.map(async (line) => {
        if (!line.matchedSageStockItemId) {
          return {
            sku: line.sku,
            description: line.description,
            quantityInStock: 0,
            costPrice: 0,
            lastCostPrice: 0,
            averageCostPrice: 0,
            exists: false,
          };
        }
        const stock = await getStockItem(
          sage.accessToken,
          businessId,
          line.matchedSageStockItemId,
        );
        return {
          sku: line.sku,
          description: stock.description,
          quantityInStock: stock.quantityInStock,
          costPrice: stock.costPrice,
          lastCostPrice: stock.lastCostPrice,
          averageCostPrice: stock.averageCostPrice,
          exists: true,
        };
      }),
    );
    const result: DemoPrepareResult = {
      ready: missingSkus.length === 0,
      demoRunReferencePreview: `DEMO-GHOACRUGOL051926-PENDING`,
      missingSkus,
      stockItems,
    };
    return respond(200, result);
  }

  if (method === 'POST' && path[0] === 'purchase') {
    const workflow = store.get(req);
    if (!workflow) return respond(404, { error: 'Create a workflow preview first' });
    if (workflow.mode !== 'live_sage_write') {
      return respond(422, { error: 'Sage must be connected for live purchase posting' });
    }

    const sourceType =
      body.sourceType === 'fixture' || workflow.sourceType === 'fixture' ? 'fixture' : 'gmail';
    const source = await resolveSource(req, res, workflow.mode, sourceType);
    const previewOptions = {
      mode: workflow.mode,
      source,
      gateway,
      extractor: new FixtureDocumentExtractionAdapter(),
      existingRun: workflow,
      messageIds: Array.isArray(body.messageIds) ? body.messageIds.map(String) : undefined,
      searchQuery: typeof body.searchQuery === 'string' ? body.searchQuery : undefined,
      inventoryPostingStrategy: 'stock_movement' as InventoryPostingStrategy,
      selections: {
        ...(typeof body.selections === 'object' && body.selections
          ? (body.selections as Record<string, unknown>)
          : {}),
        accountingMappingConfirmed: true,
      },
    };

    let preview = await orchestrator.preview(previewOptions);
    const missingSkus = missingSkusFromPreview(preview.bundle.shipment.lines);
    if (missingSkus.length) {
      return respond(422, {
        error: 'The following SKU must be prepared in Sage before continuing.',
        missingSkus,
      });
    }
    if (!preview.reconciliation.withinTolerance) {
      return respond(422, { error: 'Landed-cost totals do not reconcile' });
    }

    const affected = await Promise.all(
      preview.bundle.shipment.lines.map((line) =>
        getStockItem(sage.accessToken, businessId, line.matchedSageStockItemId!),
      ),
    );
    const qtyBefore = new Map(
      affected.map((item) => [item.id, item.quantityInStock] as const),
    );

    let demoRun = await getCurrentDemoRun(businessId);
    if (!demoRun || demoRun.status === 'reset_complete') {
      demoRun = await captureBaseline({
        sageBusinessId: businessId,
        workflowRunId: workflow.id,
        externalPoReference: preview.bundle.shipment.externalPoNumber,
        vendorInvoiceReference: preview.bundle.shipment.vendorInvoiceNumber,
        customerInvoiceReference: preview.bundle.customerInvoice.sourceInvoiceNumber,
        stockItems: affected,
      });
    }

    // Drop stale cookie posting records from a prior demo reference so Workflow 2
    // cannot skip real Sage creates after Reset / a new baseline.
    const priorReference = workflow.externalReference;
    workflow.externalReference = demoRun.demoRunReference;
    if (priorReference !== demoRun.demoRunReference) {
      workflow.postingRecords = workflow.postingRecords.filter(
        (record) =>
          record.externalReference === demoRun!.demoRunReference ||
          record.externalReference.startsWith(`${demoRun!.demoRunReference}:`),
      );
      workflow.approvals.purchaseInvoice = 'pending';
      workflow.approvals.inventoryReceipt = 'pending';
      delete workflow.approvedPayloadHashes.purchaseInvoice;
      delete workflow.approvedPayloadHashes.inventoryReceipt;
    }
    store.put(res, workflow);
    preview = await orchestrator.preview({
      ...previewOptions,
      existingRun: workflow,
    });

    if (!preview.selections.supplierContactId) {
      return respond(422, {
        error: `Supplier "${preview.bundle.shipment.supplier}" was not matched in Sage. Create or rename the vendor contact, then reload Workflow 1.`,
      });
    }
    // Workflow 2 only needs purchase/inventory fields. Customer/sales selections are
    // validated later in Workflow 3 and must not block Purchase Invoice posting.
    const purchaseRequiredKeys = [
      'supplierContactId',
      'purchaseLedgerAccountId',
      'purchaseTaxRateId',
      'purchaseStatusId',
    ];
    const blocking = preview.validationErrors.filter((error) => {
      if (error.startsWith('Choose an inventory posting strategy')) return false;
      if (error.includes('Purchase Invoice payload total')) return false;
      if (error.includes('customer sale quantity')) return false;
      if (error.includes('Customer Invoice')) return false;
      if (error.includes('requires review')) {
        return purchaseRequiredKeys.some((key) => error.startsWith(`${key} `));
      }
      // Ignore sales-only mapping gaps during purchase posting.
      if (
        error.startsWith('customerContactId ') ||
        error.startsWith('salesLedgerAccountId ') ||
        error.startsWith('salesTaxRateId ') ||
        error.startsWith('salesStatusId ')
      ) {
        return false;
      }
      return true;
    });
    if (blocking.length) {
      return respond(422, {
        error: blocking[0],
        validationErrors: blocking,
      });
    }

    const confirmation = workflow.externalReference;
    let run = workflow;
    if (run.approvals.inventoryReceipt !== 'approved') {
      run = orchestrator.approve(
        res,
        run,
        'inventoryReceipt',
        confirmation,
        preview.approvalDigests.inventoryReceipt,
        'stock_movement',
      );
    }
    preview = await orchestrator.preview({
      ...previewOptions,
      existingRun: run,
    });
    if (run.approvals.purchaseInvoice !== 'approved') {
      run = orchestrator.approve(
        res,
        run,
        'purchaseInvoice',
        confirmation,
        preview.approvalDigests.purchaseInvoice,
        'stock_movement',
      );
    }

    preview = await orchestrator.preview({ ...previewOptions, existingRun: run });

    const purchaseResult = await orchestrator.execute(
      res,
      run,
      preview,
      gateway,
      'purchase_invoice' as ExecuteTarget,
    );
    run = purchaseResult.run;
    const purchaseRecord = [...purchaseResult.run.postingRecords]
      .reverse()
      .find((record) => record.transactionType === 'purchase_invoice');
    if (!purchaseRecord || purchaseRecord.status !== 'succeeded' || !purchaseRecord.readBackVerified) {
      const diffDetail = formatReadBackDifferences(
        (purchaseRecord?.differences as Record<string, unknown> | undefined) ?? {},
      );
      return respond(422, {
        error: diffDetail
          ? `Purchase Invoice could not be verified in Sage (${diffDetail})`
          : purchaseRecord?.error ||
            'Purchase Invoice could not be created or verified in Sage',
        demoRun,
        run: purchaseResult.run,
        differences: purchaseRecord?.differences,
      });
    }
    if (!purchaseRecord.sageTransactionId || purchaseRecord.sageTransactionId.startsWith('DRY-')) {
      return respond(422, {
        error: 'Purchase Invoice was not written to live Sage. Reconnect Sage and retry Workflow 2.',
        demoRun,
        run: purchaseResult.run,
      });
    }
    try {
      const livePi = await getPurchaseInvoice(
        sage.accessToken,
        businessId,
        purchaseRecord.sageTransactionId,
      );
      if (!String(livePi?.id ?? '')) {
        throw new Error('Purchase Invoice read-back returned no id');
      }
    } catch (error) {
      return respond(422, {
        error:
          error instanceof Error
            ? error.message
            : 'Purchase Invoice could not be found in Sage after posting. Use Reset Demo and retry Workflow 2.',
        demoRun,
        run: purchaseResult.run,
      });
    }

    // Sage UK creates Draft artefacts; release them so they appear in the normal
    // Purchase Invoices list (Awaiting Payment), not only under Draft.
    preview = await orchestrator.preview({ ...previewOptions, existingRun: run });
    if (run.approvals.purchaseInvoiceRelease !== 'approved') {
      run = orchestrator.approve(
        res,
        run,
        'purchaseInvoiceRelease',
        confirmation,
        preview.approvalDigests.purchaseInvoiceRelease,
        'stock_movement',
      );
    }
    preview = await orchestrator.preview({ ...previewOptions, existingRun: run });
    const purchaseReleaseResult = await orchestrator.execute(
      res,
      run,
      preview,
      gateway,
      'purchase_invoice_release' as ExecuteTarget,
    );
    run = purchaseReleaseResult.run;
    const purchaseReleaseRecord = [...purchaseReleaseResult.run.postingRecords]
      .reverse()
      .find((record) => record.transactionType === 'purchase_invoice_release');
    if (
      !purchaseReleaseRecord ||
      purchaseReleaseRecord.status !== 'succeeded' ||
      !purchaseReleaseRecord.readBackVerified
    ) {
      return respond(422, {
        error:
          purchaseReleaseRecord?.error ||
          'Purchase Invoice was created as Draft but could not be released in Sage.',
        demoRun,
        run: purchaseReleaseResult.run,
      });
    }
    try {
      const releasedPi = await getPurchaseInvoice(
        sage.accessToken,
        businessId,
        purchaseRecord.sageTransactionId,
      );
      assertReleasedInvoice(releasedPi, 'Purchase Invoice');
    } catch (error) {
      return respond(422, {
        error:
          error instanceof Error
            ? error.message
            : 'Purchase Invoice is still Draft in Sage after release.',
        demoRun,
        run: purchaseReleaseResult.run,
      });
    }

    demoRun = await appendDemoTransaction(demoRun.id, {
      type: 'purchase_invoice',
      sageTransactionId: purchaseRecord.sageTransactionId,
      externalReference: demoRun.demoRunReference,
      status: 'succeeded',
      requestSummary: purchaseRecord.requestPayload as Record<string, unknown>,
      readBackSummary: purchaseRecord.responseSummary as Record<string, unknown>,
      readBackVerified: purchaseRecord.readBackVerified,
      createdAt: purchaseRecord.createdAt,
    });

    preview = await orchestrator.preview({ ...previewOptions, existingRun: run });
    const inventoryResult = await orchestrator.execute(
      res,
      run,
      preview,
      gateway,
      'stock_movements' as ExecuteTarget,
    );
    run = inventoryResult.run;

    for (const record of inventoryResult.run.postingRecords.filter(
      (item) => item.transactionType === 'stock_movement' && item.status === 'succeeded',
    )) {
      demoRun = await appendDemoTransaction(demoRun.id, {
        type: 'stock_movement',
        sageTransactionId: record.sageTransactionId,
        externalReference: record.externalReference,
        status: 'succeeded',
        requestSummary: record.requestPayload as Record<string, unknown>,
        readBackSummary: record.responseSummary as Record<string, unknown>,
        readBackVerified: record.readBackVerified,
        createdAt: record.createdAt,
      });
      const stockItemId = String(
        (record.requestPayload as { stock_item_id?: string }).stock_item_id ?? '',
      );
      const landed = Number(
        (record.requestPayload as { cost_price?: number }).cost_price ?? 0,
      );
      if (stockItemId) {
        await ensureLandedCostPrice({
          accessToken: sage.accessToken,
          businessId,
          demoRunId: demoRun.id,
          stockItemId,
          landedUnitCost: landed,
          externalReference: demoRun.demoRunReference,
        });
      }
    }

    const failedMovements = inventoryResult.run.postingRecords.some(
      (record) => record.transactionType === 'stock_movement' && record.status === 'failed',
    );
    const succeededMovements = inventoryResult.run.postingRecords.filter(
      (record) => record.transactionType === 'stock_movement' && record.status === 'succeeded',
    );
    if (!succeededMovements.length) {
      const movementError = inventoryResult.run.postingRecords.find(
        (record) => record.transactionType === 'stock_movement' && record.status === 'failed',
      )?.error;
      return respond(422, {
        error:
          movementError ||
          'Stock Movements were not created in Sage. Purchase Invoice may exist as a draft — use Reset Demo before retrying.',
        demoRun,
        run: inventoryResult.run,
        partial: Boolean(purchaseRecord.sageTransactionId),
      });
    }

    const qtyMismatches: string[] = [];
    for (const line of preview.bundle.shipment.lines) {
      const stockId = line.matchedSageStockItemId;
      if (!stockId) continue;
      const after = await getStockItem(sage.accessToken, businessId, stockId);
      const beforeQty = qtyBefore.get(stockId) ?? 0;
      const expected = beforeQty + line.receivedQuantity;
      if (Math.abs(after.quantityInStock - expected) > 0.01) {
        qtyMismatches.push(
          `${line.sku}: expected quantity ${expected}, Sage has ${after.quantityInStock}`,
        );
      }
    }
    if (qtyMismatches.length) {
      // Movements already have Sage IDs — do not fail the whole Workflow 2.
      // Quantity lag can happen on retries or delayed Sage stock aggregates.
      console.warn('[demo/purchase] quantity mismatch after stock movements', qtyMismatches);
    }

    demoRun = (await getDemoRun(demoRun.id))!;

    const beforeAfter = demoRun.baseline.map((item) => ({
      sku: item.itemCode,
      previousQuantity: item.quantityInStock,
      newQuantity: item.afterQuantityInStock ?? item.quantityInStock,
      previousCost: item.costPrice,
      newLandedCost: item.afterCostPrice ?? item.costPrice,
    }));

    const movementError = inventoryResult.run.postingRecords.find(
      (record) => record.transactionType === 'stock_movement' && record.status === 'failed',
    )?.error;

    // Prefer HTTP 200 when PI + at least one movement succeeded so the UI can
    // advance; surface partial via flag instead of a hard 422.
    if (failedMovements && succeededMovements.length) {
      return respond(200, {
        demoRun,
        run: inventoryResult.run,
        beforeAfter,
        purchaseInvoiceId: purchaseRecord.sageTransactionId,
        partial: true,
        error:
          movementError ||
          'Partial Completion. Some inventory records need attention.',
      });
    }

    return respond(failedMovements ? 422 : 200, {
      demoRun,
      run: inventoryResult.run,
      beforeAfter,
      purchaseInvoiceId: purchaseRecord.sageTransactionId,
      partial: failedMovements,
      error: failedMovements
        ? movementError ||
          'Partial Completion. Some inventory records need attention.'
        : undefined,
    });
  }

  if (method === 'POST' && path[0] === 'sales') {
    const workflow = store.get(req);
    if (!workflow) return respond(404, { error: 'Create a workflow preview first' });
    const demoRun =
      (readDemoRunCookie(req) ? await getDemoRun(readDemoRunCookie(req)!) : null) ??
      (await getCurrentDemoRun(businessId));
    if (!demoRun) {
      return respond(404, { error: 'Capture a purchase demo run before creating a Sales Invoice' });
    }

    const sourceType =
      body.sourceType === 'fixture' || workflow.sourceType === 'fixture' ? 'fixture' : 'gmail';
    const source = await resolveSource(req, res, workflow.mode, sourceType);
    const previewOptions = {
      mode: workflow.mode,
      source,
      gateway,
      extractor: new FixtureDocumentExtractionAdapter(),
      existingRun: workflow,
      messageIds: Array.isArray(body.messageIds) ? body.messageIds.map(String) : undefined,
      searchQuery: typeof body.searchQuery === 'string' ? body.searchQuery : undefined,
      inventoryPostingStrategy: 'stock_movement' as InventoryPostingStrategy,
      selections: {
        accountingMappingConfirmed: true,
        ...(typeof body.selections === 'object' && body.selections
          ? (body.selections as Record<string, unknown>)
          : {}),
      },
    };
    let preview = await orchestrator.preview(previewOptions);
    let run = workflow;
    if (run.approvals.customerSale !== 'approved') {
      run = orchestrator.approve(
        res,
        run,
        'customerSale',
        run.externalReference,
        preview.approvalDigests.customerSale,
        'stock_movement',
      );
    }
    preview = await orchestrator.preview({ ...previewOptions, existingRun: run });
    const salesResult = await orchestrator.execute(
      res,
      run,
      preview,
      gateway,
      'sales_invoice' as ExecuteTarget,
    );
    run = salesResult.run;
    const salesRecord = [...salesResult.run.postingRecords]
      .reverse()
      .find((record) => record.transactionType === 'sales_invoice');
    if (!salesRecord || salesRecord.status !== 'succeeded' || !salesRecord.readBackVerified) {
      const diffDetail = formatReadBackDifferences(
        (salesRecord?.differences as Record<string, unknown> | undefined) ?? {},
      );
      return respond(422, {
        error: diffDetail
          ? `Sales Invoice could not be verified in Sage (${diffDetail})`
          : salesRecord?.error || 'Sales Invoice could not be created or verified in Sage',
        demoRun,
        run: salesResult.run,
        differences: salesRecord?.differences,
      });
    }
    if (!salesRecord.sageTransactionId || salesRecord.sageTransactionId.startsWith('DRY-')) {
      return respond(422, {
        error: 'Sales Invoice was not written to live Sage. Reconnect Sage and retry Workflow 3.',
        demoRun,
        run: salesResult.run,
      });
    }
    try {
      const liveSi = await getSalesInvoice(
        sage.accessToken,
        businessId,
        salesRecord.sageTransactionId,
      );
      if (!String(liveSi?.id ?? '')) {
        throw new Error('Sales Invoice read-back returned no id');
      }
    } catch (error) {
      return respond(422, {
        error:
          error instanceof Error
            ? error.message
            : 'Sales Invoice could not be found in Sage after posting. Use Reset Demo and retry Workflow 3.',
        demoRun,
        run: salesResult.run,
      });
    }

    preview = await orchestrator.preview({ ...previewOptions, existingRun: run });
    if (run.approvals.salesInvoiceRelease !== 'approved') {
      run = orchestrator.approve(
        res,
        run,
        'salesInvoiceRelease',
        run.externalReference,
        preview.approvalDigests.salesInvoiceRelease,
        'stock_movement',
      );
    }
    preview = await orchestrator.preview({ ...previewOptions, existingRun: run });
    const salesReleaseResult = await orchestrator.execute(
      res,
      run,
      preview,
      gateway,
      'sales_invoice_release' as ExecuteTarget,
    );
    run = salesReleaseResult.run;
    const salesReleaseRecord = [...salesReleaseResult.run.postingRecords]
      .reverse()
      .find((record) => record.transactionType === 'sales_invoice_release');
    if (
      !salesReleaseRecord ||
      salesReleaseRecord.status !== 'succeeded' ||
      !salesReleaseRecord.readBackVerified
    ) {
      return respond(422, {
        error:
          salesReleaseRecord?.error ||
          'Sales Invoice was created as Draft but could not be released in Sage.',
        demoRun,
        run: salesReleaseResult.run,
      });
    }
    try {
      const releasedSi = await getSalesInvoice(
        sage.accessToken,
        businessId,
        salesRecord.sageTransactionId,
      );
      assertReleasedInvoice(releasedSi, 'Sales Invoice');
    } catch (error) {
      return respond(422, {
        error:
          error instanceof Error
            ? error.message
            : 'Sales Invoice is still Draft in Sage after release.',
        demoRun,
        run: salesReleaseResult.run,
      });
    }

    const updated = await appendDemoTransaction(demoRun.id, {
      type: 'sales_invoice',
      sageTransactionId: salesRecord.sageTransactionId,
      externalReference: salesRecord.externalReference,
      status: 'succeeded',
      requestSummary: salesRecord.requestPayload as Record<string, unknown>,
      readBackSummary: salesRecord.responseSummary as Record<string, unknown>,
      readBackVerified: salesRecord.readBackVerified,
      createdAt: salesRecord.createdAt,
    });
    return respond(200, {
      demoRun: updated,
      run: salesReleaseResult.run,
      salesInvoiceId: salesRecord.sageTransactionId,
      salesInvoiceReference: salesRecord.externalReference,
    });
  }

  if (method === 'POST' && path[0] === 'reset') {
    const confirmation = String(body.confirmation ?? 'RESET');
    const cookieId = readDemoRunCookie(req);
    const activeDemoRunId =
      (typeof body.demoRunId === 'string' ? body.demoRunId : undefined) ??
      cookieId ??
      undefined;
    const result = await restoreDemoBaseline({
      accessToken: sage.accessToken,
      businessId,
      confirmation,
      activeDemoRunId,
    });
    // Always clear workflow cookie so the next demo cannot idempotently reuse
    // stale Purchase Invoice / Stock Movement posting records.
    store.clear(res);
    return respond(result.status === 'ready' ? 200 : 422, {
      demoRun: result.demoRun,
      message: result.message,
      unresolved: result.unresolved,
      summary: result.summary,
    });
  }

  return respond(404, { error: 'Unknown demo-run route', path });
}
