import { describe, expect, it } from 'vitest';
import type { VercelResponse } from '@vercel/node';
import type { WorkflowPreview, WorkflowRun } from '../shared/workflow';
import { FIXTURE_SHIPMENT } from '../api/_lib/workflow/fixtures';
import { matchShipmentLines } from '../api/_lib/workflow/matcher';
import { WorkflowOrchestrator } from '../api/_lib/workflow/orchestrator';
import {
  EncryptedCookieWorkflowStore,
  type WorkflowStore,
} from '../api/_lib/workflow/store';
import type { SageGateway } from '../api/_lib/workflow/sageGateway';

class MemoryStore implements WorkflowStore {
  value: WorkflowRun | null = null;
  get() {
    return this.value;
  }
  put(_res: VercelResponse, run: WorkflowRun) {
    this.value = structuredClone(run);
  }
  clear() {
    this.value = null;
  }
}

function run(): WorkflowRun {
  return {
    id: 'run-1',
    mode: 'live_sage_write',
    sourceType: 'fixture',
    externalReference: 'DEMO-GHOACRUGOL051926-20260716',
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    status: 'approved',
    approvals: {
      purchaseInvoice: 'approved',
      inventoryReceipt: 'approved',
      customerSale: 'pending',
      purchaseInvoiceRelease: 'pending',
      salesInvoiceRelease: 'pending',
    },
    approvedPayloadHashes: {
      purchaseInvoice: 'digest',
      inventoryReceipt: 'digest',
    },
    inventoryPostingStrategy: 'stock_movement',
    sourceMessageIds: [],
    sourceDocumentIds: [],
    attachmentHashes: [],
    postingRecords: [],
    errors: [],
  };
}

function preview(current: WorkflowRun): WorkflowPreview {
  return {
    run: current,
    bundle: {
      emails: [],
      documents: [],
      shipment: structuredClone(FIXTURE_SHIPMENT),
      landedCostComponents: [],
      customerInvoice: {
        sourceInvoiceNumber: 'CUST-1',
        customer: 'Customer',
        invoiceDate: '2026-01-01',
        dueDate: '2026-01-31',
        currency: 'GBP',
        reference: 'REF',
        lines: [],
        subtotal: 0,
        tax: 0,
        shipping: 0,
        total: 0,
        approvalStatus: 'pending',
      },
      extractionWarnings: [],
      fixtureExtraction: true,
    },
    extractedFields: {},
    allocations: [],
    reconciliation: {
      sourceGoodsTotal: 0,
      freightTotal: 0,
      dutyTotal: 0,
      taxTotal: 0,
      otherCharges: 0,
      totalCapitalizableCost: 0,
      totalAllocated: 0,
      variance: 0,
      withinTolerance: true,
    },
    liveSage: {
      connected: true,
      businessId: 'business',
      stockItems: [],
      contacts: [],
      ledgerAccounts: [],
      purchaseLedgerAccounts: [],
      salesLedgerAccounts: [],
      taxRates: [],
      purchaseTaxRates: [],
      salesTaxRates: [],
      currencies: [],
      artefactStatuses: [],
    },
    payloads: {
      purchaseInvoice: { reference: current.externalReference },
      stockMovements: [
        { stock_item_id: 'stock-1', reference: current.externalReference, quantity: 1 },
        { stock_item_id: 'stock-2', reference: current.externalReference, quantity: 1 },
      ],
      salesInvoice: {},
    },
    selections: { accountingMappingConfirmed: true },
    approvalDigests: {
      purchaseInvoice: 'digest',
      inventoryReceipt: 'digest',
      customerSale: 'digest',
      purchaseInvoiceRelease: 'digest',
      salesInvoiceRelease: 'digest',
    },
    validationErrors: [],
  };
}

describe('SKU matching', () => {
  it('matches item_code case-insensitively and flags ambiguous/missing values', () => {
    const [fixtureLine] = structuredClone(FIXTURE_SHIPMENT.lines);
    const lines = [
      fixtureLine,
      { ...structuredClone(fixtureLine), sku: 'AMBIGUOUS-SKU' },
      { ...structuredClone(fixtureLine), sku: 'MISSING-SKU' },
    ];
    const errors = matchShipmentLines(lines, [
      { id: '1', sku: 'ACR-WHT-3MM-48X96' },
      { id: '2', sku: 'AMBIGUOUS-SKU' },
      { id: '3', sku: 'ambiguous-sku' },
    ]);
    expect(lines[0]).toMatchObject({
      matchedSageStockItemId: '1',
      matchingStatus: 'exact',
      matchingConfidence: 1,
    });
    expect(lines[1].matchingStatus).toBe('ambiguous');
    expect(lines[2].matchingStatus).toBe('unmatched');
    expect(errors).toHaveLength(2);
  });
});

