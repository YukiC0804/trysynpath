import { MetricCard } from '../MetricCard';
import { ALERT_SUMMARY } from '../../../data/demoAlerts';

export function AlertsSummaryCards() {
  return (
    <div className="mb-6 grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-5">
      <MetricCard label="Active alerts" value={String(ALERT_SUMMARY.activeAlerts)} />
      <MetricCard
        label="High priority"
        value={String(ALERT_SUMMARY.highPriority)}
        valueClassName="text-red-400"
      />
      <MetricCard
        label="Revenue at risk"
        value={ALERT_SUMMARY.revenueAtRisk}
        valueClassName="text-amber-400"
      />
      <MetricCard label="New RFQs" value={String(ALERT_SUMMARY.newRfqs)} valueClassName="text-violet-400" />
      <MetricCard
        label="Machine events"
        value={String(ALERT_SUMMARY.machineEvents)}
        valueClassName="text-amber-400"
      />
    </div>
  );
}
