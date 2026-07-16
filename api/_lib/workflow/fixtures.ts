import type {
  CustomerInvoice,
  DocumentType,
  EmailSource,
  LandedCostComponent,
  Shipment,
} from '../../../shared/workflow';

export const FIXTURE_REFERENCE = 'GHOACRUGOL051926';
export const DEMO_REFERENCE_PREFIX = `DEMO-${FIXTURE_REFERENCE}`;

export interface FixtureDocumentDefinition {
  id: string;
  emailMessageId: string;
  fileName: string;
  mimeType: string;
  documentType: DocumentType;
  content: string;
}

export const FIXTURE_EMAILS: EmailSource[] = [
  {
    gmailMessageId: 'fixture-msg-po',
    gmailThreadId: 'fixture-thread-shipment',
    from: 'orders@nationwide-acrylics.example',
    to: 'operations@ghostboards.example',
    subject: `PO confirmation ${FIXTURE_REFERENCE}`,
    receivedAt: '2026-05-19T09:15:00.000Z',
    snippet: 'Purchase order for 100 clear acrylic sheets and the matching vendor invoice.',
    labelIds: ['Synpath Sage Demo'],
    attachmentIds: ['fixture-po', 'fixture-vendor-invoice'],
    processingStatus: 'Ready',
  },
  {
    gmailMessageId: 'fixture-msg-logistics',
    gmailThreadId: 'fixture-thread-shipment',
    from: 'docs@pacific-freight.example',
    to: 'operations@ghostboards.example',
    subject: `Container TLLU4819203 / ${FIXTURE_REFERENCE}`,
    receivedAt: '2026-05-24T14:30:00.000Z',
    snippet: 'BOL, freight invoice and customs entry attached.',
    labelIds: ['Synpath Sage Demo'],
    attachmentIds: ['fixture-bol', 'fixture-freight', 'fixture-duty'],
    processingStatus: 'Ready',
  },
  {
    gmailMessageId: 'fixture-msg-sale',
    gmailThreadId: 'fixture-thread-sale',
    from: 'billing@ghostboards.example',
    to: 'operations@ghostboards.example',
    subject: `Customer invoice GB-CUST-1042 / ${FIXTURE_REFERENCE}`,
    receivedAt: '2026-06-04T11:05:00.000Z',
    snippet: 'Customer invoice for received acrylic inventory.',
    labelIds: ['Synpath Sage Demo'],
    attachmentIds: ['fixture-customer-invoice', 'fixture-pricing-csv'],
    processingStatus: 'Ready',
  },
];

export const FIXTURE_DOCUMENTS: FixtureDocumentDefinition[] = [
  {
    id: 'fixture-po',
    emailMessageId: 'fixture-msg-po',
    fileName: 'GHOACRUGOL051926-purchase-order.txt',
    mimeType: 'text/plain',
    documentType: 'purchase_order',
    content: `SYNTHETIC TEST DOCUMENT — NOT A LIVE EXTRACTION
External PO: ${FIXTURE_REFERENCE}
Container: TLLU4819203
Supplier: Nationwide Acrylics
Currency: GBP
Shipment date: 2026-05-19
Expected arrival: 2026-06-02
ACR-CLR-3MM-48X96,100,52.50,5250.00`,
  },
  {
    id: 'fixture-vendor-invoice',
    emailMessageId: 'fixture-msg-po',
    fileName: 'NWA-INV-8841-vendor-invoice.txt',
    mimeType: 'text/plain',
    documentType: 'vendor_invoice',
    content: `SYNTHETIC VENDOR INVOICE
Invoice: NWA-INV-8841
Reference: ${FIXTURE_REFERENCE}
ACR-CLR-3MM-48X96,100,52.50,5250.00
Subtotal GBP 5250.00
Tax GBP 0.00
Total GBP 5250.00`,
  },
  {
    id: 'fixture-bol',
    emailMessageId: 'fixture-msg-logistics',
    fileName: 'TLLU4819203-packing-list.txt',
    mimeType: 'text/plain',
    documentType: 'packing_list',
    content: `SYNTHETIC BOL / PACKING LIST
Container TLLU4819203
Reference ${FIXTURE_REFERENCE}
Gross weight 1,825 KG
Volume 12.9 CBM
Packages 100`,
  },
  {
    id: 'fixture-freight',
    emailMessageId: 'fixture-msg-logistics',
    fileName: 'PF-22910-freight-invoice.txt',
    mimeType: 'text/plain',
    documentType: 'freight_invoice',
    content: `SYNTHETIC FREIGHT INVOICE
Reference ${FIXTURE_REFERENCE}
Ocean freight GBP 420.00
Insurance GBP 75.00`,
  },
  {
    id: 'fixture-duty',
    emailMessageId: 'fixture-msg-logistics',
    fileName: 'HMRC-entry-GHOACRUGOL051926.txt',
    mimeType: 'text/plain',
    documentType: 'customs_duty',
    content: `SYNTHETIC CUSTOMS ENTRY
Reference ${FIXTURE_REFERENCE}
Customs duty GBP 331.00
Brokerage GBP 125.00
Import VAT GBP 1240.20 (recoverable)`,
  },
  {
    id: 'fixture-customer-invoice',
    emailMessageId: 'fixture-msg-sale',
    fileName: 'GB-CUST-1042-customer-invoice.txt',
    mimeType: 'text/plain',
    documentType: 'customer_invoice',
    content: `SYNTHETIC CUSTOMER INVOICE
Invoice GB-CUST-1042
Customer Acrylic Display Studio
Reference ${FIXTURE_REFERENCE}
ACR-CLR-3MM-48X96,100,79.00
Shipping GBP 0.00
VAT GBP 1580.00
Total GBP 9480.00`,
  },
  {
    id: 'fixture-pricing-csv',
    emailMessageId: 'fixture-msg-sale',
    fileName: 'acrylic-pricing.csv',
    mimeType: 'text/csv',
    documentType: 'pricing_csv',
    content: `sku,description,sales_unit_price
ACR-CLR-3MM-48X96,Clear Acrylic Sheet 3mm 48 x 96,79.00`,
  },
];

