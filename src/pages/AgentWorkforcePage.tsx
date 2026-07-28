import { useCallback, useEffect, useState, type ReactNode } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import {
  Bot,
  CheckCircle2,
  Circle,
  Download,
  Loader2,
  ChevronLeft,
  ChevronRight,
  Mail,
  Paperclip,
  Send,
  Sparkles,
  Trash2,
  Upload,
  X,
  Zap,
} from 'lucide-react';
import type {
  AcrylicSkuLine,
  CfoAuditRecord,
  DocumentExtract,
  PnlSummary,
  PurchaseWritePlan,
  SalesOrderPlan,
} from '../../shared/ghost';
import type { EmailStep, OutreachLead, OutreachSequence } from '../../shared/outreach';
import {
  AGENTS,
  FAKE_SALES_PIPELINE,
  FAKE_SOURCING,
  matchAgentFromPrompt,
  type AgentId,
} from '../data/agentWorkforce';
import { useSessionActivity } from '../hooks/useSessionActivity';
import {
  approveSupply,
  allocateSupply,
  confirmSales,
  createOutreachSequence,
  disconnectGmail,
  fetchAgentsStatus,
  fetchGmailStatus,
  fetchHubspotLeads,
  fetchOutreachSequences,
  fetchPnl,
  fetchSalesFromEmail,
  fetchSalesFromEmailPreview,
  fetchSupplyFromEmail,
  fetchSupplyFromEmailPreview,
  fileToBase64,
  processSales,
  processSupply,
  purgeSageDemoData,
  recalculateSupply,
  reconnectSage,
  resetSupplyAndSalesData,
  type SageWriteResult,
} from '../lib/agentsApi';

function numInputValue(n: number): string {
  return Number.isFinite(n) ? String(n) : '';
}

function parseNumInput(raw: string): number {
  if (raw.trim() === '') return 0;
  const n = Number(raw);
  return Number.isFinite(n) ? n : 0;
}

