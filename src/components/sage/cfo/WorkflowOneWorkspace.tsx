import { useState } from 'react';
import {
  ArrowRight,
  CheckCircle2,
  FileText,
  Inbox,
  Mail,
  Paperclip,
  Sparkles,
} from 'lucide-react';
import type { SourceDocument, WorkflowPreview } from '../../../../shared/workflow';

function money(value: number, currency: string) {
  return new Intl.NumberFormat('en-GB', {
    style: 'currency',
    currency,
    maximumFractionDigits: 2,
  }).format(value);
}

function documentLabel(value: string) {
  return value
    .split('_')
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(' ');
}

function fileSize(value: number) {
  if (!value) return 'Text attachment';
  if (value < 1024) return `${value} B`;
  return `${(value / 1024).toFixed(1)} KB`;
}

function Attachment({ document }: { document: SourceDocument }) {
  return (
    <div className="flex items-center gap-3 rounded-xl border border-neutral-800 bg-neutral-900/50 px-3 py-2.5">
      <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-violet-500/10 text-violet-300">
        <FileText size={17} />
      </div>
      <div className="min-w-0 flex-1">
        <p className="truncate text-xs font-medium text-white">{document.fileName}</p>
        <p className="mt-0.5 text-[11px] text-neutral-500">
          {documentLabel(document.documentType)} · {fileSize(document.fileSize)}
        </p>
      </div>
      <span className="rounded-full border border-emerald-500/25 bg-emerald-500/10 px-2 py-0.5 text-[10px] text-emerald-300">
        {document.extractionStatus}
      </span>
    </div>
  );
}

