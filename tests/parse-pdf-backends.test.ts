import { describe, expect, it, vi, afterEach } from 'vitest';
import {
  documentExtractFromLlmJson,
  parseDocumentText,
} from '../api/_lib/ghost/parseDocumentLlm';
import { pickAutoBackend, textIsRichEnough } from '../api/_lib/ghost/parsePdf';

const JM_OCR_TEXT = `
JM TROPHIES
Invoice INV-8842
Acrylic Sheet GK-CAS05T 100% virgin (JM TROPHIES)
Two sides kraft paper (cut to 18" x 24") clear,GK-000
Quantity: 40  Unit Price: 12.50  Amount: 500.00

Acrylic Sheet GK-CAS05C 100% virgin
Two sides kraft paper (cut to 18" x 24") black,GK-0502
Quantity: 20  Unit Price: 14.00  Amount: 280.00

Invoice Total: 780.00 USD
`.trim();

describe('parse backend selection (ai_erp _text_is_rich_enough)', () => {
  // ai_erp: too_thin = len(text)/max_len < 0.3 AND len(text) < 600; rich otherwise.
  // max_len defaults to pageCount * 2000 (typical text-native invoice page).

  it('treats a full text-native page (>=600 chars) as rich regardless of ratio', () => {
    const fullPageText = JM_OCR_TEXT.repeat(2); // ~700 chars, one-page budget (2000)
    expect(fullPageText.length).toBeGreaterThanOrEqual(600);
    expect(textIsRichEnough(fullPageText, 2000)).toBe(true);
    expect(pickAutoBackend(fullPageText, 2000)).toBe('text');
  });

  it('routes a near-empty scanned page to vision', () => {
    expect(textIsRichEnough('page 1', 2000)).toBe(false);
    expect(pickAutoBackend('page 1', 2000)).toBe('vision');
  });

  it('is thin when short both absolutely and relative to a multi-page budget', () => {
    // 3-page scan with only a stray watermark line of real text extracted.
    const thinScan = JM_OCR_TEXT.slice(0, 80);
    const maxLen = 3 * 2000;
    expect(thinScan.length).toBeLessThan(600);
    expect(thinScan.length / maxLen).toBeLessThan(0.3);
    expect(textIsRichEnough(thinScan, maxLen)).toBe(false);
    expect(pickAutoBackend(thinScan, maxLen)).toBe('vision');
  });

  it('rescues short text when the ratio clears 0.3 (small expected budget)', () => {
    // e.g. a tiny single-line freight/duty bill: short in absolute terms,
    // but large relative to what such a document is expected to contain.
    const shortButDenseText = JM_OCR_TEXT.slice(0, 500);
    const smallBudget = 1000; // ratio = 500/1000 = 0.5 >= 0.3
    expect(shortButDenseText.length).toBeLessThan(600);
    expect(shortButDenseText.length / smallBudget).toBeGreaterThanOrEqual(0.3);
    expect(textIsRichEnough(shortButDenseText, smallBudget)).toBe(true);
    expect(pickAutoBackend(shortButDenseText, smallBudget)).toBe('text');
  });

  it('falls back to a single-page (2000 char) budget when maxLen is omitted', () => {
    expect(textIsRichEnough('short', undefined)).toBe(false);
    expect(textIsRichEnough('x'.repeat(650), undefined)).toBe(true);
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
        invoice_total: 780,
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
        ],
      },
      { note: '[test]' },
    );
    expect(doc.vendor?.id).toBe('JM');
    expect(doc.lines[0]!.quantity).toBe(40);
    expect(doc.lines[0]!.unit_price).toBe(12.5);
    expect(doc.lines[0]!.amount).toBe(500);
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
          unit_price: 1.2,
          amount: 400,
          line_kind: 'acrylic',
        },
      ],
    });
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

  it('retries a transient 5xx then succeeds', async () => {
    process.env.OPENAI_API_KEY = 'test-key';
    const okBody = {
      ok: true,
      json: async () => ({
        choices: [
          {
            message: {
              content: JSON.stringify({
                document_role: 'purchase_invoice',
                includes_ddp: false,
                lines: [],
              }),
            },
          },
        ],
      }),
    };
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce({ ok: false, status: 503, text: async () => 'server hiccup' })
      .mockResolvedValueOnce(okBody);
    vi.stubGlobal('fetch', fetchMock);

    const doc = await parseDocumentText(JM_OCR_TEXT, { hintRole: 'purchase_invoice' });
    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(doc.document_role).toBe('purchase_invoice');
  });

  it('does not retry a 4xx (bad request/auth) failure', async () => {
    process.env.OPENAI_API_KEY = 'test-key';
    const fetchMock = vi.fn().mockResolvedValue({
      ok: false,
      status: 400,
      text: async () => 'bad request',
    });
    vi.stubGlobal('fetch', fetchMock);

    await expect(parseDocumentText(JM_OCR_TEXT, { hintRole: 'purchase_invoice' })).rejects.toThrow(
      /HTTP 400/,
    );
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });
});
