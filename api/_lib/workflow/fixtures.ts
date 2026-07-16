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
  GHOACRUGOL_PO,
} from './ghoacrugolBundle';

export const FIXTURE_REFERENCE = GHOACRUGOL_PO;
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

/** Mirror of the live Gmail subject/body for offline demos. */
export const FIXTURE_EMAILS: EmailSource[] = [
  {
    gmailMessageId: 'fixture-msg-po',
    gmailThreadId: 'fixture-thread-ghoacrugol',
    from: 'ada@ugolden.com.cn',
    to: 'operations@ghostacrylic.com',
    subject: `PO#${FIXTURE_REFERENCE}`,
    receivedAt: DEMO_DATES.poReceivedAt,
    snippet:
      'UGolden proforma UG26A0519 and Spandex customer invoice GA18 for PO#GHOACRUGOL051926.',
    labelIds: ['Synpath Sage Demo'],
    attachmentIds: ['fixture-ugolden-proforma', 'fixture-spandex-invoice'],
    processingStatus: 'Ready',
  },
];

/**
 * Parseable text mirrors of the live PDF attachments so fixture mode exercises
 * the same field parsers as Gmail PDF extraction.
 */
export const FIXTURE_DOCUMENTS: FixtureDocumentDefinition[] = [
  {
    id: 'fixture-ugolden-proforma',
    emailMessageId: 'fixture-msg-po',
    fileName: 'UPDATE Ghost PO#GHOACRUGOL051926 (UGolden Proforma Invoice UG26A0519).pdf',
    mimeType: 'application/pdf',
    documentType: 'vendor_invoice',
    content: `SHANGHAI UGOLDEN INDUSTRY CO., LTD. Proforma Invoice
PO#GHOACRUGOL051926 Invoice No: UG26A0519
1.20 WHITE 3 1220 2440 102 Pallet:#1 $24.16 $2,464.32 1123 1093 0.91
1.20 WHITE 18 1220 2440 46 $144.90 $6,665.40 2988 2958 2.46
1.20 WHITE 25 1220 2440 10 Pallet:#2,3,4 $214.10 $2,141.00 923 893 0.74
1.20 WHITE 4.8 1530 3050 74 $57.43 $4,249.82 2019 1989 1.66
1.20 CLEAR 4.0 1220 2440 436 Pallet:#5,6,7 $34.30 $14,954.80 6320 6230 5.19
POLY CARBONATE 1.20 CLEAR 9.5 1220 2440 50 Pallet:#8 $89.00 $4,450.00 1727 1697 1.41
PALLETS COST 8 $40.00 $320.00 15100 14860 20.38
DDP COST amount to your company wearhouse $11,600.00
TOTAL DDP Amount (Destination, Seller clears import & pays duties) 718 pcs $46,845.34`,
  },
  {
    id: 'fixture-spandex-invoice',
    emailMessageId: 'fixture-msg-po',
    fileName: 'GHOST ACRYLIC LLC - SPANDEX Invoice # GA18 - 5_18_2026.pdf',
    mimeType: 'application/pdf',
    documentType: 'customer_invoice',
    content: `INVOICE PAID GHOST ACRYLIC LLC Invoice #: GA18
SPANDEX Attention: ANDREW GREEN
3mm x 48" x 96" WHITE 102.00 $39.45 $4,023.90
18mm x 48" x 96" WHITE 46.00 $227.26 $10,453.96
25mm x 48" x 96" WHITE 10.00 $331.97 $3,319.70
4.8mm x 60" x 120" WHITE 74.00 $98.06 $7,256.44
9.5mm x 48" x 96" CLEAR POLY CARB 50.00 $144.84 $7,242.00
Subtotal: $32,296.00
Total Due: $32,296.00`,
  },
];

/** Live PO#GHOACRUGOL051926 shipment extracted from UGolden proforma + Spandex invoice. */
export const FIXTURE_SHIPMENT: Shipment = (() => {
  const shipment = buildGhoacrugolShipment(DEMO_DATES);
  shipment.sourceDocumentIds = FIXTURE_DOCUMENTS.map((document) => document.id);
  return shipment;
})();

export const FIXTURE_LANDED_COST_COMPONENTS: LandedCostComponent[] =
  buildGhoacrugolLandedCosts('fixture-ugolden-proforma');

export const FIXTURE_CUSTOMER_INVOICE: CustomerInvoice =
  buildGhoacrugolCustomerInvoice(DEMO_DATES);
