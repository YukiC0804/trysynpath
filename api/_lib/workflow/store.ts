import type { VercelRequest, VercelResponse } from '@vercel/node';
import { deflateRawSync, inflateRawSync } from 'zlib';
import type { WorkflowRun } from '../../../shared/workflow';
import { clearCookie, parseCookies, setCookie } from '../sage/http';
import { decryptJson, encryptJson } from '../sage/tokenStore';

const COOKIE_WORKFLOW_RUN = 'synpath_workflow_run';
const COOKIE_WORKFLOW_RUN_CHUNKS = 'synpath_workflow_run_chunks';
const COOKIE_CHUNK_SIZE = 3200;
const MAX_COOKIE_CHUNKS = 6;

export interface WorkflowStore {
  get(req: VercelRequest): WorkflowRun | null;
  put(res: VercelResponse, run: WorkflowRun): void;
  clear(res: VercelResponse): void;
}

export class EncryptedCookieWorkflowStore implements WorkflowStore {
  get(req: VercelRequest): WorkflowRun | null {
    const cookies = parseCookies(req);
    const count = Number(cookies[COOKIE_WORKFLOW_RUN_CHUNKS] ?? 0);
    const raw =
      count > 0
        ? Array.from({ length: count }, (_, index) => cookies[`${COOKIE_WORKFLOW_RUN}_${index}`] ?? '').join('')
        : cookies[COOKIE_WORKFLOW_RUN];
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
    const chunks = encrypted.match(new RegExp(`.{1,${COOKIE_CHUNK_SIZE}}`, 'g')) ?? [];
    if (chunks.length > MAX_COOKIE_CHUNKS) {
      throw new Error('Workflow state exceeded the encrypted demo-store limit');
    }
    clearCookie(res, COOKIE_WORKFLOW_RUN);
    setCookie(res, COOKIE_WORKFLOW_RUN_CHUNKS, String(chunks.length), {
      maxAge: 60 * 60 * 24 * 14,
    });
    chunks.forEach((chunk, index) =>
      setCookie(res, `${COOKIE_WORKFLOW_RUN}_${index}`, chunk, {
        maxAge: 60 * 60 * 24 * 14,
      }),
    );
    for (let index = chunks.length; index < MAX_COOKIE_CHUNKS; index += 1) {
      clearCookie(res, `${COOKIE_WORKFLOW_RUN}_${index}`);
    }
  }

  clear(res: VercelResponse) {
    clearCookie(res, COOKIE_WORKFLOW_RUN);
    clearCookie(res, COOKIE_WORKFLOW_RUN_CHUNKS);
    for (let index = 0; index < MAX_COOKIE_CHUNKS; index += 1) {
      clearCookie(res, `${COOKIE_WORKFLOW_RUN}_${index}`);
    }
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
