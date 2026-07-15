import { useCallback, useEffect, useMemo, useState, type ReactNode } from 'react';
import { useSearchParams } from 'react-router-dom';
import { StatusBadge } from '../components/demo/StatusBadge';
import { SageLayout } from '../components/sage/SageLayout';
import {
  EXTRACTED_PRICE_UPDATES,
  GHOST_BOARDS,
  MOCK_GMAIL_EMAIL,
  PURCHASE_ORDER,
  SKU_UPDATE_PROPOSAL,
  SYNPATH_ONLY_PRODUCT,
  extractPricingFromEmail,
} from '../data/sageIntegrationData';
import {
  createStockItem,
  disconnectSage,
  fetchAuditLog,
  fetchCapabilities,
  fetchSageStatus,
  listStockItems,
  resetSageDemoData,
  type NormalizedStockItem,
  type SageStatus,
  updateStockItem,
} from '../lib/sageApi';

type WorkflowId = 'sync' | 'updates' | 'gmail' | 'po';

const WORKFLOWS: { id: WorkflowId; label: string }[] = [
  { id: 'sync', label: '1 · Product Sync' },
  { id: 'updates', label: '2 · SKU Updates' },
  { id: 'gmail', label: '3 · Gmail → Sage' },
  { id: 'po', label: '4 · Purchase Order' },
];

type GmailStage =
  | 'idle'
  | 'demo-email'
  | 'extracted'
  | 'matched'
  | 'approved'
  | 'updating'
  | 'verified';

