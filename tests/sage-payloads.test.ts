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
import { sanitizeContactPayload } from '../api/_lib/sage/payloadAllowlist';

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
  it('allows only documented fields when creating a demo contact', () => {
    expect(
      sanitizeContactPayload({
        name: 'Acrylic Display Studio',
        contact_type_ids: ['CUSTOMER'],
        reference: 'SYN-DEMO-CUSTOMER',
        notes: 'Created by the Synpath Ghostboards demo',
        currency_id: 'GBP',
        main_address: { address_line_1: 'Acrylic Display Studio' },
        unsupported: 'do not send',
      }),
    ).toEqual({
      name: 'Acrylic Display Studio',
      contact_type_ids: ['CUSTOMER'],
      reference: 'SYN-DEMO-CUSTOMER',
      notes: 'Created by the Synpath Ghostboards demo',
      currency_id: 'GBP',
      main_address: { address_line_1: 'Acrylic Display Studio' },
    });
  });

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
    expect(payload).not.toHaveProperty('main_address');
    expect(payload.invoice_lines).toHaveLength(1);
    expect(payload.invoice_lines.reduce((sum, line) => sum + line.quantity * line.unit_price, 0)).toBe(
      5250,
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
    ).toHaveLength(1);
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
      quantity: 100,
      cost_price: 62.01,
    });
    expect(movement).not.toHaveProperty('reference');
    expect(movement.cost_price).toBeGreaterThan(52.5);
    expect(String(movement.details).length).toBeLessThanOrEqual(50);
    expect(movement.details).toContain('DEMO-REF');
    expect(movement.details).toContain('ACR-CLR-3MM-48X96');
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
      reference: 'DEMO-REF',
      shipping_net_amount: 0,
      shipping_tax_rate_id: 'GB_STANDARD',
    });
    expect(payload.notes).toContain('GB-CUST-1042');
    expect(payload.main_address).toMatchObject({ country_id: 'GB' });
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

  it('treats ledger remaps as soft diffs so live drafts still verify', async () => {
    vi.spyOn(globalThis, 'fetch')
      .mockResolvedValueOnce(
        new Response(JSON.stringify({ id: 'pi-soft', reference: 'DEMO-REF' }), {
          status: 201,
          headers: { 'Content-Type': 'application/json' },
        }),
      )
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify({
            id: 'pi-soft',
            reference: 'DEMO-REF',
            contact: { id: 'supplier-1' },
            date: '2026-05-19T00:00:00Z',
            currency: { id: 'currency-uuid' },
            vendor_reference: 'NWA-INV-8841',
            invoice_lines: [
              {
                quantity: 100,
                unit_price: 52.5,
                ledger_account_id: 'remapped-ledger',
              },
            ],
          }),
          { status: 200, headers: { 'Content-Type': 'application/json' } },
        ),
      );
    const result = await new SageGateway('token', 'business').createAndReadPurchaseInvoice({
      contact_id: 'supplier-1',
      reference: 'DEMO-REF',
      vendor_reference: 'NWA-INV-8841',
      date: '2026-05-19',
      invoice_lines: [
        {
          quantity: 100,
          unit_price: 52.5,
          ledger_account_id: 'ledger-1',
        },
      ],
    });
    expect(result.verified).toBe(true);
    expect(result.differences).toHaveProperty('line.0.ledgerAccountId');
  });

  it('ignores Sage-recalculated tax and status when verifying Purchase Invoice', async () => {
    vi.spyOn(globalThis, 'fetch')
      .mockResolvedValueOnce(
        new Response(JSON.stringify({ id: 'pi-2', reference: 'DEMO-REF' }), {
          status: 201,
          headers: { 'Content-Type': 'application/json' },
        }),
      )
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify({
            id: 'pi-2',
            reference: 'DEMO-REF',
            contact: { id: 'supplier-1' },
            status: { id: 'DRAFT' },
            vendor_reference: 'NWA-INV-8841',
            date: '2026-05-19',
            invoice_lines: [
              {
                quantity: 50,
                unit_price: 68,
                tax_amount: 999,
                ledger_account: { id: 'ledger-1' },
              },
            ],
          }),
          { status: 200, headers: { 'Content-Type': 'application/json' } },
        ),
      );
    const result = await new SageGateway('token', 'business').createAndReadPurchaseInvoice({
      contact_id: 'supplier-1',
      reference: 'DEMO-REF',
      vendor_reference: 'NWA-INV-8841',
      date: '2026-05-19',
      status_id: 'DRAFT',
      invoice_lines: [
        {
          quantity: 50,
          unit_price: 68,
          tax_amount: 0,
          ledger_account_id: 'ledger-1',
        },
      ],
    });
    expect(result.verified).toBe(true);
  });

  it('verifies release only when read-back leaves Draft', async () => {
    vi.spyOn(globalThis, 'fetch')
      .mockResolvedValueOnce(
        new Response(JSON.stringify({ id: 'pi-1', status: { id: 'UNPAID' } }), {
          status: 201,
          headers: { 'Content-Type': 'application/json' },
        }),
      )
      .mockResolvedValueOnce(
        new Response(JSON.stringify({ id: 'pi-1', status: { id: 'UNPAID' } }), {
          status: 200,
          headers: { 'Content-Type': 'application/json' },
        }),
      );
    const result = await new SageGateway('token', 'business').releasePurchaseInvoice(
      'pi-1',
    );
    expect(result.verified).toBe(true);
  });

  it('does not verify release while read-back remains Draft', async () => {
    vi.spyOn(globalThis, 'fetch')
      .mockResolvedValueOnce(
        new Response(JSON.stringify({ id: 'pi-1', status: { id: 'DRAFT' } }), {
          status: 201,
          headers: { 'Content-Type': 'application/json' },
        }),
      )
      .mockResolvedValueOnce(
        new Response(JSON.stringify({ id: 'pi-1', status: { id: 'DRAFT' } }), {
          status: 200,
          headers: { 'Content-Type': 'application/json' },
        }),
      );
    const result = await new SageGateway('token', 'business').releasePurchaseInvoice(
      'pi-1',
    );
    expect(result.verified).toBe(false);
  });
});

