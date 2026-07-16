import type { VercelRequest, VercelResponse } from '@vercel/node';
import { deflateRawSync, inflateRawSync } from 'zlib';
import type { WorkflowRun } from '../../../shared/workflow';
import { clearCookie, parseCookies, setCookie } from '../sage/http';
import { decryptJson, encryptJson } from '../sage/tokenStore';

const COOKIE_WORKFLOW_RUN = 'synpath_workflow_run';

export interface WorkflowStore {
  get(req: VercelRequest): WorkflowRun | null;
  put(res: VercelResponse, run: WorkflowRun): void;
  clear(res: VercelResponse): void;
}

export class EncryptedCookieWorkflowStore implements WorkflowStore {
  get(req: VercelRequest): WorkflowRun | null {
    const raw = parseCookies(req)[COOKIE_WORKFLOW_RUN];
    if (!raw) return null;
    try {
      const wrapped = decryptJson<{ compressed: string }>(raw);
      return JSON.parse(
        inflateRawSync(Buffer.from(wrapped.compressed, 'base64url')).toString('utf8'),
      ) as WorkflowRun;
    } catch {
      return null;
    }
  }

  put(res: VercelResponse, run: WorkflowRun) {
    const compressed = deflateRawSync(Buffer.from(JSON.stringify(run), 'utf8')).toString(
      'base64url',
    );
    const encrypted = encryptJson({ compressed });
    // Keep one compact server-managed run in an encrypted, HttpOnly cookie. Source
    // binaries remain in Gmail (re-fetched by ID) or immutable fixture modules.
    setCookie(res, COOKIE_WORKFLOW_RUN, encrypted, { maxAge: 60 * 60 * 24 * 14 });
  }

  clear(res: VercelResponse) {
    clearCookie(res, COOKIE_WORKFLOW_RUN);
  }
}

export function createWorkflowRun(input: {
  id: string;
  mode: WorkflowRun['mode'];
  sourceType: WorkflowRun['sourceType'];
  externalReference: string;
  sourceMessageIds: string[];
  sourceDocumentIds: string[];
  attachmentHashes: string[];
}): WorkflowRun {
  const now = new Date().toISOString();
  return {
    ...input,
    createdAt: now,
    updatedAt: now,
    status: 'draft',
    approvals: {
      purchaseInvoice: 'pending',
      inventoryReceipt: 'pending',
      customerSale: 'pending',
      purchaseInvoiceRelease: 'pending',
      salesInvoiceRelease: 'pending',
    },
    inventoryPostingStrategy: 'none',
    postingRecords: [],
    errors: [],
  };
}
