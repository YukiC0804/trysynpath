/**
 * PDF text + page screenshots — mirrors ai_erp parse_pdf extract/render.
 * Uses pdf-parse (PDF.js) + @napi-rs/canvas (same role as PyMuPDF on Node/Vercel).
 *
 * Vercel/Node has no browser DOMMatrix; pdf.js screenshot needs it polyfilled
 * from @napi-rs/canvas before getScreenshot().
 */

async function ensureCanvasDomPolyfills(): Promise<void> {
  const g = globalThis as typeof globalThis & {
    DOMMatrix?: unknown;
    DOMPoint?: unknown;
    DOMRect?: unknown;
    ImageData?: unknown;
    Path2D?: unknown;
  };
  if (typeof g.DOMMatrix === 'function') return;
  const canvas = (await import('@napi-rs/canvas')) as unknown as {
    DOMMatrix?: unknown;
    DOMPoint?: unknown;
    DOMRect?: unknown;
    ImageData?: unknown;
    Path2D?: unknown;
  };
  if (canvas.DOMMatrix) g.DOMMatrix = canvas.DOMMatrix;
  if (canvas.DOMPoint) g.DOMPoint = canvas.DOMPoint;
  if (canvas.DOMRect) g.DOMRect = canvas.DOMRect;
  if (canvas.ImageData && !g.ImageData) g.ImageData = canvas.ImageData;
  if (canvas.Path2D && !g.Path2D) g.Path2D = canvas.Path2D;
  if (typeof g.DOMMatrix !== 'function') {
    throw new Error(
      'DOMMatrix polyfill unavailable — install @napi-rs/canvas for PDF vision screenshots',
    );
  }
}

export async function extractPdfText(content: Buffer): Promise<string> {
  if (!content?.length) return '';
  try {
    const mod = (await import('pdf-parse')) as unknown as {
      PDFParse: new (options: {
        data: Uint8Array;
        verbosity?: number;
      }) => {
        getText: () => Promise<{ text?: string }>;
        destroy?: () => Promise<void>;
      };
      VerbosityLevel?: { ERRORS?: number };
    };
    const data = Uint8Array.from(content);
    const parser = new mod.PDFParse({
      data,
      verbosity: mod.VerbosityLevel?.ERRORS ?? 0,
    });
    try {
      const result = await parser.getText();
      return String(result?.text ?? '')
        .replace(/\u0000/g, ' ')
        .trim();
    } finally {
      await parser.destroy?.().catch(() => undefined);
    }
  } catch (error) {
    console.warn(
      '[pdfText] extract failed',
      error instanceof Error ? error.message : error,
    );
    return '';
  }
}

/** ai_erp render_pdf_pages_b64 — PNG pages at 2x zoom, max 6 pages. */
export async function renderPdfPagesB64(
  content: Buffer,
  opts: { maxPages?: number; scale?: number } = {},
): Promise<Array<{ mime: string; base64: string }>> {
  if (!content?.length) return [];
  const maxPages = opts.maxPages ?? 6;
  const scale = opts.scale ?? 2;

  await ensureCanvasDomPolyfills();

  const mod = (await import('pdf-parse')) as unknown as {
    PDFParse: new (options: { data: Uint8Array; verbosity?: number }) => {
      getScreenshot: (params?: {
        scale?: number;
        first?: number;
        imageDataUrl?: boolean;
        imageBuffer?: boolean;
      }) => Promise<{
        pages: Array<{ dataUrl?: string; data?: Uint8Array; pageNumber: number }>;
      }>;
      destroy?: () => Promise<void>;
    };
    VerbosityLevel?: { ERRORS?: number };
  };
  const parser = new mod.PDFParse({
    data: Uint8Array.from(content),
    verbosity: mod.VerbosityLevel?.ERRORS ?? 0,
  });
  try {
    const shot = await parser.getScreenshot({
      scale,
      first: maxPages,
      imageDataUrl: true,
      imageBuffer: false,
    });
    const out: Array<{ mime: string; base64: string }> = [];
    for (const page of shot.pages || []) {
      const url = page.dataUrl || '';
      const m = /^data:(image\/[a-zA-Z0-9+.-]+);base64,(.+)$/.exec(url);
      if (!m) continue;
      out.push({ mime: m[1]!, base64: m[2]! });
    }
    return out;
  } catch (error) {
    const msg = error instanceof Error ? error.message : String(error);
    throw new Error(`PDF page screenshot failed: ${msg}`);
  } finally {
    await parser.destroy?.().catch(() => undefined);
  }
}
