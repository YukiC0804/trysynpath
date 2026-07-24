import { describe, expect, it } from 'vitest';
import { allocateLandedCost, resolveImportPool, sheetWeightKg } from '../api/_lib/ghost/landedCost';
import type { DocumentExtract } from '../shared/ghost';
import { buildSkuId, normalizeSheetSize } from '../api/_lib/ghost/sku';
import { documentAiToExtract, parseThicknessSize, propagateAcrylicDims } from '../api/_lib/ghost/mapToExtract';
import type { InvoiceData } from '../api/_lib/ghost/documentAi';

function purchase(partial: Partial<DocumentExtract> = {}): DocumentExtract {
  return {
    document_role: 'purchase_invoice',
    vendor: { id: 'GOK', name: 'Gokai Industrial' },
    invoice_number: 'INV-1',
    invoice_date: '2026-01-15',
    currency: 'USD',
    invoice_total: 520,
    includes_ddp: true,
    ddp_amount: null,
    freight_amount: null,
    duty_amount: null,
    lines: [
      {
        raw_description: 'Acrylic 4mm Clear 1220x2440',
        is_acrylic: true,
        is_packing_or_misc: false,
        product_code: 'ACR',
        color_code: 'CLR',
        color_name: 'Clear',
        thickness_mm: 4,
        size: '4x8',
        quantity: 10,
        unit_price: 40,
        amount: 400,
        line_kind: 'acrylic',
      },
      {
        raw_description: 'Export packing',
        is_acrylic: false,
        is_packing_or_misc: true,
        quantity: 1,
        unit_price: 20,
        amount: 20,
        line_kind: 'packing',
      },
    ],
    notes: null,
    ...partial,
  };
}

describe('ghost landed cost (ai_erp port)', () => {
  it('computes sheet weight factor', () => {
    expect(sheetWeightKg(4)).toBeCloseTo(1.22 * 2.44 * 1.2 * 4, 6);
  });

  it('uses DDP residual pool and excludes packing from weight', () => {
    const { method, importPool } = resolveImportPool(purchase());
    expect(method).toBe('ddp_on_invoice');
    // includes_ddp with null ddp_amount → invoice_total - acrylic product cost
    expect(importPool).toBe(120);

    const { lines, breakdown } = allocateLandedCost(purchase(), {
      vendorId: 'GOK',
      vendorName: 'Gokai',
    });
    expect(breakdown.import_pool).toBe(120);
    expect(lines).toHaveLength(1);
    expect(lines[0]!.raw_unit_price).toBe(40);
    expect(lines[0]!.landed_unit_cost).toBeGreaterThan(40);
  });

  it('errors when DDP and freight/duty both present', () => {
    expect(() =>
      resolveImportPool(
        purchase({ includes_ddp: true, ddp_amount: 100 }),
        {
          document_role: 'freight',
          includes_ddp: false,
          lines: [],
          freight_amount: 50,
          invoice_total: 50,
        },
      ),
    ).toThrow(/ambiguous/);
  });
});

describe('sku helpers', () => {
  it('builds Ghost SKU ids and normalizes mm sizes', () => {
    expect(normalizeSheetSize('1220x2440')).toBe('4x8');
    expect(
      buildSkuId({
        vendorId: 'GOK',
        productCode: 'ACR',
        colorCode: 'CLR',
        thicknessMm: 4,
        size: '4x8',
      }),
    ).toBe('GHOGOKACRCLR4mm4x8');
  });
});

describe('document AI map', () => {
  it('maps supplier and line kinds', () => {
    const invoice: InvoiceData = {
      invoice_id: 'UG26',
      invoice_type: '',
      purchase_order: '',
      invoice_date: '2026-01-10',
      due_date: '',
      delivery_date: '',
      currency: 'USD',
      currency_exchange_rate: null,
      net_amount: null,
      total_amount: 500,
      total_tax_amount: null,
      freight_amount: null,
      amount_paid_since_last_invoice: null,
      supplier_name: 'Gokai Industrial Co.',
      supplier_address: '',
      supplier_email: '',
      supplier_phone: '',
      supplier_website: '',
      supplier_tax_id: '',
      supplier_iban: '',
      supplier_registration: '',
      supplier_payment_ref: '',
      receiver_name: '',
      receiver_address: '',
      receiver_email: '',
      receiver_phone: '',
      receiver_website: '',
      receiver_tax_id: '',
      ship_to_name: '',
      ship_to_address: '',
      ship_from_name: '',
      ship_from_address: '',
      remit_to_name: '',
      remit_to_address: '',
      carrier: '',
      payment_terms: '',
      line_items: [
        {
          description: 'Clear acrylic sheet 4mm 4x8',
          quantity: 5,
          unit: 'pcs',
          unit_price: 40,
          amount: 200,
          product_code: 'ACR',
          purchase_order: '',
        },
        {
          description: 'Export packing pallet',
          quantity: 1,
          unit: '',
          unit_price: 20,
          amount: 20,
          product_code: '',
          purchase_order: '',
        },
      ],
      raw_text: '',
    };
    const doc = documentAiToExtract(invoice, 'purchase_invoice');
    expect(doc.vendor?.id).toBe('GOK');
    expect(doc.lines.some((l) => l.line_kind === 'acrylic')).toBe(true);
    expect(doc.lines.some((l) => l.line_kind === 'packing')).toBe(true);
  });

  it('parses cut-to inch sizes and propagates dims across acrylic rows', () => {
    expect(parseThicknessSize('(cut to 18" x 24")').size).toBe('18x24');
    const doc = propagateAcrylicDims({
      document_role: 'purchase_invoice',
      includes_ddp: false,
      lines: [
        {
          raw_description: 'Acrylic Sheet 100% virgin',
          is_acrylic: true,
          is_packing_or_misc: false,
          quantity: 10,
          unit_price: 12,
          amount: 120,
          line_kind: 'acrylic',
          thickness_mm: null,
          size: null,
        },
        {
          raw_description: 'clear,GK-000 (cut to 18" x 24")',
          is_acrylic: true,
          is_packing_or_misc: false,
          quantity: 0,
          unit_price: 0,
          amount: null,
          line_kind: 'acrylic',
          thickness_mm: 3,
          size: '18x24',
        },
      ],
      notes: null,
    });
    expect(doc.lines[0]!.size).toBe('18x24');
    expect(doc.lines[0]!.thickness_mm).toBe(3);
  });
});
