import { beforeEach, describe, expect, it } from 'vitest';
import {
  GHOSTBOARDS_BASELINE_MOVEMENT_REFERENCE,
  GHOSTBOARDS_BASELINE_SKUS,
  GHOSTBOARDS_DEMO_WORKFLOW_SKUS,
} from '../api/_lib/sage/demoBaseline';
import {
  appendDemoTransaction,
  buildDemoRunReference,
  captureBaseline,
  resetDemoRun,
} from '../api/_lib/demoRun/service';
import { __resetMemoryDemoRunStore } from '../api/_lib/demoRun/store';

process.env.DEMO_RUN_MEMORY_STORE = '1';
process.env.VITEST = 'true';

const stock = {
  id: 'stock-1',
  sku: 'ACR-WHT-3MM-48X96',
  description: 'White Acrylic Sheet 3mm 48 × 96',
  quantityInStock: 0,
  costPrice: 24.16,
  lastCostPrice: 24.16,
  averageCostPrice: 24.16,
  salesPrice: 39.45,
  raw: {},
};

describe('ghostboards baseline configuration', () => {
  it('defines empty-inventory baseline SKUs from the live PO pack', () => {
    expect(GHOSTBOARDS_BASELINE_SKUS.map((item) => item.sku)).toEqual([
      'ACR-WHT-3MM-48X96',
      'ACR-WHT-18MM-48X96',
      'ACR-WHT-25MM-48X96',
      'ACR-WHT-4P8MM-60X120',
      'ACR-CLR-4MM-48X96',
      'ACR-PC-CLR-9P5MM-48X96',
    ]);
    expect(
      GHOSTBOARDS_BASELINE_SKUS.every((item) => item.quantityInStock === 0),
    ).toBe(true);
    expect(GHOSTBOARDS_BASELINE_SKUS.find((item) => item.sku === 'ACR-WHT-3MM-48X96')).toMatchObject({
      costPrice: 24.16,
      salesPrice: 39.45,
      quantityInStock: 0,
    });
    expect(GHOSTBOARDS_DEMO_WORKFLOW_SKUS).toEqual([
      'ACR-WHT-3MM-48X96',
      'ACR-WHT-18MM-48X96',
      'ACR-WHT-25MM-48X96',
      'ACR-WHT-4P8MM-60X120',
      'ACR-CLR-4MM-48X96',
      'ACR-PC-CLR-9P5MM-48X96',
    ]);
    expect(GHOSTBOARDS_BASELINE_MOVEMENT_REFERENCE).toBe('GHOSTBOARDS-DEMO-BASELINE');
  });
});

describe('demo run baseline and reset bookkeeping', () => {
  beforeEach(() => {
    __resetMemoryDemoRunStore();
  });

  it('builds a unique demo run reference', () => {
    const reference = buildDemoRunReference('abcdef12-3456');
    expect(reference).toBe('DEMO-GHOACRUGOL051926-ABCDEF12');
  });

  it('captures baseline stock values for affected SKUs', async () => {
    const record = await captureBaseline({
      sageBusinessId: 'biz-1',
      workflowRunId: 'wf-1',
      externalPoReference: 'GHOACRUGOL051926',
      vendorInvoiceReference: 'UG26A0519',
      customerInvoiceReference: 'GA18',
      stockItems: [stock],
    });
    expect(record.baseline).toHaveLength(1);
    expect(record.baseline[0].costPrice).toBe(24.16);
    expect(record.baseline[0].quantityInStock).toBe(0);
    expect(record.demoRunReference.startsWith('DEMO-GHOACRUGOL051926-')).toBe(true);
  });

  it('requires typed RESET confirmation', async () => {
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
      sageTransactionId: 'pi-1',
      externalReference: record.demoRunReference,
      status: 'succeeded',
      requestSummary: {},
      readBackSummary: {},
      readBackVerified: true,
      createdAt: new Date().toISOString(),
    });
    await expect(
      resetDemoRun({
        accessToken: 'token',
        businessId: 'biz-1',
        demoRunId: record.id,
        confirmation: 'reset',
      }),
    ).rejects.toThrow(/Type RESET/);
  });
});
