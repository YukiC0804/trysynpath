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
    const lines = structuredClone(FIXTURE_SHIPMENT.lines);
    const errors = matchShipmentLines(lines, [
      { id: '1', sku: 'acr-mir-slv-3mm' },
      { id: '2', sku: 'ACR-CLR-3MM-48X96' },
      { id: '3', sku: 'acr-clr-3mm-48x96' },
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
    const result = await orchestrator.execute(
      {} as VercelResponse,
      current,
      preview(current),
      {} as SageGateway,
      'purchase_invoice',
    );
    expect(result.idempotentReplay).toBe(true);
    expect(result.records).toHaveLength(1);
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
