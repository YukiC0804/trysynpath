import { afterEach, describe, expect, it, vi } from 'vitest';
import { GmailSourceAdapter } from '../api/_lib/gmail/client';

const json = (value: unknown) =>
  new Response(JSON.stringify(value), {
    status: 200,
    headers: { 'Content-Type': 'application/json' },
  });

afterEach(() => vi.restoreAllMocks());

describe('GmailSourceAdapter with mocked Gmail HTTP', () => {
  it('lists, retrieves, downloads and normalizes a nested attachment', async () => {
    vi.spyOn(globalThis, 'fetch')
      .mockResolvedValueOnce(
        json({ messages: [{ id: 'm-1', threadId: 't-1' }], resultSizeEstimate: 1 }),
      )
      .mockResolvedValueOnce(
        json({
          id: 'm-1',
          threadId: 't-1',
          labelIds: ['Label_1'],
          snippet: 'Reference GHOACRUGOL051926',
          internalDate: '1784192400000',
          payload: {
            mimeType: 'multipart/mixed',
            headers: [
              { name: 'From', value: 'supplier@example.com' },
              { name: 'To', value: 'ops@example.com' },
              { name: 'Subject', value: 'Vendor invoice GHOACRUGOL051926' },
            ],
            parts: [
              {
                mimeType: 'text/plain',
                body: { data: Buffer.from('See attached').toString('base64url') },
              },
              {
                partId: '2',
                mimeType: 'application/pdf',
                filename: 'vendor-invoice.pdf',
                body: { attachmentId: 'a-1', size: 12 },
              },
            ],
          },
        }),
      )
      .mockResolvedValueOnce(
        json({ data: Buffer.from('synthetic pdf').toString('base64url'), size: 13 }),
      );

    const result = await new GmailSourceAdapter('token').collect({
      searchQuery: '"GHOACRUGOL051926"',
    });
    expect(result.emails).toHaveLength(1);
    expect(result.emails[0]).toMatchObject({
      gmailMessageId: 'm-1',
      gmailThreadId: 't-1',
      processingStatus: 'Downloaded',
    });
    expect(result.documents).toHaveLength(1);
    expect(result.documents[0].metadata).toMatchObject({
      fileName: 'vendor-invoice.pdf',
      documentType: 'vendor_invoice',
      sourceType: 'gmail',
    });
    expect(result.documents[0].metadata.sha256).toMatch(/^[a-f0-9]{64}$/);
    expect(globalThis.fetch).toHaveBeenCalledTimes(3);
  });
});
