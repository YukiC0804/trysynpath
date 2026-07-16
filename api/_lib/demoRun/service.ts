import crypto from 'crypto';
import type {
  DemoRunRecord,
  DemoStockBaselineSnapshot,
  DemoTransactionRecord,
} from '../../../shared/demoRun';
import {
  GHOSTBOARDS_BASELINE_MOVEMENT_REFERENCE,
  GHOSTBOARDS_BASELINE_SKUS,
} from '../sage/demoBaseline';
import {
  createStockItem,
  createStockMovement,
  DEMO_INVOICE_VOID_REASON,
  deletePurchaseInvoice,
  deleteSalesInvoice,
  deleteStockMovement,
  findStockItemBySku,
  getPurchaseInvoice,
  getSalesInvoice,
  getStockItem,
  getStockMovement,
  listPurchaseInvoices,
  listSalesInvoices,
  listStockMovements,
  resolveStockItemDefaults,
  updateStockItem,
} from '../sage/client';
import { FIXTURE_REFERENCE } from '../workflow/fixtures';
import {
  clearActiveDemoRunPointer,
  getActiveDemoRunForBusiness,
  getDemoRun,
  saveDemoRun,
} from './store';

type NormalizedStock = {
  id: string;
  sku: string;
  description: string;
  quantityInStock: number;
  costPrice: number;
  lastCostPrice: number;
  averageCostPrice: number;
  salesPrice: number;
  raw?: Record<string, unknown>;
};

const COST_TOLERANCE = 0.01;
const QTY_TOLERANCE = 0.0001;

export type BaselineResetResult = {
  status: 'ready' | 'requires_review' | 'needs_sage';
  message: string;
  demoRun: DemoRunRecord | null;
  unresolved: string[];
  summary: {
    productsReady: boolean;
    inventoryRestored: boolean;
    costsRestored: boolean;
    transactionsReconciled: boolean;
  };
};

function nearlyEqual(a: number, b: number, tolerance = COST_TOLERANCE) {
  return Math.abs(a - b) <= tolerance;
}

function snapshotFromStock(item: NormalizedStock): DemoStockBaselineSnapshot {
  const raw = item.raw as Record<string, unknown> | undefined;
  const costPriceLastUpdated =
    typeof raw?.cost_price_last_updated === 'string'
      ? raw.cost_price_last_updated
      : undefined;
  return {
    sageStockItemId: item.id,
    itemCode: item.sku,
    description: item.description,
    quantityInStock: item.quantityInStock,
    costPrice: item.costPrice,
    lastCostPrice: item.lastCostPrice,
    averageCostPrice: item.averageCostPrice,
    salesPrice: item.salesPrice,
    costPriceLastUpdated,
    snapshotAt: new Date().toISOString(),
    costPriceExplicitlyUpdated: false,
  };
}

export function buildDemoRunReference(runId: string) {
  return `DEMO-${FIXTURE_REFERENCE}-${runId.slice(0, 8).toUpperCase()}`;
}

export async function captureBaseline(input: {
  sageBusinessId: string;
  workflowRunId: string;
  externalPoReference: string;
  vendorInvoiceReference: string;
  customerInvoiceReference: string;
  stockItems: NormalizedStock[];
  demoRunReference?: string;
}): Promise<DemoRunRecord> {
  const existing = await getActiveDemoRunForBusiness(input.sageBusinessId);
  if (
    existing &&
    existing.status !== 'reset_complete' &&
    existing.transactions.some((tx) => tx.status === 'succeeded')
  ) {
    return existing;
  }

  const id = crypto.randomUUID();
  const now = new Date().toISOString();
  const record: DemoRunRecord = {
    id,
    demoRunReference: input.demoRunReference ?? buildDemoRunReference(id),
    workflowRunId: input.workflowRunId,
    sageBusinessId: input.sageBusinessId,
    externalPoReference: input.externalPoReference,
    vendorInvoiceReference: input.vendorInvoiceReference,
    customerInvoiceReference: input.customerInvoiceReference,
    status: 'baseline_captured',
    createdAt: now,
    updatedAt: now,
    baseline: input.stockItems.map(snapshotFromStock),
    transactions: [],
    resetLog: [],
    verification: { resetComplete: false, mismatches: [] },
  };
  await saveDemoRun(record);
  return record;
}

