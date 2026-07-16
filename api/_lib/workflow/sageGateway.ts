import type {
  InventoryPostingStrategy,
  LandedCostAllocation,
  NormalizedDocumentBundle,
} from '../../../shared/workflow';
import {
  createPurchaseInvoice,
  createSalesInvoice,
  createStockMovement,
  getPurchaseInvoice,
  getSalesInvoice,
  getStockMovement,
  listArtefactStatuses,
  listContacts,
  listCurrencies,
  listPurchaseLedgerAccounts,
  listPurchaseInvoices,
  listSalesInvoices,
  listSalesLedgerAccounts,
  listStockItems,
  listStockMovements,
  listTaxRates,
  releasePurchaseInvoice,
  releaseSalesInvoice,
  type NormalizedContact,
} from '../sage/client';

export interface SagePayloadSelections {
  supplierContactId?: string;
  customerContactId?: string;
  purchaseLedgerAccountId?: string;
  salesLedgerAccountId?: string;
  purchaseTaxRateId?: string;
  salesTaxRateId?: string;
  purchaseStatusId?: string;
  salesStatusId?: string;
}

const round = (value: number) => Number(value.toFixed(2));

function differences(
  pairs: Record<string, { expected: unknown; actual: unknown }>,
) {
  return Object.fromEntries(
    Object.entries(pairs).filter(
      ([, value]) => {
        if (
          typeof value.expected === 'number' ||
          typeof value.actual === 'number'
        ) {
          return (
            Math.abs(Number(value.expected ?? 0) - Number(value.actual ?? 0)) >
            0.005
          );
        }
        return String(value.expected ?? '') !== String(value.actual ?? '');
      },
    ),
  );
}

function invoiceDifferences(
  payload: Record<string, unknown>,
  readBack: Record<string, unknown>,
  kind: 'purchase' | 'sales',
) {
  const pairs: Record<string, { expected: unknown; actual: unknown }> = {
    reference: { expected: payload.reference, actual: readBack.reference },
    contactId: {
      expected: payload.contact_id,
      actual: (readBack.contact as { id?: string } | undefined)?.id,
    },
    date: { expected: payload.date, actual: readBack.date },
    dueDate: { expected: payload.due_date, actual: readBack.due_date },
    currencyId: {
      expected: payload.currency_id ?? 'GBP',
      actual: (readBack.currency as { id?: string } | undefined)?.id ?? 'GBP',
    },
    statusId: {
      expected: payload.status_id,
      actual: (readBack.status as { id?: string } | undefined)?.id,
    },
  };
  const expectedLines = (payload.invoice_lines ?? []) as Array<Record<string, unknown>>;
  const actualLines = (readBack.invoice_lines ?? []) as Array<Record<string, unknown>>;
  pairs.lineCount = { expected: expectedLines.length, actual: actualLines.length };
  expectedLines.forEach((line, index) => {
    const actual = actualLines[index] ?? {};
    pairs[`line.${index}.description`] = {
      expected: line.description,
      actual: actual.description,
    };
    pairs[`line.${index}.ledgerAccountId`] = {
      expected: line.ledger_account_id,
      actual: (actual.ledger_account as { id?: string } | undefined)?.id,
    };
    pairs[`line.${index}.quantity`] = {
      expected: line.quantity ?? 1,
      actual: actual.quantity ?? 1,
    };
    pairs[`line.${index}.unitPrice`] = {
      expected: line.unit_price,
      actual: actual.unit_price,
    };
    pairs[`line.${index}.taxRateId`] = {
      expected: line.tax_rate_id,
      actual: (actual.tax_rate as { id?: string } | undefined)?.id,
    };
    pairs[`line.${index}.taxAmount`] = {
      expected: line.tax_amount,
      actual: actual.tax_amount,
    };
    if (line.product_id) {
      pairs[`line.${index}.productId`] = {
        expected: line.product_id,
        actual: (actual.product as { id?: string } | undefined)?.id,
      };
    }
  });
  if (kind === 'purchase') {
    pairs.vendorReference = {
      expected: payload.vendor_reference,
      actual: readBack.vendor_reference,
    };
  } else {
    pairs.shippingNetAmount = {
      expected: payload.shipping_net_amount ?? 0,
      actual: readBack.shipping_net_amount ?? 0,
    };
    pairs.shippingTaxAmount = {
      expected: payload.shipping_tax_amount ?? 0,
      actual: readBack.shipping_tax_amount ?? 0,
    };
  }
  return differences(pairs);
}

