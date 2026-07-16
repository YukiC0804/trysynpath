import type {
  InventoryPostingStrategy,
  SafeMode,
  WorkflowPreview,
  WorkflowRun,
} from '../../shared/workflow';

async function parseJson<T>(response: Response): Promise<T> {
  const text = await response.text();
  const data = text ? (JSON.parse(text) as Record<string, unknown>) : {};
  if (!response.ok) {
    throw new Error(
      (typeof data.error === 'string' && data.error) ||
        (typeof data.message === 'string' && data.message) ||
        `Request failed (${response.status})`,
    );
  }
  return data as T;
}

async function post<T>(path: string, body: object) {
  return parseJson<T>(
    await fetch(path, {
      method: 'POST',
      credentials: 'include',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    }),
  );
}

export interface GmailStatus {
  configured: boolean;
  connected: boolean;
  emailAddress?: string;
  connectedAt?: string;
  lastSyncAt?: string;
  defaultSearch: string;
  missing: string[];
}

export interface GmailSyncResult {
  query: string;
  lastSyncAt: string;
  messages: Array<{
    gmailMessageId: string;
    gmailThreadId: string;
    from: string;
    to: string;
    subject: string;
    receivedAt: string;
    snippet: string;
    labelIds: string[];
    attachmentIds: string[];
    processingStatus: string;
  }>;
  documents: Array<{
    id: string;
    emailMessageId: string;
    fileName: string;
    mimeType: string;
    fileSize: number;
    documentType: string;
    extractionStatus: string;
  }>;
  messageCount: number;
  attachmentCount: number;
}

export async function fetchGmailStatus() {
  return parseJson<GmailStatus>(
    await fetch('/api/gmail/status', { credentials: 'include' }),
  );
}

export async function disconnectGmail() {
  return post<{ disconnected: boolean }>('/api/gmail/disconnect', {});
}

export async function syncGmail(query: string, messageIds?: string[]) {
  return post<GmailSyncResult>('/api/gmail/sync', { query, messageIds });
}

export interface PreviewRequest {
  mode: SafeMode;
  sourceType: 'fixture' | 'gmail';
  searchQuery?: string;
  messageIds?: string[];
  inventoryPostingStrategy: InventoryPostingStrategy;
  overrides?: Record<string, unknown>;
  selections?: Record<string, unknown>;
}

export function createWorkflowPreview(request: PreviewRequest) {
  return post<WorkflowPreview>('/api/workflow/preview', request);
}

export function fetchWorkflowStatus() {
  return fetch('/api/workflow/status', { credentials: 'include' }).then((response) =>
    parseJson<{ run: WorkflowRun | null }>(response),
  );
}

export function approveWorkflow(input: {
  target:
    | 'purchaseInvoice'
    | 'inventoryReceipt'
    | 'customerSale'
    | 'purchaseInvoiceRelease'
    | 'salesInvoiceRelease';
  confirmation: string;
  accountingMappingConfirmed: boolean;
  inventoryPostingStrategy?: InventoryPostingStrategy;
  approvalDigest: string;
} & PreviewRequest) {
  return post<{ run: WorkflowRun }>('/api/workflow/approve', input);
}

export function executeWorkflow(
  target:
    | 'purchase_invoice'
    | 'stock_movements'
    | 'sales_invoice'
    | 'purchase_invoice_release'
    | 'sales_invoice_release',
  request: PreviewRequest,
) {
  return post<{
    run: WorkflowRun;
    idempotentReplay: boolean;
    records: WorkflowRun['postingRecords'];
    preview: WorkflowPreview;
    refreshWarning?: string;
  }>('/api/workflow/execute', { ...request, target });
}

export function resetWorkflow() {
  return post<{ reset: boolean }>('/api/workflow/reset', {});
}
