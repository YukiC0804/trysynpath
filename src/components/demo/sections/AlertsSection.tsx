import { useState } from 'react';
import { SectionHeader } from '../workspace/SectionHeader';
import { WorkspaceSectionScroll } from '../workspace/WorkspaceSectionScroll';
import { AlertsSummaryCards } from '../alerts/AlertsSummaryCards';
import { MonitoringSourcesPanel } from '../alerts/MonitoringSourcesPanel';
import { AlertCard } from '../alerts/AlertCard';
import { AlertPreviewPanel } from '../alerts/AlertPreviewPanel';
import { MONITORING_SOURCES, OPERATIONAL_ALERTS } from '../../../data/demoAlerts';

interface AlertsSectionProps {
  onRunPromptFromAlert: (prompt: string) => void;
}

export function AlertsSection({ onRunPromptFromAlert }: AlertsSectionProps) {
  const [selectedId, setSelectedId] = useState<string>(OPERATIONAL_ALERTS[0].id);
  const selectedAlert = OPERATIONAL_ALERTS.find((a) => a.id === selectedId) ?? null;

  return (
    <WorkspaceSectionScroll>
      <div className="mx-auto max-w-6xl px-4 py-6 sm:px-6">
        <SectionHeader
          title="Operations Alerts"
          subtitle="AI-monitored signals from mailbox, shop floor, machine logs, messenger, ERP, supplier updates, and production schedules."
        />

        <AlertsSummaryCards />
        <MonitoringSourcesPanel sources={MONITORING_SOURCES} />

        <div className="grid gap-4 lg:grid-cols-[1fr_20rem] xl:grid-cols-[1fr_22rem]">
          <div className="space-y-3">
            {OPERATIONAL_ALERTS.map((alert) => (
              <div key={alert.id}>
                <AlertCard
                  alert={alert}
                  selected={selectedId === alert.id}
                  onSelect={() => setSelectedId(alert.id)}
                  onRunWorkflow={() => onRunPromptFromAlert(alert.suggestedPrompt)}
                />
              </div>
            ))}
          </div>

          <div className="hidden lg:block">
            <div className="sticky top-0">
              <AlertPreviewPanel alert={selectedAlert} onRunWorkflow={onRunPromptFromAlert} />
            </div>
          </div>
        </div>
      </div>
    </WorkspaceSectionScroll>
  );
}
