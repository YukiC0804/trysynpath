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
  deleteStockMovement,
  findStockItemBySku,
  getPurchaseInvoice,
  getSalesInvoice,
  getStockItem,
  getStockMovement,
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
    try {
      await deleteSalesInvoice(accessToken, businessId, item.sageTransactionId);
      try {
        const readBack = await getSalesInvoice(
          accessToken,
          businessId,
          item.sageTransactionId,
        );
        const status = String(
          (readBack.status as { id?: string; displayed_as?: string } | undefined)?.id ??
            (readBack.status as { displayed_as?: string } | undefined)?.displayed_as ??
            readBack.status_id ??
            '',
        ).toLowerCase();
        item.readBackSummary = { status, afterDelete: true };
      } catch {
        item.readBackSummary = { missingAfterDelete: true };
      }
      item.status = 'voided';
      item.cleanedAt = new Date().toISOString();
      record.resetLog.push(`Sales Invoice Voided (${item.sageTransactionId})`);
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Sales Invoice void failed';
      if (/not found|404|already/i.test(message)) {
        item.status = 'voided';
        item.cleanedAt = new Date().toISOString();
        record.resetLog.push(`Sales Invoice already voided (${item.sageTransactionId})`);
      } else {
        unresolved.push(`Sales Invoice ${item.sageTransactionId}: ${message}`);
      }
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
    (tx) => tx.type === 'purchase_invoice' && ['succeeded', 'deleted'].includes(tx.status),
  );
  for (const purchase of purchases) {
    if (purchase.status === 'deleted') continue;
    try {
      await deletePurchaseInvoice(accessToken, businessId, purchase.sageTransactionId);
      try {
        await getPurchaseInvoice(accessToken, businessId, purchase.sageTransactionId);
        unresolved.push(
          `Purchase Invoice ${purchase.sageTransactionId} still present after delete`,
        );
      } catch {
        purchase.status = 'deleted';
        purchase.cleanedAt = new Date().toISOString();
        purchase.readBackSummary = { missingAfterDelete: true };
        record.resetLog.push(`Purchase Invoice deleted (${purchase.sageTransactionId})`);
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Purchase Invoice delete failed';
      if (/not found|404|already/i.test(message)) {
        purchase.status = 'deleted';
        purchase.cleanedAt = new Date().toISOString();
        record.resetLog.push(
          `Purchase Invoice already deleted (${purchase.sageTransactionId})`,
        );
      } else {
        unresolved.push(
          `Purchase Invoice ${purchase.sageTransactionId} could not be removed: ${message}`,
        );
      }
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
          details: 'Ghostboards demo baseline reset',
          reference: GHOSTBOARDS_BASELINE_MOVEMENT_REFERENCE,
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
