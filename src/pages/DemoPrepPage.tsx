import { useCallback, useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import type { DemoPrepareResult } from '../../shared/demoRun';
import { SageLayout } from '../components/sage/SageLayout';
import { prepareDemoRun } from '../lib/demoRunApi';
import { fetchSageStatus, type SageStatus } from '../lib/sageApi';
import {
  createWorkflowPreview,
  type PreviewRequest,
} from '../lib/workflowApi';

/**
 * Internal presenter preparation screen — not linked from the CFO demo page.
 */
export function DemoPrepPage() {
  const [sageStatus, setSageStatus] = useState<SageStatus | null>(null);
  const [result, setResult] = useState<DemoPrepareResult | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    void fetchSageStatus()
      .then(setSageStatus)
      .catch(() => setSageStatus(null));
  }, []);

  const runPrepare = useCallback(async () => {
    setBusy(true);
    setError(null);
    try {
      if (!sageStatus?.connected) {
        throw new Error('Connect Sage before preparing the demo.');
      }
      const request: PreviewRequest = {
        mode: 'live_sage_write',
        sourceType: 'fixture',
        inventoryPostingStrategy: 'stock_movement',
        selections: { accountingMappingConfirmed: true },
      };
      await createWorkflowPreview(request);
      const prepared = await prepareDemoRun(request);
      setResult(prepared);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Preparation failed');
    } finally {
      setBusy(false);
    }
  }, [sageStatus?.connected]);

  return (
    <SageLayout>
      <div className="mb-6">
        <Link to="/sage-integration" className="text-xs text-neutral-500 hover:text-neutral-300">
          ← Ghostboards Demo
        </Link>
        <h1 className="mt-3 font-display text-2xl font-semibold text-white">
          Demo Preparation
        </h1>
        <p className="mt-2 max-w-2xl text-sm text-neutral-400">
          Internal screen for presenters. Confirm every demo SKU exists in Sage with a suitable
          baseline quantity and cost before the CFO meeting. Missing SKUs are never created here.
        </p>
      </div>

      {!sageStatus?.connected ? (
        <a
          href="/api/integrations/sage/connect"
          className="inline-flex rounded-lg bg-white px-4 py-2 text-sm font-semibold text-black"
        >
          Connect Sage
        </a>
      ) : (
        <button
          type="button"
          disabled={busy}
          onClick={() => void runPrepare()}
          className="rounded-lg bg-white px-4 py-2 text-sm font-semibold text-black disabled:opacity-40"
        >
          {busy ? 'Checking…' : 'Check demo SKUs in Sage'}
        </button>
      )}

      {error && (
        <div className="mt-4 rounded-lg border border-amber-500/30 bg-amber-500/10 px-4 py-3 text-sm text-amber-100">
          {error}
        </div>
      )}

      {result && (
        <section className="mt-6 rounded-2xl border border-neutral-800 bg-[#0a0a0a] p-5">
          <p className="text-sm text-neutral-300">
            {result.ready
              ? 'All required SKUs exist. Baseline values look ready for the demo.'
              : 'Demo cannot start until the missing SKUs are prepared in Sage.'}
          </p>
          {result.missingSkus.length > 0 && (
            <p className="mt-3 text-sm text-amber-200">
              The following SKU must be prepared in Sage before continuing.{' '}
              {result.missingSkus.join(', ')}
            </p>
          )}
          <div className="mt-4 overflow-x-auto">
            <table className="min-w-full text-left text-sm">
              <thead className="text-xs uppercase text-neutral-500">
                <tr>
                  <th className="px-2 py-2">SKU</th>
                  <th className="px-2 py-2">Exists</th>
                  <th className="px-2 py-2">Quantity</th>
                  <th className="px-2 py-2">Cost</th>
                  <th className="px-2 py-2">Last Cost</th>
                  <th className="px-2 py-2">Average Cost</th>
                </tr>
              </thead>
              <tbody>
                {result.stockItems.map((item) => (
                  <tr key={item.sku} className="border-t border-neutral-800">
                    <td className="px-2 py-2 text-white">{item.sku}</td>
                    <td className="px-2 py-2">{item.exists ? 'Yes' : 'No'}</td>
                    <td className="px-2 py-2">{item.quantityInStock}</td>
                    <td className="px-2 py-2">{item.costPrice.toFixed(2)}</td>
                    <td className="px-2 py-2">{item.lastCostPrice.toFixed(2)}</td>
                    <td className="px-2 py-2">{item.averageCostPrice.toFixed(2)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      )}
    </SageLayout>
  );
}
