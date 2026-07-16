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
  deletePurchaseInvoice,
  deleteSalesInvoice,
  findStockItemBySku,
  getPurchaseInvoice,
  getSalesInvoice,
  getStockItem,
  listPurchaseInvoices,
  listSalesInvoices,
  resolveStockItemDefaults,
  updateStockItem,
} from '../sage/client';
import { stockMovementAdjustDetailsMarker } from '../workflow/sageGateway';
import { DEMO_REFERENCE_PREFIX, FIXTURE_REFERENCE } from '../workflow/fixtures';
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
  /** Force a brand-new demo run + DEMO-* reference (e.g. after incomplete Reset). */
  forceNew?: boolean;
}): Promise<DemoRunRecord> {
  const existing = await getActiveDemoRunForBusiness(input.sageBusinessId);
  const resetLike =
    existing?.status === 'reset_complete' ||
    existing?.status === 'reset_incomplete' ||
    existing?.status === 'resetting';
  if (
    !input.forceNew &&
    existing &&
    !resetLike &&
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

/**
 * Ensure Sage on-hand quantity equals `targetQuantity` by posting a corrective
 * Stock Movement when needed. Used after WF2 receipt / WF3 sale so idempotent
 * reuse of stale DEMO-* movements cannot leave inventory stuck at 0.
 */
export async function reconcileStockItemQuantity(input: {
  accessToken: string;
  businessId: string;
  demoRunId: string;
  demoRunReference: string;
  stockItemId: string;
  sku: string;
  targetQuantity: number;
  costPrice: number;
  date: string;
}): Promise<{
  adjusted: boolean;
  movementId?: string;
  before: number;
  after: number;
  remainingGap: number;
}> {
  const beforeItem = await getStockItem(
    input.accessToken,
    input.businessId,
    input.stockItemId,
  );
  const before = beforeItem.quantityInStock;
  const delta = Number((input.targetQuantity - before).toFixed(4));
  if (Math.abs(delta) <= 0.01) {
    return { adjusted: false, before, after: before, remainingGap: 0 };
  }

  const details = stockMovementAdjustDetailsMarker(
    input.demoRunReference,
    input.sku,
    Date.now().toString(36),
  );
  const created = await createStockMovement(input.accessToken, input.businessId, {
    stock_item_id: input.stockItemId,
    date: input.date,
    quantity: delta,
    cost_price: Number(Number(input.costPrice).toFixed(2)),
    details,
  });
  const movementId = String(created.id ?? '');
  await appendDemoTransaction(input.demoRunId, {
    type: 'stock_movement',
    sageTransactionId: movementId,
    externalReference: `${input.demoRunReference}:ADJ:${input.sku}`,
    status: movementId ? 'succeeded' : 'failed',
    requestSummary: {
      stock_item_id: input.stockItemId,
      quantity: delta,
      targetQuantity: input.targetQuantity,
      details,
    },
    readBackSummary: { id: movementId },
    readBackVerified: Boolean(movementId),
    createdAt: new Date().toISOString(),
  });

  const afterItem = await getStockItem(
    input.accessToken,
    input.businessId,
    input.stockItemId,
  );
  const after = afterItem.quantityInStock;
  return {
    adjusted: true,
    movementId,
    before,
    after,
    remainingGap: Number((input.targetQuantity - after).toFixed(4)),
  };
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

/** Hard-delete Purchase Invoices (404). Sales Invoices cannot be deleted — void only. */
async function hardDeletePurchaseInvoiceById(
  accessToken: string,
  businessId: string,
  id: string,
): Promise<{ ok: boolean; status: string; detail?: string }> {
  const before = await readInvoiceStatus('purchase', accessToken, businessId, id);
  if (before.gone) return { ok: true, status: 'MISSING' };

  try {
    // No void_reason — Purchase Invoices are deleted, not voided.
    await deletePurchaseInvoice(accessToken, businessId, id);
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Purchase Invoice delete failed';
    if (/not found|404|already/i.test(message)) {
      return { ok: true, status: 'MISSING', detail: message };
    }
    return { ok: false, status: before.status, detail: message };
  }

  const after = await readInvoiceStatus('purchase', accessToken, businessId, id);
  if (after.gone) return { ok: true, status: 'MISSING' };
  return {
    ok: false,
    status: after.status || before.status,
    detail: `Purchase Invoice still present after delete (status ${
      after.status || before.status || 'unknown'
    })`,
  };
}

async function deleteDemoPurchaseInvoices(
  accessToken: string,
  businessId: string,
  record: DemoRunRecord | null,
  unresolved: string[],
  resetLog: string[],
) {
  const attempted = new Set<string>();

  const deleteOne = async (id: string, source: string) => {
    if (!id || attempted.has(id)) return;
    attempted.add(id);
    const result = await hardDeletePurchaseInvoiceById(accessToken, businessId, id);
    if (result.ok && result.status === 'MISSING') {
      resetLog.push(`Purchase Invoice deleted (${id})${source ? ` via ${source}` : ''}`);
      if (record) {
        const tracked = record.transactions.find(
          (tx) => tx.type === 'purchase_invoice' && tx.sageTransactionId === id,
        );
        if (tracked) {
          tracked.status = 'deleted';
          tracked.cleanedAt = new Date().toISOString();
          tracked.readBackSummary = { status: 'MISSING', afterDelete: true };
        } else {
          record.transactions.push({
            type: 'purchase_invoice',
            sageTransactionId: id,
            externalReference: record.demoRunReference,
            status: 'deleted',
            requestSummary: { foundBySearch: true, source },
            readBackSummary: { status: 'MISSING' },
            readBackVerified: true,
            createdAt: new Date().toISOString(),
            cleanedAt: new Date().toISOString(),
          });
        }
      }
      return;
    }
    unresolved.push(
      `Purchase Invoice ${id} could not be deleted: ${
        result.detail || `status ${result.status}`
      }`,
    );
  };

  // 1) Known IDs from the demo-run transaction log
  if (record) {
    for (const purchase of record.transactions.filter(
      (tx) =>
        tx.type === 'purchase_invoice' &&
        ['succeeded', 'deleted', 'voided'].includes(tx.status),
    )) {
      if (purchase.status === 'deleted') {
        attempted.add(purchase.sageTransactionId);
        continue;
      }
      await deleteOne(purchase.sageTransactionId, 'demo-run log');
    }
  }

  // 2) Always search Sage — cookie/demo-run can be missing while invoices remain.
  const searchTerms = Array.from(
    new Set(
      [
        record?.demoRunReference,
        DEMO_REFERENCE_PREFIX,
        FIXTURE_REFERENCE,
        'UG26A0519',
        'GA18',
        'DEMO-GHOACRUGOL051926',
      ].filter((term): term is string => Boolean(term)),
    ),
  );

  for (const term of searchTerms) {
    try {
      const purchases = await listPurchaseInvoices(accessToken, businessId, term);
      for (const invoice of purchases) {
        if (!invoice.id) continue;
        // Skip already-voided leftovers from older released demos — they cannot be
        // hard-deleted; only Draft invoices disappear on DELETE.
        if (isVoidLikeStatus(invoice.status)) continue;
        await deleteOne(invoice.id, `search:${term}`);
      }
    } catch (error) {
      unresolved.push(
        `Purchase Invoice search (${term}) failed: ${
          error instanceof Error ? error.message : 'unknown error'
        }`,
      );
    }
  }
}

/**
 * Void demo Sales Invoices found by Sage search (and optionally track on the
 * demo-run record). Always runs — even when the demo-run cookie is missing.
 */
async function voidDemoSalesInvoicesBySearch(
  accessToken: string,
  businessId: string,
  record: DemoRunRecord | null,
  unresolved: string[],
  resetLog: string[],
) {
  const attempted = new Set<string>();
  const searchTerms = Array.from(
    new Set(
      [
        record?.demoRunReference,
        DEMO_REFERENCE_PREFIX,
        'DEMO-GHOACRUGOL051926',
        'GA18',
      ].filter((term): term is string => Boolean(term)),
    ),
  );

  const voidOne = async (id: string, source: string) => {
    if (!id || attempted.has(id)) return;
    attempted.add(id);
    if (record) {
      const alreadyVoided = record.transactions.some(
        (tx) =>
          tx.type === 'sales_invoice' &&
          tx.sageTransactionId === id &&
          tx.status === 'voided',
      );
      if (alreadyVoided) return;
    }
    const result = await voidDemoInvoiceById('sales', accessToken, businessId, id);
    if (result.ok) {
      resetLog.push(`Sales Invoice voided (${id}) via ${source}`);
      if (!record) return;
      const tracked = record.transactions.find(
        (tx) => tx.type === 'sales_invoice' && tx.sageTransactionId === id,
      );
      if (tracked) {
        tracked.status = 'voided';
        tracked.cleanedAt = new Date().toISOString();
        tracked.readBackSummary = { status: result.status, afterDelete: true };
      } else {
        record.transactions.push({
          type: 'sales_invoice',
          sageTransactionId: id,
          externalReference: record.demoRunReference,
          status: 'voided',
          requestSummary: { foundBySearch: true, source },
          readBackSummary: { status: result.status },
          readBackVerified: true,
          createdAt: new Date().toISOString(),
          cleanedAt: new Date().toISOString(),
        });
      }
      return;
    }
    unresolved.push(`Sales Invoice ${id}: ${result.detail || 'void failed'}`);
  };

  if (record) {
    for (const item of record.transactions.filter(
      (tx) => tx.type === 'sales_invoice' && ['succeeded', 'voided'].includes(tx.status),
    )) {
      if (item.status === 'voided') {
        attempted.add(item.sageTransactionId);
        continue;
      }
      await voidOne(item.sageTransactionId, 'demo-run log');
    }
  }

  for (const term of searchTerms) {
    try {
      const sales = await listSalesInvoices(accessToken, businessId, term);
      for (const invoice of sales) {
        const id = String(invoice.id ?? '');
        if (!id || isVoidLikeStatus(invoiceStatusText(invoice))) continue;
        await voidOne(id, `search:${term}`);
      }
    } catch (error) {
      unresolved.push(
        `Sales Invoice search (${term}) failed: ${
          error instanceof Error ? error.message : 'unknown error'
        }`,
      );
    }
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

  // Always rewrite controlled fields (cost/sales/description). Sage may keep
  // stale sales_prices or recalculate cost from leftover movements — force PUT.
  try {
    item = await updateStockItem(accessToken, businessId, item.id, {
      description: baseline.description,
      cost_price: baseline.costPrice,
      sales_price: baseline.salesPrice,
      reorder_level: baseline.reorderLevel,
    });
    log.push(`Restored Stock Item fields for ${baseline.sku}`);
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

  // Final cost + sales restore after quantity movement (visible prices).
  try {
    item = await updateStockItem(accessToken, businessId, item.id, {
      cost_price: baseline.costPrice,
      sales_price: baseline.salesPrice,
    });
    item = await getStockItem(accessToken, businessId, item.id);
    log.push(`Restored prices for ${baseline.sku}`);
  } catch (error) {
    unresolved.push(
      `${baseline.sku}: price restore failed — ${
        error instanceof Error ? error.message : 'unknown error'
      }`,
    );
    try {
      item = await getStockItem(accessToken, businessId, item.id);
    } catch {
      // keep prior item snapshot
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
  if (!nearlyEqual(item.salesPrice, baseline.salesPrice)) {
    unresolved.push(
      `${baseline.sku}: sales_price expected ${baseline.salesPrice}, got ${item.salesPrice}`,
    );
  }

  return item;
}

/**
 * Hardcoded Ghostboards demo Reset:
 * 1) Delete demo Purchase Invoices (Draft hard-delete)
 * 2) Void demo Sales Invoices
 * 3) Force the 6 workflow SKUs to qty 0 / cost 0 / sales 0
 *
 * Stock Movement leftovers are ignored — qty is corrected via baseline
 * adjustment, so Reset must not fail with "still reference DEMO-*".
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

  const resetLog: string[] = [];
  const activeDemoRun =
    demoRun && demoRun.sageBusinessId === input.businessId ? demoRun : null;
  if (activeDemoRun) {
    activeDemoRun.status = 'resetting';
    activeDemoRun.resetLog.push(`Baseline restore started at ${new Date().toISOString()}`);
    await saveDemoRun(activeDemoRun);
  }

  await deleteDemoPurchaseInvoices(
    input.accessToken,
    input.businessId,
    activeDemoRun,
    unresolved,
    resetLog,
  );

  await voidDemoSalesInvoicesBySearch(
    input.accessToken,
    input.businessId,
    activeDemoRun,
    unresolved,
    resetLog,
  );

  if (activeDemoRun) {
    activeDemoRun.resetLog.push(...resetLog);
    await saveDemoRun(activeDemoRun);
  } else if (resetLog.length) {
    console.info('[demo/reset] cleaned invoices without demo-run record', resetLog);
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

  // Success = 6 SKUs at 0/0/0 + PI deleted + SI voided. Ignore Stock Movements.
  const productsReady = unresolved.every((item) => !/create failed/i.test(item));
  const inventoryRestored = !unresolved.some((item) => /quantity/i.test(item));
  const costsRestored = !unresolved.some((item) =>
    /cost_price|sales_price|price restore|field restore/i.test(item),
  );
  const transactionsReconciled = !unresolved.some((item) =>
    /Purchase Invoice|Sales Invoice/i.test(item),
  );
  const ready =
    unresolved.length === 0 &&
    productsReady &&
    inventoryRestored &&
    costsRestored &&
    transactionsReconciled;

  if (activeDemoRun) {
    activeDemoRun.resetLog.push(...log);
    activeDemoRun.verification = {
      resetComplete: ready,
      mismatches: unresolved.map((item) => ({
        sku: item.split(':')[0] ?? 'demo',
        field: 'reset',
        expected: 0,
        actual: 0,
      })),
    };
    activeDemoRun.status = ready ? 'reset_complete' : 'reset_incomplete';
    activeDemoRun.resetLog.push(ready ? 'Demo Baseline Ready' : 'Reset Requires Review');
    activeDemoRun.updatedAt = new Date().toISOString();
    await saveDemoRun(activeDemoRun);
    if (ready) await clearActiveDemoRunPointer(input.businessId);
  }

  return {
    status: ready ? 'ready' : 'requires_review',
    message: ready ? 'Demo Baseline Ready' : 'Reset Requires Review',
    demoRun: activeDemoRun,
    unresolved,
    summary: {
      productsReady,
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