export const FIXTURE_SHIPMENT: Shipment = {
  id: 'shipment-fixture-ghoacrugol051926',
  externalPoNumber: FIXTURE_REFERENCE,
  containerNumber: 'TLLU4819203',
  shipmentDate: '2026-05-19',
  arrivalDate: '2026-06-02',
  supplier: 'Nationwide Acrylics',
  vendorInvoiceNumber: 'NWA-INV-8841',
  vendorInvoiceSubtotal: 5250,
  vendorInvoiceTax: 0,
  vendorInvoiceTotal: 5250,
  currency: 'GBP',
  exchangeRate: 1,
  status: 'Needs Review',
  sourceDocumentIds: FIXTURE_DOCUMENTS.slice(0, 5).map((document) => document.id),
  approvalStatus: 'pending',
  lines: [
    {
      sku: 'ACR-CLR-3MM-48X96',
      description: 'Clear Acrylic Sheet 3mm 48 × 96',
      quantity: 100,
      receivedQuantity: 100,
      unitOfMeasure: 'sheet',
      vendorUnitCost: 52.5,
      vendorLineTotal: 5250,
      weight: 1825,
      volume: 12.9,
      matchingStatus: 'unmatched',
      matchingConfidence: 0,
    },
  ],
};

export const FIXTURE_LANDED_COST_COMPONENTS: LandedCostComponent[] = [
  {
    id: 'charge-freight',
    type: 'freight',
    supplier: 'Pacific Freight',
    sourceDocumentId: 'fixture-freight',
    amount: 420,
    currency: 'GBP',
    baseCurrencyAmount: 420,
    allocationMethod: 'product_value',
    classification: 'capitalizable',
    capitalizable: true,
    recoverableTax: false,
  },
  {
    id: 'charge-insurance',
    type: 'insurance',
    supplier: 'Pacific Freight',
    sourceDocumentId: 'fixture-freight',
    amount: 75,
    currency: 'GBP',
    baseCurrencyAmount: 75,
    allocationMethod: 'product_value',
    classification: 'capitalizable',
    capitalizable: true,
    recoverableTax: false,
  },
  {
    id: 'charge-duty',
    type: 'duty',
    supplier: 'HMRC',
    sourceDocumentId: 'fixture-duty',
    amount: 331,
    currency: 'GBP',
    baseCurrencyAmount: 331,
    allocationMethod: 'product_value',
    classification: 'capitalizable',
    capitalizable: true,
    recoverableTax: false,
  },
  {
    id: 'charge-brokerage',
    type: 'brokerage',
    supplier: 'Customs Broker',
    sourceDocumentId: 'fixture-duty',
    amount: 125,
    currency: 'GBP',
    baseCurrencyAmount: 125,
    allocationMethod: 'quantity',
    classification: 'capitalizable',
    capitalizable: true,
    recoverableTax: false,
  },
  {
    id: 'charge-import-vat',
    type: 'tax',
    supplier: 'HMRC',
    sourceDocumentId: 'fixture-duty',
    amount: 1240.2,
    currency: 'GBP',
    baseCurrencyAmount: 1240.2,
    allocationMethod: 'product_value',
    classification: 'recoverable_tax',
    capitalizable: false,
    recoverableTax: true,
  },
];

export const FIXTURE_CUSTOMER_INVOICE: CustomerInvoice = {
  sourceInvoiceNumber: 'GB-CUST-1042',
  customer: 'Acrylic Display Studio',
  invoiceDate: '2026-06-04',
  dueDate: '2026-07-04',
  currency: 'GBP',
  reference: FIXTURE_REFERENCE,
  lines: [
    {
      sku: 'ACR-CLR-3MM-48X96',
      description: 'Clear Acrylic Sheet 3mm 48 × 96',
      quantity: 100,
      salesUnitPrice: 79,
      discount: 0,
      tax: 1580,
      total: 9480,
    },
  ],
  subtotal: 7900,
  tax: 1580,
  shipping: 0,
  total: 9480,
  approvalStatus: 'pending',
};
