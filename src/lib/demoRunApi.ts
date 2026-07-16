import type { DemoPrepareResult, DemoRunRecord } from '../../shared/demoRun';
import type { WorkflowRun } from '../../shared/workflow';
import type { PreviewRequest } from './workflowApi';

async function parseJson<T>(response: Response): Promise<T> {
  const text = await response.text();
  const trimmed = text.replace(/^\uFEFF/, '').trim();
  let data: Record<string, unknown> = {};
  if (trimmed) {
    const looksLikeJson = trimmed.startsWith('{') || trimmed.startsWith('[');
    if (!looksLikeJson) {
      const snippet = trimmed.replace(/\s+/g, ' ').slice(0, 220);
      throw Object.assign(
        new Error(
          response.ok
            ? `Unexpected server response (not JSON): ${snippet}`
            : `Request failed (${response.status}): ${snippet}`,
        ),
        { needsSage: response.status === 401 },
      );
    }
    try {
      data = JSON.parse(trimmed) as Record<string, unknown>;
    } catch {
      const snippet = trimmed.replace(/\s+/g, ' ').slice(0, 220);
      throw Object.assign(
        new Error(
          response.ok
            ? `Unexpected server response (not JSON): ${snippet}`
            : `Request failed (${response.status}): ${snippet}`,
        ),
        { needsSage: response.status === 401 },
      );
    }
  }
  if (!response.ok) {
    const error = new Error(
      (typeof data.error === 'string' && data.error) ||
        (typeof data.message === 'string' && data.message) ||
        `Request failed (${response.status})`,
    ) as Error & {
      missingSkus?: string[];
      demoRun?: DemoRunRecord;
      run?: WorkflowRun;
      partial?: boolean;
      unresolved?: string[];
      needsSage?: boolean;
    };
    if (Array.isArray(data.missingSkus)) error.missingSkus = data.missingSkus.map(String);
    if (data.demoRun && typeof data.demoRun === 'object') {
      error.demoRun = data.demoRun as DemoRunRecord;
    }
    if (data.run && typeof data.run === 'object') {
      error.run = data.run as WorkflowRun;
    }
    if (Array.isArray(data.unresolved)) error.unresolved = data.unresolved.map(String);
    if (data.partial === true) error.partial = true;
    if (response.status === 401) error.needsSage = true;
    throw error;
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

export async function fetchDemoRun() {
  return parseJson<{ run: DemoRunRecord | null }>(
    await fetch('/api/workflow/demo/run', { credentials: 'include' }),
  );
}

export function prepareDemoRun(request: PreviewRequest) {
  return post<DemoPrepareResult>('/api/workflow/demo/prepare', request);
}

export function postDemoPurchase(request: PreviewRequest) {
  return post<{
    demoRun: DemoRunRecord;
    run: WorkflowRun;
    beforeAfter: Array<{
      sku: string;
      previousQuantity: number;
      newQuantity: number;
      previousCost: number;
      newLandedCost: number;
    }>;
    partial?: boolean;
  }>('/api/workflow/demo/purchase', request);
}

export function postDemoSales(request: PreviewRequest) {
  return post<{
    demoRun: DemoRunRecord;
    run: WorkflowRun;
    beforeAfter?: Array<{
      sku: string;
      previousQuantity: number;
      newQuantity: number;
      soldQuantity: number;
    }>;
    unitsSold?: number;
    salesTotal?: number;
  }>('/api/workflow/demo/sales', request);
}

export function resetDemoRun(confirmation = 'RESET', demoRunId?: string) {
  return post<{
    demoRun: DemoRunRecord | null;
    message: string;
    unresolved: string[];
    summary: {
      productsReady: boolean;
      inventoryRestored: boolean;
      costsRestored: boolean;
      transactionsReconciled: boolean;
    };
  }>('/api/workflow/demo/reset', {
    confirmation,
    demoRunId,
  });
}