export function WorkflowOneWorkspace({
  preview,
  loading,
  ready,
  useLiveGmail,
  canStart,
  onStart,
}: {
  preview: WorkflowPreview | null;
  loading: boolean;
  ready: boolean;
  useLiveGmail: boolean;
  canStart: boolean;
  onStart: () => void;
}) {
  const [selectedEmailId, setSelectedEmailId] = useState<string | null>(null);
  const emails = preview?.bundle.emails ?? [];
  const documents = preview?.bundle.documents ?? [];
  const selectedEmail =
    emails.find((email) => email.gmailMessageId === selectedEmailId) ?? emails[0];
  const selectedDocuments = selectedEmail
    ? documents.filter((document) => document.emailMessageId === selectedEmail.gmailMessageId)
    : [];
  const shipment = preview?.bundle.shipment;
  const currency = shipment?.currency ?? 'GBP';
  const allocation = preview?.allocations[0];
  const customerInvoice = preview?.bundle.customerInvoice;

  return (
    <section className="overflow-hidden rounded-2xl border border-neutral-800 bg-[#0a0a0a]">
      <div className="grid min-h-[620px] lg:grid-cols-[0.92fr_1.08fr]">
        <div className="border-b border-neutral-800 lg:border-b-0 lg:border-r">
          <div className="flex items-center justify-between border-b border-neutral-800 px-5 py-4">
            <div className="flex items-center gap-3">
              <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-red-500/15 text-red-400">
                <Mail size={18} />
              </div>
              <div>
                <h2 className="text-sm font-semibold text-white">
                  {useLiveGmail ? 'Gmail inbox' : 'Demo Gmail inbox'}
                </h2>
                <p className="text-xs text-neutral-500">Original messages &amp; attachments</p>
              </div>
            </div>
            {emails.length > 0 && (
              <span className="rounded-full border border-neutral-800 px-2.5 py-1 text-[11px] text-neutral-400">
                {emails.length} messages
              </span>
            )}
          </div>

          {!preview ? (
            <div className="flex min-h-[540px] flex-col items-center justify-center px-8 text-center">
              <div className="mb-5 flex h-14 w-14 items-center justify-center rounded-2xl border border-neutral-800 bg-neutral-900 text-neutral-400">
                <Inbox size={24} />
              </div>
              <h3 className="text-base font-medium text-white">
                {useLiveGmail ? 'Scan the connected inbox' : 'Load the prepared mailbox'}
              </h3>
              <p className="mt-2 max-w-sm text-sm leading-6 text-neutral-500">
                Find the purchase order, vendor invoice, shipping documents and matching customer
                invoice for PO#GHOACRUGOL051926.
              </p>
              <button
                type="button"
                disabled={!canStart || loading}
                onClick={onStart}
                className="mt-6 inline-flex items-center gap-2 rounded-xl bg-white px-5 py-3 text-sm font-semibold text-black transition hover:bg-neutral-200 disabled:cursor-not-allowed disabled:opacity-40"
              >
                {loading
                  ? 'Reading source documents…'
                  : useLiveGmail
                    ? 'Scan Gmail'
                    : 'Load Demo Data'}
                {!loading && <ArrowRight size={16} />}
              </button>
            </div>
          ) : (
            <div className="grid lg:grid-rows-[auto_1fr]">
              <div className="space-y-2 border-b border-neutral-800 p-3">
                {emails.map((email) => {
                  const active = email.gmailMessageId === selectedEmail?.gmailMessageId;
                  const count = documents.filter(
                    (document) => document.emailMessageId === email.gmailMessageId,
                  ).length;
                  return (
                    <button
                      key={email.gmailMessageId}
                      type="button"
                      onClick={() => setSelectedEmailId(email.gmailMessageId)}
                className={`w-full rounded-xl border px-4 py-3 text-left transition ${
                        active
                          ? 'border-violet-500/40 bg-violet-500/10'
                          : 'border-transparent bg-neutral-900/40 hover:border-neutral-800'
                      }`}
                    >
                      <div className="flex items-start justify-between gap-3">
                        <div className="min-w-0">
                          <p className="truncate text-sm font-medium text-white">
                            {email.subject}
                          </p>
                          <p className="mt-1 truncate text-xs text-neutral-500">{email.from}</p>
                        </div>
                        <span className="flex shrink-0 items-center gap-1 text-[11px] text-neutral-500">
                          <Paperclip size={12} />
                          {count}
                        </span>
                      </div>
                    </button>
                  );
                })}
              </div>

              {selectedEmail && (
                <div className="space-y-5 p-5">
                  <div>
                    <div className="flex flex-wrap items-center gap-2 text-[11px] text-neutral-500">
                      <span>From {selectedEmail.from}</span>
                      <span>·</span>
                      <span>{new Date(selectedEmail.receivedAt).toLocaleString('en-GB')}</span>
                    </div>
                    <h3 className="mt-2 text-base font-semibold text-white">
                      {selectedEmail.subject}
                    </h3>
                    <div className="mt-4 rounded-xl border border-neutral-800 bg-black/40 p-4">
                      <p className="text-[10px] font-semibold uppercase tracking-[0.18em] text-neutral-600">
                        Message preview
                      </p>
                      <p className="mt-3 text-sm leading-6 text-neutral-300">
                        {selectedEmail.snippet}
                      </p>
                    </div>
                  </div>
                  <div>
                    <div className="mb-3 flex items-center justify-between">
                      <p className="text-xs font-medium text-neutral-300">Attachments</p>
                      <p className="text-[11px] text-neutral-600">
                        {selectedDocuments.length} files
                      </p>
                    </div>
                    <div className="space-y-2">
                      {selectedDocuments.map((document) => (
                        <div key={document.id}>
                          <Attachment document={document} />
                        </div>
                      ))}
                    </div>
                  </div>
                </div>
              )}
            </div>
          )}
        </div>

        <div className="bg-[radial-gradient(circle_at_top_right,rgba(124,58,237,0.08),transparent_40%)]">
          <div className="flex items-center justify-between border-b border-neutral-800 px-5 py-4">
            <div className="flex items-center gap-3">
              <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-violet-500/10 text-violet-300">
                <Sparkles size={18} />
              </div>
              <div>
                <h2 className="text-sm font-semibold text-white">Structured extraction</h2>
                <p className="text-xs text-neutral-500">Normalized and reconciled for Sage</p>
              </div>
            </div>
            {ready && (
              <span className="flex items-center gap-1.5 rounded-full border border-emerald-500/25 bg-emerald-500/10 px-2.5 py-1 text-[11px] text-emerald-300">
                <CheckCircle2 size={12} />
                Ready
              </span>
            )}
          </div>

          {!preview ? (
            <div className="flex min-h-[540px] items-center justify-center p-8">
              <div className="max-w-sm text-center">
                <div className="mx-auto mb-4 h-px w-20 bg-gradient-to-r from-transparent via-violet-400/60 to-transparent" />
                <p className="text-sm text-neutral-500">
                  Extraction results, Sage matching and landed-cost calculations will appear here.
                </p>
              </div>
            </div>
          ) : (
            <div className="space-y-5 p-5">
              <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
                {[
                  ['PO', shipment?.externalPoNumber ?? '—'],
                  ['Units', String(shipment?.lines[0]?.receivedQuantity ?? 0)],
                  ['Vendor cost', money(shipment?.vendorInvoiceTotal ?? 0, currency)],
                  [
                    'Landed value',
                    money(preview.reconciliation.totalCapitalizableCost, currency),
                  ],
                ].map(([label, value]) => (
                  <div key={label} className="rounded-xl border border-neutral-800 bg-black/30 p-3">
                    <p className="text-[10px] uppercase tracking-wider text-neutral-600">{label}</p>
                    <p className="mt-1 truncate text-sm font-semibold text-white">{value}</p>
                  </div>
                ))}
              </div>

              <div className="rounded-xl border border-neutral-800 bg-black/30">
                <div className="border-b border-neutral-800 px-4 py-3">
                  <p className="text-xs font-semibold uppercase tracking-wider text-neutral-500">
                    Purchase order line
                  </p>
                </div>
                <div className="grid gap-4 p-4 sm:grid-cols-[1fr_auto]">
                  <div>
                    <p className="text-sm font-semibold text-white">
                      {shipment?.lines[0]?.sku}
                    </p>
                    <p className="mt-1 text-xs text-neutral-500">
                      {shipment?.lines[0]?.description}
                    </p>
                    <p className="mt-3 text-xs text-neutral-400">
                      {shipment?.supplier} · Invoice {shipment?.vendorInvoiceNumber}
                    </p>
                  </div>
                  <div className="grid grid-cols-2 gap-x-6 gap-y-2 text-right text-xs">
                    <span className="text-neutral-500">Quantity</span>
                    <span className="font-medium text-white">
                      {shipment?.lines[0]?.receivedQuantity}
                    </span>
                    <span className="text-neutral-500">Unit cost</span>
                    <span className="font-medium text-white">
                      {money(shipment?.lines[0]?.vendorUnitCost ?? 0, currency)}
                    </span>
                    <span className="text-neutral-500">Sage match</span>
                    <span className="font-medium text-emerald-300">
                      {shipment?.lines[0]?.matchedSageItemCode ?? 'Pending'}
                    </span>
                  </div>
                </div>
              </div>

              <div className="grid gap-3 sm:grid-cols-2">
                <div className="rounded-xl border border-neutral-800 bg-black/30 p-4">
                  <p className="text-xs font-semibold uppercase tracking-wider text-neutral-500">
                    Landed-cost calculation
                  </p>
                  <div className="mt-3 space-y-2 text-xs">
                    {[
                      ['Goods', allocation?.goodsCost ?? 0],
                      ['Freight', allocation?.allocatedFreight ?? 0],
                      ['Insurance', allocation?.allocatedInsurance ?? 0],
                      ['Duty', allocation?.allocatedDuty ?? 0],
                      ['Brokerage', allocation?.allocatedBrokerage ?? 0],
                    ].map(([label, value]) => (
                      <div key={String(label)} className="flex justify-between gap-4">
                        <span className="text-neutral-500">{label}</span>
                        <span className="text-neutral-200">{money(Number(value), currency)}</span>
                      </div>
                    ))}
                    <div className="mt-3 flex justify-between border-t border-neutral-800 pt-3">
                      <span className="font-medium text-neutral-300">Landed unit cost</span>
                      <span className="font-semibold text-violet-300">
                        {money(allocation?.landedUnitCost ?? 0, currency)}
                      </span>
                    </div>
                  </div>
                </div>

                <div className="rounded-xl border border-neutral-800 bg-black/30 p-4">
                  <p className="text-xs font-semibold uppercase tracking-wider text-neutral-500">
                    Matching customer invoice
                  </p>
                  <p className="mt-3 text-sm font-semibold text-white">
                    {customerInvoice?.sourceInvoiceNumber}
                  </p>
                  <p className="mt-1 text-xs text-neutral-500">{customerInvoice?.customer}</p>
                  <div className="mt-4 space-y-2 text-xs">
                    <div className="flex justify-between">
                      <span className="text-neutral-500">SKU</span>
                      <span className="text-neutral-200">{customerInvoice?.lines[0]?.sku}</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-neutral-500">Quantity</span>
                      <span className="text-neutral-200">{customerInvoice?.lines[0]?.quantity}</span>
                    </div>
                    <div className="flex justify-between border-t border-neutral-800 pt-2">
                      <span className="text-neutral-500">Invoice total</span>
                      <span className="font-semibold text-white">
                        {money(customerInvoice?.total ?? 0, customerInvoice?.currency ?? currency)}
                      </span>
                    </div>
                  </div>
                </div>
              </div>

              {preview.bundle.extractionWarnings.length > 0 && (
                <p className="rounded-xl border border-amber-500/30 bg-amber-500/10 px-4 py-3 text-xs leading-5 text-amber-200">
                  {preview.bundle.extractionWarnings[0]}
                </p>
              )}
            </div>
          )}
        </div>
      </div>
    </section>
  );
}
