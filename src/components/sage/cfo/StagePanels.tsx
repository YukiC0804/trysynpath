import type { WorkflowPreview } from '../../../../shared/workflow';
import {
  REQUIRED_PURCHASE_DOC_TYPES,
  allocationMethodLabel,
  customerDocuments,
  documentTypeLabel,
  inventoryAvailability,
  matchedSkuCount,
  money,
  purchaseDocuments,
  purchaseInvoiceRecord,
  salesInvoiceRecord,
  selectedAllocationMethod,
  stockMovementRecords,
  type CfoStageId,
} from './helpers';

const PRIMARY =
  'rounded-lg bg-white px-4 py-2.5 text-sm font-semibold text-black disabled:opacity-40';
const SECONDARY =
  'rounded-lg border border-neutral-700 px-4 py-2.5 text-sm text-neutral-300 disabled:opacity-40';

function SummaryGrid({ items }: { items: Array<{ label: string; value: string }> }) {
  return (
    <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
      {items.map((item) => (
        <div key={item.label} className="rounded-lg border border-neutral-800 bg-black/40 px-3 py-2">
          <p className="text-[11px] uppercase tracking-wide text-neutral-500">{item.label}</p>
          <p className="mt-1 text-sm font-medium text-white">{item.value}</p>
        </div>
      ))}
    </div>
  );
}

function ProcessingSteps({ steps, activeIndex }: { steps: string[]; activeIndex: number }) {
  return (
    <ul className="space-y-2">
      {steps.map((step, index) => {
        const done = index < activeIndex;
        const current = index === activeIndex;
        return (
          <li
            key={step}
            className={`flex items-center gap-2 text-sm ${
              done ? 'text-emerald-300' : current ? 'text-white' : 'text-neutral-500'
            }`}
          >
            <span
              className={`h-2 w-2 rounded-full ${
                done ? 'bg-emerald-400' : current ? 'bg-white animate-pulse' : 'bg-neutral-700'
              }`}
            />
            {step}
          </li>
        );
      })}
    </ul>
  );
}

