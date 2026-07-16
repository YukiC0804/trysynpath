import crypto from 'crypto';
import type { EmailSource, SourceDocument, SourceType } from '../../../shared/workflow';
import { FIXTURE_DOCUMENTS, FIXTURE_EMAILS } from './fixtures';

export interface DownloadedSourceDocument {
  metadata: SourceDocument;
  content: Buffer;
}

export interface SourceCollection {
  sourceType: SourceType;
  emails: EmailSource[];
  documents: DownloadedSourceDocument[];
  collectedAt: string;
}

export interface SourceAdapter {
  readonly sourceType: SourceType;
  collect(input?: { messageIds?: string[]; searchQuery?: string }): Promise<SourceCollection>;
}

export class FixtureSourceAdapter implements SourceAdapter {
  readonly sourceType = 'fixture' as const;

  async collect(): Promise<SourceCollection> {
    const documents = FIXTURE_DOCUMENTS.map((definition) => {
      const content = Buffer.from(definition.content, 'utf8');
      return {
        metadata: {
          id: definition.id,
          emailMessageId: definition.emailMessageId,
          fileName: definition.fileName,
          mimeType: definition.mimeType,
          fileSize: content.byteLength,
          sha256: crypto.createHash('sha256').update(content).digest('hex'),
          documentType: definition.documentType,
          extractionStatus: 'Ready' as const,
          sourceType: 'fixture' as const,
        },
        content,
      };
    });
    return {
      sourceType: this.sourceType,
      emails: structuredClone(FIXTURE_EMAILS),
      documents,
      collectedAt: new Date().toISOString(),
    };
  }
}

export function deduplicateSourceCollection(collection: SourceCollection): SourceCollection {
  const seenMessages = new Set<string>();
  const emails = collection.emails.filter((email) => {
    if (seenMessages.has(email.gmailMessageId)) return false;
    seenMessages.add(email.gmailMessageId);
    return true;
  });
  const seenDocuments = new Set<string>();
  const documents = collection.documents.filter((document) => {
    const key = document.metadata.sha256 || document.metadata.id;
    if (seenDocuments.has(key)) return false;
    seenDocuments.add(key);
    return true;
  });
  return { ...collection, emails, documents };
}

export function groupDocumentsByReference(
  collection: SourceCollection,
  references: { externalPoNumber?: string; containerNumber?: string },
) {
  const needles = [references.externalPoNumber, references.containerNumber]
    .filter(Boolean)
    .map((value) => String(value).toLowerCase());
  if (!needles.length) return collection.documents;
  const matchingMessageIds = new Set(
    collection.emails
      .filter((email) => {
        const haystack = `${email.subject} ${email.snippet}`.toLowerCase();
        return needles.some((needle) => haystack.includes(needle));
      })
      .map((email) => email.gmailMessageId),
  );
  return collection.documents.filter((document) =>
    matchingMessageIds.has(document.metadata.emailMessageId),
  );
}
