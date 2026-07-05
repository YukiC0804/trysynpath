import { SectionHeader } from '../workspace/SectionHeader';
import { WorkspaceSectionScroll } from '../workspace/WorkspaceSectionScroll';
import { EntityCard, CardButton } from '../workspace/EntityCard';
import { DataTable } from '../DataTable';
import { StatusBadge } from '../StatusBadge';
import type { WorkspaceCreatedState } from '../../../types/workspace';

interface AgentsSectionProps {
  createdState: WorkspaceCreatedState;
}

export function AgentsSection({ createdState }: AgentsSectionProps) {
  return (
    <WorkspaceSectionScroll>
      <div className="mx-auto max-w-6xl px-4 py-6 sm:px-6">
      <SectionHeader
        title="Agents"
        subtitle="Autonomous monitoring and workflow agents across operations, production, inventory, and customer delivery."
      />

      <div className="mb-8 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        <EntityCard
          title="Daily Order Risk Agent"
          highlight={createdState.dailyRiskAgentCreated}
          status={{ label: 'Active', variant: 'healthy' }}
          meta={[
            { label: 'Runs', value: 'Every weekday at 08:00' },
            { label: 'Owner', value: 'COO' },
            { label: 'Data sources', value: 'ERP, Production Schedule, Inventory, Supplier POs, Machine Logs' },
            { label: 'Last run', value: 'Today 08:00' },
            { label: 'Last finding', value: '3 orders at risk, £221k revenue affected' },
          ]}
          actions={
            <>
              <CardButton variant="primary">View run</CardButton>
              <CardButton>Edit rules</CardButton>
              <CardButton>Pause</CardButton>
            </>
          }
        />

        <EntityCard
          title="Material Shortage Agent"
          status={{ label: 'Active', variant: 'healthy' }}
          meta={[
            { label: 'Runs', value: 'Daily at 07:30' },
            { label: 'Owner', value: 'Supply Chain Manager' },
            { label: 'Data sources', value: 'Inventory, BOM, Purchase Orders, Production Plan' },
            { label: 'Last run', value: 'Today 07:30' },
            { label: 'Last finding', value: 'Aluminium Casing Blank shortage of 280 units' },
          ]}
          actions={
            <>
              <CardButton variant="primary">View run</CardButton>
              <CardButton>Edit rules</CardButton>
              <CardButton>Pause</CardButton>
            </>
          }
        />

        <EntityCard
          title="Machine Downtime Agent"
          status={{ label: 'Active', variant: 'healthy' }}
          meta={[
            { label: 'Runs', value: 'Real-time' },
            { label: 'Owner', value: 'Production Manager' },
            { label: 'Data sources', value: 'Machine Logs, MES, Maintenance Logs' },
            { label: 'Last finding', value: 'CNC-04 downtime exceeded 2 hours' },
          ]}
          actions={
            <>
              <CardButton variant="primary">View alert</CardButton>
              <CardButton>Create maintenance task</CardButton>
            </>
          }
        />

        <EntityCard
          title="RFQ Follow-up Agent"
          highlight={createdState.rfqAgentActivated}
          status={{
            label: createdState.rfqAgentActivated ? 'Active' : 'Draft',
            variant: createdState.rfqAgentActivated ? 'healthy' : 'neutral',
          }}
          meta={[
            { label: 'Runs', value: 'When new RFQ received' },
            { label: 'Owner', value: 'Commercial Manager' },
            { label: 'Data sources', value: 'RFQ Inbox, Historical Quotes, Cost Models, CRM' },
            {
              label: 'Last finding',
              value: createdState.rfqAgentActivated ? 'Quote draft generated for Schneider Electric' : 'Not yet activated',
            },
          ]}
          actions={
            <>
              <CardButton variant="primary">{createdState.rfqAgentActivated ? 'View run' : 'Activate'}</CardButton>
              <CardButton>Edit workflow</CardButton>
            </>
          }
        />

        <EntityCard
          title="Quality Escalation Agent"
          status={{ label: 'Active', variant: 'healthy' }}
          meta={[
            { label: 'Runs', value: 'Hourly' },
            { label: 'Owner', value: 'Quality Manager' },
            { label: 'Data sources', value: 'Quality Logs, Production Jobs, Customer Orders' },
            { label: 'Last finding', value: 'Surface scratch defect rate rose to 4.2% on J-883' },
          ]}
          actions={
            <>
              <CardButton variant="primary">View issue</CardButton>
              <CardButton>Notify owner</CardButton>
            </>
          }
        />
      </div>

      <div className="rounded-xl border border-neutral-800 bg-[#0a0a0a] p-4">
        <p className="mb-3 text-[10px] font-semibold uppercase tracking-wider text-neutral-500">Agent runs</p>
        <DataTable
          columns={[
            { key: 'time', header: 'Time' },
            { key: 'agent', header: 'Agent', className: 'text-white' },
            { key: 'trigger', header: 'Trigger' },
            { key: 'finding', header: 'Finding' },
            { key: 'severity', header: 'Severity' },
            { key: 'action', header: 'Action taken' },
          ]}
          rows={[
            {
              time: '08:00',
              agent: 'Daily Order Risk Agent',
              trigger: 'Scheduled run',
              finding: 'Bosch SO-1048 high delivery risk',
              severity: <StatusBadge variant="danger">High</StatusBadge>,
              action: 'Recovery plan suggested',
            },
            {
              time: '07:30',
              agent: 'Material Shortage Agent',
              trigger: 'Scheduled run',
              finding: 'Aluminium Casing Blank shortage',
              severity: <StatusBadge variant="danger">High</StatusBadge>,
              action: 'Expedite PO recommended',
            },
            {
              time: '06:45',
              agent: 'Machine Downtime Agent',
              trigger: 'CNC-04 downtime event',
              finding: 'Line 3 capacity reduced',
              severity: <StatusBadge variant="warning">Medium</StatusBadge>,
              action: 'Maintenance task suggested',
            },
            {
              time: 'Yesterday 16:30',
              agent: 'Quality Escalation Agent',
              trigger: 'Defect threshold breached',
              finding: 'Surface scratches on J-883',
              severity: <StatusBadge variant="warning">Medium</StatusBadge>,
              action: 'QA review suggested',
            },
          ]}
          minWidth="720px"
        />
      </div>
      </div>
    </WorkspaceSectionScroll>
  );
}
