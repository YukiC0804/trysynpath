import type { AlertSeverity } from '../../../data/demoAlerts';

const severityStyles: Record<AlertSeverity, string> = {
  high: 'bg-red-500/15 text-red-400 border-red-500/25',
  medium: 'bg-amber-500/15 text-amber-400 border-amber-500/25',
  low: 'bg-sky-500/15 text-sky-400 border-sky-500/25',
};

const severityLabels: Record<AlertSeverity, string> = {
  high: 'High',
  medium: 'Medium',
  low: 'Low',
};

interface AlertSeverityBadgeProps {
  severity: AlertSeverity;
}

export function AlertSeverityBadge({ severity }: AlertSeverityBadgeProps) {
  return (
    <span
      className={`inline-flex items-center rounded border px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wider ${severityStyles[severity]}`}
    >
      {severityLabels[severity]}
    </span>
  );
}
