import { useCallback, useEffect, useState, type ReactNode } from 'react';
import { useSearchParams } from 'react-router-dom';
import type { DemoRunRecord } from '../../shared/demoRun';
import type { WorkflowPreview } from '../../shared/workflow';
import { ConfirmModal } from '../components/sage/cfo/ConfirmModal';
import {
  PO_REFERENCE,
  accountingReady,
  friendlyError,
  inventoryAvailability,
  matchedSkuCount,
  money,
  purchaseInvoiceRecord,
  purchaseWorkflowComplete,
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
  const types = new Set(preview.bundle.documents.map((doc) => doc.documentType));
  if (!types.has('purchase_order')) missing.push('Purchase Order');
  if (!types.has('vendor_invoice')) missing.push('Vendor Invoice');
  if (!types.has('packing_list')) missing.push('Bill of Lading or Packing List');
  if (!types.has('freight_invoice')) missing.push('Freight Invoice');
  if (!types.has('customs_duty')) missing.push('Customs, Duties or Tax Document');
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
  return Boolean(
    invoice.sourceInvoiceNumber &&
      invoice.matchedSageContactId &&
      invoice.lines.length > 0 &&
      invoice.lines.every((line) => line.matchedSageStockItemId),
  );
}

function demoHasCreatedRecords(demoRun: DemoRunRecord | null) {
  if (!demoRun) return false;
  return demoRun.transactions.some((tx) =>
    ['succeeded', 'voided', 'deleted', 'restored'].includes(tx.status),
  );
}

