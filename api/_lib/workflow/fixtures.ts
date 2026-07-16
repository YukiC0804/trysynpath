import type {
  CustomerInvoice,
  DocumentType,
  EmailSource,
  LandedCostComponent,
  Shipment,
} from '../../../shared/workflow';
import {
  buildGhoacrugolCustomerInvoice,
  buildGhoacrugolLandedCosts,
  buildGhoacrugolShipment,
} from './ghoacrugolBundle';

export const FIXTURE_REFERENCE = 'GHOACRUGOL051926';
export const DEMO_REFERENCE_PREFIX = `DEMO-${FIXTURE_REFERENCE}`;

/** Calendar dates for demo invoices — always near "today" so Sage's default
 *  From/To filter (usually the last month) includes Purchase/Sales Invoices. */
export function demoInvoiceDates(now = new Date()) {
  const utcDay = (offsetDays: number) => {
    const date = new Date(
      Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()),
    );
    date.setUTCDate(date.getUTCDate() + offsetDays);
    return date.toISOString().slice(0, 10);
  };
  const utcStamp = (offsetDays: number, hours: number, minutes: number) => {
    const date = new Date(
      Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()),
    );
    date.setUTCDate(date.getUTCDate() + offsetDays);
    date.setUTCHours(hours, minutes, 0, 0);
    return date.toISOString();
  };
  return {
    /** Purchase Invoice date */
    shipmentDate: utcDay(-1),
    /** Purchase Invoice due date */
    arrivalDate: utcDay(14),
    /** Sales Invoice date */
    invoiceDate: utcDay(0),
    /** Sales Invoice due date */
    dueDate: utcDay(30),
    poReceivedAt: utcStamp(-1, 9, 15),
    logisticsReceivedAt: utcStamp(0, 14, 30),
    saleReceivedAt: utcStamp(0, 11, 5),
  };
}

const DEMO_DATES = demoInvoiceDates();

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
    receivedAt: DEMO_DATES.poReceivedAt,
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
    receivedAt: DEMO_DATES.logisticsReceivedAt,
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
    receivedAt: DEMO_DATES.saleReceivedAt,
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
Shipment date: ${DEMO_DATES.shipmentDate}
Expected arrival: ${DEMO_DATES.arrivalDate}
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

/** Live PO#GHOACRUGOL051926 shipment extracted from UGolden proforma + Spandex invoice. */
export const FIXTURE_SHIPMENT: Shipment = (() => {
  const shipment = buildGhoacrugolShipment(DEMO_DATES);
  shipment.sourceDocumentIds = FIXTURE_DOCUMENTS.slice(0, 5).map((document) => document.id);
  return shipment;
})();

export const FIXTURE_LANDED_COST_COMPONENTS: LandedCostComponent[] =
  buildGhoacrugolLandedCosts('fixture-freight');

export const FIXTURE_CUSTOMER_INVOICE: CustomerInvoice =
  buildGhoacrugolCustomerInvoice(DEMO_DATES);
