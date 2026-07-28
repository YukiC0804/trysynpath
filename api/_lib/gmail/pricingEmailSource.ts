/**
 * Alternate source for Supply & Costing / Sales Order input PDFs: instead of
 * the user uploading files, pull them from the latest email under the
 * "synpath pricing" Gmail label matching a subject keyword ("PO" for
 * purchase invoices, "SO" for sales orders).
 */
import { getGmailAttachment, getGmailMessage, listGmailMessageIds } from './client';
import { headerValue, parseGmailMime } from './mime';

const MAX_ATTACHMENT_BYTES = 15 * 1024 * 1024;
const LABEL = 'label:"synpath pricing"';

export interface RolePdf {
  fileName: string;
  content: Buffer;
}

interface LatestEmailPdfs {
  messageId: string;
  subject: string;
  from: string;
  receivedAt: string;
  snippet: string;
  pdfs: RolePdf[];
}

/** Most recent (by actual internalDate, not list order) email matching `label:"synpath pricing" subject:<keyword> has:attachment`, with its PDF attachments downloaded. */
async function fetchLatestMatchingPdfs(accessToken: string, subjectKeyword: string): Promise<LatestEmailPdfs> {
  const query = `${LABEL} subject:${subjectKeyword} has:attachment`;
  const { messages } = await listGmailMessageIds(accessToken, query, 10);
  if (!messages.length) {
    throw new Error(`No email found matching: ${query}`);
  }

  const full = await Promise.all(messages.map((m) => getGmailMessage(accessToken, m.id)));
  full.sort((a, b) => Number(b.internalDate ?? 0) - Number(a.internalDate ?? 0));
  const latest = full[0]!;
  const headers = latest.payload?.headers;
  const subject = headerValue(headers, 'Subject');
  const from = headerValue(headers, 'From');

  const parsed = parseGmailMime(latest.payload);
  const pdfAttachments = parsed.attachments.filter(
    (a) => a.mimeType === 'application/pdf' || /\.pdf$/i.test(a.fileName),
  );
  if (!pdfAttachments.length) {
    throw new Error(`Latest matching email ("${subject}") has no PDF attachments`);
  }

  const pdfs = await Promise.all(
    pdfAttachments.map(async (a) => {
      const content =
        a.inlineData ??
        (a.attachmentId
          ? await getGmailAttachment(accessToken, latest.id, a.attachmentId)
          : Buffer.alloc(0));
      if (content.byteLength > MAX_ATTACHMENT_BYTES) {
        throw new Error(`${a.fileName} exceeds the attachment size limit`);
      }
      return { fileName: a.fileName, content };
    }),
  );

  return {
    messageId: latest.id,
    subject,
    from,
    receivedAt: latest.internalDate
      ? new Date(Number(latest.internalDate)).toISOString()
      : headerValue(headers, 'Date'),
    snippet: latest.snippet ?? parsed.text.slice(0, 180),
    pdfs,
  };
}

export type PdfRole = 'purchase' | 'freight' | 'duty';

export function classifyPdfRole(fileName: string): PdfRole {
  const lower = fileName.toLowerCase();
  if (/freight|shipping/.test(lower)) return 'freight';
  if (/duty|customs/.test(lower)) return 'duty';
  return 'purchase';
}

export interface PoPdfBundle {
  messageId: string;
  subject: string;
  from: string;
  receivedAt: string;
  snippet: string;
  purchase: RolePdf;
  freight?: RolePdf;
  duty?: RolePdf;
}

/**
 * Latest "...subject:PO..." email's PDF attachments, sorted into
 * purchase/freight/duty by filename keyword. Throws when the role
 * assignment is ambiguous (0 or 2+ candidates for a role) instead of
 * guessing — the caller should ask the user to upload manually or rename
 * the attachments.
 */
export async function fetchLatestSynpathPricingPoPdfs(accessToken: string): Promise<PoPdfBundle> {
  const { messageId, subject, from, receivedAt, snippet, pdfs } = await fetchLatestMatchingPdfs(
    accessToken,
    'PO',
  );
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
    messageId,
    subject,
    from,
    receivedAt,
    snippet,
    purchase: { fileName: purchase[0]!.fileName, content: purchase[0]!.content },
    freight: freight[0] ? { fileName: freight[0].fileName, content: freight[0].content } : undefined,
    duty: duty[0] ? { fileName: duty[0].fileName, content: duty[0].content } : undefined,
  };
}

export interface SoPdf {
  messageId: string;
  subject: string;
  from: string;
  receivedAt: string;
  snippet: string;
  fileName: string;
  content: Buffer;
}

/**
 * Latest "...subject:SO..." email's PDF attachment. Sales Order processes
 * one PDF per document — unlike PO there's no freight/duty role to sort
 * into, so more than one attachment is ambiguous rather than something to
 * guess at.
 */
export async function fetchLatestSynpathPricingSoPdf(accessToken: string): Promise<SoPdf> {
  const { messageId, subject, from, receivedAt, snippet, pdfs } = await fetchLatestMatchingPdfs(
    accessToken,
    'SO',
  );
  if (pdfs.length !== 1) {
    const names = pdfs.map((p) => p.fileName).join(', ');
    throw new Error(
      pdfs.length > 1
        ? `Ambiguous: ${pdfs.length} PDFs attached to the latest matching email ("${subject}": ${names}) — Sales Order expects exactly one PDF; upload manually instead.`
        : `Latest matching email ("${subject}") has no PDF attachments`,
    );
  }
  return { messageId, subject, from, receivedAt, snippet, fileName: pdfs[0]!.fileName, content: pdfs[0]!.content };
}
