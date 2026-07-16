import { useCallback, useEffect, useState, type ReactNode } from 'react';
import { useSearchParams } from 'react-router-dom';
import type { DemoRunRecord } from '../../shared/demoRun';
import type { WorkflowPreview, WorkflowRun } from '../../shared/workflow';
import { ConfirmModal } from '../components/sage/cfo/ConfirmModal';
import { WorkflowOneWorkspace } from '../components/sage/cfo/WorkflowOneWorkspace';
import {
  PO_REFERENCE,
  accountingReady,
  friendlyError,
  inventoryAvailability,
  matchedSkuCount,
  money,
  purchaseInvoiceRecord,
  purchaseWorkflowComplete,
  salesBlockedReason,
  salesInvoiceRecord,
  salesWorkflowComplete,
  stockMovementRecords,
} from '../components/sage/cfo/helpers';
import { SageLayout } from '../components/sage/SageLayout';
import {
  fetchDemoRun,
  postDemoPurchase,
  postDemoSales,
  prepareDemoRun,
  resetDemoRun,
} from '../lib/demoRunApi';
import {
  disconnectSage,
  fetchSageStatus,
  type SageStatus,
} from '../lib/sageApi';
import {
  createWorkflowPreview,
  disconnectGmail,
  fetchGmailStatus,
  resetWorkflow,
  syncGmail,
  type GmailStatus,
  type PreviewRequest,
} from '../lib/workflowApi';

const GMAIL_QUERY = `${PO_REFERENCE} OR GHOACRUGOL051926 has:attachment`;

type WorkflowKey = 'scan' | 'purchase' | 'sales' | 'reset' | null;
type WorkflowTab = 'extract' | 'purchase' | 'sales';

type BeforeAfterRow = {
  sku: string;
  previousQuantity: number;
  newQuantity: number;
  previousCost: number;
  newLandedCost: number;
};

function ConnectionCard({
  title,
  connected,
  detail,
  busy,
  onConnectHref,
  onDisconnect,
}: {
  title: string;
  connected: boolean;
  detail?: string;
  busy: boolean;
  onConnectHref: string;
  onDisconnect: () => void;
}) {
  return (
    <section className="rounded-2xl border border-neutral-800 bg-[#0a0a0a] p-5">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 className="font-display text-lg font-semibold text-white">{title}</h2>
          <p className="mt-2 text-sm text-neutral-400">
            Status:{' '}
            <span className={connected ? 'text-emerald-300' : 'text-neutral-300'}>
              {connected ? 'Connected' : 'Not Connected'}
            </span>
          </p>
          {connected && detail ? (
            <p className="mt-1 text-sm text-neutral-300">{detail}</p>
          ) : null}
        </div>
        {connected ? (
          <button
            type="button"
            disabled={busy}
            onClick={onDisconnect}
            className="rounded-lg border border-neutral-600 px-4 py-2.5 text-sm font-medium text-neutral-200 disabled:opacity-40"
          >
            Disconnect {title}
          </button>
        ) : (
          <a
            href={onConnectHref}
            className="rounded-lg bg-white px-4 py-2.5 text-sm font-semibold text-black"
          >
            Connect {title}
          </a>
        )}
      </div>
    </section>
  );
}

function WorkflowCard({
  title,
  description,
  children,
}: {
  title: string;
  description: string;
  children: ReactNode;
}) {
  return (
    <section className="rounded-2xl border border-neutral-800 bg-[#0a0a0a] p-5 sm:p-6">
      <h2 className="font-display text-lg font-semibold text-white">{title}</h2>
      <p className="mt-2 max-w-3xl text-sm text-neutral-400">{description}</p>
      <div className="mt-5">{children}</div>
    </section>
  );
}

function SummaryLine({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-baseline justify-between gap-4 border-b border-neutral-800/80 py-2 text-sm last:border-b-0">
      <span className="text-neutral-500">{label}</span>
      <span className="font-medium text-white">{value}</span>
    </div>
  );
}

function missingItems(preview: WorkflowPreview): string[] {
  const missing: string[] = [];
  const unmatched = preview.bundle.shipment.lines.filter(
    (line) => line.matchingStatus !== 'exact' && line.matchingStatus !== 'confirmed',
  );
  if (unmatched.length) missing.push(`Unmatched SKUs: ${unmatched.map((l) => l.sku).join(', ')}`);
  if (!preview.reconciliation.withinTolerance) missing.push('Landed-cost totals do not reconcile');
  if (preview.bundle.shipment.lines.some((line) => line.receivedQuantity <= 0)) {
    missing.push('Invalid received quantities');
  }
  return missing;
}

