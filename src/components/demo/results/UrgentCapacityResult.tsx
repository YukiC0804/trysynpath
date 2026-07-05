import { StatusBadge } from '../StatusBadge';
import { MetricCard } from '../MetricCard';
import { ActionButton, ActionButtonGroup } from '../workspace/ActionButton';
import { DataSourceBadges } from '../workspace/DataSourceBadges';
import { DataTable } from '../DataTable';
import { DATA_SOURCES_BY_RESULT } from '../../../data/demoWorkspace';

interface UrgentCapacityResultProps {
  completedActions: Set<string>;
  onAction: (id: string) => void;
}

export function UrgentCapacityResult({ completedActions, onAction }: UrgentCapacityResultProps) {
  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h3 className="text-lg font-semibold text-white">Tesla SO-1073 · Urgent Capacity Impact</h3>
        <StatusBadge variant="warning">Accept with conditions</StatusBadge>
      </div>

      <div className="rounded-xl border border-amber-500/20 bg-amber-500/5 p-4">
        <p className="mb-1 text-[10px] font-semibold uppercase tracking-wider text-amber-400/90">
          Recommendation
        </p>
        <p className="text-sm leading-relaxed text-neutral-200">
          <span className="font-medium text-white">Accept with conditions.</span> Do not promise 10 Jul until
          CNC-04 overtime is approved and Siemens SO-1061 finishing is moved to CNC-02.
        </p>
      </div>

      <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
        <MetricCard label="Customer" value="Tesla" />
        <MetricCard label="Order" value="SO-1073" />
        <MetricCard label="Requested ship" value="10 Jul" valueClassName="text-amber-400" />
        <MetricCard label="Gross margin" value="31%" valueClassName="text-emerald-400" />
      </div>

      <div className="rounded-xl border border-neutral-800 bg-[#0a0a0a] p-4">
        <p className="mb-3 text-[10px] font-semibold uppercase tracking-wider text-neutral-500">
          Order details (ERP)
        </p>
        <div className="grid gap-2 sm:grid-cols-2">
          <DetailRow label="Part" value="ALU-BRACKET-TX9" />
          <DetailRow label="Quantity" value="280 units" />
          <DetailRow label="Priority" value="Urgent / commercial escalation" />
          <DetailRow label="CNC-04 time required" value="7.5 hours" />
          <DetailRow label="Material" value="Aluminium 7075 billet · 42 kg" />
          <DetailRow label="Work centres" value="CNC-04, deburring, anodising, inspection, packing" />
        </div>
      </div>

      <div className="rounded-xl border border-neutral-800 bg-neutral-900/40 p-4">
        <p className="mb-3 text-[10px] font-semibold uppercase tracking-wider text-neutral-500">
          Capacity conflict analysis
        </p>
        <DataTable
          columns={[
            { key: 'order', header: 'Committed order', className: 'text-white' },
            { key: 'due', header: 'Due' },
            { key: 'workCentre', header: 'Work centre' },
            { key: 'impact', header: 'If Tesla accepted as-is' },
          ]}
          rows={[
            {
              order: 'Bosch SO-1048',
              due: '12 Jul',
              workCentre: 'CNC-04 recovery',
              impact: <span className="text-red-400">High delay risk</span>,
            },
            {
              order: 'Siemens SO-1061',
              due: '13 Jul',
              workCentre: 'CNC-04 finishing',
              impact: <span className="text-amber-400">Would slip 1 day</span>,
            },
            {
              order: 'Tesla SO-1073',
              due: '10 Jul',
              workCentre: 'CNC-04 + downstream',
              impact: <span className="text-neutral-300">Needs 7.5h CNC-04</span>,
            },
          ]}
          minWidth="520px"
        />
      </div>

      <div className="rounded-xl border border-neutral-800 bg-neutral-900/40 p-4">
        <p className="mb-3 text-[10px] font-semibold uppercase tracking-wider text-neutral-500">
          Material note
        </p>
        <p className="text-sm text-neutral-300">
          Aluminium 7075 billet is <span className="text-white">available (46 kg on hand)</span>, but accepting
          Tesla SO-1073 consumes almost all remaining stock. Coverage is tight if Airbus SO-1057 is pulled forward.
        </p>
      </div>

      <div className="rounded-xl border border-neutral-800 bg-neutral-900/40 p-4">
        <p className="mb-3 text-[10px] font-semibold uppercase tracking-wider text-neutral-500">
          Options to accept without delaying Bosch or Siemens
        </p>
        <ol className="space-y-2 text-sm text-neutral-300">
          <li className="flex gap-2">
            <span className="font-medium text-violet-400">1.</span>
            Approve 4 hours overtime on CNC-04
          </li>
          <li className="flex gap-2">
            <span className="font-medium text-violet-400">2.</span>
            Move Siemens SO-1061 finishing operations to CNC-02
          </li>
          <li className="flex gap-2">
            <span className="font-medium text-violet-400">3.</span>
            Split Tesla batch into two runs (160 + 120 units)
          </li>
          <li className="flex gap-2">
            <span className="font-medium text-violet-400">4.</span>
            Negotiate Tesla ship date to 11 Jul
          </li>
        </ol>
      </div>

      <DataSourceBadges sources={DATA_SOURCES_BY_RESULT['urgent-capacity']} />

      <ActionButtonGroup>
        <ActionButton
          id="tesla-accept-conditions"
          label="Draft Accept-with-Conditions Reply"
          variant="primary"
          completed={completedActions.has('tesla-accept-conditions')}
          completedLabel="Reply Drafted"
          onClick={onAction}
        />
        <ActionButton
          id="cnc-overtime-request"
          label="Request CNC-04 Overtime Approval"
          completed={completedActions.has('cnc-overtime-request')}
          completedLabel="Request Sent"
          onClick={onAction}
        />
        <ActionButton
          id="move-siemens-cnc02"
          label="Move Siemens SO-1061 to CNC-02"
          completed={completedActions.has('move-siemens-cnc02')}
          completedLabel="Reschedule Suggested"
          onClick={onAction}
        />
      </ActionButtonGroup>
    </div>
  );
}

function DetailRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-lg border border-neutral-800 bg-black/30 px-3 py-2 text-sm">
      <span className="text-neutral-500">{label}: </span>
      <span className="text-neutral-200">{value}</span>
    </div>
  );
}
