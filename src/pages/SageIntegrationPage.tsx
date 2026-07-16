import { useCallback, useEffect, useMemo, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import type {
  AllocationMethod,
  ChargeClassification,
  InventoryPostingStrategy,
  SafeMode,
  WorkflowPreview,
} from '../../shared/workflow';
import { StatusBadge } from '../components/demo/StatusBadge';
import { SageLayout } from '../components/sage/SageLayout';
import { CustomerSaleStep } from '../components/sage/workflow/CustomerSaleStep';
import { DocumentsLandedCostStep } from '../components/sage/workflow/DocumentsLandedCostStep';
import { PurchaseInventoryStep } from '../components/sage/workflow/PurchaseInventoryStep';
import {
  disconnectSage,
  fetchSageStatus,
  type SageStatus,
} from '../lib/sageApi';
import {
  approveWorkflow,
  createWorkflowPreview,
  disconnectGmail,
  executeWorkflow,
  fetchGmailStatus,
  resetWorkflow,
  syncGmail,
  type GmailStatus,
  type GmailSyncResult,
  type PreviewRequest,
} from '../lib/workflowApi';

type Step = 'documents' | 'purchase' | 'sale';

const STEPS: Array<{ id: Step; label: string }> = [
  { id: 'documents', label: '1 · Documents & Landed Cost' },
  { id: 'purchase', label: '2 · Purchase & Inventory' },
  { id: 'sale', label: '3 · Customer Sale' },
];

type Overrides = {
  shipment?: Record<string, string | number>;
  customerInvoice?: Record<string, string | number>;
  customerInvoiceLines?: Array<{
    sku: string;
    quantity?: number;
    salesUnitPrice?: number;
    discount?: number;
    tax?: number;
  }>;
  exchangeRate?: number;
  shipmentLines?: Array<{
    sku: string;
    receivedQuantity?: number;
    vendorUnitCost?: number;
    weight?: number;
    volume?: number;
  }>;
  chargeAmounts?: Record<string, number>;
  chargeAllocationMethods?: Record<string, AllocationMethod>;
  chargeClassifications?: Record<string, ChargeClassification>;
  manualAllocations?: Record<string, Record<string, number>>;
};

export function SageIntegrationPage() {
  const [params] = useSearchParams();
  const [step, setStep] = useState<Step>('documents');
  const [mode, setMode] = useState<SafeMode>('fixture_dry_run');
  const [sourceType, setSourceType] = useState<'fixture' | 'gmail'>('fixture');
  const [sageStatus, setSageStatus] = useState<SageStatus | null>(null);
  const [gmailStatus, setGmailStatus] = useState<GmailStatus | null>(null);
  const [gmailSyncResult, setGmailSyncResult] = useState<GmailSyncResult | null>(null);
  const [gmailQuery, setGmailQuery] = useState(
    'label:"Synpath Sage Demo" has:attachment',
  );
  const [selectedMessageIds, setSelectedMessageIds] = useState<string[]>([]);
  const [preview, setPreview] = useState<WorkflowPreview | null>(null);
  const [overrides, setOverrides] = useState<Overrides>({});
  const [selections, setSelections] = useState<Record<string, unknown>>({});
  const [strategy, setStrategy] = useState<InventoryPostingStrategy>('none');
  const [confirmation, setConfirmation] = useState('');
  const [mappingConfirmed, setMappingConfirmed] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  const refreshConnections = useCallback(async () => {
    const [sage, gmail] = await Promise.all([
      fetchSageStatus().catch(() => null),
      fetchGmailStatus().catch(() => null),
    ]);
    setSageStatus(sage);
    setGmailStatus(gmail);
    if (gmail?.defaultSearch) setGmailQuery((current) => current || gmail.defaultSearch);
  }, []);

  useEffect(() => {
    void refreshConnections();
  }, [refreshConnections]);

  useEffect(() => {
    if (params.get('connected') === 'true') setNotice('Sage Accounting connected');
    if (params.get('gmail') === 'connected') setNotice('Gmail connected with read-only access');
    if (params.get('gmail') === 'failed') {
      setError(params.get('reason') ?? 'Gmail connection failed');
    }
  }, [params]);

  const request = useMemo<PreviewRequest>(
    () => ({
      mode,
      sourceType,
      searchQuery: gmailQuery,
      messageIds: selectedMessageIds,
      inventoryPostingStrategy: strategy,
      overrides: overrides as Record<string, unknown>,
      selections: { ...selections, accountingMappingConfirmed: mappingConfirmed },
    }),
    [
      mode,
      sourceType,
      gmailQuery,
      selectedMessageIds,
      strategy,
      overrides,
      selections,
      mappingConfirmed,
    ],
  );

  const loadPreview = async () => {
    setBusy(true);
    setError(null);
    setNotice(null);
    try {
      const result = await createWorkflowPreview(request);
      setPreview(result);
      setStrategy(result.run.inventoryPostingStrategy);
      setSelections({ ...result.selections });
      setNotice(
        result.bundle.fixtureExtraction
          ? 'Fixture normalized extraction loaded. Review before approval.'
          : 'Documents loaded for review.',
      );
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to build workflow preview');
    } finally {
      setBusy(false);
    }
  };

  const handleSyncGmail = async () => {
    setBusy(true);
    setError(null);
    try {
      const result = await syncGmail(gmailQuery);
      setGmailSyncResult(result);
      setSelectedMessageIds(result.messages.map((message) => message.gmailMessageId));
      await refreshConnections();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Gmail sync failed');
    } finally {
      setBusy(false);
    }
  };

  const handleMode = (next: SafeMode) => {
    setMode(next);
    if (next === 'fixture_dry_run') setSourceType('fixture');
    if (next === 'gmail_dry_run') setSourceType('gmail');
    setMappingConfirmed(false);
    setConfirmation('');
    setPreview(null);
  };

  const handleApproval = async (
    target:
      | 'purchaseInvoice'
      | 'inventoryReceipt'
      | 'customerSale'
      | 'purchaseInvoiceRelease'
      | 'salesInvoiceRelease',
  ) => {
    setBusy(true);
    setError(null);
    try {
      const result = await approveWorkflow({
        ...request,
        target,
        confirmation,
        accountingMappingConfirmed: mappingConfirmed,
        inventoryPostingStrategy: strategy,
        approvalDigest: preview?.approvalDigests[target] ?? '',
      });
      setPreview((current) => (current ? { ...current, run: result.run } : current));
      setNotice(`${target} approved`);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Approval failed');
    } finally {
      setBusy(false);
    }
  };

  const handleExecute = async (
    target:
      | 'purchase_invoice'
      | 'stock_movements'
      | 'sales_invoice'
      | 'purchase_invoice_release'
      | 'sales_invoice_release',
  ) => {
    setBusy(true);
    setError(null);
    try {
      const result = await executeWorkflow(target, request);
      const refreshed = await createWorkflowPreview(request).catch(() => ({
        ...result.preview,
        run: result.run,
      }));
      setPreview(refreshed);
      setNotice(
        result.refreshWarning ??
          (result.idempotentReplay
          ? 'Idempotent replay: no duplicate Sage write was made.'
          : `${target} completed with Sage read-back`),
      );
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Sage write failed');
    } finally {
      setBusy(false);
    }
  };

  const handleStartOver = async () => {
    await resetWorkflow();
    setPreview(null);
    setOverrides({});
    setSelections({});
    setStrategy('none');
    setConfirmation('');
    setMappingConfirmed(false);
    setNotice('Local workflow state cleared. Existing Sage accounting records were not deleted.');
  };

  const updateLine = (
    sku: string,
    field: 'receivedQuantity' | 'vendorUnitCost' | 'weight' | 'volume',
    value: number,
  ) => {
    setOverrides((current) => {
      const lines = [...(current.shipmentLines ?? [])];
      const index = lines.findIndex((line) => line.sku === sku);
      const next = index >= 0 ? { ...lines[index], [field]: value } : { sku, [field]: value };
      if (index >= 0) lines[index] = next;
      else lines.push(next);
      return { ...current, shipmentLines: lines };
    });
  };

  const updateSelection = (key: string, value: string) => {
    setSelections((current) => ({ ...current, [key]: value }));
    setPreview((current) =>
      current
        ? {
            ...current,
            selections: { ...current.selections, [key]: value },
          }
        : current,
    );
    setMappingConfirmed(false);
  };

  return (
    <SageLayout>
      <div className="mb-6 flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight text-white sm:text-3xl">
            Ghostboards Demo
          </h1>
          <p className="mt-2 max-w-3xl text-sm text-neutral-400">
            Gmail and fixture documents → normalized review → landed cost → approved Sage
            Purchase Invoice, inventory receipt and Customer Sale.
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <StatusBadge variant={sageStatus?.connected ? 'healthy' : 'danger'}>
            Sage {sageStatus?.connected ? 'Connected' : 'Disconnected'}
          </StatusBadge>
          <StatusBadge variant={mode === 'live_sage_write' ? 'danger' : 'warning'}>
            {mode === 'live_sage_write' ? 'LIVE SAGE WRITE' : 'DRY RUN'}
          </StatusBadge>
          {sageStatus?.connected ? (
            <button
              type="button"
              onClick={() => void disconnectSage().then(refreshConnections)}
              className="rounded-lg border border-neutral-700 px-3 py-2 text-xs text-neutral-300"
            >
              Disconnect Sage
            </button>
          ) : (
            <a
              href="/api/integrations/sage/connect"
              className="rounded-lg bg-white px-3 py-2 text-xs font-semibold text-black"
            >
              Connect Sage
            </a>
          )}
        </div>
      </div>

      <div className="mb-5 grid gap-2 md:grid-cols-3">
        <ModeButton
          active={mode === 'fixture_dry_run'}
          title="Fixture + Dry Run"
          description="Synthetic documents, live Sage reads, no writes"
          onClick={() => handleMode('fixture_dry_run')}
        />
        <ModeButton
          active={mode === 'gmail_dry_run'}
          title="Gmail + Dry Run"
          description="Real Gmail attachments, fixture extraction, no writes"
          onClick={() => handleMode('gmail_dry_run')}
        />
        <ModeButton
          active={mode === 'live_sage_write'}
          title="Live Sage Write"
          description="Explicit approvals, real writes and read-back"
          danger
          onClick={() => handleMode('live_sage_write')}
        />
      </div>

      {mode === 'live_sage_write' && (
        <div className="mb-5 flex flex-wrap items-center gap-3 rounded-xl border border-red-500/40 bg-red-500/10 p-4">
          <StatusBadge variant="danger">LIVE SAGE WRITE</StatusBadge>
          <span className="text-sm text-red-200">
            Source:
            <select
              value={sourceType}
              onChange={(event) => setSourceType(event.target.value as 'fixture' | 'gmail')}
              className="ml-2 rounded border border-red-400/40 bg-black px-2 py-1"
            >
              <option value="fixture">Fixture documents</option>
              <option value="gmail">Selected Gmail messages</option>
            </select>
          </span>
        </div>
      )}

      <div className="mb-5 flex flex-wrap gap-2">
        {STEPS.map((item) => (
          <button
            key={item.id}
            type="button"
            onClick={() => setStep(item.id)}
            className={`rounded-lg border px-3 py-2 text-xs font-medium ${
              step === item.id
                ? 'border-violet-500/50 bg-violet-500/15 text-violet-200'
                : 'border-neutral-800 text-neutral-400'
            }`}
          >
            {item.label}
          </button>
        ))}
        <button
          type="button"
          disabled={busy}
          onClick={() => void loadPreview()}
          className="ml-auto rounded-lg bg-white px-4 py-2 text-xs font-semibold text-black disabled:opacity-40"
        >
          {busy ? 'Working…' : preview ? 'Refresh preview' : 'Load workflow'}
        </button>
        <button
          type="button"
          disabled={busy}
          onClick={() => void handleStartOver()}
          className="rounded-lg border border-neutral-700 px-3 py-2 text-xs text-neutral-300"
        >
          Start new local run
        </button>
      </div>

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

      {preview?.validationErrors.length ? (
        <details className="mb-5 rounded-xl border border-amber-500/30 bg-amber-500/10 p-4">
          <summary className="cursor-pointer text-sm font-medium text-amber-200">
            {preview.validationErrors.length} review item(s) block posting
          </summary>
          <ul className="mt-2 list-disc space-y-1 pl-5 text-xs text-amber-100/80">
            {preview.validationErrors.map((item) => (
              <li key={item}>{item}</li>
            ))}
          </ul>
        </details>
      ) : null}

      {step === 'documents' && (
        <DocumentsLandedCostStep
          preview={preview}
          gmailStatus={gmailStatus}
          gmailSync={gmailSyncResult}
          gmailQuery={gmailQuery}
          selectedMessageIds={selectedMessageIds}
          busy={busy}
          onGmailQueryChange={setGmailQuery}
          onSyncGmail={() => void handleSyncGmail()}
          onToggleMessage={(id) =>
            setSelectedMessageIds((current) =>
              current.includes(id) ? current.filter((item) => item !== id) : [...current, id],
            )
          }
          onLineChange={updateLine}
          onShipmentFieldChange={(field, value) =>
            setOverrides((current) =>
              field === 'exchangeRate'
                ? { ...current, exchangeRate: Number(value) }
                : {
                    ...current,
                    shipment: { ...current.shipment, [field]: value },
                  },
            )
          }
          onChargeChange={(id, value) =>
            setOverrides((current) => ({
              ...current,
              chargeAmounts: { ...current.chargeAmounts, [id]: value },
            }))
          }
          onChargeMethodChange={(id, value) =>
            setOverrides((current) => ({
              ...current,
              chargeAllocationMethods: {
                ...current.chargeAllocationMethods,
                [id]: value,
              },
            }))
          }
          onChargeClassificationChange={(id, value) =>
            setOverrides((current) => ({
              ...current,
              chargeClassifications: {
                ...current.chargeClassifications,
                [id]: value,
              },
            }))
          }
          onManualAllocationChange={(id, sku, value) =>
            setOverrides((current) => ({
              ...current,
              manualAllocations: {
                ...current.manualAllocations,
                [id]: {
                  ...(current.manualAllocations?.[id] ?? {}),
                  [sku]: value,
                },
              },
            }))
          }
          onRefreshPreview={() => void loadPreview()}
        />
      )}
      {step === 'purchase' && (
        <PurchaseInventoryStep
          preview={preview}
          confirmation={confirmation}
          mappingConfirmed={mappingConfirmed}
          busy={busy}
          onConfirmationChange={setConfirmation}
          onMappingConfirmedChange={setMappingConfirmed}
          onSelectionChange={updateSelection}
          onStrategyChange={(value) => {
            setStrategy(value);
            setPreview((current) =>
              current
                ? { ...current, run: { ...current.run, inventoryPostingStrategy: value } }
                : current,
            );
          }}
          onApprove={(target) => void handleApproval(target)}
          onExecute={(target) => void handleExecute(target)}
        />
      )}
      {step === 'sale' && (
        <CustomerSaleStep
          preview={preview}
          confirmation={confirmation}
          mappingConfirmed={mappingConfirmed}
          busy={busy}
          onConfirmationChange={setConfirmation}
          onMappingConfirmedChange={setMappingConfirmed}
          onSelectionChange={updateSelection}
          onCustomerFieldChange={(field, value) =>
            setOverrides((current) => ({
              ...current,
              customerInvoice: {
                ...current.customerInvoice,
                [field]: value,
              },
            }))
          }
          onCustomerLineChange={(sku, field, value) =>
            setOverrides((current) => {
              const lines = [...(current.customerInvoiceLines ?? [])];
              const index = lines.findIndex((line) => line.sku === sku);
              const next =
                index >= 0
                  ? { ...lines[index], [field]: value }
                  : { sku, [field]: value };
              if (index >= 0) lines[index] = next;
              else lines.push(next);
              return { ...current, customerInvoiceLines: lines };
            })
          }
          onApprove={(target) => void handleApproval(target)}
          onExecute={(target) => void handleExecute(target)}
        />
      )}

      <div className="mt-6 rounded-xl border border-neutral-800 bg-[#0a0a0a] p-4 text-xs text-neutral-500">
        <p>
          Workflow state and Sage IDs are stored in an encrypted HttpOnly workflow cookie. Gmail
          attachment bytes remain in Gmail and are re-fetched by message/attachment ID; fixture
          documents are immutable test assets.
        </p>
        {gmailStatus?.connected && (
          <button
            type="button"
            onClick={() => void disconnectGmail().then(refreshConnections)}
            className="mt-3 rounded border border-neutral-700 px-2 py-1 text-neutral-300"
          >
            Disconnect Gmail
          </button>
        )}
      </div>
    </SageLayout>
  );
}

function ModeButton({
  active,
  title,
  description,
  danger,
  onClick,
}: {
  active: boolean;
  title: string;
  description: string;
  danger?: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`rounded-xl border p-4 text-left ${
        active
          ? danger
            ? 'border-red-500/50 bg-red-500/10'
            : 'border-violet-500/50 bg-violet-500/10'
          : 'border-neutral-800 bg-[#0a0a0a]'
      }`}
    >
      <span className="block text-sm font-medium text-white">{title}</span>
      <span className="mt-1 block text-xs text-neutral-500">{description}</span>
    </button>
  );
}
