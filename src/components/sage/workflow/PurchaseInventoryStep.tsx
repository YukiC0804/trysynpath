import type {
  InventoryPostingStrategy,
  WorkflowPreview,
} from '../../../../shared/workflow';
import { StatusBadge } from '../../demo/StatusBadge';
import { JsonDetails } from './TechnicalDetails';

export function PurchaseInventoryStep({
  preview,
  confirmation,
  mappingConfirmed,
  busy,
  onConfirmationChange,
  onMappingConfirmedChange,
  onSelectionChange,
  onStrategyChange,
  onApprove,
  onExecute,
}: {
  preview: WorkflowPreview | null;
  confirmation: string;
  mappingConfirmed: boolean;
  busy: boolean;
  onConfirmationChange: (value: string) => void;
  onMappingConfirmedChange: (value: boolean) => void;
  onSelectionChange: (key: string, value: string) => void;
  onStrategyChange: (value: InventoryPostingStrategy) => void;
  onApprove: (
    target: 'purchaseInvoice' | 'inventoryReceipt' | 'purchaseInvoiceRelease',
  ) => void;
  onExecute: (
    target: 'purchase_invoice' | 'stock_movements' | 'purchase_invoice_release',
  ) => void;
}) {
  if (!preview) {
    return (
      <div className="rounded-xl border border-neutral-800 bg-[#0a0a0a] p-8 text-center text-sm text-neutral-400">
        Build Documents &amp; Landed Cost preview first.
      </div>
    );
  }
  const run = preview.run;
  const purchaseRecord = run.postingRecords.find(
    (record) => record.transactionType === 'purchase_invoice',
  );
  const movementRecords = run.postingRecords.filter(
    (record) => record.transactionType === 'stock_movement',
  );
  const purchaseLedgers = preview.liveSage.purchaseLedgerAccounts;
  const vendors = preview.liveSage.contacts.filter((contact) =>
    contact.typeIds.includes('VENDOR'),
  );
  return (
    <div className="space-y-5">
      <section className="rounded-xl border border-neutral-800 bg-[#0a0a0a] p-5">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h2 className="text-base font-semibold text-white">Purchase Invoice review</h2>
            <p className="mt-1 text-xs text-neutral-500">
              Vendor prices remain the supplier-invoice prices. Landed cost is not substituted.
            </p>
          </div>
          <StatusBadge
            variant={run.approvals.purchaseInvoice === 'approved' ? 'healthy' : 'warning'}
          >
            {run.approvals.purchaseInvoice}
          </StatusBadge>
        </div>
        <div className="mt-4 grid gap-3 md:grid-cols-2">
          <SelectField
            label="Supplier contact"
            value={preview.selections.supplierContactId}
            options={vendors.map((contact) => ({ id: contact.id, name: contact.name }))}
            onChange={(value) => onSelectionChange('supplierContactId', value)}
          />
          <SelectField
            label="Purchase ledger (accounting approval required)"
            value={preview.selections.purchaseLedgerAccountId}
            options={purchaseLedgers.map((ledger) => ({
              id: ledger.id,
              name: `${ledger.nominalCode ?? ''} ${ledger.name}`.trim(),
            }))}
            onChange={(value) => onSelectionChange('purchaseLedgerAccountId', value)}
          />
          <SelectField
            label="Purchase tax rate"
            value={preview.selections.purchaseTaxRateId}
            options={preview.liveSage.purchaseTaxRates.map((rate) => ({
              id: rate.id,
              name: `${rate.name} (${rate.percentage}%)`,
            }))}
            onChange={(value) => onSelectionChange('purchaseTaxRateId', value)}
          />
          <SelectField
            label="Initial Purchase Invoice status (use Draft)"
            value={preview.selections.purchaseStatusId}
            options={preview.liveSage.artefactStatuses.map((status) => ({
              id: status.id,
              name: status.name,
            }))}
            onChange={(value) => onSelectionChange('purchaseStatusId', value)}
          />
          <label className="text-xs text-neutral-400">
            Inventory posting strategy
            <select
              value={run.inventoryPostingStrategy}
              onChange={(event) =>
                onStrategyChange(event.target.value as InventoryPostingStrategy)
              }
              className="mt-1 w-full rounded-lg border border-neutral-700 bg-black px-3 py-2 text-white"
            >
              <option value="none">Choose before approval</option>
              <option value="stock_movement">Stock Movement (landed unit cost)</option>
              <option value="purchase_invoice_product_lines">
                Purchase Invoice product lines (no Stock Movement)
              </option>
            </select>
          </label>
        </div>
        <p className="mt-3 text-xs text-amber-300">
          The external PO/container reference stays in Synpath, Purchase Invoice reference and
          Stock Movement reference. Sage has no native Purchase Order or Purchase-Invoice-linked
          Goods Receipt here.
        </p>
        <JsonDetails title="Purchase Invoice payload preview" value={preview.payloads.purchaseInvoice} />
        <JsonDetails title="Stock Movement payload previews" value={preview.payloads.stockMovements} />
      </section>

      <section className="rounded-xl border border-neutral-800 bg-[#0a0a0a] p-5">
        <h2 className="text-base font-semibold text-white">Live Sage approval gate</h2>
        <p className="mt-1 text-xs text-neutral-500">
          Live write is never the default. Type the exact reference and confirm accounting mapping.
        </p>
        <div className="mt-4 grid gap-3 md:grid-cols-2">
          <label className="text-xs text-neutral-400">
            Exact confirmation
            <input
              value={confirmation}
              onChange={(event) => onConfirmationChange(event.target.value)}
              placeholder={run.externalReference}
              className="mt-1 w-full rounded-lg border border-neutral-700 bg-black px-3 py-2 text-white"
            />
          </label>
          <label className="flex items-center gap-2 text-xs text-neutral-300">
            <input
              type="checkbox"
              checked={mappingConfirmed}
              onChange={(event) => onMappingConfirmedChange(event.target.checked)}
            />
            I confirm the ledger and tax mapping has accounting approval.
          </label>
        </div>
        <div className="mt-4 flex flex-wrap gap-2">
          <Action
            disabled={busy}
            onClick={() => onApprove('purchaseInvoice')}
            label="Approve Purchase Invoice"
          />
          <Action
            disabled={busy || run.approvals.purchaseInvoice !== 'approved'}
            onClick={() => onExecute('purchase_invoice')}
            label="Create in Sage"
            primary
          />
          <Action
            disabled={busy}
            onClick={() => onApprove('inventoryReceipt')}
            label="Approve Inventory Receipt"
          />
          <Action
            disabled={
              busy ||
              run.approvals.inventoryReceipt !== 'approved' ||
              run.inventoryPostingStrategy !== 'stock_movement'
            }
            onClick={() => onExecute('stock_movements')}
            label={
              run.inventoryPostingStrategy === 'purchase_invoice_product_lines'
                ? 'No separate Stock Movement'
                : 'Record Inventory Receipt'
            }
            primary
          />
          <Action
            disabled={busy || !purchaseRecord}
            onClick={() => onApprove('purchaseInvoiceRelease')}
            label="Approve Invoice Release"
          />
          <Action
            disabled={busy || run.approvals.purchaseInvoiceRelease !== 'approved'}
            onClick={() => onExecute('purchase_invoice_release')}
            label="Release Purchase Invoice"
          />
        </div>
      </section>

      <section className="rounded-xl border border-neutral-800 bg-[#0a0a0a] p-5">
        <h2 className="text-base font-semibold text-white">What Sage actually created</h2>
        {!purchaseRecord && !movementRecords.length ? (
          <p className="mt-3 text-sm text-neutral-500">
            Nothing created. Dry-run previews are not reported as completed writes.
          </p>
        ) : (
          <div className="mt-3 space-y-2">
            {[...(purchaseRecord ? [purchaseRecord] : []), ...movementRecords].map((record) => (
              <div
                key={`${record.transactionType}:${record.sageTransactionId}:${record.externalReference}`}
                className="rounded-lg border border-neutral-800 p-3 text-xs"
              >
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <span className="font-medium text-white">{record.transactionType}</span>
                  <StatusBadge variant={record.readBackVerified ? 'healthy' : 'danger'}>
                    {record.readBackVerified ? 'Read-back verified' : record.status}
                  </StatusBadge>
                </div>
                <p className="mt-1 text-neutral-400">
                  Sage ID: {record.sageTransactionId || 'none'} · {record.externalReference}
                </p>
                {record.differences && Object.keys(record.differences).length > 0 && (
                  <p className="mt-1 text-red-300">
                    Differences: {JSON.stringify(record.differences)}
                  </p>
                )}
                <JsonDetails title="Raw Sage response" value={record.responseSummary} />
              </div>
            ))}
          </div>
        )}
      </section>
    </div>
  );
}

function SelectField({
  label,
  value,
  options,
  onChange,
}: {
  label: string;
  value?: string;
  options: Array<{ id: string; name: string }>;
  onChange: (value: string) => void;
}) {
  return (
    <label className="text-xs text-neutral-400">
      {label}
      <select
        value={value ?? ''}
        onChange={(event) => onChange(event.target.value)}
        className="mt-1 w-full rounded-lg border border-neutral-700 bg-black px-3 py-2 text-white"
      >
        <option value="">Select…</option>
        {options.map((option) => (
          <option key={option.id} value={option.id}>
            {option.name}
          </option>
        ))}
      </select>
    </label>
  );
}

function Action({
  label,
  onClick,
  disabled,
  primary,
}: {
  label: string;
  onClick: () => void;
  disabled: boolean;
  primary?: boolean;
}) {
  return (
    <button
      type="button"
      disabled={disabled}
      onClick={onClick}
      className={`rounded-lg px-3 py-2 text-xs font-semibold disabled:opacity-35 ${
        primary ? 'bg-white text-black' : 'border border-neutral-700 text-neutral-200'
      }`}
    >
      {label}
    </button>
  );
}
