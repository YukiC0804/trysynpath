/**
 * Alternate source for Supply & Costing / Sales Order input PDFs: instead of
 * the user uploading files, pull them from the latest email under the
 * "synpath pricing" Gmail label matching a subject keyword ("PO" for
 * purchase invoices, "SO" for sales orders).
 *
 * Split into a fast preview (metadata only, no attachment download) and the
 * full fetch (downloads + returns PDF bytes) so the UI can show the source
 * email immediately, before the slower download/parse work runs. The full
 * fetch accepts the preview's `messageId` to load that exact message
 * directly instead of re-running the search.
 */
import { getGmailAttachment, getGmailMessage, listGmailMessageIds, type GmailApiMessage } from './client';
import { headerValue, parseGmailMime, type ParsedGmailAttachment } from './mime';

const MAX_ATTACHMENT_BYTES = 15 * 1024 * 1024;
const LABEL = 'label:"synpath pricing"';

export interface RolePdf {
  fileName: string;
  content: Buffer;
}

export interface EmailMeta {
  messageId: string;
  subject: string;
  from: string;
  receivedAt: string;
  snippet: string;
}

async function findLatestMatchingMessage(
  accessToken: string,
  subjectKeyword: string,
): Promise<GmailApiMessage> {
  const query = `${LABEL} subject:${subjectKeyword} has:attachment`;
  const { messages } = await listGmailMessageIds(accessToken, query, 10);
  if (!messages.length) {
    throw new Error(`No email found matching: ${query}`);
  }
  const full = await Promise.all(messages.map((m) => getGmailMessage(accessToken, m.id)));
  full.sort((a, b) => Number(b.internalDate ?? 0) - Number(a.internalDate ?? 0));
  return full[0]!;
}

function messageMeta(message: GmailApiMessage): EmailMeta {
  const headers = message.payload?.headers;
  const subject = headerValue(headers, 'Subject');
  return {
    messageId: message.id,
    subject,
    from: headerValue(headers, 'From'),
    receivedAt: message.internalDate
      ? new Date(Number(message.internalDate)).toISOString()
      : headerValue(headers, 'Date'),
    snippet: message.snippet ?? parseGmailMime(message.payload).text.slice(0, 180),
  };
}

function pdfAttachmentsOf(message: GmailApiMessage): ParsedGmailAttachment[] {
  return parseGmailMime(message.payload).attachments.filter(
    (a) => a.mimeType === 'application/pdf' || /\.pdf$/i.test(a.fileName),
  );
}

export interface EmailPreview extends EmailMeta {
  fileNames: string[];
}

/** Fast lookup: latest matching email's metadata + PDF attachment names — no download. */
async function previewLatestMatchingEmail(
  accessToken: string,
  subjectKeyword: string,
): Promise<EmailPreview> {
  const message = await findLatestMatchingMessage(accessToken, subjectKeyword);
  const meta = messageMeta(message);
  const pdfAttachments = pdfAttachmentsOf(message);
  if (!pdfAttachments.length) {
    throw new Error(`Latest matching email ("${meta.subject}") has no PDF attachments`);
  }
  return { ...meta, fileNames: pdfAttachments.map((a) => a.fileName) };
}

export function previewLatestSynpathPricingPoEmail(accessToken: string): Promise<EmailPreview> {
  return previewLatestMatchingEmail(accessToken, 'PO');
}

export function previewLatestSynpathPricingSoEmail(accessToken: string): Promise<EmailPreview> {
  return previewLatestMatchingEmail(accessToken, 'SO');
}

interface LatestEmailPdfs extends EmailMeta {
  pdfs: RolePdf[];
}

/**
 * Full fetch: the matching email's metadata + downloaded PDF bytes. Pass
 * `messageId` (from a prior preview call) to load that exact message
 * instead of re-running the search — cheaper and avoids a race against a
 * newer matching email arriving between the preview and this call.
 */
