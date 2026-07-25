import { describe, expect, it } from 'vitest';
import { readFileSync } from 'fs';
import { renderPdfPagesB64 } from '../api/_lib/workflow/pdfText';

describe('PDF screenshot DOMMatrix polyfill', () => {
  it('renders PNG pages even when global DOMMatrix was missing', async () => {
    const g = globalThis as typeof globalThis & { DOMMatrix?: unknown };
    const prev = g.DOMMatrix;
    // Simulate Vercel Node (no browser DOMMatrix)
    // eslint-disable-next-line @typescript-eslint/no-dynamic-delete
    delete (g as { DOMMatrix?: unknown }).DOMMatrix;

    const pdf = readFileSync('/tmp/t.pdf');
    const pages = await renderPdfPagesB64(pdf, { maxPages: 1, scale: 2 });
    expect(pages.length).toBeGreaterThan(0);
    expect(pages[0]!.mime).toMatch(/^image\//);
    expect(pages[0]!.base64.length).toBeGreaterThan(20);

    if (prev) g.DOMMatrix = prev;
  });
});
