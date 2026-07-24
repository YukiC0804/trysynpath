import type {
  AcrylicSkuLine,
  CfoAuditRecord,
  ImportCostMethod,
  PurchaseWritePlan,
  SalesOrderPlan,
  DocumentExtract,
} from '../../shared/ghost';

async function parseJson<T>(res: Response): Promise<T> {
  const data = (await res.json()) as T & { error?: string };
  if (!res.ok) {
    throw new Error((data as { error?: string }).error || `Request failed (${res.status})`);
  }
  return data;
}

export async function fetchAgentsStatus() {
  const res = await fetch('/api/agents/status');
  return parseJson<{
    documentAi: { configured: boolean; connected: boolean; detail: string };
    acrylicLlmEnrich?: { configured: boolean; model: string; detail: string };
    sage: { connected: boolean; detail: string };
  }>(res);
}

export async function fetchGmailStatus() {
  const res = await fetch('/api/gmail/status');
  return parseJson<{
    configured: boolean;
    connected: boolean;
    emailAddress?: string;
  }>(res);
}

export async function disconnectGmail() {
  const res = await fetch('/api/gmail/disconnect', { method: 'POST' });
  return parseJson<{ disconnected: boolean }>(res);
}

export async function sendOutreachEmail(input: {
  to: string;
  subject: string;
  body: string;
}) {
  const res = await fetch('/api/gmail/send', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(input),
  });
  return parseJson<{ ok: boolean; message: { id: string } }>(res);
}

export function fileToBase64(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      const result = String(reader.result || '');
      const base64 = result.includes(',') ? result.split(',')[1]! : result;
      resolve(base64);
    };
    reader.onerror = () => reject(reader.error ?? new Error('Failed to read file'));
    reader.readAsDataURL(file);
  });
}

export async function processSupply(input: {
  purchasePdfBase64: string;
  freightPdfBase64?: string;
  dutyPdfBase64?: string;
}) {
  const res = await fetch('/api/agents/supply/process', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(input),
  });
  const data = (await res.json()) as {
    ok: boolean;
    error?: string;
    code?: string;
    purchase?: DocumentExtract;
    freight?: DocumentExtract | null;
    duty?: DocumentExtract | null;
    plan?: PurchaseWritePlan;
    incompleteAcrylicLines?: DocumentExtract['lines'];
  };
  if (res.status === 422 && data.code === 'MISSING_ACRYLIC_DIMS') {
    return data;
  }
  if (!res.ok || !data.ok) {
    throw new Error(data.error || `Request failed (${res.status})`);
  }
  return data;
}

export async function allocateSupply(input: {
  purchase: DocumentExtract;
  freight?: DocumentExtract | null;
  duty?: DocumentExtract | null;
  linePatches?: Array<{
    index: number;
    thickness_mm?: number;
    size?: string;
    quantity?: number;
  }>;
}) {
  const res = await fetch('/api/agents/supply/allocate', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(input),
  });
  return parseJson<{
    ok: boolean;
    purchase: DocumentExtract;
    freight: DocumentExtract | null;
    duty: DocumentExtract | null;
    plan: PurchaseWritePlan;
  }>(res);
}

export async function recalculateSupply(input: {
  lines: AcrylicSkuLine[];
  importPool: number;
  method?: ImportCostMethod;
  freightAmount?: number | null;
  dutyAmount?: number | null;
  invoiceTotal?: number | null;
  ddpAmount?: number | null;
}) {
  const res = await fetch('/api/agents/supply/recalculate', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(input),
  });
  return parseJson<{
    ok: boolean;
    lines: AcrylicSkuLine[];
    breakdown: PurchaseWritePlan['landed'];
  }>(res);
}

export async function approveSupply(plan: PurchaseWritePlan, user = 'demo-cfo') {
  const res = await fetch('/api/agents/supply/approve', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ plan, user }),
  });
  return parseJson<{ ok: boolean; audit: CfoAuditRecord; message: string }>(res);
}

export async function processSales(input: {
  pdfBase64: string;
  recentKeys?: string[];
}) {
  const res = await fetch('/api/agents/sales/process', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(input),
  });
  return parseJson<{
    ok: boolean;
    document: DocumentExtract;
    plan: SalesOrderPlan;
  }>(res);
}
