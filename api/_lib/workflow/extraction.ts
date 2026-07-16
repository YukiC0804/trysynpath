import type {
  ExtractedField,
  NormalizedDocumentBundle,
  SourceDocument,
} from '../../../shared/workflow';
import {
  FIXTURE_CUSTOMER_INVOICE,
  FIXTURE_LANDED_COST_COMPONENTS,
  FIXTURE_SHIPMENT,
} from './fixtures';
import type { SourceCollection } from './sourceAdapters';

export interface ExtractionOverrides {
  exchangeRate?: number;
  shipmentLines?: Array<{
    sku: string;
    receivedQuantity?: number;
    vendorUnitCost?: number;
    weight?: number;
    volume?: number;
  }>;
  chargeAmounts?: Record<string, number>;
  chargeAllocationMethods?: Record<string, import('../../../shared/workflow').AllocationMethod>;
  chargeClassifications?: Record<
    string,
    import('../../../shared/workflow').ChargeClassification
  >;
  manualAllocations?: Record<string, Record<string, number>>;
  customerContactId?: string;
}

export interface DocumentExtractionResult {
  bundle: NormalizedDocumentBundle;
  fields: Record<string, ExtractedField<unknown>>;
}

export interface DocumentExtractionAdapter {
  readonly adapterName: string;
  extract(
    collection: SourceCollection,
    overrides?: ExtractionOverrides,
  ): Promise<DocumentExtractionResult>;
}

function fixtureField<T>(
  value: T,
  sourceDocumentId: string,
  confidence: number,
  warning?: string,
  manuallyEdited = false,
): ExtractedField<T> {
  return { value, sourceDocumentId, confidence, warning, manuallyEdited };
}

export class FixtureDocumentExtractionAdapter implements DocumentExtractionAdapter {
  readonly adapterName = 'fixture-normalized-results';

  async extract(
    collection: SourceCollection,
    overrides: ExtractionOverrides = {},
  ): Promise<DocumentExtractionResult> {
    const shipment = structuredClone(FIXTURE_SHIPMENT);
    const landedCostComponents = structuredClone(FIXTURE_LANDED_COST_COMPONENTS);
    const customerInvoice = structuredClone(FIXTURE_CUSTOMER_INVOICE);
    if (overrides.exchangeRate != null) shipment.exchangeRate = overrides.exchangeRate;
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
      if (override.weight != null) line.weight = override.weight;
      if (override.volume != null) line.volume = override.volume;
    }
    for (const component of landedCostComponents) {
      const amount = overrides.chargeAmounts?.[component.id];
      if (amount != null) {
        component.amount = amount;
        component.baseCurrencyAmount = Number((amount * shipment.exchangeRate).toFixed(2));
      }
      const method = overrides.chargeAllocationMethods?.[component.id];
      if (method) component.allocationMethod = method;
      const classification = overrides.chargeClassifications?.[component.id];
      if (classification) {
        component.classification = classification;
        component.capitalizable = classification === 'capitalizable';
        component.recoverableTax = classification === 'recoverable_tax';
      }
      const manual = overrides.manualAllocations?.[component.id];
      if (manual) component.manualAllocations = manual;
    }
    if (overrides.customerContactId) {
      customerInvoice.matchedSageContactId = overrides.customerContactId;
    }

    const documents: SourceDocument[] = collection.documents.map((document) => ({
      ...document.metadata,
      extractionStatus: 'Needs Review',
    }));
    if (collection.sourceType === 'gmail') {
      shipment.sourceDocumentIds = documents
        .filter((document) => document.documentType !== 'customer_invoice')
        .map((document) => document.id);
      const firstByType = new Map(
        documents.map((document) => [document.documentType, document.id]),
      );
      for (const component of landedCostComponents) {
        if (component.type === 'freight' || component.type === 'insurance') {
          component.sourceDocumentId =
            firstByType.get('freight_invoice') ?? component.sourceDocumentId;
        } else if (
          component.type === 'duty' ||
          component.type === 'brokerage' ||
          component.type === 'tax'
        ) {
          component.sourceDocumentId =
            firstByType.get('customs_duty') ?? component.sourceDocumentId;
        }
      }
    }
    const fields: Record<string, ExtractedField<unknown>> = {
      externalPoNumber: fixtureField(
        shipment.externalPoNumber,
        'fixture-po',
        0.99,
        'Fixture extraction result — not live AI extraction',
      ),
      containerNumber: fixtureField(shipment.containerNumber, 'fixture-bol', 0.98),
      supplier: fixtureField(shipment.supplier, 'fixture-vendor-invoice', 0.97),
      exchangeRate: fixtureField(
        shipment.exchangeRate,
        'fixture-vendor-invoice',
        0.95,
        undefined,
        overrides.exchangeRate != null,
      ),
      vendorInvoiceNumber: fixtureField('NWA-INV-8841', 'fixture-vendor-invoice', 0.99),
      customerInvoiceNumber: fixtureField(
        customerInvoice.sourceInvoiceNumber,
        'fixture-customer-invoice',
        0.99,
      ),
    };
    for (const line of shipment.lines) {
      fields[`line.${line.sku}.quantity`] = fixtureField(
        line.receivedQuantity,
        'fixture-vendor-invoice',
        0.98,
        undefined,
        Boolean(overrides.shipmentLines?.find((item) => item.sku === line.sku)),
      );
      fields[`line.${line.sku}.unitCost`] = fixtureField(
        line.vendorUnitCost,
        'fixture-vendor-invoice',
        0.98,
        undefined,
        Boolean(overrides.shipmentLines?.find((item) => item.sku === line.sku)),
      );
    }

    return {
      fields,
      bundle: {
        emails: structuredClone(collection.emails),
        documents,
        shipment,
        landedCostComponents,
        customerInvoice,
        extractionWarnings: [
          'Fixture extraction is a normalized test result, not a successful live AI extraction.',
          'Final customer layouts, classification rules and field mappings remain replaceable.',
        ],
        fixtureExtraction: true,
      },
    };
  }
}
