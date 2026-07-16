import type { VercelRequest, VercelResponse } from '@vercel/node';
import type { WorkflowRun } from '../../../shared/workflow';
import type { WorkflowStore } from './store';

/**
 * Buffers workflow cookie writes and flushes once per request.
 * Prevents dozens of Set-Cookie headers during approve/execute chains.
 */
export class DeferredWorkflowStore implements WorkflowStore {
  private value: WorkflowRun | null;
  private dirty = false;

  constructor(
    private readonly inner: WorkflowStore,
    req: VercelRequest,
  ) {
    this.value = inner.get(req);
  }

  get(_req: VercelRequest): WorkflowRun | null {
    return this.value ? structuredClone(this.value) : null;
  }

  put(_res: VercelResponse, run: WorkflowRun): void {
    this.value = structuredClone(run);
    this.dirty = true;
  }

  clear(res: VercelResponse): void {
    this.value = null;
    this.dirty = false;
    this.inner.clear(res);
  }

  flush(res: VercelResponse): void {
    if (this.dirty && this.value) {
      this.inner.put(res, this.value);
      this.dirty = false;
    }
  }
}
