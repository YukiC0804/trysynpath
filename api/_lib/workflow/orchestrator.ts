import crypto from 'crypto';
import type {
  InventoryPostingStrategy,
  SafeMode,
  SagePostingRecord,
  WorkflowPreview,
  WorkflowRun,
  WorkflowApprovalTarget,
} from '../../../shared/workflow';
import { validateNormalizedBundle } from '../../../shared/workflow';
import type { DocumentExtractionAdapter, ExtractionOverrides } from './extraction';
import { calculateLandedCosts } from './landedCostEngine';
import { matchShipmentLines } from './matcher';
import {
  buildPurchaseInvoicePayload,
  buildSalesInvoicePayload,
  buildStockMovementPayloads,
  type SagePayloadSelections,
  SageGateway,
} from './sageGateway';
import {
  createWorkflowRun,
  type WorkflowStore,
} from './store';
import {
  deduplicateSourceCollection,
  type SourceAdapter,
} from './sourceAdapters';

export type ApprovalTarget = WorkflowApprovalTarget;
export type ExecuteTarget =
  | 'purchase_invoice'
  | 'stock_movements'
  | 'sales_invoice'
  | 'purchase_invoice_release'
  | 'sales_invoice_release';

export interface PreviewInput {
  mode: SafeMode;
  source: SourceAdapter;
  extractor: DocumentExtractionAdapter;
  gateway?: SageGateway;
  existingRun?: WorkflowRun | null;
  messageIds?: string[];
  searchQuery?: string;
  overrides?: ExtractionOverrides;
  selections?: SagePayloadSelections & { accountingMappingConfirmed?: boolean };
  inventoryPostingStrategy?: InventoryPostingStrategy;
}

const dateToken = () => new Date().toISOString().slice(0, 10).replace(/-/g, '');
const digest = (value: unknown) =>
  crypto.createHash('sha256').update(JSON.stringify(value)).digest('hex');

function postingRecord(input: Omit<SagePostingRecord, 'createdAt'>): SagePostingRecord {
  return { ...input, createdAt: new Date().toISOString() };
}

export class WorkflowOrchestrator {
  constructor(private readonly store: WorkflowStore) {}

