import type {
  AllocationMethod,
  DocumentType,
  SourceDocument,
  WorkflowPreview,
  WorkflowRun,
} from '../../../../shared/workflow';

export const PO_REFERENCE = 'GHOACRUGOL051926';

export type CfoStageId =
  | 'documents'
  | 'landedCost'
  | 'review'
  | 'purchaseInvoice'
  | 'inventory'
  | 'customerInvoice'
  | 'salesInvoice';

export type CfoStageStatus =
  | 'Pending'
  | 'Processing'
  | 'Ready for Review'
  | 'Completed'
  | 'Needs Attention';

export const STAGE_META: Array<{ id: CfoStageId; label: string; title: string }> = [
  {
    id: 'documents',
    label: 'Purchase & Shipment Documents',
    title: '1. Read Purchase & Shipment Documents',
  },
  {
    id: 'landedCost',
    label: 'Landed Cost Calculation',
    title: '2. Calculate Landed Cost by SKU',
  },
  {
    id: 'review',
    label: 'Review & Approve',
    title: '3. Review & Approve',
  },
  {
    id: 'purchaseInvoice',
    label: 'Sage Purchase Invoice',
    title: '4. Create Purchase Invoice in Sage',
  },
  {
    id: 'inventory',
    label: 'Inventory Receipt',
    title: '5. Receive Inventory at Landed Cost',
  },
  {
    id: 'customerInvoice',
    label: 'Customer Invoice',
    title: '6. Read Customer Invoice',
  },
  {
    id: 'salesInvoice',
    label: 'Sage Sales Invoice',
    title: '7. Create Sales Invoice in Sage',
  },
];

export const PURCHASE_DOC_TYPES: DocumentType[] = [
  'purchase_order',
  'vendor_invoice',
  'packing_list',
  'freight_invoice',
  'customs_duty',
  'pricing_csv',
];

export const REQUIRED_PURCHASE_DOC_TYPES: DocumentType[] = [
  'purchase_order',
  'vendor_invoice',
  'packing_list',
  'freight_invoice',
  'customs_duty',
];

export function documentTypeLabel(type: DocumentType): string {
  switch (type) {
    case 'purchase_order':
      return 'Purchase Order';
    case 'vendor_invoice':
      return 'Vendor Invoice';
    case 'packing_list':
      return 'Bill of Lading or Packing List';
    case 'freight_invoice':
      return 'Freight Invoice';
    case 'customs_duty':
      return 'Customs, Duties or Tax Document';
    case 'pricing_csv':
      return 'Excel Pricing and Inventory File';
    case 'customer_invoice':
      return 'Customer Invoice';
    default:
      return 'Document';
  }
}

export function allocationMethodLabel(method: AllocationMethod): string {
  switch (method) {
    case 'product_value':
      return 'Product Value';
    case 'quantity':
      return 'Quantity';
    case 'weight':
      return 'Weight';
    case 'volume':
      return 'Volume';
    case 'manual_percentage':
    case 'manual_amount':
      return 'Manual Allocation';
    default:
      return method;
  }
}

export function money(value: number, currency = 'GBP'): string {
  return new Intl.NumberFormat('en-GB', {
    style: 'currency',
    currency,
    minimumFractionDigits: 2,
  }).format(value);
}

export function purchaseDocuments(preview: WorkflowPreview | null): SourceDocument[] {
  if (!preview) return [];
  return preview.bundle.documents.filter((doc) => doc.documentType !== 'customer_invoice');
}

export function customerDocuments(preview: WorkflowPreview | null): SourceDocument[] {
  if (!preview) return [];
  return preview.bundle.documents.filter((doc) => doc.documentType === 'customer_invoice');
}

export function hasRequiredPurchaseDocs(preview: WorkflowPreview | null): boolean {
  if (!preview) return false;
  const types = new Set(purchaseDocuments(preview).map((doc) => doc.documentType));
  return REQUIRED_PURCHASE_DOC_TYPES.every((type) => types.has(type));
}

export function selectedAllocationMethod(preview: WorkflowPreview): AllocationMethod {
  const capitalizable = preview.bundle.landedCostComponents.find(
    (component) => component.capitalizable,
  );
  return capitalizable?.allocationMethod ?? 'product_value';
}

export function accountingReady(preview: WorkflowPreview | null): boolean {
  if (!preview) return false;
  const s = preview.selections;
  return Boolean(
    s.supplierContactId &&
      s.customerContactId &&
      s.purchaseLedgerAccountId &&
      s.salesLedgerAccountId &&
      s.purchaseTaxRateId &&
      s.salesTaxRateId &&
      s.purchaseStatusId &&
      s.salesStatusId,
  );
}

export function purchaseInvoiceRecord(run: WorkflowRun) {
  return [...run.postingRecords]
    .reverse()
    .find((record) => record.transactionType === 'purchase_invoice');
}