function taxAmount(net: number, rate?: { percentage?: number | string }) {
  return round(net * (Number(rate?.percentage ?? 0) / 100));
}

export function buildPurchaseInvoicePayload(input: {
  bundle: NormalizedDocumentBundle;
  reference: string;
  selections: Required<
    Pick<
      SagePayloadSelections,
      'supplierContactId' | 'purchaseLedgerAccountId' | 'purchaseTaxRateId'
    >
  > &
    SagePayloadSelections;
  taxPercentage?: number;
  inventoryPostingStrategy: InventoryPostingStrategy;
}) {
  const { bundle, reference, selections } = input;
  const taxPercentage = input.taxPercentage ?? 0;
  return {
    contact_id: selections.supplierContactId,
    date: bundle.shipment.shipmentDate,
    due_date: bundle.shipment.arrivalDate,
    ...(bundle.shipment.currency !== 'GBP'
      ? {
          currency_id: bundle.shipment.currency,
          exchange_rate: bundle.shipment.exchangeRate,
        }
      : {}),
    ...(selections.purchaseStatusId ? { status_id: selections.purchaseStatusId } : {}),
    reference,
    vendor_reference: bundle.shipment.vendorInvoiceNumber,
    notes: `Synpath demo shipment ${bundle.shipment.containerNumber}; source documents retained in Synpath`,
    invoice_lines: bundle.shipment.lines.map((line) => {
      const net = round(line.receivedQuantity * line.vendorUnitCost);
      return {
        description: `${line.sku} — ${line.description}`,
        ledger_account_id: selections.purchaseLedgerAccountId,
        quantity: line.receivedQuantity,
        unit_price: line.vendorUnitCost,
        tax_rate_id: selections.purchaseTaxRateId,
        tax_amount: taxAmount(net, { percentage: taxPercentage }),
        ...(input.inventoryPostingStrategy === 'purchase_invoice_product_lines' &&
        line.matchedSageStockItemId
          ? { product_id: line.matchedSageStockItemId }
          : {}),
      };
    }),
  };
}

export function buildStockMovementPayloads(input: {
  bundle: NormalizedDocumentBundle;
  allocations: LandedCostAllocation[];
  reference: string;
  strategy: InventoryPostingStrategy;
}) {
  if (input.strategy !== 'stock_movement') return [];
  return input.bundle.shipment.lines
    .filter((line) => line.matchedSageStockItemId)
    .map((line) => {
      const allocation = input.allocations.find((item) => item.sku === line.sku);
      return {
        stock_item_id: line.matchedSageStockItemId,
        date: input.bundle.shipment.arrivalDate,
        quantity: line.receivedQuantity,
        cost_price: allocation?.landedUnitCost ?? line.vendorUnitCost,
        details: `Synpath inventory receipt for ${line.sku}; not natively linked to Purchase Invoice`,
        reference: input.reference,
      };
    });
}