  async preview(input: PreviewInput): Promise<WorkflowPreview> {
    const collection = deduplicateSourceCollection(
      await input.source.collect({
        messageIds: input.messageIds,
        searchQuery: input.searchQuery,
      }),
    );
    const extraction = await input.extractor.extract(collection, input.overrides);
    const run =
      input.existingRun ??
      createWorkflowRun({
        id: crypto.randomUUID(),
        mode: input.mode,
        sourceType: input.source.sourceType,
        externalReference: `DEMO-${extraction.bundle.shipment.externalPoNumber}-${dateToken()}-${crypto
          .randomBytes(2)
          .toString('hex')
          .toUpperCase()}`,
        sourceMessageIds: collection.emails.map((email) => email.gmailMessageId),
        sourceDocumentIds: collection.documents.map((document) => document.metadata.id),
        attachmentHashes: collection.documents.map((document) => document.metadata.sha256),
      });
    run.mode = input.mode;
    run.sourceType = input.source.sourceType;
    run.inventoryPostingStrategy = input.inventoryPostingStrategy ?? run.inventoryPostingStrategy;
    run.updatedAt = new Date().toISOString();

    const landed = calculateLandedCosts(
      extraction.bundle.shipment.lines,
      extraction.bundle.landedCostComponents,
    );
    const validationErrors = [
      ...validateNormalizedBundle(extraction.bundle),
      ...landed.errors,
    ];

    const referenceData = input.gateway ? await input.gateway.loadReferenceData() : null;
    if (referenceData) {
      validationErrors.push(
        ...matchShipmentLines(
          extraction.bundle.shipment.lines,
          referenceData.stockItems,
        ),
      );
      for (const salesLine of extraction.bundle.customerInvoice.lines) {
        const shipmentLine = extraction.bundle.shipment.lines.find(
          (line) => line.sku.toUpperCase() === salesLine.sku.toUpperCase(),
        );
        const stock = referenceData.stockItems.find(
          (item) => item.sku.toUpperCase() === salesLine.sku.toUpperCase(),
        );
        if (stock) {
          salesLine.matchedSageStockItemId = stock.id;
          const projectedQuantity =
            stock.quantityInStock + (shipmentLine?.receivedQuantity ?? 0);
          if (salesLine.quantity > projectedQuantity) {
            validationErrors.push(
              `${salesLine.sku}: customer sale quantity exceeds projected inventory`,
            );
          }
        } else {
          validationErrors.push(`${salesLine.sku}: no Sage product for Customer Invoice`);
        }
      }
    }

    const contacts = referenceData?.contacts ?? [];
    const supplier = input.gateway?.findContact(
      contacts,
      'VENDOR',
      extraction.bundle.shipment.supplier,
    );
    const customer = input.gateway?.findContact(
      contacts,
      'CUSTOMER',
      extraction.bundle.customerInvoice.customer,
    );
    if (customer) extraction.bundle.customerInvoice.matchedSageContactId = customer.id;

    const firstStock = extraction.bundle.shipment.lines
      .map((line) =>
        referenceData?.stockItems.find((item) => item.id === line.matchedSageStockItemId),
      )
      .find(Boolean);
    const selections = {
      supplierContactId: input.selections?.supplierContactId ?? supplier?.id,
      customerContactId: input.selections?.customerContactId ?? customer?.id,
      purchaseLedgerAccountId:
        input.selections?.purchaseLedgerAccountId ??
        supplier?.defaultPurchaseLedgerAccountId ??
        firstStock?.purchaseLedgerAccountId,
      salesLedgerAccountId:
        input.selections?.salesLedgerAccountId ??
        customer?.defaultSalesLedgerAccountId ??
        firstStock?.salesLedgerAccountId,
      purchaseTaxRateId:
        input.selections?.purchaseTaxRateId ??
        firstStock?.purchaseTaxRateId,
      salesTaxRateId:
        input.selections?.salesTaxRateId ??
        customer?.defaultSalesTaxRateId ??
        firstStock?.salesTaxRateId,
      purchaseStatusId:
        input.selections?.purchaseStatusId ??
        referenceData?.artefactStatuses.find((status) => status.id === 'DRAFT')?.id,
      salesStatusId:
        input.selections?.salesStatusId ??
        referenceData?.artefactStatuses.find((status) => status.id === 'DRAFT')?.id,
      accountingMappingConfirmed: Boolean(input.selections?.accountingMappingConfirmed),
    };
    for (const [key, value] of Object.entries(selections)) {
      if (
        key !== 'accountingMappingConfirmed' &&
        !value &&
        [
          'supplierContactId',
          'customerContactId',
          'purchaseLedgerAccountId',
          'salesLedgerAccountId',
          'purchaseTaxRateId',
          'salesTaxRateId',
          'purchaseStatusId',
          'salesStatusId',
        ].includes(key)
      ) {
        validationErrors.push(`${key} requires review`);
      }
    }
    if (!selections.accountingMappingConfirmed) {
      validationErrors.push('Accounting ledger and tax mapping requires explicit confirmation');
    }
    if (!landed.reconciliation.withinTolerance) {
      validationErrors.push('Landed-cost allocation does not reconcile');
    }
    if (run.inventoryPostingStrategy === 'none') {
      validationErrors.push('Choose an inventory posting strategy before inventory approval');
    }

    const purchaseTax = referenceData?.purchaseTaxRates.find(
      (rate) => rate.id === selections.purchaseTaxRateId,
    );
    const salesTax = referenceData?.salesTaxRates.find(
      (rate) => rate.id === selections.salesTaxRateId,
    );
    const purchaseInvoice = buildPurchaseInvoicePayload({
      bundle: extraction.bundle,
      reference: run.externalReference,
      selections: {
        ...selections,
        supplierContactId: selections.supplierContactId ?? '',
        purchaseLedgerAccountId: selections.purchaseLedgerAccountId ?? '',
        purchaseTaxRateId: selections.purchaseTaxRateId ?? '',
      },
      taxPercentage: Number(purchaseTax?.percentage ?? 0),
      inventoryPostingStrategy: run.inventoryPostingStrategy,
    });
    const stockMovements = buildStockMovementPayloads({
      bundle: extraction.bundle,
      allocations: landed.allocations,
      reference: run.externalReference,
      strategy: run.inventoryPostingStrategy,
    });
    const purchaseLines = purchaseInvoice.invoice_lines as Array<{
      quantity: number;
      unit_price: number;
      tax_amount: number;
    }>;
    const purchaseInvoiceTotal = Number(
      purchaseLines
        .reduce(
          (sum, line) =>
            sum + line.quantity * line.unit_price + Number(line.tax_amount ?? 0),
          0,
        )
        .toFixed(2),
    );
    if (
      Math.abs(
        purchaseInvoiceTotal - extraction.bundle.shipment.vendorInvoiceTotal,
      ) > 0.01
    ) {
      validationErrors.push(
        `Purchase Invoice payload total ${purchaseInvoiceTotal.toFixed(
          2,
        )} does not equal source vendor invoice total ${extraction.bundle.shipment.vendorInvoiceTotal.toFixed(
          2,
        )}`,
      );
    }
    const salesInvoice = buildSalesInvoicePayload({
      bundle: extraction.bundle,
      reference: run.externalReference,
      selections: {
        ...selections,
        customerContactId: selections.customerContactId ?? '',
        salesLedgerAccountId: selections.salesLedgerAccountId ?? '',
        salesTaxRateId: selections.salesTaxRateId ?? '',
      },
      taxPercentage: Number(salesTax?.percentage ?? 0),
    });
    const purchaseRecord = [...run.postingRecords]
      .reverse()
      .find((record) => record.transactionType === 'purchase_invoice');
    const salesRecord = [...run.postingRecords]
      .reverse()
      .find((record) => record.transactionType === 'sales_invoice');
    const approvalDigests: WorkflowPreview['approvalDigests'] = {
      purchaseInvoice: digest({
        sourceDocumentIds: run.sourceDocumentIds,
        attachmentHashes: run.attachmentHashes,
        payload: purchaseInvoice,
        strategy: run.inventoryPostingStrategy,
      }),
      inventoryReceipt: digest({
        sourceDocumentIds: run.sourceDocumentIds,
        attachmentHashes: run.attachmentHashes,
        payloads:
          run.inventoryPostingStrategy === 'purchase_invoice_product_lines'
            ? purchaseInvoice.invoice_lines
            : stockMovements,
        strategy: run.inventoryPostingStrategy,
      }),
      customerSale: digest({
        sourceDocumentIds: run.sourceDocumentIds,
        attachmentHashes: run.attachmentHashes,
        payload: salesInvoice,
      }),
      purchaseInvoiceRelease: digest({
        sageTransactionId: purchaseRecord?.sageTransactionId ?? '',
      }),
      salesInvoiceRelease: digest({
        sageTransactionId: salesRecord?.sageTransactionId ?? '',
      }),
    };
    (Object.keys(approvalDigests) as ApprovalTarget[]).forEach((target) => {
      if (
        run.approvals[target] === 'approved' &&
        run.approvedPayloadHashes[target] !== approvalDigests[target]
      ) {
        run.approvals[target] = 'pending';
        delete run.approvedPayloadHashes[target];
      }
    });

    run.status = validationErrors.length ? 'draft' : 'ready';
    const preview: WorkflowPreview = {
      run,
      bundle: extraction.bundle,
      extractedFields: extraction.fields,
      allocations: landed.allocations,
      reconciliation: landed.reconciliation,
      liveSage: {
        connected: Boolean(referenceData),
        businessId: input.gateway?.businessId,
        stockItems: (referenceData?.stockItems ?? []).map((item) => ({
          id: item.id,
          itemCode: item.sku,
          description: item.description,
          quantityInStock: item.quantityInStock,
          costPrice: item.costPrice,
          lastCostPrice: item.lastCostPrice,
          averageCostPrice: item.averageCostPrice,
          purchaseLedgerAccountId: item.purchaseLedgerAccountId,
          purchaseTaxRateId: item.purchaseTaxRateId,
          salesLedgerAccountId: item.salesLedgerAccountId,
          salesTaxRateId: item.salesTaxRateId,
        })),
        contacts: contacts.map((contact) => ({
          id: contact.id,
          name: contact.name,
          reference: contact.reference,
          typeIds: contact.typeIds,
        })),
        ledgerAccounts: [
          ...new Map(
            [
              ...(referenceData?.ledgerAccounts ?? []),
              ...(referenceData?.salesLedgerAccounts ?? []),
            ].map((ledger) => [ledger.id, ledger]),
          ).values(),
        ].map((ledger) => ({
          id: ledger.id,
          name: ledger.name ?? ledger.displayed_as ?? ledger.id,
          nominalCode:
            ledger.nominal_code == null ? undefined : String(ledger.nominal_code),
        })),
        purchaseLedgerAccounts: (referenceData?.ledgerAccounts ?? []).map((ledger) => ({
          id: ledger.id,
          name: ledger.name ?? ledger.displayed_as ?? ledger.id,
          nominalCode:
            ledger.nominal_code == null ? undefined : String(ledger.nominal_code),
        })),
        salesLedgerAccounts: (referenceData?.salesLedgerAccounts ?? []).map((ledger) => ({
          id: ledger.id,
          name: ledger.name ?? ledger.displayed_as ?? ledger.id,
          nominalCode:
            ledger.nominal_code == null ? undefined : String(ledger.nominal_code),
        })),
        taxRates: (referenceData?.taxRates ?? []).map((rate) => ({
          id: rate.id,
          name: rate.name ?? rate.displayed_as ?? rate.id,
          percentage: Number(rate.percentage ?? 0),
        })),
        purchaseTaxRates: (referenceData?.purchaseTaxRates ?? []).map((rate) => ({
          id: rate.id,
          name: rate.name ?? rate.displayed_as ?? rate.id,
          percentage: Number(rate.percentage ?? 0),
        })),
        salesTaxRates: (referenceData?.salesTaxRates ?? []).map((rate) => ({
          id: rate.id,
          name: rate.name ?? rate.displayed_as ?? rate.id,
          percentage: Number(rate.percentage ?? 0),
        })),
        currencies: (referenceData?.currencies ?? []).map((currency) => ({
          id: currency.id,
          name: currency.displayed_as ?? currency.id,
        })),
        artefactStatuses: (referenceData?.artefactStatuses ?? []).map((status) => ({
          id: status.id,
          name: status.displayed_as ?? status.id,
        })),
      },
      payloads: { purchaseInvoice, stockMovements, salesInvoice },
      selections,
      approvalDigests,
      validationErrors: [...new Set(validationErrors)],
    };
    return preview;
  }

