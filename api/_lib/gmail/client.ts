import crypto from 'crypto';
import type { DocumentType, EmailSource, SourceDocument } from '../../../shared/workflow';
import type {
  DownloadedSourceDocument,
  SourceAdapter,
  SourceCollection,
} from '../workflow/sourceAdapters';
import { decodeBase64Url, headerValue, parseGmailMime, type GmailMessagePart } from './mime';

const GMAIL_API = 'https://gmail.googleapis.com/gmail/v1/users/me';
const MAX_SELECTED_MESSAGES = 20;
const MAX_ATTACHMENT_BYTES = 10 * 1024 * 1024;
const MAX_TOTAL_ATTACHMENT_BYTES = 20 * 1024 * 1024;

async function gmailFetch<T>(
  path: string,
  accessToken: string,
  query?: Record<string, string | string[] | undefined>,
): Promise<T> {
  const url = new URL(`${GMAIL_API}${path}`);
  for (const [key, raw] of Object.entries(query ?? {})) {
    if (raw == null) continue;
    for (const value of Array.isArray(raw) ? raw : [raw]) url.searchParams.append(key, value);
  }
  const response = await fetch(url, {
    headers: { Authorization: `Bearer ${accessToken}`, Accept: 'application/json' },
  });
  if (!response.ok) {
    const detail = await response.text().catch(() => '');
    throw new Error(
      `Gmail API GET ${path} failed (${response.status})${detail ? `: ${detail.slice(0, 300)}` : ''}`,
    );
  }
  return response.json() as Promise<T>;
}

export interface GmailApiMessage {
  id: string;
  threadId: string;
  labelIds?: string[];
  snippet?: string;
  internalDate?: string;
  payload?: GmailMessagePart;
}

export async function getGmailProfile(accessToken: string) {
  return gmailFetch<{ emailAddress: string; messagesTotal: number; threadsTotal: number }>(
    '/profile',
    accessToken,
  );
}

export async function listGmailMessageIds(accessToken: string, q: string, maxResults = 50) {
  const data = await gmailFetch<{
    messages?: Array<{ id: string; threadId: string }>;
    resultSizeEstimate?: number;
  }>('/messages', accessToken, { q, maxResults: String(maxResults) });
  return {
    messages: data.messages ?? [],
    resultSizeEstimate: data.resultSizeEstimate ?? 0,
  };
}

export function getGmailMessage(accessToken: string, id: string) {
  return gmailFetch<GmailApiMessage>(`/messages/${encodeURIComponent(id)}`, accessToken, {
    format: 'full',
  });
}

export async function getGmailAttachment(
  accessToken: string,
  messageId: string,
  attachmentId: string,
): Promise<Buffer> {
  const data = await gmailFetch<{ data?: string; size?: number }>(
    `/messages/${encodeURIComponent(messageId)}/attachments/${encodeURIComponent(attachmentId)}`,
    accessToken,
  );
  if (!data.data) throw new Error(`Gmail attachment ${attachmentId} returned no data`);
  return decodeBase64Url(data.data);
}

async function mapWithConcurrency<T, R>(
  values: T[],
  limit: number,
  mapper: (value: T) => Promise<R>,
): Promise<R[]> {
  const results = new Array<R>(values.length);
  let cursor = 0;
  await Promise.all(
    Array.from({ length: Math.min(limit, values.length) }, async () => {
      while (cursor < values.length) {
        const index = cursor;
        cursor += 1;
        results[index] = await mapper(values[index]);
      }
    }),
  );
  return results;
}

export async function listGmailMessageSummaries(
  accessToken: string,
  q: string,
  maxResults = 50,
) {
  const list = await listGmailMessageIds(accessToken, q, maxResults);
  const full = await mapWithConcurrency(list.messages, 5, (message) =>
    getGmailMessage(accessToken, message.id),
  );
  const emails: EmailSource[] = [];
  const documents: SourceDocument[] = [];
  for (const message of full) {
    const parsed = parseGmailMime(message.payload);
    const headers = message.payload?.headers;
    const attachmentIds = parsed.attachments.map(
      (attachment) =>
        attachment.attachmentId ?? `${message.id}:${attachment.partId ?? attachment.fileName}`,
    );
    emails.push({
      gmailMessageId: message.id,
      gmailThreadId: message.threadId,
      from: headerValue(headers, 'From'),
      to: headerValue(headers, 'To'),
      subject: headerValue(headers, 'Subject'),
      receivedAt: message.internalDate
        ? new Date(Number(message.internalDate)).toISOString()
        : headerValue(headers, 'Date'),
      snippet: message.snippet ?? parsed.text.slice(0, 180),
      labelIds: message.labelIds ?? [],
      attachmentIds,
      processingStatus: attachmentIds.length ? 'New' : 'Needs Review',
    });
    parsed.attachments.forEach((attachment, index) => {
      documents.push({
        id: `gmail:${message.id}:${attachmentIds[index]}`,
        emailMessageId: message.id,
        fileName: attachment.fileName,
        mimeType: attachment.mimeType,
        fileSize: attachment.size,
        sha256: '',
        documentType: classifyDocument(attachment.fileName, attachment.mimeType),
        extractionStatus: 'New',
        sourceType: 'gmail',
        gmailAttachmentId: attachment.attachmentId,
      });
    });
  }
  return {
    query: q,
    messages: emails,
    documents,
    messageCount: emails.length,
    attachmentCount: documents.length,
    resultSizeEstimate: list.resultSizeEstimate,
  };
}

