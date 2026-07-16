import type { WorkflowPreview } from '../../../../shared/workflow';
import { StatusBadge } from '../../demo/StatusBadge';
import { JsonDetails } from './TechnicalDetails';

export function CustomerSaleStep({
  preview,
  confirmation,
  mappingConfirmed,
  busy,
  onConfirmationChange,
  onMappingConfirmedChange,
  onSelectionChange,
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
  onApprove: (target: 'customerSale' | 'salesInvoiceRelease') => void;
  onExecute: (target: 'sales_invoice' | 'sales_invoice_release') => void;
}) {
  if (!preview) {
    return (
      <div className="rounded-xl border border-neutral-800 bg-[#0a0a0a] p-8 text-center text-sm text-neutral-400">
        Build Documents &amp; Landed Cost preview first.
      </div>
    );
  }
  const invoice = preview.bundle.customerInvoice;
  const run = preview.run;
  const salesRecord = run.postingRecords.find(
    (record) => record.transactionType === 'sales_invoice',
  );
  const customers = preview.liveSage.contacts.filter((contact) =>
    contact.typeIds.includes('CUSTOMER'),
  );
  return (
    <div className="space-y-5">
      <section className="rounded-xl border border-neutral-800 bg-[#0a0a0a] p-5">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h2 className="text-base font-semibold text-white">Customer Invoice review</h2>
            <p className="mt-1 text-xs text-neutral-500">
              Source invoice {invoice.sourceInvoiceNumber} · customer {invoice.customer}
            </p>
          </div>
          <StatusBadge variant={run.approvals.customerSale === 'approved' ? 'healthy' : 'warning'}>
            {run.approvals.customerSale}
          </StatusBadge>
        </div>
        <div className="mt-4 overflow-x-auto">
          <table className="w-full min-w-[720px] text-left text-xs">
            <thead className="text-[10px] uppercase text-neutral-500">
              <tr>
                <th className="py-2">SKU</th>
                <th>Qty</th>
                <th>Unit price</th>
                <th>Discount</th>
                <th>Tax</th>
                <th>Sage product</th>
                <th>Available after receipt</th>
              </tr>
            </thead>
            <tbody>
              {invoice.lines.map((line) => {
                const stock = preview.liveSage.stockItems.find(
                  (item) => item.id === line.matchedSageStockItemId,
                );
                const incoming =
                  preview.bundle.shipment.lines.find((item) => item.sku === line.sku)
                    ?.receivedQuantity ?? 0;
                return (
                  <tr key={line.sku} className="border-t border-neutral-800">
                    <td className="py-3 font-medium text-white">{line.sku}</td>
                    <td>{line.quantity}</td>
                    <td>£{line.salesUnitPrice.toFixed(2)}</td>
                    <td>£{line.discount.toFixed(2)}</td>
                    <td>£{line.tax.toFixed(2)}</td>
                    <td>{stock?.itemCode ?? 'Missing'}</td>
                    <td>{stock ? stock.quantityInStock + incoming : '—'}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
        <div className="mt-4 grid gap-3 md:grid-cols-3">
          <Select
            label="Customer contact"
            value={preview.selections.customerContactId}
            options={customers.map((contact) => ({ id: contact.id, name: contact.name }))}
            onChange={(value) => onSelectionChange('customerContactId', value)}
          />
          <Select
            label="Sales ledger"
            value={preview.selections.salesLedgerAccountId}
            options={preview.liveSage.salesLedgerAccounts.map((ledger) => ({
              id: ledger.id,
              name: `${ledger.nominalCode ?? ''} ${ledger.name}`.trim(),
            }))}
            onChange={(value) => onSelectionChange('salesLedgerAccountId', value)}
          />
          <Select
            label="Sales tax rate"
            value={preview.selections.salesTaxRateId}
            options={preview.liveSage.salesTaxRates.map((rate) => ({
              id: rate.id,
              name: `${rate.name} (${rate.percentage}%)`,
            }))}
            onChange={(value) => onSelectionChange('salesTaxRateId', value)}
          />
          <Select
            label="Initial Sales Invoice status (use Draft)"
            value={preview.selections.salesStatusId}
            options={preview.liveSage.artefactStatuses.map((status) => ({
              id: status.id,
              name: status.name,
            }))}
            onChange={(value) => onSelectionChange('salesStatusId', value)}
          />
        </div>
        <div className="mt-4 grid gap-2 sm:grid-cols-4">
          <Metric label="Subtotal" value={invoice.subtotal} />
          <Metric label="Shipping" value={invoice.shipping} />
          <Metric label="Tax" value={invoice.tax} />
          <Metric label="Total" value={invoice.total} />
        </div>
        <JsonDetails title="Sales Invoice payload preview" value={preview.payloads.salesInvoice} />
      </section>

      <section className="rounded-xl border border-neutral-800 bg-[#0a0a0a] p-5">
        <h2 className="text-base font-semibold text-white">Customer Sale approval</h2>
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
            I confirm customer, ledger and tax mapping.
          </label>
        </div>
        <div className="mt-4 flex flex-wrap gap-2">
          <Action disabled={busy} onClick={() => onApprove('customerSale')} label="Approve Sale" />
          <Action
            disabled={busy || run.approvals.customerSale !== 'approved'}
            onClick={() => onExecute('sales_invoice')}
            label="Create Sales Invoice"
            primary
          />
          <Action
            disabled={busy || !salesRecord}
            onClick={() => onApprove('salesInvoiceRelease')}
            label="Approve Release"
          />
          <Action
            disabled={busy || run.approvals.salesInvoiceRelease !== 'approved'}
            onClick={() => onExecute('sales_invoice_release')}
            label="Release Sales Invoice"
          />
        </div>
      </section>

      <section className="rounded-xl border border-neutral-800 bg-[#0a0a0a] p-5">
        <h2 className="text-base font-semibold text-white">What Sage actually created</h2>
        {!salesRecord ? (
          <p className="mt-3 text-sm text-neutral-500">
            Nothing created. Previewing in dry-run mode performs no Sage write.
          </p>
        ) : (
          <div className="mt-3 rounded-lg border border-neutral-800 p-3 text-xs">
            <div className="flex items-center justify-between gap-2">
              <span className="font-medium text-white">Sales Invoice</span>
              <StatusBadge variant={salesRecord.readBackVerified ? 'healthy' : 'danger'}>
                {salesRecord.readBackVerified ? 'Read-back verified' : salesRecord.status}
              </StatusBadge>
            </div>
            <p className="mt-1 text-neutral-400">
              Sage ID: {salesRecord.sageTransactionId} · {salesRecord.externalReference}
            </p>
            {salesRecord.differences && Object.keys(salesRecord.differences).length > 0 && (
              <p className="mt-1 text-red-300">
                Differences: {JSON.stringify(salesRecord.differences)}
              </p>
            )}
            <JsonDetails title="Raw Sage response" value={salesRecord.responseSummary} />
          </div>
        )}
      </section>
    </div>
  );
}

function Select({
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

function Metric({ label, value }: { label: string; value: number }) {
  return (
    <div className="rounded-lg border border-neutral-800 p-3">
      <p className="text-[10px] uppercase text-neutral-500">{label}</p>
      <p className="mt-1 text-sm text-white">£{value.toFixed(2)}</p>
    </div>
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
