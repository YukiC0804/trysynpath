import {
  FixtureDocumentExtractionAdapter,
  type DocumentExtractionAdapter,
} from './extraction';
import { GmailPdfDocumentExtractionAdapter } from './pdfExtractAdapter';

export function resolveDocumentExtractor(
  sourceType: 'gmail' | 'fixture',
): DocumentExtractionAdapter {
  return sourceType === 'gmail'
    ? new GmailPdfDocumentExtractionAdapter()
    : new FixtureDocumentExtractionAdapter();
}
