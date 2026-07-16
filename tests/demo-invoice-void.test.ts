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
    deleteStockMovement: vi.fn(),
    getStockMovement: vi.fn(async () => {
      throw new Error('404 not found');
    }),
  };
});

const stock = {
  id: 'stock-clr',
  sku: 'ACR-CLR-3MM-48X96',
  description: 'Clear Acrylic Sheet 3mm 48 × 96',
  quantityInStock: 122,
  costPrice: 48.94,
  lastCostPrice: 48.94,
  averageCostPrice: 48.94,
  salesPrice: 79,
  raw: {},
};

describe('demo reset invoice void cleanup', () => {
  beforeEach(() => {
    __resetMemoryDemoRunStore();
    vi.clearAllMocks();
    findStockItemBySku.mockImplementation(async (_token, _biz, sku: string) => ({
      ...stock,
      id: `id-${sku}`,
      sku,
      quantityInStock:
        sku === 'ACR-CLR-3MM-48X96' ? 122 : 66,
      costPrice:
        sku === 'ACR-CLR-3MM-48X96'
          ? 48.94
          : sku === 'ACR-MIR-SLV-3MM'
            ? 77.62
            : sku === 'ACR-BLK-3MM-48X96'
              ? 42
              : 55,
    }));
    getStockItem.mockImplementation(async (_token, _biz, id: string) => ({
      ...stock,
      id,
      sku: String(id).replace(/^id-/, ''),
    }));
    updateStockItem.mockImplementation(async (_token, _biz, id: string, patch) => ({
      ...stock,
      id,
      ...patch,
    }));
    createStockMovement.mockResolvedValue({ id: 'sm-adjust' });
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('hard-deletes Draft Purchase Invoices and voids Sales Invoices on Reset', async () => {
    const record = await captureBaseline({
      sageBusinessId: 'biz-1',
      workflowRunId: 'wf-1',
      externalPoReference: 'GHOACRUGOL051926',
      vendorInvoiceReference: 'NWA-INV-8841',
      customerInvoiceReference: 'GB-CUST-1042',
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

    expect(deletePurchaseInvoice).toHaveBeenCalledWith(
      'token',
      'biz-1',
      'pi-live-1',
      undefined,
    );
    expect(deleteSalesInvoice).toHaveBeenCalledWith('token', 'biz-1', 'si-live-1');
    expect(result.unresolved.filter((item) => /Invoice/i.test(item))).toEqual([]);
    expect(result.demoRun?.transactions.find((tx) => tx.type === 'purchase_invoice')?.status).toBe(
      'deleted',
    );
    expect(result.demoRun?.transactions.find((tx) => tx.type === 'sales_invoice')?.status).toBe(
      'voided',
    );
  });

  it('fails Reset when a released Purchase Invoice can only be voided', async () => {
    const record = await captureBaseline({
      sageBusinessId: 'biz-1',
      workflowRunId: 'wf-1',
      externalPoReference: 'GHOACRUGOL051926',
      vendorInvoiceReference: 'NWA-INV-8841',
      customerInvoiceReference: 'GB-CUST-1042',
      stockItems: [stock],
    });
    await appendDemoTransaction(record.id, {
      type: 'purchase_invoice',
      sageTransactionId: 'pi-released-1',
      externalReference: record.demoRunReference,
      status: 'succeeded',
      requestSummary: {},
      readBackSummary: {},
      readBackVerified: true,
      createdAt: new Date().toISOString(),
    });

    getPurchaseInvoice
      .mockResolvedValueOnce({ id: 'pi-released-1', status: { id: 'UNPAID' } })
      .mockResolvedValueOnce({ id: 'pi-released-1', status: { id: 'UNPAID' } })
      .mockResolvedValueOnce({ id: 'pi-released-1', status: { id: 'VOID' } });
    deletePurchaseInvoice
      .mockRejectedValueOnce(new Error('422 cannot delete released'))
      .mockResolvedValueOnce(undefined);

    const result = await restoreDemoBaseline({
      accessToken: 'token',
      businessId: 'biz-1',
      confirmation: 'RESET',
      activeDemoRunId: record.id,
    });

    expect(result.unresolved.some((item) => /pi-released-1/.test(item))).toBe(true);
    expect(result.unresolved.some((item) => /hard-delete/i.test(item))).toBe(true);
  });
});