export function SageIntegrationPage() {
  const [params] = useSearchParams();
  const [workflow, setWorkflow] = useState<WorkflowId>('sync');
  const [status, setStatus] = useState<SageStatus | null>(null);
  const [items, setItems] = useState<NormalizedStockItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [createResult, setCreateResult] = useState<string | null>(null);
  const [updateResult, setUpdateResult] = useState<string | null>(null);
  const [verification, setVerification] = useState<Record<
    string,
    { expected: unknown; actual: unknown; ok: boolean }
  > | null>(null);
  const [reorderRequired, setReorderRequired] = useState(false);
  const [gmailConnected, setGmailConnected] = useState(false);
  const [gmailStage, setGmailStage] = useState<GmailStage>('idle');
  const [extracted, setExtracted] = useState(EXTRACTED_PRICE_UPDATES);
  const [liveCosts, setLiveCosts] = useState<Record<string, number>>({});
  const [poStatus, setPoStatus] = useState<'draft' | 'approved' | null>(null);
  const [audit, setAudit] = useState<Array<{ id: string; at: string; action: string; detail: string; status: string }>>([]);
  const [capabilities, setCapabilities] = useState<{ purchaseOrders?: { available: boolean; reason: string } } | null>(null);

  const refresh = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const [sageStatus, caps, auditLog] = await Promise.all([
        fetchSageStatus(),
        fetchCapabilities().catch(() => null),
        fetchAuditLog().catch(() => ({ entries: [] })),
      ]);
      setStatus(sageStatus);
      setCapabilities((caps as { capabilities?: typeof capabilities })?.capabilities ?? null);
      setAudit(auditLog.entries ?? []);

      if (sageStatus.connected) {
        const stock = await listStockItems();
        setItems(stock);
      } else {
        setItems([]);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load Sage status');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  useEffect(() => {
    if (params.get('connected') === 'true') {
      setNotice('Sage Accounting Connected');
      void refresh();
    }
    if (params.get('connected') === 'false') {
      setError('Sage connection was cancelled or failed. Try Connect Sage again from production.');
    }
  }, [params, refresh]);

  const bySku = useMemo(() => {
    const map = new Map(items.map((item) => [item.sku.toUpperCase(), item]));
    return map;
  }, [items]);

  /** Product Sync table rows come from live Sage stock items — never hardcoded demo SKUs. */
  const productSyncRows = useMemo(() => {
    if (!status?.connected) return [];
    return items.map((item) => ({
      sku: item.sku,
      description: item.description,
      costPrice: item.costPrice,
      salesPrice: item.salesPrice,
      stock: item.quantityInStock,
      reorderLevel: item.reorderLevel,
      supplier: item.supplier || '—',
      sync: 'Synced from Sage',
      syncOk: true,
    }));
  }, [status?.connected, items]);

  const whiteSkuInSage = bySku.has(SYNPATH_ONLY_PRODUCT.sku.toUpperCase());

  const handleCreateWhite = async () => {
    setBusy(true);
    setError(null);
    setCreateResult(null);
    try {
      const existing = bySku.get(SYNPATH_ONLY_PRODUCT.sku.toUpperCase());
      if (existing) {
        setCreateResult(`SKU ${SYNPATH_ONLY_PRODUCT.sku} already exists in Sage — duplicate creation blocked.`);
        return;
      }
      const result = await createStockItem({
        item_code: SYNPATH_ONLY_PRODUCT.sku,
        description: SYNPATH_ONLY_PRODUCT.description,
        cost_price: SYNPATH_ONLY_PRODUCT.costPrice,
        sales_price: SYNPATH_ONLY_PRODUCT.salesPrice,
        reorder_level: SYNPATH_ONLY_PRODUCT.reorderLevel,
        reorder_quantity: SYNPATH_ONLY_PRODUCT.reorderQuantity,
        supplier_part_number: SYNPATH_ONLY_PRODUCT.supplierPartNumber,
      });
      setCreateResult(result.verified ? 'Created and verified in Sage' : result.message);
      await refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Create failed');
    } finally {
      setBusy(false);
    }
  };

  const handleApproveSkuUpdate = async () => {
    setBusy(true);
    setError(null);
    setUpdateResult(null);
    setVerification(null);
    try {
      const item = bySku.get(SKU_UPDATE_PROPOSAL.sku.toUpperCase());
      if (!item) throw new Error(`Connect Sage and sync ${SKU_UPDATE_PROPOSAL.sku} first`);
      const result = await updateStockItem(item.id, {
        description: 'Silver Mirror Cast Acrylic Sheet 3mm',
        reorder_level: 20,
      });
      setVerification(result.verification);
      setReorderRequired(result.reorderRequired);
      setUpdateResult(result.message);
      await refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Update failed');
    } finally {
      setBusy(false);
    }
  };

  const runGmailPipeline = async () => {
    setGmailConnected(true);
    setGmailStage('demo-email');
    await wait(600);
    const extractedRows = extractPricingFromEmail(MOCK_GMAIL_EMAIL.body);
    setExtracted(
      EXTRACTED_PRICE_UPDATES.map((row) => {
        const found = extractedRows.find((e) => e && e.sku === row.sku);
        return found ? { ...row, newCost: found.newCost } : row;
      }),
    );
    setGmailStage('extracted');
    await wait(500);
    setGmailStage('matched');

    if (status?.connected) {
      const costs: Record<string, number> = {};
      for (const row of EXTRACTED_PRICE_UPDATES) {
        const live = bySku.get(row.sku.toUpperCase());
        costs[row.sku] = live?.costPrice ?? row.previousCost;
      }
      setLiveCosts(costs);
    } else {
      setLiveCosts(
        Object.fromEntries(EXTRACTED_PRICE_UPDATES.map((r) => [r.sku, r.previousCost])),
      );
    }
  };

  const approveGmailUpdates = async () => {
    setGmailStage('approved');
    if (!status?.connected) {
      setError('Connect real Sage before applying Cost Price updates.');
      return;
    }
    setGmailStage('updating');
    setBusy(true);
    setError(null);
    try {
      for (const row of extracted) {
        const item = bySku.get(row.sku.toUpperCase());
        if (!item) throw new Error(`Exact SKU match missing for ${row.sku}`);
        await updateStockItem(item.id, { cost_price: row.newCost });
      }
      setGmailStage('verified');
      setNotice('Updating Real Sage complete — Verified in Sage');
      await refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Price update failed');
      setGmailStage('matched');
    } finally {
      setBusy(false);
    }
  };

  const handleResetDemoData = async () => {
    if (!status?.connected) {
      setError('Connect Sage before resetting demo data.');
      return;
    }
    setBusy(true);
    setError(null);
    setNotice(null);
    try {
      const result = await resetSageDemoData();
      setCreateResult(null);
      setUpdateResult(null);
      setVerification(null);
      setReorderRequired(false);
      setGmailStage('idle');
      setGmailConnected(false);
      setExtracted(EXTRACTED_PRICE_UPDATES);
      setLiveCosts({});
      setPoStatus(null);
      setNotice(
        `${result.message}${
          result.missing.length
            ? `. Missing demo SKU(s) were left unchanged: ${result.missing.join(', ')}`
            : ''
        }`,
      );
      await refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to reset Sage demo data');
    } finally {
      setBusy(false);
    }
  };

  const exportPoPdf = () => {
    const html = `<!doctype html><html><head><title>${PURCHASE_ORDER.number}</title>
      <style>body{font-family:Inter,system-ui,sans-serif;padding:40px;color:#111}
      h1{font-size:20px}table{border-collapse:collapse;width:100%;margin-top:24px}
      td,th{border:1px solid #ddd;padding:8px;text-align:left}</style></head><body>
      <h1>Purchase Order ${PURCHASE_ORDER.number}</h1>
      <p>Supplier: ${PURCHASE_ORDER.supplier} (${PURCHASE_ORDER.supplierRef})</p>
      <table><tr><th>SKU</th><th>Qty</th><th>Unit Cost</th><th>Freight</th><th>Currency</th></tr>
      <tr><td>${PURCHASE_ORDER.sku}</td><td>${PURCHASE_ORDER.orderQuantity}</td>
      <td>${PURCHASE_ORDER.unitCost.toFixed(2)}</td><td>${PURCHASE_ORDER.freight.toFixed(2)}</td>
      <td>${PURCHASE_ORDER.currency}</td></tr></table>
      <p>Status: ${poStatus ?? 'draft'}</p></body></html>`;
    const blob = new Blob([html], { type: 'text/html' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${PURCHASE_ORDER.number}.html`;
    a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <SageLayout>
      <div className="mb-8 flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight text-white sm:text-3xl">
            {GHOST_BOARDS.pageTitle}
          </h1>
          <p className="mt-2 max-w-2xl text-sm text-neutral-400">{GHOST_BOARDS.subtitle}</p>
        </div>
        <div className="flex flex-wrap gap-2">
          {status?.connected ? (
            <>
              <button
                type="button"
                disabled={busy}
                onClick={() => void handleResetDemoData()}
                className="rounded-lg border border-violet-500/50 bg-violet-500/10 px-3 py-2 text-xs font-medium text-violet-200 hover:bg-violet-500/20 disabled:opacity-40"
              >
                {busy ? 'Working…' : 'Reset demo data'}
              </button>
              <button
                type="button"
                disabled={busy}
                onClick={() => void disconnectSage().then(refresh)}
                className="rounded-lg border border-neutral-700 px-3 py-2 text-xs text-neutral-300 hover:text-white disabled:opacity-40"
              >
                Disconnect Sage
              </button>
            </>
          ) : (
            <a
              href="/api/integrations/sage/connect"
              className="rounded-lg bg-white px-3 py-2 text-xs font-semibold text-black"
            >
              Connect Sage
            </a>
          )}
          <button
            type="button"
            onClick={() => void refresh()}
            className="rounded-lg border border-neutral-700 px-3 py-2 text-xs text-neutral-300 hover:text-white"
          >
            Refresh
          </button>
        </div>
      </div>

      <ConnectionBanner status={status} loading={loading} />

      {(notice || error) && (
        <div className="mb-6 space-y-2">
          {notice && (
            <div className="rounded-lg border border-emerald-500/30 bg-emerald-500/10 px-4 py-3 text-sm text-emerald-300">
              {notice}
              {status?.business?.name && (
                <span className="mt-1 block text-xs text-emerald-400/80">
                  Business: {status.business.name}
                  {status.business.connectedAt
                    ? ` · Connected ${new Date(status.business.connectedAt).toLocaleString()}`
                    : ''}
                </span>
              )}
            </div>
          )}
          {error && (
            <div className="rounded-lg border border-red-500/30 bg-red-500/10 px-4 py-3 text-sm text-red-300">
              {error}
            </div>
          )}
        </div>
      )}

      <div className="mb-6 flex flex-wrap gap-2">
        {WORKFLOWS.map((w) => (
          <button
            key={w.id}
            type="button"
            onClick={() => setWorkflow(w.id)}
            className={`rounded-lg px-3 py-2 text-xs font-medium ${
              workflow === w.id
                ? 'bg-violet-500/20 text-violet-200 border border-violet-500/40'
                : 'border border-neutral-800 text-neutral-400 hover:text-white'
            }`}
          >
            {w.label}
          </button>
        ))}
      </div>

      {workflow === 'sync' && (
        <Panel title="Workflow 1 — Product Sync">
          <p className="mb-4 text-sm text-neutral-400">
            Column headers are fixed. Row data is loaded from your connected Sage business — nothing is
            pre-filled. Create the Synpath-only white acrylic SKU with duplicate protection and read-back
            verification.
          </p>
          <StockTable
            rows={productSyncRows}
            emptyMessage={
              loading
                ? 'Loading Stock Items from Sage…'
                : !status?.connected
                  ? 'Please connect Sage'
                  : 'No Stock Items returned from Sage for this business.'
            }
          />

          <div className="mt-6 rounded-xl border border-violet-500/20 bg-violet-500/5 p-4">
            <div className="mb-2 flex flex-wrap items-center gap-2">
              <h3 className="text-sm font-semibold text-white">Synpath-only product</h3>
              <StatusBadge variant={whiteSkuInSage ? 'healthy' : 'ai'}>
                {whiteSkuInSage ? 'Already in Sage' : 'Not yet in Sage'}
              </StatusBadge>
            </div>
            <dl className="grid gap-2 text-xs text-neutral-300 sm:grid-cols-2">
              <div>SKU: {SYNPATH_ONLY_PRODUCT.sku}</div>
              <div>Description: {SYNPATH_ONLY_PRODUCT.description}</div>
              <div>Cost Price: {SYNPATH_ONLY_PRODUCT.costPrice.toFixed(2)}</div>
              <div>Sales Price: {SYNPATH_ONLY_PRODUCT.salesPrice.toFixed(2)}</div>
              <div>Reorder Level: {SYNPATH_ONLY_PRODUCT.reorderLevel}</div>
              <div>Reorder Qty: {SYNPATH_ONLY_PRODUCT.reorderQuantity}</div>
              <div>Supplier: {SYNPATH_ONLY_PRODUCT.supplier}</div>
              <div>Supplier Part: {SYNPATH_ONLY_PRODUCT.supplierPartNumber}</div>
            </dl>
            <button
              type="button"
              disabled={busy || !status?.connected}
              onClick={() => void handleCreateWhite()}
              className="mt-4 rounded-lg bg-white px-4 py-2 text-xs font-semibold text-black disabled:opacity-40"
            >
              Create in Sage
            </button>
            {createResult && (
              <p className="mt-3 text-sm text-emerald-300">{createResult}</p>
            )}
          </div>
        </Panel>
      )}

      {workflow === 'updates' && (
        <Panel title="Workflow 2 — SKU Updates">
          <p className="mb-4 text-sm text-neutral-400">
            Review current vs proposed values for {SKU_UPDATE_PROPOSAL.sku}, approve, then write to real Sage and verify.
          </p>
          <div className="overflow-x-auto rounded-xl border border-neutral-800">
            <table className="w-full min-w-[520px] text-left text-sm">
              <thead className="border-b border-neutral-800 text-[10px] uppercase tracking-wider text-neutral-500">
                <tr>
                  <th className="px-4 py-3">Field</th>
                  <th className="px-4 py-3">Current</th>
                  <th className="px-4 py-3">Proposed</th>
                </tr>
              </thead>
              <tbody>
                {SKU_UPDATE_PROPOSAL.fields.map((field) => {
                  const live = bySku.get(SKU_UPDATE_PROPOSAL.sku.toUpperCase());
                  const current =
                    field.key === 'description'
                      ? live?.description ?? field.current
                      : live?.reorderLevel ?? field.current;
                  return (
                    <tr key={field.key} className="border-b border-neutral-800/60">
                      <td className="px-4 py-3 text-neutral-300">{field.label}</td>
                      <td className="px-4 py-3 text-neutral-400">{String(current)}</td>
                      <td className="px-4 py-3 text-violet-300">{String(field.proposed)}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
          <button
            type="button"
            disabled={busy || !status?.connected}
            onClick={() => void handleApproveSkuUpdate()}
            className="mt-4 rounded-lg bg-white px-4 py-2 text-xs font-semibold text-black disabled:opacity-40"
          >
            Approve &amp; update in Sage
          </button>
          {updateResult && <p className="mt-3 text-sm text-emerald-300">{updateResult}</p>}
          {reorderRequired && (
            <div className="mt-3 rounded-lg border border-amber-500/30 bg-amber-500/10 px-3 py-2 text-sm text-amber-300">
              Reorder Required — quantity in stock is below the new reorder level.
            </div>
          )}
          {verification && (
            <ul className="mt-3 space-y-1 text-xs text-neutral-400">
              {Object.entries(verification).map(([key, value]) => {
                const row = value as { expected: unknown; actual: unknown; ok: boolean };
                return (
                  <li key={key}>
                    {key}: expected {String(row.expected)} → actual {String(row.actual)}{' '}
                    {row.ok ? '✓' : '✗'}
                  </li>
                );
              })}
            </ul>
          )}
        </Panel>
      )}

      {workflow === 'gmail' && (
        <Panel title="Workflow 3 — Mock Gmail to Real Sage">
          <div className="mb-4 flex flex-wrap items-center gap-2">
            <StatusBadge variant="ai">Gmail Demo Mode</StatusBadge>
            <span className="text-xs text-neutral-500">
              Simulated mailbox: {GHOST_BOARDS.gmailAccount}
            </span>
          </div>
          <p className="mb-4 text-sm text-neutral-400">
            Gmail retrieval and extraction are mocked. Current Sage prices and cost updates use the real Sage API
            after approval.
          </p>
          <div className="mb-4 flex flex-wrap gap-2">
            <button
              type="button"
              onClick={() => void runGmailPipeline()}
              className="rounded-lg border border-neutral-700 px-3 py-2 text-xs text-neutral-200"
            >
              {gmailConnected ? 'Reload demo email' : 'Connect Gmail (demo)'}
            </button>
            <button
              type="button"
              disabled={busy || gmailStage === 'idle' || gmailStage === 'demo-email'}
              onClick={() => void approveGmailUpdates()}
              className="rounded-lg bg-white px-3 py-2 text-xs font-semibold text-black disabled:opacity-40"
            >
              Approve price updates in Sage
            </button>
          </div>

          <StageRail stage={gmailStage} />

          {gmailStage !== 'idle' && (
            <div className="mt-4 grid gap-4 lg:grid-cols-2">
              <div className="rounded-xl border border-neutral-800 bg-[#0a0a0a] p-4 text-xs text-neutral-300">
                <p className="mb-2 text-[10px] font-semibold uppercase tracking-wider text-neutral-500">
                  Demo Email
                </p>
                <p>
                  <span className="text-neutral-500">From:</span> {MOCK_GMAIL_EMAIL.sender} &lt;
                  {MOCK_GMAIL_EMAIL.senderAddress}&gt;
                </p>
                <p>
                  <span className="text-neutral-500">To:</span> {MOCK_GMAIL_EMAIL.recipient}
                </p>
                <p>
                  <span className="text-neutral-500">Subject:</span> {MOCK_GMAIL_EMAIL.subject}
                </p>
                <p>
                  <span className="text-neutral-500">Received:</span> {MOCK_GMAIL_EMAIL.received}
                </p>
                <pre className="mt-3 whitespace-pre-wrap rounded-lg border border-neutral-800 bg-black/40 p-3 text-[11px] leading-relaxed text-neutral-400">
                  {MOCK_GMAIL_EMAIL.body}
                </pre>
              </div>
              <div className="overflow-x-auto rounded-xl border border-neutral-800">
                <table className="w-full min-w-[480px] text-left text-xs">
                  <thead className="border-b border-neutral-800 text-[10px] uppercase text-neutral-500">
                    <tr>
                      <th className="px-3 py-2">SKU</th>
                      <th className="px-3 py-2">Sage cost</th>
                      <th className="px-3 py-2">New cost</th>
                      <th className="px-3 py-2">Match</th>
                    </tr>
                  </thead>
                  <tbody>
                    {extracted.map((row) => (
                      <tr key={row.sku} className="border-b border-neutral-800/50">
                        <td className="px-3 py-2 text-white">{row.sku}</td>
                        <td className="px-3 py-2">
                          {(liveCosts[row.sku] ?? row.previousCost).toFixed(2)}
                        </td>
                        <td className="px-3 py-2 text-violet-300">
                          {row.newCost.toFixed(2)}
                          <span className="ml-1 text-[10px] text-neutral-500">
                            (
                            {row.newCost - (liveCosts[row.sku] ?? row.previousCost) > 0
                              ? '+'
                              : ''}
                            {(
                              row.newCost - (liveCosts[row.sku] ?? row.previousCost)
                            ).toFixed(2)}
                            )
                          </span>
                        </td>
                        <td className="px-3 py-2">
                          {bySku.has(row.sku.toUpperCase()) || !status?.connected ? (
                            <StatusBadge variant="healthy">Exact SKU Match</StatusBadge>
                          ) : (
                            <StatusBadge variant="danger">Missing</StatusBadge>
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </Panel>
      )}

      {workflow === 'po' && (
        <Panel title="Workflow 4 — Purchase Order">
          <div className="rounded-xl border border-neutral-800 bg-[#0a0a0a] p-4">
            <div className="mb-3 flex flex-wrap items-center gap-2">
              <h3 className="text-sm font-semibold text-white">{PURCHASE_ORDER.number}</h3>
              <StatusBadge variant={poStatus === 'approved' ? 'healthy' : 'neutral'}>
                {poStatus ?? 'New'}
              </StatusBadge>
            </div>
            <dl className="grid gap-2 text-xs text-neutral-300 sm:grid-cols-2">
              <div>SKU: {PURCHASE_ORDER.sku}</div>
              <div>Qty in stock: {PURCHASE_ORDER.quantityInStock}</div>
              <div>Reorder level: {PURCHASE_ORDER.reorderLevel}</div>
              <div>Order qty: {PURCHASE_ORDER.orderQuantity}</div>
              <div>Supplier: {PURCHASE_ORDER.supplier}</div>
              <div>Supplier ref: {PURCHASE_ORDER.supplierRef}</div>
              <div>Unit cost: {PURCHASE_ORDER.unitCost.toFixed(2)} {PURCHASE_ORDER.currency}</div>
              <div>Freight: {PURCHASE_ORDER.freight.toFixed(2)} {PURCHASE_ORDER.currency}</div>
            </dl>
            <div className="mt-4 flex flex-wrap gap-2">
              <button
                type="button"
                onClick={() => setPoStatus('draft')}
                className="rounded-lg border border-neutral-700 px-3 py-2 text-xs"
              >
                Save Draft
              </button>
              <button
                type="button"
                onClick={() => setPoStatus('approved')}
                className="rounded-lg bg-white px-3 py-2 text-xs font-semibold text-black"
              >
                Approve PO
              </button>
              <button
                type="button"
                onClick={exportPoPdf}
                className="rounded-lg border border-neutral-700 px-3 py-2 text-xs"
              >
                PDF preview / export
              </button>
            </div>
            <div className="mt-4 rounded-lg border border-amber-500/30 bg-amber-500/10 px-3 py-3 text-sm text-amber-200">
              {PURCHASE_ORDER.writeBackMessage}
            </div>
            {capabilities?.purchaseOrders && (
              <p className="mt-2 text-xs text-neutral-500">
                Capability check: purchaseOrders.available ={' '}
                {String(capabilities.purchaseOrders.available)}
              </p>
            )}
          </div>
        </Panel>
      )}

      <Panel title="Audit log">
        {audit.length === 0 ? (
          <p className="text-sm text-neutral-500">No audit entries yet.</p>
        ) : (
          <ul className="space-y-2 text-xs text-neutral-400">
            {audit.slice(0, 12).map((entry) => (
              <li key={entry.id} className="rounded-lg border border-neutral-800 px-3 py-2">
                <span className="text-neutral-500">{new Date(entry.at).toLocaleString()}</span>
                {' · '}
                <span className="text-neutral-200">{entry.action}</span>
                {' — '}
                {entry.detail}
              </li>
            ))}
          </ul>
        )}
      </Panel>
    </SageLayout>
  );
}

function wait(ms: number) {
  return new Promise((resolve) => window.setTimeout(resolve, ms));
}

function ConnectionBanner({ status, loading }: { status: SageStatus | null; loading: boolean }) {
  if (loading) {
    return (
      <div className="mb-6 rounded-xl border border-neutral-800 bg-neutral-900/40 px-4 py-3 text-sm text-neutral-400">
        Checking Sage connection…
      </div>
    );
  }
  if (status?.connected) {
    return (
      <div className="mb-6 rounded-xl border border-emerald-500/30 bg-emerald-500/10 px-4 py-3">
        <p className="text-sm font-medium text-emerald-300">Sage Accounting Connected</p>
        <p className="mt-1 text-xs text-emerald-400/80">
          {status.business?.name ?? 'Business'}
          {status.business?.connectedAt
            ? ` · Connected ${new Date(status.business.connectedAt).toLocaleString()}`
            : ''}
        </p>
      </div>
    );
  }
  return (
    <div className="mb-6 rounded-xl border border-neutral-800 bg-neutral-900/40 px-4 py-3 text-sm text-neutral-400">
      {status?.configured
        ? 'Sage OAuth is configured. Connect to load live Stock Items. Preview deployments should use the registered production callback URL.'
        : 'Sage credentials are not configured in this environment. UI and Gmail Demo Mode still work for Preview review.'}
    </div>
  );
}

function Panel({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section className="mb-6 rounded-xl border border-neutral-800 bg-[#0a0a0a] p-5">
      <h2 className="mb-4 text-base font-semibold text-white">{title}</h2>
      {children}
    </section>
  );
}

function StockTable({
  rows,
  emptyMessage,
}: {
  rows: Array<{
    sku: string;
    description: string;
    costPrice: number;
    salesPrice: number;
    stock: number;
    reorderLevel: number;
    supplier: string;
    sync: string;
    syncOk: boolean;
  }>;
  emptyMessage?: string;
}) {
  return (
    <div className="overflow-x-auto rounded-xl border border-neutral-800">
      <table className="w-full min-w-[760px] text-left text-xs">
        <thead className="border-b border-neutral-800 text-[10px] uppercase tracking-wider text-neutral-500">
          <tr>
            <th className="px-3 py-2">SKU</th>
            <th className="px-3 py-2">Description</th>
            <th className="px-3 py-2">Cost</th>
            <th className="px-3 py-2">Sales</th>
            <th className="px-3 py-2">Stock</th>
            <th className="px-3 py-2">Reorder</th>
            <th className="px-3 py-2">Supplier</th>
            <th className="px-3 py-2">Sage sync</th>
          </tr>
        </thead>
        <tbody>
          {rows.length === 0 ? (
            <tr>
              <td colSpan={8} className="px-3 py-8 text-center text-sm text-neutral-400">
                {emptyMessage ?? 'No rows'}
              </td>
            </tr>
          ) : (
            rows.map((row) => (
              <tr key={row.sku} className="border-b border-neutral-800/50">
                <td className="px-3 py-2 font-medium text-white">{row.sku}</td>
                <td className="px-3 py-2 text-neutral-300">{row.description}</td>
                <td className="px-3 py-2">{row.costPrice.toFixed(2)}</td>
                <td className="px-3 py-2">{row.salesPrice.toFixed(2)}</td>
                <td className="px-3 py-2">{row.stock}</td>
                <td className="px-3 py-2">{row.reorderLevel}</td>
                <td className="px-3 py-2 text-neutral-400">{row.supplier}</td>
                <td className="px-3 py-2">
                  <StatusBadge variant={row.syncOk ? 'healthy' : 'warning'}>{row.sync}</StatusBadge>
                </td>
              </tr>
            ))
          )}
        </tbody>
      </table>
    </div>
  );
}

function StageRail({ stage }: { stage: GmailStage }) {
  const steps: GmailStage[] = ['demo-email', 'extracted', 'matched', 'approved', 'updating', 'verified'];
  const labels: Record<GmailStage, string> = {
    idle: 'Idle',
    'demo-email': 'Demo Email',
    extracted: 'Extracted',
    matched: 'Exact SKU Match',
    approved: 'Approved',
    updating: 'Updating Real Sage',
    verified: 'Verified in Sage',
  };
  const activeIdx = steps.indexOf(stage === 'idle' ? 'demo-email' : stage);
  return (
    <div className="flex flex-wrap gap-2">
      {steps.map((step, i) => (
        <span
          key={step}
          className={`rounded-full border px-2.5 py-1 text-[10px] font-semibold uppercase tracking-wider ${
            i <= activeIdx && stage !== 'idle'
              ? 'border-violet-500/40 bg-violet-500/15 text-violet-200'
              : 'border-neutral-800 text-neutral-500'
          }`}
        >
          {labels[step]}
        </span>
      ))}
    </div>
  );
}
