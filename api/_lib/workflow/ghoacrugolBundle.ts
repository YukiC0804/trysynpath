import type {
  CustomerInvoice,
  LandedCostComponent,
  NormalizedDocumentBundle,
  Shipment,
  SourceDocument,
} from '../../../shared/workflow';
import { GHOSTBOARDS_BASELINE_SKUS } from '../sage/demoBaseline';

/** Live PO / vendor / customer identifiers from the Gmail PDF pack. */
export const GHOACRUGOL_PO = 'GHOACRUGOL051926';
export const GHOACRUGOL_VENDOR = 'Shanghai UGolden Industry Co., Ltd.';
export const GHOACRUGOL_CUSTOMER = 'Spandex';
export const GHOACRUGOL_VENDOR_INVOICE = 'UG26A0519';
export const GHOACRUGOL_CUSTOMER_INVOICE = 'GA18';

export type DemoCalendarDates = {
  shipmentDate: string;
  arrivalDate: string;
  invoiceDate: string;
  dueDate: string;
};

type ProductLine = {
  sku: string;
  description: string;
  quantity: number;
  vendorUnitCost: number;
  salesUnitPrice: number;
  weight: number;
  volume: number;
};

const PRODUCT_LINES: ProductLine[] = [
  {
    sku: 'ACR-WHT-3MM-48X96',
    description: 'White Acrylic Sheet 3mm 48 × 96',
    quantity: 102,
    vendorUnitCost: 24.16,
    salesUnitPrice: 39.45,
    weight: 1123,
    volume: 0.91,
  },
  {
    sku: 'ACR-WHT-18MM-48X96',
    description: 'White Acrylic Sheet 18mm 48 × 96',
    quantity: 46,
    vendorUnitCost: 144.9,
    salesUnitPrice: 227.26,
    weight: 2988,
    volume: 2.46,
  },
  {
    sku: 'ACR-WHT-25MM-48X96',
    description: 'White Acrylic Sheet 25mm 48 × 96',
    quantity: 10,
    vendorUnitCost: 214.1,
    salesUnitPrice: 331.97,
    weight: 923,
    volume: 0.74,
  },
  {
    sku: 'ACR-WHT-4P8MM-60X120',
    description: 'White Acrylic Sheet 4.8mm 60 × 120',
    quantity: 74,
    vendorUnitCost: 57.43,
    salesUnitPrice: 98.06,
    weight: 2019,
    volume: 1.66,
  },
  {
    sku: 'ACR-CLR-4MM-48X96',
    description: 'Clear Acrylic Sheet 4mm 48 × 96',
    quantity: 436,
    vendorUnitCost: 34.3,
    salesUnitPrice: 0,
    weight: 6320,
    volume: 5.19,
  },
  {
    sku: 'ACR-PC-CLR-9P5MM-48X96',
    description: 'Clear Polycarbonate Sheet 9.5mm 48 × 96',
    quantity: 50,
    vendorUnitCost: 89,
    salesUnitPrice: 144.84,
    weight: 1727,
    volume: 1.41,
  },
];

const PALLET_COST = 320;
const DDP_COST = 11600;

function round2(value: number) {
  return Number(value.toFixed(2));
}

export function buildGhoacrugolShipment(dates: DemoCalendarDates): Shipment {
  const lines = PRODUCT_LINES.map((line) => ({
    sku: line.sku,
    description: line.description,
    quantity: line.quantity,
    receivedQuantity: line.quantity,
    unitOfMeasure: 'sheet',
    vendorUnitCost: line.vendorUnitCost,
    vendorLineTotal: round2(line.quantity * line.vendorUnitCost),
    weight: line.weight,
    volume: line.volume,
    matchingStatus: 'unmatched' as const,
    matchingConfidence: 0,
  }));
  const vendorInvoiceSubtotal = round2(
    lines.reduce((sum, line) => sum + line.vendorLineTotal, 0),
  );
  return {
    id: 'shipment-ghoacrugol051926',
    externalPoNumber: GHOACRUGOL_PO,
    containerNumber: 'UG26A0519',
    shipmentDate: dates.shipmentDate,
    arrivalDate: dates.arrivalDate,
    supplier: GHOACRUGOL_VENDOR,
    vendorInvoiceNumber: GHOACRUGOL_VENDOR_INVOICE,
    vendorInvoiceSubtotal,
    vendorInvoiceTax: 0,
    vendorInvoiceTotal: vendorInvoiceSubtotal,
    currency: 'USD',
    exchangeRate: 1,
    status: 'Needs Review',
    sourceDocumentIds: [],
    approvalStatus: 'pending',
    lines,
  };
}