export async function appendDemoTransaction(
  demoRunId: string,
  transaction: DemoTransactionRecord,
) {
  const record = await getDemoRun(demoRunId);
  if (!record) throw new Error('Demo run not found');
  const withoutDup = record.transactions.filter(
    (item) =>
      !(
        item.type === transaction.type &&
        item.sageTransactionId === transaction.sageTransactionId &&
        item.status === 'succeeded'
      ),
  );
  withoutDup.push(transaction);
  record.transactions = withoutDup;
  if (transaction.type === 'purchase_invoice' && transaction.status === 'succeeded') {
    record.status = 'purchase_posted';
  }
  if (transaction.type === 'stock_movement' && transaction.status === 'succeeded') {
    record.status = 'inventory_posted';
  }
  if (transaction.type === 'sales_invoice' && transaction.status === 'succeeded') {
    record.status = 'sales_posted';
  }
  record.updatedAt = new Date().toISOString();
  await saveDemoRun(record);
  return record;
}

export async function markCostPriceUpdated(
  demoRunId: string,
  stockItemId: string,
  after: Pick<
    DemoStockBaselineSnapshot,
    'afterQuantityInStock' | 'afterCostPrice' | 'afterLastCostPrice' | 'afterAverageCostPrice'
  >,
) {
  const record = await getDemoRun(demoRunId);
  if (!record) throw new Error('Demo run not found');
  record.baseline = record.baseline.map((item) =>
    item.sageStockItemId === stockItemId
      ? { ...item, costPriceExplicitlyUpdated: true, ...after }
      : item,
  );
  record.updatedAt = new Date().toISOString();
  await saveDemoRun(record);
  return record;
}

export async function recordAfterStockState(
  demoRunId: string,
  stockItemId: string,
  after: {
    quantityInStock: number;
    costPrice: number;
    lastCostPrice: number;
    averageCostPrice: number;
  },
) {
  const record = await getDemoRun(demoRunId);
  if (!record) throw new Error('Demo run not found');
  record.baseline = record.baseline.map((item) =>
    item.sageStockItemId === stockItemId
      ? {
          ...item,
          afterQuantityInStock: after.quantityInStock,
          afterCostPrice: after.costPrice,
          afterLastCostPrice: after.lastCostPrice,
          afterAverageCostPrice: after.averageCostPrice,
        }
      : item,
  );
  record.updatedAt = new Date().toISOString();
  await saveDemoRun(record);
  return record;
}

export async function ensureLandedCostPrice(input: {
  accessToken: string;
  businessId: string;
  demoRunId: string;
  stockItemId: string;
  landedUnitCost: number;
  externalReference: string;
}) {
  const reloaded = await getStockItem(
    input.accessToken,
    input.businessId,
    input.stockItemId,
  );
  await recordAfterStockState(input.demoRunId, input.stockItemId, {
    quantityInStock: reloaded.quantityInStock,
    costPrice: reloaded.costPrice,
    lastCostPrice: reloaded.lastCostPrice,
    averageCostPrice: reloaded.averageCostPrice,
  });

  if (nearlyEqual(reloaded.costPrice, input.landedUnitCost)) {
    return { updated: false, item: reloaded };
  }

  const updated = await updateStockItem(
    input.accessToken,
    input.businessId,
    input.stockItemId,
    { cost_price: input.landedUnitCost },
  );
  const verified = await getStockItem(
    input.accessToken,
    input.businessId,
    input.stockItemId,
  );
  await appendDemoTransaction(input.demoRunId, {
    type: 'stock_item_cost_update',
    sageTransactionId: input.stockItemId,
    externalReference: input.externalReference,
    status: nearlyEqual(verified.costPrice, input.landedUnitCost) ? 'succeeded' : 'failed',
    requestSummary: { cost_price: input.landedUnitCost },
    readBackSummary: {
      costPrice: verified.costPrice,
      lastCostPrice: verified.lastCostPrice,
      averageCostPrice: verified.averageCostPrice,
      quantityInStock: verified.quantityInStock,
    },
    readBackVerified: nearlyEqual(verified.costPrice, input.landedUnitCost),
    createdAt: new Date().toISOString(),
  });
  await markCostPriceUpdated(input.demoRunId, input.stockItemId, {
    afterQuantityInStock: verified.quantityInStock,
    afterCostPrice: verified.costPrice,
    afterLastCostPrice: verified.lastCostPrice,
    afterAverageCostPrice: verified.averageCostPrice,
  });
  return { updated: true, item: updated };
}

