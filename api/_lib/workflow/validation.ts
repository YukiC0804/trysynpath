import type { NormalizedDocumentBundle } from '../../../shared/workflow';

export function validateNormalizedBundle(bundle: NormalizedDocumentBundle): string[] {
  const errors: string[] = [];
  if (!bundle.shipment.externalPoNumber) errors.push('External PO number is required');
  if (!bundle.shipment.containerNumber) errors.push('Container number is required');
  if (!bundle.shipment.vendorInvoiceNumber) errors.push('Vendor invoice number is required');
  if (
    Math.abs(
      bundle.shipment.vendorInvoiceSubtotal +
        bundle.shipment.vendorInvoiceTax -
        bundle.shipment.vendorInvoiceTotal,
    ) > 0.01
  ) {
    errors.push('Vendor invoice subtotal, tax and total do not reconcile');
  }
  if (!bundle.shipment.lines.length) errors.push('At least one shipment line is required');
  if (bundle.shipment.exchangeRate <= 0) errors.push('Exchange rate must be greater than zero');
  for (const line of bundle.shipment.lines) {
    if (!line.sku) errors.push('Shipment SKU is required');
    if (line.receivedQuantity <= 0) errors.push(`${line.sku}: received quantity must be positive`);
    if (line.vendorUnitCost < 0) errors.push(`${line.sku}: vendor unit cost cannot be negative`);
  }
  if (!bundle.customerInvoice.sourceInvoiceNumber) {
    errors.push('Customer invoice number is required');
  }
  if (
    Math.abs(
      bundle.customerInvoice.subtotal +
        bundle.customerInvoice.shipping +
        bundle.customerInvoice.tax -
        bundle.customerInvoice.total,
    ) > 0.01
  ) {
    errors.push('Customer Invoice subtotal, shipping, tax and total do not reconcile');
  }
  return errors;
}