export function buildSalesInvoicePayload(input: {
  bundle: NormalizedDocumentBundle;
  reference: string;
  selections: Required<
    Pick<SagePayloadSelections, 'customerContactId' | 'salesLedgerAccountId' | 'salesTaxRateId'>
  > &
    SagePayloadSelections;
  taxPercentage?: number;
}) {
  const invoice = input.bundle.customerInvoice;
  const taxPercentage = input.taxPercentage ?? 0;
  return {
    contact_id: input.selections.customerContactId,
    date: invoice.invoiceDate,
    due_date: invoice.dueDate,
    ...(invoice.currency !== 'GBP' ? { currency_id: invoice.currency } : {}),
    ...(input.selections.salesStatusId ? { status_id: input.selections.salesStatusId } : {}),
    reference: invoice.sourceInvoiceNumber,
    notes: `Synpath source reference ${input.reference}`,
    invoice_lines: invoice.lines.map((line) => {
      const net = round(line.quantity * line.salesUnitPrice - line.discount);
      return {
        description: `${line.sku} — ${line.description}`,
        ledger_account_id: input.selections.salesLedgerAccountId,
        unit_price: line.salesUnitPrice,
        quantity: line.quantity,
        discount_amount: line.discount,
        tax_rate_id: input.selections.salesTaxRateId,
        tax_amount: line.tax || taxAmount(net, { percentage: taxPercentage }),
        ...(line.matchedSageStockItemId ? { product_id: line.matchedSageStockItemId } : {}),
      };
    }),
    shipping_net_amount: invoice.shipping,
    shipping_tax_rate_id: input.selections.salesTaxRateId,
    shipping_tax_amount: round(invoice.shipping * (taxPercentage / 100)),
  };
}

export class SageGateway {
  constructor(
    private readonly accessToken: string,
    readonly businessId: string,
  ) {}

  async loadReferenceData() {
    const [
      stockItems,
      contacts,
      ledgerAccounts,
      salesLedgerAccounts,
      purchaseTaxRates,
      salesTaxRates,
      currencies,
      artefactStatuses,
    ] = await Promise.all([
      listStockItems(this.accessToken, this.businessId),
      listContacts(this.accessToken, this.businessId),
      listPurchaseLedgerAccounts(this.accessToken, this.businessId),
      listSalesLedgerAccounts(this.accessToken, this.businessId),
      listTaxRates(this.accessToken, this.businessId, 'purchase'),
      listTaxRates(this.accessToken, this.businessId, 'sales'),
      listCurrencies(this.accessToken, this.businessId),
      listArtefactStatuses(this.accessToken, this.businessId),
    ]);
    return {
      stockItems,
      contacts,
      ledgerAccounts,
      salesLedgerAccounts,
      taxRates: [
        ...new Map(
          [...purchaseTaxRates, ...salesTaxRates].map((rate) => [rate.id, rate]),
        ).values(),
      ],
      purchaseTaxRates,
      salesTaxRates,
      currencies,
      artefactStatuses,
    };
  }

  findContact(
    contacts: NormalizedContact[],
    type: 'VENDOR' | 'CUSTOMER',
    name: string,
  ) {
    const lower = name.toLowerCase();
    return (
      contacts.find(
        (contact) =>
          contact.typeIds.includes(type) && contact.name.toLowerCase() === lower,
      ) ??
      contacts.find(
        (contact) =>
          contact.typeIds.includes(type) && contact.name.toLowerCase().includes(lower),
      )
    );
  }

  async createAndReadPurchaseInvoice(payload: Record<string, unknown>) {
    const created = await createPurchaseInvoice(
      this.accessToken,
      this.businessId,
      payload,
    );
    if (!created.id) throw new Error('Sage returned no Purchase Invoice ID');
    const verified = await this.readAndVerifyPurchaseInvoice(created.id, payload);
    return { id: created.id, created, ...verified };
  }

  async readAndVerifyPurchaseInvoice(id: string, payload: Record<string, unknown>) {
    const readBack = await getPurchaseInvoice(this.accessToken, this.businessId, id);
    const diff = invoiceDifferences(payload, readBack, 'purchase');
    return { readBack, differences: diff, verified: Object.keys(diff).length === 0 };
  }

