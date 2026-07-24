/**
 * Port of ai_erp parse_pdf.parse_pdf backends.
 *
 * Default ``auto`` (same as ai_erp): rich PDF text layer → text+LLM;
 * scanned / thin text → Document AI OCR text → text+LLM (better qty/price
 * than Document AI line-item tables on multi-column Ghost invoices).
 *
 * ``documentai`` keeps the old Invoice Processor line-item path (+ acrylic enrich).
 */
import type { DocumentExtract } from '../../../shared/ghost';
import { extractPdfText } from '../workflow/pdfText';
import { llmEnrichConfigured } from './enrichAcrylic';
import { parseWithDocumentAi } from './mapToExtract';
import { parseInvoiceBytes } from './documentAi';
import { parseDocumentText } from './parseDocumentLlm';

export type ParseBackend = 'auto' | 'text' | 'documentai' | 'documentai_ocr';

export function resolveParseBackend(): ParseBackend {
  const raw = (process.env.GHOST_PO_PARSE_BACKEND || 'auto').trim().toLowerCase();
  if (raw === 'text' || raw === 'documentai' || raw === 'documentai_ocr' || raw === 'auto') {
    return raw;
  }
  return 'auto';
}

export function textIsRichEnough(text: string): boolean {
  if (text.length < 120) return false;
  const moneyish = (text.match(/\$|USD|Total|Amount|Invoice|Unit Price/gi) || []).length;
  return moneyish >= 2;
}

export function pickAutoBackend(text: string): 'text' | 'documentai_ocr' {
  // ai_erp: rich text → text; else vision. We use Document AI OCR text + LLM
  // instead of local page rasterization (Vercel has no PyMuPDF).
  return textIsRichEnough(text) ? 'text' : 'documentai_ocr';
}

async function parseViaDocumentAiOcrThenLlm(
  content: Buffer,
  hintRole?: string | null,
): Promise<DocumentExtract> {
  const invoice = await parseInvoiceBytes(content);
  const ocr = (invoice.raw_text || '').trim();
  if (!ocr) {
    // Fall back to structured Document AI mapping if OCR text empty.
    return parseWithDocumentAi(content, hintRole);
  }
  return parseDocumentText(ocr, {
    hintRole,
    note: '[parsed via Document AI OCR text + LLM]',
  });
}

/**
 * Main entry — mirrors ai_erp parse_pdf for purchase/freight/duty.
 * Requires OPENAI_API_KEY for text / documentai_ocr / auto (preferred path).
 */
export async function parsePdf(
  content: Buffer,
  opts: { hintRole?: string | null; backend?: ParseBackend | null } = {},
): Promise<DocumentExtract> {
  let backend = opts.backend || resolveParseBackend();
  const text = await extractPdfText(content);

  if (backend === 'auto') {
    if (!llmEnrichConfigured()) {
      // Without OpenAI, only Document AI line items are available.
      return parseWithDocumentAi(content, opts.hintRole);
    }
    backend = pickAutoBackend(text);
  }

  if (backend === 'documentai') {
    return parseWithDocumentAi(content, opts.hintRole);
  }

  if (backend === 'text') {
    if (!text.trim()) {
      throw new Error(
        'text backend but no text layer in PDF — set GHOST_PO_PARSE_BACKEND=auto or documentai_ocr',
      );
    }
    if (!llmEnrichConfigured()) {
      throw new Error('text backend requires OPENAI_API_KEY');
    }
    return parseDocumentText(text, {
      hintRole: opts.hintRole,
      note: '[parsed via PDF text + LLM]',
    });
  }

  // documentai_ocr
  if (!llmEnrichConfigured()) {
    return parseWithDocumentAi(content, opts.hintRole);
  }
  try {
    return await parseViaDocumentAiOcrThenLlm(content, opts.hintRole);
  } catch (error) {
    // Last resort: Document AI structured lines + acrylic enrich.
    const doc = await parseWithDocumentAi(content, opts.hintRole);
    const msg = error instanceof Error ? error.message : String(error);
    return {
      ...doc,
      notes: `${doc.notes || ''} [documentai_ocr+LLM failed → documentai lines: ${msg}]`.trim(),
    };
  }
}
