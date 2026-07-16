export type SourceType = 'gmail' | 'fixture';
export type ProcessingStatus =
  | 'New'
  | 'Downloaded'
  | 'Processing'
  | 'Needs Review'
  | 'Ready'
  | 'Posted'
  | 'Failed';
export type DocumentType =
  | 'purchase_order'
  | 'vendor_invoice'
  | 'packing_list'
  | 'freight_invoice'
  | 'customs_duty'
  | 'customer_invoice'
  | 'pricing_csv'
  | 'unknown';
export type ApprovalStatus = 'pending' | 'approved' | 'rejected';
export type SafeMode = 'fixture_dry_run' | 'gmail_dry_run' | 'live_sage_write';
export type InventoryPostingStrategy =
  | 'none'
  | 'stock_movement'
  | 'purchase_invoice_product_lines';
export type AllocationMethod =
  | 'product_value'
  | 'quantity'
  | 'weight'
  | 'volume'
  | 'manual_percentage'
  | 'manual_amount';
export type ChargeClassification =
  | 'capitalizable'
  | 'non_capitalizable'
  | 'recoverable_tax'
  | 'unresolved';

export interface ExtractedField<T> {
  value: T;
  sourceDocumentId: string;
  sourcePage?: number;
  confidence: number;
  warning?: string;
  manuallyEdited: boolean;
}

export interface EmailSource {
  gmailMessageId: string;
  gmailThreadId: string;
  from: string;
  to: string;
  subject: string;
  receivedAt: string;
  snippet: string;
  labelIds: string[];
  attachmentIds: string[];
  processingStatus: ProcessingStatus;
}

export interface SourceDocument {
  id: string;
  emailMessageId: string;
  fileName: string;
  mimeType: string;
  fileSize: number;
  sha256: string;
  documentType: DocumentType;
  extractionStatus: ProcessingStatus;
  sourceType: SourceType;
  gmailAttachmentId?: string;
}

export interface ShipmentLine {
  sku: string;
  description: string;
  quantity: number;
  receivedQuantity: number;
  unitOfMeasure: string;
  vendorUnitCost: number;
  vendorLineTotal: number;
  weight: number;
  volume: number;
  matchedSageStockItemId?: string;
  matchedSageItemCode?: string;
  matchingStatus: 'unmatched' | 'exact' | 'ambiguous' | 'confirmed';
  matchingConfidence: number;
}

export interface Shipment {
  id: string;
  externalPoNumber: string;
  containerNumber: string;
  shipmentDate: string;
  arrivalDate: string;
  supplier: string;
  vendorInvoiceNumber: string;
  vendorInvoiceSubtotal: number;
  vendorInvoiceTax: number;
  vendorInvoiceTotal: number;
  currency: string;
  exchangeRate: number;
  status: ProcessingStatus;
  sourceDocumentIds: string[];
  approvalStatus: ApprovalStatus;
  lines: ShipmentLine[];
}

export interface LandedCostComponent {
  id: string;
  type: 'freight' | 'duty' | 'brokerage' | 'insurance' | 'tax' | 'other';
  supplier: string;
  sourceDocumentId: string;
  amount: number;
  currency: string;
  baseCurrencyAmount: number;
  allocationMethod: AllocationMethod;
  classification: ChargeClassification;
  capitalizable: boolean;
  recoverableTax: boolean;
  manualAllocations?: Record<string, number>;
}

export interface LandedCostAllocation {
  sku: string;
  goodsCost: number;
  allocatedFreight: number;
  allocatedDuty: number;
  allocatedBrokerage: number;
  allocatedInsurance: number;
  allocatedTax: number;
  allocatedOther: number;
  landedCostTotal: number;
  landedUnitCost: number;
  roundingAdjustment: number;
}

export interface CustomerInvoiceLine {
  sku: string;
  description: string;
  quantity: number;
  salesUnitPrice: number;
  discount: number;
  tax: number;
  total: number;
  matchedSageStockItemId?: string;
}

export interface CustomerInvoice {
  sourceInvoiceNumber: string;
  customer: string;
  invoiceDate: string;
  dueDate: string;
  currency: string;
  reference: string;
  lines: CustomerInvoiceLine[];
  subtotal: number;
  tax: number;
  shipping: number;
  total: number;
  matchedSageContactId?: string;
  approvalStatus: ApprovalStatus;
}

export interface NormalizedDocumentBundle {
  emails: EmailSource[];
  documents: SourceDocument[];
  shipment: Shipment;
  landedCostComponents: LandedCostComponent[];
  customerInvoice: CustomerInvoice;
  extractionWarnings: string[];
  fixtureExtraction: boolean;
}

export interface SagePostingRecord {
  workflowId: string;
  transactionType:
    | 'purchase_invoice'
    | 'stock_movement'
    | 'sales_invoice'
    | 'purchase_invoice_release'
    | 'sales_invoice_release';
  sageBusinessId: string;
  sageTransactionId: string;
  externalReference: string;
  requestPayload: unknown;
  responseSummary: unknown;
  createdAt: string;
  readBackVerified: boolean;
  differences?: Record<string, { expected: unknown; actual: unknown }>;
  status: 'pending' | 'succeeded' | 'failed' | 'partial';
  error?: string;
}