  async findPurchaseInvoiceByReference(reference: string) {
    return (await listPurchaseInvoices(this.accessToken, this.businessId, reference)).find(
      (invoice) =>
        invoice.reference === reference || invoice.vendorReference === reference,
    );
  }

  async findStockMovement(reference: string, stockItemId: string) {
    return (
      await listStockMovements(
        this.accessToken,
        this.businessId,
        reference,
        stockItemId,
      )
    ).find(
      (movement) =>
        String(movement.reference ?? '') === reference &&
        String((movement.stock_item as { id?: string } | undefined)?.id ?? '') ===
          stockItemId,
    );
  }

  async findSalesInvoiceByReference(reference: string) {
    return (await listSalesInvoices(this.accessToken, this.businessId, reference)).find(
      (invoice) => String(invoice.reference ?? '') === reference,
    );
  }

  async createAndReadStockMovement(payload: Record<string, unknown>) {
    const created = await createStockMovement(this.accessToken, this.businessId, payload);
    const id = String(created.id ?? '');
    if (!id) throw new Error('Sage returned no Stock Movement ID');
    const verified = await this.readAndVerifyStockMovement(id, payload);
    return { id, created, ...verified };
  }

  async readAndVerifyStockMovement(id: string, payload: Record<string, unknown>) {
    const readBack = await getStockMovement(this.accessToken, this.businessId, id);
    const diff = differences({
      reference: { expected: payload.reference, actual: readBack.reference },
      stockItemId: {
        expected: payload.stock_item_id,
        actual: (readBack.stock_item as { id?: string } | undefined)?.id,
      },
      date: { expected: payload.date, actual: readBack.date },
      quantity: { expected: payload.quantity, actual: readBack.quantity },
      costPrice: { expected: payload.cost_price, actual: readBack.cost_price },
      details: { expected: payload.details, actual: readBack.details },
    });
    return { readBack, differences: diff, verified: Object.keys(diff).length === 0 };
  }

  async createAndReadSalesInvoice(payload: Record<string, unknown>) {
    const created = await createSalesInvoice(this.accessToken, this.businessId, payload);
    const id = String(created.id ?? '');
    if (!id) throw new Error('Sage returned no Sales Invoice ID');
    const verified = await this.readAndVerifySalesInvoice(id, payload);
    return { id, created, ...verified };
  }

  async readAndVerifySalesInvoice(id: string, payload: Record<string, unknown>) {
    const readBack = await getSalesInvoice(this.accessToken, this.businessId, id);
    const diff = invoiceDifferences(payload, readBack, 'sales');
    return { readBack, differences: diff, verified: Object.keys(diff).length === 0 };
  }

  async releasePurchaseInvoice(id: string) {
    const released = await releasePurchaseInvoice(this.accessToken, this.businessId, id);
    const readBack = await getPurchaseInvoice(this.accessToken, this.businessId, id);
    const releasedStatus = (released.status as { id?: string } | undefined)?.id;
    const readBackStatus = (readBack.status as { id?: string } | undefined)?.id;
    return {
      released,
      readBack,
      verified:
        String(released.id ?? '') === id &&
        String(readBack.id ?? '') === id &&
        Boolean(readBackStatus) &&
        readBackStatus !== 'DRAFT' &&
        (!releasedStatus || releasedStatus === readBackStatus),
    };
  }

  async releaseSalesInvoice(id: string) {
    const released = await releaseSalesInvoice(this.accessToken, this.businessId, id);
    const readBack = await getSalesInvoice(this.accessToken, this.businessId, id);
    const releasedStatus = (released.status as { id?: string } | undefined)?.id;
    const readBackStatus = (readBack.status as { id?: string } | undefined)?.id;
    return {
      released,
      readBack,
      verified:
        String(released.id ?? '') === id &&
        String(readBack.id ?? '') === id &&
        Boolean(readBackStatus) &&
        readBackStatus !== 'DRAFT' &&
        (!releasedStatus || releasedStatus === readBackStatus),
    };
  }
}
