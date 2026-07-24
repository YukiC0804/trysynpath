import { describe, expect, it, vi, afterEach } from 'vitest';
import {
  documentExtractFromLlmJson,
  parseDocumentText,
} from '../api/_lib/ghost/parseDocumentLlm';
import { pickAutoBackend, textIsRichEnough } from '../api/_lib/ghost/parsePdf';

/** Fragment similar to Document AI line-item garbage on JM Trophies invoices. */
const JM_OCR_TEXT = `
JM TROPHIES
Invoice INV-8842
Acrylic Sheet GK-CAS05T 100% virgin (JM TROPHIES)
Two sides kraft paper (cut to 18" x 24") clear,GK-000
Quantity: 40  Unit Price: 12.50  Amount: 500.00

Acrylic Sheet GK-CAS05C 100% virgin
Two sides kraft paper (cut to 18" x 24") black,GK-0502
Quantity: 20  Unit Price: 14.00  Amount: 280.00

Acrylic Sheet GK-CAS09T clear,GK-000 (cut to 18" x 24")
Quantity: 15  Unit Price: 18.25  Amount: 273.75

Invoice Total: 1053.75 USD
`.trim();

describe('parse backend selection (ai_erp auto)', () => {
  it('treats money-rich PDF text as text backend', () => {
    expect(textIsRichEnough(JM_OCR_TEXT)).toBe(true);
    expect(pickAutoBackend(JM_OCR_TEXT)).toBe('text');
  });

  it('falls back to documentai_ocr for thin scans', () => {
    expect(pickAutoBackend('page 1')).toBe('documentai_ocr');
  });
});

describe('text+LLM extract (ai_erp parse_document_text)', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
    delete process.env.OPENAI_API_KEY;
  });

  it('maps LLM JSON into qty / unit_price / amount correctly', () => {
    const doc = documentExtractFromLlmJson(
      {
        document_role: 'purchase_invoice',
        vendor: { id: 'JM', name: 'JM Trophies' },
        invoice_number: 'INV-8842',
        invoice_date: '2026-05-19',
        currency: 'USD',
        invoice_total: 1053.75,
        includes_ddp: false,
        lines: [
          {
            raw_description: 'Acrylic Sheet GK-CAS05T clear cut to 18x24',
            is_acrylic: true,
            is_packing_or_misc: false,
            product_code: 'ACR',
            color_code: 'CLR',
            color_name: 'Clear',
            thickness_mm: 3,
            size: '18x24',
            quantity: 40,
            unit_price: 12.5,
            amount: 500,
            line_kind: 'acrylic',
          },
          {
            raw_description: 'Acrylic Sheet GK-CAS05C black',
            is_acrylic: true,
            is_packing_or_misc: false,
            product_code: 'ACR',
            color_code: 'BLK',
            color_name: 'Black',
            thickness_mm: 3,
            size: '18x24',
            quantity: 20,
            unit_price: 14,
            amount: 280,
            line_kind: 'acrylic',
          },
        ],
      },
      { note: '[test]' },
    );
    expect(doc.vendor?.id).toBe('JM');
    expect(doc.lines).toHaveLength(2);
    expect(doc.lines[0]!.quantity).toBe(40);
    expect(doc.lines[0]!.unit_price).toBe(12.5);
    expect(doc.lines[0]!.amount).toBe(500);
    expect(doc.lines[0]!.thickness_mm).toBe(3);
    expect(doc.lines[0]!.size).toBe('18x24');
  });

  it('prefers amount/qty when LLM unit_price looks like density', () => {
    const doc = documentExtractFromLlmJson({
      document_role: 'purchase_invoice',
      includes_ddp: false,
      lines: [
        {
          raw_description: 'Acrylic 4mm 4x8',
          is_acrylic: true,
          is_packing_or_misc: false,
          thickness_mm: 4,
          size: '4x8',
          quantity: 10,
          unit_price: 1.2, // density mistake
          amount: 400,
          line_kind: 'acrylic',
        },
      ],
    });
    // mapLine already derives unit from amount/qty; sanitize also fixes density.
    expect(doc.lines[0]!.unit_price).toBe(40);
    expect(doc.lines[0]!.quantity).toBe(10);
  });

  it('calls OpenAI like ai_erp text backend', async () => {
    process.env.OPENAI_API_KEY = 'test-key';
    const fetchMock = vi.fn(async () => ({
      ok: true,
      json: async () => ({
        choices: [
          {
            message: {
              content: JSON.stringify({
                document_role: 'purchase_invoice',
                vendor: { id: 'JM', name: 'JM Trophies' },
                invoice_number: 'INV-8842',
                invoice_total: 500,
                includes_ddp: false,
                lines: [
                  {
                    raw_description: 'Acrylic Sheet clear GK-000 18x24',
                    is_acrylic: true,
                    is_packing_or_misc: false,
                    thickness_mm: 3,
                    size: '18x24',
                    quantity: 40,
                    unit_price: 12.5,
                    amount: 500,
                    line_kind: 'acrylic',
                  },
                ],
              }),
            },
          },
        ],
      }),
    }));
    vi.stubGlobal('fetch', fetchMock);

    const doc = await parseDocumentText(JM_OCR_TEXT, { hintRole: 'purchase_invoice' });
    expect(fetchMock).toHaveBeenCalled();
    expect(doc.lines[0]!.quantity).toBe(40);
    expect(doc.lines[0]!.unit_price).toBe(12.5);
    expect(doc.notes).toMatch(/text\+LLM/);
  });
});