function invoiceStatusText(invoice: Record<string, unknown> | null | undefined): string {
  if (!invoice) return '';
  const status = invoice.status;
  if (typeof status === 'string') return status;
  if (status && typeof status === 'object') {
    const record = status as { id?: unknown; displayed_as?: unknown };
    return String(record.id ?? record.displayed_as ?? '');
  }
  return String(invoice.status_id ?? '');
}

function isVoidLikeStatus(status: string): boolean {
  return Boolean(status) && /void/i.test(status);
}

async function readInvoiceStatus(
  kind: 'purchase' | 'sales',
  accessToken: string,
  businessId: string,
  id: string,
): Promise<{ gone: boolean; status: string }> {
  try {
    const readBack =
      kind === 'purchase'
        ? await getPurchaseInvoice(accessToken, businessId, id)
        : await getSalesInvoice(accessToken, businessId, id);
    return { gone: false, status: invoiceStatusText(readBack) };
  } catch (error) {
    const message = error instanceof Error ? error.message : '';
    if (/not found|404/i.test(message)) return { gone: true, status: '' };
    throw error;
  }
}

async function voidDemoInvoiceById(
  kind: 'purchase' | 'sales',
  accessToken: string,
  businessId: string,
  id: string,
): Promise<{ ok: boolean; status: string; detail?: string }> {
  if (kind === 'purchase') {
    return hardDeletePurchaseInvoiceById(accessToken, businessId, id);
  }

  const before = await readInvoiceStatus('sales', accessToken, businessId, id);
  if (before.gone || isVoidLikeStatus(before.status)) {
    return { ok: true, status: before.gone ? 'MISSING' : before.status };
  }

  try {
    await deleteSalesInvoice(accessToken, businessId, id);
  } catch (error) {
    const message = error instanceof Error ? error.message : 'sales invoice void failed';
    if (/not found|404|already/i.test(message)) {
      return { ok: true, status: 'MISSING', detail: message };
    }
    return { ok: false, status: before.status, detail: message };
  }

  const after = await readInvoiceStatus('sales', accessToken, businessId, id);
  if (after.gone || isVoidLikeStatus(after.status)) {
    return { ok: true, status: after.gone ? 'MISSING' : after.status };
  }
  return {
    ok: false,
    status: after.status || before.status,
    detail: `sales invoice still ${after.status || 'active'} after void`,
  };
}

/** Draft Purchase Invoices hard-delete (404). Released ones can only void — treat as failure. */
async function hardDeletePurchaseInvoiceById(
  accessToken: string,
  businessId: string,
  id: string,
): Promise<{ ok: boolean; status: string; detail?: string }> {
  const before = await readInvoiceStatus('purchase', accessToken, businessId, id);
  if (before.gone) return { ok: true, status: 'MISSING' };

  const tryDelete = async (voidReason?: string) => {
    try {
      await deletePurchaseInvoice(accessToken, businessId, id, voidReason);
      return null;
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Purchase Invoice delete failed';
      if (/not found|404|already/i.test(message)) return 'missing' as const;
      return message;
    }
  };

  // Prefer hard delete (no void_reason) so Draft invoices disappear from Sage.
  let deleteError = await tryDelete();
  if (deleteError === 'missing') return { ok: true, status: 'MISSING' };

  let after = await readInvoiceStatus('purchase', accessToken, businessId, id);
  if (after.gone) return { ok: true, status: 'MISSING' };

  // Leftover released invoices: Sage can only void them.
  if (deleteError || !isVoidLikeStatus(after.status)) {
    const voidError = await tryDelete(DEMO_INVOICE_VOID_REASON);
    if (voidError === 'missing') return { ok: true, status: 'MISSING' };
    after = await readInvoiceStatus('purchase', accessToken, businessId, id);
    if (after.gone) return { ok: true, status: 'MISSING' };
    if (isVoidLikeStatus(after.status)) {
      return {
        ok: false,
        status: after.status,
        detail: `could not hard-delete (Sage voided it instead as ${after.status}). Released Purchase Invoices cannot be removed — keep demo PIs as Draft.`,
      };
    }
    return {
      ok: false,
      status: after.status || before.status,
      detail: voidError || deleteError || `still ${after.status || 'active'} after delete`,
    };
  }

  return {
    ok: false,
    status: after.status || before.status,
    detail: `could not hard-delete (status ${after.status || before.status})`,
  };
}

