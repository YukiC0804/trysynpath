import type {
  AllocationMethod,
  ChargeClassification,
  WorkflowPreview,
} from '../../../../shared/workflow';
import type { GmailStatus, GmailSyncResult } from '../../../lib/workflowApi';
import { StatusBadge } from '../../demo/StatusBadge';
import { JsonDetails } from './TechnicalDetails';

const money = (value: number) => value.toFixed(2);

export function DocumentsLandedCostStep({
  preview,
  gmailStatus,
  gmailSync,
  gmailQuery,
  selectedMessageIds,
  busy,
  onGmailQueryChange,
  onSyncGmail,
  onToggleMessage,
  onLineChange,
  onChargeChange,
  onChargeMethodChange,
  onChargeClassificationChange,
  onRefreshPreview,
}: {
  preview: WorkflowPreview | null;
  gmailStatus: GmailStatus | null;
  gmailSync: GmailSyncResult | null;
  gmailQuery: string;
  selectedMessageIds: string[];
  busy: boolean;
  onGmailQueryChange: (value: string) => void;
  onSyncGmail: () => void;
  onToggleMessage: (id: string) => void;
  onLineChange: (
    sku: string,
    field: 'receivedQuantity' | 'vendorUnitCost' | 'weight' | 'volume',
    value: number,
  ) => void;
  onChargeChange: (id: string, value: number) => void;
  onChargeMethodChange: (id: string, value: AllocationMethod) => void;
  onChargeClassificationChange: (id: string, value: ChargeClassification) => void;
  onRefreshPreview: () => void;
}) {
  return (
    <div className="space-y-5">
      <section className="rounded-xl border border-neutral-800 bg-[#0a0a0a] p-5">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <h2 className="text-base font-semibold text-white">Gmail &amp; document collection</h2>
            <p className="mt-1 text-sm text-neutral-400">
              Fixture and Gmail sources use the same normalized document contract.
            </p>
          </div>
          <StatusBadge variant={gmailStatus?.connected ? 'healthy' : 'neutral'}>
            {gmailStatus?.connected
              ? `Gmail: ${gmailStatus.emailAddress ?? 'Connected'}`
              : gmailStatus?.configured
                ? 'Gmail disconnected'
                : 'Gmail not configured'}
          </StatusBadge>
        </div>
        <div className="mt-4 flex flex-wrap gap-2">
          {gmailStatus?.connected ? (
            <>
              <input
                value={gmailQuery}
                onChange={(event) => onGmailQueryChange(event.target.value)}
                className="min-w-[280px] flex-1 rounded-lg border border-neutral-700 bg-black px-3 py-2 text-xs text-white"
                aria-label="Gmail search query"
              />
              <button
                type="button"
                disabled={busy}
                onClick={onSyncGmail}
                className="rounded-lg bg-white px-3 py-2 text-xs font-semibold text-black disabled:opacity-40"
              >
                Sync from Gmail
              </button>
            </>
          ) : (
            <a
              href="/api/gmail/oauth/connect"
              className="rounded-lg bg-white px-3 py-2 text-xs font-semibold text-black"
            >
              Connect Gmail
            </a>
          )}
        </div>
        {gmailStatus?.lastSyncAt && (
          <p className="mt-2 text-xs text-neutral-500">
            Last sync: {new Date(gmailStatus.lastSyncAt).toLocaleString()}
          </p>
        )}
        {gmailSync && (
          <div className="mt-4 space-y-2">
            <p className="text-xs text-neutral-400">
              {gmailSync.messageCount} messages · {gmailSync.attachmentCount} attachments — select
              messages before importing.
            </p>
            {gmailSync.messages.map((email) => (
              <label
                key={email.gmailMessageId}
                className="flex cursor-pointer gap-3 rounded-lg border border-neutral-800 p-3"
              >
                <input
                  type="checkbox"
                  checked={selectedMessageIds.includes(email.gmailMessageId)}
                  onChange={() => onToggleMessage(email.gmailMessageId)}
                />
                <span className="min-w-0">
                  <span className="block truncate text-sm text-white">{email.subject}</span>
                  <span className="block text-xs text-neutral-500">
                    {email.from} · thread {email.gmailThreadId} · {email.attachmentIds.length}{' '}
                    attachment(s)
                  </span>
                  <span className="mt-1 block text-xs text-neutral-400">{email.snippet}</span>
                </span>
                <StatusBadge variant="neutral">{email.processingStatus}</StatusBadge>
              </label>
            ))}
          </div>
        )}
      </section>

      {!preview ? (
        <section className="rounded-xl border border-neutral-800 bg-[#0a0a0a] p-8 text-center text-sm text-neutral-400">
          Load fixture documents or sync selected Gmail messages to build the workflow preview.
        </section>
      ) : (
        <>
          <section className="rounded-xl border border-neutral-800 bg-[#0a0a0a] p-5">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div>
                <h2 className="text-base font-semibold text-white">What Synpath received</h2>
                <p className="mt-1 text-xs text-neutral-500">
                  {preview.bundle.emails.length} emails · {preview.bundle.documents.length} documents ·
                  reference {preview.bundle.shipment.externalPoNumber}
                </p>
              </div>
              <StatusBadge variant="warning">Fixture extraction — needs review</StatusBadge>
            </div>
            <div className="mt-4 grid gap-2 md:grid-cols-2 xl:grid-cols-3">
              {preview.bundle.documents.map((document) => (
                <div key={document.id} className="rounded-lg border border-neutral-800 p-3">
                  <p className="truncate text-xs font-medium text-white">{document.fileName}</p>
                  <p className="mt-1 text-[11px] text-neutral-500">
                    {document.documentType} · {(document.fileSize / 1024).toFixed(1)} KB ·{' '}
                    {document.sourceType}
                  </p>
                  <StatusBadge variant="neutral">{document.extractionStatus}</StatusBadge>
                </div>
              ))}
            </div>
          </section>

          <section className="rounded-xl border border-neutral-800 bg-[#0a0a0a] p-5">
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div>
                <h2 className="text-base font-semibold text-white">Extracted lines &amp; SKU matching</h2>
                <p className="mt-1 text-xs text-neutral-500">
                  Correct fixture values here; future real extraction plugs into the same fields.
                </p>
              </div>
              <button
                type="button"
                disabled={busy}
                onClick={onRefreshPreview}
                className="rounded-lg border border-neutral-700 px-3 py-2 text-xs text-neutral-200"
              >
                Recalculate preview
              </button>
            </div>
            <div className="mt-4 overflow-x-auto">
              <table className="w-full min-w-[1000px] text-left text-xs">
                <thead className="text-[10px] uppercase text-neutral-500">
                  <tr>
                    <th className="py-2 pr-3">Extracted SKU</th>
                    <th className="px-2">Sage match</th>
                    <th className="px-2">Current qty</th>
                    <th className="px-2">Incoming</th>
                    <th className="px-2">Vendor unit</th>
                    <th className="px-2">Weight</th>
                    <th className="px-2">Volume</th>
                    <th className="px-2">Existing cost</th>
                    <th className="px-2">Landed unit</th>
                    <th className="px-2">Projected qty</th>
                  </tr>
                </thead>
                <tbody>
                  {preview.bundle.shipment.lines.map((line) => {
                    const sage = preview.liveSage.stockItems.find(
                      (item) => item.id === line.matchedSageStockItemId,
                    );
                    const allocation = preview.allocations.find((item) => item.sku === line.sku);
                    return (
                      <tr key={line.sku} className="border-t border-neutral-800">
                        <td className="py-3 pr-3 font-medium text-white">{line.sku}</td>
                        <td className="px-2">
                          <StatusBadge
                            variant={line.matchingStatus === 'exact' ? 'healthy' : 'danger'}
                          >
                            {line.matchedSageItemCode ?? line.matchingStatus}
                          </StatusBadge>
                        </td>
                        <td className="px-2">{sage?.quantityInStock ?? '—'}</td>
                        <td className="px-2">
                          <NumberInput
                            value={line.receivedQuantity}
                            onChange={(value) => onLineChange(line.sku, 'receivedQuantity', value)}
                          />
                        </td>
                        <td className="px-2">
                          <NumberInput
                            value={line.vendorUnitCost}
                            onChange={(value) => onLineChange(line.sku, 'vendorUnitCost', value)}
                          />
                        </td>
                        <td className="px-2">
                          <NumberInput
                            value={line.weight}
                            onChange={(value) => onLineChange(line.sku, 'weight', value)}
                          />
                        </td>
                        <td className="px-2">
                          <NumberInput
                            value={line.volume}
                            onChange={(value) => onLineChange(line.sku, 'volume', value)}
                          />
                        </td>
                        <td className="px-2">{sage ? money(sage.costPrice) : '—'}</td>
                        <td className="px-2 text-violet-300">
                          {allocation ? allocation.landedUnitCost.toFixed(6) : '—'}
                        </td>
                        <td className="px-2">
                          {sage ? sage.quantityInStock + line.receivedQuantity : '—'}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
            <JsonDetails title="Normalized extraction fields" value={preview.extractedFields} />
          </section>

          <section className="rounded-xl border border-neutral-800 bg-[#0a0a0a] p-5">
            <h2 className="text-base font-semibold text-white">Landed-cost allocation</h2>
            <p className="mt-1 text-xs text-neutral-500">
              Recoverable VAT is excluded by default. Every capitalizable charge must reconcile.
            </p>
            <div className="mt-4 overflow-x-auto">
              <table className="w-full min-w-[780px] text-left text-xs">
                <thead className="text-[10px] uppercase text-neutral-500">
                  <tr>
                    <th className="py-2 pr-3">Charge</th>
                    <th className="px-2">Amount GBP</th>
                    <th className="px-2">Classification</th>
                    <th className="px-2">Allocation</th>
                    <th className="px-2">Source</th>
                  </tr>
                </thead>
                <tbody>
                  {preview.bundle.landedCostComponents.map((component) => (
                    <tr key={component.id} className="border-t border-neutral-800">
                      <td className="py-3 pr-3 text-white">{component.type}</td>
                      <td className="px-2">
                        <NumberInput
                          value={component.amount}
                          onChange={(value) => onChargeChange(component.id, value)}
                        />
                      </td>
                      <td className="px-2">
                        <select
                          value={component.classification}
                          onChange={(event) =>
                            onChargeClassificationChange(
                              component.id,
                              event.target.value as ChargeClassification,
                            )
                          }
                          className="rounded border border-neutral-700 bg-black px-2 py-1"
                        >
                          <option value="capitalizable">Capitalizable</option>
                          <option value="non_capitalizable">Non-capitalizable</option>
                          <option value="recoverable_tax">Recoverable tax</option>
                          <option value="unresolved">Unresolved</option>
                        </select>
                      </td>
                      <td className="px-2">
                        <select
                          value={component.allocationMethod}
                          onChange={(event) =>
                            onChargeMethodChange(
                              component.id,
                              event.target.value as AllocationMethod,
                            )
                          }
                          className="rounded border border-neutral-700 bg-black px-2 py-1"
                        >
                          <option value="product_value">Product value</option>
                          <option value="quantity">Quantity</option>
                          <option value="weight">Weight</option>
                          <option value="volume">Volume</option>
                          <option value="manual_percentage">Manual percentage</option>
                          <option value="manual_amount">Manual amount</option>
                        </select>
                      </td>
                      <td className="px-2 text-neutral-500">{component.sourceDocumentId}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <div className="mt-4 grid gap-2 sm:grid-cols-2 lg:grid-cols-4">
              <Metric label="Goods" value={preview.reconciliation.sourceGoodsTotal} />
              <Metric label="Freight" value={preview.reconciliation.freightTotal} />
              <Metric label="Duty" value={preview.reconciliation.dutyTotal} />
              <Metric label="Tax (shown, recoverable excluded)" value={preview.reconciliation.taxTotal} />
              <Metric label="Other capitalizable" value={preview.reconciliation.otherCharges} />
              <Metric label="Capitalizable total" value={preview.reconciliation.totalCapitalizableCost} />
              <Metric label="Allocated" value={preview.reconciliation.totalAllocated} />
              <Metric
                label="Variance"
                value={preview.reconciliation.variance}
                good={preview.reconciliation.withinTolerance}
              />
            </div>
          </section>
        </>
      )}
    </div>
  );
}

function NumberInput({ value, onChange }: { value: number; onChange: (value: number) => void }) {
  return (
    <input
      type="number"
      step="0.01"
      value={value}
      onChange={(event) => onChange(Number(event.target.value))}
      className="w-24 rounded border border-neutral-700 bg-black px-2 py-1 text-white"
    />
  );
}

function Metric({
  label,
  value,
  good,
}: {
  label: string;
  value: number;
  good?: boolean;
}) {
  return (
    <div className="rounded-lg border border-neutral-800 p-3">
      <p className="text-[10px] uppercase text-neutral-500">{label}</p>
      <p className={`mt-1 text-sm ${good === false ? 'text-red-300' : 'text-white'}`}>
        £{money(value)}
      </p>
    </div>
  );
}
