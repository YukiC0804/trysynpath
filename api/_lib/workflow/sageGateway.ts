import type {
  InventoryPostingStrategy,
  LandedCostAllocation,
  NormalizedDocumentBundle,
} from '../../../shared/workflow';
import {
  createContact,
  createPurchaseInvoice,
  createSalesInvoice,
  createStockItem,
  createStockMovement,
  findStockItemBySku,
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

function lineLedgerId(line: Record<string, unknown>): string {
  return String(
    (line.ledger_account as { id?: string } | undefined)?.id ??
      line.ledger_account_id ??
      '',
  );
}

function lineProductId(line: Record<string, unknown>): string {
  return String(
    (line.product as { id?: string } | undefined)?.id ?? line.product_id ?? '',
  );
}

function invoiceVerification(
  payload: Record<string, unknown>,
  readBack: Record<string, unknown>,
  kind: 'purchase' | 'sales',
) {
  // Hard identity only. Sage remaps currency/ledger/status/tax/date formats;
  // those must not mark a live-created draft invoice as failed.
  const expectedLines = (payload.invoice_lines ?? []) as Array<Record<string, unknown>>;
  const actualLines = (readBack.invoice_lines ?? []) as Array<Record<string, unknown>>;
  const criticalPairs: Record<string, { expected: unknown; actual: unknown }> = {
    reference: { expected: payload.reference, actual: readBack.reference },
    contactId: {
      expected: payload.contact_id,
      actual: (readBack.contact as { id?: string } | undefined)?.id,
    },
    lineCount: { expected: expectedLines.length, actual: actualLines.length },
  };
  expectedLines.forEach((line, index) => {
    const actual = actualLines[index] ?? {};
    criticalPairs[`line.${index}.quantity`] = {
      expected: line.quantity ?? 1,
      actual: actual.quantity ?? 1,
    };
    criticalPairs[`line.${index}.unitPrice`] = {
      expected: Number(line.unit_price ?? 0),
      actual: Number(actual.unit_price ?? 0),
    };
  });

  const softPairs: Record<string, { expected: unknown; actual: unknown }> = {
    date: {
      expected: String(payload.date ?? '').slice(0, 10),
      actual: String(readBack.date ?? '').slice(0, 10),
    },
  };
  expectedLines.forEach((line, index) => {
    const actual = actualLines[index] ?? {};
    if (line.ledger_account_id) {
      softPairs[`line.${index}.ledgerAccountId`] = {
        expected: line.ledger_account_id,
        actual: lineLedgerId(actual),
      };
    }
    if (line.product_id) {
      softPairs[`line.${index}.productId`] = {
        expected: line.product_id,
        actual: lineProductId(actual),
      };
    }
  });
  if (kind === 'purchase') {
    softPairs.vendorReference = {
      expected: payload.vendor_reference,
      actual: readBack.vendor_reference,
    };
  } else {
    softPairs.shippingNetAmount = {
      expected: Number(payload.shipping_net_amount ?? 0),
      actual: Number(readBack.shipping_net_amount ?? 0),
    };
  }

  const critical = differences(criticalPairs);
  const soft = differences(softPairs);
  const id = String(readBack.id ?? '');
  return {
    differences: { ...critical, ...soft },
    verified: Object.keys(critical).length === 0 && Boolean(id),
  };
}

export function formatReadBackDifferences(diff: Record<string, unknown>): string {
  const entries = Object.entries(diff);
  if (!entries.length) return '';
  return entries
    .slice(0, 6)
    .map(([key, value]) => {
      const pair = value as { expected?: unknown; actual?: unknown };
      return `${key}: expected ${String(pair.expected ?? '')}, got ${String(pair.actual ?? '')}`;
    })
    .join('; ');
}

export function artefactStatusId(value: unknown): string {
  if (!value) return '';
  if (typeof value === 'string') return value;
  if (typeof value === 'object') {
    const status = value as { id?: unknown; displayed_as?: unknown };
    return String(status.id ?? status.displayed_as ?? '');
  }
  return '';
}

export function isNonDraftInvoiceStatus(status: string): boolean {
  const normalized = status.trim();
  return Boolean(normalized) && !/draft/i.test(normalized);
}

export function assertReleasedInvoice(
  invoice: Record<string, unknown>,
  label: string,
): void {
  const id = String(invoice.id ?? '');
  const status = artefactStatusId(invoice.status ?? invoice.status_id);
  if (!id) throw new Error(`${label} is missing a Sage id`);
  if (!isNonDraftInvoiceStatus(status)) {
    throw new Error(
      `${label} is still Draft in Sage (${status || 'no status'}). Release failed or was skipped.`,
    );
  }
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
  mainAddress?: Record<string, unknown>;
}) {
  const { bundle, reference, selections } = input;
  const taxPercentage = input.taxPercentage ?? 0;
  // Do not send main_address — not in Sage postPurchaseInvoices schema (UK).
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
    notes: `Synpath demo shipment ${bundle.shipment.containerNumber}`,
    invoice_lines: [
      ...bundle.shipment.lines.map((line) => {
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
      // UGolden TOTAL DDP Amount includes pallet + DDP charges on the same PI.
      ...bundle.landedCostComponents
        .filter((component) => component.capitalizable && !component.recoverableTax)
        .map((component) => {
          const amount = round(component.amount);
          return {
            description:
              component.id === 'charge-pallet'
                ? 'PALLETS COST'
                : component.id === 'charge-ddp'
                  ? 'DDP COST'
                  : `${component.type} — ${component.supplier}`,
            ledger_account_id: selections.purchaseLedgerAccountId,
            quantity: 1,
            unit_price: amount,
            tax_rate_id: selections.purchaseTaxRateId,
            tax_amount: taxAmount(amount, { percentage: taxPercentage }),
          };
        }),
    ],
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
      const landed = Number(allocation?.landedUnitCost ?? line.vendorUnitCost);
      // UK Accounting rejects `reference` on stock_movements (restricted parameter).
      // Spec required fields: stock_item_id, date, quantity, cost_price, details (max 50).
      // Encode the demo token in details for idempotent lookup/reset instead.
      const details = stockMovementDetailsMarker(input.reference, line.sku);
      return {
        stock_item_id: line.matchedSageStockItemId,
        date: input.bundle.shipment.arrivalDate,
        quantity: line.receivedQuantity,
        cost_price: Number(landed.toFixed(2)),
        details,
      };
    });
}

