import { StatusBadge } from './StatusBadge';

interface RiskCardProps {
  customer: string;
  order: string;
  dueDate: string;
  risk: 'High' | 'Medium' | 'Low';
  impact: string;
  erpStatus: string;
  rootCauses: string[];
  signals: { label: string; detail: string }[];
}

const riskVariant = {
  High: 'danger' as const,
  Medium: 'warning' as const,
  Low: 'healthy' as const,
};

export function RiskCard({
  customer,
  order,
  dueDate,
  risk,
  impact,
  erpStatus,
  rootCauses,
  signals,
}: RiskCardProps) {
  return (
    <div className="rounded-xl border border-red-500/20 bg-red-500/5 p-4 sm:p-5">
      <div className="mb-4 flex flex-wrap items-start justify-between gap-3">
        <div>
          <div className="mb-1 flex flex-wrap items-center gap-2">
            <h4 className="text-lg font-semibold text-white">{customer}</h4>
            <StatusBadge variant={riskVariant[risk]}>{risk} risk</StatusBadge>
          </div>
          <p className="text-sm text-neutral-400">
            Order <span className="text-white font-medium">{order}</span> · Due {dueDate}
          </p>
        </div>
        <div className="text-right">
          <p className="text-[10px] uppercase tracking-wider text-neutral-500">Revenue at risk</p>
          <p className="text-xl font-semibold text-red-400">{impact}</p>
        </div>
      </div>

      <div className="mb-4 rounded-lg border border-neutral-800 bg-black/30 px-3 py-2">
        <p className="text-[10px] uppercase tracking-wider text-neutral-500">ERP status</p>
        <p className="text-sm text-neutral-300">{erpStatus}</p>
      </div>

      <div className="mb-4">
        <p className="mb-2 text-[10px] font-semibold uppercase tracking-wider text-neutral-500">
          Connected data signals
        </p>
        <ul className="space-y-2">
          {signals.map((signal) => (
            <li
              key={signal.label}
              className="flex items-start gap-2 rounded-lg border border-neutral-800 bg-neutral-900/50 px-3 py-2 text-xs"
            >
              <span className="mt-1 h-1.5 w-1.5 shrink-0 rounded-full bg-amber-400" />
              <span>
                <span className="font-medium text-white">{signal.label}</span>
                <span className="text-neutral-400"> — {signal.detail}</span>
              </span>
            </li>
          ))}
        </ul>
      </div>

      <div>
        <p className="mb-2 text-[10px] font-semibold uppercase tracking-wider text-neutral-500">Root causes</p>
        <div className="flex flex-wrap gap-2">
          {rootCauses.map((cause) => (
            <span key={cause}>
              <StatusBadge variant="warning">{cause}</StatusBadge>
            </span>
          ))}
        </div>
      </div>
    </div>
  );
}
