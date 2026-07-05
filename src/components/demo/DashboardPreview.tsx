import type { ReactNode } from 'react';
import { Sparkles } from 'lucide-react';
import { MetricCard } from './MetricCard';
import { StatusBadge } from './StatusBadge';
import { DataTable } from './DataTable';
import { RecommendedActions } from './RecommendedActions';

const ORDERS_AT_RISK = [
  { order: 'Bosch SO-1048', risk: 'High', value: '£84,000' },
  { order: 'Tesla SO-1073', risk: 'High', value: '£58,000' },
  { order: 'Airbus SO-1057', risk: 'Medium', value: '£52,000' },
  { order: 'Siemens SO-1061', risk: 'Medium', value: '£74,000' },
];

const MACHINE_UTIL = [
  { machine: 'CNC-04', util: '96%', status: 'danger' as const },
  { machine: 'CNC-02', util: '62%', status: 'healthy' as const },
  { machine: 'ASM-01', util: '78%', status: 'warning' as const },
  { machine: 'QA-03', util: '85%', status: 'warning' as const },
];

const MATERIAL_SHORTAGES = [
  { material: 'Stainless Steel 316L', shortage: '65 kg' },
  { material: 'Aluminium 7075 billet', shortage: 'Tight' },
  { material: 'Packaging inserts PKG-44', shortage: '310 units' },
];

const DELAYED_JOBS = [
  { job: 'J-883', status: 'Delayed', customer: 'Bosch' },
  { job: 'J-912', status: 'Awaiting capacity', customer: 'Tesla' },
  { job: 'J-908', status: 'At risk', customer: 'Siemens' },
  { job: 'J-915', status: 'PO dependent', customer: 'Airbus' },
];

const DASHBOARD_ACTIONS = [
  'Expedite PO-7782 for Stainless Steel 316L',
  'Approve CNC-04 overtime for Tesla SO-1073',
  'Move Siemens SO-1061 finishing to CNC-02',
  'Confirm PO-7811 arrival with AeroMetals UK',
];

export function DashboardPreview() {
  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <h4 className="text-lg font-semibold text-white">Operations Command Dashboard</h4>
          <p className="text-sm text-neutral-400">Northbridge Components Ltd · Live view</p>
        </div>
        <span className="inline-flex items-center gap-1.5 rounded-full border border-violet-500/25 bg-violet-500/10 px-3 py-1 text-xs text-violet-300">
          <Sparkles className="h-3 w-3" />
          Generated from prompt
        </span>
      </div>

      <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
        <MetricCard label="Orders at risk" value="4" valueClassName="text-red-400" />
        <MetricCard label="Delayed jobs" value="4" valueClassName="text-amber-400" />
        <MetricCard label="Revenue at risk" value="£268,000" valueClassName="text-red-400" />
        <MetricCard label="Supplier delays" value="2" valueClassName="text-amber-400" />
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <div className="space-y-4">
          <Section title="Orders at risk">
            <DataTable
              columns={[
                { key: 'order', header: 'Order', className: 'text-white font-medium' },
                { key: 'risk', header: 'Risk' },
                { key: 'value', header: 'Value', align: 'right' },
              ]}
              rows={ORDERS_AT_RISK.map((o) => ({
                order: o.order,
                risk: (
                  <StatusBadge variant={o.risk === 'High' ? 'danger' : 'warning'}>{o.risk}</StatusBadge>
                ),
                value: o.value,
              }))}
              minWidth="360px"
            />
          </Section>

          <Section title="Material shortages">
            <DataTable
              columns={[
                { key: 'material', header: 'Material', className: 'text-white' },
                { key: 'shortage', header: 'Shortage', align: 'right', className: 'text-amber-400' },
              ]}
              rows={MATERIAL_SHORTAGES}
              minWidth="320px"
            />
          </Section>
        </div>

        <div className="space-y-4">
          <Section title="Machine utilisation">
            <div className="space-y-2">
              {MACHINE_UTIL.map((m) => (
                <div key={m.machine} className="rounded-lg border border-neutral-800 bg-neutral-900/50 px-3 py-2">
                  <div className="mb-1 flex items-center justify-between text-xs">
                    <span className="font-medium text-white">{m.machine}</span>
                    <span
                      className={
                        m.status === 'danger'
                          ? 'text-red-400'
                          : m.status === 'warning'
                            ? 'text-amber-400'
                            : 'text-emerald-400'
                      }
                    >
                      {m.util}
                    </span>
                  </div>
                  <div className="h-1.5 overflow-hidden rounded-full bg-neutral-800">
                    <div
                      className={`h-full rounded-full ${
                        m.status === 'danger'
                          ? 'bg-red-500'
                          : m.status === 'warning'
                            ? 'bg-amber-500'
                            : 'bg-emerald-500'
                      }`}
                      style={{ width: m.util }}
                    />
                  </div>
                </div>
              ))}
            </div>
            <p className="mt-2 text-[10px] text-neutral-500">Bottleneck: CNC-04 at 96% utilisation</p>
          </Section>

          <Section title="Delayed jobs">
            <DataTable
              columns={[
                { key: 'job', header: 'Job', className: 'text-white font-medium' },
                { key: 'status', header: 'Status' },
                { key: 'customer', header: 'Customer' },
              ]}
              rows={DELAYED_JOBS.map((j) => ({
                job: j.job,
                status: (
                  <StatusBadge
                    variant={
                      j.status === 'Delayed' ? 'danger' : j.status === 'At risk' ? 'warning' : 'neutral'
                    }
                  >
                    {j.status}
                  </StatusBadge>
                ),
                customer: j.customer,
              }))}
              minWidth="320px"
            />
          </Section>
        </div>
      </div>

      <RecommendedActions actions={DASHBOARD_ACTIONS} title="Recommended actions from dashboard" />
    </div>
  );
}

function Section({ title, children }: { title: string; children: ReactNode }) {
  return (
    <div className="rounded-xl border border-neutral-800 bg-[#0a0a0a] p-4">
      <p className="mb-3 text-[10px] font-semibold uppercase tracking-wider text-neutral-500">{title}</p>
      {children}
    </div>
  );
}