/** Idempotency token stored in Stock Movement `details` (UK cannot send `reference`). */
export function stockMovementDetailsMarker(demoReference: string, sku: string): string {
  return `${demoReference}|${sku}`.slice(0, 50);
}

/** Stock-out marker for Spandex sales quantities (negative stock movements). */
export function stockMovementSalesOutDetailsMarker(
  demoReference: string,
  sku: string,
): string {
  return `${demoReference}|OUT|${sku}`.slice(0, 50);
}

export function buildSalesInvoicePayload(input: {
  bundle: NormalizedDocumentBundle;
  reference: string;
  selections: Required<
    Pick<SagePayloadSelections, 'customerContactId' | 'salesLedgerAccountId' | 'salesTaxRateId'>
  > &
    SagePayloadSelections;
  taxPercentage?: number;
  mainAddress?: Record<string, unknown>;
}) {
  const invoice = input.bundle.customerInvoice;
  const taxPercentage = input.taxPercentage ?? 0;
  const mainAddress =
    input.mainAddress && Object.keys(input.mainAddress).length
      ? input.mainAddress
      : { address_line_1: invoice.customer || 'Synpath demo customer' };
  return {
    contact_id: input.selections.customerContactId,
    date: invoice.invoiceDate,
    due_date: invoice.dueDate,
    main_address: {
      address_line_1: String(
        (mainAddress as { address_line_1?: string }).address_line_1 ??
          invoice.customer ??
          'Synpath demo customer',
      ).slice(0, 200),
      ...((mainAddress as { address_line_2?: string }).address_line_2
        ? {
            address_line_2: String(
              (mainAddress as { address_line_2?: string }).address_line_2,
            ).slice(0, 200),
          }
        : {}),
      ...((mainAddress as { city?: string }).city
        ? { city: String((mainAddress as { city?: string }).city).slice(0, 100) }
        : {}),
      ...((mainAddress as { postal_code?: string }).postal_code
        ? {
            postal_code: String(
              (mainAddress as { postal_code?: string }).postal_code,
            ).slice(0, 20),
          }
        : {}),
      // UK Sales Invoice create is more reliable with an explicit country.
      country_id: String(
        (mainAddress as { country_id?: string }).country_id ?? 'GB',
      ),
    },
    ...(invoice.currency !== 'GBP' ? { currency_id: invoice.currency } : {}),
    ...(input.selections.salesStatusId ? { status_id: input.selections.salesStatusId } : {}),
    // Unique per demo run so Reset/retry cannot reuse a voided GB-CUST-1042 invoice.
    reference: input.reference,
    notes: `Customer invoice ${invoice.sourceInvoiceNumber}`.slice(0, 200),
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
    const lower = name.trim().toLowerCase();
    if (!lower) return undefined;
    const matchesType = (contact: NormalizedContact) =>
      contact.typeIds.some((typeId) => typeId.toUpperCase().includes(type));

    const typed = contacts.filter(matchesType);
    const pool = typed.length ? typed : contacts;
    return (
      pool.find((contact) => contact.name.toLowerCase() === lower) ??
      pool.find((contact) => contact.name.toLowerCase().includes(lower)) ??
      pool.find((contact) => lower.includes(contact.name.toLowerCase())) ??
      contacts.find((contact) => contact.name.toLowerCase() === lower) ??
      contacts.find((contact) => contact.name.toLowerCase().includes(lower))
    );
  }

  async ensureContact(type: 'VENDOR' | 'CUSTOMER', name: string) {
    const contacts = await listContacts(this.accessToken, this.businessId);
    const existing = this.findContact(contacts, type, name);
    const hasRequestedType = existing?.typeIds.some((typeId) =>
      typeId.toUpperCase().includes(type),
    );
    if (existing && hasRequestedType) return existing;
    const base = {
      name,
      contact_type_ids: [type] as Array<'VENDOR' | 'CUSTOMER'>,
      reference: type === 'CUSTOMER' ? 'SYN-DEMO-CUSTOMER' : 'SYN-DEMO-SUPPLIER',
      notes: 'Created by the Synpath Ghostboards demo',
      main_address: { address_line_1: name, country_id: 'US' },
    };
    try {
      return await createContact(this.accessToken, this.businessId, {
        ...base,
        currency_id: 'USD',
      });
    } catch {
      try {
        return await createContact(this.accessToken, this.businessId, {
          ...base,
          currency_id: 'GBP',
          main_address: { address_line_1: name, country_id: 'GB' },
        });
      } catch {
        return createContact(this.accessToken, this.businessId, {
          name,
          contact_type_ids: [type],
          reference: type === 'CUSTOMER' ? 'SYN-DEMO-CUSTOMER' : 'SYN-DEMO-SUPPLIER',
          notes: 'Created by the Synpath Ghostboards demo',
        });
      }
    }
  }

  /** Create missing Sage Stock Items for demo PO lines (qty starts at 0). */
  async ensureStockItemsForShipment(
    shipmentLines: Array<{
      sku: string;
      description: string;
      vendorUnitCost: number;
    }>,
    salesLines: Array<{ sku: string; salesUnitPrice: number }>,
  ) {
    const created: string[] = [];
    for (const line of shipmentLines) {
      const existing = await findStockItemBySku(
        this.accessToken,
        this.businessId,
        line.sku,
      );
      if (existing) continue;
      const salesPrice =
        salesLines.find((item) => item.sku.toUpperCase() === line.sku.toUpperCase())
          ?.salesUnitPrice ?? 0;
      await createStockItem(this.accessToken, this.businessId, {
        item_code: line.sku,
        description: line.description,
        cost_price: line.vendorUnitCost,
        ...(salesPrice > 0 ? { sales_price: salesPrice } : {}),
        reorder_level: 10,
        reorder_quantity: 0,
      });
      created.push(line.sku);
    }
    return created;
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
    return {
      readBack,
      ...invoiceVerification(payload, readBack, 'purchase'),
    };
  }

  async findPurchaseInvoiceByReference(reference: string) {
    // Match the Synpath demo reference only — vendor_reference (e.g. NWA-INV-8841)
    // must not cause reuse of an unrelated Purchase Invoice.
    return (await listPurchaseInvoices(this.accessToken, this.businessId, reference)).find(
      (invoice) =>
        invoice.reference === reference &&
        !/void|deleted|cancelled|canceled/i.test(invoice.status),
    );
  }

  async findStockMovement(detailsMarker: string, stockItemId: string) {
    // UK stock movements have no usable `reference`; match on details + stock item.
    const needle = detailsMarker.slice(0, 50);
    return (
      await listStockMovements(
        this.accessToken,
        this.businessId,
        needle,
        stockItemId,
      )
    ).find((movement) => {
      const details = String(movement.details ?? '');
      const itemId = String(
        (movement.stock_item as { id?: string } | undefined)?.id ??
          movement.stock_item_id ??
          '',
      );
      return details === needle && itemId === stockItemId;
    });
  }

  async findSalesInvoiceByReference(reference: string) {
    return (await listSalesInvoices(this.accessToken, this.businessId, reference)).find(
      (invoice) => {
        const status = String(
          (invoice.status as { id?: string; displayed_as?: string } | undefined)?.id ??
            (invoice.status as { displayed_as?: string } | undefined)?.displayed_as ??
            invoice.status_id ??
            '',
        );
        return (
          String(invoice.reference ?? '') === reference &&
          !/void|deleted|cancelled|canceled/i.test(status)
        );
      },
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
    const actualDate = String(readBack.date ?? '').slice(0, 10);
    const expectedDate = String(payload.date ?? '').slice(0, 10);
    // Demo-grade verify: identity + quantity. Do not require `reference` (UK-restricted).
    const critical = differences({
      stockItemId: {
        expected: payload.stock_item_id,
        actual:
          (readBack.stock_item as { id?: string } | undefined)?.id ??
          readBack.stock_item_id,
      },
      quantity: { expected: payload.quantity, actual: readBack.quantity },
    });
    const soft = differences({
      details: { expected: payload.details, actual: readBack.details },
      date: { expected: expectedDate, actual: actualDate },
      costPrice: { expected: payload.cost_price, actual: readBack.cost_price },
    });
    if (soft.costPrice) {
      const expected = Number(payload.cost_price ?? 0);
      const actual = Number(readBack.cost_price ?? 0);
      if (Math.abs(expected - actual) <= 0.05) delete soft.costPrice;
    }
    return {
      readBack,
      differences: { ...critical, ...soft },
      verified: Object.keys(critical).length === 0 && Boolean(id),
    };
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
    return {
      readBack,
      ...invoiceVerification(payload, readBack, 'sales'),
    };
  }

  async releasePurchaseInvoice(id: string) {
    const released = await releasePurchaseInvoice(this.accessToken, this.businessId, id);
    const readBack = await getPurchaseInvoice(this.accessToken, this.businessId, id);
    const releasedStatus = artefactStatusId(released.status ?? released.status_id);
    const readBackStatus = artefactStatusId(readBack.status ?? readBack.status_id);
    return {
      released,
      readBack,
      verified:
        String(released.id ?? id) === id &&
        String(readBack.id ?? '') === id &&
        isNonDraftInvoiceStatus(readBackStatus) &&
        (!releasedStatus || isNonDraftInvoiceStatus(releasedStatus)),
    };
  }

  async releaseSalesInvoice(id: string) {
    const released = await releaseSalesInvoice(this.accessToken, this.businessId, id);
    const readBack = await getSalesInvoice(this.accessToken, this.businessId, id);
    const releasedStatus = artefactStatusId(released.status ?? released.status_id);
    const readBackStatus = artefactStatusId(readBack.status ?? readBack.status_id);
    return {
      released,
      readBack,
      verified:
        String(released.id ?? id) === id &&
        String(readBack.id ?? '') === id &&
        isNonDraftInvoiceStatus(readBackStatus) &&
        (!releasedStatus || isNonDraftInvoiceStatus(releasedStatus)),
    };
  }
}
