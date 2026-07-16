import type {
  CustomerInvoice,
  LandedCostComponent,
  NormalizedDocumentBundle,
  Shipment,
  SourceDocument,
} from '../../../shared/workflow';
import {
  parseSpandexInvoice,
  parseUgoldenProforma,
  type ParsedSpandexInvoice,
  type ParsedUgoldenProforma,
  type ParsedVendorLine,
} from './parseGhoacrugolPdfs';

/** Live PO / vendor / customer identifiers from the Gmail PDF pack. */
export const GHOACRUGOL_PO = 'GHOACRUGOL051926';
export const GHOACRUGOL_VENDOR = 'Shanghai UGolden Industry Co., Ltd.';
export const GHOACRUGOL_CUSTOMER = 'Spandex';
export const GHOACRUGOL_VENDOR_INVOICE = 'UG26A0519';
export const GHOACRUGOL_CUSTOMER_INVOICE = 'GA18';
export const GHOACRUGOL_TOTAL_DDP = 46845.34;
export const GHOACRUGOL_SALES_TOTAL = 32296;
export const GHOACRUGOL_PALLET_COST = 320;
export const GHOACRUGOL_DDP_COST = 11600;

export type DemoCalendarDates = {
  shipmentDate: string;
  arrivalDate: string;
  invoiceDate: string;
  dueDate: string;
};

function round2(value: number) {
  return Number(value.toFixed(2));
}

/**
 * Canonical ACRYLIC SHEET / POLY CARBONATE lines from:
 * - UGolden proforma UG26A0519 (purchase unit $ / 1220×2440 or 1530×3050 mm)
 * - Spandex invoice GA18 (sell unit $ / 48"×96" or 60"×120")
 *
 * Cost per Sage piece =
 *   (UGolden unit price + DDP share by weight per piece)
 *   × (sale inches→mm area) / (purchase mm area)
 *   + pallet share per piece
 */
export type GhoacrugolPackLine = {
  sku: string;
  purchaseDescription: string;
  salesDescription: string;
  color: string;
  thicknessMm: number;
  widthMm: number;
  lengthMm: number;
  saleWidthIn: number;
  saleLengthIn: number;
  quantity: number;
  vendorUnitCost: number;
  vendorLineTotal: number;
  weight: number;
  volume: number;
  salesUnitPrice: number | null;
  polycarbonate?: boolean;
};

export const GHOACRUGOL_PACK_LINES: readonly GhoacrugolPackLine[] = [
  {
    sku: 'ACR-WHT-3MM-48X96',
    purchaseDescription: 'ACRYLIC SHEET WHITE 3mm 1220×2440',
    salesDescription: 'COLORED ACRYLIC SHEET 3mm x 48" x 96" WHITE',
    color: 'WHITE',
    thicknessMm: 3,
    widthMm: 1220,
    lengthMm: 2440,
    saleWidthIn: 48,
    saleLengthIn: 96,
    quantity: 102,
    vendorUnitCost: 24.16,
    vendorLineTotal: 2464.32,
    weight: 1123,
    volume: 0.91,
    salesUnitPrice: 39.45,
  },
  {
    sku: 'ACR-WHT-18MM-48X96',
    purchaseDescription: 'ACRYLIC SHEET WHITE 18mm 1220×2440',
    salesDescription: 'COLORED ACRYLIC SHEET 18mm x 48" x 96" WHITE',
    color: 'WHITE',
    thicknessMm: 18,
    widthMm: 1220,
    lengthMm: 2440,
    saleWidthIn: 48,
    saleLengthIn: 96,
    quantity: 46,
    vendorUnitCost: 144.9,
    vendorLineTotal: 6665.4,
    weight: 2988,
    volume: 2.46,
    salesUnitPrice: 227.26,
  },
  {
    sku: 'ACR-WHT-25MM-48X96',
    purchaseDescription: 'ACRYLIC SHEET WHITE 25mm 1220×2440',
    salesDescription: 'COLORED ACRYLIC SHEET 25mm x 48" x 96" WHITE',
    color: 'WHITE',
    thicknessMm: 25,
    widthMm: 1220,
    lengthMm: 2440,
    saleWidthIn: 48,
    saleLengthIn: 96,
    quantity: 10,
    vendorUnitCost: 214.1,
    vendorLineTotal: 2141,
    weight: 923,
    volume: 0.74,
    salesUnitPrice: 331.97,
  },
  {
    sku: 'ACR-WHT-4P8MM-60X120',
    purchaseDescription: 'ACRYLIC SHEET WHITE 4.8mm 1530×3050',
    salesDescription: 'COLORED ACRYLIC SHEET 4.8mm x 60" x 120" WHITE',
    color: 'WHITE',
    thicknessMm: 4.8,
    widthMm: 1530,
    lengthMm: 3050,
    saleWidthIn: 60,
    saleLengthIn: 120,
    quantity: 74,
    vendorUnitCost: 57.43,
    vendorLineTotal: 4249.82,
    weight: 2019,
    volume: 1.66,
    salesUnitPrice: 98.06,
  },
  {
    sku: 'ACR-CLR-4MM-48X96',
    purchaseDescription: 'ACRYLIC SHEET CLEAR 4mm 1220×2440',
    salesDescription: 'CLEAR ACRYLIC SHEET 4mm x 48" x 96"',
    color: 'CLEAR',
    thicknessMm: 4,
    widthMm: 1220,
    lengthMm: 2440,
    saleWidthIn: 48,
    saleLengthIn: 96,
    quantity: 436,
    vendorUnitCost: 34.3,
    vendorLineTotal: 14954.8,
    weight: 6320,
    volume: 5.19,
    // Purchased on UGolden; not sold on Spandex GA18 (stays in inventory).
    salesUnitPrice: null,
  },
  {
    sku: 'ACR-PC-CLR-9P5MM-48X96',
    purchaseDescription: 'POLY CARBONATE CLEAR 9.5mm 1220×2440',
    salesDescription: 'CLEAR ACRYLIC SHEET 9.5mm x 48" x 96" CLEAR POLY CARB',
    color: 'CLEAR',
    thicknessMm: 9.5,
    widthMm: 1220,
    lengthMm: 2440,
    saleWidthIn: 48,
    saleLengthIn: 96,
    quantity: 50,
    vendorUnitCost: 89,
    vendorLineTotal: 4450,
    weight: 1727,
    volume: 1.41,
    salesUnitPrice: 144.84,
    polycarbonate: true,
  },
] as const;