  savePreviewRun(response: Parameters<WorkflowStore['put']>[0], run: WorkflowRun) {
    this.store.put(response, run);
  }

  approve(
    response: Parameters<WorkflowStore['put']>[0],
    run: WorkflowRun,
    target: ApprovalTarget,
    confirmation: string,
    approvalDigest: string,
    strategy?: InventoryPostingStrategy,
  ) {
    if (run.mode !== 'live_sage_write') {
      throw new Error('Switch to Live Sage Write before approval');
    }
    if (confirmation !== run.externalReference) {
      throw new Error(`Type the exact transaction reference: ${run.externalReference}`);
    }
    if (
      target === 'purchaseInvoice' &&
      (!strategy || strategy === 'none')
    ) {
      throw new Error(
        'Choose the inventory posting strategy before approving the Purchase Invoice',
      );
    }
    if (
      target === 'purchaseInvoice' &&
      strategy === 'purchase_invoice_product_lines' &&
      run.approvals.inventoryReceipt !== 'approved'
    ) {
      throw new Error(
        'Approve Inventory Receipt before a product-linked Purchase Invoice',
      );
    }
    if (target === 'inventoryReceipt') {
      if (!strategy || strategy === 'none') throw new Error('Choose an inventory posting strategy');
      run.inventoryPostingStrategy = strategy;
    }
    run.approvals[target] = 'approved';
    run.approvedPayloadHashes[target] = approvalDigest;
    run.status = 'approved';
    run.updatedAt = new Date().toISOString();
    this.store.put(response, run);
    return run;
  }