export function SageIntegrationPage() {
  const [params] = useSearchParams();
  const [sageStatus, setSageStatus] = useState<SageStatus | null>(null);
  const [gmailStatus, setGmailStatus] = useState<GmailStatus | null>(null);
  const [preview, setPreview] = useState<WorkflowPreview | null>(null);
  const [demoRun, setDemoRun] = useState<DemoRunRecord | null>(null);
  const [beforeAfter, setBeforeAfter] = useState<BeforeAfterRow[]>([]);
  const [baselinePreview, setBaselinePreview] = useState<
    Array<{ sku: string; quantityInStock: number; costPrice: number }>
  >([]);
  const [messageIds, setMessageIds] = useState<string[]>([]);
  const [scanDone, setScanDone] = useState(false);
  const [busy, setBusy] = useState(false);
  const [activeWorkflow, setActiveWorkflow] = useState<WorkflowKey>(null);
  const [error, setError] = useState<string | null>(null);
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
    if (params.get('connected') === 'true' || params.get('gmail') === 'connected') {
      void refreshConnections();
    }
    if (params.get('gmail') === 'failed') {
      setError('Gmail connection failed. Please try again.');
    }
  }, [params, refreshConnections]);

  const buildRequest = useCallback((): PreviewRequest => {
    const sageConnected = Boolean(sageStatus?.connected);
    return {
      mode: sageConnected ? 'live_sage_write' : 'gmail_dry_run',
      sourceType: 'gmail',
      searchQuery: GMAIL_QUERY,
      messageIds,
      inventoryPostingStrategy: 'stock_movement',
      selections: {
        ...(preview?.selections ?? {}),
        accountingMappingConfirmed: true,
      },
    };
  }, [messageIds, preview?.selections, sageStatus?.connected]);

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
      setMessageIds([]);
      setPreview(null);
      setScanDone(false);
      setBaselinePreview([]);
      await refreshConnections();
    } catch (err) {
      setError(friendlyError(err instanceof Error ? err.message : 'Could not disconnect Gmail'));
    } finally {
      setBusy(false);
    }
  };

  const handleScan = async () => {
    if (!gmailStatus?.connected) return;
    setBusy(true);
    setActiveWorkflow('scan');
    setError(null);
    try {
      const sync = await syncGmail(GMAIL_QUERY);
      const ids = sync.messages.map((message) => message.gmailMessageId);
      setMessageIds(ids);
      if (!ids.length) {
        setScanDone(false);
        setPreview(null);
        setError(
          'Additional information is required before continuing. No emails found for PO#GHOACRUGOL051926.',
        );
        return;
      }

      const request: PreviewRequest = {
        mode: sageStatus?.connected ? 'live_sage_write' : 'gmail_dry_run',
        sourceType: 'gmail',
        searchQuery: GMAIL_QUERY,
        messageIds: ids,
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
            `The following SKU must be prepared in Sage before continuing. ${prepared.missingSkus.join(', ')}`,
          );
          return;
        }
      }

      setScanDone(true);
    } catch (err) {
      setScanDone(false);
      setError(
        friendlyError(err instanceof Error ? err.message : 'Could not scan Gmail documents'),
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
      setPreview((current) =>
        current ? { ...current, run: result.run } : current,
      );
      if (result.partial) {
        setError(
          'Partial Completion. Some inventory records need attention. Successful Sage IDs were preserved.',
        );
      }
    } catch (err) {
      const missingSkus = (err as { missingSkus?: string[] }).missingSkus;
      if (missingSkus?.length) {
        setError(
          `The following SKU must be prepared in Sage before continuing. ${missingSkus.join(', ')}`,
        );
      } else {
        setError(
          friendlyError(err instanceof Error ? err.message : 'Could not create purchase records'),
        );
      }
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
      setPreview((current) =>
        current ? { ...current, run: result.run } : current,
      );
    } catch (err) {
      setError(
        friendlyError(err instanceof Error ? err.message : 'Could not create Sales Invoice'),
      );
    } finally {
      setActiveWorkflow(null);
      setBusy(false);
    }
  };

  const runReset = async () => {
    if (resetTyped !== 'RESET') return;
    setConfirmReset(false);
    setBusy(true);
    setActiveWorkflow('reset');
    setError(null);
    try {
      const result = await resetDemoRun('RESET', demoRun?.id);
      setDemoRun(result.demoRun);
      if (result.demoRun.status === 'reset_complete') {
        setBeforeAfter([]);
        setBaselinePreview(
          result.demoRun.baseline.map((item) => ({
            sku: item.itemCode,
            quantityInStock: item.quantityInStock,
            costPrice: item.costPrice,
          })),
        );
        await resetWorkflow();
        setPreview(null);
        setScanDone(false);
        setMessageIds([]);
      } else {
        const mismatches = result.demoRun.verification.mismatches
          .map((item) => `${item.sku} ${item.field}`)
          .join('; ');
        setError(
          mismatches
            ? `Reset Requires Review. ${mismatches}`
            : 'Reset Incomplete. Review the remaining Sage records.',
        );
      }
    } catch (err) {
      setError(friendlyError(err instanceof Error ? err.message : 'Demo reset failed'));
    } finally {
      setResetTyped('');
      setActiveWorkflow(null);
      setBusy(false);
    }
  };

  const sageConnected = Boolean(sageStatus?.connected);
  const gmailConnected = Boolean(gmailStatus?.connected);
  const currency = preview?.bundle.shipment.currency || 'GBP';
  const purchaseDone = preview ? purchaseWorkflowComplete(preview.run) : false;
  const salesDone = preview ? salesWorkflowComplete(preview.run) : false;
  const allDone = purchaseDone && salesDone && scanDone;
  const customerFound = Boolean(preview?.bundle.customerInvoice.sourceInvoiceNumber);
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

  const canPurchase =
    sageConnected &&
    scanDone &&
    preview !== null &&
    matchedSkuCount(preview) === preview.bundle.shipment.lines.length &&
    preview.reconciliation.withinTolerance &&
    !purchaseDone &&
    !busy;

  const canSales =
    sageConnected &&
    scanDone &&
    purchaseDone &&
    customerInvoiceReady(preview) &&
    preview !== null &&
    inventoryAvailability(preview) === 'available' &&
    !salesDone &&
    !busy;

  const canReset =
    sageConnected &&
    Boolean(demoRun) &&
    demoHasCreatedRecords(demoRun) &&
    demoRun?.status !== 'reset_complete' &&
    !busy;

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
          disabled={!canReset}
          onClick={() => {
            setResetTyped('');
            setConfirmReset(true);
          }}
          className="rounded-lg border border-neutral-800 px-3 py-1.5 text-xs text-neutral-500 hover:border-neutral-700 hover:text-neutral-300 disabled:cursor-not-allowed disabled:opacity-30"
        >
          Reset Demo
        </button>
      </header>

      <div className="mb-8 grid gap-4 md:grid-cols-2">
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

      {error && (
        <div className="mb-6 rounded-xl border border-amber-500/30 bg-amber-500/10 px-4 py-3 text-sm text-amber-100">
          {error}
        </div>
      )}

      {demoRun?.status === 'reset_complete' && (
        <div className="mb-6 rounded-xl border border-emerald-500/30 bg-emerald-500/10 px-4 py-3 text-sm text-emerald-100">
          Demo Reset Complete
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

      <div className="space-y-5">
        <WorkflowCard
          title="1. Scan Gmail & Calculate Landed Costs"
          description="Read the purchase, shipment and customer documents related to PO#GHOACRUGOL051926 and prepare the data for Sage."
        >
          {activeWorkflow === 'scan' ? (
            <p className="text-sm text-neutral-300">
              Reading documents and calculating landed costs…
            </p>
          ) : scanDone && preview ? (
            <div className="space-y-4">
              <p className="text-base font-medium text-emerald-300">Ready for Sage</p>
              <div className="max-w-md rounded-xl border border-neutral-800 bg-black/30 px-4 py-2">
                <SummaryLine
                  label="Documents processed"
                  value={String(preview.bundle.documents.length)}
                />
                <SummaryLine
                  label="SKUs identified"
                  value={String(preview.bundle.shipment.lines.length)}
                />
                <SummaryLine label="Total units" value={String(totalUnits)} />
                <SummaryLine
                  label="Total landed inventory value"
                  value={money(preview.reconciliation.totalCapitalizableCost, currency)}
                />
                <SummaryLine
                  label="Customer Invoice found"
                  value={customerFound ? 'Yes' : 'No'}
                />
              </div>
            </div>
          ) : (
            <button
              type="button"
              disabled={!gmailConnected || busy}
              onClick={() => void handleScan()}
              className="rounded-lg bg-white px-5 py-3 text-sm font-semibold text-black disabled:cursor-not-allowed disabled:opacity-40"
            >
              Scan Gmail &amp; Calculate Landed Costs
            </button>
          )}
        </WorkflowCard>

        <WorkflowCard
          title="2. Create Purchase & Inventory Records in Sage"
          description="Create the Purchase Invoice and update inventory using the approved quantities and landed costs."
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
                <SummaryLine label="Number of Stock Movements" value={String(movementCount)} />
                <SummaryLine label="Verified in Sage" value="Yes" />
              </div>
            </div>
          ) : purchasePartial ? (
            <div className="space-y-3">
              <p className="text-base font-medium text-amber-200">Partial Completion</p>
              <p className="text-sm text-neutral-400">
                The Purchase Invoice was created. Some inventory updates still need attention.
              </p>
              <button
                type="button"
                disabled={busy || !sageConnected}
                onClick={() => setConfirmPurchase(true)}
                className="rounded-lg bg-white px-5 py-3 text-sm font-semibold text-black disabled:cursor-not-allowed disabled:opacity-40"
              >
                Retry Failed Inventory Updates
              </button>
            </div>
          ) : (
            <button
              type="button"
              disabled={!canPurchase}
              onClick={() => setConfirmPurchase(true)}
              className="rounded-lg bg-white px-5 py-3 text-sm font-semibold text-black disabled:cursor-not-allowed disabled:opacity-40"
            >
              Create Purchase &amp; Inventory Records in Sage
            </button>
          )}
        </WorkflowCard>

        <WorkflowCard
          title="3. Create Sales Invoice in Sage"
          description="Create the Sales Invoice from the Customer Invoice identified in Gmail."
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
            <button
              type="button"
              disabled={!canSales}
              onClick={() => setConfirmSales(true)}
              className="rounded-lg bg-white px-5 py-3 text-sm font-semibold text-black disabled:cursor-not-allowed disabled:opacity-40"
            >
              Create Sales Invoice in Sage
            </button>
          )}
        </WorkflowCard>
      </div>

      <ConfirmModal
        open={confirmPurchase}
        title="Confirm purchase posting"
        confirmLabel="Confirm & Create in Sage"
        busy={busy}
        onCancel={() => setConfirmPurchase(false)}
        onConfirm={() => void runPurchase()}
      >
        <p>Create the Purchase Invoice and update inventory in Sage for PO#GHOACRUGOL051926?</p>
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
        {preview && (
          <div className="mt-2 rounded-lg border border-neutral-800 px-3 py-1">
            <SummaryLine label="Customer" value={preview.bundle.customerInvoice.customer} />
            <SummaryLine
              label="Customer Invoice reference"
              value={preview.bundle.customerInvoice.sourceInvoiceNumber}
            />
            <SummaryLine
              label="SKU count"
              value={String(preview.bundle.customerInvoice.lines.length)}
            />
            <SummaryLine
              label="Total quantity"
              value={String(
                preview.bundle.customerInvoice.lines.reduce(
                  (sum, line) => sum + line.quantity,
                  0,
                ),
              )}
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
        {demoRun && (
          <div className="mt-2 rounded-lg border border-neutral-800 px-3 py-1">
            <SummaryLine label="Demo Run reference" value={demoRun.demoRunReference} />
            <SummaryLine
              label="Purchase Invoice to remove"
              value={purchaseTx?.sageTransactionId ?? 'None'}
            />
            <SummaryLine
              label="Stock Movements to remove"
              value={String(movementCount)}
            />
            <SummaryLine
              label="Sales Invoice to void"
              value={salesTx?.sageTransactionId ?? 'None'}
            />
            <SummaryLine
              label="Stock Items to restore"
              value={String(demoRun.baseline.length)}
            />
          </div>
        )}
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