export function stockMovementRecords(run: WorkflowRun) {
  return run.postingRecords.filter((record) => record.transactionType === 'stock_movement');
}

export function salesInvoiceRecord(run: WorkflowRun) {
  return [...run.postingRecords]
    .reverse()
    .find((record) => record.transactionType === 'sales_invoice');
}

export function purchaseWorkflowComplete(run: WorkflowRun): boolean {
  const purchase = purchaseInvoiceRecord(run);
  const movements = stockMovementRecords(run);
  const succeeded = movements.filter((record) => record.status === 'succeeded');
  return Boolean(
    purchase?.status === 'succeeded' &&
      purchase.readBackVerified &&
      succeeded.length > 0 &&
      !movements.some((record) => record.status === 'failed'),
  );
}

export function salesWorkflowComplete(run: WorkflowRun): boolean {
  const sales = salesInvoiceRecord(run);
  return Boolean(sales?.status === 'succeeded' && sales.readBackVerified);
}

export function workflowFullyComplete(preview: WorkflowPreview | null): boolean {
  if (!preview) return false;
  return purchaseWorkflowComplete(preview.run) && salesWorkflowComplete(preview.run);
}

export function matchedSkuCount(preview: WorkflowPreview): number {
  return preview.bundle.shipment.lines.filter(
    (line) => line.matchingStatus === 'exact' || line.matchingStatus === 'confirmed',
  ).length;
}

export function inventoryAvailability(
  preview: WorkflowPreview,
): 'available' | 'review' {
  const lines = preview.bundle.customerInvoice.lines;
  const customerMatched = Boolean(
    preview.bundle.customerInvoice.matchedSageContactId ||
      preview.selections.customerContactId,
  );
  if (!customerMatched) return 'review';
  for (const line of lines) {
    if (!line.matchedSageStockItemId) return 'review';
  }

  // After Workflow 2 verified Stock Movements, inventory for this demo is ready.
  if (purchaseWorkflowComplete(preview.run)) return 'available';

  for (const line of lines) {
    const stock = preview.liveSage.stockItems.find(
      (item) => item.id === line.matchedSageStockItemId,
    );
    const shipmentLine = preview.bundle.shipment.lines.find(
      (item) => item.sku.toUpperCase() === line.sku.toUpperCase(),
    );
    const projected =
      (stock?.quantityInStock ?? 0) + (shipmentLine?.receivedQuantity ?? 0);
    if (!stock || projected < line.quantity) return 'review';
  }
  return 'available';
}

export function salesBlockedReason(preview: WorkflowPreview | null): string | null {
  if (!preview) return 'Complete Workflow 1 first.';
  if (!purchaseWorkflowComplete(preview.run)) {
    return 'Complete purchase and inventory posting first.';
  }
  const invoice = preview.bundle.customerInvoice;
  if (!invoice.sourceInvoiceNumber) return 'Customer Invoice is missing.';
  if (!invoice.matchedSageContactId && !preview.selections.customerContactId) {
    return `Customer "${invoice.customer}" was not matched in Sage. Create or rename the Sage customer contact, then reload Workflow 1.`;
  }
  const unmatched = invoice.lines.filter((line) => !line.matchedSageStockItemId);
  if (unmatched.length) {
    return `Customer Invoice SKUs not matched in Sage: ${unmatched.map((line) => line.sku).join(', ')}`;
  }
  if (inventoryAvailability(preview) !== 'available') {
    return 'Inventory is not available for the Customer Invoice quantities.';
  }
  return null;
}

export function statusVariant(
  status: CfoStageStatus,
): 'healthy' | 'warning' | 'danger' | 'neutral' | 'ai' {
  switch (status) {
    case 'Completed':
      return 'healthy';
    case 'Processing':
      return 'ai';
    case 'Ready for Review':
      return 'warning';
    case 'Needs Attention':
      return 'danger';
    default:
      return 'neutral';
  }
}

