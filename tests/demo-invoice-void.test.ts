import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  appendDemoTransaction,
  captureBaseline,
  restoreDemoBaseline,
} from '../api/_lib/demoRun/service';
import { __resetMemoryDemoRunStore } from '../api/_lib/demoRun/store';

process.env.DEMO_RUN_MEMORY_STORE = '1';
process.env.VITEST = 'true';

const {
  deletePurchaseInvoice,
  deleteSalesInvoice,
  getPurchaseInvoice,
  getSalesInvoice,
  listPurchaseInvoices,
  listSalesInvoices,
  listStockMovements,
  resolveStockItemDefaults,
  findStockItemBySku,
  updateStockItem,
  getStockItem,
  createStockMovement,
  deleteStockMovement,
  getStockMovement,
} = vi.hoisted(() => ({
  deletePurchaseInvoice: vi.fn(),
  deleteSalesInvoice: vi.fn(),
  getPurchaseInvoice: vi.fn(),
  getSalesInvoice: vi.fn(),
  listPurchaseInvoices: vi.fn(async () => []),
  listSalesInvoices: vi.fn(async () => []),
  listStockMovements: vi.fn(async () => []),
  resolveStockItemDefaults: vi.fn(async () => ({
    sales_ledger_account_id: 'sales-ledger',
    purchase_ledger_account_id: 'purchase-ledger',
    sales_tax_rate_id: 'tax-sales',
    purchase_tax_rate_id: 'tax-purchase',
  })),
  findStockItemBySku: vi.fn(),
  updateStockItem: vi.fn(),
  getStockItem: vi.fn(),
  createStockMovement: vi.fn(),
  deleteStockMovement: vi.fn(),
  getStockMovement: vi.fn(async () => {
    throw new Error('404 not found');
  }),
}));

vi.mock('../api/_lib/sage/client', async () => {
  const actual = await vi.importActual<typeof import('../api/_lib/sage/client')>(
    '../api/_lib/sage/client',
  );
  return {
    ...actual,
    deletePurchaseInvoice,
    deleteSalesInvoice,
    getPurchaseInvoice,
    getSalesInvoice,
    listPurchaseInvoices,
    listSalesInvoices,
    listStockMovements,
    resolveStockItemDefaults,
    findStockItemBySku,
    updateStockItem,
    getStockItem,
    createStockMovement,
    createStockItem: vi.fn(),
    deleteStockMovement,
    getStockMovement,
  };
});

const stock = {
  id: 'stock-clr',
  sku: 'ACR-WHT-3MM-48X96',
  description: 'White Acrylic Sheet 3mm 48 × 96',
  quantityInStock: 0,
  costPrice: 24.16,
  lastCostPrice: 24.16,
  averageCostPrice: 24.16,
  salesPrice: 39.45,
  raw: {},
};

