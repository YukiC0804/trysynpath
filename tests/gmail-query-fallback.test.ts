import { describe, expect, it } from 'vitest';
import { DEFAULT_GMAIL_SEARCH } from '../api/_lib/gmail/types';
import { demoInvoiceDates } from '../api/_lib/workflow/fixtures';
import { buildGhoacrugolBundleFromTexts } from '../api/_lib/workflow/ghoacrugolBundle';
import { GMAIL_QUERY } from '../src/components/sage/cfo/helpers';

describe('Gmail PO pack query and PDF fallback', () => {
  it('targets the labeled PO#GHOACRUGOL051926 email', () => {
    expect(GMAIL_QUERY).toContain('label:synpath-sage-demo');
    expect(GMAIL_QUERY).toContain('subject:"PO#GHOACRUGOL051926"');
    expect(DEFAULT_GMAIL_SEARCH).toContain('label:synpath-sage-demo');
    expect(DEFAULT_GMAIL_SEARCH).toContain('subject:"PO#GHOACRUGOL051926"');
  });

  it('falls back to known pack mapping when PDF text is empty but identity matches', () => {
    const bundle = buildGhoacrugolBundleFromTexts(
      [
        {
          id: 'g1',
          emailMessageId: 'm1',
          fileName: 'UPDATE Ghost PO#GHOACRUGOL051926 (UGolden Proforma Invoice UG26A0519).pdf',
          mimeType: 'application/pdf',
          fileSize: 1,
          sha256: 'a',
          documentType: 'vendor_invoice',
          extractionStatus: 'Downloaded',
          sourceType: 'gmail',
        },
        {
          id: 'g2',
          emailMessageId: 'm1',
          fileName: 'GHOST ACRYLIC LLC - SPANDEX Invoice # GA18 - 5_18_2026.pdf',
          mimeType: 'application/pdf',
          fileSize: 1,
          sha256: 'b',
          documentType: 'customer_invoice',
          extractionStatus: 'Downloaded',
          sourceType: 'gmail',
        },
      ],
      ['', ''],
      demoInvoiceDates(),
      true,
      {
        subject: 'PO#GHOACRUGOL051926',
        fileNames: [
          'UPDATE Ghost PO#GHOACRUGOL051926 (UGolden Proforma Invoice UG26A0519).pdf',
          'GHOST ACRYLIC LLC - SPANDEX Invoice # GA18 - 5_18_2026.pdf',
        ],
      },
    );
    expect(bundle.shipment.lines).toHaveLength(6);
    expect(bundle.shipment.vendorInvoiceTotal).toBe(46845.34);
    expect(bundle.customerInvoice.total).toBe(32296);
    expect(bundle.extractionWarnings[0]).toMatch(/PDF text was incomplete/i);
  });
});