async function voidSalesInvoices(
  accessToken: string,
  businessId: string,
  record: DemoRunRecord,
  unresolved: string[],
) {
  const sales = record.transactions.filter(
    (tx) => tx.type === 'sales_invoice' && ['succeeded', 'voided'].includes(tx.status),
  );
  for (const item of sales) {
    if (item.status === 'voided') continue;
    const result = await voidDemoInvoiceById(
      'sales',
      accessToken,
      businessId,
      item.sageTransactionId,
    );
    if (result.ok) {
      item.status = 'voided';
      item.cleanedAt = new Date().toISOString();
      item.readBackSummary = { status: result.status, afterDelete: true };
      record.resetLog.push(`Sales Invoice Voided (${item.sageTransactionId})`);
    } else {
      unresolved.push(
        `Sales Invoice ${item.sageTransactionId}: ${result.detail || 'void failed'}`,
      );
    }
  }
}

async function deleteDemoStockMovements(
  accessToken: string,
  businessId: string,
  record: DemoRunRecord,
  unresolved: string[],
) {
  const movements = record.transactions.filter(
    (tx) => tx.type === 'stock_movement' && ['succeeded', 'deleted'].includes(tx.status),
  );
  for (const movement of [...movements].reverse()) {
    if (movement.status === 'deleted') continue;
    // Never delete canonical baseline movements.
    if (movement.externalReference === GHOSTBOARDS_BASELINE_MOVEMENT_REFERENCE) continue;
    try {
      await deleteStockMovement(accessToken, businessId, movement.sageTransactionId);
      try {
        await getStockMovement(accessToken, businessId, movement.sageTransactionId);
        movement.readBackSummary = { stillPresent: true };
      } catch {
        movement.readBackSummary = { missingAfterDelete: true };
      }
      movement.status = 'deleted';
      movement.cleanedAt = new Date().toISOString();
      record.resetLog.push(`Stock Movement deleted (${movement.sageTransactionId})`);
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Stock Movement delete failed';
      if (/not found|404|already/i.test(message)) {
        movement.status = 'deleted';
        movement.cleanedAt = new Date().toISOString();
        record.resetLog.push(
          `Stock Movement already deleted (${movement.sageTransactionId})`,
        );
      } else {
        unresolved.push(`Stock Movement ${movement.sageTransactionId}: ${message}`);
      }
    }
  }
}

async function deleteDemoPurchaseInvoices(
  accessToken: string,
  businessId: string,
  record: DemoRunRecord,
  unresolved: string[],
) {
  const purchases = record.transactions.filter(
    (tx) =>
      tx.type === 'purchase_invoice' &&
      ['succeeded', 'deleted', 'voided'].includes(tx.status),
  );
  for (const purchase of purchases) {
    if (purchase.status === 'deleted') continue;
    const result = await hardDeletePurchaseInvoiceById(
      accessToken,
      businessId,
      purchase.sageTransactionId,
    );
    if (result.ok && result.status === 'MISSING') {
      purchase.status = 'deleted';
      purchase.cleanedAt = new Date().toISOString();
      purchase.readBackSummary = { status: 'MISSING', afterDelete: true };
      record.resetLog.push(`Purchase Invoice deleted (${purchase.sageTransactionId})`);
    } else {
      unresolved.push(
        `Purchase Invoice ${purchase.sageTransactionId} could not be deleted: ${
          result.detail || `status ${result.status}`
        }`,
      );
    }
  }
}

