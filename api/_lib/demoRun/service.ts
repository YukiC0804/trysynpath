import crypto from 'crypto';
import type {
  DemoRunRecord,
  DemoStockBaselineSnapshot,
  DemoTransactionRecord,
} from '../../../shared/demoRun';
import {
  deletePurchaseInvoice,
  deleteSalesInvoice,
  deleteStockMovement,
  getPurchaseInvoice,
  getSalesInvoice,
  getStockItem,
  getStockMovement,
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
      ? {
          ...item,
          costPriceExplicitlyUpdated: true,
          ...after,
        }
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
 * After Stock Movement, ensure visible cost_price equals landed unit cost when Sage
 * did not update it automatically.
 */
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
  return { updated: true, item: verified };
}

export async function resetDemoRun(input: {
  accessToken: string;
  businessId: string;
  demoRunId: string;
  confirmation: string;
}): Promise<DemoRunRecord> {
  if (input.confirmation !== 'RESET') {
    throw new Error('Type RESET to confirm demo data cleanup');
  }
  const record = await getDemoRun(input.demoRunId);
  if (!record) throw new Error('Demo run not found');
  if (record.sageBusinessId !== input.businessId) {
    throw new Error('Demo run does not belong to the connected Sage business');
  }

  record.status = 'resetting';
  record.resetLog.push(`Reset started at ${new Date().toISOString()}`);
  await saveDemoRun(record);

  // Step 1 — void/delete Sales Invoice
  const sales = [...record.transactions]
    .reverse()
    .find((tx) => tx.type === 'sales_invoice' && ['succeeded', 'voided'].includes(tx.status));
  if (sales?.sageTransactionId && sales.status === 'succeeded') {
    try {
      await deleteSalesInvoice(
        input.accessToken,
        input.businessId,
        sales.sageTransactionId,
      );
      let voided = true;
      try {
        const readBack = await getSalesInvoice(
          input.accessToken,
          input.businessId,
          sales.sageTransactionId,
        );
        const status = String(
          (readBack.status as { id?: string; displayed_as?: string } | undefined)?.id ??
            (readBack.status as { id?: string; displayed_as?: string } | undefined)
              ?.displayed_as ??
            readBack.status_id ??
            '',
        ).toLowerCase();
        voided = status.includes('void') || status.includes('deleted') || status === '';
        sales.readBackSummary = { status, afterDelete: true };
      } catch {
        // Missing after delete is acceptable for void/delete semantics.
        voided = true;
        sales.readBackSummary = { missingAfterDelete: true };
      }
      sales.status = 'voided';
      sales.cleanedAt = new Date().toISOString();
      record.resetLog.push(
        voided
          ? `Sales Invoice Voided (${sales.sageTransactionId})`
          : `Sales Invoice delete called (${sales.sageTransactionId})`,
      );
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Sales Invoice void failed';
      if (/not found|404|already/i.test(message)) {
        sales.status = 'voided';
        sales.cleanedAt = new Date().toISOString();
        record.resetLog.push(`Sales Invoice already voided/absent (${sales.sageTransactionId})`);
      } else {
        record.status = 'reset_incomplete';
        record.resetLog.push(`Sales Invoice could not be voided: ${message}`);
        record.updatedAt = new Date().toISOString();
        await saveDemoRun(record);
        return record;
      }
    }
  }

  // Step 2 — delete Stock Movements (reverse order)
  const movements = record.transactions.filter(
    (tx) => tx.type === 'stock_movement' && ['succeeded', 'deleted'].includes(tx.status),
  );
  for (const movement of [...movements].reverse()) {
    if (movement.status === 'deleted') continue;
    try {
      await deleteStockMovement(
        input.accessToken,
        input.businessId,
        movement.sageTransactionId,
      );
      try {
        await getStockMovement(
          input.accessToken,
          input.businessId,
          movement.sageTransactionId,
        );
        // still exists — mark incomplete later if needed
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
        record.status = 'reset_incomplete';
        record.resetLog.push(`Stock Movement could not be deleted: ${message}`);
        record.updatedAt = new Date().toISOString();
        await saveDemoRun(record);
        return record;
      }
    }
  }

  // Step 3 — delete Purchase Invoice
  const purchase = [...record.transactions]
    .reverse()
    .find((tx) => tx.type === 'purchase_invoice' && ['succeeded', 'deleted'].includes(tx.status));
  if (purchase?.sageTransactionId && purchase.status === 'succeeded') {
    try {
      await deletePurchaseInvoice(
        input.accessToken,
        input.businessId,
        purchase.sageTransactionId,
      );
      try {
        await getPurchaseInvoice(
          input.accessToken,
          input.businessId,
          purchase.sageTransactionId,
        );
        purchase.readBackSummary = { stillPresent: true };
        record.status = 'reset_incomplete';
        record.resetLog.push(
          `Purchase Invoice still present after delete (${purchase.sageTransactionId})`,
        );
        record.updatedAt = new Date().toISOString();
        await saveDemoRun(record);
        return record;
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
        record.status = 'reset_incomplete';
        record.resetLog.push(
          `Purchase Invoice could not be removed (may be released/paid): ${message}`,
        );
        record.updatedAt = new Date().toISOString();
        await saveDemoRun(record);
        return record;
      }
    }
  }

  // Step 4 — restore explicit cost_price updates
  for (const baseline of record.baseline) {
    if (!baseline.costPriceExplicitlyUpdated) continue;
    try {
      await updateStockItem(input.accessToken, input.businessId, baseline.sageStockItemId, {
        cost_price: baseline.costPrice,
      });
      const verified = await getStockItem(
        input.accessToken,
        input.businessId,
        baseline.sageStockItemId,
      );
      if (!nearlyEqual(verified.costPrice, baseline.costPrice)) {
        record.status = 'reset_incomplete';
        record.resetLog.push(
          `Cost price restore mismatch for ${baseline.itemCode}: expected ${baseline.costPrice}, got ${verified.costPrice}`,
        );
        record.updatedAt = new Date().toISOString();
        await saveDemoRun(record);
        return record;
      }
      record.resetLog.push(`Restored cost_price for ${baseline.itemCode}`);
      const costTx = record.transactions.find(
        (tx) =>
          tx.type === 'stock_item_cost_update' &&
          tx.sageTransactionId === baseline.sageStockItemId &&
          tx.status === 'succeeded',
      );
      if (costTx) {
        costTx.status = 'restored';
        costTx.cleanedAt = new Date().toISOString();
      }
    } catch (error) {
      record.status = 'reset_incomplete';
      record.resetLog.push(
        `Failed to restore cost_price for ${baseline.itemCode}: ${
          error instanceof Error ? error.message : 'unknown error'
        }`,
      );
      record.updatedAt = new Date().toISOString();
      await saveDemoRun(record);
      return record;
    }
  }

  // Step 5 — baseline verification
  const mismatches: DemoRunRecord['verification']['mismatches'] = [];
  for (const baseline of record.baseline) {
    const current = await getStockItem(
      input.accessToken,
      input.businessId,
      baseline.sageStockItemId,
    );
    if (!nearlyEqual(current.quantityInStock, baseline.quantityInStock, QTY_TOLERANCE)) {
      mismatches.push({
        sku: baseline.itemCode,
        field: 'quantity_in_stock',
        expected: baseline.quantityInStock,
        actual: current.quantityInStock,
      });
    }
    if (!nearlyEqual(current.costPrice, baseline.costPrice)) {
      mismatches.push({
        sku: baseline.itemCode,
        field: 'cost_price',
        expected: baseline.costPrice,
        actual: current.costPrice,
      });
    }
    if (!nearlyEqual(current.lastCostPrice, baseline.lastCostPrice)) {
      mismatches.push({
        sku: baseline.itemCode,
        field: 'last_cost_price',
        expected: baseline.lastCostPrice,
        actual: current.lastCostPrice,
      });
    }
    if (!nearlyEqual(current.averageCostPrice, baseline.averageCostPrice)) {
      mismatches.push({
        sku: baseline.itemCode,
        field: 'average_cost_price',
        expected: baseline.averageCostPrice,
        actual: current.averageCostPrice,
      });
    }
  }

  record.verification = {
    resetComplete: mismatches.length === 0,
    mismatches,
  };
  record.status = mismatches.length === 0 ? 'reset_complete' : 'reset_incomplete';
  record.resetLog.push(
    mismatches.length === 0 ? 'Demo Reset Complete' : 'Reset Requires Review',
  );
  record.updatedAt = new Date().toISOString();
  await saveDemoRun(record);
  if (mismatches.length === 0) {
    await clearActiveDemoRunPointer(input.businessId);
  }
  return record;
}

export async function getCurrentDemoRun(businessId: string) {
  return getActiveDemoRunForBusiness(businessId);
}
