import { useEffect, useRef, useState } from 'react';
import type { ReactNode } from 'react';
import { SectionHeader } from '../workspace/SectionHeader';
import { WorkspaceSectionScroll } from '../workspace/WorkspaceSectionScroll';
import { EntityCard, CardButton } from '../workspace/EntityCard';
import { MetricCard } from '../MetricCard';
import { DataTable } from '../DataTable';
import { StatusBadge } from '../StatusBadge';
import { RecommendedActions } from '../RecommendedActions';
import type { WorkspaceCreatedState } from '../../../types/workspace';

interface DashboardsSectionProps {
  createdState: WorkspaceCreatedState;
}

export function DashboardsSection({ createdState }: DashboardsSectionProps) {
  const [selected, setSelected] = useState<string | null>(null);
  const previewRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (createdState.operationsDashboardSaved) {
      setSelected('operations-risk');
    }
  }, [createdState.operationsDashboardSaved]);

  useEffect(() => {
    if (selected) {
      previewRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }
  }, [selected]);

  return (
    <WorkspaceSectionScroll>
      <div className="mx-auto max-w-6xl px-4 py-6 sm:px-6">
      <SectionHeader
        title="Dashboards"
        subtitle="Generated operational dashboards built from connected manufacturing data."
      />

      <div className="mb-8 grid gap-4 sm:grid-cols-2">
        <EntityCard
          title="COO Daily Briefing"
          status={{ label: 'AI', variant: 'ai' }}
          meta={[
            { label: 'Created by', value: 'AI' },
            { label: 'Last updated', value: 'Today 08:05' },
          ]}
          metrics={[
            { label: 'Orders at risk', value: '3', valueClassName: 'text-red-400' },
            { label: 'Revenue at risk', value: '£221k', valueClassName: 'text-red-400' },
            { label: 'Delayed jobs', value: '4', valueClassName: 'text-amber-400' },
            { label: 'Material shortages', value: '3', valueClassName: 'text-amber-400' },
          ]}
          actions={<CardButton variant="primary" onClick={() => setSelected('coo-briefing')}>Open dashboard</CardButton>}
        />

        <EntityCard
          title="Production Bottlenecks"
          meta={[
            { label: 'Created by', value: 'Production Manager' },
            { label: 'Last updated', value: '12 minutes ago' },
          ]}
          metrics={[
            { label: 'Line 3 utilisation', value: '96%', valueClassName: 'text-red-400' },
            { label: 'CNC-04 downtime', value: '2.5h', valueClassName: 'text-amber-400' },
            { label: 'Delayed jobs', value: '4' },
            { label: 'Bottleneck machine', value: 'CNC-04' },
          ]}
          actions={<CardButton variant="primary" onClick={() => setSelected('bottlenecks')}>Open dashboard</CardButton>}
        />

        <EntityCard
          title="Inventory Risk"
          meta={[
            { label: 'Created by', value: 'Supply Chain Manager' },
            { label: 'Last updated', value: 'Today 07:45' },
          ]}
          metrics={[
            { label: 'Materials below level', value: '3', valueClassName: 'text-amber-400' },
            { label: 'Supplier delays', value: '2' },
            { label: 'Highest risk material', value: 'Aluminium Casing Blank' },
          ]}
          actions={<CardButton variant="primary" onClick={() => setSelected('inventory')}>Open dashboard</CardButton>}
        />

        <EntityCard
          title="Customer Delivery Risk"
          meta={[
            { label: 'Created by', value: 'COO' },
            { label: 'Last updated', value: 'Today 08:00' },
          ]}
          metrics={[
            { label: 'High-risk orders', value: '1', valueClassName: 'text-red-400' },
            { label: 'Medium-risk orders', value: '2', valueClassName: 'text-amber-400' },
            { label: 'Customers affected', value: 'Bosch, Siemens, ABB' },
          ]}
          actions={<CardButton variant="primary" onClick={() => setSelected('delivery')}>Open dashboard</CardButton>}
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
            metrics={[
              { label: 'Orders at risk', value: '3', valueClassName: 'text-red-400' },
              { label: 'Revenue at risk', value: '£221k', valueClassName: 'text-red-400' },
              { label: 'Delayed jobs', value: '4' },
              { label: 'Material shortages', value: '3' },
            ]}
            actions={
              <CardButton variant="primary" onClick={() => setSelected('operations-risk')}>
                Open dashboard
              </CardButton>
            }
          />
        )}
      </div>

      {selected && (
        <div ref={previewRef} className="rounded-xl border border-neutral-800 bg-[#0a0a0a] p-4 sm:p-6">
          <div className="mb-4 flex flex-wrap items-center justify-between gap-2">
            <div>
              <h3 className="text-lg font-semibold text-white">Operations Risk Dashboard</h3>
              <p className="text-xs text-neutral-500">Northbridge Components Ltd · Live preview</p>
            </div>
            <StatusBadge variant="ai">Generated from prompt</StatusBadge>
          </div>

          <div className="mb-4 grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-6">
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
                  { key: 'customer', header: 'Customer' },
                  { key: 'order', header: 'Order', className: 'text-white' },
                  { key: 'risk', header: 'Risk' },
                  { key: 'value', header: 'Value', align: 'right' },
                  { key: 'due', header: 'Due', align: 'right' },
                ]}
                rows={[
                  {
                    customer: 'Bosch',
                    order: 'SO-1048',
                    risk: <StatusBadge variant="danger">High</StatusBadge>,
                    value: '£84,000',
                    due: '12 Jul',
                  },
                  {
                    customer: 'Siemens',
                    order: 'SO-1051',
                    risk: <StatusBadge variant="warning">Medium</StatusBadge>,
                    value: '£72,000',
                    due: '15 Jul',
                  },
                  {
                    customer: 'ABB',
                    order: 'SO-1055',
                    risk: <StatusBadge variant="warning">Medium</StatusBadge>,
                    value: '£65,000',
                    due: '17 Jul',
                  },
                ]}
                minWidth="480px"
              />
            </Panel>

            <Panel title="Machine utilisation">
              <DataTable
                columns={[
                  { key: 'machine', header: 'Machine', className: 'text-white' },
                  { key: 'line', header: 'Line' },
                  { key: 'util', header: 'Utilisation', align: 'right' },
                  { key: 'status', header: 'Status' },
                ]}
                rows={[
                  {
                    machine: 'CNC-04',
                    line: 'Line 3',
                    util: '96%',
                    status: <StatusBadge variant="danger">Bottleneck</StatusBadge>,
                  },
                  {
                    machine: 'CNC-02',
                    line: 'Line 2',
                    util: '62%',
                    status: <StatusBadge variant="healthy">Available</StatusBadge>,
                  },
                  {
                    machine: 'ASM-01',
                    line: 'Line 1',
                    util: '78%',
                    status: <StatusBadge variant="healthy">Healthy</StatusBadge>,
                  },
                  {
                    machine: 'QA-03',
                    line: 'Quality',
                    util: '85%',
                    status: <StatusBadge variant="healthy">Healthy</StatusBadge>,
                  },
                ]}
                minWidth="400px"
              />
            </Panel>

            <Panel title="Material shortages">
              <DataTable
                columns={[
                  { key: 'material', header: 'Material', className: 'text-white' },
                  { key: 'shortage', header: 'Shortage', align: 'right' },
                  { key: 'status', header: 'PO status' },
                ]}
                rows={[
                  { material: 'Aluminium Casing Blank', shortage: '280', status: 'PO delayed' },
                  { material: 'PCB Board A', shortage: '40', status: 'PO confirmed' },
                  { material: 'Steel Bracket', shortage: '200', status: 'Supplier at risk' },
                ]}
                minWidth="360px"
              />
            </Panel>
          </div>

          <div className="mt-4">
            <RecommendedActions
              title="Recommended actions"
              actions={[
                'Expedite PO-7782',
                'Move J-901 to Line 2',
                'Review CNC-04 downtime',
                'Reconfirm Siemens delivery promise',
              ]}
            />
          </div>
        </div>
      )}
      </div>
    </WorkspaceSectionScroll>
  );
}

function Panel({ title, children }: { title: string; children: ReactNode }) {
  return (
    <div className="rounded-xl border border-neutral-800 bg-neutral-900/40 p-4">
      <p className="mb-3 text-[10px] font-semibold uppercase tracking-wider text-neutral-500">{title}</p>
      {children}
    </div>
  );
}
