import type {
  AcrylicSkuLine,
  CfoAuditRecord,
  ImportCostMethod,
  PurchaseWritePlan,
  SalesOrderPlan,
  DocumentExtract,
  PnlSummary,
} from '../../shared/ghost';
import type { EmailStep, OutreachLead, OutreachSequence } from '../../shared/outreach';

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
    hubspot?: { configured: boolean; connected: boolean; detail: string };
  }>(res);
}

/** Resets the Sage connector's warm session and re-checks health — use after the Sage
 * 50 desktop UI was opened (and closed again) on the connector host. */
export async function reconnectSage() {
  const res = await fetch('/api/agents/sage/reconnect', { method: 'POST' });
  return parseJson<{ ok: boolean; detail: string }>(res);
}

export async function fetchHubspotLeads() {
  const res = await fetch('/api/agents/outreach/leads');
  return parseJson<{ ok: boolean; leads: OutreachLead[] }>(res);
}

export async function createOutreachSequence(input: {
  lead: OutreachLead;
  steps: EmailStep[];
  startDate: string;
}) {
  const res = await fetch('/api/agents/outreach/sequences', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(input),
  });
  return parseJson<{ ok: boolean; sequence: OutreachSequence }>(res);
}

export async function fetchOutreachSequences() {
  const res = await fetch('/api/agents/outreach/sequences');
  return parseJson<{ ok: boolean; sequences: OutreachSequence[] }>(res);
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

export async function fetchSupplyFromEmail() {
  const res = await fetch('/api/agents/supply/from-email');
  const data = (await res.json()) as {
    ok: boolean;
    error?: string;
    code?: string;
    purchase?: DocumentExtract;
    freight?: DocumentExtract | null;
    duty?: DocumentExtract | null;
    plan?: PurchaseWritePlan;
    incompleteAcrylicLines?: DocumentExtract['lines'];
    emailSource?: {
      messageId: string;
      subject: string;
      fileNames: { purchase: string; freight: string | null; duty: string | null };
    };
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

export interface SageWriteResult {
  poReference?: string | null;
  receiveReference?: string | null;
  soReference?: string | null;
  invoiceReference?: string | null;
  warnings?: string[];
}

export async function approveSupply(
  plan: PurchaseWritePlan,
  opts: { user?: string; confirmSageWrite?: boolean } = {},
) {
  const res = await fetch('/api/agents/supply/approve', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      plan,
      user: opts.user ?? 'demo-cfo',
      confirmSageWrite: opts.confirmSageWrite === true,
    }),
  });
  return parseJson<{
    ok: boolean;
    audit: CfoAuditRecord;
    message: string;
    sageResult?: SageWriteResult;
  }>(res);
}

export async function processSales(input: { pdfBase64: string }) {
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

export async function confirmSales(plan: SalesOrderPlan, opts: { confirmSageWrite?: boolean } = {}) {
  const res = await fetch('/api/agents/sales/confirm', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ plan, confirmSageWrite: opts.confirmSageWrite === true }),
  });
  return parseJson<{ ok: boolean; message: string; sageResult?: SageWriteResult }>(res);
}

export async function fetchSalesFromEmail() {
  const res = await fetch('/api/agents/sales/from-email');
  return parseJson<{
    ok: boolean;
    document: DocumentExtract;
    plan: SalesOrderPlan;
    emailSource?: { messageId: string; subject: string; fileName: string };
  }>(res);
}

export async function fetchPnl() {
  const res = await fetch('/api/agents/intelligence/pnl');
  return parseJson<{ ok: boolean; pnl: PnlSummary }>(res);
}

/** Irreversibly wipes the SKU catalog and Sales Order store. */
export async function resetSupplyAndSalesData() {
  const res = await fetch('/api/agents/admin/reset-data', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ confirm: true }),
  });
  return parseJson<{ ok: boolean; cleared: string[] }>(res);
}

/**
 * Resets SKU catalog qty/price/invoice history (keeping sku_id, description,
 * spec, and vendor fields) and clears Sales Order records — for resetting a
 * demo company without re-uploading the inventory CSV.
 */
export async function resetDemoData() {
  const res = await fetch('/api/agents/admin/reset-demo-data', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ confirm: true }),
  });
  return parseJson<{ ok: boolean; cleared: string[]; skusKept: number }>(res);
}
