export interface GmailHeader {
  name: string;
  value: string;
}

export interface GmailMessagePart {
  partId?: string;
  mimeType?: string;
  filename?: string;
  headers?: GmailHeader[];
  body?: {
    attachmentId?: string;
    size?: number;
    data?: string;
  };
  parts?: GmailMessagePart[];
}

export interface ParsedGmailAttachment {
  attachmentId?: string;
  fileName: string;
  mimeType: string;
  size: number;
  inlineData?: Buffer;
  partId?: string;
}

export interface ParsedGmailMime {
  text: string;
  html: string;
  attachments: ParsedGmailAttachment[];
}

export function decodeBase64Url(value: string): Buffer {
  const normalized = value.replace(/-/g, '+').replace(/_/g, '/');
  const padding = normalized.length % 4 ? '='.repeat(4 - (normalized.length % 4)) : '';
  return Buffer.from(normalized + padding, 'base64');
}

export function headerValue(headers: GmailHeader[] | undefined, name: string): string {
  return headers?.find((header) => header.name.toLowerCase() === name.toLowerCase())?.value ?? '';
}

export function parseGmailMime(payload: GmailMessagePart | undefined): ParsedGmailMime {
  const result: ParsedGmailMime = { text: '', html: '', attachments: [] };
  if (!payload) return result;

  const visit = (part: GmailMessagePart) => {
    const mimeType = part.mimeType ?? 'application/octet-stream';
    const fileName = part.filename ?? '';
    const data = part.body?.data ? decodeBase64Url(part.body.data) : undefined;
    const isAttachment = Boolean(fileName || part.body?.attachmentId);
    if (isAttachment) {
      result.attachments.push({
        attachmentId: part.body?.attachmentId,
        fileName: fileName || `attachment-${part.partId ?? result.attachments.length + 1}`,
        mimeType,
        size: part.body?.size ?? data?.byteLength ?? 0,
        inlineData: data,
        partId: part.partId,
      });
    } else if (data && mimeType === 'text/plain') {
      result.text += `${data.toString('utf8')}\n`;
    } else if (data && mimeType === 'text/html') {
      result.html += `${data.toString('utf8')}\n`;
    }
    for (const child of part.parts ?? []) visit(child);
  };
  visit(payload);
  return {
    text: result.text.trim(),
    html: result.html.trim(),
    attachments: result.attachments,
  };
}