/** Catch orphan demo invoices when the demo-run transaction log is incomplete. */
async function voidOrphanDemoInvoicesByReference(
  accessToken: string,
  businessId: string,
  record: DemoRunRecord,
  unresolved: string[],
) {
  const reference = record.demoRunReference;
  if (!reference) return;

  try {
    const purchases = await listPurchaseInvoices(accessToken, businessId, reference);
    for (const invoice of purchases) {
      if (!invoice.id || isVoidLikeStatus(invoice.status)) continue;
      const tracked = record.transactions.some(
        (tx) =>
          tx.type === 'purchase_invoice' &&
          tx.sageTransactionId === invoice.id &&
          ['voided', 'deleted'].includes(tx.status),
      );
      if (tracked) continue;
      const result = await hardDeletePurchaseInvoiceById(
        accessToken,
        businessId,
        invoice.id,
      );
      if (result.ok && result.status === 'MISSING') {
        record.resetLog.push(
          `Purchase Invoice deleted by reference (${invoice.id} / ${reference})`,
        );
        record.transactions.push({
          type: 'purchase_invoice',
          sageTransactionId: invoice.id,
          externalReference: reference,
          status: 'deleted',
          requestSummary: { foundByReference: true },
          readBackSummary: { status: 'MISSING' },
          readBackVerified: true,
          createdAt: new Date().toISOString(),
          cleanedAt: new Date().toISOString(),
        });
      } else {
        unresolved.push(
          `Purchase Invoice ${invoice.id}: ${
            result.detail || 'could not hard-delete'
          }`,
        );
      }
    }
  } catch (error) {
    unresolved.push(
      `Purchase Invoice reference lookup failed: ${
        error instanceof Error ? error.message : 'unknown error'
      }`,
    );
  }

  try {
    const sales = await listSalesInvoices(accessToken, businessId, reference);
    for (const invoice of sales) {
      const id = String(invoice.id ?? '');
      if (!id || isVoidLikeStatus(invoiceStatusText(invoice))) continue;
      const tracked = record.transactions.some(
        (tx) =>
          tx.type === 'sales_invoice' &&
          tx.sageTransactionId === id &&
          tx.status === 'voided',
      );
      if (tracked) continue;
      const result = await voidDemoInvoiceById('sales', accessToken, businessId, id);
      if (result.ok) {
        record.resetLog.push(
          `Sales Invoice voided by reference (${id} / ${reference})`,
        );
        record.transactions.push({
          type: 'sales_invoice',
          sageTransactionId: id,
          externalReference: reference,
          status: 'voided',
          requestSummary: { foundByReference: true },
          readBackSummary: { status: result.status },
          readBackVerified: true,
          createdAt: new Date().toISOString(),
          cleanedAt: new Date().toISOString(),
        });
      } else {
        unresolved.push(`Sales Invoice ${id}: ${result.detail || 'void failed'}`);
      }
    }
  } catch (error) {
    unresolved.push(
      `Sales Invoice reference lookup failed: ${
        error instanceof Error ? error.message : 'unknown error'
      }`,
    );
  }
}

