/**
 * Sage Accounting OpenAPI allowlists for create payloads (UK demo).
 * Only these keys are sent on write — undocumented/extra fields can 422
 * ("restricted for Accounting in United Kingdom").
 */

const PURCHASE_INVOICE_KEYS = [
  'contact_id',
  'date',
  'due_date',
  'reference',
  'vendor_reference',
  'notes',
  'status_id',
  'currency_id',
  'exchange_rate',
  'inverse_exchange_rate',
  'invoice_lines',
] as const;

const PURCHASE_INVOICE_LINE_KEYS = [
  'description',
  'ledger_account_id',
  'quantity',
  'unit_price',
  'tax_rate_id',
  'tax_amount',
  'product_id',
  'service_id',
  'net_amount',
] as const;

/** UK rejects `reference` on stock_movements — omit it always. */
const STOCK_MOVEMENT_KEYS = [
  'stock_item_id',
  'date',
  'quantity',
  'cost_price',
  'details',
  'movement_number',
] as const;

const SALES_INVOICE_KEYS = [
  'contact_id',
  'date',
  'due_date',
  'reference',
  'notes',
  'status_id',
  'currency_id',
  'exchange_rate',
  'main_address',
  'shipping_net_amount',
  'shipping_tax_amount',
  'shipping_tax_rate_id',
  'invoice_lines',
] as const;

const SALES_INVOICE_LINE_KEYS = [
  'description',
  'ledger_account_id',
  'quantity',
  'unit_price',
  'tax_rate_id',
  'tax_amount',
  'discount_amount',
  'product_id',
  'service_id',
  'net_amount',
] as const;

const ADDRESS_KEYS = [
  'address_line_1',
  'address_line_2',
  'city',
  'postal_code',
  'country_id',
  'address_type_id',
  'region',
  'country_group_id',
] as const;

const CONTACT_KEYS = [
  'name',
  'contact_type_ids',
  'reference',
  'default_sales_ledger_account_id',
  'default_sales_tax_rate_id',
  'default_purchase_ledger_account_id',
  'notes',
  'currency_id',
  'main_address',
] as const;

function pick(
  source: Record<string, unknown>,
  keys: readonly string[],
): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const key of keys) {
    if (source[key] !== undefined && source[key] !== null && source[key] !== '') {
      out[key] = source[key];
    }
  }
  return out;
}

function sanitizeAddress(value: unknown): Record<string, unknown> | undefined {
  if (!value || typeof value !== 'object') return undefined;
  const picked = pick(value as Record<string, unknown>, ADDRESS_KEYS);
  return Object.keys(picked).length ? picked : undefined;
}

function sanitizeLines(
  lines: unknown,
  keys: readonly string[],
): Array<Record<string, unknown>> {
  if (!Array.isArray(lines)) return [];
  return lines.map((line) =>
    pick((line && typeof line === 'object' ? line : {}) as Record<string, unknown>, keys),
  );
}

export function sanitizePurchaseInvoicePayload(
  payload: Record<string, unknown>,
): Record<string, unknown> {
  // `main_address` is NOT in postPurchaseInvoices — never send it.
  const { main_address: _omit, ...rest } = payload;
  const sanitized = pick(rest, PURCHASE_INVOICE_KEYS);
  sanitized.invoice_lines = sanitizeLines(payload.invoice_lines, PURCHASE_INVOICE_LINE_KEYS);
  return sanitized;
}

export function sanitizeStockMovementPayload(
  payload: Record<string, unknown>,
): Record<string, unknown> {
  // Explicitly drop UK-restricted `reference`.
  const { reference: _omit, ...rest } = payload;
  const sanitized = pick(rest, STOCK_MOVEMENT_KEYS);
  if (typeof sanitized.details === 'string') {
    sanitized.details = sanitized.details.slice(0, 50);
  }
  return sanitized;
}

export function sanitizeSalesInvoicePayload(
  payload: Record<string, unknown>,
): Record<string, unknown> {
  const sanitized = pick(payload, SALES_INVOICE_KEYS);
  const address = sanitizeAddress(payload.main_address);
  if (address) sanitized.main_address = address;
  else delete sanitized.main_address;
  sanitized.invoice_lines = sanitizeLines(payload.invoice_lines, SALES_INVOICE_LINE_KEYS);
  return sanitized;
}

export function sanitizeContactPayload(
  payload: Record<string, unknown>,
): Record<string, unknown> {
  const sanitized = pick(payload, CONTACT_KEYS);
  const address = sanitizeAddress(payload.main_address);
  if (address) sanitized.main_address = address;
  else delete sanitized.main_address;
  return sanitized;
}