describe('WorkflowOrchestrator write safety', () => {
  it('never executes a Sage write in dry-run mode', async () => {
    const store = new MemoryStore();
    const orchestrator = new WorkflowOrchestrator(store);
    const current = { ...run(), mode: 'fixture_dry_run' as const };
    await expect(
      orchestrator.execute(
        {} as VercelResponse,
        current,
        preview(current),
        {} as SageGateway,
        'purchase_invoice',
      ),
    ).rejects.toThrow('Dry-run mode never writes');
  });

  it('preserves partial Stock Movement success and retries only failed items', async () => {
    const store = new MemoryStore();
    const orchestrator = new WorkflowOrchestrator(store);
    const current = run();
    let attempts = 0;
    const gateway = {
      businessId: 'business',
      findStockMovement: async () => undefined,
      readAndVerifyStockMovement: async (id: string) => ({
        readBack: { id },
        differences: {},
        verified: true,
      }),
      createAndReadStockMovement: async (payload: Record<string, unknown>) => {
        attempts += 1;
        if (payload.stock_item_id === 'stock-2' && attempts === 2) {
          throw new Error('synthetic movement failure');
        }
        return {
          id: `movement-${payload.stock_item_id}`,
          created: payload,
          readBack: payload,
          verified: true,
        };
      },
    } as unknown as SageGateway;
    const first = await orchestrator.execute(
      {} as VercelResponse,
      current,
      preview(current),
      gateway,
      'stock_movements',
    );
    expect(first.run.status).toBe('partial');
    expect(first.run.postingRecords.map((record) => record.status)).toEqual([
      'succeeded',
      'failed',
    ]);

    attempts = 2;
    const retry = await orchestrator.execute(
      {} as VercelResponse,
      first.run,
      preview(first.run),
      gateway,
      'stock_movements',
    );
    expect(attempts).toBe(3);
    expect(
      retry.run.postingRecords.filter((record) => record.status === 'succeeded'),
    ).toHaveLength(2);
    expect(retry.run.status).toBe('completed');
  });

  it('returns an idempotent replay for an already-created Purchase Invoice', async () => {
    const store = new MemoryStore();
    const orchestrator = new WorkflowOrchestrator(store);
    const current = run();
    current.postingRecords.push({
      workflowId: current.id,
      transactionType: 'purchase_invoice',
      sageBusinessId: 'business',
      sageTransactionId: 'pi-1',
      externalReference: current.externalReference,
      requestPayload: {},
      responseSummary: {},
      createdAt: new Date().toISOString(),
      readBackVerified: true,
      status: 'succeeded',
    });
    const gateway = {
      businessId: 'business',
      async readAndVerifyPurchaseInvoice(id: string) {
        return {
          readBack: { id },
          differences: {},
          verified: true,
        };
      },
    } as unknown as SageGateway;
    const result = await orchestrator.execute(
      {} as VercelResponse,
      current,
      preview(current),
      gateway,
      'purchase_invoice',
    );
    expect(result.idempotentReplay).toBe(true);
    expect(result.records).toHaveLength(1);
  });

  it('recreates Purchase Invoice when cookie id no longer exists in Sage', async () => {
    const store = new MemoryStore();
    const orchestrator = new WorkflowOrchestrator(store);
    const current = run();
    current.postingRecords.push({
      workflowId: current.id,
      transactionType: 'purchase_invoice',
      sageBusinessId: 'business',
      sageTransactionId: 'pi-stale',
      externalReference: current.externalReference,
      requestPayload: {},
      responseSummary: {},
      createdAt: new Date().toISOString(),
      readBackVerified: true,
      status: 'succeeded',
    });
    let created = false;
    const gateway = {
      businessId: 'business',
      async readAndVerifyPurchaseInvoice() {
        throw new Error('Sage API GET /purchase_invoices/pi-stale failed (404)');
      },
      async findPurchaseInvoiceByReference() {
        return undefined;
      },
      async createAndReadPurchaseInvoice() {
        created = true;
        return {
          id: 'pi-new',
          created: { id: 'pi-new' },
          readBack: { id: 'pi-new' },
          differences: {},
          verified: true,
        };
      },
    } as unknown as SageGateway;
    const result = await orchestrator.execute(
      {} as VercelResponse,
      current,
      preview(current),
      gateway,
      'purchase_invoice',
    );
    expect(created).toBe(true);
    expect(result.idempotentReplay).toBe(false);
    expect(
      result.run.postingRecords.some(
        (record) =>
          record.transactionType === 'purchase_invoice' &&
          record.sageTransactionId === 'pi-new',
      ),
    ).toBe(true);
  });

  it('does not idempotently replay a Purchase Invoice from a different demo reference', async () => {
    const store = new MemoryStore();
    const orchestrator = new WorkflowOrchestrator(store);
    const current = run();
    current.postingRecords.push({
      workflowId: current.id,
      transactionType: 'purchase_invoice',
      sageBusinessId: 'business',
      sageTransactionId: 'pi-old',
      externalReference: 'DEMO-GHOACRUGOL051926-OLDREF',
      requestPayload: {},
      responseSummary: {},
      createdAt: new Date().toISOString(),
      readBackVerified: true,
      status: 'succeeded',
    });
    let created = false;
    const gateway = {
      businessId: 'business',
      async findPurchaseInvoiceByReference() {
        return undefined;
      },
      async createAndReadPurchaseInvoice() {
        created = true;
        return {
          id: 'pi-new',
          created: { id: 'pi-new' },
          readBack: { id: 'pi-new' },
          differences: {},
          verified: true,
        };
      },
    } as unknown as SageGateway;
    const result = await orchestrator.execute(
      {} as VercelResponse,
      current,
      preview(current),
      gateway,
      'purchase_invoice',
    );
    expect(created).toBe(true);
    expect(result.idempotentReplay).toBe(false);
    expect(
      result.run.postingRecords.some(
        (record) =>
          record.transactionType === 'purchase_invoice' &&
          record.sageTransactionId === 'pi-new',
      ),
    ).toBe(true);
  });

  it('invalidates approval when the approved payload digest changes', async () => {
    const store = new MemoryStore();
    const orchestrator = new WorkflowOrchestrator(store);
    const current = run();
    const changed = preview(current);
    changed.approvalDigests.purchaseInvoice = 'changed-digest';
    await expect(
      orchestrator.execute(
        {} as VercelResponse,
        current,
        changed,
        {} as SageGateway,
        'purchase_invoice',
      ),
    ).rejects.toThrow('Approved payload changed');
    expect(current.approvals.purchaseInvoice).toBe('pending');
  });
});

