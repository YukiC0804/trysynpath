/**
 * Port of ai_erp po_write_entry/parse_pdf.py routing.
 *
 * Backends (GHOST_PO_PARSE_BACKEND): auto (default) | text | vision | two_pass | documentai | parseur.
 *
 * auto:
 *   1. extract_pdf_text (PyMuPDF here: pdf-parse/pdf.js)
 *   2. _text_is_rich_enough(text, max_len): thin text (short AND small vs. an
 *      expected-length budget scaled by page count) → vision; else → text
 *   3. text → gpt-4o-mini over the PDF text layer
 *      vision → render_pdf_pages_b64 (150 DPI PNG, ≤6 pages) → gpt-4o
 *
 * Document AI / Parseur are kept as optional backends only, never the
 * default — ai_erp benchmarked auto (text/vision LLM) as faster, cheaper,
 * and more accurate on multi-column Gokai-style acrylic invoices.
 */
import type { DocumentExtract } from '../../../shared/ghost';
import {
  ensureCanvasDomPolyfills,
  extractPdfText,
  getPdfPageCount,
  renderPdfPagesB64,
} from '../workflow/pdfText';
import { llmEnrichConfigured } from './enrichAcrylic';
import { parseWithDocumentAi } from './mapToExtract';
import {
  parseDocumentImages,
  parseDocumentPdfFile,
  parseDocumentText,
  parseDocumentTwoPass,
} from './parseDocumentLlm';

export type ParseBackend =
  | 'auto'
  | 'text'
  | 'vision'
  | 'two_pass'
  | 'documentai';

const BACKENDS = new Set<ParseBackend>([
  'auto',
  'text',
  'vision',
  'two_pass',
  'documentai',
]);

export function resolveParseBackend(): ParseBackend {
  const raw = (process.env.GHOST_PO_PARSE_BACKEND || 'auto').trim().toLowerCase();
  if (BACKENDS.has(raw as ParseBackend)) return raw as ParseBackend;
  return 'auto';
}

/** Expected rich-text budget per page — used as the max_len denominator. */
const EXPECTED_CHARS_PER_PAGE = 2000;
/** Absolute floor below which text is always considered too thin. */
const THIN_TEXT_ABSOLUTE_CEILING = 600;
/** Below this fraction of the expected budget, text is considered too thin. */
const THIN_TEXT_RATIO_CEILING = 0.3;

/**
 * ai_erp _text_is_rich_enough(text, max_len):
 *   too thin  ⇔  len(text)/max_len < 0.3  AND  len(text) < 600
 *   rich enough otherwise.
 * max_len defaults to pageCount * 2000 chars (typical text-native invoice page).
 */
export function textIsRichEnough(text: string, maxLen?: number): boolean {
  const len = text.length;
  const budget = maxLen && maxLen > 0 ? maxLen : EXPECTED_CHARS_PER_PAGE;
  const ratio = len / budget;
  const tooThin = ratio < THIN_TEXT_RATIO_CEILING && len < THIN_TEXT_ABSOLUTE_CEILING;
  return !tooThin;
}

/** ai_erp _pick_auto_backend */
export function pickAutoBackend(text: string, maxLen?: number): 'text' | 'vision' {
  return textIsRichEnough(text, maxLen) ? 'text' : 'vision';
}

async function visionFromPngOrFallback(
  content: Buffer,
  text: string,
  opts: { hintRole?: string | null; backend: 'vision' | 'two_pass' },
): Promise<DocumentExtract> {
  let renderError = '';
  try {
    // ai_erp render_pdf_pages_b64: 150 DPI, ≤6 pages.
    const images = await renderPdfPagesB64(content, { maxPages: 6, dpi: 150 });
    if (images.length) {
      if (opts.backend === 'two_pass') {
        try {
          const doc = await parseDocumentTwoPass(images, {
            hintRole: opts.hintRole,
            textHint: text,
          });
          return { ...doc, notes: `${doc.notes || ''} [backend=two_pass]`.trim() };
        } catch {
          // fall through to single vision — same as ai_erp
        }
      }
      const doc = await parseDocumentImages(images, {
        hintRole: opts.hintRole,
        textHint: text,
        note: `[parsed via vision/${opts.backend}]`,
      });
      return { ...doc, notes: `${doc.notes || ''} [backend=vision]`.trim() };
    }
    renderError = 'screenshot returned zero pages';
  } catch (error) {
    renderError = error instanceof Error ? error.message : String(error);
  }

  // Fallbacks when Vercel lacks DOMMatrix / canvas screenshot support
  if (text.trim().length >= 40) {
    try {
      const doc = await parseDocumentText(text, {
        hintRole: opts.hintRole,
        note: `[parsed via text+LLM after vision render failed: ${renderError}]`,
      });
      return { ...doc, notes: `${doc.notes || ''} [backend=text-fallback]`.trim() };
    } catch (textError) {
      renderError += ` | text-fallback: ${textError instanceof Error ? textError.message : textError}`;
    }
  }

  try {
    const doc = await parseDocumentPdfFile(content, {
      hintRole: opts.hintRole,
      textHint: text,
      note: `[parsed via OpenAI PDF file_id after vision render failed: ${renderError}]`,
    });
    return { ...doc, notes: `${doc.notes || ''} [backend=openai_pdf_file]`.trim() };
  } catch (openaiError) {
    const openaiMsg = openaiError instanceof Error ? openaiError.message : String(openaiError);
    throw new Error(
      `Vision parse failed. screenshot=${renderError || 'unknown'}; openai=${openaiMsg}`,
    );
  }
}

/**
 * Main entry — mirrors ai_erp parse_pdf.
 */
export async function parsePdf(
  content: Buffer,
  opts: { hintRole?: string | null; backend?: ParseBackend | null } = {},
): Promise<DocumentExtract> {
  // Polyfill before any pdf-parse import (extract or screenshot).
  await ensureCanvasDomPolyfills().catch(() => undefined);

  let backend = opts.backend || resolveParseBackend();
  const text = await extractPdfText(content);

  if (backend === 'auto') {
    if (!llmEnrichConfigured()) {
      throw new Error(
        'GHOST_PO_PARSE_BACKEND=auto requires OPENAI_API_KEY (ai_erp text/vision LLM path). ' +
          'Or set GHOST_PO_PARSE_BACKEND=documentai.',
      );
    }
    const pageCount = await getPdfPageCount(content).catch(() => 0);
    const maxLen = pageCount > 0 ? pageCount * EXPECTED_CHARS_PER_PAGE : undefined;
    backend = pickAutoBackend(text, maxLen);
  }

  if (backend === 'documentai') {
    const doc = await parseWithDocumentAi(content, opts.hintRole);
    return {
      ...doc,
      notes: `${doc.notes || ''} [backend=documentai]`.trim(),
    };
  }

  if (!llmEnrichConfigured()) {
    throw new Error(`${backend} backend requires OPENAI_API_KEY`);
  }

  if (backend === 'text') {
    if (!text.trim()) {
      throw new Error(
        'text backend but no text layer in PDF — use GHOST_PO_PARSE_BACKEND=vision (or auto)',
      );
    }
    const doc = await parseDocumentText(text, {
      hintRole: opts.hintRole,
      note: '[parsed via text+LLM]',
    });
    return { ...doc, notes: `${doc.notes || ''} [backend=text]`.trim() };
  }

  return visionFromPngOrFallback(content, text, {
    hintRole: opts.hintRole,
    backend,
  });
}
