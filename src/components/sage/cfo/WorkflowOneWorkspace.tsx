import { useState } from 'react';
import {
  ArrowRight,
  CheckCircle2,
  FileText,
  Inbox,
  Mail,
  Paperclip,
  ScanText,
} from 'lucide-react';
import type { SourceDocument, WorkflowPreview } from '../../../../shared/workflow';

function money(value: number, currency: string) {
  return new Intl.NumberFormat('en-US', {
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
  if (!value) return 'PDF attachment';
  if (value < 1024) return `${value} B`;
  return `${(value / 1024).toFixed(1)} KB`;
}

function Attachment({ document }: { document: SourceDocument }) {
  return (
    <div className="flex items-center gap-3 rounded-xl border border-neutral-800 bg-neutral-900/50 px-3 py-2.5">
      <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-sky-500/10 text-sky-300">
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
  const currency = shipment?.currency ?? 'USD';
  const customerInvoice = preview?.bundle.customerInvoice;
  const purchaseUnits =
    shipment?.lines.reduce((sum, line) => sum + line.receivedQuantity, 0) ?? 0;
  const salesUnits =
    customerInvoice?.lines.reduce((sum, line) => sum + line.quantity, 0) ?? 0;
  const goodsTotal = shipment?.vendorInvoiceSubtotal ?? 0;
  const pallet =
    preview?.bundle.landedCostComponents.find((c) => c.id === 'charge-pallet')
      ?.baseCurrencyAmount ?? 0;
  const ddp =
    preview?.bundle.landedCostComponents.find((c) => c.id === 'charge-ddp')
      ?.baseCurrencyAmount ?? 0;
  const liveExtraction = Boolean(preview && !preview.bundle.fixtureExtraction);

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
                {useLiveGmail
                  ? 'Scan label synpath-sage-demo for subject PO#GHOACRUGOL051926, read the UGolden + Spandex PDFs, then create or match contacts and SKUs in Sage.'
                  : 'Load the UGolden proforma + Spandex invoice pack for PO#GHOACRUGOL051926 and match contacts and SKUs in Sage.'}
              </p>
              <button
                type="button"
                disabled={!canStart || loading}
                onClick={onStart}
                className="mt-6 inline-flex items-center gap-2 rounded-xl bg-white px-5 py-3 text-sm font-semibold text-black transition hover:bg-neutral-200 disabled:cursor-not-allowed disabled:opacity-40"
              >
                {loading
                  ? 'Reading PDF attachments…'
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
                          ? 'border-sky-500/40 bg-sky-500/10'
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

        <div className="bg-[radial-gradient(circle_at_top_right,rgba(14,165,233,0.08),transparent_40%)]">
          <div className="flex items-center justify-between border-b border-neutral-800 px-5 py-4">
            <div className="flex items-center gap-3">
              <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-sky-500/10 text-sky-300">
                <ScanText size={18} />
              </div>
              <div>
                <h2 className="text-sm font-semibold text-white">
                  {liveExtraction ? 'Gmail extraction' : 'Document extraction'}
                </h2>
                <p className="text-xs text-neutral-500">
                  {liveExtraction
                    ? 'UGolden proforma UG26A0519 + Spandex invoice GA18 from scanned mail'
                    : 'UGolden proforma + Spandex invoice field mapping'}
                </p>
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
                <div className="mx-auto mb-4 h-px w-20 bg-gradient-to-r from-transparent via-sky-400/60 to-transparent" />
                <p className="text-sm text-neutral-500">
                  Extracted purchase lines, landed-cost allocation and Spandex sales lines will
                  appear here after Scan Gmail.
                </p>
              </div>
            </div>
          ) : (
            <div className="space-y-5 p-5">
              <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
                {[
                  ['PO', shipment?.externalPoNumber ?? '—'],
                  ['Units in', String(purchaseUnits)],
                  ['Purchase total', money(shipment?.vendorInvoiceTotal ?? 0, currency)],
                  ['Sales total', money(customerInvoice?.total ?? 0, currency)],
                ].map(([label, value]) => (
                  <div key={label} className="rounded-xl border border-neutral-800 bg-black/30 p-3">
                    <p className="text-[10px] uppercase tracking-wider text-neutral-600">{label}</p>
                    <p className="mt-1 truncate text-sm font-semibold text-white">{value}</p>
                  </div>
                ))}
              </div>

              <div className="rounded-xl border border-neutral-800 bg-black/30">
                <div className="flex items-center justify-between border-b border-neutral-800 px-4 py-3">
                  <p className="text-xs font-semibold uppercase tracking-wider text-neutral-500">
                    UGolden purchase lines
                  </p>
                  <p className="text-[11px] text-neutral-500">
                    {shipment?.supplier} · {shipment?.vendorInvoiceNumber}
                  </p>
                </div>
                <div className="divide-y divide-neutral-800/80">
                  {shipment?.lines.map((line) => {
                    const allocation = preview.allocations.find((item) => item.sku === line.sku);
                    return (
                      <div
                        key={line.sku}
                        className="grid gap-3 px-4 py-3 sm:grid-cols-[1.4fr_auto]"
                      >
                        <div>
                          <p className="text-sm font-semibold text-white">{line.sku}</p>
                          <p className="mt-1 text-xs text-neutral-500">{line.description}</p>
                        </div>
                        <div className="grid grid-cols-2 gap-x-5 gap-y-1 text-right text-xs sm:min-w-[220px]">
                          <span className="text-neutral-500">Qty</span>
                          <span className="font-medium text-white">{line.receivedQuantity}</span>
                          <span className="text-neutral-500">Unit cost</span>
                          <span className="font-medium text-white">
                            {money(line.vendorUnitCost, currency)}
                          </span>
                          <span className="text-neutral-500">Landed / pc</span>
                          <span className="font-medium text-sky-300">
                            {money(allocation?.landedUnitCost ?? line.vendorUnitCost, currency)}
                          </span>
                          <span className="text-neutral-500">Sage</span>
                          <span className="font-medium text-emerald-300">
                            {line.matchedSageItemCode ?? 'Create on run'}
                          </span>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>

              <div className="grid gap-3 sm:grid-cols-2">
                <div className="rounded-xl border border-neutral-800 bg-black/30 p-4">
                  <p className="text-xs font-semibold uppercase tracking-wider text-neutral-500">
                    Landed-cost calculation
                  </p>
                  <div className="mt-3 space-y-2 text-xs">
                    {[
                      ['Goods', goodsTotal],
                      ['Pallets', pallet],
                      ['DDP (by weight)', ddp],
                    ].map(([label, value]) => (
                      <div key={String(label)} className="flex justify-between gap-4">
                        <span className="text-neutral-500">{label}</span>
                        <span className="text-neutral-200">{money(Number(value), currency)}</span>
                      </div>
                    ))}
                    <div className="mt-3 flex justify-between border-t border-neutral-800 pt-3">
                      <span className="font-medium text-neutral-300">Purchase Invoice</span>
                      <span className="font-semibold text-sky-300">
                        {money(shipment?.vendorInvoiceTotal ?? 0, currency)}
                      </span>
                    </div>
                    <p className="pt-1 text-[11px] leading-4 text-neutral-600">
                      Inventory cost per sheet = unit cost + pallet share + DDP share by weight.
                    </p>
                  </div>
                </div>

                <div className="rounded-xl border border-neutral-800 bg-black/30 p-4">
                  <p className="text-xs font-semibold uppercase tracking-wider text-neutral-500">
                    Spandex customer invoice
                  </p>
                  <p className="mt-3 text-sm font-semibold text-white">
                    {customerInvoice?.sourceInvoiceNumber}
                  </p>
                  <p className="mt-1 text-xs text-neutral-500">{customerInvoice?.customer}</p>
                  <div className="mt-4 max-h-40 space-y-2 overflow-auto text-xs">
                    {customerInvoice?.lines.map((line) => (
                      <div key={line.sku} className="flex justify-between gap-3">
                        <span className="truncate text-neutral-500">{line.sku}</span>
                        <span className="shrink-0 text-neutral-200">
                          {line.quantity} · {money(line.total, currency)}
                        </span>
                      </div>
                    ))}
                  </div>
                  <div className="mt-3 flex justify-between border-t border-neutral-800 pt-3 text-xs">
                    <span className="text-neutral-500">Sell units / total</span>
                    <span className="font-semibold text-white">
                      {salesUnits} · {money(customerInvoice?.total ?? 0, currency)}
                    </span>
                  </div>
                </div>
              </div>

              {preview.bundle.extractionWarnings[0] &&
                !/fixture extraction is a normalized test result/i.test(
                  preview.bundle.extractionWarnings[0],
                ) && (
                  <p className="rounded-xl border border-sky-500/20 bg-sky-500/10 px-4 py-3 text-xs leading-5 text-sky-100">
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
