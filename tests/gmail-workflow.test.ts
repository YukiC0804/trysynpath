import { describe, expect, it } from 'vitest';
import { validateNormalizedBundle } from '../api/_lib/workflow/validation';
import { decodeBase64Url, parseGmailMime } from '../api/_lib/gmail/mime';
import { FixtureDocumentExtractionAdapter } from '../api/_lib/workflow/extraction';
import {
  deduplicateSourceCollection,
  FixtureSourceAdapter,
  groupDocumentsByReference,
} from '../api/_lib/workflow/sourceAdapters';

const encode = (value: string) =>
  Buffer.from(value, 'utf8').toString('base64url');

describe('Gmail MIME parsing', () => {
  it('decodes base64url data', () => {
    expect(decodeBase64Url(encode('hello + / world')).toString('utf8')).toBe(
      'hello + / world',
    );
  });

  it('recursively parses nested text and attachments', () => {
    const parsed = parseGmailMime({
      mimeType: 'multipart/mixed',
      parts: [
        {
          mimeType: 'multipart/alternative',
          parts: [
            { mimeType: 'text/plain', body: { data: encode('Plain body') } },
            { mimeType: 'text/html', body: { data: encode('<p>HTML body</p>') } },
          ],
        },
        {
          partId: '2',
          mimeType: 'application/pdf',
          filename: 'invoice.pdf',
          body: { attachmentId: 'att-1', size: 42 },
        },
        {
          partId: '3',
          mimeType: 'text/csv',
          filename: 'prices.csv',
          body: { data: encode('sku,price\nA,1') },
        },
      ],
    });
    expect(parsed.text).toBe('Plain body');
    expect(parsed.html).toBe('<p>HTML body</p>');
    expect(parsed.attachments).toHaveLength(2);
    expect(parsed.attachments[0]).toMatchObject({
      attachmentId: 'att-1',
      fileName: 'invoice.pdf',
    });
    expect(parsed.attachments[1].inlineData?.toString('utf8')).toContain('sku,price');
  });
});

describe('source adapters and normalization', () => {
  it('deduplicates messages and attachments by message ID and SHA-256', async () => {
    const collection = await new FixtureSourceAdapter().collect();
    const duplicated = {
      ...collection,
      emails: [...collection.emails, collection.emails[0]],
      documents: [...collection.documents, collection.documents[0]],
    };
    const result = deduplicateSourceCollection(duplicated);
    expect(result.emails).toHaveLength(collection.emails.length);
    expect(result.documents).toHaveLength(collection.documents.length);
  });

  it('groups documents using PO/container references across multiple emails', async () => {
    const collection = await new FixtureSourceAdapter().collect();
    const grouped = groupDocumentsByReference(collection, {
      externalPoNumber: 'GHOACRUGOL051926',
      containerNumber: 'TLLU4819203',
    });
    expect(grouped.length).toBeGreaterThanOrEqual(5);
    expect(new Set(grouped.map((item) => item.metadata.emailMessageId)).size).toBeGreaterThan(1);
  });

  it('validates fixture extraction through normalized schemas', async () => {
    const source = await new FixtureSourceAdapter().collect();
    const result = await new FixtureDocumentExtractionAdapter().extract(source);
    expect(validateNormalizedBundle(result.bundle)).toEqual([]);
    expect(result.bundle.fixtureExtraction).toBe(true);
    expect(result.bundle.extractionWarnings[0]).toContain('not a successful live AI extraction');
    expect(result.fields.externalPoNumber).toMatchObject({
      confidence: 0.99,
      manuallyEdited: false,
    });
  });

  it('marks corrected extracted values as manually edited', async () => {
    const source = await new FixtureSourceAdapter().collect();
    const result = await new FixtureDocumentExtractionAdapter().extract(source, {
      exchangeRate: 1.25,
      shipment: { vendorInvoiceNumber: 'EDITED-INV' },
      shipmentLines: [{ sku: 'ACR-CLR-3MM-48X96', receivedQuantity: 48 }],
      customerInvoice: { customer: 'Edited Customer', shipping: 90 },
      customerInvoiceLines: [
        { sku: 'ACR-CLR-3MM-48X96', quantity: 9, salesUnitPrice: 105 },
      ],
    });
    expect(result.bundle.shipment.exchangeRate).toBe(1.25);
    expect(result.bundle.shipment.lines[0].receivedQuantity).toBe(48);
    expect(result.fields.exchangeRate.manuallyEdited).toBe(true);
    expect(result.bundle.shipment.vendorInvoiceNumber).toBe('EDITED-INV');
    expect(result.bundle.customerInvoice.customer).toBe('Edited Customer');
    expect(result.bundle.customerInvoice.lines[0]).toMatchObject({
      quantity: 9,
      salesUnitPrice: 105,
    });
    expect(result.fields['customerLine.ACR-CLR-3MM-48X96.quantity'].manuallyEdited).toBe(
      true,
    );
  });
});
