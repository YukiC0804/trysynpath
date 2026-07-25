/**
 * Exact port of ai_erp parse_pdf.parse_pdf routing.
 *
 * Default auto:
 *   rich PDF text (≥120 chars + ≥2 money keywords) → text+LLM (gpt-4o-mini)
 *   else → vision: render PNG pages (2x, ≤6) → vision LLM (gpt-4o)
 *
 * Document AI / Parseur kept as optional backends only — not used by default.
 */
import type { DocumentExtract } from '../../../shared/ghost';
import { extractPdfText, renderPdfPagesB64 } from '../workflow/pdfText';
import { llmEnrichConfigured } from './enrichAcrylic';
import { parseWithDocumentAi } from './mapToExtract';
import {
  parseDocumentImages,
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

/** Exact ai_erp _text_is_rich_enough */
export function textIsRichEnough(text: string): boolean {
  if (text.length < 120) return false;
  const moneyish = (text.match(/\$|USD|Total|Amount|Invoice|Unit Price/gi) || []).length;
  return moneyish >= 2;
}

/** Exact ai_erp _pick_auto_backend */
export function pickAutoBackend(text: string): 'text' | 'vision' {
  return textIsRichEnough(text) ? 'text' : 'vision';
}

/**
 * Main entry — mirrors ai_erp parse_pdf.
 */
export async function parsePdf(
  content: Buffer,
  opts: { hintRole?: string | null; backend?: ParseBackend | null } = {},
): Promise<DocumentExtract> {
  let backend = opts.backend || resolveParseBackend();
  const text = await extractPdfText(content);

  if (backend === 'auto') {
    if (!llmEnrichConfigured()) {
      throw new Error(
        'GHOST_PO_PARSE_BACKEND=auto requires OPENAI_API_KEY (ai_erp text/vision LLM path). ' +
          'Or set GHOST_PO_PARSE_BACKEND=documentai.',
      );
    }
    backend = pickAutoBackend(text);
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

  // vision / two_pass — render pages like PyMuPDF (ai_erp)
  const images = await renderPdfPagesB64(content, { maxPages: 6, scale: 2 });
  if (!images.length) {
    if (text.trim()) {
      const doc = await parseDocumentText(text, {
        hintRole: opts.hintRole,
        note: '[parsed via text+LLM; screenshot render empty]',
      });
      return { ...doc, notes: `${doc.notes || ''} [backend=text-fallback]`.trim() };
    }
    throw new Error('could not render or read PDF pages for vision parse');
  }

  if (backend === 'two_pass') {
    try {
      const doc = await parseDocumentTwoPass(images, {
        hintRole: opts.hintRole,
        textHint: text,
      });
      return { ...doc, notes: `${doc.notes || ''} [backend=two_pass]`.trim() };
    } catch {
      // ai_erp: fall through to single vision
    }
  }

  const doc = await parseDocumentImages(images, {
    hintRole: opts.hintRole,
    textHint: text,
    note: `[parsed via vision/${backend}]`,
  });
  return { ...doc, notes: `${doc.notes || ''} [backend=vision]`.trim() };
}
