import { Bell } from 'lucide-react';
import { ALERT_SUMMARY } from '../../../data/demoAlerts';

interface AlertsNotificationStripProps {
  onViewAlerts: () => void;
}

export function AlertsNotificationStrip({ onViewAlerts }: AlertsNotificationStripProps) {
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
            AI is monitoring mailbox, shop floor, machine logs, messenger, ERP, and supplier updates.
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