function classifyDocument(fileName: string, mimeType: string): DocumentType {
  const value = `${fileName} ${mimeType}`.toLowerCase();
  if (/customer.*invoice|sales.*invoice/.test(value)) return 'customer_invoice';
  if (/freight/.test(value)) return 'freight_invoice';
  if (/custom|duty|hmrc/.test(value)) return 'customs_duty';
  if (/packing|bol|bill.of.lading/.test(value)) return 'packing_list';
  if (/vendor.*invoice|supplier.*invoice/.test(value)) return 'vendor_invoice';
  if (/purchase.*order|\bpo\b/.test(value)) return 'purchase_order';
  if (/csv|pricing/.test(value)) return 'pricing_csv';
  return 'unknown';
}

export class GmailSourceAdapter implements SourceAdapter {
  readonly sourceType = 'gmail' as const;

  constructor(private readonly accessToken: string) {}

  async collect(input: {
    messageIds?: string[];
    searchQuery?: string;
  } = {}): Promise<SourceCollection> {
    const ids =
      input.messageIds?.length
        ? input.messageIds.map((id) => ({ id, threadId: '' }))
        : (
            await listGmailMessageIds(
              this.accessToken,
              input.searchQuery ??
                'label:synpath-sage-demo subject:"PO#GHOACRUGOL051926" has:attachment',
            )
          ).messages;
    if (ids.length > MAX_SELECTED_MESSAGES) {
      throw new Error(`Select at most ${MAX_SELECTED_MESSAGES} Gmail messages per import`);
    }
    const emails: EmailSource[] = [];
    const documents: DownloadedSourceDocument[] = [];
    let totalAttachmentBytes = 0;

    for (const item of ids) {
      const message = await getGmailMessage(this.accessToken, item.id);
      const parsed = parseGmailMime(message.payload);
      const headers = message.payload?.headers;
      const attachmentIds: string[] = [];
      for (const attachment of parsed.attachments) {
        const content =
          attachment.inlineData ??
          (attachment.attachmentId
            ? await getGmailAttachment(this.accessToken, message.id, attachment.attachmentId)
            : Buffer.alloc(0));
        if (content.byteLength > MAX_ATTACHMENT_BYTES) {
          throw new Error(`${attachment.fileName} exceeds the 10 MB attachment limit`);
        }
        totalAttachmentBytes += content.byteLength;
        if (totalAttachmentBytes > MAX_TOTAL_ATTACHMENT_BYTES) {
          throw new Error('Selected Gmail attachments exceed the 20 MB import limit');
        }
        const attachmentId = attachment.attachmentId ?? `${message.id}:${attachment.partId}`;
        attachmentIds.push(attachmentId);
        const sha256 = crypto.createHash('sha256').update(content).digest('hex');
        const metadata: SourceDocument = {
          id: `gmail:${message.id}:${attachmentId}`,
          emailMessageId: message.id,
          fileName: attachment.fileName,
          mimeType: attachment.mimeType,
          fileSize: content.byteLength,
          sha256,
          documentType: classifyDocument(attachment.fileName, attachment.mimeType),
          extractionStatus: 'Downloaded',
          sourceType: 'gmail',
          gmailAttachmentId: attachment.attachmentId,
        };
        documents.push({ metadata, content });
      }
      emails.push({
        gmailMessageId: message.id,
        gmailThreadId: message.threadId,
        from: headerValue(headers, 'From'),
        to: headerValue(headers, 'To'),
        subject: headerValue(headers, 'Subject'),
        receivedAt: message.internalDate
          ? new Date(Number(message.internalDate)).toISOString()
          : headerValue(headers, 'Date'),
        snippet: message.snippet ?? parsed.text.slice(0, 180),
        labelIds: message.labelIds ?? [],
        attachmentIds,
        processingStatus: attachmentIds.length ? 'Downloaded' : 'Needs Review',
      });
    }
    return { sourceType: this.sourceType, emails, documents, collectedAt: new Date().toISOString() };
  }
}