export function DocumentsStage({
  preview,
  busy,
  gmailConnected,
  onLoad,
}: {
  preview: WorkflowPreview | null;
  busy: boolean;
  gmailConnected: boolean;
  onLoad: () => void;
}) {
  const docs = purchaseDocuments(preview);
  const byType = new Map(docs.map((doc) => [doc.documentType, doc]));
  const checklist = [
    ...REQUIRED_PURCHASE_DOC_TYPES,
    'pricing_csv' as const,
  ].map((type) => {
    const doc = byType.get(type);
    return {
      name: doc?.fileName ?? documentTypeLabel(type),
      type: documentTypeLabel(type),
      received: Boolean(doc),
      status: doc
        ? doc.extractionStatus === 'Ready' || doc.extractionStatus === 'Needs Review'
          ? 'Ready'
          : doc.extractionStatus
        : 'Missing',
    };
  });

  return (
    <div className="space-y-4">
      <p className="text-sm text-neutral-400">
        Reference: <span className="font-medium text-white">PO#GHOACRUGOL051926</span>
      </p>
      <p className="text-sm text-neutral-400">
        Load the purchase order and shipment documents for this PO. The customer invoice is handled
        after inventory is received.
      </p>
      <button type="button" disabled={busy} onClick={onLoad} className={PRIMARY}>
        {busy ? 'Loading…' : 'Load Documents from Gmail'}
      </button>
      {!gmailConnected && (
        <p className="text-xs text-neutral-500">
          Gmail is not connected yet. Documents will load from the prepared demo pack for this PO.
        </p>
      )}
      <div className="overflow-x-auto rounded-lg border border-neutral-800">
        <table className="min-w-full text-left text-sm">
          <thead className="bg-black/50 text-xs uppercase tracking-wide text-neutral-500">
            <tr>
              <th className="px-3 py-2 font-medium">Document</th>
              <th className="px-3 py-2 font-medium">Type</th>
              <th className="px-3 py-2 font-medium">Received</th>
              <th className="px-3 py-2 font-medium">Status</th>
            </tr>
          </thead>
          <tbody>
            {checklist.map((row) => (
              <tr key={row.type} className="border-t border-neutral-800">
                <td className="px-3 py-2 text-white">{row.name}</td>
                <td className="px-3 py-2 text-neutral-300">{row.type}</td>
                <td className="px-3 py-2">{row.received ? 'Received' : 'Missing'}</td>
                <td className="px-3 py-2 text-neutral-300">{row.status}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

export function LandedCostStage({
  preview,
  busy,
  onContinue,
}: {
  preview: WorkflowPreview;
  busy: boolean;
  onContinue: () => void;
}) {
  const { reconciliation, allocations, bundle } = preview;
  const currency = bundle.shipment.currency || 'GBP';
  const method = selectedAllocationMethod(preview);
  const totalUnits = bundle.shipment.lines.reduce((sum, line) => sum + line.receivedQuantity, 0);
  const charges =
    reconciliation.freightTotal +
    reconciliation.dutyTotal +
    reconciliation.taxTotal +
    reconciliation.otherCharges;

  return (
    <div className="space-y-4">
      <p className="text-sm text-neutral-400">
        Synpath extracted the products and shipment charges and allocated the landed cost to each
        SKU.
      </p>
      <p className="text-sm text-neutral-300">
        Allocation Method: <span className="font-medium text-white">{allocationMethodLabel(method)}</span>
      </p>
      <SummaryGrid
        items={[
          { label: 'Total SKUs', value: String(bundle.shipment.lines.length) },
          { label: 'Total Units', value: String(totalUnits) },
          { label: 'Product Cost', value: money(reconciliation.sourceGoodsTotal, currency) },
          {
            label: 'Freight, Duties & Other Charges',
            value: money(charges, currency),
          },
          {
            label: 'Total Landed Cost',
            value: money(reconciliation.totalCapitalizableCost, currency),
          },
        ]}
      />
      {!reconciliation.withinTolerance && (
        <div className="rounded-lg border border-red-500/30 bg-red-500/10 px-3 py-2 text-sm text-red-200">
          Landed costs do not reconcile. Resolve the variance before approval.
        </div>
      )}
      <div className="overflow-x-auto rounded-lg border border-neutral-800">
        <table className="min-w-full text-left text-sm">
          <thead className="bg-black/50 text-xs uppercase tracking-wide text-neutral-500">
            <tr>
              <th className="px-3 py-2">SKU</th>
              <th className="px-3 py-2">Description</th>
              <th className="px-3 py-2">Qty</th>
              <th className="px-3 py-2">Product Unit Cost</th>
              <th className="px-3 py-2">Allocated Freight</th>
              <th className="px-3 py-2">Allocated Duties &amp; Taxes</th>
              <th className="px-3 py-2">Landed Unit Cost</th>
              <th className="px-3 py-2">Sage Product Match</th>
            </tr>
          </thead>
          <tbody>
            {bundle.shipment.lines.map((line) => {
              const allocation = allocations.find((item) => item.sku === line.sku);
              const matched =
                line.matchingStatus === 'exact' || line.matchingStatus === 'confirmed';
              return (
                <tr key={line.sku} className="border-t border-neutral-800">
                  <td className="px-3 py-2 font-medium text-white">{line.sku}</td>
                  <td className="px-3 py-2 text-neutral-300">{line.description}</td>
                  <td className="px-3 py-2">{line.receivedQuantity}</td>
                  <td className="px-3 py-2">{money(line.vendorUnitCost, currency)}</td>
                  <td className="px-3 py-2">
                    {money(allocation?.allocatedFreight ?? 0, currency)}
                  </td>
                  <td className="px-3 py-2">
                    {money(
                      (allocation?.allocatedDuty ?? 0) +
                        (allocation?.allocatedTax ?? 0) +
                        (allocation?.allocatedBrokerage ?? 0),
                      currency,
                    )}
                  </td>
                  <td className="px-3 py-2 font-medium text-white">
                    {money(allocation?.landedUnitCost ?? 0, currency)}
                  </td>
                  <td className="px-3 py-2">
                    {matched ? line.matchedSageItemCode ?? 'Matched' : 'Needs review'}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
      <button
        type="button"
        disabled={busy || !reconciliation.withinTolerance}
        onClick={onContinue}
        className={PRIMARY}
      >
        Continue to Review
      </button>
    </div>
  );
}

export function ReviewStage({
  preview,
  busy,
  sageConnected,
  onApprove,
  onGoTo,
}: {
  preview: WorkflowPreview;
  busy: boolean;
  sageConnected: boolean;
  onApprove: () => void;
  onGoTo: (stage: CfoStageId) => void;
}) {
  const { bundle, reconciliation } = preview;
  const currency = bundle.shipment.currency || 'GBP';
  const totalUnits = bundle.shipment.lines.reduce((sum, line) => sum + line.receivedQuantity, 0);
  const charges =
    reconciliation.freightTotal +
    reconciliation.dutyTotal +
    reconciliation.taxTotal +
    reconciliation.otherCharges;
  const matched = matchedSkuCount(preview);
  const checks = [
    {
      label: 'All required documents received',
      ok: purchaseDocuments(preview).filter((doc) =>
        REQUIRED_PURCHASE_DOC_TYPES.includes(doc.documentType),
      ).length >= REQUIRED_PURCHASE_DOC_TYPES.length,
      stage: 'documents' as CfoStageId,
    },
    {
      label: 'All SKUs matched',
      ok: matched === bundle.shipment.lines.length,
      stage: 'landedCost' as CfoStageId,
    },
    {
      label: 'Quantities verified',
      ok: bundle.shipment.lines.every((line) => line.receivedQuantity > 0),
      stage: 'landedCost' as CfoStageId,
    },
    {
      label: 'Charges fully allocated',
      ok: reconciliation.withinTolerance,
      stage: 'landedCost' as CfoStageId,
    },
    {
      label: 'Landed costs reconciled',
      ok: reconciliation.withinTolerance,
      stage: 'landedCost' as CfoStageId,
    },
    {
      label: 'Sage connection ready',
      ok: sageConnected && preview.liveSage.connected,
      stage: 'review' as CfoStageId,
    },
  ];
  const failed = checks.find((check) => !check.ok);

  return (
    <div className="space-y-4">
      <SummaryGrid
        items={[
          { label: 'PO Reference', value: `PO#${bundle.shipment.externalPoNumber}` },
          { label: 'Supplier', value: bundle.shipment.supplier },
          { label: 'Shipment Reference', value: bundle.shipment.containerNumber },
          { label: 'Number of SKUs', value: String(bundle.shipment.lines.length) },
          { label: 'Total Received Quantity', value: String(totalUnits) },
          {
            label: 'Vendor Invoice Total',
            value: money(bundle.shipment.vendorInvoiceTotal, currency),
          },
          { label: 'Freight, Duties and Tax Total', value: money(charges, currency) },
          {
            label: 'Total Landed Inventory Value',
            value: money(reconciliation.totalCapitalizableCost, currency),
          },
          {
            label: 'Allocation Method',
            value: allocationMethodLabel(selectedAllocationMethod(preview)),
          },
          { label: 'Matched Sage Products', value: String(matched) },
        ]}
      />
      <ul className="space-y-2">
        {checks.map((check) => (
          <li
            key={check.label}
            className={`flex items-center gap-2 text-sm ${
              check.ok ? 'text-emerald-300' : 'text-amber-200'
            }`}
          >
            <span>{check.ok ? '✓' : '!'}</span>
            {check.label}
          </li>
        ))}
      </ul>
      {failed && failed.stage !== 'review' && (
        <div className="flex flex-wrap items-center gap-3 rounded-lg border border-amber-500/30 bg-amber-500/10 px-3 py-2 text-sm text-amber-100">
          <span>{failed.label} needs attention.</span>
          <button type="button" className={SECONDARY} onClick={() => onGoTo(failed.stage)}>
            Return to stage
          </button>
        </div>
      )}
      {!sageConnected && (
        <p className="text-sm text-amber-200">Connect Sage before approving the purchase posting.</p>
      )}
      <button
        type="button"
        disabled={busy || Boolean(failed) || !sageConnected}
        onClick={onApprove}
        className={PRIMARY}
      >
        Approve &amp; Post Purchase to Sage
      </button>
    </div>
  );
}

export function PurchaseInvoiceStage({
  preview,
  processingStep,
}: {
  preview: WorkflowPreview;
  processingStep: number;
}) {
  const record = purchaseInvoiceRecord(preview.run);
  const currency = preview.bundle.shipment.currency || 'GBP';
  if (record?.status === 'succeeded' && record.readBackVerified) {
    return (
      <div className="space-y-3">
        <p className="text-base font-medium text-emerald-300">Purchase Invoice Created in Sage</p>
        <SummaryGrid
          items={[
            { label: 'Sage Purchase Invoice ID', value: record.sageTransactionId },
            { label: 'Supplier', value: preview.bundle.shipment.supplier },
            {
              label: 'Vendor Invoice Reference',
              value: preview.bundle.shipment.vendorInvoiceNumber,
            },
            {
              label: 'Invoice Total',
              value: money(preview.bundle.shipment.vendorInvoiceTotal, currency),
            },
            { label: 'Verified in Sage', value: 'Yes' },
          ]}
        />
      </div>
    );
  }
  return (
    <div className="space-y-4">
      <p className="text-sm text-neutral-400">
        Creating the Purchase Invoice to match the vendor invoice amount for PO#GHOACRUGOL051926.
      </p>
      <ProcessingSteps
        steps={['Preparing Purchase Invoice', 'Sending to Sage', 'Verifying Sage record']}
        activeIndex={processingStep}
      />
      {record?.status === 'failed' && (
        <p className="text-sm text-red-300">
          Purchase Invoice needs attention. Successful records are preserved for safe retry.
        </p>
      )}
    </div>
  );
}

export function InventoryStage({
  preview,
  processingStep,
  busy,
  onRetry,
}: {
  preview: WorkflowPreview;
  processingStep: number;
  busy: boolean;
  onRetry?: () => void;
}) {
  const movements = stockMovementRecords(preview.run);
  const failed = movements.some((record) => record.status === 'failed');
  const succeeded = movements.filter((record) => record.status === 'succeeded');
  const currency = preview.bundle.shipment.currency || 'GBP';
  const totalQty = preview.bundle.shipment.lines.reduce(
    (sum, line) => sum + line.receivedQuantity,
    0,
  );
  const landedValue = preview.reconciliation.totalCapitalizableCost;

  if (succeeded.length > 0 && !failed && succeeded.every((record) => record.readBackVerified)) {
    return (
      <div className="space-y-4">
        <p className="text-base font-medium text-emerald-300">Inventory Updated in Sage</p>
        <SummaryGrid
          items={[
            { label: 'SKUs Updated', value: String(succeeded.length) },
            { label: 'Total Quantity Received', value: String(totalQty) },
            { label: 'Total Landed Inventory Value', value: money(landedValue, currency) },
            { label: 'Verification Status', value: 'Verified in Sage' },
          ]}
        />
        <InventoryTable preview={preview} />
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <p className="text-sm text-neutral-400">
        Synpath is recording the received quantities and calculated landed costs against the
        matching Sage inventory items.
      </p>
      <ProcessingSteps
        steps={[
          'Creating inventory movements',
          'Updating Sage inventory',
          'Reloading Products and services',
          'Verifying quantities and costs',
        ]}
        activeIndex={processingStep}
      />
      <InventoryTable preview={preview} />
      {failed && (
        <div className="space-y-2 rounded-lg border border-amber-500/30 bg-amber-500/10 p-3">
          <p className="text-sm font-medium text-amber-100">Partial Completion</p>
          <p className="text-sm text-amber-100/80">
            Some inventory movements succeeded. Only failed SKUs can be retried safely.
          </p>
          {onRetry && (
            <button type="button" disabled={busy} onClick={onRetry} className={PRIMARY}>
              Retry Failed Movements
            </button>
          )}
        </div>
      )}
    </div>
  );
}

function InventoryTable({ preview }: { preview: WorkflowPreview }) {
  const currency = preview.bundle.shipment.currency || 'GBP';
  const movements = stockMovementRecords(preview.run);
  return (
    <div className="overflow-x-auto rounded-lg border border-neutral-800">
      <table className="min-w-full text-left text-sm">
        <thead className="bg-black/50 text-xs uppercase tracking-wide text-neutral-500">
          <tr>
            <th className="px-3 py-2">SKU</th>
            <th className="px-3 py-2">Qty Before</th>
            <th className="px-3 py-2">Qty Received</th>
            <th className="px-3 py-2">Qty After</th>
            <th className="px-3 py-2">Previous Cost</th>
            <th className="px-3 py-2">Landed Unit Cost</th>
            <th className="px-3 py-2">Status</th>
          </tr>
        </thead>
        <tbody>
          {preview.bundle.shipment.lines.map((line) => {
            const stock = preview.liveSage.stockItems.find(
              (item) => item.id === line.matchedSageStockItemId,
            );
            const allocation = preview.allocations.find((item) => item.sku === line.sku);
            const movement = movements.find((record) =>
              record.externalReference.endsWith(`:${line.matchedSageStockItemId ?? ''}`),
            );
            const before =
              stock && movement?.status === 'succeeded'
                ? Math.max(0, stock.quantityInStock - line.receivedQuantity)
                : (stock?.quantityInStock ?? 0);
            const after =
              stock && movement?.status === 'succeeded'
                ? stock.quantityInStock
                : before + line.receivedQuantity;
            return (
              <tr key={line.sku} className="border-t border-neutral-800">
                <td className="px-3 py-2 font-medium text-white">{line.sku}</td>
                <td className="px-3 py-2">{before}</td>
                <td className="px-3 py-2">{line.receivedQuantity}</td>
                <td className="px-3 py-2">{after}</td>
                <td className="px-3 py-2">{money(stock?.costPrice ?? 0, currency)}</td>
                <td className="px-3 py-2">
                  {money(allocation?.landedUnitCost ?? 0, currency)}
                </td>
                <td className="px-3 py-2">
                  {movement?.status === 'succeeded'
                    ? 'Verified'
                    : movement?.status === 'failed'
                      ? 'Needs Attention'
                      : 'Pending'}
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

export function CustomerInvoiceStage({
  preview,
  busy,
  loaded,
  onLoad,
  onContinue,
}: {
  preview: WorkflowPreview;
  busy: boolean;
  loaded: boolean;
  onLoad: () => void;
  onContinue: () => void;
}) {
  const invoice = preview.bundle.customerInvoice;
  const currency = invoice.currency || 'GBP';
  const availability = inventoryAvailability(preview);
  const docs = customerDocuments(preview);
  const totalQty = invoice.lines.reduce((sum, line) => sum + line.quantity, 0);

  if (!loaded) {
    return (
      <div className="space-y-4">
        <p className="text-sm text-neutral-400">
          The Customer Invoice is an existing source document. Synpath reads it and recreates the
          corresponding Sales Invoice in Sage.
        </p>
        <button type="button" disabled={busy} onClick={onLoad} className={PRIMARY}>
          {busy ? 'Loading…' : 'Load Customer Invoice from Gmail'}
        </button>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <p className="text-sm text-neutral-400">
        Customer invoice for PO#GHOACRUGOL051926, kept separate from purchase and shipment
        documents.
      </p>
      {docs[0] && (
        <p className="text-sm text-neutral-300">
          Document: <span className="text-white">{docs[0].fileName}</span>
        </p>
      )}
      <SummaryGrid
        items={[
          { label: 'Customer', value: invoice.customer },
          { label: 'Customer Invoice Reference', value: invoice.sourceInvoiceNumber },
          { label: 'Invoice Date', value: invoice.invoiceDate },
          { label: 'Due Date', value: invoice.dueDate },
          { label: 'Currency', value: currency },
          { label: 'SKU Count', value: String(invoice.lines.length) },
          { label: 'Total Quantity', value: String(totalQty) },
          { label: 'Invoice Total', value: money(invoice.total, currency) },
        ]}
      />
      <div
        className={`rounded-lg border px-3 py-2 text-sm ${
          availability === 'available'
            ? 'border-emerald-500/30 bg-emerald-500/10 text-emerald-200'
            : 'border-amber-500/30 bg-amber-500/10 text-amber-100'
        }`}
      >
        {availability === 'available' ? 'Inventory Available' : 'Inventory Review Required'}
      </div>
      <div className="overflow-x-auto rounded-lg border border-neutral-800">
        <table className="min-w-full text-left text-sm">
          <thead className="bg-black/50 text-xs uppercase tracking-wide text-neutral-500">
            <tr>
              <th className="px-3 py-2">SKU</th>
              <th className="px-3 py-2">Description</th>
              <th className="px-3 py-2">Qty</th>
              <th className="px-3 py-2">Sales Unit Price</th>
              <th className="px-3 py-2">Available Inventory</th>
              <th className="px-3 py-2">Line Total</th>
            </tr>
          </thead>
          <tbody>
            {invoice.lines.map((line) => {
              const stock = preview.liveSage.stockItems.find(
                (item) => item.id === line.matchedSageStockItemId,
              );
              return (
                <tr key={line.sku} className="border-t border-neutral-800">
                  <td className="px-3 py-2 font-medium text-white">{line.sku}</td>
                  <td className="px-3 py-2 text-neutral-300">{line.description}</td>
                  <td className="px-3 py-2">{line.quantity}</td>
                  <td className="px-3 py-2">{money(line.salesUnitPrice, currency)}</td>
                  <td className="px-3 py-2">{stock?.quantityInStock ?? '—'}</td>
                  <td className="px-3 py-2">{money(line.total, currency)}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
      <div className="flex flex-wrap gap-2">
        <button type="button" disabled={busy} onClick={onLoad} className={SECONDARY}>
          Reload Customer Invoice
        </button>
        <button
          type="button"
          disabled={busy || availability !== 'available'}
          onClick={onContinue}
          className={PRIMARY}
        >
          Review Sales Invoice
        </button>
      </div>
    </div>
  );
}

export function SalesInvoiceStage({
  preview,
  busy,
  processingStep,
  onApprove,
}: {
  preview: WorkflowPreview;
  busy: boolean;
  processingStep: number;
  onApprove: () => void;
}) {
  const invoice = preview.bundle.customerInvoice;
  const currency = invoice.currency || 'GBP';
  const record = salesInvoiceRecord(preview.run);
  const totalQty = invoice.lines.reduce((sum, line) => sum + line.quantity, 0);

  if (record?.status === 'succeeded' && record.readBackVerified) {
    return (
      <div className="space-y-3">
        <p className="text-base font-medium text-emerald-300">Sales Invoice Created in Sage</p>
        <SummaryGrid
          items={[
            { label: 'Sage Sales Invoice ID', value: record.sageTransactionId },
            { label: 'Customer', value: invoice.customer },
            { label: 'Customer Invoice Reference', value: invoice.sourceInvoiceNumber },
            { label: 'Invoice Total', value: money(invoice.total, currency) },
            { label: 'Verified in Sage', value: 'Yes' },
          ]}
        />
      </div>
    );
  }

  if (processingStep >= 0 && busy) {
    return (
      <ProcessingSteps
        steps={[
          'Creating Sales Invoice',
          'Sending to Sage',
          'Verifying invoice',
          'Verifying inventory',
        ]}
        activeIndex={processingStep}
      />
    );
  }

  return (
    <div className="space-y-4">
      <SummaryGrid
        items={[
          { label: 'Customer', value: invoice.customer },
          { label: 'Customer Invoice Reference', value: invoice.sourceInvoiceNumber },
          { label: 'Invoice Date', value: invoice.invoiceDate },
          { label: 'Due Date', value: invoice.dueDate },
          { label: 'SKU Count', value: String(invoice.lines.length) },
          { label: 'Total Quantity', value: String(totalQty) },
          { label: 'Invoice Total', value: money(invoice.total, currency) },
        ]}
      />
      <button type="button" disabled={busy} onClick={onApprove} className={PRIMARY}>
        Approve &amp; Create Sales Invoice in Sage
      </button>
    </div>
  );
}

export function CompletionBanner({ preview }: { preview: WorkflowPreview }) {
  const purchase = purchaseInvoiceRecord(preview.run);
  const movements = stockMovementRecords(preview.run).filter(
    (record) => record.status === 'succeeded',
  );
  const sales = salesInvoiceRecord(preview.run);
  return (
    <section className="mb-6 rounded-2xl border border-emerald-500/30 bg-emerald-500/10 p-5">
      <h2 className="font-display text-xl font-semibold text-emerald-100">
        PO#GHOACRUGOL051926 Completed
      </h2>
      <ul className="mt-4 space-y-2 text-sm text-emerald-100/90">
        <li>✓ Purchase and shipment documents read</li>
        <li>✓ Landed cost calculated by SKU</li>
        <li>✓ Human approval recorded</li>
        <li>✓ Purchase Invoice created in Sage</li>
        <li>✓ Inventory received at landed cost</li>
        <li>✓ Customer Invoice read and matched</li>
        <li>✓ Sales Invoice created in Sage</li>
      </ul>
      <div className="mt-4 grid gap-2 sm:grid-cols-3">
        <div className="rounded-lg border border-emerald-500/20 bg-black/20 px-3 py-2">
          <p className="text-[11px] uppercase text-emerald-200/70">Purchase Invoice ID</p>
          <p className="mt-1 text-sm text-white">{purchase?.sageTransactionId ?? '—'}</p>
        </div>
        <div className="rounded-lg border border-emerald-500/20 bg-black/20 px-3 py-2">
          <p className="text-[11px] uppercase text-emerald-200/70">Stock Movements</p>
          <p className="mt-1 text-sm text-white">
            {movements.length} verified
            {movements.length <= 3
              ? ` (${movements.map((record) => record.sageTransactionId).join(', ')})`
              : ''}
          </p>
        </div>
        <div className="rounded-lg border border-emerald-500/20 bg-black/20 px-3 py-2">
          <p className="text-[11px] uppercase text-emerald-200/70">Sales Invoice ID</p>
          <p className="mt-1 text-sm text-white">{sales?.sageTransactionId ?? '—'}</p>
        </div>
      </div>
    </section>
  );
}
