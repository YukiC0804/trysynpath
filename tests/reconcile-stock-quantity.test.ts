import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  captureBaseline,
  reconcileStockItemQuantity,
} from '../api/_lib/demoRun/service';
import { __resetMemoryDemoRunStore } from '../api/_lib/demoRun/store';

process.env.DEMO_RUN_MEMORY_STORE = '1';
process.env.VITEST = 'true';

const {
  createStockMovement,
  getStockItem,
  getActiveDemoRunForBusiness,
} = vi.hoisted(() => ({
  createStockMovement: vi.fn(),
  getStockItem: vi.fn(),
  getActiveDemoRunForBusiness: vi.fn(async () => null),
}));

vi.mock('../api/_lib/sage/client', async () => {
  const actual = await vi.importActual<typeof import('../api/_lib/sage/client')>(
    '../api/_lib/sage/client',
  );
  return {
    ...actual,
    createStockMovement,
    getStockItem,
  };
});

vi.mock('../api/_lib/demoRun/store', async () => {
  const actual = await vi.importActual<typeof import('../api/_lib/demoRun/store')>(
    '../api/_lib/demoRun/store',
  );
  return {
    ...actual,
    getActiveDemoRunForBusiness,
  };
});

describe('reconcileStockItemQuantity', () => {
  beforeEach(() => {
    __resetMemoryDemoRunStore();
    vi.clearAllMocks();
    getActiveDemoRunForBusiness.mockResolvedValue(null);
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('posts a corrective Stock Movement when on-hand qty is short', async () => {
    const record = await captureBaseline({
      sageBusinessId: 'biz-1',
      workflowRunId: 'wf-1',
      externalPoReference: 'GHOACRUGOL051926',
      vendorInvoiceReference: 'UG26A0519',
      customerInvoiceReference: 'GA18',
      stockItems: [
        {
          id: 'stock-1',
          sku: 'ACR-WHT-3MM-48X96',
          description: 'COLORED ACRYLIC SHEET 3mm x 48" x 96" WHITE',
          quantityInStock: 0,
          costPrice: 0,
          lastCostPrice: 0,
          averageCostPrice: 0,
          salesPrice: 0,
        },
      ],
      forceNew: true,
    });

    getStockItem
      .mockResolvedValueOnce({
        id: 'stock-1',
        sku: 'ACR-WHT-3MM-48X96',
        quantityInStock: 0,
        costPrice: 33.02,
      })
      .mockResolvedValueOnce({
        id: 'stock-1',
        sku: 'ACR-WHT-3MM-48X96',
        quantityInStock: 102,
        costPrice: 33.02,
      });
    createStockMovement.mockResolvedValue({ id: 'sm-adj-1' });

    const result = await reconcileStockItemQuantity({
      accessToken: 'token',
      businessId: 'biz-1',
      demoRunId: record.id,
      demoRunReference: record.demoRunReference,
      stockItemId: 'stock-1',
      sku: 'ACR-WHT-3MM-48X96',
      targetQuantity: 102,
      costPrice: 33.02,
      date: '2026-05-19',
    });

    expect(createStockMovement).toHaveBeenCalledWith(
      'token',
      'biz-1',
      expect.objectContaining({
        stock_item_id: 'stock-1',
        quantity: 102,
        cost_price: 33.02,
      }),
    );
    expect(String(createStockMovement.mock.calls[0][2].details)).toContain('ACR-WHT-3MM-48X96');
    expect(String(createStockMovement.mock.calls[0][2].details).length).toBeLessThanOrEqual(50);
    expect(result).toMatchObject({
      adjusted: true,
      before: 0,
      after: 102,
      remainingGap: 0,
      movementId: 'sm-adj-1',
    });
  });

  it('starts a new demo run after reset_incomplete instead of reusing leftovers', async () => {
    getActiveDemoRunForBusiness.mockResolvedValue({
      id: 'old-run',
      demoRunReference: 'DEMO-GHOACRUGOL051926-OLDREF01',
      sageBusinessId: 'biz-1',
      status: 'reset_incomplete',
      transactions: [
        {
          type: 'stock_movement',
          sageTransactionId: 'sm-old',
          status: 'succeeded',
        },
      ],
    });

    const record = await captureBaseline({
      sageBusinessId: 'biz-1',
      workflowRunId: 'wf-2',
      externalPoReference: 'GHOACRUGOL051926',
      vendorInvoiceReference: 'UG26A0519',
      customerInvoiceReference: 'GA18',
      stockItems: [
        {
          id: 'stock-1',
          sku: 'ACR-WHT-3MM-48X96',
          description: 'sheet',
          quantityInStock: 0,
          costPrice: 0,
          lastCostPrice: 0,
          averageCostPrice: 0,
          salesPrice: 0,
        },
      ],
      forceNew: true,
    });

    expect(record.id).not.toBe('old-run');
    expect(record.demoRunReference).not.toBe('DEMO-GHOACRUGOL051926-OLDREF01');
    expect(record.transactions).toEqual([]);
  });
});