  async execute(
    response: Parameters<WorkflowStore['put']>[0],
    run: WorkflowRun,
    preview: WorkflowPreview,
    gateway: SageGateway,
    target: ExecuteTarget,
  ) {
    if (run.mode !== 'live_sage_write') throw new Error('Dry-run mode never writes to Sage');
    const approvalMap: Record<ExecuteTarget, ApprovalTarget> = {
      purchase_invoice: 'purchaseInvoice',
      stock_movements: 'inventoryReceipt',
      sales_invoice: 'customerSale',
      purchase_invoice_release: 'purchaseInvoiceRelease',
      sales_invoice_release: 'salesInvoiceRelease',
    };
    if (run.approvals[approvalMap[target]] !== 'approved') {
      throw new Error(`${approvalMap[target]} requires separate approval`);
    }
    const approvalTarget = approvalMap[target];
    if (
      !run.approvedPayloadHashes[approvalTarget] ||
      run.approvedPayloadHashes[approvalTarget] !==
        preview.approvalDigests[approvalTarget]
    ) {
      run.approvals[approvalTarget] = 'pending';
      delete run.approvedPayloadHashes[approvalTarget];
      this.store.put(response, run);
      throw new Error(
        'Approved payload changed after review. Refresh the preview and approve again.',
      );
    }
    const successful = run.postingRecords.filter(
      (record) => record.transactionType === target.replace(/s$/, '') && record.status === 'succeeded',
    );
    if (target !== 'stock_movements' && successful.length) {
      return { run, idempotentReplay: true, records: successful };
    }

    run.status = 'posting';
    try {
      if (target === 'purchase_invoice') {
        const payload = preview.payloads.purchaseInvoice as Record<string, unknown>;
        const existing = await gateway.findPurchaseInvoiceByReference(run.externalReference);
        const result = existing
          ? {
              id: existing.id,
              created: existing,
              ...(await gateway.readAndVerifyPurchaseInvoice(existing.id, payload)),
            }
          : await gateway.createAndReadPurchaseInvoice(payload);
        run.postingRecords.push(
          postingRecord({
            workflowId: run.id,
            transactionType: 'purchase_invoice',
            sageBusinessId: gateway.businessId,
            sageTransactionId: result.id,
            externalReference: run.externalReference,
            requestPayload: payload,
            responseSummary: result.readBack,
            readBackVerified: result.verified,
            differences: 'differences' in result ? result.differences : {},
            status: result.verified ? 'succeeded' : 'failed',
          }),
        );
      } else if (target === 'stock_movements') {
        if (run.inventoryPostingStrategy !== 'stock_movement') {
          throw new Error(
            'Separate Stock Movements are disabled for purchase_invoice_product_lines strategy',
          );
        }
        for (const raw of preview.payloads.stockMovements) {
          const payload = raw as Record<string, unknown>;
          const stockItemId = String(payload.stock_item_id ?? '');
          const alreadyPosted = run.postingRecords.find(
            (record) =>
              record.transactionType === 'stock_movement' &&
              record.externalReference === `${run.externalReference}:${stockItemId}` &&
              record.status === 'succeeded',
          );
          if (alreadyPosted) continue;
          const existing = await gateway.findStockMovement(
            run.externalReference,
            stockItemId,
          );
          try {
            const result = existing
              ? {
                  id: String(existing.id ?? ''),
                  created: existing,
                  ...(await gateway.readAndVerifyStockMovement(
                    String(existing.id ?? ''),
                    payload,
                  )),
                }
              : await gateway.createAndReadStockMovement(payload);
            run.postingRecords = run.postingRecords.filter(
              (record) =>
                !(
                  record.transactionType === 'stock_movement' &&
                  record.externalReference ===
                    `${run.externalReference}:${stockItemId}` &&
                  record.status === 'failed'
                ),
            );
            run.postingRecords.push(
              postingRecord({
                workflowId: run.id,
                transactionType: 'stock_movement',
                sageBusinessId: gateway.businessId,
                sageTransactionId: result.id,
                externalReference: `${run.externalReference}:${stockItemId}`,
                requestPayload: payload,
                responseSummary: result.readBack,
                readBackVerified: result.verified,
                differences: 'differences' in result ? result.differences : {},
                status: result.verified ? 'succeeded' : 'failed',
              }),
            );
          } catch (error) {
            run.postingRecords.push(
              postingRecord({
                workflowId: run.id,
                transactionType: 'stock_movement',
                sageBusinessId: gateway.businessId,
                sageTransactionId: '',
                externalReference: `${run.externalReference}:${stockItemId}`,
                requestPayload: payload,
                responseSummary: {},
                readBackVerified: false,
                status: 'failed',
                error: error instanceof Error ? error.message : 'Stock Movement failed',
              }),
            );
            run.status = 'partial';
            break;
          }
        }
      } else if (target === 'sales_invoice') {
        const payload = preview.payloads.salesInvoice as Record<string, unknown>;
        const sourceReference = preview.bundle.customerInvoice.sourceInvoiceNumber;
        const existing = await gateway.findSalesInvoiceByReference(sourceReference);
        const result = existing
          ? {
              id: String(existing.id ?? ''),
              created: existing,
              ...(await gateway.readAndVerifySalesInvoice(
                String(existing.id ?? ''),
                payload,
              )),
            }
          : await gateway.createAndReadSalesInvoice(payload);
        run.postingRecords.push(
          postingRecord({
            workflowId: run.id,
            transactionType: 'sales_invoice',
            sageBusinessId: gateway.businessId,
            sageTransactionId: result.id,
            externalReference: sourceReference,
            requestPayload: payload,
            responseSummary: result.readBack,
            readBackVerified: result.verified,
            differences: 'differences' in result ? result.differences : {},
            status: result.verified ? 'succeeded' : 'failed',
          }),
        );
      } else {
        const invoiceType =
          target === 'purchase_invoice_release' ? 'purchase_invoice' : 'sales_invoice';
        const invoice = [...run.postingRecords]
          .reverse()
          .find(
            (record) =>
              record.transactionType === invoiceType && record.status === 'succeeded',
          );
        if (!invoice) throw new Error(`Create ${invoiceType} before release`);
        const releaseResult =
          target === 'purchase_invoice_release'
            ? await gateway.releasePurchaseInvoice(invoice.sageTransactionId)
            : await gateway.releaseSalesInvoice(invoice.sageTransactionId);
        run.postingRecords.push(
          postingRecord({
            workflowId: run.id,
            transactionType: target,
            sageBusinessId: gateway.businessId,
            sageTransactionId: invoice.sageTransactionId,
            externalReference: invoice.externalReference,
            requestPayload: {},
            responseSummary: releaseResult.readBack,
            readBackVerified: releaseResult.verified,
            status: releaseResult.verified ? 'succeeded' : 'failed',
          }),
        );
      }
      if (run.status !== 'partial') {
        run.status = run.postingRecords.some((record) => record.status === 'failed')
          ? 'partial'
          : 'completed';
      }
    } catch (error) {
      run.status = run.postingRecords.some((record) => record.status === 'succeeded')
        ? 'partial'
        : 'failed';
      run.errors.push(error instanceof Error ? error.message : 'Unknown workflow failure');
      this.store.put(response, run);
      throw error;
    }
    run.updatedAt = new Date().toISOString();
    this.store.put(response, run);
    return { run, idempotentReplay: false, records: run.postingRecords };
  }
}