async function ensureBaselineStockItem(
  accessToken: string,
  businessId: string,
  baseline: (typeof GHOSTBOARDS_BASELINE_SKUS)[number],
  defaults: Awaited<ReturnType<typeof resolveStockItemDefaults>>,
  unresolved: string[],
  log: string[],
) {
  let item = await findStockItemBySku(accessToken, businessId, baseline.sku);
  if (!item) {
    try {
      item = await createStockItem(accessToken, businessId, {
        item_code: baseline.sku,
        description: baseline.description,
        cost_price: baseline.costPrice,
        sales_price: baseline.salesPrice || undefined,
        reorder_level: baseline.reorderLevel,
        reorder_quantity: baseline.reorderQuantity,
        sales_ledger_account_id: defaults.sales_ledger_account_id,
        purchase_ledger_account_id: defaults.purchase_ledger_account_id,
        sales_tax_rate_id: defaults.sales_tax_rate_id,
        purchase_tax_rate_id: defaults.purchase_tax_rate_id,
      });
      log.push(`Created baseline Stock Item ${baseline.sku} (${item.id})`);
    } catch (error) {
      unresolved.push(
        `${baseline.sku}: create failed — ${
          error instanceof Error ? error.message : 'unknown error'
        }`,
      );
      return null;
    }
  }

  // Restore controlled fields.
  try {
    const needsUpdate =
      item.description !== baseline.description ||
      !nearlyEqual(item.costPrice, baseline.costPrice) ||
      item.reorderLevel !== baseline.reorderLevel;
    if (needsUpdate) {
      item = await updateStockItem(accessToken, businessId, item.id, {
        description: baseline.description,
        cost_price: baseline.costPrice,
        reorder_level: baseline.reorderLevel,
        ...(baseline.salesPrice > 0 ? { sales_price: baseline.salesPrice } : {}),
      });
      log.push(`Restored Stock Item fields for ${baseline.sku}`);
    }
  } catch (error) {
    unresolved.push(
      `${baseline.sku}: field restore failed — ${
        error instanceof Error ? error.message : 'unknown error'
      }`,
    );
  }

  item = await getStockItem(accessToken, businessId, item.id);

  if (!nearlyEqual(item.quantityInStock, baseline.quantityInStock, QTY_TOLERANCE)) {
    const adjustment = Number(
      (baseline.quantityInStock - item.quantityInStock).toFixed(4),
    );
    if (Math.abs(adjustment) > QTY_TOLERANCE) {
      try {
        const movement = await createStockMovement(accessToken, businessId, {
          stock_item_id: item.id,
          date: new Date().toISOString().slice(0, 10),
          quantity: adjustment,
          cost_price: baseline.costPrice,
          // UK rejects `reference` on stock_movements — keep token in details only.
          details: GHOSTBOARDS_BASELINE_MOVEMENT_REFERENCE.slice(0, 50),
        });
        const movementId = String(movement.id ?? '');
        log.push(
          `Baseline quantity adjustment for ${baseline.sku}: ${adjustment} (${movementId})`,
        );
        item = await getStockItem(accessToken, businessId, item.id);
      } catch (error) {
        unresolved.push(
          `${baseline.sku}: quantity restore failed — ${
            error instanceof Error ? error.message : 'unknown error'
          }`,
        );
      }
    }
  }

  // Final cost restore after quantity movement (visible cost_price).
  if (!nearlyEqual(item.costPrice, baseline.costPrice)) {
    try {
      item = await updateStockItem(accessToken, businessId, item.id, {
        cost_price: baseline.costPrice,
      });
      item = await getStockItem(accessToken, businessId, item.id);
    } catch (error) {
      unresolved.push(
        `${baseline.sku}: cost restore failed — ${
          error instanceof Error ? error.message : 'unknown error'
        }`,
      );
    }
  }

  if (!nearlyEqual(item.quantityInStock, baseline.quantityInStock, QTY_TOLERANCE)) {
    unresolved.push(
      `${baseline.sku}: quantity_in_stock expected ${baseline.quantityInStock}, got ${item.quantityInStock}`,
    );
  }
  if (!nearlyEqual(item.costPrice, baseline.costPrice)) {
    unresolved.push(
      `${baseline.sku}: cost_price expected ${baseline.costPrice}, got ${item.costPrice}`,
    );
  }

  return item;
}

/**
 * Prepare or restore the full Ghostboards Demo baseline.
 * Safe to call repeatedly. Does not require an existing Demo Run.
 */
