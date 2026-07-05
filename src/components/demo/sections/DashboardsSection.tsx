import { useState } from 'react';
import { SectionHeader } from '../workspace/SectionHeader';
import { WorkspaceSectionScroll } from '../workspace/WorkspaceSectionScroll';
import { EntityCard, CardButton } from '../workspace/EntityCard';
import { MetricCard } from '../MetricCard';
import { DataTable } from '../DataTable';
import { StatusBadge } from '../StatusBadge';
import {
  ModalButton,
  ModalField,
  ModalSection,
  WorkspaceModal,
  modalInputClassName,
  modalSelectClassName,
} from '../interactive/WorkspaceModal';
import {
  DASHBOARD_DEFINITIONS,
  DASHBOARD_METRIC_OPTIONS,
  MACHINE_UTIL_ROWS,
  ORDERS_AT_RISK_ROWS,
  type DashboardId,
} from '../../../data/demoInteractiveData';
import type { WorkspaceCreatedState } from '../../../types/workspace';

interface DashboardsSectionProps {
  createdState: WorkspaceCreatedState;
  onRunPrompt?: (prompt: string) => void;
  showToast?: (message: string) => void;
}

type DashboardModal = 'view' | 'edit' | 'schedule' | null;

const toneClass = (tone?: 'danger' | 'warning') =>
  tone === 'danger' ? 'text-red-400' : tone === 'warning' ? 'text-amber-400' : 'text-white';

