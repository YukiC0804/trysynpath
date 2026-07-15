import { describe, expect, it } from 'vitest';
import { extractPricingFromEmail, MOCK_GMAIL_EMAIL } from '../src/data/sageIntegrationData';
import { discoverCapabilities } from '../api/_lib/sage/client';
import {
  SAGE_DEMO_BASELINE,
  SAGE_DEMO_CREATED_SKUS,
  SAGE_DEMO_PURCHASE_INVOICE_REFERENCE,
} from '../api/_lib/sage/demoBaseline';

describe('Gmail mock extraction', () => {
  it('extracts acrylic SKUs and new costs from the demo email body', () => {
    const rows = extractPricingFromEmail(MOCK_GMAIL_EMAIL.body);
    expect(rows).toHaveLength(2);
    expect(rows[0]?.sku).toBe('ACR-CLR-3MM-48X96');
    expect(rows[0]?.newCost).toBe(47.35);
    expect(rows[1]?.sku).toBe('ACR-CLR-6MM-48X96');
    expect(rows[1]?.newCost).toBe(72.25);

    const baselineBySku = new Map(SAGE_DEMO_BASELINE.map((row) => [row.sku, row]));
    expect(rows.every((row) => row?.newCost !== baselineBySku.get(row!.sku)?.costPrice)).toBe(true);
  });
});

describe('Sage demo reset baseline', () => {
  it('restores original SKUs and removes the Workflow 1-created SKU', () => {
    expect(SAGE_DEMO_BASELINE.map((item) => item.sku)).toEqual(
      expect.arrayContaining([
        'ACR-MIR-SLV-3MM',
        'ACR-CLR-3MM-48X96',
        'ACR-CLR-6MM-48X96',
      ]),
    );
    expect(SAGE_DEMO_CREATED_SKUS).toContain('ACR-WHT-3MM-48X96');
    expect(SAGE_DEMO_BASELINE.map((item) => item.sku)).not.toContain(
      'ACR-WHT-3MM-48X96',
    );
    expect(SAGE_DEMO_BASELINE.find((item) => item.sku === 'ACR-MIR-SLV-3MM')).toMatchObject({
      description: 'Silver Mirror Acrylic Sheet 3mm',
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
  it('prefers sales products and stock accounts when resolving defaults', async () => {
    const { pickLedgerAccount, pickTaxRate } = await import('../api/_lib/sage/client');
    const sales = pickLedgerAccount(
      [
        { id: 'a', displayed_as: 'Bank Current (1200)', nominal_code: '1200' },
        { id: 'b', displayed_as: 'Sales - Products (4000)', nominal_code: '4000' },
        { id: 'c', displayed_as: 'Other Income (4900)', nominal_code: '4900' },
      ],
      'sales',
    );
    const purchase = pickLedgerAccount(
      [
        { id: 'd', displayed_as: 'Office Costs (7500)', nominal_code: '7500' },
        { id: 'e', displayed_as: 'Stock (1000)', nominal_code: '1000' },
      ],
      'purchase',
    );
    const tax = pickTaxRate([
      { id: 'GB_ZERO', displayed_as: 'Zero rated' },
      { id: 'GB_STANDARD', displayed_as: 'Standard 20.00%' },
    ]);
    expect(sales?.id).toBe('b');
    expect(purchase?.id).toBe('e');
    expect(tax?.id).toBe('GB_STANDARD');
  });
});

describe('duplicate SKU guard logic', () => {
  it('treats matching SKUs as duplicates regardless of case', () => {
    const existing = [{ sku: 'ACR-WHT-3MM-48X96' }];
    const candidate = 'acr-wht-3mm-48x96';
    const duplicate = existing.some((item) => item.sku.toLowerCase() === candidate.toLowerCase());
    expect(duplicate).toBe(true);
  });
});
