import type {
  CustomerInvoice,
  LandedCostComponent,
  NormalizedDocumentBundle,
  Shipment,
  SourceDocument,
} from '../../../shared/workflow';
import { GHOSTBOARDS_BASELINE_SKUS } from '../sage/demoBaseline';
import {
  parseSpandexInvoice,
  parseUgoldenProforma,
  type ParsedSpandexInvoice,
  type ParsedUgoldenProforma,
} from './parseGhoacrugolPdfs';

/** Live PO / vendor / customer identifiers from the Gmail PDF pack. */
export const GHOACRUGOL_PO = 'GHOACRUGOL051926';
export const GHOACRUGOL_VENDOR = 'Shanghai UGolden Industry Co., Ltd.';
export const GHOACRUGOL_CUSTOMER = 'Spandex';
export const GHOACRUGOL_VENDOR_INVOICE = 'UG26A0519';
export const GHOACRUGOL_CUSTOMER_INVOICE = 'GA18';
export const GHOACRUGOL_TOTAL_DDP = 46845.34;
export const GHOACRUGOL_SALES_TOTAL = 32296;

export type DemoCalendarDates = {
  shipmentDate: string;
  arrivalDate: string;
  invoiceDate: string;
  dueDate: string;
};

function round2(value: number) {
  return Number(value.toFixed(2));
}

const VENDOR_UNIT_COSTS: Record<string, number> = {
  'ACR-WHT-3MM-48X96': 24.16,
  'ACR-WHT-18MM-48X96': 144.9,
  'ACR-WHT-25MM-48X96': 214.1,
  'ACR-WHT-4P8MM-60X120': 57.43,
  'ACR-CLR-4MM-48X96': 34.3,
  'ACR-PC-CLR-9P5MM-48X96': 89,
};

const SALES_UNIT_PRICES: Record<string, number> = {
  'ACR-WHT-3MM-48X96': 39.45,
  'ACR-WHT-18MM-48X96': 227.26,
  'ACR-WHT-25MM-48X96': 331.97,
  'ACR-WHT-4P8MM-60X120': 98.06,
  'ACR-PC-CLR-9P5MM-48X96': 144.84,
};

/** Canonical fallback when PDF bytes are unavailable (fixture dry-run). */
export function fallbackUgoldenParse(): ParsedUgoldenProforma {
  return {
    poNumber: GHOACRUGOL_PO,
    vendorInvoiceNumber: GHOACRUGOL_VENDOR_INVOICE,
    supplier: GHOACRUGOL_VENDOR,
    currency: 'USD',
    lines: GHOSTBOARDS_BASELINE_SKUS.map((item) => {
      const quantity =
        item.sku === 'ACR-WHT-3MM-48X96'
          ? 102
          : item.sku === 'ACR-WHT-18MM-48X96'
            ? 46
            : item.sku === 'ACR-WHT-25MM-48X96'
              ? 10
              : item.sku === 'ACR-WHT-4P8MM-60X120'
                ? 74
                : item.sku === 'ACR-CLR-4MM-48X96'
                  ? 436
                  : 50;
      const weight =
        item.sku === 'ACR-WHT-3MM-48X96'
          ? 1123
          : item.sku === 'ACR-WHT-18MM-48X96'
            ? 2988
            : item.sku === 'ACR-WHT-25MM-48X96'
              ? 923
              : item.sku === 'ACR-WHT-4P8MM-60X120'
                ? 2019
                : item.sku === 'ACR-CLR-4MM-48X96'
                  ? 6320
                  : 1727;
      const volume =
        item.sku === 'ACR-WHT-3MM-48X96'
          ? 0.91
          : item.sku === 'ACR-WHT-18MM-48X96'
            ? 2.46
            : item.sku === 'ACR-WHT-25MM-48X96'
              ? 0.74
              : item.sku === 'ACR-WHT-4P8MM-60X120'
                ? 1.66
                : item.sku === 'ACR-CLR-4MM-48X96'
                  ? 5.19
                  : 1.41;
      return {
        sku: item.sku,
        description: item.description,
        quantity,
        vendorUnitCost: VENDOR_UNIT_COSTS[item.sku] ?? 0,
        vendorLineTotal: round2(quantity * (VENDOR_UNIT_COSTS[item.sku] ?? 0)),
        weight,
        volume,
        color: item.sku.includes('WHT') ? 'WHITE' : 'CLEAR',
        thicknessMm: 0,
        widthMm: 0,
        lengthMm: 0,
      };
    }),
    palletCost: 320,
    ddpCost: 11600,
    totalDdpAmount: GHOACRUGOL_TOTAL_DDP,
    totalPieces: 718,
  };
}