function csvEscape(value: string): string {
  return /[",\n]/.test(value) ? `"${value.replace(/"/g, '""')}"` : value;
}

/** Compact form of ln.description for the CSV only — e.g. "Ghost Gokai Acrylic 18mm x
 * 4' x 8' Clear." (41 chars, over Sage's 30-char Item Description limit) becomes
 * "GhostGokaiAcrylic 18 4x8 Clear" (30 chars). Pulls the vendor word back out of the
 * already-built description rather than re-deriving it, so it can't drift from
 * buildDescription()'s brand-word logic. */
function shortInventoryDescription(ln: AcrylicSkuLine): string {
  const vendorWord = ln.description.match(/^Ghost (\S+)/)?.[1] ?? '';
  const color = ln.color_name?.trim() || 'Clear';
  return `Ghost${vendorWord}Acrylic ${ln.thickness_mm} ${ln.size} ${color}`;
}

// Ghost Acrylics' standard GL accounts for a Stock item (confirmed against the real Sage
// company's item defaults) — StockItem.SalesAccountReference / InventoryAccountReference /
// COGSAccountReference are the ONLY place Sage resolves an account for a PurchaseInvoice
// line that carries an InventoryItemReference (confirmed via probe_purchase_invoice.py
// reflection: PurchaseInvoicePurchasesLine has no AccountReference property at all).
// Without these set on the item itself, Sage rejects the transaction with "missing a
// valid account" regardless of anything sent on the invoice/line.
const GL_SALES_ACCT = '4000';
const GL_INVENTORY_ACCT = '1200';
const GL_COGS_ACCT = '5000';

/** Item ID / Item Description / G/L Sales / G/L Inventory / G/L COGS columns, matching
 * Sage 50's Inventory Item List import fields — enough to batch-create new SKUs via
 * File → Import/Export → Import Records. No header row — Sage's import wizard maps
 * columns by position (map them to Item ID, Item Description, G/L Sales Account, G/L
 * Inventory Account, G/L COGS/Salary Acct respectively), not by name. Description is the
 * compact form (see shortInventoryDescription), truncated to 30 chars as a safety net —
 * Sage's field limit. */
function downloadInventoryCsv(plan: PurchaseWritePlan) {
  const rows = plan.lines.map(
    (ln) =>
      `${csvEscape(ln.sku_id)},${csvEscape(shortInventoryDescription(ln).slice(0, 30))},${GL_SALES_ACCT},${GL_INVENTORY_ACCT},${GL_COGS_ACCT}`,
  );
  const csv = rows.join('\r\n');
  const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `sage-inventory-items-${plan.invoice_number || 'export'}.csv`;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

function money(n: number, currency = 'USD') {
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency,
    maximumFractionDigits: 2,
  }).format(Number.isFinite(n) ? n : 0);
}

/** Live activity list: ~10 rows visible at once (scrollable within a page up to
 * 20), paginated beyond that. */
const ACTIVITY_PAGE_SIZE = 20;

const SUPPLY_PROCESSING_STAGES = [
  'Downloading PDF attachments…',
  'Reading purchase invoice…',
  'Extracting SKU lines…',
  'Calculating landed cost…',
];

const SALES_PROCESSING_STAGES = [
  'Downloading PDF attachment…',
  'Reading sales order…',
  'Extracting line items…',
  'Checking price & stock…',
];

/** Advances through `stages` on a timer (looping on the last one) until the
 * returned cleanup fn is called — used to show rough progress during a
 * single long-running fetch that has no real step-by-step signal. */
function startStageCycle(stages: string[], setStage: (s: string | null) => void): () => void {
  if (!stages.length) return () => {};
  let i = 0;
  setStage(stages[0] ?? null);
  const id = window.setInterval(() => {
    i = Math.min(i + 1, stages.length - 1);
    setStage(stages[i] ?? null);
  }, 1400);
  return () => {
    window.clearInterval(id);
    setStage(null);
  };
}

function relativeTime(iso: string) {
  const ms = Date.now() - new Date(iso).getTime();
  if (ms < 15_000) return 'just now';
  if (ms < 60_000) return `${Math.floor(ms / 1000)}s ago`;
  if (ms < 3_600_000) return `${Math.floor(ms / 60_000)}m ago`;
  return new Date(iso).toLocaleTimeString();
}

interface EmailPreview {
  from: string;
  subject: string;
  receivedAt: string;
  snippet: string;
  attachments: string[];
}

function EmailPreviewCard({ preview, stage }: { preview: EmailPreview; stage?: string | null }) {
  const nameOnly = preview.from.split('<')[0]?.trim() || preview.from;
  const initial = nameOnly.charAt(0).toUpperCase() || '?';
  return (
    <div className="mt-3 rounded-xl border border-neutral-200 bg-neutral-50 p-3">
      <div className="flex items-start gap-3">
        <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-indigo-100 text-sm font-semibold text-indigo-700">
          {initial}
        </div>
        <div className="min-w-0 flex-1">
          <div className="flex items-baseline justify-between gap-2">
            <p className="truncate text-sm font-medium text-neutral-900">{preview.from}</p>
            <span className="shrink-0 text-[11px] text-neutral-400">
              {new Date(preview.receivedAt).toLocaleString()}
            </span>
          </div>
          <p className="truncate text-sm font-semibold text-neutral-800">{preview.subject}</p>
          <p className="mt-0.5 line-clamp-2 text-xs text-neutral-500">{preview.snippet}</p>
          {preview.attachments.length ? (
            <div className="mt-2 flex flex-wrap gap-1.5">
              {preview.attachments.map((name) => (
                <span
                  key={name}
                  className="inline-flex items-center gap-1 rounded-lg border border-neutral-200 bg-white px-2 py-1 text-[11px] text-neutral-600"
                >
                  <Paperclip size={11} /> {name}
                </span>
              ))}
            </div>
          ) : null}
          {stage ? (
            <p className="mt-2 flex items-center gap-1.5 text-[11px] font-medium text-indigo-600">
              <Loader2 size={12} className="animate-spin" /> {stage}
            </p>
          ) : null}
        </div>
      </div>
    </div>
  );
}

function StatusDot({
  connected,
  label,
  connectHref,
  onConnect,
  onDisconnect,
}: {
  connected: boolean;
  label: string;
  /** Real navigation (e.g. an OAuth start route) instead of a JS handler. */
  connectHref?: string;
  onConnect?: () => void;
  onDisconnect?: () => void;
}) {
  return (
    <div className="flex items-center justify-between gap-2 text-[12px]">
      <div className="flex items-center gap-2">
        <span
          className={`h-2 w-2 rounded-full ${connected ? 'bg-emerald-500' : 'bg-rose-500'}`}
        />
        <span className="text-neutral-600">{label}</span>
        <span className={connected ? 'text-emerald-700' : 'text-rose-700'}>
          {connected ? 'Connected' : 'Disconnected'}
        </span>
      </div>
      {connected
        ? onDisconnect ? (
            <button
              type="button"
              onClick={onDisconnect}
              className="text-[11px] text-rose-600 underline-offset-2 hover:underline"
            >
              Disconnect
            </button>
          ) : null
        : connectHref ? (
            <a
              href={connectHref}
              className="text-[11px] text-emerald-700 underline-offset-2 hover:underline"
            >
              Connect
            </a>
          ) : onConnect ? (
            <button
              type="button"
              onClick={onConnect}
              className="text-[11px] text-emerald-700 underline-offset-2 hover:underline"
            >
              Connect
            </button>
          ) : null}
    </div>
  );
}

function ModalShell({
  title,
  onClose,
  children,
  wide,
}: {
  title: string;
  onClose: () => void;
  children: ReactNode;
  wide?: boolean;
}) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
      <motion.div
        initial={{ opacity: 0, y: 12 }}
        animate={{ opacity: 1, y: 0 }}
        className={`max-h-[90vh] w-full overflow-auto rounded-2xl bg-white shadow-xl ${
          wide ? 'max-w-5xl' : 'max-w-2xl'
        }`}
      >
        <div className="sticky top-0 flex items-center justify-between border-b border-neutral-200 bg-white px-5 py-4">
          <h3 className="font-display text-lg font-semibold text-neutral-900">{title}</h3>
          <button
            type="button"
            onClick={onClose}
            className="rounded-lg p-1.5 text-neutral-500 hover:bg-neutral-100"
          >
            <X size={18} />
          </button>
        </div>
        <div className="p-5">{children}</div>
      </motion.div>
    </div>
  );
}

export function AgentWorkforcePage() {
  const [agent, setAgent] = useState<AgentId>('supply');
  const [chat, setChat] = useState('');
  const activity = useSessionActivity();
  const [llmEnrich, setLlmEnrich] = useState({ connected: false, detail: '' });
  const [gmail, setGmail] = useState({ connected: false, email: '' });
  const [hubspot, setHubspot] = useState({ connected: false, detail: '' });
  const [sage, setSage] = useState({ connected: false, detail: '' });
  /** Sage 50 / HubSpot / Acrylic LLM / ZoomInfo connect state is config-driven (env vars,
   * no real per-click toggle) — these buttons just flip the displayed dot locally. */
  const [fakeToggles, setFakeToggles] = useState<Record<string, boolean>>({});
  const [sageReconnecting, setSageReconnecting] = useState(false);
  const [sageReconnectMsg, setSageReconnectMsg] = useState<string | null>(null);
  const [sageHelpModal, setSageHelpModal] = useState(false);
  const [sagePurging, setSagePurging] = useState(false);
  const [sagePurgeMsg, setSagePurgeMsg] = useState<string | null>(null);
  const [activityPage, setActivityPage] = useState(0);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Supply state
  const [purchaseFile, setPurchaseFile] = useState<File | null>(null);
  const [freightFile, setFreightFile] = useState<File | null>(null);
  const [dutyFile, setDutyFile] = useState<File | null>(null);
  const [supplyPlan, setSupplyPlan] = useState<PurchaseWritePlan | null>(null);
  const [supplyPurchase, setSupplyPurchase] = useState<DocumentExtract | null>(null);
  const [supplyFreight, setSupplyFreight] = useState<DocumentExtract | null>(null);
  const [supplyDuty, setSupplyDuty] = useState<DocumentExtract | null>(null);
  const [supplyModal, setSupplyModal] = useState(false);
  const [dimsModal, setDimsModal] = useState(false);
  const [dimEdits, setDimEdits] = useState<
    Record<number, { thickness_mm: string; size: string; quantity: string }>
  >({});
  const [poolEdit, setPoolEdit] = useState('');
  const [audit, setAudit] = useState<CfoAuditRecord | null>(null);
  const [supplyEmailPreview, setSupplyEmailPreview] = useState<EmailPreview | null>(null);
  const [supplyEmailStage, setSupplyEmailStage] = useState<string | null>(null);
  const [sageResult, setSageResult] = useState<SageWriteResult | null>(null);

  // Sales
  const [salesFile, setSalesFile] = useState<File | null>(null);
  const [salesPlan, setSalesPlan] = useState<SalesOrderPlan | null>(null);
  const [salesModal, setSalesModal] = useState(false);
  const [salesSageResult, setSalesSageResult] = useState<SageWriteResult | null>(null);
  const [salesConfirmed, setSalesConfirmed] = useState(false);
  const [salesEmailPreview, setSalesEmailPreview] = useState<EmailPreview | null>(null);
  const [salesEmailStage, setSalesEmailStage] = useState<string | null>(null);

  // Outreach
  const [leads, setLeads] = useState<OutreachLead[]>([]);
  const [selectedLeadIds, setSelectedLeadIds] = useState<string[]>([]);
  const [leadMenuOpen, setLeadMenuOpen] = useState(false);
  const [outreachSteps, setOutreachSteps] = useState<EmailStep[]>([
    {
      subject: 'Quick follow-up from Synpath',
      body: 'Hi {{name}} — following up on acrylic sheet pricing and lead times for {{company}}. Happy to send a quote this week.',
      delayDays: 0,
    },
  ]);
  const [sequences, setSequences] = useState<OutreachSequence[]>([]);

  // Intelligence
  const [pnl, setPnl] = useState<PnlSummary | null>(null);

  const refreshIntegrations = useCallback(async () => {
    try {
      const [agentsStatus, gmailStatus] = await Promise.all([
        fetchAgentsStatus(),
        fetchGmailStatus(),
      ]);
      setLlmEnrich({
        connected: Boolean(agentsStatus.acrylicLlmEnrich?.configured),
        detail: agentsStatus.acrylicLlmEnrich?.detail || '',
      });
      setGmail({
        connected: gmailStatus.connected,
        email: gmailStatus.emailAddress || '',
      });
      setHubspot({
        connected: Boolean(agentsStatus.hubspot?.connected),
        detail: agentsStatus.hubspot?.detail || '',
      });
      setSage({
        connected: agentsStatus.sage.connected,
        detail: agentsStatus.sage.detail,
      });
    } catch {
      /* ignore */
    }
  }, []);

  const retrySageConnection = async () => {
    setSageReconnecting(true);
    setSageReconnectMsg(null);
    try {
      const result = await reconnectSage();
      setSageReconnectMsg(result.detail);
      if (!result.ok) setSageHelpModal(true);
      await refreshIntegrations();
    } catch (e) {
      setSageReconnectMsg(e instanceof Error ? e.message : String(e));
      setSageHelpModal(true);
    } finally {
      setSageReconnecting(false);
    }
  };

  const runPurgeSageDemoData = async () => {
    if (
      !window.confirm(
        'This permanently deletes every Order, Invoice, Vendor, and Customer in the ' +
          'connected Sage company — inventory items stay. Sage has no undo. Continue?',
      )
    ) {
      return;
    }
    setSagePurging(true);
    setSagePurgeMsg(null);
    try {
      const result = await purgeSageDemoData();
      if (!result.ok) {
        setSagePurgeMsg(result.error || 'Purge failed.');
      } else {
        const parts = Object.entries(result.deleted || {}).map(([k, v]) => `${k}: ${v}`);
        const failedParts = Object.entries(result.failed || {}).flatMap(([k, ids]) =>
          ids.map((id) => `${k} ${id}`),
        );
        setSagePurgeMsg(
          `Deleted — ${parts.join(', ') || 'nothing to delete'}.` +
            (failedParts.length ? ` Could not delete: ${failedParts.join('; ')}.` : ''),
        );
      }
    } catch (e) {
      setSagePurgeMsg(e instanceof Error ? e.message : String(e));
    } finally {
      setSagePurging(false);
    }
  };

  const loadHubspotLeads = useCallback(async () => {
    setBusy(true);
    setError(null);
    try {
      const result = await fetchHubspotLeads();
      setLeads(result.leads);
      setLeadMenuOpen(true);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  }, []);

  const toggleLeadSelected = (id: string) => {
    setSelectedLeadIds((prev) => (prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]));
  };

  const loadSequences = useCallback(async () => {
    try {
      const result = await fetchOutreachSequences();
      setSequences(result.sequences);
    } catch {
      /* ignore */
    }
  }, []);

  const loadPnl = useCallback(async () => {
    try {
      const result = await fetchPnl();
      setPnl(result.pnl);
    } catch {
      /* ignore */
    }
  }, []);

  useEffect(() => {
    void refreshIntegrations();
    const params = new URLSearchParams(window.location.search);
    if (params.get('agent') === 'outreach') setAgent('outreach');
    if (params.get('gmail') === 'connected') {
      setAgent('outreach');
      void refreshIntegrations();
    }
  }, [refreshIntegrations]);

  useEffect(() => {
    if (agent === 'outreach') void loadSequences();
    if (agent === 'intelligence') void loadPnl();
  }, [agent, loadSequences, loadPnl]);

  const openFromChat = () => {
    const matched = matchAgentFromPrompt(chat) ?? agent;
    setAgent(matched);
    setChat('');
  };

  const runSupply = async () => {
    if (!purchaseFile) {
      setError('Purchase invoice PDF is required');
      return;
    }
    setBusy(true);
    setError(null);
    setAudit(null);
    try {
      const purchasePdfBase64 = await fileToBase64(purchaseFile);
      const freightPdfBase64 = freightFile ? await fileToBase64(freightFile) : undefined;
      const dutyPdfBase64 = dutyFile ? await fileToBase64(dutyFile) : undefined;
      const result = await processSupply({
        purchasePdfBase64,
        freightPdfBase64,
        dutyPdfBase64,
      });
      setSupplyPurchase(result.purchase ?? null);
      setSupplyFreight(result.freight ?? null);
      setSupplyDuty(result.duty ?? null);

      if (result.code === 'MISSING_ACRYLIC_DIMS' && result.purchase) {
        const edits: Record<number, { thickness_mm: string; size: string; quantity: string }> =
          {};
        result.purchase.lines.forEach((ln, index) => {
          if (!ln.is_acrylic || ln.line_kind !== 'acrylic') return;
          edits[index] = {
            thickness_mm: ln.thickness_mm != null ? String(ln.thickness_mm) : '',
            size: ln.size ?? '',
            quantity: String(ln.quantity || ''),
          };
        });
        setDimEdits(edits);
        setDimsModal(true);
        setError(
          'Set OPENAI_API_KEY (ai_erp LLM enrich) or fill thickness/size manually to continue.',
        );
        return;
      }

      if (!result.plan) throw new Error(result.error || 'No plan returned');
      setSupplyPlan(result.plan);
      setPoolEdit(String(result.plan.landed.import_pool.toFixed(2)));
      setSupplyModal(true);
      activity.push(
        'Supply & Costing',
        `${result.plan.invoice_number} · ${result.plan.landed.method} $${result.plan.landed.import_pool.toFixed(0)} → ${result.plan.lines.length} SKUs · preview`,
        'ready',
      );
      void refreshIntegrations();
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  };

  const runSupplyFromEmail = async () => {
    setBusy(true);
    setError(null);
    setAudit(null);
    setSupplyEmailPreview(null);
    let stopStages: (() => void) | null = null;
    try {
      const preview = await fetchSupplyFromEmailPreview();
      if (!preview.ok || !preview.emailSource) {
        throw new Error(preview.error || 'No matching email found');
      }
      const messageId = preview.emailSource.messageId;
      setSupplyEmailPreview({
        from: preview.emailSource.from,
        subject: preview.emailSource.subject,
        receivedAt: preview.emailSource.receivedAt,
        snippet: preview.emailSource.snippet,
        attachments: preview.emailSource.fileNames,
      });

      stopStages = startStageCycle(SUPPLY_PROCESSING_STAGES, setSupplyEmailStage);
      const result = await fetchSupplyFromEmail(messageId);
      setSupplyPurchase(result.purchase ?? null);
      setSupplyFreight(result.freight ?? null);
      setSupplyDuty(result.duty ?? null);

      if (result.code === 'MISSING_ACRYLIC_DIMS' && result.purchase) {
        const edits: Record<number, { thickness_mm: string; size: string; quantity: string }> =
          {};
        result.purchase.lines.forEach((ln, index) => {
          if (!ln.is_acrylic || ln.line_kind !== 'acrylic') return;
          edits[index] = {
            thickness_mm: ln.thickness_mm != null ? String(ln.thickness_mm) : '',
            size: ln.size ?? '',
            quantity: String(ln.quantity || ''),
          };
        });
        setDimEdits(edits);
        setDimsModal(true);
        setError(
          'Set OPENAI_API_KEY (ai_erp LLM enrich) or fill thickness/size manually to continue.',
        );
        return;
      }

      if (!result.plan) throw new Error(result.error || 'No plan returned');
      setSupplyPlan(result.plan);
      setPoolEdit(String(result.plan.landed.import_pool.toFixed(2)));
      setSupplyModal(true);
      const src = result.emailSource;
      activity.push(
        'Supply & Costing',
        `${result.plan.invoice_number} · from email "${src?.subject ?? ''}" (${src?.fileNames.purchase ?? 'attachment'}) · ${result.plan.landed.method} $${result.plan.landed.import_pool.toFixed(0)} → ${result.plan.lines.length} SKUs · preview`,
        'ready',
      );
      void refreshIntegrations();
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      stopStages?.();
      setBusy(false);
    }
  };

  const continueWithDims = async () => {
    if (!supplyPurchase) return;
    setBusy(true);
    setError(null);
    try {
      const linePatches = Object.keys(dimEdits).map((key) => {
        const edit = dimEdits[Number(key)]!;
        return {
          index: Number(key),
          thickness_mm: edit.thickness_mm ? Number(edit.thickness_mm) : undefined,
          size: edit.size || undefined,
          quantity: edit.quantity ? Number(edit.quantity) : undefined,
        };
      });
      const result = await allocateSupply({
        purchase: supplyPurchase,
        freight: supplyFreight,
        duty: supplyDuty,
        linePatches,
      });
      setSupplyPurchase(result.purchase);
      setSupplyPlan(result.plan);
      setPoolEdit(String(result.plan.landed.import_pool.toFixed(2)));
      setDimsModal(false);
      setSupplyModal(true);
      activity.push(
        'Supply & Costing',
        `${result.plan.invoice_number} · ${result.plan.landed.method} $${result.plan.landed.import_pool.toFixed(0)} → ${result.plan.lines.length} SKUs · preview`,
        'ready',
      );
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  };

  const recalcSupply = async () => {
    if (!supplyPlan) return;
    setBusy(true);
    try {
      const result = await recalculateSupply({
        lines: supplyPlan.lines,
        importPool: Number(poolEdit),
        method: supplyPlan.landed.method,
        freightAmount: supplyPlan.landed.freight_amount,
        dutyAmount: supplyPlan.landed.duty_amount,
        invoiceTotal: supplyPlan.landed.invoice_total,
        ddpAmount: supplyPlan.landed.ddp_amount,
      });
      setSupplyPlan({
        ...supplyPlan,
        lines: result.lines,
        landed: result.breakdown,
      });
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  };

  const updateLine = (index: number, patch: Partial<AcrylicSkuLine>) => {
    if (!supplyPlan) return;
    const pool = Number(poolEdit || supplyPlan.landed.import_pool || 0);
    const patched = supplyPlan.lines.map((ln, i) => (i === index ? { ...ln, ...patch } : ln));
    const totalWeight = patched.reduce((sum, ln) => sum + ln.sheet_weight_kg * ln.quantity, 0);
    const perKg = totalWeight > 0 ? pool / totalWeight : 0;
    const lines = patched.map((ln) => {
      const decimals = ln.price_decimals ?? 3;
      const land = Number((ln.sheet_weight_kg * perKg).toFixed(decimals));
      const landed = Number((ln.raw_unit_price + land).toFixed(decimals));
      return {
        ...ln,
        land_cost_per_sheet: land,
        landed_unit_cost: landed,
        amount: ln.quantity * landed,
      };
    });
    setSupplyPlan({
      ...supplyPlan,
      lines,
      landed: {
        ...supplyPlan.landed,
        import_pool: pool,
        total_weight_kg: totalWeight,
        import_cost_per_kg: perKg,
        total_acrylic_product_cost: lines.reduce(
          (sum, ln) => sum + ln.raw_unit_price * ln.quantity,
          0,
        ),
      },
    });
  };

  const cfoApprove = async (writeToSage = false) => {
    if (!supplyPlan) return;
    setBusy(true);
    setSageResult(null);
    try {
      const result = await approveSupply(supplyPlan, { confirmSageWrite: writeToSage });
      setAudit(result.audit);
      if (result.sageResult) setSageResult(result.sageResult);
      activity.push(
        'Supply & Costing',
        writeToSage && result.sageResult
          ? `${result.audit.invoiceNumber} · PO ${result.sageResult.poReference ?? '—'} / Receive ${result.sageResult.receiveReference ?? '—'} · written to Sage 50`
          : `${result.audit.invoiceNumber} · ${result.audit.method} $${result.audit.pool.toFixed(0)} → ${result.audit.lineSkus.length} SKUs · approved (preview only)`,
        writeToSage && result.sageResult ? 'written' : 'approved',
      );
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  };

  const runSales = async () => {
    if (!salesFile) {
      setError('Sales PDF is required');
      return;
    }
    setBusy(true);
    setError(null);
    setSalesSageResult(null);
    setSalesConfirmed(false);
    try {
      const pdfBase64 = await fileToBase64(salesFile);
      const result = await processSales({ pdfBase64 });
      setSalesPlan(result.plan);
      setSalesModal(true);
      activity.push(
        'Sales Order',
        `${result.plan.customer} · ${result.plan.lines.length} lines · ${
          result.plan.needs_review ? 'review' : 'preview'
        }`,
        result.plan.needs_review ? 'review' : 'ready',
      );
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  };

  const runSalesFromEmail = async () => {
    setBusy(true);
    setError(null);
    setSalesSageResult(null);
    setSalesConfirmed(false);
    setSalesEmailPreview(null);
    let stopStages: (() => void) | null = null;
    try {
      const preview = await fetchSalesFromEmailPreview();
      if (!preview.ok || !preview.emailSource) {
        throw new Error(preview.error || 'No matching email found');
      }
      const messageId = preview.emailSource.messageId;
      setSalesEmailPreview({
        from: preview.emailSource.from,
        subject: preview.emailSource.subject,
        receivedAt: preview.emailSource.receivedAt,
        snippet: preview.emailSource.snippet,
        attachments: preview.emailSource.fileNames,
      });

      stopStages = startStageCycle(SALES_PROCESSING_STAGES, setSalesEmailStage);
      const result = await fetchSalesFromEmail(messageId);
      setSalesPlan(result.plan);
      setSalesModal(true);
      const src = result.emailSource;
      activity.push(
        'Sales Order',
        `${result.plan.customer} · from email "${src?.subject ?? ''}" (${src?.fileName ?? 'attachment'}) · ${result.plan.lines.length} lines · ${
          result.plan.needs_review ? 'review' : 'preview'
        }`,
        result.plan.needs_review ? 'review' : 'ready',
      );
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      stopStages?.();
      setBusy(false);
    }
  };

  const confirmSalesOrder = async (writeToSage: boolean) => {
    if (!salesPlan) return;
    setBusy(true);
    setError(null);
    try {
      const result = await confirmSales(salesPlan, { confirmSageWrite: writeToSage });
      setSalesConfirmed(true);
      if (result.sageResult) setSalesSageResult(result.sageResult);
      activity.push(
        'Sales Order',
        writeToSage && result.sageResult
          ? `${salesPlan.customer} · SO ${result.sageResult.soReference ?? '—'} / Invoice ${result.sageResult.invoiceReference ?? '—'} · written to Sage 50`
          : `${salesPlan.customer} · confirmed (preview only)`,
        writeToSage && result.sageResult ? 'written' : 'confirmed',
      );
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  };

  const updateOutreachStep = (index: number, patch: Partial<EmailStep>) => {
    setOutreachSteps((prev) => prev.map((s, i) => (i === index ? { ...s, ...patch } : s)));
  };

  const addFollowupStep = () => {
    setOutreachSteps((prev) =>
      prev.length >= 3 ? prev : [...prev, { subject: 'Following up', body: '', delayDays: 3 }],
    );
  };

  const removeFollowupStep = (index: number) => {
    setOutreachSteps((prev) => (prev.length <= 1 ? prev : prev.filter((_, i) => i !== index)));
  };

  const insertVariable = (index: number, field: 'subject' | 'body', variable: 'name' | 'company') => {
    setOutreachSteps((prev) =>
      prev.map((s, i) => (i === index ? { ...s, [field]: `${s[field]}{{${variable}}}` } : s)),
    );
  };

  const runOutreach = async () => {
    const picked = leads.filter((l) => selectedLeadIds.includes(l.id));
    if (!picked.length) {
      setError('Check at least one lead from HubSpot first');
      return;
    }
    setBusy(true);
    setError(null);
    const today = new Date().toISOString().slice(0, 10);
    const failures: string[] = [];
    try {
      for (const lead of picked) {
        try {
          const result = await createOutreachSequence({
            lead,
            steps: outreachSteps,
            startDate: today,
          });
          setSequences((prev) => [result.sequence, ...prev]);
        } catch (e) {
          failures.push(`${lead.name}: ${e instanceof Error ? e.message : String(e)}`);
        }
      }
      const sentCount = picked.length - failures.length;
      if (sentCount) {
        activity.push(
          'Outreach',
          `Initial email sent now to ${sentCount} lead(s); ${outreachSteps.length - 1} follow-up(s) scheduled`,
          'sent',
        );
      }
      if (failures.length) setError(failures.join(' | '));
      else setSelectedLeadIds([]);
    } finally {
      setBusy(false);
    }
  };

  const runIntelligence = async () => {
    try {
      const result = await fetchPnl();
      setPnl(result.pnl);
      activity.push(
        'Intelligence',
        `refreshed P&L · revenue ${money(result.pnl.total_revenue)} · ${result.pnl.sku_margins.length} SKU margins`,
        'viewed',
      );
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    }
  };

  const runResetData = async () => {
    if (
      !window.confirm(
        'This permanently deletes every stored Supply & Costing SKU record and every Sales Order record. This cannot be undone. Continue?',
      )
    ) {
      return;
    }
    setBusy(true);
    setError(null);
    try {
      await resetSupplyAndSalesData();
      setPnl(null);
      activity.push('Intelligence', 'Cleared all Supply & Costing and Sales Order data', 'reset');
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  };

  const runSourcing = () => {
    activity.push(
      'Smart Sourcing',
      `RFQ ${FAKE_SOURCING.item} · recommended ${FAKE_SOURCING.recommended}`,
      'recommended',
    );
  };

  const active = AGENTS.find((a) => a.id === agent)!;

  const activityTotalPages = Math.max(1, Math.ceil(activity.events.length / ACTIVITY_PAGE_SIZE));
  const activityPageClamped = Math.min(activityPage, activityTotalPages - 1);
  const activityPageEvents = activity.events.slice(
    activityPageClamped * ACTIVITY_PAGE_SIZE,
    activityPageClamped * ACTIVITY_PAGE_SIZE + ACTIVITY_PAGE_SIZE,
  );

  return (
    <div className="min-h-screen bg-[#f3f4f6] text-neutral-900">
      <header className="border-b border-neutral-200 bg-white">
        <div className="mx-auto flex max-w-[1400px] items-center justify-between px-4 py-3 sm:px-6">
            <div className="flex items-center gap-3">
              <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-neutral-900 text-white">
                <Zap size={18} />
              </div>
              <div>
                <p className="font-display text-base font-semibold tracking-tight">Synpath</p>
                <p className="text-[11px] text-neutral-500">Agent workforce demo</p>
              </div>
              <nav className="ml-2 hidden items-center rounded-lg border border-neutral-200 bg-neutral-50 p-0.5 text-xs sm:inline-flex">
                <a href="/" className="rounded-md px-2.5 py-1 text-neutral-600 hover:text-neutral-900">
                  Operations
                </a>
                <span className="rounded-md bg-neutral-900 px-2.5 py-1 font-medium text-white">
                  Agents
                </span>
                <a
                  href="/sage-integration"
                  className="rounded-md px-2.5 py-1 text-neutral-600 hover:text-neutral-900"
                >
                  Sage
                </a>
              </nav>
            </div>
            <div className="flex items-center gap-3 text-xs text-neutral-500 sm:hidden">
              <a href="/" className="underline-offset-2 hover:underline">
                Ops
              </a>
              <a href="/sage-integration" className="underline-offset-2 hover:underline">
                Sage
              </a>
            </div>
        </div>
      </header>

      <div className="mx-auto grid max-w-[1400px] gap-4 px-4 py-4 lg:grid-cols-[1fr_360px] sm:px-6">
        {/* Left column */}
        <div className="space-y-4">
          <section className="rounded-2xl border border-neutral-200 bg-white p-4 shadow-sm">
            <div className="mb-3 flex items-center justify-between">
              <h2 className="font-display text-sm font-semibold uppercase tracking-wide text-neutral-500">
                Agents
              </h2>
              <span className="rounded-full bg-emerald-50 px-2 py-0.5 text-[10px] font-medium text-emerald-700">
                LIVE
              </span>
            </div>
            <div className="grid gap-2 sm:grid-cols-2 xl:grid-cols-3">
              {AGENTS.map((item) => (
                <button
                  key={item.id}
                  type="button"
                  onClick={() => setAgent(item.id)}
                  className={`rounded-xl border px-3 py-3 text-left transition ${
                    agent === item.id
                      ? 'border-neutral-900 bg-neutral-900 text-white'
                      : 'border-neutral-200 bg-white hover:border-neutral-400'
                  }`}
                >
                  <div className="flex items-center gap-2">
                    <Bot size={14} className={agent === item.id ? 'text-white' : 'text-neutral-500'} />
                    <span className="text-sm font-medium">{item.title}</span>
                  </div>
                  <p
                    className={`mt-1 text-[11px] leading-snug ${
                      agent === item.id ? 'text-neutral-300' : 'text-neutral-500'
                    }`}
                  >
                    {item.blurb}
                  </p>
                </button>
              ))}
            </div>
          </section>

          <section className="rounded-2xl border border-neutral-200 bg-white p-5 shadow-sm">
            <div className="mb-4 flex items-start justify-between gap-3">
              <div>
                <h2 className="font-display text-xl font-semibold">{active.title}</h2>
                <p className="mt-1 text-sm text-neutral-500">{active.blurb}</p>
              </div>
              {busy ? <Loader2 className="animate-spin text-neutral-400" size={18} /> : null}
            </div>

            {error ? (
              <div className="mb-4 rounded-xl border border-rose-200 bg-rose-50 px-3 py-2 text-sm text-rose-800">
                {error}
              </div>
            ) : null}

            {agent === 'supply' ? (
              <div className="space-y-4">
                <FileField
                  label="Purchase invoice (required)"
                  file={purchaseFile}
                  onChange={setPurchaseFile}
                />
                <div className="grid gap-3 sm:grid-cols-2">
                  <FileField label="Freight (optional)" file={freightFile} onChange={setFreightFile} />
                  <FileField label="Duty (optional)" file={dutyFile} onChange={setDutyFile} />
                </div>
                <button
                  type="button"
                  disabled={busy}
                  onClick={() => void runSupply()}
                  className="inline-flex items-center gap-2 rounded-xl bg-neutral-900 px-4 py-2.5 text-sm font-medium text-white disabled:opacity-50"
                >
                  <Upload size={16} /> Run Supply & Costing
                </button>

                <div className="flex items-center gap-3 text-xs text-neutral-400">
                  <div className="h-px flex-1 bg-neutral-200" />
                  or
                  <div className="h-px flex-1 bg-neutral-200" />
                </div>

                <div>
                  <button
                    type="button"
                    disabled={busy || !gmail.connected}
                    onClick={() => void runSupplyFromEmail()}
                    className="inline-flex items-center gap-2 rounded-xl border border-neutral-300 px-4 py-2.5 text-sm font-medium text-neutral-800 disabled:opacity-50"
                  >
                    <Mail size={16} /> Fetch latest PO from email
                  </button>
                  <p className="mt-1 text-xs text-neutral-500">
                    Pulls the PDF(s) from the newest email labeled "synpath pricing" with "PO" in
                    the subject.
                    {gmail.connected ? null : ' Connect Gmail on the Outreach tab first.'}
                  </p>
                  {supplyEmailPreview ? (
                    <EmailPreviewCard preview={supplyEmailPreview} stage={supplyEmailStage} />
                  ) : null}
                </div>

                <div className="mt-2 border-t border-neutral-200 pt-4">
                  <button
                    type="button"
                    disabled={sagePurging}
                    onClick={() => void runPurgeSageDemoData()}
                    className="inline-flex items-center gap-2 rounded-xl border border-rose-300 px-3 py-2 text-xs font-medium text-rose-700 disabled:opacity-50"
                  >
                    <Trash2 size={14} />
                    {sagePurging ? 'Purging Sage…' : 'Reset for demo (Sage)'}
                  </button>
                  <p className="mt-1 text-xs text-neutral-500">
                    Permanently deletes every Order, Invoice, Vendor, and Customer in the
                    connected Sage company — inventory items stay. No undo. Demo companies only.
                  </p>
                  {sagePurgeMsg ? (
                    <p className="mt-1 text-[11px] text-neutral-500">{sagePurgeMsg}</p>
                  ) : null}
                </div>
              </div>
            ) : null}

            {agent === 'sales' ? (
              <div className="space-y-4">
                <FileField label="Customer order / quote PDF" file={salesFile} onChange={setSalesFile} />
                <button
                  type="button"
                  disabled={busy}
                  onClick={() => void runSales()}
                  className="inline-flex items-center gap-2 rounded-xl bg-neutral-900 px-4 py-2.5 text-sm font-medium text-white disabled:opacity-50"
                >
                  <Upload size={16} /> Process Sales Order
                </button>

                <div className="flex items-center gap-3 text-xs text-neutral-400">
                  <div className="h-px flex-1 bg-neutral-200" />
                  or
                  <div className="h-px flex-1 bg-neutral-200" />
                </div>

                <div>
                  <button
                    type="button"
                    disabled={busy || !gmail.connected}
                    onClick={() => void runSalesFromEmail()}
                    className="inline-flex items-center gap-2 rounded-xl border border-neutral-300 px-4 py-2.5 text-sm font-medium text-neutral-800 disabled:opacity-50"
                  >
                    <Mail size={16} /> Fetch latest SO from email
                  </button>
                  <p className="mt-1 text-xs text-neutral-500">
                    Pulls the PDF from the newest email labeled "synpath pricing" with "SO" in the
                    subject.
                    {gmail.connected ? null : ' Connect Gmail on the Outreach tab first.'}
                  </p>
                  {salesEmailPreview ? (
                    <EmailPreviewCard preview={salesEmailPreview} stage={salesEmailStage} />
                  ) : null}
                </div>
              </div>
            ) : null}

            {agent === 'outreach' ? (
              <div className="space-y-4">
                <div className="flex flex-wrap items-center gap-3">
                  {gmail.connected ? (
                    <>
                      <span className="text-sm text-emerald-700">Connected as {gmail.email}</span>
                      <button
                        type="button"
                        className="rounded-lg border border-neutral-300 px-3 py-1.5 text-xs"
                        onClick={() => void disconnectGmail().then(refreshIntegrations)}
                      >
                        Disconnect
                      </button>
                    </>
                  ) : (
                    <a
                      href="/api/gmail/oauth/connect"
                      className="inline-flex items-center gap-2 rounded-xl bg-neutral-900 px-4 py-2.5 text-sm font-medium text-white"
                    >
                      <Mail size={16} /> Connect Gmail
                    </a>
                  )}
                  <span className={`text-xs ${hubspot.connected ? 'text-emerald-700' : 'text-neutral-500'}`}>
                    HubSpot: {hubspot.connected ? 'connected' : hubspot.detail || 'not connected'}
                  </span>
                </div>

                <div className="relative">
                  <div className="flex items-center justify-between">
                    <p className="text-xs font-medium text-neutral-600">Leads (from HubSpot)</p>
                    <button
                      type="button"
                      disabled={busy}
                      onClick={() => void loadHubspotLeads()}
                      className="text-xs font-medium text-neutral-600 underline disabled:opacity-50"
                    >
                      Load leads
                    </button>
                  </div>
                  <button
                    type="button"
                    onClick={() => setLeadMenuOpen((o) => !o)}
                    className="mt-1 flex w-full items-center justify-between rounded-xl border border-neutral-300 px-3 py-2 text-left text-sm"
                  >
                    <span className={selectedLeadIds.length ? '' : 'text-neutral-400'}>
                      {selectedLeadIds.length
                        ? `${selectedLeadIds.length} lead${selectedLeadIds.length > 1 ? 's' : ''} selected`
                        : leads.length
                          ? 'Check leads to email'
                          : 'Load leads first'}
                    </span>
                    <span className="text-neutral-400">{leadMenuOpen ? '▲' : '▼'}</span>
                  </button>
                  {leadMenuOpen && leads.length ? (
                    <div className="absolute z-10 mt-1 max-h-56 w-full overflow-auto rounded-xl border border-neutral-200 bg-white p-1.5 shadow-lg">
                      {leads.map((l) => (
                        <label
                          key={l.id}
                          className="flex items-center gap-2 rounded-lg px-2 py-1.5 text-sm hover:bg-neutral-50"
                        >
                          <input
                            type="checkbox"
                            checked={selectedLeadIds.includes(l.id)}
                            onChange={() => toggleLeadSelected(l.id)}
                          />
                          <span>
                            {l.name} · {l.company} · <span className="text-neutral-500">{l.email}</span>
                          </span>
                        </label>
                      ))}
                    </div>
                  ) : null}
                </div>

                <div className="space-y-3">
                  {outreachSteps.map((step, i) => (
                    <div key={i} className="rounded-xl border border-neutral-200 p-3">
                      <div className="mb-2 flex items-center justify-between">
                        <p className="text-xs font-semibold uppercase text-neutral-500">
                          {i === 0 ? 'Initial email' : `Follow-up ${i}`}
                        </p>
                        {i > 0 ? (
                          <button
                            type="button"
                            onClick={() => removeFollowupStep(i)}
                            className="text-xs text-rose-600"
                          >
                            Remove
                          </button>
                        ) : null}
                      </div>
                      {i > 0 ? (
                        <label className="mb-2 block text-xs text-neutral-600">
                          Days after previous email
                          <input
                            type="number"
                            min={1}
                            value={step.delayDays}
                            onChange={(e) =>
                              updateOutreachStep(i, { delayDays: Number(e.target.value) || 1 })
                            }
                            className="mt-1 w-24 rounded-lg border border-neutral-300 px-2 py-1 text-sm"
                          />
                        </label>
                      ) : null}
                      <label className="block text-xs text-neutral-600">
                        Subject
                        <input
                          value={step.subject}
                          onChange={(e) => updateOutreachStep(i, { subject: e.target.value })}
                          className="mt-1 w-full rounded-lg border border-neutral-300 px-2 py-1.5 text-sm"
                        />
                      </label>
                      <div className="mt-1 flex gap-1">
                        <button
                          type="button"
                          onClick={() => insertVariable(i, 'subject', 'name')}
                          className="rounded border border-neutral-300 px-1.5 py-0.5 text-[10px] text-neutral-600"
                        >
                          + name
                        </button>
                        <button
                          type="button"
                          onClick={() => insertVariable(i, 'subject', 'company')}
                          className="rounded border border-neutral-300 px-1.5 py-0.5 text-[10px] text-neutral-600"
                        >
                          + company
                        </button>
                      </div>
                      <label className="mt-2 block text-xs text-neutral-600">
                        Body
                        <textarea
                          value={step.body}
                          onChange={(e) => updateOutreachStep(i, { body: e.target.value })}
                          rows={4}
                          className="mt-1 w-full rounded-lg border border-neutral-300 px-2 py-1.5 text-sm"
                        />
                      </label>
                      <div className="mt-1 flex gap-1">
                        <button
                          type="button"
                          onClick={() => insertVariable(i, 'body', 'name')}
                          className="rounded border border-neutral-300 px-1.5 py-0.5 text-[10px] text-neutral-600"
                        >
                          + name
                        </button>
                        <button
                          type="button"
                          onClick={() => insertVariable(i, 'body', 'company')}
                          className="rounded border border-neutral-300 px-1.5 py-0.5 text-[10px] text-neutral-600"
                        >
                          + company
                        </button>
                      </div>
                    </div>
                  ))}
                  {outreachSteps.length < 3 ? (
                    <button
                      type="button"
                      onClick={addFollowupStep}
                      className="w-full rounded-lg border border-dashed border-neutral-300 px-3 py-2 text-xs text-neutral-600"
                    >
                      + Add follow-up email
                    </button>
                  ) : null}
                </div>

                <button
                  type="button"
                  disabled={busy || !gmail.connected || !selectedLeadIds.length}
                  onClick={() => void runOutreach()}
                  className="inline-flex items-center gap-2 rounded-xl bg-neutral-900 px-4 py-2.5 text-sm font-medium text-white disabled:opacity-50"
                >
                  <Send size={16} /> Send now + schedule follow-ups
                </button>

                {sequences.length ? (
                  <div className="mt-4">
                    <p className="mb-2 text-xs font-semibold uppercase text-neutral-500">
                      Scheduled sequences
                    </p>
                    <ul className="space-y-2 text-xs">
                      {sequences.map((seq) => (
                        <li key={seq.id} className="rounded-lg border border-neutral-200 p-2">
                          <p className="font-medium">
                            {seq.lead.name} · {seq.lead.company}{' '}
                            <span className="text-neutral-400">({seq.status})</span>
                          </p>
                          <p className="text-neutral-500">{seq.lead.email}</p>
                          <ul className="mt-1 space-y-0.5 text-neutral-600">
                            {seq.stepState.map((s, i) => (
                              <li key={i}>
                                Step {i + 1}:{' '}
                                {s.sentAt
                                  ? `sent ${new Date(s.sentAt).toLocaleDateString()}`
                                  : `scheduled ${s.scheduledFor}`}
                                {s.error ? (
                                  <span className="text-rose-600"> · error: {s.error}</span>
                                ) : null}
                              </li>
                            ))}
                          </ul>
                        </li>
                      ))}
                    </ul>
                  </div>
                ) : null}
              </div>
            ) : null}

            {agent === 'intelligence' ? (
              <div className="space-y-8">
                <div className="space-y-4">
                  <div className="flex items-center justify-between">
                    <h4 className="font-display text-base font-semibold">P&L</h4>
                    <div className="flex items-center gap-2">
                      <button
                        type="button"
                        disabled={busy}
                        onClick={() => void runResetData()}
                        className="rounded-xl border border-rose-300 px-3 py-2 text-xs font-medium text-rose-700 disabled:opacity-50"
                      >
                        Clear all SO & Supply data
                      </button>
                      <button
                        type="button"
                        onClick={() => void runIntelligence()}
                        className="inline-flex items-center gap-2 rounded-xl bg-neutral-900 px-4 py-2.5 text-sm font-medium text-white"
                      >
                        <Sparkles size={16} /> Refresh P&L
                      </button>
                    </div>
                  </div>

                  <div className="grid gap-3 sm:grid-cols-3">
                    <div className="rounded-xl bg-neutral-50 px-3 py-3">
                      <p className="text-[11px] text-neutral-500">Total revenue</p>
                      <p className="mt-1 font-display text-lg font-semibold">
                        {money(pnl?.total_revenue ?? 0)}
                      </p>
                    </div>
                    <div className="rounded-xl bg-neutral-50 px-3 py-3">
                      <p className="text-[11px] text-neutral-500">Total land cost</p>
                      <p className="mt-1 font-display text-lg font-semibold">
                        {money(pnl?.total_land_cost ?? 0)}
                      </p>
                    </div>
                    <div className="rounded-xl bg-neutral-50 px-3 py-3">
                      <p className="text-[11px] text-neutral-500">Total cost</p>
                      <p className="mt-1 font-display text-lg font-semibold">
                        {money(pnl?.total_cost ?? 0)}
                      </p>
                    </div>
                  </div>

                  <div>
                    <p className="mb-2 text-xs font-medium uppercase tracking-wide text-neutral-500">
                      Top 3 customers by amount
                    </p>
                    {pnl?.top_customers.length ? (
                      <ul className="space-y-1 text-sm">
                        {pnl.top_customers.map((c) => (
                          <li key={c.customer_name} className="flex justify-between">
                            <span>{c.customer_name}</span>
                            <span className="font-medium">{money(c.total_amount)}</span>
                          </li>
                        ))}
                      </ul>
                    ) : (
                      <p className="text-sm text-neutral-400">No Sales Order data yet.</p>
                    )}
                  </div>

                  <div>
                    <p className="mb-2 text-xs font-medium uppercase tracking-wide text-neutral-500">
                      Margin by SKU (sales price vs. landed cost, qty-weighted)
                    </p>
                    {pnl?.sku_margins.length ? (
                      <div className="overflow-x-auto rounded-xl border border-neutral-200">
                        <table className="min-w-full text-left text-sm">
                          <thead className="bg-neutral-50 text-xs uppercase text-neutral-500">
                            <tr>
                              <th className="px-3 py-2">SKU</th>
                              <th className="px-3 py-2 text-right">Qty sold</th>
                              <th className="px-3 py-2 text-right">Sales price</th>
                              <th className="px-3 py-2 text-right">Landed cost</th>
                              <th className="px-3 py-2 text-right">Margin</th>
                              <th className="px-3 py-2 text-right">Margin %</th>
                            </tr>
                          </thead>
                          <tbody className="divide-y divide-neutral-100">
                            {pnl.sku_margins.map((m) => (
                              <tr key={m.sku_id}>
                                <td className="px-3 py-2">
                                  <span className="font-mono text-xs">{m.sku_id}</span>
                                  <span className="block text-neutral-500">{m.description}</span>
                                </td>
                                <td className="px-3 py-2 text-right">{m.quantity_sold}</td>
                                <td className="px-3 py-2 text-right">{money(m.weighted_sales_price)}</td>
                                <td className="px-3 py-2 text-right">{money(m.weighted_cost_price)}</td>
                                <td className="px-3 py-2 text-right">{money(m.margin_per_unit)}</td>
                                <td className="px-3 py-2 text-right">{m.margin_pct.toFixed(1)}%</td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                    ) : (
                      <p className="text-sm text-neutral-400">
                        No SKU has both Supply cost and Sales Order data yet.
                      </p>
                    )}
                  </div>
                </div>

                <div className="space-y-3 border-t border-neutral-200 pt-6">
                  <div>
                    <h4 className="font-display text-base font-semibold">Sales Pipeline</h4>
                    <p className="text-xs text-neutral-400">Placeholder numbers — not wired to real data yet.</p>
                  </div>
                  <div className="overflow-x-auto rounded-xl border border-neutral-200">
                    <table className="min-w-full text-left text-sm">
                      <thead className="bg-neutral-50 text-xs uppercase text-neutral-500">
                        <tr>
                          <th className="px-3 py-2">Rep</th>
                          <th className="px-3 py-2 text-right">Sent</th>
                          <th className="px-3 py-2 text-right">Delivery</th>
                          <th className="px-3 py-2 text-right">Open</th>
                          <th className="px-3 py-2 text-right">Click-through</th>
                          <th className="px-3 py-2 text-right">Response</th>
                          <th className="px-3 py-2 text-right">Meeting conv.</th>
                          <th className="px-3 py-2 text-right">Hit rate</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-neutral-100">
                        {FAKE_SALES_PIPELINE.map((r) => (
                          <tr key={r.rep}>
                            <td className="px-3 py-2 font-medium">{r.rep}</td>
                            <td className="px-3 py-2 text-right">{r.emailsSent}</td>
                            <td className="px-3 py-2 text-right">{r.deliveryRatePct.toFixed(1)}%</td>
                            <td className="px-3 py-2 text-right">{r.openRatePct.toFixed(1)}%</td>
                            <td className="px-3 py-2 text-right">{r.clickThroughRatePct.toFixed(1)}%</td>
                            <td className="px-3 py-2 text-right">{r.responseRatePct.toFixed(1)}%</td>
                            <td className="px-3 py-2 text-right">{r.meetingConversionPct.toFixed(1)}%</td>
                            <td className="px-3 py-2 text-right">{r.hitRatePct.toFixed(1)}%</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              </div>
            ) : null}

            {agent === 'sourcing' ? (
              <div className="space-y-4">
                <p className="text-sm text-neutral-600">
                  RFQ for <strong>{FAKE_SOURCING.item}</strong> · qty {FAKE_SOURCING.qty}
                </p>
                <div className="overflow-x-auto rounded-xl border border-neutral-200">
                  <table className="min-w-full text-left text-sm">
                    <thead className="bg-neutral-50 text-xs uppercase text-neutral-500">
                      <tr>
                        <th className="px-3 py-2">Supplier</th>
                        <th className="px-3 py-2">Unit</th>
                        <th className="px-3 py-2">Lead</th>
                        <th className="px-3 py-2">MOQ</th>
                        <th className="px-3 py-2">Terms</th>
                        <th className="px-3 py-2">Score</th>
                      </tr>
                    </thead>
                    <tbody>
                      {FAKE_SOURCING.quotes.map((q) => (
                        <tr
                          key={q.supplier}
                          className={
                            q.supplier === FAKE_SOURCING.recommended
                              ? 'bg-emerald-50'
                              : 'border-t border-neutral-100'
                          }
                        >
                          <td className="px-3 py-2 font-medium">
                            {q.supplier}
                            {q.supplier === FAKE_SOURCING.recommended ? ' ★' : ''}
                          </td>
                          <td className="px-3 py-2">{money(q.unit)}</td>
                          <td className="px-3 py-2">{q.leadDays}d</td>
                          <td className="px-3 py-2">{q.moq}</td>
                          <td className="px-3 py-2">{q.terms}</td>
                          <td className="px-3 py-2">{q.score}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
                <button
                  type="button"
                  onClick={runSourcing}
                  className="inline-flex items-center gap-2 rounded-xl bg-neutral-900 px-4 py-2.5 text-sm font-medium text-white"
                >
                  Recommend {FAKE_SOURCING.recommended}
                </button>
              </div>
            ) : null}
          </section>

          <section className="rounded-2xl border border-neutral-200 bg-white p-4 shadow-sm">
            <div className="mb-3 flex items-center justify-between">
              <h2 className="font-display text-sm font-semibold uppercase tracking-wide text-neutral-500">
                Live activity
              </h2>
              <span className="text-[11px] text-neutral-400">This browser session only</span>
            </div>
            {activity.events.length === 0 ? (
              <p className="flex items-center gap-2 py-6 text-sm text-neutral-400">
                <Circle size={14} /> Run an agent to see activity here
              </p>
            ) : (
              <>
                <ul className="max-h-[560px] space-y-2 overflow-y-auto pr-1">
                  {activityPageEvents.map((ev) => (
                    <li
                      key={ev.id}
                      className="flex items-start gap-3 rounded-xl border border-neutral-100 px-3 py-2.5"
                    >
                      <span className="mt-0.5 rounded bg-emerald-50 px-1.5 py-0.5 text-[10px] font-semibold text-emerald-700">
                        AGENT
                      </span>
                      <div className="min-w-0 flex-1">
                        <p className="text-sm font-medium text-neutral-900">{ev.agent}</p>
                        <p className="truncate text-xs text-neutral-600">{ev.summary}</p>
                      </div>
                      <span className="shrink-0 text-[11px] text-neutral-400">
                        {relativeTime(ev.at)}
                      </span>
                    </li>
                  ))}
                </ul>
                {activityTotalPages > 1 ? (
                  <div className="mt-3 flex items-center justify-between border-t border-neutral-100 pt-3">
                    <button
                      type="button"
                      disabled={activityPageClamped === 0}
                      onClick={() => setActivityPage((p) => Math.max(0, p - 1))}
                      className="inline-flex items-center gap-1 rounded-lg border border-neutral-200 px-2 py-1 text-xs text-neutral-600 disabled:opacity-40"
                    >
                      <ChevronLeft size={14} /> Prev
                    </button>
                    <span className="text-[11px] text-neutral-400">
                      Page {activityPageClamped + 1} of {activityTotalPages}
                    </span>
                    <button
                      type="button"
                      disabled={activityPageClamped >= activityTotalPages - 1}
                      onClick={() => setActivityPage((p) => Math.min(activityTotalPages - 1, p + 1))}
                      className="inline-flex items-center gap-1 rounded-lg border border-neutral-200 px-2 py-1 text-xs text-neutral-600 disabled:opacity-40"
                    >
                      Next <ChevronRight size={14} />
                    </button>
                  </div>
                ) : null}
              </>
            )}
          </section>

          <section className="rounded-2xl border border-neutral-200 bg-white p-4 shadow-sm">
            <h2 className="mb-3 font-display text-sm font-semibold uppercase tracking-wide text-neutral-500">
              Integrations
            </h2>
            <div className="grid gap-2 sm:grid-cols-2">
              <StatusDot
                connected={fakeToggles.sage ?? sage.connected}
                label="Sage 50"
                onConnect={() => setFakeToggles((prev) => ({ ...prev, sage: true }))}
                onDisconnect={() => setFakeToggles((prev) => ({ ...prev, sage: false }))}
              />
              <StatusDot
                connected={gmail.connected}
                label="Gmail"
                connectHref="/api/gmail/oauth/connect"
                onDisconnect={() => void disconnectGmail().then(refreshIntegrations)}
              />
              <StatusDot
                connected={fakeToggles.llmEnrich ?? llmEnrich.connected}
                label="Acrylic LLM"
                onConnect={() => setFakeToggles((prev) => ({ ...prev, llmEnrich: true }))}
                onDisconnect={() => setFakeToggles((prev) => ({ ...prev, llmEnrich: false }))}
              />
              <StatusDot
                connected={fakeToggles.hubspot ?? hubspot.connected}
                label="HubSpot"
                onConnect={() => setFakeToggles((prev) => ({ ...prev, hubspot: true }))}
                onDisconnect={() => setFakeToggles((prev) => ({ ...prev, hubspot: false }))}
              />
              <StatusDot
                connected={fakeToggles.zoomInfo ?? false}
                label="ZoomInfo"
                onConnect={() => setFakeToggles((prev) => ({ ...prev, zoomInfo: true }))}
                onDisconnect={() => setFakeToggles((prev) => ({ ...prev, zoomInfo: false }))}
              />
            </div>
            {sage.detail ? (
              <p className="mt-2 text-[11px] text-neutral-400">Sage 50: {sage.detail}</p>
            ) : null}
            <button
              type="button"
              disabled={sageReconnecting}
              onClick={() => void retrySageConnection()}
              className="mt-1 inline-flex items-center gap-1 text-[11px] text-neutral-500 underline-offset-2 hover:underline disabled:opacity-50"
              title="Resets the connector's Sage session and re-checks health — use after opening (and closing) the Sage 50 desktop UI on the connector host."
            >
              {sageReconnecting ? (
                <Loader2 size={11} className="animate-spin" />
              ) : (
                <Zap size={11} />
              )}
              Retry Sage connection
            </button>
            {sageReconnectMsg ? (
              <p className="mt-1 text-[11px] text-neutral-400">{sageReconnectMsg}</p>
            ) : null}
            {llmEnrich.detail ? (
              <p className="mt-1 text-[11px] text-neutral-400">Acrylic LLM: {llmEnrich.detail}</p>
            ) : null}
          </section>
        </div>

        {/* Right chat */}
        <aside className="h-fit rounded-2xl border border-neutral-200 bg-white p-4 shadow-sm lg:sticky lg:top-4">
          <h2 className="font-display text-sm font-semibold">New chat</h2>
          <p className="mt-1 text-xs text-neutral-500">
            Ask a question — opens the matching agent workspace.
          </p>
          <div className="mt-3 flex gap-2">
            <input
              value={chat}
              onChange={(e) => setChat(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter') openFromChat();
              }}
              placeholder="Ask a question, use @ to add context."
              className="flex-1 rounded-xl border border-neutral-300 px-3 py-2 text-sm"
            />
            <button
              type="button"
              onClick={openFromChat}
              className="rounded-xl bg-neutral-900 px-3 text-white"
            >
              <Send size={16} />
            </button>
          </div>
          <p className="mt-4 text-[11px] font-medium uppercase tracking-wide text-neutral-400">
            Saved commands
          </p>
          <ul className="mt-2 space-y-1">
            {AGENTS.flatMap((a) =>
              a.commands.map((cmd) => (
                <li key={`${a.id}-${cmd}`}>
                  <button
                    type="button"
                    className="flex w-full items-center gap-2 rounded-lg px-2 py-1.5 text-left text-xs text-neutral-700 hover:bg-neutral-50"
                    onClick={() => {
                      setAgent(a.id);
                      setChat(cmd);
                    }}
                  >
                    <Zap size={12} className="text-neutral-400" />
                    {cmd}
                  </button>
                </li>
              )),
            )}
          </ul>
        </aside>
      </div>

      <AnimatePresence>
        {dimsModal && supplyPurchase ? (
          <ModalShell
            title="Fill acrylic thickness & size"
            onClose={() => setDimsModal(false)}
            wide
          >
            <p className="mb-3 text-sm text-neutral-600">
              Document AI returned acrylic rows without thickness/size. ai_erp fills these via{' '}
              <code className="text-xs">enrich_acrylic_attrs_with_llm</code> (needs{' '}
              <code className="text-xs">OPENAI_API_KEY</code>). Enter them manually to continue.
            </p>
            <ul className="max-h-[50vh] space-y-3 overflow-auto">
              {Object.keys(dimEdits).map((key) => {
                const index = Number(key);
                const edit = dimEdits[index]!;
                const ln = supplyPurchase.lines[index];
                if (!ln) return null;
                return (
                  <li
                    key={key}
                    className="rounded-xl border border-neutral-200 p-3 text-sm"
                  >
                    <p className="mb-2 whitespace-pre-wrap text-xs text-neutral-600">
                      {ln.raw_description}
                    </p>
                    <div className="grid gap-2 sm:grid-cols-3">
                      <label className="text-xs">
                        thickness_mm
                        <input
                          value={edit.thickness_mm}
                          onChange={(e) =>
                            setDimEdits((prev) => ({
                              ...prev,
                              [index]: { ...edit, thickness_mm: e.target.value },
                            }))
                          }
                          placeholder="e.g. 3"
                          className="mt-1 w-full rounded-lg border px-2 py-1.5"
                        />
                      </label>
                      <label className="text-xs">
                        size
                        <input
                          value={edit.size}
                          onChange={(e) =>
                            setDimEdits((prev) => ({
                              ...prev,
                              [index]: { ...edit, size: e.target.value },
                            }))
                          }
                          placeholder="e.g. 18x24"
                          className="mt-1 w-full rounded-lg border px-2 py-1.5"
                        />
                      </label>
                      <label className="text-xs">
                        qty
                        <input
                          value={edit.quantity}
                          onChange={(e) =>
                            setDimEdits((prev) => ({
                              ...prev,
                              [index]: { ...edit, quantity: e.target.value },
                            }))
                          }
                          className="mt-1 w-full rounded-lg border px-2 py-1.5"
                        />
                      </label>
                    </div>
                  </li>
                );
              })}
            </ul>
            <button
              type="button"
              disabled={busy}
              onClick={() => void continueWithDims()}
              className="mt-4 inline-flex items-center gap-2 rounded-xl bg-neutral-900 px-4 py-2.5 text-sm font-medium text-white disabled:opacity-50"
            >
              Continue landed cost
            </button>
          </ModalShell>
        ) : null}
      </AnimatePresence>

      <AnimatePresence>
        {supplyModal && supplyPlan ? (
          <ModalShell
            wide
            title={`Supply preview · ${supplyPlan.invoice_number}`}
            onClose={() => setSupplyModal(false)}
          >
            <p className="mb-4 text-xs text-amber-700">
              Sage write disabled — showing PurchaseWritePlan preview only.
            </p>
            <div className="grid gap-4 lg:grid-cols-3">
              <div>
                <h4 className="mb-2 text-xs font-semibold uppercase text-neutral-500">OCR</h4>
                {supplyPurchase?.notes ? (
                  <p className="mb-2 rounded-lg bg-emerald-50 px-2 py-1.5 text-[11px] text-emerald-800">
                    {supplyPurchase.notes}
                  </p>
                ) : null}
                <pre className="max-h-64 overflow-auto rounded-xl bg-neutral-50 p-3 text-[11px]">
                  {JSON.stringify(supplyPurchase, null, 2)}
                </pre>
              </div>
              <div>
                <h4 className="mb-2 text-xs font-semibold uppercase text-neutral-500">
                  Landed cost
                </h4>
                <div className="space-y-2 text-sm">
                  <p>
                    Method: <strong>{supplyPlan.landed.method}</strong>
                  </p>
                  <p>Product cost: {money(supplyPlan.landed.total_acrylic_product_cost)}</p>
                  {supplyPlan.landed.method === 'freight_and_duty' ? (
                    <>
                      <p>Freight: {money(supplyPlan.landed.freight_amount ?? 0)}</p>
                      <p>Duty: {money(supplyPlan.landed.duty_amount ?? 0)}</p>
                    </>
                  ) : null}
                  <p>Total land cost: {money(supplyPlan.landed.import_pool)}</p>
                  <p>Total weight: {supplyPlan.landed.total_weight_kg.toFixed(2)} kg</p>
                  <label className="block text-xs">
                    Edit pool → recalculate
                    <div className="mt-1 flex gap-2">
                      <input
                        value={poolEdit}
                        onChange={(e) => setPoolEdit(e.target.value)}
                        className="w-full rounded-lg border px-2 py-1.5"
                      />
                      <button
                        type="button"
                        onClick={() => void recalcSupply()}
                        className="rounded-lg bg-neutral-900 px-3 text-xs text-white"
                      >
                        Recalc
                      </button>
                    </div>
                  </label>
                </div>
                <ul className="mt-3 max-h-48 space-y-2 overflow-auto text-xs">
                  {supplyPlan.lines.map((ln, i) => (
                    <li key={ln.sku_id} className="rounded-lg border border-neutral-200 p-2">
                      <p className="font-medium">{ln.sku_id}</p>
                      <p className="text-neutral-500">{ln.description}</p>
                      <div className="mt-1 grid grid-cols-2 gap-1">
                        <label>
                          qty
                          <input
                            type="number"
                            value={numInputValue(ln.quantity)}
                            onChange={(e) =>
                              updateLine(i, { quantity: parseNumInput(e.target.value) })
                            }
                            className="w-full rounded border px-1"
                          />
                        </label>
                        <label>
                          raw unit price
                          <input
                            type="number"
                            value={numInputValue(
                              Number(ln.raw_unit_price.toFixed(ln.price_decimals ?? 3)),
                            )}
                            onChange={(e) =>
                              updateLine(i, {
                                raw_unit_price: parseNumInput(e.target.value),
                              })
                            }
                            className="w-full rounded border px-1"
                          />
                        </label>
                        <label>
                          land unit price
                          <input
                            type="number"
                            readOnly
                            value={numInputValue(
                              Number(ln.landed_unit_cost.toFixed(ln.price_decimals ?? 3)),
                            )}
                            className="w-full rounded border bg-neutral-50 px-1 text-neutral-700"
                          />
                        </label>
                        <label>
                          land / sheet
                          <input
                            type="number"
                            readOnly
                            value={numInputValue(
                              Number(ln.land_cost_per_sheet.toFixed(ln.price_decimals ?? 3)),
                            )}
                            className="w-full rounded border bg-neutral-50 px-1 text-neutral-700"
                          />
                        </label>
                      </div>
                      <p className="mt-1 text-neutral-500">
                        amt {money(ln.amount)} · weight {ln.sheet_weight_kg.toFixed(2)} kg
                      </p>
                    </li>
                  ))}
                </ul>
              </div>
              <div>
                <h4 className="mb-2 text-xs font-semibold uppercase text-neutral-500">
                  Proposed Sage payload
                </h4>
                <pre className="max-h-64 overflow-auto rounded-xl bg-neutral-50 p-3 text-[11px]">
                  {JSON.stringify(
                    {
                      vendor: supplyPlan.vendor,
                      po: supplyPlan.po_reference_number,
                      receive: supplyPlan.receive_reference_number,
                      gl: supplyPlan.gl_account_id,
                      lines: supplyPlan.lines.map((l) => ({
                        sku: l.sku_id,
                        qty: l.quantity,
                        raw_unit_price: Number(l.raw_unit_price.toFixed(l.price_decimals ?? 3)),
                        land_unit_price: Number(l.landed_unit_cost.toFixed(l.price_decimals ?? 3)),
                        amount: Number(l.amount.toFixed(2)),
                      })),
                      sageWrite: 'preview_only',
                    },
                    null,
                    2,
                  )}
                </pre>
                <button
                  type="button"
                  onClick={() => downloadInventoryCsv(supplyPlan)}
                  className="mt-3 inline-flex w-full items-center justify-center gap-2 rounded-xl border border-neutral-300 bg-white px-4 py-2.5 text-sm font-medium text-neutral-700 hover:bg-neutral-50"
                  title="Item ID + Item Description for every SKU on this PO — import via Sage's File → Import/Export → Import Records before writing to Sage, so new SKUs exist first."
                >
                  <Download size={16} /> Download inventory CSV for Sage import
                </button>
                <button
                  type="button"
                  disabled={busy}
                  onClick={() => void cfoApprove(false)}
                  className="mt-2 inline-flex w-full items-center justify-center gap-2 rounded-xl bg-emerald-700 px-4 py-2.5 text-sm font-medium text-white disabled:opacity-50"
                >
                  <CheckCircle2 size={16} /> CFO Approve (audit only)
                </button>
                {sage.connected ? (
                  <button
                    type="button"
                    disabled={busy}
                    onClick={() => void cfoApprove(true)}
                    className="mt-2 inline-flex w-full items-center justify-center gap-2 rounded-xl bg-neutral-900 px-4 py-2.5 text-sm font-medium text-white disabled:opacity-50"
                  >
                    <Zap size={16} /> Write PO + Receive to Sage 50
                  </button>
                ) : (
                  <p className="mt-2 text-[11px] text-neutral-400">
                    Sage 50 write disabled — set SAGE_CONNECTOR_URL to enable posting this PO +
                    receive for real.
                  </p>
                )}
                {audit ? (
                  <pre className="mt-2 max-h-40 overflow-auto rounded-xl bg-emerald-50 p-2 text-[10px] text-emerald-900">
                    {JSON.stringify(audit, null, 2)}
                  </pre>
                ) : null}
                {sageResult ? (
                  <div className="mt-2 rounded-xl border border-neutral-200 bg-neutral-50 p-2 text-[11px] text-neutral-700">
                    <p>PO: {sageResult.poReference ?? '—'}</p>
                    <p>Receive: {sageResult.receiveReference ?? '—'}</p>
                    {sageResult.warnings?.length ? (
                      <p className="mt-1 text-amber-700">{sageResult.warnings.join(' ')}</p>
                    ) : null}
                  </div>
                ) : null}
              </div>
            </div>
          </ModalShell>
        ) : null}
      </AnimatePresence>

      <AnimatePresence>
        {salesModal && salesPlan ? (
          <ModalShell
            title={`Sales preview · ${salesPlan.customer}`}
            onClose={() => setSalesModal(false)}
          >
            <p className="mb-3 text-xs text-amber-700">
              {sage.connected
                ? 'Sage 50 connected — confirming writes a real Sales Order + Sales Invoice (posts revenue and reduces inventory).'
                : 'Sage write disabled — preview only.'}
            </p>
            {salesPlan.needs_review ? (
              <div className="mb-3 rounded-xl border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-900">
                Needs review: {salesPlan.review_reasons.join(', ')}
              </div>
            ) : (
              <div className="mb-3 rounded-xl border border-emerald-200 bg-emerald-50 px-3 py-2 text-sm text-emerald-900">
                No blocking review flags
              </div>
            )}
            <div className="mb-3 space-y-1 text-sm">
              <p>
                Customer: <strong>{salesPlan.customer}</strong>
              </p>
              <p>Invoice date: {salesPlan.invoice_date || '—'}</p>
              <p>Due date (used for the Sage transaction date): {salesPlan.due_date || '—'}</p>
            </div>
            <div className="overflow-auto rounded-xl border border-neutral-200">
              <table className="w-full text-left text-sm">
                <thead className="bg-neutral-50 text-xs uppercase text-neutral-500">
                  <tr>
                    <th className="px-3 py-2">SKU ID</th>
                    <th className="px-3 py-2">Description</th>
                    <th className="px-3 py-2 text-right">Sales price</th>
                    <th className="px-3 py-2 text-right">Qty</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-neutral-100">
                  {salesPlan.lines
                    .filter((l) => l.line_kind !== 'freight')
                    .map((l, i) => (
                      <tr key={`${l.sku}-${i}`}>
                        <td className="px-3 py-2 font-mono text-xs">{l.sku}</td>
                        <td className="px-3 py-2">{l.description}</td>
                        <td className="px-3 py-2 text-right">{money(l.unit_price)}</td>
                        <td className="px-3 py-2 text-right">{l.quantity}</td>
                      </tr>
                    ))}
                </tbody>
              </table>
            </div>
            <div className="mt-3 flex gap-2">
              <button
                type="button"
                disabled={busy}
                className="rounded-xl bg-neutral-200 px-4 py-2 text-sm text-neutral-800 disabled:opacity-50"
                onClick={() => void confirmSalesOrder(false)}
              >
                Confirm (preview only)
              </button>
              {sage.connected ? (
                <button
                  type="button"
                  disabled={busy}
                  className="inline-flex items-center gap-2 rounded-xl bg-neutral-900 px-4 py-2 text-sm text-white disabled:opacity-50"
                  onClick={() => void confirmSalesOrder(true)}
                >
                  <Zap size={16} /> Write Sales Order + Invoice to Sage 50
                </button>
              ) : null}
            </div>
            {salesConfirmed ? (
              <div className="mt-2 rounded-xl border border-neutral-200 bg-neutral-50 p-2 text-[11px] text-neutral-700">
                {salesSageResult ? (
                  <>
                    <p>Sales Order: {salesSageResult.soReference ?? '—'}</p>
                    <p>Sales Invoice: {salesSageResult.invoiceReference ?? '—'}</p>
                    {salesSageResult.warnings?.length ? (
                      <p className="mt-1 text-amber-700">{salesSageResult.warnings.join(' ')}</p>
                    ) : null}
                  </>
                ) : (
                  <p>Confirmed (preview only — nothing written to Sage).</p>
                )}
              </div>
            ) : null}
          </ModalShell>
        ) : null}
      </AnimatePresence>

      <AnimatePresence>
        {sageHelpModal ? (
          <ModalShell title="Sage 50 still not connected" onClose={() => setSageHelpModal(false)}>
            <p className="mb-3 text-sm text-neutral-700">
              {sageReconnectMsg || 'The connector is still unreachable after resetting its session.'}
            </p>
            <ol className="list-decimal space-y-3 pl-5 text-sm text-neutral-700">
              <li>
                RDP into the connector host and confirm the Sage 50 desktop app is fully
                closed (not just minimized) — Sage 50 only allows one program to hold the
                company file open at a time:
                <pre className="mt-1 overflow-auto rounded-lg bg-neutral-50 p-2 text-[11px] text-neutral-800">
                  {`Get-Process -Name Peachw -ErrorAction SilentlyContinue`}
                </pre>
                (if this prints anything, close Sage 50 fully, then re-run it until empty)
              </li>
              <li>
                Restart the connector service so it drops its stuck session, in an
                Administrator PowerShell on the same host:
                <pre className="mt-1 overflow-auto rounded-lg bg-neutral-50 p-2 text-[11px] text-neutral-800">
                  {`Stop-ScheduledTask -TaskName "SageConnectorApi"\nStart-ScheduledTask -TaskName "SageConnectorApi"`}
                </pre>
              </li>
              <li>Come back here and click "Retry Sage connection" again.</li>
            </ol>
            <button
              type="button"
              onClick={() => setSageHelpModal(false)}
              className="mt-4 rounded-xl bg-neutral-900 px-4 py-2 text-sm text-white"
            >
              Got it
            </button>
          </ModalShell>
        ) : null}
      </AnimatePresence>
    </div>
  );
}

function FileField({
  label,
  file,
  onChange,
}: {
  label: string;
  file: File | null;
  onChange: (f: File | null) => void;
}) {
  return (
    <label className="block text-xs font-medium text-neutral-600">
      {label}
      <input
        type="file"
        accept="application/pdf"
        className="mt-1 block w-full text-sm"
        onChange={(e) => onChange(e.target.files?.[0] ?? null)}
      />
      {file ? <span className="mt-1 block text-[11px] text-neutral-500">{file.name}</span> : null}
    </label>
  );
}