export async function restoreDemoBaseline(input: {
  accessToken: string;
  businessId: string;
  confirmation?: string;
  activeDemoRunId?: string;
}): Promise<BaselineResetResult> {
  if (input.confirmation && input.confirmation !== 'RESET') {
    throw new Error('Type RESET to confirm demo data cleanup');
  }

  const unresolved: string[] = [];
  const demoRun =
    (input.activeDemoRunId ? await getDemoRun(input.activeDemoRunId) : null) ??
    (await getActiveDemoRunForBusiness(input.businessId));

  if (demoRun && demoRun.sageBusinessId === input.businessId) {
    demoRun.status = 'resetting';
    demoRun.resetLog.push(`Baseline restore started at ${new Date().toISOString()}`);
    await saveDemoRun(demoRun);
    await voidSalesInvoices(input.accessToken, input.businessId, demoRun, unresolved);
    await deleteDemoStockMovements(input.accessToken, input.businessId, demoRun, unresolved);
    await deleteDemoPurchaseInvoices(input.accessToken, input.businessId, demoRun, unresolved);
    await voidOrphanDemoInvoicesByReference(
      input.accessToken,
      input.businessId,
      demoRun,
      unresolved,
    );
    await saveDemoRun(demoRun);
  }

  let defaults: Awaited<ReturnType<typeof resolveStockItemDefaults>>;
  try {
    defaults = await resolveStockItemDefaults(input.accessToken, input.businessId);
  } catch (error) {
    return {
      status: 'requires_review',
      message: 'Reset Requires Review',
      demoRun,
      unresolved: [
        error instanceof Error
          ? error.message
          : 'Could not resolve ledger/tax defaults for baseline Stock Items',
      ],
      summary: {
        productsReady: false,
        inventoryRestored: false,
        costsRestored: false,
        transactionsReconciled: false,
      },
    };
  }

  const log: string[] = [];
  for (const baseline of GHOSTBOARDS_BASELINE_SKUS) {
    await ensureBaselineStockItem(
      input.accessToken,
      input.businessId,
      baseline,
      defaults,
      unresolved,
      log,
    );
  }

  // Optional: list leftover movements with demo run reference (idempotent info only).
  if (demoRun) {
    try {
      const movements = await listStockMovements(
        input.accessToken,
        input.businessId,
        demoRun.demoRunReference,
      );
      if (movements.length) {
        unresolved.push(
          `${movements.length} Stock Movement(s) still reference ${demoRun.demoRunReference}`,
        );
      }
    } catch {
      // non-fatal
    }
  }

  const productsReady = unresolved.every((item) => !/create failed|productsReady/i.test(item));
  const inventoryRestored = !unresolved.some((item) => /quantity/i.test(item));
  const costsRestored = !unresolved.some((item) => /cost_price|cost restore/i.test(item));
  const transactionsReconciled = !unresolved.some((item) =>
    /Purchase Invoice|Sales Invoice|Stock Movement/i.test(item),
  );
  const ready =
    unresolved.length === 0 &&
    productsReady &&
    inventoryRestored &&
    costsRestored &&
    transactionsReconciled;

  if (demoRun) {
    demoRun.resetLog.push(...log);
    demoRun.verification = {
      resetComplete: ready,
      mismatches: unresolved.map((item) => ({
        sku: item.split(':')[0] ?? 'demo',
        field: 'reset',
        expected: 0,
        actual: 0,
      })),
    };
    demoRun.status = ready ? 'reset_complete' : 'reset_incomplete';
    demoRun.resetLog.push(ready ? 'Demo Baseline Ready' : 'Reset Requires Review');
    demoRun.updatedAt = new Date().toISOString();
    await saveDemoRun(demoRun);
    if (ready) await clearActiveDemoRunPointer(input.businessId);
  }

  return {
    status: ready ? 'ready' : 'requires_review',
    message: ready ? 'Demo Baseline Ready' : 'Reset Requires Review',
    demoRun,
    unresolved,
    summary: {
      productsReady: unresolved.every((item) => !/create failed/i.test(item)),
      inventoryRestored,
      costsRestored,
      transactionsReconciled,
    },
  };
}

/** @deprecated Use restoreDemoBaseline */
export async function resetDemoRun(input: {
  accessToken: string;
  businessId: string;
  demoRunId: string;
  confirmation: string;
}): Promise<DemoRunRecord> {
  const result = await restoreDemoBaseline({
    accessToken: input.accessToken,
    businessId: input.businessId,
    confirmation: input.confirmation,
    activeDemoRunId: input.demoRunId,
  });
  if (!result.demoRun) {
    throw new Error(result.unresolved[0] ?? 'Demo run not found');
  }
  if (result.status !== 'ready') {
    // Preserve incomplete state on the record.
    return result.demoRun;
  }
  return result.demoRun;
}

export async function getCurrentDemoRun(businessId: string) {
  return getActiveDemoRunForBusiness(businessId);
}
