import { SectionHeader } from '../workspace/SectionHeader';
import { WorkspaceSectionScroll } from '../workspace/WorkspaceSectionScroll';
import { EntityCard, CardButton } from '../workspace/EntityCard';
import { DataTable } from '../DataTable';
import { StatusBadge } from '../StatusBadge';

export function WorkflowsSection() {
  const workflowSteps = (steps: string[]) => (
    <ol className="mt-2 space-y-1">
      {steps.map((step, i) => (
        <li key={step} className="flex gap-2 text-xs text-neutral-400">
          <span className="font-medium text-neutral-500">{i + 1}.</span>
          {step}
        </li>
      ))}
    </ol>
  );

  return (
    <WorkspaceSectionScroll>
      <div className="mx-auto max-w-6xl px-4 py-6 sm:px-6">
      <SectionHeader
        title="Workflows"
        subtitle="Operational workflows created in natural language and connected to manufacturing systems."
      />

      <div className="mb-8 grid gap-4 sm:grid-cols-2">
        <EntityCard
          title="RFQ to Quote Workflow"
          status={{ label: 'Active', variant: 'healthy' }}
          meta={[
            { label: 'Trigger', value: 'New RFQ received' },
            { label: 'Last run', value: 'Today 09:12' },
            { label: 'Last result', value: 'Quote draft generated for Schneider Electric' },
          ]}
          description={undefined}
          content={workflowSteps([
            'Extract RFQ requirements',
            'Match to historical quotes',
            'Estimate material, labour, machine, and finishing cost',
            'Check capacity',
            'Apply margin rules',
            'Generate quote draft',
            'Send to commercial manager for approval',
          ])}
          actions={
            <>
              <CardButton variant="primary">View Runs</CardButton>
              <CardButton>Edit Workflow</CardButton>
            </>
          }
        />

        <EntityCard
          title="Urgent Order Recovery Workflow"
          status={{ label: 'Active', variant: 'healthy' }}
          meta={[
            { label: 'Trigger', value: 'High-priority order at risk' },
            { label: 'Last run', value: 'Today 08:03' },
            { label: 'Last result', value: 'Recovery plan generated for Bosch SO-1048' },
          ]}
          content={workflowSteps([
            'Identify root cause',
            'Check material shortage',
            'Check capacity alternatives',
            'Recommend reschedule',
            'Draft supplier expedite email',
            'Notify COO and production planner',
          ])}
          actions={
            <>
              <CardButton variant="primary">View Runs</CardButton>
              <CardButton>Edit Workflow</CardButton>
            </>
          }
        />

        <EntityCard
          title="Machine Breakdown Response Workflow"
          status={{ label: 'Active', variant: 'healthy' }}
          meta={[
            { label: 'Trigger', value: 'Machine downtime exceeds 60 minutes' },
            { label: 'Last run', value: 'Today 06:45' },
            { label: 'Last result', value: 'CNC-04 breakdown response suggested' },
          ]}
          content={workflowSteps([
            'Identify affected jobs',
            'Calculate customer impact',
            'Search alternative machines',
            'Generate reschedule plan',
            'Notify maintenance and production manager',
          ])}
          actions={
            <>
              <CardButton variant="primary">View Runs</CardButton>
              <CardButton>Edit Workflow</CardButton>
            </>
          }
        />

        <EntityCard
          title="New Order Validation Workflow"
          status={{ label: 'Draft', variant: 'neutral' }}
          meta={[{ label: 'Trigger', value: 'New order submitted' }]}
          content={workflowSteps([
            'Validate customer and product',
            'Check material availability',
            'Check production capacity',
            'Calculate delivery confidence',
            'Request approval if order value > £50,000',
            'Create production job',
          ])}
          actions={
            <>
              <CardButton variant="primary">Activate</CardButton>
              <CardButton>Edit Workflow</CardButton>
            </>
          }
        />
      </div>

      <div className="rounded-xl border border-neutral-800 bg-[#0a0a0a] p-4">
        <p className="mb-3 text-[10px] font-semibold uppercase tracking-wider text-neutral-500">Workflow run history</p>
        <DataTable
          columns={[
            { key: 'time', header: 'Time' },
            { key: 'workflow', header: 'Workflow', className: 'text-white' },
            { key: 'trigger', header: 'Trigger' },
            { key: 'result', header: 'Result' },
            { key: 'status', header: 'Status' },
          ]}
          rows={[
            {
              time: '09:12',
              workflow: 'RFQ to Quote',
              trigger: 'New RFQ from Schneider Electric',
              result: 'Quote draft generated',
              status: <StatusBadge variant="healthy">Completed</StatusBadge>,
            },
            {
              time: '08:03',
              workflow: 'Urgent Order Recovery',
              trigger: 'Bosch SO-1048 flagged high risk',
              result: 'Recovery plan generated',
              status: <StatusBadge variant="healthy">Completed</StatusBadge>,
            },
            {
              time: '06:45',
              workflow: 'Machine Breakdown Response',
              trigger: 'CNC-04 downtime > 60 min',
              result: 'Reschedule suggested',
              status: <StatusBadge variant="healthy">Completed</StatusBadge>,
            },
            {
              time: 'Yesterday 15:22',
              workflow: 'New Order Validation',
              trigger: 'Siemens order submitted',
              result: 'Capacity warning raised',
              status: <StatusBadge variant="healthy">Completed</StatusBadge>,
            },
          ]}
          minWidth="680px"
        />
      </div>
      </div>
    </WorkspaceSectionScroll>
  );
}
