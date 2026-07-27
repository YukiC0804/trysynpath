import { describe, expect, it, vi } from 'vitest';

vi.mock('../api/_lib/gmail/client', () => ({
  listGmailMessageIds: vi.fn(),
  getGmailMessage: vi.fn(),
  getGmailAttachment: vi.fn(),
}));

import { getGmailAttachment, getGmailMessage, listGmailMessageIds } from '../api/_lib/gmail/client';
import {
  classifyPdfRole,
  fetchLatestSynpathPricingPoPdfs,
  fetchLatestSynpathPricingSoPdf,
} from '../api/_lib/gmail/pricingEmailSource';

function pdfPart(fileName: string, text = 'pdf-bytes') {
  return {
    partId: fileName,
    mimeType: 'application/pdf',
    filename: fileName,
    body: { data: Buffer.from(text).toString('base64url'), size: text.length },
  };
}

function message(id: string, internalDate: string, subject: string, attachments: ReturnType<typeof pdfPart>[]) {
  return {
    id,
    threadId: `t-${id}`,
    internalDate,
    payload: {
      headers: [{ name: 'Subject', value: subject }],
      parts: attachments,
    },
  };
}

describe('classifyPdfRole', () => {
  it('classifies by filename keyword', () => {
    expect(classifyPdfRole('Freight Invoice.pdf')).toBe('freight');
    expect(classifyPdfRole('DHL Shipping charges.pdf')).toBe('freight');
    expect(classifyPdfRole('Customs Duty.pdf')).toBe('duty');
    expect(classifyPdfRole('Gokai PO 12345.pdf')).toBe('purchase');
  });
});

describe('fetchLatestSynpathPricingPoPdfs', () => {
  it('returns the single PDF as purchase when there is only one attachment', async () => {
    vi.mocked(listGmailMessageIds).mockResolvedValue({
      messages: [{ id: 'm1', threadId: 't1' }],
      resultSizeEstimate: 1,
    });
    vi.mocked(getGmailMessage).mockResolvedValue(
      message('m1', '1000', 'PO#123 from Gokai', [pdfPart('Gokai PO 123.pdf')]) as never,
    );

    const bundle = await fetchLatestSynpathPricingPoPdfs('token');
    expect(bundle.messageId).toBe('m1');
    expect(bundle.subject).toBe('PO#123 from Gokai');
    expect(bundle.purchase.fileName).toBe('Gokai PO 123.pdf');
    expect(bundle.freight).toBeUndefined();
    expect(bundle.duty).toBeUndefined();
  });

  it('splits purchase/freight/duty by filename when multiple PDFs are attached', async () => {
    vi.mocked(listGmailMessageIds).mockResolvedValue({
      messages: [{ id: 'm1', threadId: 't1' }],
      resultSizeEstimate: 1,
    });
    vi.mocked(getGmailMessage).mockResolvedValue(
      message('m1', '1000', 'PO#456', [
        pdfPart('Gokai PO 456.pdf'),
        pdfPart('Freight Invoice.pdf'),
        pdfPart('Customs Duty.pdf'),
      ]) as never,
    );

    const bundle = await fetchLatestSynpathPricingPoPdfs('token');
    expect(bundle.purchase.fileName).toBe('Gokai PO 456.pdf');
    expect(bundle.freight?.fileName).toBe('Freight Invoice.pdf');
    expect(bundle.duty?.fileName).toBe('Customs Duty.pdf');
  });

  it('picks the most recent message by internalDate, not list order', async () => {
    vi.mocked(listGmailMessageIds).mockResolvedValue({
      messages: [
        { id: 'older', threadId: 't1' },
        { id: 'newer', threadId: 't2' },
      ],
      resultSizeEstimate: 2,
    });
    vi.mocked(getGmailMessage).mockImplementation(async (_token, id) => {
      if (id === 'older') return message('older', '1000', 'PO old', [pdfPart('old.pdf')]) as never;
      return message('newer', '9999', 'PO new', [pdfPart('new.pdf')]) as never;
    });

    const bundle = await fetchLatestSynpathPricingPoPdfs('token');
    expect(bundle.messageId).toBe('newer');
    expect(bundle.purchase.fileName).toBe('new.pdf');
  });

  it('downloads via getGmailAttachment when the part has no inline data', async () => {
    vi.mocked(listGmailMessageIds).mockResolvedValue({
      messages: [{ id: 'm1', threadId: 't1' }],
      resultSizeEstimate: 1,
    });
    vi.mocked(getGmailMessage).mockResolvedValue({
      id: 'm1',
      threadId: 't1',
      internalDate: '1000',
      payload: {
        headers: [{ name: 'Subject', value: 'PO#789' }],
        parts: [
          {
            partId: 'p1',
            mimeType: 'application/pdf',
            filename: 'big.pdf',
            body: { attachmentId: 'att-1', size: 999 },
          },
        ],
      },
    } as never);
    vi.mocked(getGmailAttachment).mockResolvedValue(Buffer.from('downloaded-bytes'));

    const bundle = await fetchLatestSynpathPricingPoPdfs('token');
    expect(bundle.purchase.content.toString()).toBe('downloaded-bytes');
    expect(getGmailAttachment).toHaveBeenCalledWith('token', 'm1', 'att-1');
  });

  it('throws when no messages match', async () => {
    vi.mocked(listGmailMessageIds).mockResolvedValue({ messages: [], resultSizeEstimate: 0 });
    await expect(fetchLatestSynpathPricingPoPdfs('token')).rejects.toThrow(/No email found/);
  });

  it('throws when the latest matching email has no PDF attachments', async () => {
    vi.mocked(listGmailMessageIds).mockResolvedValue({
      messages: [{ id: 'm1', threadId: 't1' }],
      resultSizeEstimate: 1,
    });
    vi.mocked(getGmailMessage).mockResolvedValue(message('m1', '1000', 'PO#1', []) as never);
    await expect(fetchLatestSynpathPricingPoPdfs('token')).rejects.toThrow(/no PDF attachments/);
  });

  it('throws when two PDFs are both ambiguously classified as purchase', async () => {
    vi.mocked(listGmailMessageIds).mockResolvedValue({
      messages: [{ id: 'm1', threadId: 't1' }],
      resultSizeEstimate: 1,
    });
    vi.mocked(getGmailMessage).mockResolvedValue(
      message('m1', '1000', 'PO#1', [pdfPart('invoice-a.pdf'), pdfPart('invoice-b.pdf')]) as never,
    );
    await expect(fetchLatestSynpathPricingPoPdfs('token')).rejects.toThrow(/Ambiguous/);
  });

  it('searches label:"synpath pricing" subject:PO has:attachment', async () => {
    vi.mocked(listGmailMessageIds).mockResolvedValue({
      messages: [{ id: 'm1', threadId: 't1' }],
      resultSizeEstimate: 1,
    });
    vi.mocked(getGmailMessage).mockResolvedValue(
      message('m1', '1000', 'PO#1', [pdfPart('a.pdf')]) as never,
    );
    await fetchLatestSynpathPricingPoPdfs('token');
    expect(listGmailMessageIds).toHaveBeenCalledWith(
      'token',
      'label:"synpath pricing" subject:PO has:attachment',
      10,
    );
  });
});