async function fetchLatestMatchingPdfs(
  accessToken: string,
  subjectKeyword: string,
  messageId?: string,
): Promise<LatestEmailPdfs> {
  const message = messageId
    ? await getGmailMessage(accessToken, messageId)
    : await findLatestMatchingMessage(accessToken, subjectKeyword);
  const meta = messageMeta(message);
  const pdfAttachments = pdfAttachmentsOf(message);
  if (!pdfAttachments.length) {
    throw new Error(`Latest matching email ("${meta.subject}") has no PDF attachments`);
  }

  const pdfs = await Promise.all(
    pdfAttachments.map(async (a) => {
      const content =
        a.inlineData ??
        (a.attachmentId
          ? await getGmailAttachment(accessToken, message.id, a.attachmentId)
          : Buffer.alloc(0));
      if (content.byteLength > MAX_ATTACHMENT_BYTES) {
        throw new Error(`${a.fileName} exceeds the attachment size limit`);
      }
      return { fileName: a.fileName, content };
    }),
  );

  return { ...meta, pdfs };
}

export type PdfRole = 'purchase' | 'freight' | 'duty';

export function classifyPdfRole(fileName: string): PdfRole {
  const lower = fileName.toLowerCase();
  if (/freight|shipping/.test(lower)) return 'freight';
  if (/duty|customs/.test(lower)) return 'duty';
  return 'purchase';
}

export interface PoPdfBundle extends EmailMeta {
  purchase: RolePdf;
  freight?: RolePdf;
  duty?: RolePdf;
}

/**
 * Latest "...subject:PO..." email's PDF attachments, sorted into
 * purchase/freight/duty by filename keyword. Throws when the role
 * assignment is ambiguous (0 or 2+ candidates for a role) instead of
 * guessing — the caller should ask the user to upload manually or rename
 * the attachments. Pass `messageId` from a prior preview call to skip
 * re-searching for the email.
 */
export async function fetchLatestSynpathPricingPoPdfs(
  accessToken: string,
  messageId?: string,
): Promise<PoPdfBundle> {
  const { pdfs, ...meta } = await fetchLatestMatchingPdfs(accessToken, 'PO', messageId);
  const classified = pdfs.map((p) => ({ ...p, role: classifyPdfRole(p.fileName) }));

  const purchase = classified.filter((d) => d.role === 'purchase');
  const freight = classified.filter((d) => d.role === 'freight');
  const duty = classified.filter((d) => d.role === 'duty');

  if (purchase.length !== 1) {
    const names = classified.map((d) => d.fileName).join(', ');
    throw new Error(
      purchase.length === 0
        ? `No purchase invoice PDF found among: ${names} — rename the attachment (avoid "freight"/"duty" in the name) or upload manually.`
        : `Ambiguous: ${purchase.length} PDFs could be the purchase invoice (${purchase.map((d) => d.fileName).join(', ')}) — rename attachments or upload manually.`,
    );
  }
  if (freight.length > 1) {
    throw new Error(`Ambiguous: multiple freight PDFs (${freight.map((d) => d.fileName).join(', ')}).`);
  }
  if (duty.length > 1) {
    throw new Error(`Ambiguous: multiple duty PDFs (${duty.map((d) => d.fileName).join(', ')}).`);
  }

  return {
    ...meta,
    purchase: { fileName: purchase[0]!.fileName, content: purchase[0]!.content },
    freight: freight[0] ? { fileName: freight[0].fileName, content: freight[0].content } : undefined,
    duty: duty[0] ? { fileName: duty[0].fileName, content: duty[0].content } : undefined,
  };
}

export interface SoPdf extends EmailMeta {
  fileName: string;
  content: Buffer;
}

/**
 * Latest "...subject:SO..." email's PDF attachment. Sales Order processes
 * one PDF per document — unlike PO there's no freight/duty role to sort
 * into, so more than one attachment is ambiguous rather than something to
 * guess at. Pass `messageId` from a prior preview call to skip re-searching
 * for the email.
 */
export async function fetchLatestSynpathPricingSoPdf(
  accessToken: string,
  messageId?: string,
): Promise<SoPdf> {
  const { pdfs, ...meta } = await fetchLatestMatchingPdfs(accessToken, 'SO', messageId);
  if (pdfs.length !== 1) {
    const names = pdfs.map((p) => p.fileName).join(', ');
    throw new Error(
      pdfs.length > 1
        ? `Ambiguous: ${pdfs.length} PDFs attached to the latest matching email ("${meta.subject}": ${names}) — Sales Order expects exactly one PDF; upload manually instead.`
        : `Latest matching email ("${meta.subject}") has no PDF attachments`,
    );
  }
  return { ...meta, fileName: pdfs[0]!.fileName, content: pdfs[0]!.content };
}