describe('demo reset invoice cleanup', () => {
  beforeEach(() => {
    __resetMemoryDemoRunStore();
    vi.clearAllMocks();
    const priceState = new Map<string, { costPrice: number; salesPrice: number }>();
    findStockItemBySku.mockImplementation(async (_token, _biz, sku: string) => {
      const id = `id-${sku}`;
      const prices = priceState.get(id) ?? { costPrice: 24.16, salesPrice: 39.45 };
      return {
        ...stock,
        id,
        sku,
        quantityInStock: 0,
        costPrice: prices.costPrice,
        salesPrice: prices.salesPrice,
      };
    });
    getStockItem.mockImplementation(async (_token, _biz, id: string) => {
      const prices = priceState.get(id) ?? { costPrice: 24.16, salesPrice: 39.45 };
      return {
        ...stock,
        id,
        sku: String(id).replace(/^id-/, ''),
        quantityInStock: 0,
        costPrice: prices.costPrice,
        salesPrice: prices.salesPrice,
      };
    });
    updateStockItem.mockImplementation(async (_token, _biz, id: string, patch) => {
      const prev = priceState.get(id) ?? { costPrice: 24.16, salesPrice: 39.45 };
      const next = {
        costPrice: patch.cost_price != null ? Number(patch.cost_price) : prev.costPrice,
        salesPrice: patch.sales_price != null ? Number(patch.sales_price) : prev.salesPrice,
      };
      priceState.set(id, next);
      return {
        ...stock,
        id,
        sku: String(id).replace(/^id-/, ''),
        quantityInStock: 0,
        costPrice: next.costPrice,
        salesPrice: next.salesPrice,
        description: patch.description ?? stock.description,
        reorderLevel: patch.reorder_level ?? stock.reorderLevel ?? 10,
      };
    });
    createStockMovement.mockResolvedValue({ id: 'sm-adjust' });
    deleteStockMovement.mockResolvedValue(undefined);
    getStockMovement.mockRejectedValue(new Error('404 not found'));
    listPurchaseInvoices.mockResolvedValue([]);
    listSalesInvoices.mockResolvedValue([]);
    listStockMovements.mockResolvedValue([]);
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('hard-deletes Purchase Invoices and voids Sales Invoices on Reset', async () => {
    const record = await captureBaseline({
      sageBusinessId: 'biz-1',
      workflowRunId: 'wf-1',
      externalPoReference: 'GHOACRUGOL051926',
      vendorInvoiceReference: 'UG26A0519',
      customerInvoiceReference: 'GA18',
      stockItems: [stock],
    });
    await appendDemoTransaction(record.id, {
      type: 'purchase_invoice',
      sageTransactionId: 'pi-live-1',
      externalReference: record.demoRunReference,
      status: 'succeeded',
      requestSummary: {},
      readBackSummary: {},
      readBackVerified: true,
      createdAt: new Date().toISOString(),
    });
    await appendDemoTransaction(record.id, {
      type: 'sales_invoice',
      sageTransactionId: 'si-live-1',
      externalReference: record.demoRunReference,
      status: 'succeeded',
      requestSummary: {},
      readBackSummary: {},
      readBackVerified: true,
      createdAt: new Date().toISOString(),
    });

    getPurchaseInvoice
      .mockResolvedValueOnce({ id: 'pi-live-1', status: { id: 'DRAFT' } })
      .mockRejectedValueOnce(new Error('404 not found'));
    getSalesInvoice
      .mockResolvedValueOnce({ id: 'si-live-1', status: { id: 'UNPAID' } })
      .mockResolvedValueOnce({ id: 'si-live-1', status: { id: 'VOID' } });
    deletePurchaseInvoice.mockResolvedValue(undefined);
    deleteSalesInvoice.mockResolvedValue(undefined);

    const result = await restoreDemoBaseline({
      accessToken: 'token',
      businessId: 'biz-1',
      confirmation: 'RESET',
      activeDemoRunId: record.id,
    });

    expect(deletePurchaseInvoice).toHaveBeenCalledWith('token', 'biz-1', 'pi-live-1');
    expect(deleteSalesInvoice).toHaveBeenCalledWith('token', 'biz-1', 'si-live-1');
    expect(result.unresolved.filter((item) => /Invoice/i.test(item))).toEqual([]);
    expect(result.demoRun?.transactions.find((tx) => tx.type === 'purchase_invoice')?.status).toBe(
      'deleted',
    );
    expect(result.demoRun?.transactions.find((tx) => tx.type === 'sales_invoice')?.status).toBe(
      'voided',
    );
  });

  it('deletes Purchase Invoices found by Sage search even without a demo-run record', async () => {
    listPurchaseInvoices.mockImplementation(async (_token, _biz, term?: string) => {
      if (term === 'DEMO-GHOACRUGOL051926' || term === 'UG26A0519') {
        return [
          {
            id: 'pi-orphan-1',
            reference: 'DEMO-GHOACRUGOL051926-ABCDEF12',
            vendorReference: 'UG26A0519',
            displayedAs: 'Draft PI',
            totalAmount: 5250,
            status: 'DRAFT',
          },
        ];
      }
      return [];
    });
    getPurchaseInvoice
      .mockResolvedValueOnce({ id: 'pi-orphan-1', status: { id: 'DRAFT' } })
      .mockRejectedValueOnce(new Error('404 not found'));
    deletePurchaseInvoice.mockResolvedValue(undefined);

    const result = await restoreDemoBaseline({
      accessToken: 'token',
      businessId: 'biz-1',
      confirmation: 'RESET',
    });

    expect(deletePurchaseInvoice).toHaveBeenCalledWith('token', 'biz-1', 'pi-orphan-1');
    expect(result.unresolved.filter((item) => /Purchase Invoice/i.test(item))).toEqual([]);
  });

  it('deletes orphan Stock Movements found by Sage search and restores prices to 0', async () => {
    const orphanMovements = Array.from({ length: 6 }, (_, index) => ({
      id: `sm-orphan-${index + 1}`,
      details: `DEMO-GHOACRUGOL051926-3D85E449|SKU${index + 1}`,
    }));
    listStockMovements.mockImplementation(async (_token, _biz, term?: string) => {
      if (!term) return [];
      if (
        term === 'DEMO-GHOACRUGOL051926' ||
        term === 'DEMO-GHOACRUGOL051926-3D85E449' ||
        String(term).startsWith('DEMO-GHOACRUGOL051926')
      ) {
        // After deletes are attempted, pretend Sage no longer returns them.
        if (deleteStockMovement.mock.calls.length >= orphanMovements.length) return [];
        return orphanMovements;
      }
      return [];
    });

    const record = await captureBaseline({
      sageBusinessId: 'biz-1',
      workflowRunId: 'wf-movements',
      externalPoReference: 'GHOACRUGOL051926',
      vendorInvoiceReference: 'UG26A0519',
      customerInvoiceReference: 'GA18',
      stockItems: [stock],
      demoRunReference: 'DEMO-GHOACRUGOL051926-3D85E449',
    });

    const result = await restoreDemoBaseline({
      accessToken: 'token',
      businessId: 'biz-1',
      confirmation: 'RESET',
      activeDemoRunId: record.id,
    });

    expect(deleteStockMovement.mock.calls.map((call) => call[2]).sort()).toEqual(
      orphanMovements.map((item) => item.id).sort(),
    );
    expect(result.unresolved.filter((item) => /Stock Movement/i.test(item))).toEqual([]);
    expect(updateStockItem).toHaveBeenCalled();
    const pricePatches = updateStockItem.mock.calls.map((call) => call[3]);
    expect(pricePatches.some((patch) => patch.cost_price === 0 && patch.sales_price === 0)).toBe(
      true,
    );
    expect(result.summary.costsRestored).toBe(true);
  });
});
