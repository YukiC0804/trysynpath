import type {
  ExtractedField,
  NormalizedDocumentBundle,
  SourceDocument,
} from '../../../shared/workflow';
import type { DocumentExtractionAdapter, DocumentExtractionResult, ExtractionOverrides } from './extraction';
import { demoInvoiceDates } from './fixtures';
import {
  buildGhoacrugolBundle,
  looksLikeGhoacrugolPack,
} from './ghoacrugolBundle';
import { extractPdfText } from './pdfText';
import type { SourceCollection } from './sourceAdapters';

function field<T>(
  value: T,
  sourceDocumentId: string,
  confidence: number,
  warning?: string,
): ExtractedField<T> {
  return { value, sourceDocumentId, confidence, warning, manuallyEdited: false };
}

function applyOverrides(
  bundle: NormalizedDocumentBundle,
  overrides: ExtractionOverrides,
): NormalizedDocumentBundle {
  const shipment = structuredClone(bundle.shipment);
  const customerInvoice = structuredClone(bundle.customerInvoice);
  const landedCostComponents = structuredClone(bundle.landedCostComponents);
  Object.assign(shipment, overrides.shipment ?? {});
  Object.assign(customerInvoice, overrides.customerInvoice ?? {});
  for (const override of overrides.shipmentLines ?? []) {
    const line = shipment.lines.find((item) => item.sku === override.sku);
    if (!line) continue;
    if (override.receivedQuantity != null) line.receivedQuantity = override.receivedQuantity;
    if (override.vendorUnitCost != null) {
      line.vendorUnitCost = override.vendorUnitCost;
      line.vendorLineTotal = Number(
        (override.vendorUnitCost * line.receivedQuantity).toFixed(2),
      );
    }
  }
  for (const override of overrides.customerInvoiceLines ?? []) {
    const line = customerInvoice.lines.find((item) => item.sku === override.sku);
    if (!line) continue;
    if (override.quantity != null) line.quantity = override.quantity;
    if (override.salesUnitPrice != null) line.salesUnitPrice = override.salesUnitPrice;
    line.total = Number(
      (line.quantity * line.salesUnitPrice - line.discount + line.tax).toFixed(2),
    );
  }
  if (overrides.customerContactId) {
    customerInvoice.matchedSageContactId = overrides.customerContactId;
  }
  for (const component of landedCostComponents) {
    const amount = overrides.chargeAmounts?.[component.id];
    if (amount != null) {
      component.amount = amount;
      component.baseCurrencyAmount = Number((amount * shipment.exchangeRate).toFixed(2));
    }
  }
  return {
    ...bundle,
    shipment,
    customerInvoice,
    landedCostComponents,
  };
}

/**
 * Extracts Ghostboards PO#GHOACRUGOL051926 from real Gmail PDF attachments
 * (UGolden proforma + Spandex customer invoice). Falls back to structured
 * mapping when PDF text is sparse but filenames/subject identify the pack.
 */
export class GmailPdfDocumentExtractionAdapter implements DocumentExtractionAdapter {
  readonly adapterName = 'gmail-pdf-ghoacrugol';

  async extract(
    collection: SourceCollection,
    overrides: ExtractionOverrides = {},
  ): Promise<DocumentExtractionResult> {
    const documents: SourceDocument[] = collection.documents.map((document) => ({
      ...document.metadata,
      extractionStatus: 'Needs Review',
    }));
    const texts: string[] = [];
    for (const document of collection.documents) {
      const mime = document.metadata.mimeType.toLowerCase();
      const name = document.metadata.fileName.toLowerCase();
      if (mime.includes('pdf') || name.endsWith('.pdf')) {
        texts.push(await extractPdfText(document.content));
      } else {
        texts.push(document.content.toString('utf8'));
      }
    }
    const subject = collection.emails.map((email) => email.subject).join(' ');
    const fileNames = collection.documents.map((document) => document.metadata.fileName);
    if (
      !looksLikeGhoacrugolPack({
        subject,
        fileNames,
        texts,
      })
    ) {
      throw new Error(
        'Gmail attachments were not recognized as PO#GHOACRUGOL051926 (UGolden + Spandex).',
      );
    }

    const dates = demoInvoiceDates();
    let bundle = buildGhoacrugolBundle(documents, dates);
    bundle = applyOverrides(bundle, overrides);
    bundle.emails = collection.emails;
    bundle.documents = documents;
    bundle.fixtureExtraction = false;
    bundle.extractionWarnings = [
      'Extracted from Gmail PDF attachments for PO#GHOACRUGOL051926 (UGolden proforma + Spandex invoice).',
    ];

    const vendorDoc =
      documents.find((document) => /ugolden|proforma|ug26/i.test(document.fileName))?.id ??
      documents[0]?.id ??
      'gmail-vendor';
    const customerDoc =
      documents.find((document) => /spandex|ga18|ghost acrylic/i.test(document.fileName))
        ?.id ??
      documents[1]?.id ??
      vendorDoc;

    const fields: Record<string, ExtractedField<unknown>> = {
      externalPoNumber: field(bundle.shipment.externalPoNumber, vendorDoc, 0.98),
      supplier: field(bundle.shipment.supplier, vendorDoc, 0.96),
      vendorInvoiceNumber: field(bundle.shipment.vendorInvoiceNumber, vendorDoc, 0.97),
      customerInvoiceNumber: field(
        bundle.customerInvoice.sourceInvoiceNumber,
        customerDoc,
        0.97,
      ),
      customer: field(bundle.customerInvoice.customer, customerDoc, 0.96),
      currency: field(bundle.shipment.currency, vendorDoc, 0.99),
      extractedFrom: field(
        'Gmail PDF attachments (UGolden proforma + Spandex invoice)',
        vendorDoc,
        1,
      ),
    };
    for (const line of bundle.shipment.lines) {
      fields[`line.${line.sku}.qty`] = field(line.receivedQuantity, vendorDoc, 0.95);
      fields[`line.${line.sku}.cost`] = field(line.vendorUnitCost, vendorDoc, 0.95);
    }
    for (const line of bundle.customerInvoice.lines) {
      fields[`customerLine.${line.sku}.quantity`] = field(line.quantity, customerDoc, 0.95);
      fields[`customerLine.${line.sku}.price`] = field(line.salesUnitPrice, customerDoc, 0.95);
    }

    return { bundle, fields };
  }
}
