import { describe, expect, it, vi, afterEach } from 'vitest';
import { FixtureDocumentExtractionAdapter } from '../api/_lib/workflow/extraction';
import { FixtureSourceAdapter } from '../api/_lib/workflow/sourceAdapters';
import {
  buildPurchaseInvoicePayload,
  buildSalesInvoicePayload,
  buildStockMovementPayloads,
  SageGateway,
} from '../api/_lib/workflow/sageGateway';
import { calculateLandedCosts } from '../api/_lib/workflow/landedCostEngine';

afterEach(() => vi.restoreAllMocks());

async function fixture() {
  const source = await new FixtureSourceAdapter().collect();
  const extraction = await new FixtureDocumentExtractionAdapter().extract(source);
  extraction.bundle.shipment.lines.forEach((line, index) => {
    line.matchedSageStockItemId = `stock-${index + 1}`;
    line.matchedSageItemCode = line.sku;
    line.matchingStatus = 'exact';
    line.matchingConfidence = 1;
  });
  extraction.bundle.customerInvoice.lines.forEach((line, index) => {
    line.matchedSageStockItemId = `stock-${index + 1}`;
  });
  return extraction.bundle;
}

describe('OpenAPI-aligned Sage payload builders', () => {
  it('builds Purchase Invoice at vendor prices, not landed prices', async () => {
    const bundle = await fixture();
    const payload = buildPurchaseInvoicePayload({
      bundle,
      reference: 'DEMO-GHOACRUGOL051926-20260716',
      selections: {
        supplierContactId: 'supplier-1',
        purchaseLedgerAccountId: 'ledger-expense',
        purchaseTaxRateId: 'GB_STANDARD',
      },
      taxPercentage: 20,
      inventoryPostingStrategy: 'stock_movement',
    });
    expect(payload).toMatchObject({
      contact_id: 'supplier-1',
      reference: 'DEMO-GHOACRUGOL051926-20260716',
      vendor_reference: 'NWA-INV-8841',
    });
    expect(payload.invoice_lines).toHaveLength(3);
    expect(payload.invoice_lines.reduce((sum, line) => sum + line.quantity * line.unit_price, 0)).toBe(
      6620,
    );
    expect(payload.invoice_lines.every((line) => !('product_id' in line))).toBe(true);
  });

  it('prevents double inventory posting between product lines and Stock Movements', async () => {
    const bundle = await fixture();
    const allocations = calculateLandedCosts(
      bundle.shipment.lines,
      bundle.landedCostComponents,
    ).allocations;
    const productPayload = buildPurchaseInvoicePayload({
      bundle,
      reference: 'DEMO-REF',
      selections: {
        supplierContactId: 'supplier',
        purchaseLedgerAccountId: 'ledger',
        purchaseTaxRateId: 'GB_NO_TAX',
      },
      inventoryPostingStrategy: 'purchase_invoice_product_lines',
    });
    expect(productPayload.invoice_lines.every((line) => 'product_id' in line)).toBe(true);
    expect(
      buildStockMovementPayloads({
        bundle,
        allocations,
        reference: 'DEMO-REF',
        strategy: 'purchase_invoice_product_lines',
      }),
    ).toEqual([]);
    expect(
      buildStockMovementPayloads({
        bundle,
        allocations,
        reference: 'DEMO-REF',
        strategy: 'stock_movement',
      }),
    ).toHaveLength(3);
  });

  it('builds required Stock Movement fields with landed cost', async () => {
    const bundle = await fixture();
    const allocations = calculateLandedCosts(
      bundle.shipment.lines,
      bundle.landedCostComponents,
    ).allocations;
    const [movement] = buildStockMovementPayloads({
      bundle,
      allocations,
      reference: 'DEMO-REF',
      strategy: 'stock_movement',
    });
    expect(movement).toMatchObject({
      stock_item_id: 'stock-1',
      quantity: 50,
      reference: 'DEMO-REF',
    });
    expect(movement.cost_price).toBeGreaterThan(68);
    expect(movement.details).toContain('not natively linked');
  });

  it('builds Sales Invoice with product, tax, shipping and source invoice reference', async () => {
    const bundle = await fixture();
    const payload = buildSalesInvoicePayload({
      bundle,
      reference: 'DEMO-REF',
      selections: {
        customerContactId: 'customer-1',
        salesLedgerAccountId: 'sales-ledger',
        salesTaxRateId: 'GB_STANDARD',
      },
      taxPercentage: 20,
    });
    expect(payload).toMatchObject({
      contact_id: 'customer-1',
      reference: 'GB-CUST-1042',
      shipping_net_amount: 85,
      shipping_tax_rate_id: 'GB_STANDARD',
    });
    expect(payload.invoice_lines[0]).toMatchObject({
      product_id: 'stock-1',
      ledger_account_id: 'sales-ledger',
      tax_rate_id: 'GB_STANDARD',
    });
  });
});

describe('SageGateway read-back verification', () => {
  it('marks a Purchase Invoice verified only after GET comparison', async () => {
    vi.spyOn(globalThis, 'fetch')
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify({
            id: 'pi-1',
            reference: 'DEMO-REF',
            contact: { id: 'supplier-1' },
          }),
          { status: 201, headers: { 'Content-Type': 'application/json' } },
        ),
      )
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify({
            id: 'pi-1',
            reference: 'DEMO-REF',
            contact: { id: 'supplier-1' },
          }),
          { status: 200, headers: { 'Content-Type': 'application/json' } },
        ),
      );
    const gateway = new SageGateway('token', 'business');
    const result = await gateway.createAndReadPurchaseInvoice({
      contact_id: 'supplier-1',
      reference: 'DEMO-REF',
    });
    expect(result.id).toBe('pi-1');
    expect(result.verified).toBe(true);
    expect(globalThis.fetch).toHaveBeenCalledTimes(2);
  });
});