export function computeStageStatuses(
  preview: WorkflowPreview | null,
  activeStage: CfoStageId,
  processingStage: CfoStageId | null,
  customerInvoiceLoaded: boolean,
): Record<CfoStageId, CfoStageStatus> {
  const statuses: Record<CfoStageId, CfoStageStatus> = {
    documents: 'Pending',
    landedCost: 'Pending',
    review: 'Pending',
    purchaseInvoice: 'Pending',
    inventory: 'Pending',
    customerInvoice: 'Pending',
    salesInvoice: 'Pending',
  };

  if (processingStage) {
    statuses[processingStage] = 'Processing';
  }

  if (!preview) {
    if (activeStage === 'documents' && !processingStage) {
      statuses.documents = 'Ready for Review';
    }
    return statuses;
  }

  const run = preview.run;
  const docsReady = hasRequiredPurchaseDocs(preview);
  const reconciled = preview.reconciliation.withinTolerance;
  const purchase = purchaseInvoiceRecord(run);
  const movements = stockMovementRecords(run);
  const sales = salesInvoiceRecord(run);
  const purchaseDone = purchaseWorkflowComplete(run);
  const salesDone = salesWorkflowComplete(run);

  statuses.documents = docsReady ? 'Completed' : 'Needs Attention';
  statuses.landedCost = !docsReady
    ? 'Pending'
    : !reconciled
      ? 'Needs Attention'
      : activeStage === 'landedCost'
        ? 'Ready for Review'
        : 'Completed';
  statuses.review = !docsReady || !reconciled
    ? 'Pending'
    : purchaseDone || run.approvals.purchaseInvoice === 'approved'
      ? 'Completed'
      : activeStage === 'review'
        ? 'Ready for Review'
        : 'Pending';

  if (purchase?.status === 'succeeded' && purchase.readBackVerified) {
    statuses.purchaseInvoice = 'Completed';
  } else if (purchase?.status === 'failed') {
    statuses.purchaseInvoice = 'Needs Attention';
  } else if (processingStage === 'purchaseInvoice') {
    statuses.purchaseInvoice = 'Processing';
  } else if (run.approvals.purchaseInvoice === 'approved') {
    statuses.purchaseInvoice = 'Processing';
  } else {
    statuses.purchaseInvoice = 'Pending';
  }

  const failedMovements = movements.some((record) => record.status === 'failed');
  const succeededMovements = movements.filter((record) => record.status === 'succeeded');
  if (purchaseDone) {
    statuses.inventory = 'Completed';
  } else if (failedMovements || run.status === 'partial') {
    statuses.inventory = 'Needs Attention';
  } else if (processingStage === 'inventory' || succeededMovements.length > 0) {
    statuses.inventory = 'Processing';
  } else {
    statuses.inventory = 'Pending';
  }

  if (!purchaseDone) {
    statuses.customerInvoice = 'Pending';
    statuses.salesInvoice = 'Pending';
  } else if (salesDone) {
    statuses.customerInvoice = 'Completed';
    statuses.salesInvoice = 'Completed';
  } else if (customerInvoiceLoaded || customerDocuments(preview).length > 0) {
    statuses.customerInvoice =
      inventoryAvailability(preview) === 'available' ? 'Completed' : 'Needs Attention';
    if (processingStage === 'salesInvoice') {
      statuses.salesInvoice = 'Processing';
    } else if (sales?.status === 'failed') {
      statuses.salesInvoice = 'Needs Attention';
    } else if (run.approvals.customerSale === 'approved') {
      statuses.salesInvoice = 'Processing';
    } else {
      statuses.salesInvoice =
        activeStage === 'salesInvoice' ? 'Ready for Review' : 'Pending';
    }
  } else {
    statuses.customerInvoice =
      activeStage === 'customerInvoice' ? 'Ready for Review' : 'Pending';
    statuses.salesInvoice = 'Pending';
  }

  if (processingStage === 'documents') statuses.documents = 'Processing';
  if (processingStage === 'landedCost') statuses.landedCost = 'Processing';
  if (processingStage === 'review') statuses.review = 'Processing';
  if (processingStage === 'customerInvoice') statuses.customerInvoice = 'Processing';

  return statuses;
}

export function friendlyError(message: string): string {
  const lower = message.toLowerCase();
  if (lower.includes('connect gmail')) return 'Connect Gmail to load documents.';
  if (lower.includes('sage is not connected')) return 'Connect Sage before posting.';
  if (lower.includes('dry-run') || lower.includes('live sage write')) {
    return 'Sage must be connected before approval posts records.';
  }
  if (lower.includes('purchaseledgeraccountid requires review')) {
    return 'No purchase ledger account was found in Sage. Add a purchases-visible ledger, then retry Workflow 1.';
  }
  if (lower.includes('purchasetaxrateid requires review')) {
    return 'No purchase tax rate was found in Sage. Add a purchase tax rate, then retry Workflow 1.';
  }
  if (lower.includes('purchasestatusid requires review')) {
    return 'Sage draft invoice status could not be resolved. Retry Workflow 1 after reconnecting Sage.';
  }
  if (lower.includes('suppliercontactid requires review')) {
    return 'Supplier was not matched in Sage. Create or rename the vendor contact, then retry Workflow 1.';
  }
  if (lower.includes('customercontactid requires review')) {
    return 'Customer was not matched in Sage. Create or rename the customer contact, then retry Workflow 1.';
  }
  if (
    lower.includes('accounting ledger and tax mapping') ||
    lower.includes('purchaseledgeraccountid') ||
    lower.includes('salesledgeraccountid')
  ) {
    return 'Accounting configuration is incomplete. Retry Workflow 1 so Synpath can auto-fill Sage ledger and tax defaults.';
  }
  if (lower.includes('preview changed') || lower.includes('approved payload')) {
    return 'Details changed after review. Refresh and approve again.';
  }
  if (lower.includes('reconcile')) {
    return 'Landed costs do not reconcile. Resolve the variance before approval.';
  }
  return message;
}