describe('fetchLatestSynpathPricingSoPdf', () => {
  it('searches label:"synpath pricing" subject:SO has:attachment and returns the single PDF', async () => {
    vi.mocked(listGmailMessageIds).mockResolvedValue({
      messages: [{ id: 'm1', threadId: 't1' }],
      resultSizeEstimate: 1,
    });
    vi.mocked(getGmailMessage).mockResolvedValue(
      message('m1', '1000', 'SO#123 for CN Ledge', [pdfPart('Invoice 6866.pdf')]) as never,
    );

    const result = await fetchLatestSynpathPricingSoPdf('token');
    expect(listGmailMessageIds).toHaveBeenCalledWith(
      'token',
      'label:"synpath pricing" subject:SO has:attachment',
      10,
    );
    expect(result.messageId).toBe('m1');
    expect(result.subject).toBe('SO#123 for CN Ledge');
    expect(result.fileName).toBe('Invoice 6866.pdf');
    expect(result.content.toString()).toBe('pdf-bytes');
  });

  it('picks the most recent SO email by internalDate', async () => {
    vi.mocked(listGmailMessageIds).mockResolvedValue({
      messages: [
        { id: 'older', threadId: 't1' },
        { id: 'newer', threadId: 't2' },
      ],
      resultSizeEstimate: 2,
    });
    vi.mocked(getGmailMessage).mockImplementation(async (_token, id) => {
      if (id === 'older') return message('older', '1000', 'SO old', [pdfPart('old.pdf')]) as never;
      return message('newer', '9999', 'SO new', [pdfPart('new.pdf')]) as never;
    });

    const result = await fetchLatestSynpathPricingSoPdf('token');
    expect(result.messageId).toBe('newer');
    expect(result.fileName).toBe('new.pdf');
  });

  it('throws when more than one PDF is attached (ambiguous — no role system for SO)', async () => {
    vi.mocked(listGmailMessageIds).mockResolvedValue({
      messages: [{ id: 'm1', threadId: 't1' }],
      resultSizeEstimate: 1,
    });
    vi.mocked(getGmailMessage).mockResolvedValue(
      message('m1', '1000', 'SO#1', [pdfPart('a.pdf'), pdfPart('b.pdf')]) as never,
    );
    await expect(fetchLatestSynpathPricingSoPdf('token')).rejects.toThrow(/Ambiguous/);
  });

  it('throws when no messages match', async () => {
    vi.mocked(listGmailMessageIds).mockResolvedValue({ messages: [], resultSizeEstimate: 0 });
    await expect(fetchLatestSynpathPricingSoPdf('token')).rejects.toThrow(/No email found/);
  });
});
