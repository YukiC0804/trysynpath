import { useCallback, useEffect, useState, type ReactNode } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import {
  Bot,
  CheckCircle2,
  Circle,
  Loader2,
  Mail,
  Send,
  Sparkles,
  Upload,
  X,
  Zap,
} from 'lucide-react';
import type {
  AcrylicSkuLine,
  CfoAuditRecord,
  DocumentExtract,
  PurchaseWritePlan,
  SalesOrderPlan,
} from '../../shared/ghost';
import {
  AGENTS,
  FAKE_INTELLIGENCE,
  FAKE_PROSPECTS,
  FAKE_SOURCING,
  matchAgentFromPrompt,
  type AgentId,
} from '../data/agentWorkforce';
import { useSessionActivity } from '../hooks/useSessionActivity';
import {
  approveSupply,
  disconnectGmail,
  fetchAgentsStatus,
  fetchGmailStatus,
  fileToBase64,
  processSales,
  processSupply,
  recalculateSupply,
  sendOutreachEmail,
} from '../lib/agentsApi';

function money(n: number, currency = 'USD') {
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency,
    maximumFractionDigits: 2,
  }).format(n);
}

function relativeTime(iso: string) {
  const ms = Date.now() - new Date(iso).getTime();
  if (ms < 15_000) return 'just now';
  if (ms < 60_000) return `${Math.floor(ms / 1000)}s ago`;
  if (ms < 3_600_000) return `${Math.floor(ms / 60_000)}m ago`;
  return new Date(iso).toLocaleTimeString();
}