describe('Encrypted WorkflowStore', () => {
  it('round-trips compact critical state across encrypted cookie chunks', () => {
    process.env.TOKEN_ENCRYPTION_KEY = 'workflow-test-key';
    const headers = new Map<string, string | string[] | number>();
    const response = {
      getHeader: (name: string) => headers.get(name),
      setHeader: (name: string, value: string | string[] | number) =>
        headers.set(name, value),
    } as unknown as VercelResponse;
    const store = new EncryptedCookieWorkflowStore();
    const current = run();
    current.postingRecords.push({
      workflowId: current.id,
      transactionType: 'purchase_invoice',
      sageBusinessId: 'business',
      sageTransactionId: 'pi-1',
      externalReference: current.externalReference,
      requestPayload: { invoice_lines: Array.from({ length: 30 }, (_, i) => ({ i })) },
      responseSummary: { status: 'DRAFT' },
      createdAt: new Date().toISOString(),
      readBackVerified: true,
      status: 'succeeded',
    });
    store.put(response, current);
    const setCookies = headers.get('Set-Cookie') as string[];
    const cookieHeader = setCookies
      .filter((line) => !line.includes('Max-Age=0'))
      .map((line) => line.split(';')[0])
      .join('; ');
    const restored = store.get({
      headers: { cookie: cookieHeader },
    } as never);
    expect(restored?.postingRecords[0].sageTransactionId).toBe('pi-1');
    expect(restored?.approvedPayloadHashes.purchaseInvoice).toBe('digest');
  });
});