export function DashboardsSection({ createdState, onRunPrompt, showToast }: DashboardsSectionProps) {
  const [modal, setModal] = useState<DashboardModal>(null);
  const [selected, setSelected] = useState<DashboardId | null>(null);
  const [dashboardName, setDashboardName] = useState('');
  const [metrics, setMetrics] = useState<string[]>(DASHBOARD_METRIC_OPTIONS);
  const [refreshFrequency, setRefreshFrequency] = useState('Every 15 minutes');
  const [customerFilter, setCustomerFilter] = useState('All customers');
  const [scheduleFrequency, setScheduleFrequency] = useState('Weekdays');
  const [scheduleTime, setScheduleTime] = useState('08:00');
  const [scheduleRecipients, setScheduleRecipients] = useState(['COO', 'Operations Director']);
  const [scheduleDelivery, setScheduleDelivery] = useState(['Command Centre', 'Email']);

  const open = (id: DashboardId, type: DashboardModal) => {
    setSelected(id);
    setModal(type);
    setDashboardName(DASHBOARD_DEFINITIONS[id].title);
  };

  const closeModal = () => {
    setModal(null);
    setSelected(null);
  };

  const dashboard = selected ? DASHBOARD_DEFINITIONS[selected] : null;

  const toggle = (list: string[], item: string) =>
    list.includes(item) ? list.filter((x) => x !== item) : [...list, item];

  const dashboardActions = (id: DashboardId) => (
    <>
      <CardButton variant="primary" onClick={() => open(id, 'view')}>
        View
      </CardButton>
      <CardButton onClick={() => open(id, 'edit')}>Edit</CardButton>
      <CardButton onClick={() => open(id, 'schedule')}>Schedule</CardButton>
    </>
  );

  return (
    <WorkspaceSectionScroll>
      <div className="mx-auto max-w-6xl px-4 py-6 sm:px-6">
        <SectionHeader
          title="Dashboards"
          subtitle="Generated operational dashboards built from connected manufacturing data."
        />

        <div className="mb-8 grid gap-4 sm:grid-cols-2">
          <EntityCard
            title="COO Operations Dashboard"
            status={{ label: 'AI', variant: 'ai' }}
            meta={[
              { label: 'Created by', value: 'AI' },
              { label: 'Last updated', value: 'Today 08:05' },
            ]}
            metrics={DASHBOARD_DEFINITIONS['coo-briefing'].metrics.map((m) => ({
              label: m.label,
              value: m.value,
              valueClassName: toneClass(m.tone),
            }))}
            actions={dashboardActions('coo-briefing')}
          />

          <EntityCard
            title="Machine Utilisation Dashboard"
            meta={[
              { label: 'Created by', value: 'Production Manager' },
              { label: 'Last updated', value: '12 minutes ago' },
            ]}
            metrics={DASHBOARD_DEFINITIONS['production-bottlenecks'].metrics.map((m) => ({
              label: m.label,
              value: m.value,
              valueClassName: toneClass(m.tone),
            }))}
            actions={dashboardActions('production-bottlenecks')}
          />

          <EntityCard
            title="Supplier Risk Dashboard"
            meta={[
              { label: 'Created by', value: 'Supply Chain Manager' },
              { label: 'Last updated', value: 'Today 07:45' },
            ]}
            metrics={DASHBOARD_DEFINITIONS['inventory-risk'].metrics.map((m) => ({
              label: m.label,
              value: m.value,
              valueClassName: toneClass(m.tone),
            }))}
            actions={dashboardActions('inventory-risk')}
          />

          <EntityCard
            title="Customer Impact Dashboard"
            meta={[
              { label: 'Created by', value: 'COO' },
              { label: 'Last updated', value: 'Today 08:00' },
            ]}
            metrics={DASHBOARD_DEFINITIONS['customer-delivery'].metrics.map((m) => ({
              label: m.label,
              value: m.value,
              valueClassName: toneClass(m.tone),
            }))}
            actions={dashboardActions('customer-delivery')}
          />

          {createdState.operationsDashboardSaved && (
            <EntityCard
              title="Operations Risk Dashboard"
              highlight
              status={{ label: 'New', variant: 'ai' }}
              meta={[
                { label: 'Created by', value: 'AI · Command Centre' },
                { label: 'Last updated', value: 'Just now' },
              ]}
              metrics={DASHBOARD_DEFINITIONS['operations-risk'].metrics.map((m) => ({
                label: m.label,
                value: m.value,
                valueClassName: toneClass(m.tone),
              }))}
              actions={dashboardActions('operations-risk')}
            />
          )}
        </div>
      </div>

      <WorkspaceModal
        open={modal === 'view' && !!dashboard}
        onClose={closeModal}
        title={dashboard?.title ?? ''}
        subtitle="Live operational dashboard preview"
        size="lg"
        footer={
          <>
            <ModalButton
              variant="primary"
              onClick={() => {
                onRunPrompt?.('Show me orders at risk and revenue impact this week');
                closeModal();
              }}
            >
              Open in Command Centre
            </ModalButton>
            <ModalButton onClick={() => selected && open(selected, 'edit')}>Edit dashboard</ModalButton>
            <ModalButton onClick={closeModal}>Close</ModalButton>
          </>
        }
      >
        {dashboard && (
          <>
            <div className="mb-4 grid grid-cols-2 gap-2 sm:grid-cols-3">
              {dashboard.metrics.map((m) => (
                <div key={m.label}>
                  <MetricCard
                    label={m.label}
                    value={m.value}
                    valueClassName={toneClass(m.tone)}
                  />
                </div>
              ))}
            </div>
            <div className="grid gap-4 lg:grid-cols-2">
              <ModalSection title="Orders at risk">
                <DataTable
                  columns={[
                    { key: 'customer', header: 'Customer' },
                    { key: 'order', header: 'Order', className: 'text-white' },
                    { key: 'risk', header: 'Risk' },
                    { key: 'value', header: 'Value' },
                    { key: 'cause', header: 'Cause' },
                  ]}
                  rows={ORDERS_AT_RISK_ROWS.map((row) => ({
                    ...row,
                    risk: (
                      <StatusBadge variant={row.risk === 'High' ? 'danger' : 'warning'}>
                        {row.risk}
                      </StatusBadge>
                    ),
                  }))}
                  minWidth="520px"
                />
              </ModalSection>
              <ModalSection title="Machine utilisation">
                <DataTable
                  columns={[
                    { key: 'machine', header: 'Machine', className: 'text-white' },
                    { key: 'util', header: 'Utilisation' },
                    { key: 'status', header: 'Status' },
                  ]}
                  rows={MACHINE_UTIL_ROWS.map((row) => ({
                    ...row,
                    status: (
                      <StatusBadge
                        variant={
                          row.status === 'Bottleneck'
                            ? 'danger'
                            : row.status === 'Watch'
                              ? 'warning'
                              : 'healthy'
                        }
                      >
                        {row.status}
                      </StatusBadge>
                    ),
                  }))}
                  minWidth="360px"
                />
              </ModalSection>
            </div>
          </>
        )}
      </WorkspaceModal>

      <WorkspaceModal
        open={modal === 'edit' && !!dashboard}
        onClose={closeModal}
        title="Edit Dashboard"
        subtitle="Configure metrics, refresh frequency, and customer filters."
        footer={
          <>
            <ModalButton onClick={closeModal}>Cancel</ModalButton>
            <ModalButton
              variant="primary"
              onClick={() => {
                showToast?.('Dashboard updated.');
                closeModal();
              }}
            >
              Save Dashboard
            </ModalButton>
          </>
        }
      >
        <ModalField label="Dashboard name">
          <input
            className={modalInputClassName()}
            value={dashboardName}
            onChange={(e) => setDashboardName(e.target.value)}
          />
        </ModalField>

        <ModalField label="Included metrics">
          <div className="flex flex-wrap gap-2">
            {DASHBOARD_METRIC_OPTIONS.map((metric) => (
              <button
                key={metric}
                type="button"
                onClick={() => setMetrics((prev) => toggle(prev, metric))}
                className={`rounded-full border px-3 py-1.5 text-xs ${
                  metrics.includes(metric)
                    ? 'border-violet-500/40 bg-violet-500/15 text-violet-200'
                    : 'border-neutral-700 text-neutral-400'
                }`}
              >
                {metric}
              </button>
            ))}
          </div>
        </ModalField>

        <ModalField label="Refresh frequency">
          <select
            className={modalSelectClassName()}
            value={refreshFrequency}
            onChange={(e) => setRefreshFrequency(e.target.value)}
          >
            <option>Real-time</option>
            <option>Every 15 minutes</option>
            <option>Hourly</option>
            <option>Daily at 08:00</option>
          </select>
        </ModalField>

        <ModalField label="Filter">
          <select
            className={modalSelectClassName()}
            value={customerFilter}
            onChange={(e) => setCustomerFilter(e.target.value)}
          >
            <option>All customers</option>
            <option>High-priority customers only</option>
            <option>Bosch only</option>
            <option>Siemens only</option>
            <option>ABB only</option>
          </select>
        </ModalField>
      </WorkspaceModal>

      <WorkspaceModal
        open={modal === 'schedule' && !!dashboard}
        onClose={closeModal}
        title="Schedule Daily COO Briefing"
        subtitle="Send this dashboard automatically to operations leaders."
        footer={
          <>
            <ModalButton onClick={closeModal}>Cancel</ModalButton>
            <ModalButton
              variant="primary"
              onClick={() => {
                showToast?.(`Daily briefing scheduled for ${scheduleFrequency.toLowerCase()} at ${scheduleTime}.`);
                closeModal();
              }}
            >
              Schedule Briefing
            </ModalButton>
          </>
        }
      >
        <ModalField label="Frequency">
          <select
            className={modalSelectClassName()}
            value={scheduleFrequency}
            onChange={(e) => setScheduleFrequency(e.target.value)}
          >
            <option>Daily</option>
            <option>Weekdays</option>
            <option>Weekly</option>
          </select>
        </ModalField>

        <ModalField label="Time">
          <input
            type="time"
            className={modalInputClassName()}
            value={scheduleTime}
            onChange={(e) => setScheduleTime(e.target.value)}
          />
        </ModalField>

        <ModalField label="Recipients">
          <div className="flex flex-wrap gap-2">
            {['COO', 'Operations Director', 'Production Planner'].map((r) => (
              <button
                key={r}
                type="button"
                onClick={() => setScheduleRecipients((prev) => toggle(prev, r))}
                className={`rounded-full border px-3 py-1.5 text-xs ${
                  scheduleRecipients.includes(r)
                    ? 'border-violet-500/40 bg-violet-500/15 text-violet-200'
                    : 'border-neutral-700 text-neutral-400'
                }`}
              >
                {r}
              </button>
            ))}
          </div>
        </ModalField>

        <ModalField label="Delivery">
          <div className="flex flex-wrap gap-2">
            {['Command Centre', 'Email', 'Messenger'].map((d) => (
              <button
                key={d}
                type="button"
                onClick={() => setScheduleDelivery((prev) => toggle(prev, d))}
                className={`rounded-full border px-3 py-1.5 text-xs ${
                  scheduleDelivery.includes(d)
                    ? 'border-violet-500/40 bg-violet-500/15 text-violet-200'
                    : 'border-neutral-700 text-neutral-400'
                }`}
              >
                {d}
              </button>
            ))}
          </div>
        </ModalField>
      </WorkspaceModal>
    </WorkspaceSectionScroll>
  );
}