export function buildGhoacrugolLandedCosts(
  sourceDocumentId = 'fixture-freight',
): LandedCostComponent[] {
  return [
    {
      id: 'charge-pallet',
      type: 'freight',
      supplier: GHOACRUGOL_VENDOR,
      sourceDocumentId,
      amount: PALLET_COST,
      currency: 'USD',
      baseCurrencyAmount: PALLET_COST,
      allocationMethod: 'quantity',
      classification: 'capitalizable',
      capitalizable: true,
      recoverableTax: false,
    },
    {
      id: 'charge-ddp',
      type: 'duty',
      supplier: GHOACRUGOL_VENDOR,
      sourceDocumentId,
      amount: DDP_COST,
      currency: 'USD',
      baseCurrencyAmount: DDP_COST,
      allocationMethod: 'product_value',
      classification: 'capitalizable',
      capitalizable: true,
      recoverableTax: false,
    },
  ];
}

export function buildGhoacrugolCustomerInvoice(
  dates: DemoCalendarDates,
): CustomerInvoice {
  const lines = PRODUCT_LINES.filter((line) => line.salesUnitPrice > 0).map((line) => {
    const net = round2(line.quantity * line.salesUnitPrice);
    return {
      sku: line.sku,
      description: line.description,
      quantity: line.quantity,
      salesUnitPrice: line.salesUnitPrice,
      discount: 0,
      tax: 0,
      total: net,
    };
  });
  const subtotal = round2(lines.reduce((sum, line) => sum + line.total, 0));
  return {
    sourceInvoiceNumber: GHOACRUGOL_CUSTOMER_INVOICE,
    customer: GHOACRUGOL_CUSTOMER,
    invoiceDate: dates.invoiceDate,
    dueDate: dates.dueDate,
    currency: 'USD',
    reference: GHOACRUGOL_PO,
    lines,
    subtotal,
    tax: 0,
    shipping: 0,
    total: subtotal,
    approvalStatus: 'pending',
  };
}

export function buildGhoacrugolBundle(
  sourceDocuments: SourceDocument[] = [],
  dates: DemoCalendarDates,
): NormalizedDocumentBundle {
  const shipment = buildGhoacrugolShipment(dates);
  const landedCostComponents = buildGhoacrugolLandedCosts(
    sourceDocuments.find((doc) => /ugolden|proforma|ug26/i.test(doc.fileName))?.id ??
      sourceDocuments[0]?.id ??
      'fixture-freight',
  );
  const customerInvoice = buildGhoacrugolCustomerInvoice(dates);
  shipment.sourceDocumentIds = sourceDocuments.map((doc) => doc.id);
  return {
    emails: [],
    documents: sourceDocuments,
    shipment,
    landedCostComponents,
    customerInvoice,
    extractionWarnings: [
      'Structured extraction for PO#GHOACRUGOL051926 (UGolden proforma + Spandex invoice).',
    ],
    fixtureExtraction: true,
  };
}

export function looksLikeGhoacrugolPack(input: {
  subject?: string;
  fileNames?: string[];
  texts?: string[];
}): boolean {
  const haystack = [
    input.subject ?? '',
    ...(input.fileNames ?? []),
    ...(input.texts ?? []),
  ]
    .join('\n')
    .toUpperCase();
  return (
    haystack.includes('GHOACRUGOL051926') ||
    (haystack.includes('UG26A0519') && haystack.includes('GA18')) ||
    (haystack.includes('UGOLDEN') && haystack.includes('SPANDEX'))
  );
}

export function baselineSkuCatalog() {
  return GHOSTBOARDS_BASELINE_SKUS;
}
