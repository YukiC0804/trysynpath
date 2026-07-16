import crypto from 'crypto';
import type { DocumentType, EmailSource, SourceDocument } from '../../../shared/workflow';
import type {
  DownloadedSourceDocument,
  SourceAdapter,
  SourceCollection,
} from '../workflow/sourceAdapters';
import { decodeBase64Url, headerValue, parseGmailMime, type GmailMessagePart } from './mime';

const GMAIL_API = 'https://gmail.googleapis.com/gmail/v1/users/me';

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
              input.searchQuery ?? 'label:"Synpath Sage Demo" has:attachment',
            )
          ).messages;
    const emails: EmailSource[] = [];
    const documents: DownloadedSourceDocument[] = [];

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