export interface WorkflowApprovals {
  purchaseInvoice: ApprovalStatus;
  inventoryReceipt: ApprovalStatus;
  customerSale: ApprovalStatus;
  purchaseInvoiceRelease: ApprovalStatus;
  salesInvoiceRelease: ApprovalStatus;
}

export type WorkflowApprovalTarget =
  | 'purchaseInvoice'
  | 'inventoryReceipt'
  | 'customerSale'
  | 'purchaseInvoiceRelease'
  | 'salesInvoiceRelease';

export interface WorkflowRun {
  id: string;
  mode: SafeMode;
  sourceType: SourceType;
  externalReference: string;
  createdAt: string;
  updatedAt: string;
  status:
    | 'draft'
    | 'ready'
    | 'approved'
    | 'posting'
    | 'partial'
    | 'completed'
    | 'failed';
  approvals: WorkflowApprovals;
  approvedPayloadHashes: Partial<Record<WorkflowApprovalTarget, string>>;
  inventoryPostingStrategy: InventoryPostingStrategy;
  sourceMessageIds: string[];
  sourceDocumentIds: string[];
  attachmentHashes: string[];
  postingRecords: SagePostingRecord[];
  errors: string[];
}

export interface WorkflowPreview {
  run: WorkflowRun;
  bundle: NormalizedDocumentBundle;
  extractedFields: Record<string, ExtractedField<unknown>>;
  allocations: LandedCostAllocation[];
  reconciliation: {
    sourceGoodsTotal: number;
    freightTotal: number;
    dutyTotal: number;
    taxTotal: number;
    otherCharges: number;
    totalCapitalizableCost: number;
    totalAllocated: number;
    variance: number;
    withinTolerance: boolean;
  };
  liveSage: {
    connected: boolean;
    businessId?: string;
    stockItems: Array<{
      id: string;
      itemCode: string;
      description: string;
      quantityInStock: number;
      costPrice: number;
      lastCostPrice: number;
      averageCostPrice: number;
      purchaseLedgerAccountId?: string;
      purchaseTaxRateId?: string;
      salesLedgerAccountId?: string;
      salesTaxRateId?: string;
    }>;
    contacts: Array<{ id: string; name: string; reference: string; typeIds: string[] }>;
    ledgerAccounts: Array<{ id: string; name: string; nominalCode?: string }>;
    purchaseLedgerAccounts: Array<{ id: string; name: string; nominalCode?: string }>;
    salesLedgerAccounts: Array<{ id: string; name: string; nominalCode?: string }>;
    taxRates: Array<{ id: string; name: string; percentage: number }>;
    purchaseTaxRates: Array<{ id: string; name: string; percentage: number }>;
    salesTaxRates: Array<{ id: string; name: string; percentage: number }>;
    currencies: Array<{ id: string; name: string }>;
    artefactStatuses: Array<{ id: string; name: string }>;
  };
  payloads: {
    purchaseInvoice: unknown;
    stockMovements: unknown[];
    salesInvoice: unknown;
  };
  selections: {
    supplierContactId?: string;
    customerContactId?: string;
    purchaseLedgerAccountId?: string;
    salesLedgerAccountId?: string;
    purchaseTaxRateId?: string;
    salesTaxRateId?: string;
    purchaseStatusId?: string;
    salesStatusId?: string;
    accountingMappingConfirmed: boolean;
  };
  approvalDigests: Record<WorkflowApprovalTarget, string>;
  validationErrors: string[];
}

export function validateNormalizedBundle(bundle: NormalizedDocumentBundle): string[] {
  const errors: string[] = [];
  if (!bundle.shipment.externalPoNumber) errors.push('External PO number is required');
  if (!bundle.shipment.containerNumber) errors.push('Container number is required');
  if (!bundle.shipment.vendorInvoiceNumber) errors.push('Vendor invoice number is required');
  if (
    Math.abs(
      bundle.shipment.vendorInvoiceSubtotal +
        bundle.shipment.vendorInvoiceTax -
        bundle.shipment.vendorInvoiceTotal,
    ) > 0.01
  ) {
    errors.push('Vendor invoice subtotal, tax and total do not reconcile');
  }
  if (!bundle.shipment.lines.length) errors.push('At least one shipment line is required');
  if (bundle.shipment.exchangeRate <= 0) errors.push('Exchange rate must be greater than zero');
  for (const line of bundle.shipment.lines) {
    if (!line.sku) errors.push('Shipment SKU is required');
    if (line.receivedQuantity <= 0) errors.push(`${line.sku}: received quantity must be positive`);
    if (line.vendorUnitCost < 0) errors.push(`${line.sku}: vendor unit cost cannot be negative`);
  }
  if (!bundle.customerInvoice.sourceInvoiceNumber) {
    errors.push('Customer invoice number is required');
  }
  if (
    Math.abs(
      bundle.customerInvoice.subtotal +
        bundle.customerInvoice.shipping +
        bundle.customerInvoice.tax -
        bundle.customerInvoice.total,
    ) > 0.01
  ) {
    errors.push('Customer Invoice subtotal, shipping, tax and total do not reconcile');
  }
  return errors;
}
