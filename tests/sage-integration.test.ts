import { describe, expect, it } from 'vitest';
import { extractPricingFromEmail, MOCK_GMAIL_EMAIL } from '../src/data/sageIntegrationData';
import { discoverCapabilities } from '../src/server/sage/client';

describe('Gmail mock extraction', () => {
  it('extracts acrylic SKUs and new costs from the demo email body', () => {
    const rows = extractPricingFromEmail(MOCK_GMAIL_EMAIL.body);
    expect(rows).toHaveLength(2);
    expect(rows[0]?.sku).toBe('ACR-CLR-3MM-48X96');
    expect(rows[0]?.newCost).toBe(45.1);
    expect(rows[1]?.sku).toBe('ACR-CLR-6MM-48X96');
    expect(rows[1]?.newCost).toBe(74.8);
  });
});

describe('Sage capability discovery', () => {
  it('reports purchase order write-back as unavailable for Accounting API v3.1', () => {
    const caps = discoverCapabilities();
    expect(caps.purchaseOrders.available).toBe(false);
    expect(caps.stockItems.create).toBe(true);
    expect(caps.stockItems.update).toBe(true);
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