describe('WorkflowOrchestrator accounting defaults', () => {
  it('auto-fills purchase ledger, tax and draft status from Sage reference data', async () => {
    const store = new MemoryStore();
    const orchestrator = new WorkflowOrchestrator(store);
    const { FixtureSourceAdapter } = await import('../api/_lib/workflow/sourceAdapters');
    const { FixtureDocumentExtractionAdapter } = await import('../api/_lib/workflow/extraction');
    const gateway = {
      businessId: 'business',
      async loadReferenceData() {
        return {
          stockItems: [
            {
              id: 'stock-1',
              sku: 'ACR-MIR-SLV-3MM',
              description: 'Silver Mirror',
              quantityInStock: 16,
              costPrice: 68,
              lastCostPrice: 68,
              averageCostPrice: 68,
              salesPrice: 100,
              reorderLevel: 10,
              reorderQuantity: 20,
              supplier: '',
              supplierId: '',
              supplierPartNumber: '',
              active: true,
            },
            {
              id: 'stock-2',
              sku: 'ACR-WHT-3MM-48X96',
              description: 'Clear 3mm',
              quantityInStock: 82,
              costPrice: 42.5,
              lastCostPrice: 42.5,
              averageCostPrice: 42.5,
              salesPrice: 80,
              reorderLevel: 10,
              reorderQuantity: 20,
              supplier: '',
              supplierId: '',
              supplierPartNumber: '',
              active: true,
            },
            {
              id: 'stock-3',
              sku: 'ACR-CLR-6MM-48X96',
              description: 'Clear 6mm',
              quantityInStock: 38,
              costPrice: 76,
              lastCostPrice: 76,
              averageCostPrice: 76,
              salesPrice: 120,
              reorderLevel: 10,
              reorderQuantity: 20,
              supplier: '',
              supplierId: '',
              supplierPartNumber: '',
              active: true,
            },
          ],
          contacts: [
            {
              id: 'supplier-1',
              name: 'Shanghai UGolden Industry Co., Ltd.',
              reference: 'NWA',
              typeIds: ['VENDOR'],
            },
            {
              id: 'customer-1',
              name: 'Spandex',
              reference: 'ADS',
              typeIds: ['CUSTOMER'],
            },
          ],
          ledgerAccounts: [
            { id: 'ledger-purchase', displayed_as: 'Stock / Inventory', nominal_code: '1000' },
          ],
          salesLedgerAccounts: [
            { id: 'ledger-sales', displayed_as: 'Sales - Products', nominal_code: '4000' },
          ],
          taxRates: [],
          purchaseTaxRates: [
            { id: 'GB_ZERO', displayed_as: 'No VAT', percentage: 0 },
            { id: 'GB_STANDARD', displayed_as: 'Standard 20%', percentage: 20 },
          ],
          salesTaxRates: [
            { id: 'GB_STANDARD', displayed_as: 'Standard 20%', percentage: 20 },
          ],
          currencies: [],
          artefactStatuses: [{ id: 'UNPAID', displayed_as: 'Unpaid' }],
        };
      },
      findContact(
        contacts: Array<{ id: string; name: string; typeIds: string[] }>,
        type: 'VENDOR' | 'CUSTOMER',
        name: string,
      ) {
        const lower = name.toLowerCase();
        return contacts.find(
          (contact) =>
            contact.typeIds.some((id) => id.includes(type)) &&
            contact.name.toLowerCase().includes(lower),
        );
      },
      async ensureContact(
        type: 'VENDOR' | 'CUSTOMER',
        name: string,
      ) {
        return {
          id: type === 'VENDOR' ? 'supplier-1' : 'customer-1',
          name,
          reference: '',
          typeIds: [type],
        };
      },
      async ensureStockItemsForShipment() {
        return { created: [], reused: [] };
      },
    } as unknown as SageGateway;

    const previewResult = await orchestrator.preview({
      mode: 'live_sage_write',
      source: new FixtureSourceAdapter(),
      gateway,
      extractor: new FixtureDocumentExtractionAdapter(),
      inventoryPostingStrategy: 'stock_movement',
      selections: { accountingMappingConfirmed: true },
    });

    expect(previewResult.selections.purchaseLedgerAccountId).toBe('ledger-purchase');
    expect(previewResult.selections.purchaseTaxRateId).toBe('GB_ZERO');
    expect(previewResult.selections.purchaseStatusId).toBe('DRAFT');
    expect(previewResult.selections.salesLedgerAccountId).toBe('ledger-sales');
    expect(
      previewResult.validationErrors.filter((error) =>
        /purchaseLedgerAccountId|purchaseTaxRateId|purchaseStatusId/.test(error),
      ),
    ).toEqual([]);
  });
});
