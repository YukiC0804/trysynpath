import { useCallback, useEffect, useMemo, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { motion } from 'motion/react';
import type { WorkflowPreview } from '../../shared/workflow';
import { StatusBadge } from '../components/demo/StatusBadge';
import { ConfirmModal } from '../components/sage/cfo/ConfirmModal';
import {
  PO_REFERENCE,
  accountingReady,
  computeStageStatuses,
  friendlyError,
  hasRequiredPurchaseDocs,
  money,
  purchaseInvoiceRecord,
  purchaseWorkflowComplete,
  salesWorkflowComplete,
  workflowFullyComplete,
  type CfoStageId,
} from '../components/sage/cfo/helpers';
import {
  CompletionBanner,
  CustomerInvoiceStage,
  DocumentsStage,
  InventoryStage,
  LandedCostStage,
  PurchaseInvoiceStage,
  ReviewStage,
  SalesInvoiceStage,
} from '../components/sage/cfo/StagePanels';
import { WorkflowTimeline } from '../components/sage/cfo/WorkflowTimeline';
import { SageLayout } from '../components/sage/SageLayout';
import { fetchSageStatus, type SageStatus } from '../lib/sageApi';
import {
  approveWorkflow,
  createWorkflowPreview,
  executeWorkflow,
  fetchGmailStatus,
  resetWorkflow,
  syncGmail,
  type GmailStatus,
  type PreviewRequest,
} from '../lib/workflowApi';

const GMAIL_QUERY = `GHOACRUGOL051926 OR "${PO_REFERENCE}" has:attachment`;

export function SageIntegrationPage() {
  const [params] = useSearchParams();
  const [sageStatus, setSageStatus] = useState<SageStatus | null>(null);
  const [gmailStatus, setGmailStatus] = useState<GmailStatus | null>(null);
  const [preview, setPreview] = useState<WorkflowPreview | null>(null);
  const [activeStage, setActiveStage] = useState<CfoStageId>('documents');
  const [processingStage, setProcessingStage] = useState<CfoStageId | null>(null);
  const [processingStep, setProcessingStep] = useState(0);
  const [customerInvoiceLoaded, setCustomerInvoiceLoaded] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [confirmPurchaseOpen, setConfirmPurchaseOpen] = useState(false);
  const [confirmSalesOpen, setConfirmSalesOpen] = useState(false);
  const [messageIds, setMessageIds] = useState<string[]>([]);

  const refreshConnections = useCallback(async () => {
    const [sage, gmail] = await Promise.all([
      fetchSageStatus().catch(() => null),
      fetchGmailStatus().catch(() => null),
    ]);
    setSageStatus(sage);
    setGmailStatus(gmail);
  }, []);

  useEffect(() => {
    void refreshConnections();
  }, [refreshConnections]);

  useEffect(() => {
    if (params.get('connected') === 'true') setNotice('Sage Connected');
    if (params.get('gmail') === 'connected') setNotice('Gmail Connected');
    if (params.get('gmail') === 'failed') {
      setError(params.get('reason') ?? 'Gmail connection failed');
    }
  }, [params]);

  const request = useMemo<PreviewRequest>(() => {
    const sageConnected = Boolean(sageStatus?.connected);
    const gmailConnected = Boolean(gmailStatus?.connected);
    return {
      mode: sageConnected ? 'live_sage_write' : 'fixture_dry_run',
      sourceType: gmailConnected && messageIds.length > 0 ? 'gmail' : 'fixture',
      searchQuery: GMAIL_QUERY,
      messageIds,
      inventoryPostingStrategy: 'stock_movement',
      selections: {
        accountingMappingConfirmed: true,
      },
    };
  }, [sageStatus?.connected, gmailStatus?.connected, messageIds]);

  const buildRequest = useCallback(
    (selections?: Record<string, unknown>): PreviewRequest => ({
      ...request,
      selections: {
        ...(preview?.selections ?? {}),
        ...(selections ?? {}),
        accountingMappingConfirmed: true,
      },
    }),
    [request, preview?.selections],
  );

  const loadPreview = useCallback(
    async (opts?: { advance?: boolean; source?: 'fixture' | 'gmail'; messageIds?: string[] }) => {
      const nextMessageIds = opts?.messageIds ?? messageIds;
      const sageConnected = Boolean(sageStatus?.connected);
      const gmailConnected = Boolean(gmailStatus?.connected);
      const sourceType =
        opts?.source ??
        (gmailConnected && nextMessageIds.length > 0 ? 'gmail' : 'fixture');
      const payload: PreviewRequest = {
        mode: sageConnected ? 'live_sage_write' : 'fixture_dry_run',
        sourceType,
        searchQuery: GMAIL_QUERY,
        messageIds: nextMessageIds,
        inventoryPostingStrategy: 'stock_movement',
        selections: {
          ...(preview?.selections ?? {}),
          accountingMappingConfirmed: true,
        },
      };
      const result = await createWorkflowPreview(payload);
      const readySelections = {
        ...result.selections,
        accountingMappingConfirmed: accountingReady(result),
      };
      let finalResult = result;
      if (accountingReady(result) && !result.selections.accountingMappingConfirmed) {
        finalResult = await createWorkflowPreview({
          ...payload,
          selections: readySelections,
        });
      }
      setPreview(finalResult);
      if (opts?.advance && hasRequiredPurchaseDocs(finalResult)) {
        setActiveStage('landedCost');
      }
      return finalResult;
    },
    [gmailStatus?.connected, messageIds, preview?.selections, sageStatus?.connected],
  );

  const handleLoadDocuments = async () => {
    setBusy(true);
    setError(null);
    setNotice(null);
    setProcessingStage('documents');
    setProcessingStep(0);
    try {
      let ids = messageIds;
      if (gmailStatus?.connected) {
        const sync = await syncGmail(GMAIL_QUERY);
        ids = sync.messages.map((message) => message.gmailMessageId);
        setMessageIds(ids);
        await refreshConnections();
      }
      await loadPreview({
        advance: true,
        source: gmailStatus?.connected && ids.length > 0 ? 'gmail' : 'fixture',
        messageIds: ids,
      });
      setNotice('Purchase and shipment documents are ready for landed cost review.');
    } catch (err) {
      setError(friendlyError(err instanceof Error ? err.message : 'Failed to load documents'));
    } finally {
      setProcessingStage(null);
      setBusy(false);
    }
  };

  const handleLoadCustomerInvoice = async () => {
    setBusy(true);
    setError(null);
    setProcessingStage('customerInvoice');
    try {
      let ids = messageIds;
      if (gmailStatus?.connected) {
        const sync = await syncGmail(
          `${GMAIL_QUERY} OR GB-CUST-1042 OR "customer invoice"`,
        );
        ids = sync.messages.map((message) => message.gmailMessageId);
        setMessageIds(ids);
      }
      const result = await loadPreview({
        source: gmailStatus?.connected && ids.length > 0 ? 'gmail' : 'fixture',
        messageIds: ids,
      });
      setCustomerInvoiceLoaded(true);
      if (!result.bundle.customerInvoice.sourceInvoiceNumber) {
        throw new Error('Customer invoice was not found for this PO.');
      }
      setNotice('Customer invoice loaded and matched for review.');
    } catch (err) {
      setError(
        friendlyError(err instanceof Error ? err.message : 'Failed to load customer invoice'),
      );
    } finally {
      setProcessingStage(null);
      setBusy(false);
    }
  };

  const runPurchasePosting = async () => {
    if (!preview) return;
    if (!accountingReady(preview)) {
      setError(
        'Accounting configuration is incomplete. Complete it in the internal admin page before the demo.',
      );
      setConfirmPurchaseOpen(false);
      return;
    }
    setConfirmPurchaseOpen(false);
    setBusy(true);
    setError(null);
    setProcessingStage('review');
    try {
      const base = buildRequest({
        ...preview.selections,
        accountingMappingConfirmed: true,
      });
      // Refresh digests with confirmed mapping + stock movement strategy.
      let current = await createWorkflowPreview(base);
      setPreview(current);
      if (!accountingReady(current)) {
        throw new Error(
          'Accounting configuration is incomplete. Complete it in the internal admin page before the demo.',
        );
      }
      if (!current.selections.accountingMappingConfirmed) {
        current = await createWorkflowPreview({
          ...base,
          selections: { ...current.selections, accountingMappingConfirmed: true },
        });
        setPreview(current);
      }

      const confirmation = current.run.externalReference;
      setProcessingStage('purchaseInvoice');
      setProcessingStep(0);
      setActiveStage('purchaseInvoice');

      await approveWorkflow({
        ...base,
        selections: { ...current.selections, accountingMappingConfirmed: true },
        target: 'inventoryReceipt',
        confirmation,
        accountingMappingConfirmed: true,
        inventoryPostingStrategy: 'stock_movement',
        approvalDigest: current.approvalDigests.inventoryReceipt,
      });
      current = await createWorkflowPreview({
        ...base,
        selections: { ...current.selections, accountingMappingConfirmed: true },
      });
      setPreview(current);

      await approveWorkflow({
        ...base,
        selections: { ...current.selections, accountingMappingConfirmed: true },
        target: 'purchaseInvoice',
        confirmation,
        accountingMappingConfirmed: true,
        inventoryPostingStrategy: 'stock_movement',
        approvalDigest: current.approvalDigests.purchaseInvoice,
      });

      setProcessingStep(1);
      const purchaseExec = await executeWorkflow('purchase_invoice', {
        ...base,
        selections: { ...current.selections, accountingMappingConfirmed: true },
      });
      current = purchaseExec.preview;
      setPreview(current);
      setProcessingStep(2);

      const purchase = purchaseInvoiceRecord(current.run);
      if (purchase?.status !== 'succeeded' || !purchase.readBackVerified) {
        throw new Error('Purchase Invoice could not be verified in Sage.');
      }

      setProcessingStage('inventory');
      setProcessingStep(0);
      setActiveStage('inventory');
      setProcessingStep(1);
      const inventoryExec = await executeWorkflow('stock_movements', {
        ...base,
        selections: { ...current.selections, accountingMappingConfirmed: true },
      });
      current = await createWorkflowPreview({
        ...base,
        selections: { ...current.selections, accountingMappingConfirmed: true },
      }).catch(() => inventoryExec.preview);
      setPreview({ ...current, run: inventoryExec.run });
      setProcessingStep(3);

      if (!purchaseWorkflowComplete(inventoryExec.run)) {
        setActiveStage('inventory');
        setError('Inventory receipt needs attention. Successful Sage IDs were preserved.');
        return;
      }

      setCustomerInvoiceLoaded(false);
      setActiveStage('customerInvoice');
      setNotice('Purchase Invoice and inventory receipt verified in Sage.');
    } catch (err) {
      setError(friendlyError(err instanceof Error ? err.message : 'Purchase posting failed'));
    } finally {
      setProcessingStage(null);
      setBusy(false);
    }
  };

  const retryInventory = async () => {
    if (!preview) return;
    setBusy(true);
    setError(null);
    setProcessingStage('inventory');
    try {
      const base = buildRequest({
        ...preview.selections,
        accountingMappingConfirmed: true,
      });
      const result = await executeWorkflow('stock_movements', base);
      const refreshed = await createWorkflowPreview(base).catch(() => result.preview);
      setPreview({ ...refreshed, run: result.run });
      if (purchaseWorkflowComplete(result.run)) {
        setActiveStage('customerInvoice');
        setNotice('Inventory receipt verified in Sage.');
      } else {
        setError('Some inventory movements still need attention.');
      }
    } catch (err) {
      setError(friendlyError(err instanceof Error ? err.message : 'Inventory retry failed'));
    } finally {
      setProcessingStage(null);
      setBusy(false);
    }
  };

  const runSalesPosting = async () => {
    if (!preview) return;
    setConfirmSalesOpen(false);
    setBusy(true);
    setError(null);
    setProcessingStage('salesInvoice');
    setProcessingStep(0);
    setActiveStage('salesInvoice');
    try {
      const base = buildRequest({
        ...preview.selections,
        accountingMappingConfirmed: true,
      });
      let current = await createWorkflowPreview(base);
      setPreview(current);
      const confirmation = current.run.externalReference;

      await approveWorkflow({
        ...base,
        selections: { ...current.selections, accountingMappingConfirmed: true },
        target: 'customerSale',
        confirmation,
        accountingMappingConfirmed: true,
        inventoryPostingStrategy: 'stock_movement',
        approvalDigest: current.approvalDigests.customerSale,
      });

      setProcessingStep(1);
      const salesExec = await executeWorkflow('sales_invoice', {
        ...base,
        selections: { ...current.selections, accountingMappingConfirmed: true },
      });
      setProcessingStep(2);
      current = await createWorkflowPreview(base).catch(() => salesExec.preview);
      setPreview({ ...current, run: salesExec.run });
      setProcessingStep(3);

      if (!salesWorkflowComplete(salesExec.run)) {
        throw new Error('Sales Invoice could not be verified in Sage.');
      }
      setNotice('Sales Invoice created and verified in Sage.');
    } catch (err) {
      setError(friendlyError(err instanceof Error ? err.message : 'Sales posting failed'));
    } finally {
      setProcessingStage(null);
      setBusy(false);
    }
  };

  const handleStartOver = async () => {
    await resetWorkflow();
    setPreview(null);
    setActiveStage('documents');
    setCustomerInvoiceLoaded(false);
    setMessageIds([]);
    setError(null);
    setNotice('Workflow reset. Existing Sage records were not deleted.');
  };

  const statuses = computeStageStatuses(
    preview,
    activeStage,
    processingStage,
    customerInvoiceLoaded,
  );
  const complete = workflowFullyComplete(preview);
  const currency = preview?.bundle.shipment.currency || 'GBP';

  useEffect(() => {
    if (!preview) return;
    if (hasRequiredPurchaseDocs(preview) && activeStage === 'documents' && !busy) {
      setActiveStage('landedCost');
    }
  }, [preview, activeStage, busy]);

  return (
    <SageLayout>
      <motion.div
        initial={{ opacity: 0, y: 8 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.35 }}
        className="mb-6 flex flex-wrap items-start justify-between gap-4"
      >
        <div>
          <h1 className="font-display text-2xl font-semibold tracking-tight text-white sm:text-3xl">
            Ghostboards Demo
          </h1>
          <p className="mt-2 max-w-3xl text-sm text-neutral-400">
            PO#GHOACRUGOL051926 — Landed Cost, Inventory &amp; Customer Invoice Automation
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <StatusBadge variant={gmailStatus?.connected ? 'healthy' : 'neutral'}>
            {gmailStatus?.connected ? 'Gmail Connected' : 'Gmail Disconnected'}
          </StatusBadge>
          <StatusBadge variant={sageStatus?.connected ? 'healthy' : 'neutral'}>
            {sageStatus?.connected ? 'Sage Connected' : 'Sage Disconnected'}
          </StatusBadge>
          {!gmailStatus?.connected && gmailStatus?.configured !== false && (
            <a
              href="/api/gmail/oauth/connect"
              className="rounded-lg border border-neutral-700 px-3 py-1.5 text-xs text-neutral-300"
            >
              Connect Gmail
            </a>
          )}
          {!sageStatus?.connected && (
            <a
              href="/api/integrations/sage/connect"
              className="rounded-lg border border-neutral-700 px-3 py-1.5 text-xs text-neutral-300"
            >
              Connect Sage
            </a>
          )}
        </div>
      </motion.div>

      <p className="mb-6 max-w-3xl text-sm leading-relaxed text-neutral-400">
        Read external Purchase Order and shipment documents → Extract data and calculate landed
        cost for each SKU → Human review and approval → Create Purchase Invoice in Sage → Increase
        inventory through Stock Movements using landed cost → Read an existing Customer Invoice →
        Create Sales Invoice in Sage.
      </p>

      {(notice || error) && (
        <div className="mb-5 space-y-2">
          {notice && (
            <div className="rounded-lg border border-emerald-500/30 bg-emerald-500/10 px-4 py-3 text-sm text-emerald-200">
              {notice}
            </div>
          )}
          {error && (
            <div className="rounded-lg border border-red-500/30 bg-red-500/10 px-4 py-3 text-sm text-red-200">
              {error}
            </div>
          )}
        </div>
      )}

      {complete && preview && <CompletionBanner preview={preview} />}

      <WorkflowTimeline activeStage={activeStage} statuses={statuses}>
        {{
          documents: (
            <DocumentsStage
              preview={preview}
              busy={busy}
              gmailConnected={Boolean(gmailStatus?.connected)}
              onLoad={() => void handleLoadDocuments()}
            />
          ),
          landedCost: preview ? (
            <LandedCostStage
              preview={preview}
              busy={busy}
              onContinue={() => setActiveStage('review')}
            />
          ) : (
            <p className="text-sm text-neutral-500">Load purchase documents first.</p>
          ),
          review: preview ? (
            <ReviewStage
              preview={preview}
              busy={busy}
              sageConnected={Boolean(sageStatus?.connected)}
              onApprove={() => setConfirmPurchaseOpen(true)}
              onGoTo={setActiveStage}
            />
          ) : (
            <p className="text-sm text-neutral-500">Complete landed cost calculation first.</p>
          ),
          purchaseInvoice: preview ? (
            <PurchaseInvoiceStage
              preview={preview}
              processingStep={
                processingStage === 'purchaseInvoice' ? processingStep : purchaseInvoiceRecord(preview.run)?.status === 'succeeded' ? 3 : 0
              }
            />
          ) : (
            <p className="text-sm text-neutral-500">Approve the purchase to create the Sage invoice.</p>
          ),
          inventory: preview ? (
            <InventoryStage
              preview={preview}
              processingStep={processingStage === 'inventory' ? processingStep : 0}
              busy={busy}
              onRetry={
                preview.run.status === 'partial' ||
                preview.run.postingRecords.some(
                  (record) =>
                    record.transactionType === 'stock_movement' && record.status === 'failed',
                )
                  ? () => void retryInventory()
                  : undefined
              }
            />
          ) : (
            <p className="text-sm text-neutral-500">Inventory updates after the Purchase Invoice.</p>
          ),
          customerInvoice: preview ? (
            <CustomerInvoiceStage
              preview={preview}
              busy={busy}
              loaded={customerInvoiceLoaded}
              onLoad={() => void handleLoadCustomerInvoice()}
              onContinue={() => setActiveStage('salesInvoice')}
            />
          ) : (
            <p className="text-sm text-neutral-500">Available after inventory is received.</p>
          ),
          salesInvoice: preview ? (
            <SalesInvoiceStage
              preview={preview}
              busy={busy}
              processingStep={processingStage === 'salesInvoice' ? processingStep : -1}
              onApprove={() => setConfirmSalesOpen(true)}
            />
          ) : (
            <p className="text-sm text-neutral-500">Review the customer invoice first.</p>
          ),
        }}
      </WorkflowTimeline>

      <div className="mt-8 flex flex-wrap items-center justify-between gap-3 border-t border-neutral-800 pt-4">
        <button
          type="button"
          disabled={busy}
          onClick={() => void handleStartOver()}
          className="rounded-lg border border-neutral-700 px-3 py-2 text-xs text-neutral-400"
        >
          Start over
        </button>
        <Link
          to="/sage-integration/admin"
          className="text-xs text-neutral-600 hover:text-neutral-400"
        >
          Internal admin
        </Link>
      </div>

      <ConfirmModal
        open={confirmPurchaseOpen}
        title="Approve purchase posting"
        confirmLabel="Approve & Continue"
        busy={busy}
        onCancel={() => setConfirmPurchaseOpen(false)}
        onConfirm={() => void runPurchasePosting()}
      >
        <p>You are approving:</p>
        <ul className="list-disc space-y-1 pl-5">
          <li>creation of the Purchase Invoice in Sage;</li>
          <li>receipt of inventory through Stock Movements;</li>
          <li>use of the calculated landed unit costs;</li>
          <li>PO reference GHOACRUGOL051926.</li>
        </ul>
        {preview && (
          <div className="mt-3 grid gap-2 sm:grid-cols-2">
            <p>
              Purchase Invoice amount:{' '}
              <span className="text-white">
                {money(preview.bundle.shipment.vendorInvoiceTotal, currency)}
              </span>
            </p>
            <p>
              Inventory quantity:{' '}
              <span className="text-white">
                {preview.bundle.shipment.lines.reduce(
                  (sum, line) => sum + line.receivedQuantity,
                  0,
                )}
              </span>
            </p>
            <p>
              Landed inventory value:{' '}
              <span className="text-white">
                {money(preview.reconciliation.totalCapitalizableCost, currency)}
              </span>
            </p>
            <p>
              Affected SKUs:{' '}
              <span className="text-white">{preview.bundle.shipment.lines.length}</span>
            </p>
          </div>
        )}
      </ConfirmModal>

      <ConfirmModal
        open={confirmSalesOpen}
        title="Approve Sales Invoice"
        confirmLabel="Approve & Continue"
        busy={busy}
        onCancel={() => setConfirmSalesOpen(false)}
        onConfirm={() => void runSalesPosting()}
      >
        <p>Create the Sales Invoice in Sage for PO#GHOACRUGOL051926.</p>
        {preview && (
          <div className="mt-3 space-y-1">
            <p>
              Customer:{' '}
              <span className="text-white">{preview.bundle.customerInvoice.customer}</span>
            </p>
            <p>
              Invoice reference:{' '}
              <span className="text-white">
                {preview.bundle.customerInvoice.sourceInvoiceNumber}
              </span>
            </p>
            <p>
              Invoice total:{' '}
              <span className="text-white">
                {money(preview.bundle.customerInvoice.total, currency)}
              </span>
            </p>
          </div>
        )}
      </ConfirmModal>
    </SageLayout>
  );
}
