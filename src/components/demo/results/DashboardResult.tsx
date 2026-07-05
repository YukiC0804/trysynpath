import type { ReactNode } from 'react';
import { Sparkles } from 'lucide-react';
import { MetricCard } from '../MetricCard';
import { StatusBadge } from '../StatusBadge';
import { DataTable } from '../DataTable';
import { RecommendedActions } from '../RecommendedActions';
import { ActionButton, ActionButtonGroup } from '../workspace/ActionButton';
import { DataSourceBadges } from '../workspace/DataSourceBadges';
import { DATA_SOURCES_BY_RESULT } from '../../../data/demoWorkspace';

interface DashboardResultProps {
  prompt: string;
  completedActions: Set<string>;
  onAction: (id: string) => void;
}

export function DashboardResult({ prompt, completedActions, onAction }: DashboardResultProps) {
  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div>
          <h3 className="text-lg font-semibold text-white">COO Operations Dashboard</h3>
          <p className="mt-1 max-w-2xl text-xs text-neutral-500">
            Northbridge Components Ltd · {prompt}
          </p>
        </div>
        <span className="inline-flex items-center gap-1.5 rounded-full border border-violet-500/25 bg-violet-500/10 px-3 py-1 text-xs text-violet-300">
          <Sparkles className="h-3 w-3" />
          Generated from prompt
        </span>
      </div>

      <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-6">
        <MetricCard label="Orders at risk" value="3" valueClassName="text-red-400" />
        <MetricCard label="Revenue at risk" value="£221k" valueClassName="text-red-400" />
        <MetricCard label="Delayed jobs" value="4" valueClassName="text-amber-400" />
        <MetricCard label="Avg machine utilisation" value="80%" />
        <MetricCard label="Material shortages" value="3" valueClassName="text-amber-400" />
        <MetricCard label="Supplier delays" value="2" valueClassName="text-amber-400" />
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <Panel title="Orders at risk">
          <DataTable
            columns={[
              { key: 'order', header: 'Order', className: 'text-white font-medium' },
              { key: 'risk', header: 'Risk' },
              { key: 'value', header: 'Value', align: 'right' },
              { key: 'due', header: 'Due', align: 'right' },
            ]}
            rows={[
              {
                order: 'Bosch SO-1048',
                risk: <StatusBadge variant="danger">High</StatusBadge>,
                value: '£84,000',
                due: '12 Jul',
              },
              {
                order: 'Siemens SO-1051',
                risk: <StatusBadge variant="warning">Medium</StatusBadge>,
                value: '£72,000',
                due: '15 Jul',
              },
              {
                order: 'ABB SO-1055',
                risk: <StatusBadge variant="warning">Medium</StatusBadge>,
                value: '£65,000',
                due: '17 Jul',
              },
            ]}
            minWidth="360px"
          />
        </Panel>

        <Panel title="Machine utilisation · bottlenecks">
          <div className="space-y-2">
            {[
              { machine: 'CNC-04', line: 'Line 3', util: 96, status: 'danger' as const, note: 'Bottleneck' },
              { machine: 'CNC-02', line: 'Line 2', util: 62, status: 'healthy' as const, note: 'Available' },
              { machine: 'ASM-01', line: 'Line 1', util: 78, status: 'warning' as const, note: 'Healthy' },
              { machine: 'QA-03', line: 'Quality', util: 85, status: 'warning' as const, note: 'Healthy' },
            ].map((m) => (
              <div key={m.machine} className="rounded-lg border border-neutral-800 bg-neutral-900/50 px-3 py-2">
                <div className="mb-1 flex justify-between text-xs">
                  <span className="font-medium text-white">
                    {m.machine} · {m.line}
                  </span>
                  <span className="flex items-center gap-2">
                    <span
                      className={
                        m.status === 'danger'
                          ? 'text-red-400'
                          : m.status === 'warning'
                            ? 'text-amber-400'
                            : 'text-emerald-400'
                      }
                    >
                      {m.util}%
                    </span>
                    <StatusBadge variant={m.status === 'danger' ? 'danger' : m.status === 'warning' ? 'warning' : 'healthy'}>
                      {m.note}
                    </StatusBadge>
                  </span>
                </div>
                <div className="h-1.5 overflow-hidden rounded-full bg-neutral-800">
                  <div
                    className={`h-full rounded-full ${
                      m.status === 'danger' ? 'bg-red-500' : m.status === 'warning' ? 'bg-amber-500' : 'bg-emerald-500'
                    }`}
                    style={{ width: `${m.util}%` }}
                  />
                </div>
              </div>
            ))}
          </div>
        </Panel>

        <Panel title="Material shortages">
          <DataTable
            columns={[
              { key: 'material', header: 'Material', className: 'text-white' },
              { key: 'shortage', header: 'Shortage', align: 'right', className: 'text-amber-400' },
              { key: 'po', header: 'Supplier PO' },
            ]}
            rows={[
              { material: 'Aluminium Casing Blank', shortage: '280 units', po: 'PO-7782 · delayed' },
              { material: 'PCB Board A', shortage: '40 units', po: 'PO confirmed' },
              { material: 'Steel Bracket', shortage: '200 units', po: 'Supplier at risk' },
            ]}
            minWidth="320px"
          />
        </Panel>

        <Panel title="Delayed jobs">
          <DataTable
            columns={[
              { key: 'job', header: 'Job', className: 'text-white font-medium' },
              { key: 'order', header: 'Order' },
              { key: 'status', header: 'Status' },
            ]}
            rows={[
              {
                job: 'J-883',
                order: 'Bosch SO-1048',
                status: <StatusBadge variant="danger">Delayed</StatusBadge>,
              },
              {
                job: 'J-894',
                order: 'Siemens SO-1051',
                status: <StatusBadge variant="warning">At risk</StatusBadge>,
              },
              {
                job: 'J-901',
                order: 'ABB SO-1055',
                status: <StatusBadge variant="neutral">In progress</StatusBadge>,
              },
            ]}
            minWidth="320px"
          />
        </Panel>
      </div>

      <RecommendedActions
        title="Recommended actions"
        actions={[
          'Expedite PO-7782 from MetalWorks Ltd',
          'Move Job J-901 from Line 3 to Line 2',
          'Review CNC-04 downtime and maintenance schedule',
          'Reconfirm Siemens SO-1051 delivery promise',
        ]}
      />

      <DataSourceBadges sources={DATA_SOURCES_BY_RESULT.dashboard} />

      <ActionButtonGroup>
        <ActionButton
          id="save-dashboard"
          label="Save COO Dashboard"
          variant="primary"
          completed={completedActions.has('save-dashboard')}
          successMessage="COO dashboard saved to your command centre."
          onClick={onAction}
        />
        <ActionButton
          id="daily-briefing"
          label="Schedule Daily COO Briefing"
          completed={completedActions.has('daily-briefing')}
          onClick={onAction}
        />
        <ActionButton
          id="alert-agent"
          label="Create Alert Agent"
          completed={completedActions.has('alert-agent')}
          onClick={onAction}
        />
      </ActionButtonGroup>
    </div>
  );
}

function Panel({ title, children }: { title: string; children: ReactNode }) {
  return (
    <div className="rounded-xl border border-neutral-800 bg-[#0a0a0a] p-4">
      <p className="mb-3 text-[10px] font-semibold uppercase tracking-wider text-neutral-500">{title}</p>
      {children}
    </div>
  );
}
