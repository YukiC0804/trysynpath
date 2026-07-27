/**
 * Alternate source for Supply & Costing input PDFs: instead of the user
 * uploading files, pull them from the latest email under the "synpath
 * pricing" Gmail label whose subject contains "PO". That email can carry
 * one PDF (the purchase invoice) or several (purchase + freight + duty) —
 * roles are inferred from the attachment filename, same convention as
 * classifyDocument() in client.ts.
 */
import { getGmailAttachment, getGmailMessage, listGmailMessageIds } from './client';
import { headerValue, parseGmailMime } from './mime';

const MAX_ATTACHMENT_BYTES = 15 * 1024 * 1024;
const SEARCH_QUERY = 'label:"synpath pricing" subject:PO has:attachment';

export type PdfRole = 'purchase' | 'freight' | 'duty';

export interface RolePdf {
  fileName: string;
  content: Buffer;
}

export interface PoPdfBundle {
  messageId: string;
  subject: string;
  purchase: RolePdf;
  freight?: RolePdf;
  duty?: RolePdf;
}

export function classifyPdfRole(fileName: string): PdfRole {
  const lower = fileName.toLowerCase();
  if (/freight|shipping/.test(lower)) return 'freight';
  if (/duty|customs/.test(lower)) return 'duty';
  return 'purchase';
}

/**
 * Latest matching email's PDF attachments, downloaded and sorted into
 * purchase/freight/duty. Throws when the role assignment is ambiguous
 * (0 or 2+ candidates for a role) instead of guessing — the caller should
 * ask the user to upload manually or rename the attachments.
 */
export async function fetchLatestSynpathPricingPoPdfs(accessToken: string): Promise<PoPdfBundle> {
  const { messages } = await listGmailMessageIds(accessToken, SEARCH_QUERY, 10);
  if (!messages.length) {
    throw new Error(`No email found matching: ${SEARCH_QUERY}`);
  }

  const full = await Promise.all(messages.map((m) => getGmailMessage(accessToken, m.id)));
  full.sort((a, b) => Number(b.internalDate ?? 0) - Number(a.internalDate ?? 0));
  const latest = full[0]!;
  const subject = headerValue(latest.payload?.headers, 'Subject');

  const parsed = parseGmailMime(latest.payload);
  const pdfAttachments = parsed.attachments.filter(
    (a) => a.mimeType === 'application/pdf' || /\.pdf$/i.test(a.fileName),
  );
  if (!pdfAttachments.length) {
    throw new Error(`Latest matching email ("${subject}") has no PDF attachments`);
  }

  const downloaded = await Promise.all(
    pdfAttachments.map(async (a) => {
      const content =
        a.inlineData ??
        (a.attachmentId
          ? await getGmailAttachment(accessToken, latest.id, a.attachmentId)
          : Buffer.alloc(0));
      if (content.byteLength > MAX_ATTACHMENT_BYTES) {
        throw new Error(`${a.fileName} exceeds the attachment size limit`);
      }
      return { fileName: a.fileName, content, role: classifyPdfRole(a.fileName) };
    }),
  );

  const purchase = downloaded.filter((d) => d.role === 'purchase');
  const freight = downloaded.filter((d) => d.role === 'freight');
  const duty = downloaded.filter((d) => d.role === 'duty');

  if (purchase.length !== 1) {
    const names = downloaded.map((d) => d.fileName).join(', ');
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
    messageId: latest.id,
    subject,
    purchase: { fileName: purchase[0]!.fileName, content: purchase[0]!.content },
    freight: freight[0] ? { fileName: freight[0].fileName, content: freight[0].content } : undefined,
    duty: duty[0] ? { fileName: duty[0].fileName, content: duty[0].content } : undefined,
  };
}
