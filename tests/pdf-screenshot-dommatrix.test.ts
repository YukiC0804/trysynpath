import { describe, expect, it, beforeAll } from 'vitest';
import { writeFileSync, readFileSync } from 'fs';
import { getPdfPageCount, renderPdfPagesB64 } from '../api/_lib/workflow/pdfText';

const SAMPLE_PDF_PATH = '/tmp/pdf-screenshot-dommatrix-sample.pdf';

beforeAll(() => {
  // Minimal single-page PDF with a text stream (self-contained fixture).
  writeFileSync(
    SAMPLE_PDF_PATH,
    Buffer.from(
      '%PDF-1.1\n' +
        '1 0 obj<< /Type /Catalog /Pages 2 0 R >>endobj\n' +
        '2 0 obj<< /Type /Pages /Kids [3 0 R] /Count 1 >>endobj\n' +
        '3 0 obj<< /Type /Page /Parent 2 0 R /MediaBox [0 0 200 200] /Contents 4 0 R /Resources<< /Font<< /F1 5 0 R >> >> >>endobj\n' +
        '4 0 obj<< /Length 44 >>stream\n' +
        'BT /F1 24 Tf 50 100 Td (Hello) Tj ET\n' +
        'endstream\n' +
        'endobj\n' +
        '5 0 obj<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>endobj\n' +
        'xref\n' +
        '0 6\n' +
        '0000000000 65535 f \n' +
        '0000000009 00000 n \n' +
        '0000000058 00000 n \n' +
        '0000000115 00000 n \n' +
        '0000000266 00000 n \n' +
        '0000000361 00000 n \n' +
        'trailer<< /Size 6 /Root 1 0 R >>\n' +
        'startxref\n' +
        '440\n' +
        '%%EOF\n',
      'utf8',
    ),
  );
});

describe('PDF screenshot DOMMatrix polyfill', () => {
  it('renders PNG pages even when global DOMMatrix was missing', async () => {
    const g = globalThis as typeof globalThis & { DOMMatrix?: unknown };
    const prev = g.DOMMatrix;
    // Simulate Vercel Node (no browser DOMMatrix)
    // eslint-disable-next-line @typescript-eslint/no-dynamic-delete
    delete (g as { DOMMatrix?: unknown }).DOMMatrix;

    const pdf = readFileSync(SAMPLE_PDF_PATH);
    const pages = await renderPdfPagesB64(pdf, { maxPages: 1, dpi: 150 });
    expect(pages.length).toBeGreaterThan(0);
    expect(pages[0]!.mime).toMatch(/^image\//);
    expect(pages[0]!.base64.length).toBeGreaterThan(20);

    if (prev) g.DOMMatrix = prev;
  });

  it('reports the correct page count for the auto text/vision heuristic', async () => {
    const pdf = readFileSync(SAMPLE_PDF_PATH);
    const total = await getPdfPageCount(pdf);
    expect(total).toBe(1);
  });
});
