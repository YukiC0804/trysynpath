import { MetricCard } from './MetricCard';
import { StatusBadge } from './StatusBadge';
import { DataTable } from './DataTable';

interface QuoteBreakdownProps {
  customer: string;
  product: string;
  quantity: number;
  delivery: string;
  specs: { label: string; value: string }[];
  costs: {
    material: string;
    machine: string;
    labour: string;
    overhead: string;
    unitCost: string;
    price: string;
    margin: string;
    leadTime: string;
    confidence: string;
  };
}

export function QuoteBreakdown({ customer, product, quantity, delivery, specs, costs }: QuoteBreakdownProps) {
  const specRows = specs.map((s) => ({ label: s.label, value: s.value }));

  return (
    <div className="space-y-4">
      <div className="rounded-xl border border-neutral-800 bg-neutral-900/50 p-4">
        <div className="mb-3 flex flex-wrap items-start justify-between gap-3">
          <div>
            <p className="text-[10px] uppercase tracking-wider text-neutral-500">Inbound RFQ</p>
            <h4 className="text-lg font-semibold text-white">{customer}</h4>
            <p className="text-sm text-neutral-400">
              {product} · {quantity.toLocaleString()} units · {delivery}
            </p>
          </div>
          <StatusBadge variant="ai">AI analysed</StatusBadge>
        </div>
        <DataTable
          columns={[
            { key: 'label', header: 'Specification' },
            { key: 'value', header: 'Value', className: 'text-white font-medium' },
          ]}
          rows={specRows}
          minWidth="400px"
        />
      </div>

      <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
        <MetricCard label="Material cost" value={costs.material} />
        <MetricCard label="Machine cost" value={costs.machine} />
        <MetricCard label="Labour cost" value={costs.labour} />
        <MetricCard label="Overhead" value={costs.overhead} />
      </div>

      <div className="grid grid-cols-2 gap-2 sm:grid-cols-5">
        <MetricCard label="Unit cost" value={costs.unitCost} />
        <MetricCard label="Recommended price" value={costs.price} valueClassName="text-emerald-400" />
        <MetricCard label="Gross margin" value={costs.margin} valueClassName="text-emerald-400" />
        <MetricCard label="Lead time" value={costs.leadTime} />
        <MetricCard label="Confidence" value={costs.confidence} valueClassName="text-violet-400" />
      </div>
    </div>
  );
}