function customerInvoiceReady(preview: WorkflowPreview | null): boolean {
  if (!preview) return false;
  const invoice = preview.bundle.customerInvoice;
  const customerMatched = Boolean(
    invoice.matchedSageContactId || preview.selections.customerContactId,
  );
  return Boolean(
    invoice.sourceInvoiceNumber &&
      customerMatched &&
      invoice.lines.length > 0 &&
      invoice.lines.every((line) => line.matchedSageStockItemId),
  );
}

function demoHasSageWrites(demoRun: DemoRunRecord | null) {
  if (!demoRun) return false;
  return demoRun.transactions.some(
    (tx) =>
      tx.status === 'succeeded' &&
      (tx.type === 'purchase_invoice' ||
        tx.type === 'stock_movement' ||
        tx.type === 'sales_invoice' ||
        tx.type === 'stock_item_cost_update'),
  );
}

export function SageIntegrationPage() {
  const [params] = useSearchParams();
  const [sageStatus, setSageStatus] = useState<SageStatus | null>(null);
  const [gmailStatus, setGmailStatus] = useState<GmailStatus | null>(null);
  const [useLiveGmail, setUseLiveGmail] = useState(false);
  const [preview, setPreview] = useState<WorkflowPreview | null>(null);
  const [demoRun, setDemoRun] = useState<DemoRunRecord | null>(null);
  const [beforeAfter, setBeforeAfter] = useState<BeforeAfterRow[]>([]);
  const [baselinePreview, setBaselinePreview] = useState<
    Array<{ sku: string; quantityInStock: number; costPrice: number }>
  >([]);
  const [messageIds, setMessageIds] = useState<string[]>([]);
  const [scanDone, setScanDone] = useState(false);
  const [workflowTab, setWorkflowTab] = useState<WorkflowTab>('extract');
  const [busy, setBusy] = useState(false);
  const [activeWorkflow, setActiveWorkflow] = useState<WorkflowKey>(null);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [resetRequested, setResetRequested] = useState(false);
  const [confirmPurchase, setConfirmPurchase] = useState(false);
  const [confirmSales, setConfirmSales] = useState(false);
  const [confirmReset, setConfirmReset] = useState(false);
  const [resetTyped, setResetTyped] = useState('');

  const refreshConnections = useCallback(async () => {
    const [sage, gmail, demo] = await Promise.all([
      fetchSageStatus().catch(() => null),
      fetchGmailStatus().catch(() => null),
      fetchDemoRun().catch(() => ({ run: null })),
    ]);
    setSageStatus(sage);
    setGmailStatus(gmail);
    setDemoRun(demo.run);
  }, []);

  useEffect(() => {
    void refreshConnections();
  }, [refreshConnections]);

  useEffect(() => {
    if (params.get('connected') === 'true') {
      void refreshConnections().then(() => {
        if (resetRequested) {
          setConfirmReset(true);
        }
      });
    }
    if (params.get('gmail') === 'connected') void refreshConnections();
    if (params.get('gmail') === 'failed') {
      setError('Gmail connection failed. Please try again.');
    }
  }, [params, refreshConnections, resetRequested]);

  const buildRequest = useCallback((): PreviewRequest => {
    const sageConnected = Boolean(sageStatus?.connected);
    return {
      mode: sageConnected ? 'live_sage_write' : useLiveGmail ? 'gmail_dry_run' : 'fixture_dry_run',
      sourceType: useLiveGmail ? 'gmail' : 'fixture',
      searchQuery: GMAIL_QUERY,
      messageIds: useLiveGmail ? messageIds : undefined,
      inventoryPostingStrategy: 'stock_movement',
      selections: {
        ...(preview?.selections ?? {}),
        accountingMappingConfirmed: true,
      },
    };
  }, [messageIds, preview?.selections, sageStatus?.connected, useLiveGmail]);

  const clearUnpostedWorkflow = useCallback(async () => {
    setPreview(null);
    setScanDone(false);
    setMessageIds([]);
    setBeforeAfter([]);
    setBaselinePreview([]);
    setError(null);
    await resetWorkflow().catch(() => undefined);
  }, []);

  const handleDataSourceToggle = async (next: boolean) => {
    if (demoHasSageWrites(demoRun) && demoRun?.status !== 'reset_complete') {
      setError('Reset the current demo before changing the data source.');
      return;
    }
    setUseLiveGmail(next);
    await clearUnpostedWorkflow();
  };

  const handleDisconnectSage = async () => {
    setBusy(true);
    setError(null);
    try {
      await disconnectSage();
      await refreshConnections();
    } catch (err) {
      setError(friendlyError(err instanceof Error ? err.message : 'Could not disconnect Sage'));
    } finally {
      setBusy(false);
    }
  };

  const handleDisconnectGmail = async () => {
    setBusy(true);
    setError(null);
    try {
      await disconnectGmail();
      if (useLiveGmail) await clearUnpostedWorkflow();
      await refreshConnections();
    } catch (err) {
      setError(friendlyError(err instanceof Error ? err.message : 'Could not disconnect Gmail'));
    } finally {
      setBusy(false);
    }
  };

  const handleWorkflow1 = async () => {
    if (useLiveGmail && !gmailStatus?.connected) {
      setError('Connect Gmail');
      return;
    }
    setBusy(true);
    setActiveWorkflow('scan');
    setError(null);
    setNotice(null);
    try {
      let ids: string[] = [];
      if (useLiveGmail) {
        const sync = await syncGmail(GMAIL_QUERY);
        ids = sync.messages.map((message) => message.gmailMessageId);
        setMessageIds(ids);
        if (!ids.length) {
          setScanDone(false);
          setPreview(null);
          setError(
            'Additional information is required before continuing. No emails found for PO#GHOACRUGOL051926.',
          );
          return;
        }
      }

      const request: PreviewRequest = {
        mode: sageStatus?.connected
          ? 'live_sage_write'
          : useLiveGmail
            ? 'gmail_dry_run'
            : 'fixture_dry_run',
        sourceType: useLiveGmail ? 'gmail' : 'fixture',
        searchQuery: GMAIL_QUERY,
        messageIds: useLiveGmail ? ids : undefined,
        inventoryPostingStrategy: 'stock_movement',
        selections: { accountingMappingConfirmed: true },
      };

      let result = await createWorkflowPreview(request);
      if (accountingReady(result) && !result.selections.accountingMappingConfirmed) {
        result = await createWorkflowPreview({
          ...request,
          selections: { ...result.selections, accountingMappingConfirmed: true },
        });
      }
      setPreview(result);

      const missing = missingItems(result);
      if (missing.length) {
        setScanDone(false);
        setError(
          `Additional information is required before continuing. ${missing.join('; ')}.`,
        );
        return;
      }

      if (sageStatus?.connected) {
        const prepared = await prepareDemoRun({
          ...request,
          selections: { ...result.selections, accountingMappingConfirmed: true },
        });
        setBaselinePreview(
          prepared.stockItems
            .filter((item) => item.exists)
            .map((item) => ({
              sku: item.sku,
              quantityInStock: item.quantityInStock,
              costPrice: item.costPrice,
            })),
        );
        if (prepared.missingSkus.length) {
          setScanDone(false);
          setError(
            `The following SKU must be prepared in Sage before continuing. ${prepared.missingSkus.join(', ')}. Use Reset Demo to create the baseline products.`,
          );
          return;
        }
      }

      setScanDone(true);
    } catch (err) {
      setScanDone(false);
      setError(
        friendlyError(
          err instanceof Error ? err.message : 'Could not prepare purchase data',
        ),
      );
    } finally {
      setActiveWorkflow(null);
      setBusy(false);
    }
  };

  const runPurchase = async () => {
    if (!preview || !sageStatus?.connected) return;
    setConfirmPurchase(false);
    setBusy(true);
    setActiveWorkflow('purchase');
    setError(null);
    try {
      const unmatched = preview.bundle.shipment.lines
        .filter((line) => line.matchingStatus !== 'exact' && line.matchingStatus !== 'confirmed')
        .map((line) => line.sku);
      if (unmatched.length) {
        throw Object.assign(
          new Error('The following SKU must be prepared in Sage before continuing.'),
          { missingSkus: unmatched },
        );
      }

      const result = await postDemoPurchase(buildRequest());
      setDemoRun(result.demoRun);
      setBeforeAfter(result.beforeAfter);
      // Refresh full preview so live Sage stock/customer matches are current for Workflow 3.
      const refreshed = await createWorkflowPreview(buildRequest()).catch(() => null);
      if (refreshed) {
        setPreview({ ...refreshed, run: result.run });
      } else {
        setPreview((current) => (current ? { ...current, run: result.run } : current));
      }
      if (result.partial) {
        setError(
          'Partial Completion. Some inventory records need attention. Successful Sage IDs were preserved.',
        );
      } else {
        setWorkflowTab('sales');
      }
      if (resetRequested) {
        setConfirmReset(true);
      }
    } catch (err) {
      const failed = err as Error & {
        missingSkus?: string[];
        demoRun?: DemoRunRecord;
        run?: WorkflowRun;
        partial?: boolean;
      };
      if (failed.demoRun) setDemoRun(failed.demoRun);
      if (failed.run) {
        setPreview((current) => (current ? { ...current, run: failed.run! } : current));
      }
      const missingSkus = failed.missingSkus;
      if (missingSkus?.length) {
        setError(
          `The following SKU must be prepared in Sage before continuing. ${missingSkus.join(', ')}`,
        );
      } else {
        setError(
          friendlyError(failed instanceof Error ? failed.message : 'Could not create purchase records'),
        );
      }
      if (resetRequested) setConfirmReset(true);
    } finally {
      setActiveWorkflow(null);
      setBusy(false);
    }
  };

  const runSales = async () => {
    if (!preview || !sageStatus?.connected) return;
    setConfirmSales(false);
    setBusy(true);
    setActiveWorkflow('sales');
    setError(null);
    try {
      const result = await postDemoSales(buildRequest());
      setDemoRun(result.demoRun);
      setPreview((current) => (current ? { ...current, run: result.run } : current));
      if (resetRequested) setConfirmReset(true);
    } catch (err) {
      setError(
        friendlyError(err instanceof Error ? err.message : 'Could not create Sales Invoice'),
      );
      if (resetRequested) setConfirmReset(true);
    } finally {
      setActiveWorkflow(null);
      setBusy(false);
    }
  };

  const runReset = async () => {
    if (resetTyped !== 'RESET') return;
    if (busy && activeWorkflow && activeWorkflow !== 'reset') {
      setResetRequested(true);
      setConfirmReset(false);
      setNotice('Reset requested. Cleanup will start after the current Sage request finishes.');
      return;
    }
    if (!sageStatus?.connected) {
      setResetRequested(true);
      setConfirmReset(false);
      setError('Connect Sage to restore the demo baseline.');
      return;
    }

    setConfirmReset(false);
    setBusy(true);
    setActiveWorkflow('reset');
    setError(null);
    setNotice(null);
    try {
      const result = await resetDemoRun('RESET', demoRun?.id);
      setDemoRun(result.demoRun);
      setResetRequested(false);
      await clearUnpostedWorkflow();
      setWorkflowTab('extract');
      if (result.message === 'Demo Baseline Ready') {
        setNotice('Demo Baseline Ready');
        setBeforeAfter([]);
      } else {
        setError(
          result.unresolved?.length
            ? `Reset Requires Review. ${result.unresolved.join('; ')}`
            : 'Reset Requires Review',
        );
      }
      await refreshConnections();
    } catch (err) {
      const needsSage = (err as { needsSage?: boolean }).needsSage;
      if (needsSage) {
        setResetRequested(true);
        setError('Connect Sage to restore the demo baseline.');
      } else {
        const unresolved = (err as { unresolved?: string[] }).unresolved;
        setError(
          unresolved?.length
            ? `Reset Requires Review. ${unresolved.join('; ')}`
            : friendlyError(err instanceof Error ? err.message : 'Demo reset failed'),
        );
      }
    } finally {
      setResetTyped('');
      setActiveWorkflow(null);
      setBusy(false);
    }
  };

  const handleResetClick = () => {
    if (busy && activeWorkflow && activeWorkflow !== 'reset') {
      setResetRequested(true);
      setNotice('Reset requested. Cleanup will start after the current Sage request finishes.');
      return;
    }
    if (!sageStatus?.connected) {
      setResetRequested(true);
      setError('Connect Sage to restore the demo baseline.');
      return;
    }
    setResetTyped('');
    setConfirmReset(true);
  };

  const sageConnected = Boolean(sageStatus?.connected);
  const gmailConnected = Boolean(gmailStatus?.connected);
  const currency = preview?.bundle.shipment.currency || 'GBP';
  const purchaseDone = preview ? purchaseWorkflowComplete(preview.run) : false;
  const salesDone = preview ? salesWorkflowComplete(preview.run) : false;
  const allDone = purchaseDone && salesDone && scanDone;
  const customerFound = customerInvoiceReady(preview);
  const totalUnits =
    preview?.bundle.shipment.lines.reduce((sum, line) => sum + line.receivedQuantity, 0) ?? 0;
  const purchaseRecord = preview ? purchaseInvoiceRecord(preview.run) : undefined;
  const movementRecords = preview
    ? stockMovementRecords(preview.run).filter((record) => record.status === 'succeeded')
    : [];
  const salesRecord = preview ? salesInvoiceRecord(preview.run) : undefined;
  const purchasePartial =
    Boolean(preview) &&
    Boolean(purchaseRecord?.status === 'succeeded') &&
    !purchaseDone &&
    stockMovementRecords(preview!.run).some((record) => record.status === 'failed');

  const workflowActionsDisabled = resetRequested && !sageConnected;

  const canPurchase =
    sageConnected &&
    scanDone &&
    preview !== null &&
    matchedSkuCount(preview) === preview.bundle.shipment.lines.length &&
    preview.reconciliation.withinTolerance &&
    Boolean(preview.selections.supplierContactId) &&
    !purchaseDone &&
    !busy &&
    !workflowActionsDisabled;

  const purchaseBlockReason = !scanDone
    ? 'Complete Workflow 1 before creating purchase and inventory records.'
    : !purchaseDone && !canPurchase && preview
      ? !sageConnected
        ? 'Connect Sage before creating the Purchase Invoice.'
        : !preview.selections.supplierContactId
          ? `Supplier "${preview.bundle.shipment.supplier}" was not matched in Sage.`
          : null
      : null;

  const canSales =
    sageConnected &&
    scanDone &&
    purchaseDone &&
    customerInvoiceReady(preview) &&
    preview !== null &&
    inventoryAvailability(preview) === 'available' &&
    !salesDone &&
    !busy &&
    !workflowActionsDisabled;

  const salesBlockReason =
    purchaseDone && !salesDone && !canSales ? salesBlockedReason(preview) : null;

  const canWorkflow1 =
    !busy &&
    !workflowActionsDisabled &&
    (useLiveGmail ? gmailConnected : true);

  const purchaseTx = demoRun?.transactions.find(
    (tx) => tx.type === 'purchase_invoice' && tx.status === 'succeeded',
  );
  const movementCount =
    demoRun?.transactions.filter(
      (tx) => tx.type === 'stock_movement' && tx.status === 'succeeded',
    ).length ?? movementRecords.length;
  const salesTx = demoRun?.transactions.find(
    (tx) => tx.type === 'sales_invoice' && ['succeeded', 'voided'].includes(tx.status),
  );

  return (
    <SageLayout>
      <header className="mb-8 flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="font-display text-2xl font-semibold tracking-tight text-white sm:text-3xl">
            Ghostboards Demo
          </h1>
          <p className="mt-2 text-sm text-neutral-400">
            PO#GHOACRUGOL051926 — Purchase, Inventory &amp; Sales Automation
          </p>
        </div>
        <button
          type="button"
          onClick={handleResetClick}
          className="rounded-lg border border-neutral-800 px-3 py-1.5 text-xs text-neutral-500 hover:border-neutral-700 hover:text-neutral-300"
        >
          Reset Demo
        </button>
      </header>

      <div className="mb-6 grid gap-4 md:grid-cols-2">
        <ConnectionCard
          title="Sage"
          connected={sageConnected}
          detail={sageStatus?.business?.name}
          busy={busy}
          onConnectHref="/api/integrations/sage/connect"
          onDisconnect={() => void handleDisconnectSage()}
        />
        <ConnectionCard
          title="Gmail"
          connected={gmailConnected}
          detail={gmailStatus?.emailAddress}
          busy={busy}
          onConnectHref="/api/gmail/oauth/connect"
          onDisconnect={() => void handleDisconnectGmail()}
        />
      </div>

      <section className="mb-8 flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-neutral-800 bg-[#0a0a0a] px-5 py-4">
        <div>
          <p className="text-sm font-medium text-white">Use Live Gmail Data</p>
          <p className="mt-1 text-xs text-neutral-500">
            {useLiveGmail ? 'ON — Live Gmail' : 'OFF — Demo Data'}
          </p>
        </div>
        <button
          type="button"
          role="switch"
          aria-checked={useLiveGmail}
          disabled={busy}
          onClick={() => void handleDataSourceToggle(!useLiveGmail)}
          className={`relative h-7 w-12 rounded-full transition-colors ${
            useLiveGmail ? 'bg-emerald-500' : 'bg-neutral-700'
          } disabled:opacity-40`}
        >
          <span
            className={`absolute top-0.5 h-6 w-6 rounded-full bg-white transition-transform ${
              useLiveGmail ? 'translate-x-5' : 'translate-x-0.5'
            }`}
          />
        </button>
      </section>

      <p className="mb-6 text-xs text-neutral-500">
        Workflows 2 and 3 create real records in the connected Sage account.
      </p>

      {notice && (
        <div className="mb-6 rounded-xl border border-emerald-500/30 bg-emerald-500/10 px-4 py-3 text-sm text-emerald-100">
          {notice}
          {notice === 'Demo Baseline Ready' && (
            <ul className="mt-2 space-y-1 text-emerald-100/90">
              <li>Demo products ready</li>
              <li>Inventory restored</li>
              <li>Costs restored</li>
              <li>Previous Demo transactions reconciled</li>
              <li>Ready to run</li>
            </ul>
          )}
        </div>
      )}

      {error && (
        <div className="mb-6 rounded-xl border border-amber-500/30 bg-amber-500/10 px-4 py-3 text-sm text-amber-100">
          {error}
          {error.includes('Connect Sage') && (
            <a
              href="/api/integrations/sage/connect"
              className="ml-2 underline"
            >
              Connect Sage
            </a>
          )}
          {error === 'Connect Gmail' && (
            <a href="/api/gmail/oauth/connect" className="ml-2 underline">
              Connect Gmail
            </a>
          )}
        </div>
      )}

      {allDone && preview && (
        <section className="mb-8 rounded-2xl border border-emerald-500/30 bg-emerald-500/10 p-5">
          <h2 className="font-display text-xl font-semibold text-emerald-100">
            PO#GHOACRUGOL051926 Completed
          </h2>
          <ul className="mt-3 space-y-1 text-sm text-emerald-100/90">
            <li>Landed costs calculated</li>
            <li>Purchase and inventory records created in Sage</li>
            <li>Sales Invoice created in Sage</li>
          </ul>
          <div className="mt-4 space-y-1">
            <SummaryLine
              label="Purchase Invoice ID"
              value={purchaseTx?.sageTransactionId ?? purchaseRecord?.sageTransactionId ?? '—'}
            />
            <SummaryLine label="Stock Movements" value={String(movementCount)} />
            <SummaryLine
              label="Sales Invoice ID"
              value={salesTx?.sageTransactionId ?? salesRecord?.sageTransactionId ?? '—'}
            />
          </div>
        </section>
      )}

      <nav className="mb-5 grid overflow-hidden rounded-2xl border border-neutral-800 bg-[#0a0a0a] sm:grid-cols-3">
        {[
          {
            id: 'extract' as const,
            number: '01',
            title: 'Extract & Calculate',
            detail: scanDone ? 'Ready' : 'Source documents',
            complete: scanDone,
          },
          {
            id: 'purchase' as const,
            number: '02',
            title: 'Purchase & Inventory',
            detail: purchaseDone ? 'Created in Sage' : scanDone ? 'Ready to create' : 'Waiting',
            complete: purchaseDone,
          },
          {
            id: 'sales' as const,
            number: '03',
            title: 'Sales Invoice',
            detail: salesDone ? 'Created in Sage' : purchaseDone ? 'Ready to create' : 'Waiting',
            complete: salesDone,
          },
        ].map((tab, index) => {
          const active = workflowTab === tab.id;
          return (
            <button
              key={tab.id}
              type="button"
              onClick={() => setWorkflowTab(tab.id)}
              className={`relative flex items-center gap-3 px-5 py-4 text-left transition ${
                index > 0 ? 'border-t border-neutral-800 sm:border-l sm:border-t-0' : ''
              } ${
                active
                  ? 'bg-violet-500/10'
                  : 'bg-transparent hover:bg-neutral-900/70'
              }`}
            >
              <span
                className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-full border text-xs font-semibold ${
                  tab.complete
                    ? 'border-emerald-500/30 bg-emerald-500/10 text-emerald-300'
                    : active
                      ? 'border-violet-500/40 bg-violet-500/10 text-violet-200'
                      : 'border-neutral-800 text-neutral-600'
                }`}
              >
                {tab.complete ? '✓' : tab.number}
              </span>
              <span className="min-w-0">
                <span className={`block text-sm font-medium ${active ? 'text-white' : 'text-neutral-300'}`}>
                  {tab.title}
                </span>
                <span
                  className={`mt-0.5 block text-xs ${
                    tab.complete ? 'text-emerald-300' : 'text-neutral-600'
                  }`}
                >
                  {tab.detail}
                </span>
              </span>
              {active && <span className="absolute inset-x-5 bottom-0 h-px bg-violet-400" />}
            </button>
          );
        })}
      </nav>

      {workflowTab === 'extract' && (
        <WorkflowOneWorkspace
          preview={preview}
          loading={activeWorkflow === 'scan'}
          ready={scanDone && customerFound}
          useLiveGmail={useLiveGmail}
          canStart={canWorkflow1}
          onStart={() => void handleWorkflow1()}
        />
      )}

      {workflowTab === 'purchase' && (
        <WorkflowCard
          title="Create Purchase & Inventory Records in Sage"
          description="Create the Purchase Invoice and update inventory using the approved quantity and calculated landed cost."
        >
          {scanDone && baselinePreview.length > 0 && !purchaseDone && (
            <div className="mb-4 max-w-lg rounded-xl border border-neutral-800 bg-black/30 px-4 py-2">
              <p className="mb-2 text-xs uppercase tracking-wide text-neutral-500">
                Current Sage inventory
              </p>
              {baselinePreview.map((item) => (
                <div key={item.sku}>
                  <SummaryLine
                    label={item.sku}
                    value={`Qty ${item.quantityInStock} · Cost ${money(item.costPrice, currency)}`}
                  />
                </div>
              ))}
            </div>
          )}
          {activeWorkflow === 'purchase' ? (
            <p className="text-sm text-neutral-300">
              Creating purchase and inventory records in Sage…
            </p>
          ) : purchaseDone && preview ? (
            <div className="space-y-3">
              <p className="text-base font-medium text-emerald-300">
                Purchase &amp; Inventory Created in Sage
              </p>
              {beforeAfter.length > 0 && (
                <div className="max-w-xl space-y-2 rounded-xl border border-neutral-800 bg-black/30 px-4 py-3">
                  {beforeAfter.map((row) => (
                    <div key={row.sku} className="text-sm text-neutral-300">
                      <p className="font-medium text-white">{row.sku}</p>
                      <p>
                        Previous Quantity {row.previousQuantity} → New Quantity {row.newQuantity}
                      </p>
                      <p>
                        Previous Cost {money(row.previousCost, currency)} → New Landed Cost{' '}
                        {money(row.newLandedCost, currency)}
                      </p>
                    </div>
                  ))}
                </div>
              )}
              <div className="max-w-md rounded-xl border border-neutral-800 bg-black/30 px-4 py-2">
                <SummaryLine
                  label="Purchase Invoice ID"
                  value={
                    purchaseTx?.sageTransactionId ?? purchaseRecord?.sageTransactionId ?? '—'
                  }
                />
                <SummaryLine
                  label="Sage section"
                  value="Purchases → Purchase Invoices → Draft"
                />
                <SummaryLine
                  label="Reference"
                  value={demoRun?.demoRunReference ?? preview.run.externalReference}
                />
                <SummaryLine
                  label="Vendor reference"
                  value={preview.bundle.shipment.vendorInvoiceNumber}
                />
                <SummaryLine label="Number of Stock Movements" value={String(movementCount)} />
                <SummaryLine label="Verified in Sage" value="Yes" />
              </div>
            </div>
          ) : purchasePartial ? (
            <div className="space-y-3">
              <p className="text-base font-medium text-amber-200">Partial Completion</p>
              <p className="max-w-xl text-sm text-neutral-400">
                Inventory Stock Movements did not fully complete. If a Purchase Invoice ID is shown
                below, look under <span className="text-neutral-200">Draft</span> purchase invoices
                in Sage. Otherwise use Reset Demo and retry Workflow 2.
              </p>
              <button
                type="button"
                disabled={busy || !sageConnected}
                onClick={() => setConfirmPurchase(true)}
                className="rounded-lg bg-white px-5 py-3 text-sm font-semibold text-black disabled:opacity-40"
              >
                Retry Failed Inventory Updates
              </button>
            </div>
          ) : (
            <div className="space-y-3">
              <button
                type="button"
                disabled={!canPurchase}
                onClick={() => setConfirmPurchase(true)}
                className="rounded-lg bg-white px-5 py-3 text-sm font-semibold text-black disabled:cursor-not-allowed disabled:opacity-40"
              >
                Create Purchase &amp; Inventory Records in Sage
              </button>
              {purchaseBlockReason && (
                <p className="max-w-xl text-sm text-amber-200">{purchaseBlockReason}</p>
              )}
            </div>
          )}
        </WorkflowCard>
      )}

      {workflowTab === 'sales' && (
        <WorkflowCard
          title="Create Sales Invoice in Sage"
          description="Create the Sales Invoice from the Customer Invoice prepared in Workflow 1."
        >
          {activeWorkflow === 'sales' ? (
            <p className="text-sm text-neutral-300">Creating Sales Invoice in Sage…</p>
          ) : salesDone && preview ? (
            <div className="space-y-3">
              <p className="text-base font-medium text-emerald-300">
                Sales Invoice Created in Sage
              </p>
              <div className="max-w-md rounded-xl border border-neutral-800 bg-black/30 px-4 py-2">
                <SummaryLine
                  label="Sales Invoice ID"
                  value={salesTx?.sageTransactionId ?? salesRecord?.sageTransactionId ?? '—'}
                />
                <SummaryLine
                  label="Sage section"
                  value="Sales → Sales Invoices → Draft"
                />
                <SummaryLine
                  label="Reference"
                  value={
                    salesRecord?.externalReference ??
                    demoRun?.demoRunReference ??
                    preview.run.externalReference
                  }
                />
                <SummaryLine
                  label="Customer invoice"
                  value={preview.bundle.customerInvoice.sourceInvoiceNumber}
                />
                <SummaryLine
                  label="Customer"
                  value={preview.bundle.customerInvoice.customer}
                />
                <SummaryLine
                  label="Invoice total"
                  value={money(preview.bundle.customerInvoice.total, currency)}
                />
                <SummaryLine label="Verified in Sage" value="Yes" />
              </div>
            </div>
          ) : (
            <div className="space-y-3">
              <button
                type="button"
                disabled={!canSales}
                onClick={() => setConfirmSales(true)}
                className="rounded-lg bg-white px-5 py-3 text-sm font-semibold text-black disabled:cursor-not-allowed disabled:opacity-40"
              >
                Create Sales Invoice in Sage
              </button>
              {salesBlockReason && (
                <p className="max-w-xl text-sm text-amber-200">{salesBlockReason}</p>
              )}
            </div>
          )}
        </WorkflowCard>
      )}

      <ConfirmModal
        open={confirmPurchase}
        title="Confirm purchase posting"
        confirmLabel="Confirm & Create in Sage"
        busy={busy}
        onCancel={() => setConfirmPurchase(false)}
        onConfirm={() => void runPurchase()}
      >
        <p>Create the Purchase Invoice and update inventory in Sage for PO#GHOACRUGOL051926?</p>
        <p className="text-amber-200">
          This action will create real records in the connected Sage account.
        </p>
        {preview && (
          <div className="mt-2 rounded-lg border border-neutral-800 px-3 py-1">
            <SummaryLine label="Supplier" value={preview.bundle.shipment.supplier} />
            <SummaryLine
              label="SKU count"
              value={String(preview.bundle.shipment.lines.length)}
            />
            <SummaryLine label="Total quantity" value={String(totalUnits)} />
            <SummaryLine
              label="Purchase Invoice total"
              value={money(preview.bundle.shipment.vendorInvoiceTotal, currency)}
            />
            <SummaryLine
              label="Total landed inventory value"
              value={money(preview.reconciliation.totalCapitalizableCost, currency)}
            />
          </div>
        )}
      </ConfirmModal>

      <ConfirmModal
        open={confirmSales}
        title="Confirm Sales Invoice"
        confirmLabel="Confirm & Create in Sage"
        busy={busy}
        onCancel={() => setConfirmSales(false)}
        onConfirm={() => void runSales()}
      >
        <p>Create the Sales Invoice in Sage?</p>
        <p className="text-amber-200">
          This action will create real records in the connected Sage account.
        </p>
        {preview && (
          <div className="mt-2 rounded-lg border border-neutral-800 px-3 py-1">
            <SummaryLine label="Customer" value={preview.bundle.customerInvoice.customer} />
            <SummaryLine
              label="Customer Invoice reference"
              value={preview.bundle.customerInvoice.sourceInvoiceNumber}
            />
            <SummaryLine
              label="Invoice total"
              value={money(preview.bundle.customerInvoice.total, currency)}
            />
          </div>
        )}
      </ConfirmModal>

      <ConfirmModal
        open={confirmReset}
        title="Reset demo data"
        confirmLabel="Reset Demo Data"
        busy={busy}
        confirmDisabled={resetTyped !== 'RESET'}
        onCancel={() => {
          setConfirmReset(false);
          setResetTyped('');
        }}
        onConfirm={() => void runReset()}
      >
        <p>Reset this demo and restore the Sage data to its previous state?</p>
        <p className="text-amber-200">
          Sales Invoices are voided rather than permanently deleted because of Sage audit
          requirements.
        </p>
        <label className="block text-sm text-neutral-400">
          Type RESET to confirm
          <input
            value={resetTyped}
            onChange={(event) => setResetTyped(event.target.value)}
            className="mt-1 w-full rounded-lg border border-neutral-700 bg-black px-3 py-2 text-white"
            autoComplete="off"
          />
        </label>
      </ConfirmModal>
    </SageLayout>
  );
}
