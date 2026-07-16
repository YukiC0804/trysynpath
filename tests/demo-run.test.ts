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
  sku: 'ACR-MIR-SLV-3MM',
  description: 'Silver Mirror Acrylic Sheet 3mm',
  quantityInStock: 12,
  costPrice: 55,
  lastCostPrice: 50,
  averageCostPrice: 52,
  salesPrice: 102,
  raw: {},
};

describe('ghostboards baseline configuration', () => {
  it('defines canonical baseline SKUs with quantity and cost', () => {
    expect(GHOSTBOARDS_BASELINE_SKUS.map((item) => item.sku)).toEqual([
      'ACR-MIR-SLV-3MM',
      'ACR-BLK-3MM-48X96',
      'ACR-CLR-6MM-48X96',
      'ACR-CLR-3MM-48X96',
    ]);
    expect(GHOSTBOARDS_BASELINE_SKUS.find((item) => item.sku === 'ACR-MIR-SLV-3MM')).toMatchObject({
      costPrice: 68,
      quantityInStock: 16,
      reorderLevel: 10,
    });
    expect(GHOSTBOARDS_DEMO_WORKFLOW_SKUS).toEqual([
      'ACR-MIR-SLV-3MM',
      'ACR-CLR-3MM-48X96',
      'ACR-CLR-6MM-48X96',
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
      vendorInvoiceReference: 'NWA-INV-8841',
      customerInvoiceReference: 'GB-CUST-1042',
      stockItems: [stock],
    });
    expect(record.baseline).toHaveLength(1);
    expect(record.baseline[0].costPrice).toBe(55);
    expect(record.baseline[0].quantityInStock).toBe(12);
    expect(record.demoRunReference.startsWith('DEMO-GHOACRUGOL051926-')).toBe(true);
  });

  it('requires typed RESET confirmation', async () => {
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
