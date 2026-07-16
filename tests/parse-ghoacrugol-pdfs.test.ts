import { readFileSync } from 'fs';
import { describe, expect, it } from 'vitest';
import { extractPdfText } from '../api/_lib/workflow/pdfText';
import {
  parseSpandexInvoice,
  parseUgoldenProforma,
} from '../api/_lib/workflow/parseGhoacrugolPdfs';

const UGOLDEN_PDF =
  '/home/ubuntu/.cursor/projects/workspace/uploads/UPDATE_Ghost_PO_GHOACRUGOL051926__UGolden_Proforma_Invoice_UG26A0519__9ecd.pdf';
const SPANDEX_PDF =
  '/home/ubuntu/.cursor/projects/workspace/uploads/GHOST_ACRYLIC_LLC_-_SPANDEX_Invoice___GA18_-_5_18_2026_b741.pdf';

describe('Ghoacrugol PDF field parsers', () => {
  it('parses UGolden proforma lines, pallet, DDP and total', async () => {
    const text = await extractPdfText(readFileSync(UGOLDEN_PDF));
    const parsed = parseUgoldenProforma(text);
    expect(parsed).not.toBeNull();
    expect(parsed?.poNumber).toBe('GHOACRUGOL051926');
    expect(parsed?.vendorInvoiceNumber).toBe('UG26A0519');
    expect(parsed?.lines).toHaveLength(6);
    expect(parsed?.totalPieces).toBe(718);
    expect(parsed?.palletCost).toBe(320);
    expect(parsed?.ddpCost).toBe(11600);
    expect(parsed?.totalDdpAmount).toBe(46845.34);
    expect(parsed?.lines.map((line) => line.sku)).toEqual([
      'ACR-WHT-3MM-48X96',
      'ACR-WHT-18MM-48X96',
      'ACR-WHT-25MM-48X96',
      'ACR-WHT-4P8MM-60X120',
      'ACR-CLR-4MM-48X96',
      'ACR-PC-CLR-9P5MM-48X96',
    ]);
  });

  it('parses Spandex sales invoice lines and total', async () => {
    const text = await extractPdfText(readFileSync(SPANDEX_PDF));
    const parsed = parseSpandexInvoice(text);
    expect(parsed).not.toBeNull();
    expect(parsed?.invoiceNumber).toBe('GA18');
    expect(parsed?.customer).toBe('Spandex');
    expect(parsed?.lines).toHaveLength(5);
    expect(parsed?.lines.reduce((sum, line) => sum + line.quantity, 0)).toBe(282);
    expect(parsed?.total).toBe(32296);
  });
});
