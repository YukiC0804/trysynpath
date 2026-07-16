import { describe, expect, it } from 'vitest';
import { discoverCapabilities } from '../api/_lib/sage/client';
import {
  GHOSTBOARDS_BASELINE_SKUS,
  GHOSTBOARDS_PRESERVED_SKUS,
  SAGE_DEMO_BASELINE,
  SAGE_DEMO_CREATED_SKUS,
  SAGE_DEMO_PURCHASE_INVOICE_REFERENCE,
} from '../api/_lib/sage/demoBaseline';

describe('Sage demo reset baseline', () => {
  it('uses empty-inventory baseline SKUs from the live PO pack', () => {
    expect(SAGE_DEMO_BASELINE.map((item) => item.sku)).toEqual([
      'ACR-WHT-3MM-48X96',
      'ACR-WHT-18MM-48X96',
      'ACR-WHT-25MM-48X96',
      'ACR-WHT-4P8MM-60X120',
      'ACR-CLR-4MM-48X96',
      'ACR-PC-CLR-9P5MM-48X96',
    ]);
    expect(
      GHOSTBOARDS_BASELINE_SKUS.every(
        (item) =>
          item.quantityInStock === 0 &&
          item.costPrice === 0 &&
          item.salesPrice === 0,
      ),
    ).toBe(true);
    expect(SAGE_DEMO_CREATED_SKUS).toEqual([]);
    expect(GHOSTBOARDS_PRESERVED_SKUS).toEqual([
      'ACR-MIR-SLV-3MM',
      'ACR-BLK-3MM-48X96',
      'ACR-CLR-6MM-48X96',
      'ACR-CLR-3MM-48X96',
    ]);
    expect(SAGE_DEMO_BASELINE.find((item) => item.sku === 'ACR-WHT-3MM-48X96')).toMatchObject({
      description: 'White Acrylic Sheet 3mm 48 × 96',
      costPrice: 0,
      salesPrice: 0,
      reorderLevel: 10,
    });
    expect(SAGE_DEMO_PURCHASE_INVOICE_REFERENCE).toBe('SYN-PO-2026-0714-001');
  });
});

describe('Sage capability discovery', () => {
  it('reports purchase order write-back as unavailable for Accounting API v3.1', () => {
    const caps = discoverCapabilities();
    expect(caps.purchaseOrders.available).toBe(false);
    expect(caps.stockItems.create).toBe(true);
    expect(caps.stockItems.update).toBe(true);
    expect(caps.stockItems.delete).toBe(true);
    expect(caps.purchaseInvoices.create).toBe(true);
    expect(caps.purchaseInvoices.delete).toBe(true);
  });
});

describe('ledger account picker', () => {
  it('uses Sage expenses visibility for Purchase Invoice ledgers', async () => {
    const { SAGE_PURCHASE_LEDGER_VISIBLE_IN } = await import('../api/_lib/sage/client');
    expect(SAGE_PURCHASE_LEDGER_VISIBLE_IN).toBe('expenses');
  });
});