export function fallbackSpandexParse(): ParsedSpandexInvoice {
  const vendor = fallbackUgoldenParse();
  const lines = vendor.lines
    .filter((line) => line.sku !== 'ACR-CLR-4MM-48X96')
    .map((line) => {
      const salesUnitPrice = SALES_UNIT_PRICES[line.sku] ?? 0;
      return {
        sku: line.sku,
        description: line.description,
        quantity: line.quantity,
        salesUnitPrice,
        total: round2(line.quantity * salesUnitPrice),
      };
    });
  return {
    invoiceNumber: GHOACRUGOL_CUSTOMER_INVOICE,
    customer: GHOACRUGOL_CUSTOMER,
    currency: 'USD',
    lines,
    subtotal: GHOACRUGOL_SALES_TOTAL,
    total: GHOACRUGOL_SALES_TOTAL,
  };
}

export function buildGhoacrugolShipment(
  dates: DemoCalendarDates,
  vendor: ParsedUgoldenProforma = fallbackUgoldenParse(),
): Shipment {
  const lines = vendor.lines.map((line) => ({
    sku: line.sku,
    description: line.description,
    quantity: line.quantity,
    receivedQuantity: line.quantity,
    unitOfMeasure: 'sheet',
    vendorUnitCost: line.vendorUnitCost,
    vendorLineTotal: line.vendorLineTotal,
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
    externalPoNumber: vendor.poNumber,
    containerNumber: vendor.vendorInvoiceNumber,
    shipmentDate: dates.shipmentDate,
    arrivalDate: dates.arrivalDate,
    supplier: vendor.supplier,
    vendorInvoiceNumber: vendor.vendorInvoiceNumber,
    vendorInvoiceSubtotal,
    vendorInvoiceTax: 0,
    // Full UGolden TOTAL DDP Amount (goods + pallets + DDP).
    vendorInvoiceTotal: vendor.totalDdpAmount || GHOACRUGOL_TOTAL_DDP,
    currency: 'USD',
    exchangeRate: 1,
    status: 'Needs Review',
    sourceDocumentIds: [],
    approvalStatus: 'pending',
    lines,
  };
}

export function buildGhoacrugolLandedCosts(
  sourceDocumentId = 'ugolden-proforma',
  vendor: ParsedUgoldenProforma = fallbackUgoldenParse(),
): LandedCostComponent[] {
  return [
    {
      id: 'charge-pallet',
      type: 'freight',
      supplier: vendor.supplier,
      sourceDocumentId,
      amount: vendor.palletCost,
      currency: 'USD',
      baseCurrencyAmount: vendor.palletCost,
      allocationMethod: 'quantity',
      classification: 'capitalizable',
      capitalizable: true,
      recoverableTax: false,
    },
    {
      id: 'charge-ddp',
      type: 'duty',
      supplier: vendor.supplier,
      sourceDocumentId,
      amount: vendor.ddpCost,
      currency: 'USD',
      baseCurrencyAmount: vendor.ddpCost,
      // User requirement: DDP allocated by weight onto each piece.
      allocationMethod: 'weight',
      classification: 'capitalizable',
      capitalizable: true,
      recoverableTax: false,
    },
  ];
}

export function buildGhoacrugolCustomerInvoice(
  dates: DemoCalendarDates,
  sales: ParsedSpandexInvoice = fallbackSpandexParse(),
): CustomerInvoice {
  const lines = sales.lines.map((line) => ({
    sku: line.sku,
    description: line.description,
    quantity: line.quantity,
    salesUnitPrice: line.salesUnitPrice,
    discount: 0,
    tax: 0,
    total: line.total,
  }));
  return {
    sourceInvoiceNumber: sales.invoiceNumber,
    customer: sales.customer,
    invoiceDate: dates.invoiceDate,
    dueDate: dates.dueDate,
    currency: 'USD',
    reference: GHOACRUGOL_PO,
    lines,
    subtotal: sales.subtotal,
    tax: 0,
    shipping: 0,
    total: sales.total,
    approvalStatus: 'pending',
  };
}

export function buildGhoacrugolBundle(
  sourceDocuments: SourceDocument[] = [],
  dates: DemoCalendarDates,
  options: {
    vendor?: ParsedUgoldenProforma;
    sales?: ParsedSpandexInvoice;
    livePdfExtraction?: boolean;
  } = {},
): NormalizedDocumentBundle {
  const vendor = options.vendor ?? fallbackUgoldenParse();
  const sales = options.sales ?? fallbackSpandexParse();
  const shipment = buildGhoacrugolShipment(dates, vendor);
  const landedCostComponents = buildGhoacrugolLandedCosts(
    sourceDocuments.find((doc) => /ugolden|proforma|ug26/i.test(doc.fileName))?.id ??
      sourceDocuments[0]?.id ??
      'ugolden-proforma',
    vendor,
  );
  const customerInvoice = buildGhoacrugolCustomerInvoice(dates, sales);
  shipment.sourceDocumentIds = sourceDocuments.map((doc) => doc.id);
  const live = Boolean(options.livePdfExtraction);
  return {
    emails: [],
    documents: sourceDocuments,
    shipment,
    landedCostComponents,
    customerInvoice,
    extractionWarnings: live
      ? [
          `Extracted from UGolden proforma ${vendor.vendorInvoiceNumber} and Spandex invoice ${sales.invoiceNumber} PDF attachments.`,
        ]
      : [
          'Demo mailbox uses the same UGolden + Spandex field mapping as live Gmail PDF extraction.',
        ],
    fixtureExtraction: !live,
  };
}

/** Build a bundle by parsing attachment texts (PDF-extracted or fixture mirrors). */
export function buildGhoacrugolBundleFromTexts(
  sourceDocuments: SourceDocument[],
  texts: string[],
  dates: DemoCalendarDates,
  livePdfExtraction: boolean,
  identity: { subject?: string; fileNames?: string[] } = {},
): NormalizedDocumentBundle {
  const combined = texts.join('\n');
  const vendor =
    texts.map((text) => parseUgoldenProforma(text)).find(Boolean) ??
    parseUgoldenProforma(combined);
  const sales =
    texts.map((text) => parseSpandexInvoice(text)).find(Boolean) ??
    parseSpandexInvoice(combined);
  if (vendor && sales) {
    return buildGhoacrugolBundle(sourceDocuments, dates, {
      vendor,
      sales,
      livePdfExtraction,
    });
  }

  // Gmail serverless PDF text can be empty even when the labeled PO email is correct.
  // If subject/filenames identify PO#GHOACRUGOL051926, use the known pack mapping.
  const recognized = looksLikeGhoacrugolPack({
    subject: identity.subject,
    fileNames: identity.fileNames ?? sourceDocuments.map((doc) => doc.fileName),
    texts,
  });
  if (!recognized) {
    throw new Error(
      'Could not parse UGolden proforma and Spandex invoice fields from attachment text.',
    );
  }

  const bundle = buildGhoacrugolBundle(sourceDocuments, dates, {
    vendor: vendor ?? fallbackUgoldenParse(),
    sales: sales ?? fallbackSpandexParse(),
    livePdfExtraction,
  });
  const missing = [
    !vendor ? 'UGolden proforma line items' : null,
    !sales ? 'Spandex invoice line items' : null,
  ]
    .filter(Boolean)
    .join(' and ');
  bundle.extractionWarnings = [
    `Recognized Gmail PO#${GHOACRUGOL_PO} attachments; PDF text was incomplete for ${missing}, so mapped fields from the labeled UGolden + Spandex pack.`,
  ];
  return bundle;
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
