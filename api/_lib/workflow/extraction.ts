import type {
  ExtractedField,
  NormalizedDocumentBundle,
  SourceDocument,
} from '../../../shared/workflow';
import {
  demoInvoiceDates,
  FIXTURE_CUSTOMER_INVOICE,
  FIXTURE_LANDED_COST_COMPONENTS,
  FIXTURE_SHIPMENT,
} from './fixtures';
import type { SourceCollection } from './sourceAdapters';

export interface ExtractionOverrides {
  shipment?: Partial<
    Pick<
      import('../../../shared/workflow').Shipment,
      | 'externalPoNumber'
      | 'containerNumber'
      | 'shipmentDate'
      | 'arrivalDate'
      | 'supplier'
      | 'vendorInvoiceNumber'
      | 'vendorInvoiceSubtotal'
      | 'vendorInvoiceTax'
      | 'vendorInvoiceTotal'
      | 'currency'
    >
  >;
  customerInvoice?: Partial<
    Pick<
      import('../../../shared/workflow').CustomerInvoice,
      | 'sourceInvoiceNumber'
      | 'customer'
      | 'invoiceDate'
      | 'dueDate'
      | 'currency'
      | 'reference'
      | 'shipping'
    >
  >;
  customerInvoiceLines?: Array<{
    sku: string;
    quantity?: number;
    salesUnitPrice?: number;
    discount?: number;
    tax?: number;
  }>;
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
    // Refresh dates on every extract so Sage's default month filter always shows
    // newly created Purchase/Sales Invoices (static May/old fixtures were hidden).
    const dates = demoInvoiceDates();
    shipment.shipmentDate = dates.shipmentDate;
    shipment.arrivalDate = dates.arrivalDate;
    customerInvoice.invoiceDate = dates.invoiceDate;
    customerInvoice.dueDate = dates.dueDate;
    Object.assign(shipment, overrides.shipment ?? {});
    Object.assign(customerInvoice, overrides.customerInvoice ?? {});
    for (const override of overrides.customerInvoiceLines ?? []) {
      const line = customerInvoice.lines.find((item) => item.sku === override.sku);
      if (!line) continue;
      if (override.quantity != null) line.quantity = override.quantity;
      if (override.salesUnitPrice != null) line.salesUnitPrice = override.salesUnitPrice;
      if (override.discount != null) line.discount = override.discount;
      if (override.tax != null) line.tax = override.tax;
      line.total = Number(
        (
          line.quantity * line.salesUnitPrice -
          line.discount +
          line.tax
        ).toFixed(2),
      );
    }
    if (overrides.customerInvoiceLines?.length || overrides.customerInvoice?.shipping != null) {
      customerInvoice.subtotal = Number(
        customerInvoice.lines
          .reduce(
            (sum, line) =>
              sum + line.quantity * line.salesUnitPrice - line.discount,
            0,
          )
          .toFixed(2),
      );
      customerInvoice.tax = Number(
        customerInvoice.lines.reduce((sum, line) => sum + line.tax, 0).toFixed(2),
      );
      customerInvoice.total = Number(
        (
          customerInvoice.subtotal +
          customerInvoice.tax +
          customerInvoice.shipping
        ).toFixed(2),
      );
    }
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
        overrides.shipment?.externalPoNumber != null,
      ),
      containerNumber: fixtureField(
        shipment.containerNumber,
        'fixture-bol',
        0.98,
        undefined,
        overrides.shipment?.containerNumber != null,
      ),
      supplier: fixtureField(
        shipment.supplier,
        'fixture-vendor-invoice',
        0.97,
        undefined,
        overrides.shipment?.supplier != null,
      ),
      exchangeRate: fixtureField(
        shipment.exchangeRate,
        'fixture-vendor-invoice',
        0.95,
        undefined,
        overrides.exchangeRate != null,
      ),
      vendorInvoiceNumber: fixtureField(
        shipment.vendorInvoiceNumber,
        'fixture-vendor-invoice',
        0.99,
        undefined,
        overrides.shipment?.vendorInvoiceNumber != null,
      ),
      customerInvoiceNumber: fixtureField(
        customerInvoice.sourceInvoiceNumber,
        'fixture-customer-invoice',
        0.99,
        undefined,
        overrides.customerInvoice?.sourceInvoiceNumber != null,
      ),
      customer: fixtureField(
        customerInvoice.customer,
        'fixture-customer-invoice',
        0.97,
        undefined,
        overrides.customerInvoice?.customer != null,
      ),
      customerInvoiceDate: fixtureField(
        customerInvoice.invoiceDate,
        'fixture-customer-invoice',
        0.98,
        undefined,
        overrides.customerInvoice?.invoiceDate != null,
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
    for (const line of customerInvoice.lines) {
      const manuallyEdited = Boolean(
        overrides.customerInvoiceLines?.find((item) => item.sku === line.sku),
      );
      fields[`customerLine.${line.sku}.quantity`] = fixtureField(
        line.quantity,
        'fixture-customer-invoice',
        0.98,
        undefined,
        manuallyEdited,
      );
      fields[`customerLine.${line.sku}.unitPrice`] = fixtureField(
        line.salesUnitPrice,
        'fixture-customer-invoice',
        0.98,
        undefined,
        manuallyEdited,
      );
      fields[`customerLine.${line.sku}.tax`] = fixtureField(
        line.tax,
        'fixture-customer-invoice',
        0.95,
        undefined,
        manuallyEdited,
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
