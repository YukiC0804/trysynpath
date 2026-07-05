import { ArrowRight } from 'lucide-react';
import { MetricCard } from './MetricCard';
import { StatusBadge } from './StatusBadge';

interface ScheduleJob {
  id: string;
  line: string;
  priority?: string;
  note?: string;
}

interface RescheduleTimelineProps {
  before: ScheduleJob[];
  after: ScheduleJob[];
  changes: string[];
  impact: {
    lateBefore: string;
    lateAfter: string;
    revenueProtected: string;
    capacityRecovered: string;
  };
}

export function RescheduleTimeline({ before, after, changes, impact }: RescheduleTimelineProps) {
  return (
    <div className="space-y-4">
      <div className="grid gap-4 lg:grid-cols-2">
        <ScheduleColumn title="Before" jobs={before} variant="before" />
        <div className="hidden items-center justify-center lg:flex">
          <ArrowRight className="h-6 w-6 text-neutral-600" />
        </div>
        <ScheduleColumn title="After" jobs={after} variant="after" />
      </div>

      <div className="rounded-xl border border-neutral-800 bg-neutral-900/50 p-4">
        <p className="mb-3 text-[10px] font-semibold uppercase tracking-wider text-neutral-500">Reschedule decisions</p>
        <ul className="space-y-2">
          {changes.map((change) => (
            <li key={change} className="flex items-start gap-2 text-sm text-neutral-300">
              <ArrowRight className="mt-0.5 h-4 w-4 shrink-0 text-violet-400" />
              {change}
            </li>
          ))}
        </ul>
      </div>

      <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
        <MetricCard label="Late orders before" value={impact.lateBefore} valueClassName="text-red-400" />
        <MetricCard label="Late orders after" value={impact.lateAfter} valueClassName="text-emerald-400" />
        <MetricCard label="Revenue protected" value={impact.revenueProtected} valueClassName="text-emerald-400" />
        <MetricCard label="Capacity recovered" value={impact.capacityRecovered} />
      </div>
    </div>
  );
}

function ScheduleColumn({
  title,
  jobs,
  variant,
}: {
  title: string;
  jobs: ScheduleJob[];
  variant: 'before' | 'after';
}) {
  return (
    <div className="rounded-xl border border-neutral-800 bg-[#0a0a0a] p-4">
      <div className="mb-3 flex items-center gap-2">
        <p className="text-[10px] font-semibold uppercase tracking-wider text-neutral-500">{title}</p>
        {variant === 'before' ? (
          <StatusBadge variant="warning">Disrupted</StatusBadge>
        ) : (
          <StatusBadge variant="healthy">Optimised</StatusBadge>
        )}
      </div>
      <div className="space-y-2">
        {jobs.map((job) => (
          <div
            key={`${title}-${job.id}`}
            className={`flex items-center justify-between rounded-lg border px-3 py-2.5 ${
              variant === 'after' && job.note
                ? 'border-violet-500/25 bg-violet-500/5'
                : 'border-neutral-800 bg-neutral-900/50'
            }`}
          >
            <div>
              <p className="text-sm font-medium text-white">{job.id}</p>
              <p className="text-xs text-neutral-500">{job.line}</p>
              {job.note && <p className="mt-0.5 text-[10px] text-violet-400">{job.note}</p>}
            </div>
            {job.priority && <StatusBadge variant={job.priority === 'High' ? 'danger' : 'neutral'}>{job.priority}</StatusBadge>}
          </div>
        ))}
      </div>
    </div>
  );
}

export function EstimatingCalculator() {
  const lines = [
    { line: 'Material (BOM)', basis: 'Aluminium housing + PCB', amount: '£4,250' },
    { line: 'Labour', basis: 'Assembly + test', amount: '£1,875' },
    { line: 'Machine', basis: 'CNC + QA routing', amount: '£2,100' },
    { line: 'Setup', basis: 'Tooling + calibration', amount: '£650' },
    { line: 'Quality inspection', basis: 'IPC-A-610 sampling', amount: '£425' },
  ];

  return (
    <div className="space-y-4">
      <div className="rounded-xl border border-violet-500/20 bg-violet-500/5 p-4">
        <p className="mb-1 text-[10px] font-semibold uppercase tracking-wider text-violet-400">
          AI-generated estimating calculator
        </p>
        <h4 className="text-lg font-semibold text-white">Sensor Module X · 500 units</h4>
      </div>

      <div className="overflow-x-auto rounded-lg border border-neutral-800">
        <table className="w-full text-left text-xs min-w-[480px]">
          <thead>
            <tr className="border-b border-neutral-800 bg-neutral-900 text-neutral-500">
              <th className="px-3 py-2 font-medium">Cost line</th>
              <th className="px-3 py-2 font-medium">Basis</th>
              <th className="px-3 py-2 font-medium text-right">Amount</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-neutral-800 text-neutral-300">
            {lines.map((row) => (
              <tr key={row.line}>
                <td className="px-3 py-2 text-white">{row.line}</td>
                <td className="px-3 py-2 text-neutral-400">{row.basis}</td>
                <td className="px-3 py-2 text-right font-medium text-white">{row.amount}</td>
              </tr>
            ))}
            <tr className="bg-neutral-900/50">
              <td className="px-3 py-2 font-semibold text-white" colSpan={2}>
                Total unit cost
              </td>
              <td className="px-3 py-2 text-right text-lg font-semibold text-white">£18.60</td>
            </tr>
          </tbody>
        </table>
      </div>

      <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
        <MetricCard label="Recommended quote" value="£28.50" valueClassName="text-emerald-400" />
        <MetricCard label="Gross margin" value="34.7%" valueClassName="text-emerald-400" />
        <MetricCard label="Lead time" value="18 working days" />
        <MetricCard label="Capacity fit" value="Line 2 available" valueClassName="text-emerald-400" />
      </div>
    </div>
  );
}
