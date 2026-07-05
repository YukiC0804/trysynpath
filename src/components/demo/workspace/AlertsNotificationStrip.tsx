import { Bell } from 'lucide-react';
import { ALERT_SUMMARY } from '../../../data/demoAlerts';

interface AlertsNotificationStripProps {
  onViewAlerts: () => void;
  compact?: boolean;
}

export function AlertsNotificationStrip({ onViewAlerts, compact = false }: AlertsNotificationStripProps) {
  if (compact) {
    return (
      <button
        type="button"
        onClick={onViewAlerts}
        className="group flex max-w-sm items-center gap-2.5 rounded-xl border border-violet-500/15 bg-violet-500/[0.04] px-3 py-2 text-left transition-colors hover:border-violet-500/30 hover:bg-violet-500/[0.07]"
      >
        <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-lg border border-violet-500/20 bg-violet-500/10">
          <Bell className="h-3.5 w-3.5 text-violet-400" />
        </div>
        <div className="min-w-0 flex-1">
          <p className="text-xs font-medium text-white">
            {ALERT_SUMMARY.activeAlerts} operational alerts detected
          </p>
          <p className="truncate text-[11px] text-neutral-500">
            Orders at risk, bottlenecks, shortages, and delayed jobs
          </p>
        </div>
        <span className="shrink-0 text-[11px] font-medium text-violet-300 group-hover:text-violet-200">
          View alerts
        </span>
      </button>
    );
  }

  return (
    <div className="mb-6 flex flex-col gap-3 rounded-xl border border-violet-500/20 bg-violet-500/5 px-4 py-3 sm:flex-row sm:items-center sm:justify-between">
      <div className="flex items-start gap-3">
        <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg border border-violet-500/30 bg-violet-500/10">
          <Bell className="h-4 w-4 text-violet-400" />
        </div>
        <div>
          <p className="text-sm font-medium text-white">
            {ALERT_SUMMARY.activeAlerts} operational alerts detected
          </p>
          <p className="text-xs text-neutral-400">
            Orders at risk, bottlenecks, shortages, and delayed jobs
          </p>
        </div>
      </div>
      <button
        type="button"
        onClick={onViewAlerts}
        className="shrink-0 rounded-lg border border-violet-500/30 bg-violet-500/10 px-3 py-1.5 text-xs font-medium text-violet-300 transition-colors hover:bg-violet-500/20 hover:text-white"
      >
        View alerts
      </button>
    </div>
  );
}
