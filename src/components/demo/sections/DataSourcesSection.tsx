import { SectionHeader } from '../workspace/SectionHeader';
import { WorkspaceSectionScroll } from '../workspace/WorkspaceSectionScroll';
import { EntityCard } from '../workspace/EntityCard';
import { MetricCard } from '../MetricCard';
import { DataTable } from '../DataTable';
import { StatusBadge } from '../StatusBadge';

const DATA_SOURCES = [
  {
    name: 'ERP',
    records: '12,482',
    sync: '3 minutes ago',
    data: 'Sales orders, customers, invoices, production jobs',
  },
  {
    name: 'CRM',
    records: '3,204',
    sync: '8 minutes ago',
    data: 'Accounts, opportunities, RFQs, account owners',
  },
  {
    name: 'Inventory Database',
    records: '8,920',
    sync: '2 minutes ago',
    data: 'Stock levels, reservations, reorder points',
  },
  {
    name: 'Production Schedule',
    records: '1,184',
    sync: 'Live',
    data: 'Work orders, planned start, planned finish, routing',
  },
  {
    name: 'Machine Logs',
    records: '46,210',
    sync: 'Live',
    data: 'Uptime, downtime, utilisation, cycle time',
  },
  {
    name: 'Supplier POs',
    records: '2,481',
    sync: '12 minutes ago',
    data: 'Purchase orders, ETA, supplier status',
  },
  {
    name: 'RFQ Inbox',
    records: '328',
    sync: '5 minutes ago',
    data: 'RFQ emails, attachments, drawings, requirements',
  },
  {
    name: 'Quality Logs',
    records: '5,742',
    sync: '15 minutes ago',
    data: 'Defects, inspections, rework, non-conformance',
  },
  {
    name: 'Excel Files',
    records: '96 files',
    sync: '1 hour ago',
    data: 'Cost models, production plans, supplier price lists',
  },
];

const DATA_MAPPINGS = [
  'ERP.sales_orders.order_id → Production.work_orders.sales_order_id',
  'Inventory.material_id → BOM.material_id',
  'SupplierPO.material_id → Inventory.material_id',
  'MachineLogs.machine_id → Production.routing.machine_id',
  'QualityLogs.job_id → Production.work_orders.job_id',
];

export function DataSourcesSection() {
  return (
    <WorkspaceSectionScroll>
      <div className="mx-auto max-w-6xl px-4 py-6 sm:px-6">
      <SectionHeader
        title="Data Sources"
        subtitle="Connected manufacturing systems powering agents, dashboards, apps, and workflows."
      />

      <div className="mb-8 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {DATA_SOURCES.map((source) => (
          <div key={source.name}>
            <EntityCard
              title={source.name}
              status={{ label: 'Connected', variant: 'connected' }}
              meta={[
                { label: 'Records synced', value: source.records },
                { label: 'Last sync', value: source.sync },
                { label: 'Data', value: source.data },
              ]}
            />
          </div>
        ))}
      </div>

      <div className="mb-8 grid gap-4 lg:grid-cols-2">
        <div className="rounded-xl border border-neutral-800 bg-[#0a0a0a] p-4">
          <p className="mb-3 text-[10px] font-semibold uppercase tracking-wider text-neutral-500">
            Sample data mapping
          </p>
          <div className="space-y-2 font-mono text-xs">
            {DATA_MAPPINGS.map((mapping) => (
              <div key={mapping} className="rounded-lg border border-neutral-800 bg-neutral-900/50 px-3 py-2 text-neutral-400">
                {mapping}
              </div>
            ))}
          </div>
        </div>

        <div className="rounded-xl border border-neutral-800 bg-[#0a0a0a] p-4">
          <p className="mb-3 text-[10px] font-semibold uppercase tracking-wider text-neutral-500">Data health</p>
          <div className="grid grid-cols-2 gap-2">
            <MetricCard label="Connected systems" value="9/9" valueClassName="text-emerald-400" />
            <MetricCard label="Sync health" value="98%" valueClassName="text-emerald-400" />
            <MetricCard label="Duplicate records" value="12" valueClassName="text-amber-400" />
            <MetricCard label="Missing material IDs" value="4" valueClassName="text-amber-400" />
            <MetricCard label="Unmatched supplier records" value="7" valueClassName="text-amber-400" />
          </div>
        </div>
      </div>

      <div className="rounded-xl border border-neutral-800 bg-[#0a0a0a] p-4">
        <p className="mb-3 text-[10px] font-semibold uppercase tracking-wider text-neutral-500">Sync status</p>
        <DataTable
          columns={[
            { key: 'system', header: 'System', className: 'text-white' },
            { key: 'records', header: 'Records', align: 'right' },
            { key: 'sync', header: 'Last sync' },
            { key: 'status', header: 'Status' },
          ]}
          rows={DATA_SOURCES.map((s) => ({
            system: s.name,
            records: s.records,
            sync: s.sync,
            status: <StatusBadge variant="connected">Connected</StatusBadge>,
          }))}
          minWidth="480px"
        />
      </div>
      </div>
    </WorkspaceSectionScroll>
  );
}
