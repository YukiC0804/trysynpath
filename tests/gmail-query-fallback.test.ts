import { describe, expect, it } from 'vitest';
import { DEFAULT_GMAIL_SEARCH } from '../api/_lib/gmail/types';
import { demoInvoiceDates } from '../api/_lib/workflow/fixtures';
import {
  buildGhoacrugolBundle,
  fallbackSpandexParse,
  fallbackUgoldenParse,
} from '../api/_lib/workflow/ghoacrugolBundle';
import { GmailPdfDocumentExtractionAdapter } from '../api/_lib/workflow/pdfExtractAdapter';
import { GMAIL_QUERY } from '../src/components/sage/cfo/helpers';

describe('Gmail PO pack hardcode demo', () => {
  it('targets the labeled PO#GHOACRUGOL051926 email', () => {
    expect(GMAIL_QUERY).toContain('label:synpath-sage-demo');
    expect(GMAIL_QUERY).toContain('subject:"PO#GHOACRUGOL051926"');
    expect(DEFAULT_GMAIL_SEARCH).toContain('label:synpath-sage-demo');
    expect(DEFAULT_GMAIL_SEARCH).toContain('subject:"PO#GHOACRUGOL051926"');
  });

  it('uses deterministic UGolden + Spandex pack totals for the CFO demo', () => {
    const vendor = fallbackUgoldenParse();
    const sales = fallbackSpandexParse();
    expect(vendor.totalPieces).toBe(718);
    expect(vendor.totalDdpAmount).toBe(46845.34);
    expect(vendor.lines[0].vendorUnitCost).toBe(24.16);
    expect(sales.lines.reduce((sum, line) => sum + line.quantity, 0)).toBe(282);
    expect(sales.total).toBe(32296);
    expect(sales.lines[0].salesUnitPrice).toBe(39.45);
    const bundle = buildGhoacrugolBundle([], demoInvoiceDates(), {
      vendor,
      sales,
      livePdfExtraction: true,
    });
    expect(bundle.shipment.lines).toHaveLength(6);
    expect(bundle.customerInvoice.lines).toHaveLength(5);
  });

  it('maps Gmail scan theater to the hardcoded pack without PDF text', async () => {
    const result = await new GmailPdfDocumentExtractionAdapter().extract({
      sourceType: 'gmail',
      collectedAt: new Date().toISOString(),
      emails: [
        {
          gmailMessageId: 'm1',
          gmailThreadId: 't1',
          from: 'ada@ugolden.com.cn',
          to: 'ops@ghostacrylic.com',
          subject: 'PO#GHOACRUGOL051926',
          receivedAt: new Date().toISOString(),
          snippet: 'UGolden proforma and Spandex invoice attached',
          labelIds: ['Label_synpath'],
          attachmentIds: ['a1', 'a2'],
          processingStatus: 'Downloaded',
        },
      ],
      documents: [
        {
          metadata: {
            id: 'g1',
            emailMessageId: 'm1',
            fileName:
              'UPDATE Ghost PO#GHOACRUGOL051926 (UGolden Proforma Invoice UG26A0519).pdf',
            mimeType: 'application/pdf',
            fileSize: 12,
            sha256: 'a'.repeat(64),
            documentType: 'vendor_invoice',
            extractionStatus: 'Downloaded',
            sourceType: 'gmail',
          },
          content: Buffer.from('%PDF-fake'),
        },
        {
          metadata: {
            id: 'g2',
            emailMessageId: 'm1',
            fileName: 'GHOST ACRYLIC LLC - SPANDEX Invoice # GA18 - 5_18_2026.pdf',
            mimeType: 'application/pdf',
            fileSize: 12,
            sha256: 'b'.repeat(64),
            documentType: 'customer_invoice',
            extractionStatus: 'Downloaded',
            sourceType: 'gmail',
          },
          content: Buffer.from('%PDF-fake'),
        },
      ],
    });
    expect(result.bundle.fixtureExtraction).toBe(false);
    expect(result.bundle.shipment.vendorInvoiceTotal).toBe(46845.34);
    expect(result.bundle.customerInvoice.total).toBe(32296);
    expect(result.bundle.extractionWarnings[0]).toMatch(/UGolden proforma UG26A0519/i);
  });
});
