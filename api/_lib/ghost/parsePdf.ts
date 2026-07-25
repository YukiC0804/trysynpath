/**
 * Port of ai_erp parse_pdf.parse_pdf backends.
 *
 * Default ``auto`` (same as ai_erp):
 * 1. Rich / usable PDF text layer → text+LLM  (best qty/unit price)
 * 2. Else try Document AI OCR text → LLM
 * 3. Else OpenAI PDF vision (gpt-4o) — replaces local PyMuPDF vision on Vercel
 * 4. Last resort: Document AI line-item tables (often wrong on multi-column)
 */
import type { DocumentExtract } from '../../../shared/ghost';
import { extractPdfText } from '../workflow/pdfText';
import { llmEnrichConfigured } from './enrichAcrylic';
import { parseWithDocumentAi } from './mapToExtract';
import { parseInvoiceBytes } from './documentAi';
import { parseDocumentPdfVision, parseDocumentText } from './parseDocumentLlm';

export type ParseBackend =
  | 'auto'
  | 'text'
  | 'vision'
  | 'documentai'
  | 'documentai_ocr';

export type ParseBackendUsed =
  | 'text+llm'
  | 'documentai_ocr+llm'
  | 'openai_pdf_vision'
  | 'documentai_lines'
  | 'none';

export function resolveParseBackend(): ParseBackend {
  const raw = (process.env.GHOST_PO_PARSE_BACKEND || 'auto').trim().toLowerCase();
  if (
    raw === 'text' ||
    raw === 'vision' ||
    raw === 'documentai' ||
    raw === 'documentai_ocr' ||
    raw === 'auto'
  ) {
    return raw;
  }
  return 'auto';
}

/** Prefer text+LLM whenever the PDF has a usable text layer (ai_erp auto). */
export function textIsRichEnough(text: string): boolean {
  if (text.length < 80) return false;
  const moneyish = (text.match(/\$|USD|Total|Amount|Invoice|Unit\s*Price|Qty|Quantity|pcs/gi) || [])
    .length;
  if (moneyish >= 2) return true;
  // Multi-column acrylic invoices often lack "$" in the text layer but still have numbers.
  return text.length >= 400 && /\d/.test(text);
}

export function pickAutoBackend(text: string): 'text' | 'documentai_ocr' {
  return textIsRichEnough(text) ? 'text' : 'documentai_ocr';
}

async function parseViaDocumentAiOcrThenLlm(
  content: Buffer,
  hintRole?: string | null,
): Promise<DocumentExtract> {
  const invoice = await parseInvoiceBytes(content);
  const ocr = (invoice.raw_text || '').trim();
  if (!ocr) {
    throw new Error('Document AI returned empty OCR text');
  }
  return parseDocumentText(ocr, {
    hintRole,
    note: '[parsed via Document AI OCR text + LLM]',
  });
}

function withBackendNote(doc: DocumentExtract, used: ParseBackendUsed): DocumentExtract {
  return {
    ...doc,
    notes: `${doc.notes || ''} [backend=${used}]`.trim(),
  };
}

/**
 * Main entry — mirrors ai_erp parse_pdf for purchase/freight/duty.
 * Requires OPENAI_API_KEY for text / vision / documentai_ocr / auto (preferred path).
 */
export async function parsePdf(
  content: Buffer,
  opts: { hintRole?: string | null; backend?: ParseBackend | null } = {},
): Promise<DocumentExtract> {
  let backend = opts.backend || resolveParseBackend();
  const text = await extractPdfText(content);
  const errors: string[] = [];

  if (backend === 'auto') {
    if (!llmEnrichConfigured()) {
      const doc = await parseWithDocumentAi(content, opts.hintRole);
      return withBackendNote(doc, 'documentai_lines');
    }
    backend = pickAutoBackend(text);
  }

  if (backend === 'documentai') {
    const doc = await parseWithDocumentAi(content, opts.hintRole);
    return withBackendNote(doc, 'documentai_lines');
  }

  if (backend === 'text') {
    if (!text.trim()) {
      throw new Error(
        'text backend but no text layer in PDF — set GHOST_PO_PARSE_BACKEND=auto or vision',
      );
    }
    if (!llmEnrichConfigured()) throw new Error('text backend requires OPENAI_API_KEY');
    const doc = await parseDocumentText(text, {
      hintRole: opts.hintRole,
      note: '[parsed via PDF text + LLM]',
    });
    return withBackendNote(doc, 'text+llm');
  }

  if (backend === 'vision') {
    if (!llmEnrichConfigured()) throw new Error('vision backend requires OPENAI_API_KEY');
    const doc = await parseDocumentPdfVision(content, {
      hintRole: opts.hintRole,
      textHint: text,
      note: '[parsed via OpenAI PDF vision]',
    });
    return withBackendNote(doc, 'openai_pdf_vision');
  }

  // documentai_ocr (also auto fallback path)
  if (llmEnrichConfigured()) {
    try {
      const doc = await parseViaDocumentAiOcrThenLlm(content, opts.hintRole);
      return withBackendNote(doc, 'documentai_ocr+llm');
    } catch (error) {
      errors.push(error instanceof Error ? error.message : String(error));
      try {
        const doc = await parseDocumentPdfVision(content, {
          hintRole: opts.hintRole,
          textHint: text,
          note: `[parsed via OpenAI PDF vision after DocAI OCR failed: ${errors[0]}]`,
        });
        return withBackendNote(doc, 'openai_pdf_vision');
      } catch (visionError) {
        errors.push(visionError instanceof Error ? visionError.message : String(visionError));
      }
      // If PDF text exists at all, still try text+LLM before DocAI line items.
      if (text.trim().length >= 40) {
        try {
          const doc = await parseDocumentText(text, {
            hintRole: opts.hintRole,
            note: `[parsed via thin PDF text + LLM after OCR/vision failed: ${errors.join(' | ')}]`,
          });
          return withBackendNote(doc, 'text+llm');
        } catch (textError) {
          errors.push(textError instanceof Error ? textError.message : String(textError));
        }
      }
    }
  }

  try {
    const doc = await parseWithDocumentAi(content, opts.hintRole);
    return withBackendNote(
      {
        ...doc,
        notes: `${doc.notes || ''} [fallback documentai lines; prior errors: ${errors.join(' | ') || 'none'}]`.trim(),
      },
      'documentai_lines',
    );
  } catch (error) {
    const msg = error instanceof Error ? error.message : String(error);
    throw new Error(
      `All invoice parse backends failed. OpenAI=${llmEnrichConfigured() ? 'yes' : 'no'}. ` +
        `Errors: ${[...errors, msg].join(' | ')}`,
    );
  }
}