function saleSizeFromPurchaseMm(widthMm: number, lengthMm: number): {
  saleWidthIn: number;
  saleLengthIn: number;
} {
  if (widthMm === 1530 && lengthMm === 3050) return { saleWidthIn: 60, saleLengthIn: 120 };
  return { saleWidthIn: 48, saleLengthIn: 96 };
}

/** Canonical fallback when PDF bytes are unavailable (fixture dry-run / Gmail theater). */
export function fallbackUgoldenParse(): ParsedUgoldenProforma {
  const lines: ParsedVendorLine[] = GHOACRUGOL_PACK_LINES.map((line) => ({
    sku: line.sku,
    description: line.purchaseDescription,
    quantity: line.quantity,
    vendorUnitCost: line.vendorUnitCost,
    vendorLineTotal: line.vendorLineTotal,
    weight: line.weight,
    volume: line.volume,
    color: line.color,
    thicknessMm: line.thicknessMm,
    widthMm: line.widthMm,
    lengthMm: line.lengthMm,
  }));
  return {
    poNumber: GHOACRUGOL_PO,
    vendorInvoiceNumber: GHOACRUGOL_VENDOR_INVOICE,
    supplier: GHOACRUGOL_VENDOR,
    currency: 'USD',
    lines,
    palletCost: GHOACRUGOL_PALLET_COST,
    ddpCost: GHOACRUGOL_DDP_COST,
    totalDdpAmount: GHOACRUGOL_TOTAL_DDP,
    totalPieces: 718,
  };
}

export function fallbackSpandexParse(): ParsedSpandexInvoice {
  const lines = GHOACRUGOL_PACK_LINES.filter((line) => line.salesUnitPrice != null).map(
    (line) => ({
      sku: line.sku,
      description: line.salesDescription,
      quantity: line.quantity,
      salesUnitPrice: line.salesUnitPrice as number,
      total: round2(line.quantity * (line.salesUnitPrice as number)),
    }),
  );
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
  const lines = vendor.lines.map((line) => {
    const pack = GHOACRUGOL_PACK_LINES.find((item) => item.sku === line.sku);
    const sale =
      pack != null
        ? { saleWidthIn: pack.saleWidthIn, saleLengthIn: pack.saleLengthIn }
        : saleSizeFromPurchaseMm(line.widthMm, line.lengthMm);
    return {
      sku: line.sku,
      description: pack?.purchaseDescription ?? line.description,
      quantity: line.quantity,
      receivedQuantity: line.quantity,
      unitOfMeasure: 'sheet',
      vendorUnitCost: line.vendorUnitCost,
      vendorLineTotal: line.vendorLineTotal,
      weight: line.weight,
      volume: line.volume,
      purchaseWidthMm: line.widthMm || pack?.widthMm,
      purchaseLengthMm: line.lengthMm || pack?.lengthMm,
      saleWidthIn: sale.saleWidthIn,
      saleLengthIn: sale.saleLengthIn,
      matchingStatus: 'unmatched' as const,
      matchingConfidence: 0,
    };
  });
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
      // $11,600 DDP allocated by weight onto each piece.
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
  const lines = sales.lines.map((line) => {
    const pack = GHOACRUGOL_PACK_LINES.find((item) => item.sku === line.sku);
    return {
      sku: line.sku,
      description: pack?.salesDescription ?? line.description,
      quantity: line.quantity,
      salesUnitPrice: line.salesUnitPrice,
      discount: 0,
      tax: 0,
      total: line.total,
    };
  });
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
  return GHOACRUGOL_PACK_LINES.map((line) => ({
    sku: line.sku,
    description: line.salesDescription,
    costPrice: 0,
    salesPrice: 0,
    quantityInStock: 0,
    reorderLevel:
      line.sku === 'ACR-CLR-4MM-48X96'
        ? 20
        : line.sku === 'ACR-WHT-18MM-48X96' || line.sku === 'ACR-WHT-25MM-48X96'
          ? 5
          : 10,
  }));
}