function StatusDot({ connected, label }: { connected: boolean; label: string }) {
  return (
    <div className="flex items-center gap-2 text-[12px]">
      <span
        className={`h-2 w-2 rounded-full ${connected ? 'bg-emerald-500' : 'bg-rose-500'}`}
      />
      <span className="text-neutral-600">{label}</span>
      <span className={connected ? 'text-emerald-700' : 'text-rose-700'}>
        {connected ? 'Connected' : 'Disconnected'}
      </span>
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
  const [docAi, setDocAi] = useState({ connected: false, detail: '' });
  const [gmail, setGmail] = useState({ connected: false, email: '' });
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Supply state
  const [purchaseFile, setPurchaseFile] = useState<File | null>(null);
  const [freightFile, setFreightFile] = useState<File | null>(null);
  const [dutyFile, setDutyFile] = useState<File | null>(null);
  const [supplyPlan, setSupplyPlan] = useState<PurchaseWritePlan | null>(null);
  const [supplyPurchase, setSupplyPurchase] = useState<DocumentExtract | null>(null);
  const [supplyModal, setSupplyModal] = useState(false);
  const [poolEdit, setPoolEdit] = useState('');
  const [audit, setAudit] = useState<CfoAuditRecord | null>(null);

  // Sales
  const [salesFile, setSalesFile] = useState<File | null>(null);
  const [salesPlan, setSalesPlan] = useState<SalesOrderPlan | null>(null);
  const [salesModal, setSalesModal] = useState(false);

  // Outreach
  const [toEmail, setToEmail] = useState('');
  const [subject, setSubject] = useState('Quick follow-up from Synpath');
  const [body, setBody] = useState(
    'Hi — following up on acrylic sheet pricing and lead times. Happy to send a quote this week.',
  );

  const refreshIntegrations = useCallback(async () => {
    try {
      const [agentsStatus, gmailStatus] = await Promise.all([
        fetchAgentsStatus(),
        fetchGmailStatus(),
      ]);
      setDocAi({
        connected: agentsStatus.documentAi.connected,
        detail: agentsStatus.documentAi.detail,
      });
      setGmail({
        connected: gmailStatus.connected,
        email: gmailStatus.emailAddress || '',
      });
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
      setSupplyPurchase(result.purchase);
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
    const lines = supplyPlan.lines.map((ln, i) => (i === index ? { ...ln, ...patch } : ln));
    setSupplyPlan({ ...supplyPlan, lines });
  };

  const cfoApprove = async () => {
    if (!supplyPlan) return;
    setBusy(true);
    try {
      const result = await approveSupply(supplyPlan);
      setAudit(result.audit);
      activity.push(
        'Supply & Costing',
        `${result.audit.invoiceNumber} · ${result.audit.method} $${result.audit.pool.toFixed(0)} → ${result.audit.lineSkus.length} SKUs · approved (preview only)`,
        'approved',
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

  const runOutreach = async () => {
    setBusy(true);
    setError(null);
    try {
      await sendOutreachEmail({ to: toEmail, subject, body });
      activity.push('Outreach', `sent to ${toEmail} · “${subject.slice(0, 40)}”`, 'sent');
      setToEmail('');
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  };

  const runIntelligence = () => {
    activity.push(
      'Intelligence',
      `opened exec dashboard · ${FAKE_INTELLIGENCE.anomalies.length} anomalies highlighted`,
      'viewed',
    );
  };

  const runSourcing = () => {
    activity.push(
      'Smart Sourcing',
      `RFQ ${FAKE_SOURCING.item} · recommended ${FAKE_SOURCING.recommended}`,
      'recommended',
    );
  };

  const active = AGENTS.find((a) => a.id === agent)!;

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
              </div>
            ) : null}

            {agent === 'outreach' ? (
              <div className="space-y-4">
                <div className="flex flex-wrap items-center gap-2">
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
                </div>
                <div className="grid gap-2">
                  {FAKE_PROSPECTS.map((p) => (
                    <button
                      key={p.company}
                      type="button"
                      className="rounded-lg border border-neutral-200 px-3 py-2 text-left text-xs hover:bg-neutral-50"
                      onClick={() =>
                        setSubject(`Intro for ${p.company}`)
                      }
                    >
                      <span className="font-medium">{p.company}</span>
                      <span className="text-neutral-500">
                        {' '}
                        · {p.contact} · {p.territory}
                      </span>
                    </button>
                  ))}
                </div>
                <label className="block text-xs font-medium text-neutral-600">
                  To (email address)
                  <input
                    value={toEmail}
                    onChange={(e) => setToEmail(e.target.value)}
                    placeholder="prospect@company.com"
                    className="mt-1 w-full rounded-xl border border-neutral-300 px-3 py-2 text-sm"
                  />
                </label>
                <label className="block text-xs font-medium text-neutral-600">
                  Subject
                  <input
                    value={subject}
                    onChange={(e) => setSubject(e.target.value)}
                    className="mt-1 w-full rounded-xl border border-neutral-300 px-3 py-2 text-sm"
                  />
                </label>
                <label className="block text-xs font-medium text-neutral-600">
                  Body
                  <textarea
                    value={body}
                    onChange={(e) => setBody(e.target.value)}
                    rows={5}
                    className="mt-1 w-full rounded-xl border border-neutral-300 px-3 py-2 text-sm"
                  />
                </label>
                <button
                  type="button"
                  disabled={busy || !gmail.connected || !toEmail}
                  onClick={() => void runOutreach()}
                  className="inline-flex items-center gap-2 rounded-xl bg-neutral-900 px-4 py-2.5 text-sm font-medium text-white disabled:opacity-50"
                >
                  <Send size={16} /> Send email
                </button>
              </div>
            ) : null}

            {agent === 'intelligence' ? (
              <div className="space-y-4">
                <button
                  type="button"
                  onClick={runIntelligence}
                  className="inline-flex items-center gap-2 rounded-xl bg-neutral-900 px-4 py-2.5 text-sm font-medium text-white"
                >
                  <Sparkles size={16} /> Open executive dashboard
                </button>
                <div className="grid gap-3 sm:grid-cols-4">
                  {[
                    ['Margin', `${FAKE_INTELLIGENCE.marginPct}%`],
                    ['Spend MTD', money(FAKE_INTELLIGENCE.spendMtd)],
                    ['Savings ops', money(FAKE_INTELLIGENCE.savingsOpps)],
                    ['Pipeline', money(FAKE_INTELLIGENCE.pipeline)],
                  ].map(([k, v]) => (
                    <div key={k} className="rounded-xl bg-neutral-50 px-3 py-3">
                      <p className="text-[11px] text-neutral-500">{k}</p>
                      <p className="mt-1 font-display text-lg font-semibold">{v}</p>
                    </div>
                  ))}
                </div>
                <div>
                  <p className="mb-2 text-xs font-medium uppercase tracking-wide text-neutral-500">
                    Anomalies
                  </p>
                  <ul className="space-y-2">
                    {FAKE_INTELLIGENCE.anomalies.map((a) => (
                      <li
                        key={a.title}
                        className="rounded-xl border border-neutral-200 px-3 py-2 text-sm"
                      >
                        <span className="font-medium">{a.title}</span>
                        <span className="text-neutral-500"> — {a.detail}</span>
                      </li>
                    ))}
                  </ul>
                </div>
                <div>
                  <p className="mb-2 text-xs font-medium uppercase tracking-wide text-neutral-500">
                    Spend by supplier
                  </p>
                  <ul className="space-y-1 text-sm">
                    {FAKE_INTELLIGENCE.spendBySupplier.map((s) => (
                      <li key={s.name} className="flex justify-between">
                        <span>{s.name}</span>
                        <span className="font-medium">{money(s.amount)}</span>
                      </li>
                    ))}
                  </ul>
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
              <ul className="space-y-2">
                {activity.events.map((ev) => (
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
            )}
          </section>

          <section className="rounded-2xl border border-neutral-200 bg-white p-4 shadow-sm">
            <h2 className="mb-3 font-display text-sm font-semibold uppercase tracking-wide text-neutral-500">
              Integrations
            </h2>
            <div className="grid gap-2 sm:grid-cols-2">
              <StatusDot connected={false} label="Sage 50" />
              <StatusDot connected={gmail.connected} label="Gmail" />
              <StatusDot connected={docAi.connected} label="Document AI" />
              <StatusDot connected={false} label="HubSpot" />
              <StatusDot connected={false} label="ZoomInfo" />
              <StatusDot connected={false} label="Websites" />
            </div>
            {docAi.detail ? (
              <p className="mt-2 text-[11px] text-neutral-400">Document AI: {docAi.detail}</p>
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
                  <p>Import pool: {money(supplyPlan.landed.import_pool)}</p>
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
                            value={ln.quantity}
                            onChange={(e) =>
                              updateLine(i, { quantity: Number(e.target.value) })
                            }
                            className="w-full rounded border px-1"
                          />
                        </label>
                        <label>
                          raw unit
                          <input
                            type="number"
                            value={ln.raw_unit_price}
                            onChange={(e) =>
                              updateLine(i, { raw_unit_price: Number(e.target.value) })
                            }
                            className="w-full rounded border px-1"
                          />
                        </label>
                      </div>
                      <p className="mt-1">
                        land {money(ln.land_cost_per_sheet)} → landed{' '}
                        {money(ln.landed_unit_cost)} · amt {money(ln.amount)}
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
                        unit: Number(l.landed_unit_cost.toFixed(4)),
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
                  disabled={busy}
                  onClick={() => void cfoApprove()}
                  className="mt-3 inline-flex w-full items-center justify-center gap-2 rounded-xl bg-emerald-700 px-4 py-2.5 text-sm font-medium text-white disabled:opacity-50"
                >
                  <CheckCircle2 size={16} /> CFO Approve (audit only)
                </button>
                {audit ? (
                  <pre className="mt-2 max-h-40 overflow-auto rounded-xl bg-emerald-50 p-2 text-[10px] text-emerald-900">
                    {JSON.stringify(audit, null, 2)}
                  </pre>
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
            <p className="mb-3 text-xs text-amber-700">Sage write disabled — preview only.</p>
            {salesPlan.needs_review ? (
              <div className="mb-3 rounded-xl border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-900">
                Needs review: {salesPlan.review_reasons.join(', ')}
              </div>
            ) : (
              <div className="mb-3 rounded-xl border border-emerald-200 bg-emerald-50 px-3 py-2 text-sm text-emerald-900">
                No blocking review flags
              </div>
            )}
            <pre className="max-h-96 overflow-auto rounded-xl bg-neutral-50 p-3 text-[11px]">
              {JSON.stringify(salesPlan, null, 2)}
            </pre>
            <button
              type="button"
              className="mt-3 rounded-xl bg-neutral-900 px-4 py-2 text-sm text-white"
              onClick={() => {
                activity.push(
                  'Sales Order',
                  `${salesPlan.customer} · confirmed (preview only)`,
                  'confirmed',
                );
                setSalesModal(false);
              }}
            >
              Confirm (fake)
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
