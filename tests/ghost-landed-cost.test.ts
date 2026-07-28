import { describe, expect, it } from 'vitest';
import { allocateLandedCost, resolveImportPool, sheetWeightKg } from '../api/_lib/ghost/landedCost';
import type { DocumentExtract } from '../shared/ghost';
import { buildDescription, buildSkuId, firstBrandWord, normalizeSheetSize } from '../api/_lib/ghost/sku';
import {
  customerIdFromName,
  documentAiToExtract,
  parseThicknessSize,
  propagateAcrylicDims,
  vendorIdFromName,
} from '../api/_lib/ghost/mapToExtract';
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

  it('ignores Export pallet/packing amounts entirely and merges same sku_id across customers', () => {
    const doc = purchase({
      includes_ddp: false,
      invoice_total: null,
      lines: [
        {
          raw_description: 'GK-CAS18T (CN LEDGE)',
          is_acrylic: true,
          is_packing_or_misc: false,
          product_code: 'ACR',
          color_code: 'CLR',
          color_name: 'Clear',
          thickness_mm: 18,
          size: '4x8',
          quantity: 72,
          unit_price: 118.53,
          amount: 8534.16,
          line_kind: 'acrylic',
          price_decimals: 3,
          customer_name: 'CN LEDGE',
        },
        {
          raw_description: 'Export pallet (For CN LEDGE)',
          is_acrylic: false,
          is_packing_or_misc: true,
          quantity: 3,
          unit_price: 36,
          amount: 108,
          line_kind: 'packing',
          customer_name: 'CN LEDGE',
        },
        {
          raw_description: 'GK-CAS18T (TROPHY DEPOT)',
          is_acrylic: true,
          is_packing_or_misc: false,
          product_code: 'ACR',
          color_code: 'CLR',
          color_name: 'Clear',
          thickness_mm: 18,
          size: '4x8',
          quantity: 40,
          unit_price: 120.69,
          amount: 4827.6,
          line_kind: 'acrylic',
          price_decimals: 3,
          customer_name: 'TROPHY DEPOT',
        },
        {
          raw_description: 'Export pallet (for TROPHY DEPOT)',
          is_acrylic: false,
          is_packing_or_misc: true,
          quantity: 1,
          unit_price: 40,
          amount: 40,
          line_kind: 'packing',
          customer_name: 'TROPHY DEPOT',
        },
      ],
    });

    const { lines, breakdown } = allocateLandedCost(doc, { vendorId: 'GOK', vendorName: 'Gokai' });

    // No freight/duty/DDP anywhere on this doc → pallet $ is ignored, not pooled.
    expect(breakdown.method).toBe('none');
    expect(breakdown.import_pool).toBe(0);
    expect(lines).toHaveLength(1); // same spec → same sku_id → merged regardless of pool

    const merged = lines[0]!;
    expect(merged.sku_id).toBe('GHOGOKACRCLR18mm4x8');
    expect(merged.quantity).toBe(112); // 72 + 40
    expect(merged.land_cost_per_sheet).toBe(0);
    // merged raw_unit_price = (72*118.53 + 40*120.69)/112
    expect(merged.raw_unit_price).toBeCloseTo(119.301, 3);
    expect(merged.landed_unit_cost).toBeCloseTo(119.301, 3);
    expect(merged.customer_names).toEqual(['CN LEDGE', 'TROPHY DEPOT']);
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

  it('skips leading place names when picking the vendor brand word', () => {
    expect(firstBrandWord('Shanghai Gokai Industry Co., Ltd.')).toBe('Gokai');
    expect(firstBrandWord('Gokai Industrial')).toBe('Gokai');
    expect(
      buildDescription({
        vendorId: 'GOK',
        vendorName: 'Shanghai Gokai Industry Co., Ltd.',
        thicknessMm: 18,
        size: '4x8',
      }),
    ).toBe("Ghost Gokai Acrylic 18mm x 4' x 8' Clear.");
  });

  it('vendorIdFromName falls back to word-initials when the brand word is too short', () => {
    expect(vendorIdFromName('JM Kaplan Co')).toBe('JKC'); // "JM" too short -> initials fallback: J+K+C
    expect(vendorIdFromName('CN Ledge')).toBe('CL'); // "CN" too short -> initials fallback: C+L
  });

  it('customerIdFromName strips spaces and takes the first 3 characters, unlike vendorIdFromName', () => {
    expect(customerIdFromName('CN Ledge')).toBe('CNL');
    expect(customerIdFromName('JM Kaplan Co')).toBe('JMK');
    expect(customerIdFromName('')).toBe('UNK');
  });
});

function emptyInvoiceFixture(): InvoiceData {
  return {
    invoice_id: '',
    invoice_type: '',
    purchase_order: '',
    invoice_date: '',
    due_date: '',
    delivery_date: '',
    currency: '',
    currency_exchange_rate: null,
    net_amount: null,
    total_amount: null,
    total_tax_amount: null,
    freight_amount: null,
    amount_paid_since_last_invoice: null,
    supplier_name: '',
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
    line_items: [],
    raw_text: '',
  };
}

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

  it('maps due_date the same way as invoice_date', () => {
    const invoice: InvoiceData = {
      ...emptyInvoiceFixture(),
      invoice_date: '2026-01-08',
      due_date: '2026-01-08',
    };
    const doc = documentAiToExtract(invoice, 'purchase_invoice');
    expect(doc.invoice_date).toBe('2026-01-08');
    expect(doc.due_date).toBe('2026-01-08');
  });

  it('due_date is null when blank on the source document', () => {
    const doc = documentAiToExtract(emptyInvoiceFixture(), 'purchase_invoice');
    expect(doc.due_date).toBeNull();
  });

  it('never treats a cutting instruction as the sold sheet size', () => {
    // Confirmed against a real Gokai invoice: every line's actual width(mm)/
    // length(mm) columns were 1220x2440 regardless of what a "(cut to ...)"
    // note said — that note describes what the customer will do with the
    // sheet after receiving it, not what's being sold.
    expect(parseThicknessSize('(cut to 18" x 24")').size).toBeNull();
    expect(parseThicknessSize('(cut 4pcs near 24" x 48")').size).toBeNull();
    // Thickness is still picked up even when size is unreliable.
    expect(parseThicknessSize('9mm clear (cut to 18" x 24")').thickness).toBe(9);

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
          quantity: 26,
          unit_price: 61.42,
          amount: 1596.92,
          line_kind: 'acrylic',
          thickness_mm: 9,
          size: null,
        },
      ],
      notes: null,
    });
    // No trustworthy size anywhere in the document — must NOT fall back to
    // the "cut to" phrase found in the second line's own description.
    expect(doc.lines[0]!.size).toBeNull();
    expect(doc.lines[1]!.size).toBeNull();
  });
});