describe('Sage UK payload allowlists', () => {
  it('strips purchase invoice main_address and stock movement reference', async () => {
    const {
      sanitizePurchaseInvoicePayload,
      sanitizeStockMovementPayload,
    } = await import('../api/_lib/sage/payloadAllowlist');
    const pi = sanitizePurchaseInvoicePayload({
      contact_id: 'c1',
      date: '2026-05-19',
      due_date: '2026-06-02',
      reference: 'DEMO-1',
      vendor_reference: 'NWA-1',
      main_address: { address_line_1: 'should not send' },
      vat_reverse_charge: true,
      invoice_lines: [
        {
          description: 'line',
          ledger_account_id: 'l1',
          quantity: 1,
          unit_price: 10,
          tax_rate_id: 'GB_ZERO',
          tax_amount: 0,
          mystery: 'nope',
        },
      ],
    });
    expect(pi).not.toHaveProperty('main_address');
    expect(pi).not.toHaveProperty('vat_reverse_charge');
    expect(pi.invoice_lines).toEqual([
      {
        description: 'line',
        ledger_account_id: 'l1',
        quantity: 1,
        unit_price: 10,
        tax_rate_id: 'GB_ZERO',
        tax_amount: 0,
      },
    ]);

    const movement = sanitizeStockMovementPayload({
      stock_item_id: 's1',
      date: '2026-06-02',
      quantity: 5,
      cost_price: 12.34,
      details: 'DEMO-1|SKU',
      reference: 'must-omit-for-uk',
      movement_number: '01',
    });
    expect(movement).not.toHaveProperty('reference');
    expect(movement).toMatchObject({
      stock_item_id: 's1',
      date: '2026-06-02',
      quantity: 5,
      cost_price: 12.34,
      details: 'DEMO-1|SKU',
    });
  });
});
