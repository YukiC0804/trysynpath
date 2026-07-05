import { useCallback, useState, type ReactNode } from 'react';
import { SectionHeader } from '../workspace/SectionHeader';
import { WorkspaceSectionScroll } from '../workspace/WorkspaceSectionScroll';
import { EntityCard, CardButton } from '../workspace/EntityCard';
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
import { RunStepper } from '../interactive/RunStepper';
import {
  AGENT_DEFINITIONS,
  DEFAULT_AGENT_RULES,
  DELIVERY_CHANNEL_OPTIONS,
  NOTIFY_RECIPIENT_OPTIONS,
  type AgentId,
  type AgentRules,
} from '../../../data/demoInteractiveData';
import type { WorkspaceCreatedState } from '../../../types/workspace';

interface AgentsSectionProps {
  createdState: WorkspaceCreatedState;
  onRunPrompt?: (prompt: string) => void;
  showToast?: (message: string) => void;
}

type AgentModal = 'view' | 'run' | 'edit-rules' | null;

export function AgentsSection({ createdState, onRunPrompt, showToast }: AgentsSectionProps) {
  const [modal, setModal] = useState<AgentModal>(null);
  const [selectedAgent, setSelectedAgent] = useState<AgentId | null>(null);
  const [rulesByAgent, setRulesByAgent] = useState<Record<AgentId, AgentRules>>({
    'daily-order-risk': { ...DEFAULT_AGENT_RULES },
    'material-shortage': { ...DEFAULT_AGENT_RULES, dueWithinDays: 7 },
    'machine-downtime': { ...DEFAULT_AGENT_RULES, machineUtilisationPercent: 85 },
    'rfq-follow-up': { ...DEFAULT_AGENT_RULES },
    'quality-escalation': { ...DEFAULT_AGENT_RULES },
  });
  const [draftRules, setDraftRules] = useState<AgentRules>(DEFAULT_AGENT_RULES);
  const [updatedAgents, setUpdatedAgents] = useState<Partial<Record<AgentId, boolean>>>({});
  const [runComplete, setRunComplete] = useState(false);
  const [running, setRunning] = useState(false);

  const openModal = (agentId: AgentId, type: AgentModal) => {
    setSelectedAgent(agentId);
    setModal(type);
    setRunComplete(false);
    setRunning(type === 'run');
    if (type === 'edit-rules') {
      setDraftRules({ ...rulesByAgent[agentId] });
    }
  };

  const closeModal = () => {
    setModal(null);
    setSelectedAgent(null);
    setRunning(false);
    setRunComplete(false);
  };

  const handleRunComplete = useCallback(() => {
    setRunning(false);
    setRunComplete(true);
  }, []);

  const saveRules = () => {
    if (!selectedAgent) return;
    setRulesByAgent((prev) => ({ ...prev, [selectedAgent]: draftRules }));
    setUpdatedAgents((prev) => ({ ...prev, [selectedAgent]: true }));
    showToast?.(
      `Rules updated. ${AGENT_DEFINITIONS[selectedAgent].title} will use these thresholds on the next run.`,
    );
    closeModal();
  };

  const agent = selectedAgent ? AGENT_DEFINITIONS[selectedAgent] : null;

  const toggleList = (list: string[], item: string) =>
    list.includes(item) ? list.filter((x) => x !== item) : [...list, item];

  return (
    <WorkspaceSectionScroll>
      <div className="mx-auto max-w-6xl px-4 py-6 sm:px-6">
        <SectionHeader
          title="Agents"
          subtitle="Autonomous monitoring and workflow agents across operations, production, inventory, and customer delivery."
        />

        <div className="mb-8 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          <AgentCard
            title="Daily Order Risk Agent"
            highlight={createdState.dailyRiskAgentCreated}
            status={{ label: 'Active', variant: 'healthy' }}
            updated={updatedAgents['daily-order-risk']}
            meta={[
              { label: 'Runs', value: 'Every weekday at 08:00' },
              { label: 'Owner', value: 'COO' },
              { label: 'Last run', value: 'Today 08:02' },
              { label: 'Last finding', value: '4 orders at risk, £268k revenue affected' },
            ]}
            onView={() => openModal('daily-order-risk', 'view')}
            onRun={() => openModal('daily-order-risk', 'run')}
            onEditRules={() => openModal('daily-order-risk', 'edit-rules')}
          />

          <AgentCard
            title="Supplier Delay Monitor"
            status={{ label: 'Active', variant: 'healthy' }}
            updated={updatedAgents['material-shortage']}
            meta={[
              { label: 'Runs', value: 'Daily at 07:30' },
              { label: 'Owner', value: 'Supply Chain Manager' },
              { label: 'Last run', value: 'Today 07:30' },
              { label: 'Last finding', value: 'Stainless Steel 316L shortage for Bosch SO-1048' },
            ]}
            onView={() => openModal('material-shortage', 'view')}
            onRun={() => openModal('material-shortage', 'run')}
            onEditRules={() => openModal('material-shortage', 'edit-rules')}
          />

          <AgentCard
            title="CNC Breakdown Response Agent"
            status={{ label: 'Active', variant: 'healthy' }}
            updated={updatedAgents['machine-downtime']}
            meta={[
              { label: 'Runs', value: 'Real-time' },
              { label: 'Owner', value: 'Production Manager' },
              { label: 'Last finding', value: 'CNC-04 downtime exceeded 2 hours' },
            ]}
            onView={() => openModal('machine-downtime', 'view')}
            onRun={() => openModal('machine-downtime', 'run')}
            onEditRules={() => openModal('machine-downtime', 'edit-rules')}
          />

          <AgentCard
            title="RFQ Intake Agent"
            highlight={createdState.rfqAgentActivated}
            status={{
              label: createdState.rfqAgentActivated ? 'Active' : 'Draft',
              variant: createdState.rfqAgentActivated ? 'healthy' : 'neutral',
            }}
            updated={updatedAgents['rfq-follow-up']}
            meta={[
              { label: 'Runs', value: 'When new RFQ received' },
              { label: 'Owner', value: 'Commercial Manager' },
              {
                label: 'Last finding',
                value: createdState.rfqAgentActivated
                  ? 'Quote draft generated for Schneider Electric'
                  : 'Not yet activated',
              },
            ]}
            onView={() => openModal('rfq-follow-up', 'view')}
            onRun={() => openModal('rfq-follow-up', 'run')}
            onEditRules={() => openModal('rfq-follow-up', 'edit-rules')}
            primaryLabel={createdState.rfqAgentActivated ? 'Run' : 'Activate'}
          />

          <AgentCard
            title="Quote Approval Agent"
            status={{ label: 'Active', variant: 'healthy' }}
            updated={updatedAgents['quality-escalation']}
            meta={[
              { label: 'Runs', value: 'Hourly' },
              { label: 'Owner', value: 'Quality Manager' },
              { label: 'Last finding', value: 'Surface scratch defect rate rose to 4.2% on J-883' },
            ]}
            onView={() => openModal('quality-escalation', 'view')}
            onRun={() => openModal('quality-escalation', 'run')}
            onEditRules={() => openModal('quality-escalation', 'edit-rules')}
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
                time: '08:02',
                agent: 'Daily Order Risk Agent',
                trigger: 'Scheduled run',
                finding: 'Bosch SO-1048 high delivery risk',
                severity: <StatusBadge variant="danger">High</StatusBadge>,
                action: 'Recovery plan suggested',
              },
              {
                time: '07:30',
                agent: 'Supplier Delay Monitor',
                trigger: 'Scheduled run',
                finding: 'Aluminium Casing Blank shortage',
                severity: <StatusBadge variant="danger">High</StatusBadge>,
                action: 'Expedite PO recommended',
              },
              {
                time: '06:45',
                agent: 'CNC Breakdown Response Agent',
                trigger: 'CNC-04 downtime event',
                finding: 'Line 3 capacity reduced',
                severity: <StatusBadge variant="warning">Medium</StatusBadge>,
                action: 'Maintenance task suggested',
              },
            ]}
            minWidth="720px"
          />
        </div>
      </div>

      <WorkspaceModal
        open={modal === 'view' && !!agent}
        onClose={closeModal}
        title={agent?.title ?? ''}
        subtitle={agent?.subtitle}
        footer={
          <>
            <ModalButton onClick={() => selectedAgent && openModal(selectedAgent, 'run')}>Run now</ModalButton>
            <ModalButton onClick={() => selectedAgent && openModal(selectedAgent, 'edit-rules')}>
              Edit Rules
            </ModalButton>
            <ModalButton onClick={closeModal}>Close</ModalButton>
          </>
        }
      >
        {agent && (
          <>
            <ModalSection title="Status">
              <div className="grid gap-2 sm:grid-cols-2">
                <InfoRow label="Status" value="Active" />
                <InfoRow label="Schedule" value={agent.schedule} />
                <InfoRow label="Owner" value={agent.owner} />
                <InfoRow label="Last run" value={agent.lastRun} />
                <InfoRow label="Next run" value={agent.nextRun} />
              </div>
            </ModalSection>
            <ModalSection title="Connected data">
              <TagList items={agent.connectedData} />
            </ModalSection>
            <ModalSection title="Recent output">
              <ul className="space-y-1.5 text-sm text-neutral-300">
                {agent.recentOutput.map((line) => (
                  <li key={line} className="flex gap-2">
                    <span className="text-neutral-600">·</span>
                    {line}
                  </li>
                ))}
              </ul>
            </ModalSection>
          </>
        )}
      </WorkspaceModal>

      <WorkspaceModal
        open={modal === 'run' && !!agent}
        onClose={closeModal}
        title={runComplete ? 'Agent run complete' : `Running ${agent?.title ?? ''}`}
        subtitle={runComplete ? 'Analysis finished and recommendations are ready.' : 'Processing connected manufacturing data...'}
        footer={
          runComplete ? (
            <>
              {agent?.commandCentrePrompt && (
                <ModalButton
                  variant="primary"
                  onClick={() => {
                    onRunPrompt?.(agent.commandCentrePrompt!);
                    closeModal();
                  }}
                >
                  Open result in Command Centre
                </ModalButton>
              )}
              <ModalButton
                onClick={() => {
                  showToast?.('Recovery plan draft created.');
                  closeModal();
                }}
              >
                Create recovery plan
              </ModalButton>
              <ModalButton onClick={closeModal}>Close</ModalButton>
            </>
          ) : (
            <ModalButton onClick={closeModal}>Cancel</ModalButton>
          )
        }
      >
        {agent &&
          (runComplete ? (
            <div className="space-y-3">
              {agent.runSummary.map((row) => (
                <div key={row.label} className="flex justify-between gap-4 text-sm">
                  <span className="text-neutral-500">{row.label}</span>
                  <span className="text-right font-medium text-white">{row.value}</span>
                </div>
              ))}
            </div>
          ) : (
            <RunStepper steps={agent.runSteps} running={running} onComplete={handleRunComplete} />
          ))}
      </WorkspaceModal>

      <WorkspaceModal
        open={modal === 'edit-rules' && !!agent}
        onClose={closeModal}
        title="Edit Agent Rules"
        subtitle="Define when this agent should flag an order as at risk."
        footer={
          <>
            <ModalButton onClick={closeModal}>Cancel</ModalButton>
            <ModalButton variant="primary" onClick={saveRules}>
              Save Rules
            </ModalButton>
          </>
        }
      >
        <ModalField label="Monitor orders with priority">
          <select
            className={modalSelectClassName()}
            value={draftRules.priorityFilter}
            onChange={(e) =>
              setDraftRules((prev) => ({
                ...prev,
                priorityFilter: e.target.value as AgentRules['priorityFilter'],
              }))
            }
          >
            <option>High only</option>
            <option>High + Medium</option>
            <option>All customer orders</option>
          </select>
        </ModalField>

        <ModalField label="Flag orders due within" suffix="days">
          <input
            type="number"
            className={modalInputClassName()}
            value={draftRules.dueWithinDays}
            onChange={(e) =>
              setDraftRules((prev) => ({ ...prev, dueWithinDays: Number(e.target.value) || 0 }))
            }
          />
        </ModalField>

        <ModalField label="Flag when material shortage is greater than" suffix="units">
          <input
            type="number"
            className={modalInputClassName()}
            value={draftRules.materialShortageUnits}
            onChange={(e) =>
              setDraftRules((prev) => ({
                ...prev,
                materialShortageUnits: Number(e.target.value) || 0,
              }))
            }
          />
        </ModalField>

        <ModalField label="Flag supplier POs delayed by" suffix="day or more">
          <input
            type="number"
            className={modalInputClassName()}
            value={draftRules.supplierDelayDays}
            onChange={(e) =>
              setDraftRules((prev) => ({ ...prev, supplierDelayDays: Number(e.target.value) || 0 }))
            }
          />
        </ModalField>

        <ModalField label="Flag machine utilisation above" suffix="%">
          <input
            type="number"
            className={modalInputClassName()}
            value={draftRules.machineUtilisationPercent}
            onChange={(e) =>
              setDraftRules((prev) => ({
                ...prev,
                machineUtilisationPercent: Number(e.target.value) || 0,
              }))
            }
          />
        </ModalField>

        <ModalField label="Notify recipients">
          <PillToggleGroup
            options={NOTIFY_RECIPIENT_OPTIONS}
            selected={draftRules.notifyRecipients}
            onToggle={(item) =>
              setDraftRules((prev) => ({
                ...prev,
                notifyRecipients: toggleList(prev.notifyRecipients, item),
              }))
            }
          />
        </ModalField>

        <ModalField label="Delivery channel">
          <PillToggleGroup
            options={DELIVERY_CHANNEL_OPTIONS}
            selected={draftRules.deliveryChannels}
            onToggle={(item) =>
              setDraftRules((prev) => ({
                ...prev,
                deliveryChannels: toggleList(prev.deliveryChannels, item),
              }))
            }
          />
        </ModalField>
      </WorkspaceModal>
    </WorkspaceSectionScroll>
  );
}

function AgentCard({
  title,
  status,
  meta,
  highlight,
  updated,
  onView,
  onRun,
  onEditRules,
  primaryLabel = 'Run',
}: {
  title: string;
  status: { label: string; variant: 'healthy' | 'neutral' };
  meta: { label: string; value: string }[];
  highlight?: boolean;
  updated?: boolean;
  onView: () => void;
  onRun: () => void;
  onEditRules: () => void;
  primaryLabel?: string;
}) {
  return (
    <EntityCard
      title={title}
      highlight={highlight}
      status={status}
      meta={[
        ...meta,
        ...(updated ? [{ label: 'Rules', value: 'Updated just now' }] : []),
      ]}
      actions={
        <>
          <CardButton onClick={onView}>View</CardButton>
          <CardButton variant="primary" onClick={onRun}>
            {primaryLabel}
          </CardButton>
          <CardButton onClick={onEditRules}>Edit Rules</CardButton>
        </>
      }
    />
  );
}

function InfoRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-lg border border-neutral-800 bg-neutral-900/40 px-3 py-2 text-sm">
      <span className="text-neutral-500">{label}: </span>
      <span className="text-neutral-200">{value}</span>
    </div>
  );
}

function TagList({ items }: { items: string[] }) {
  return (
    <div className="flex flex-wrap gap-2">
      {items.map((item) => (
        <span
          key={item}
          className="rounded-full border border-neutral-700 bg-neutral-900 px-2.5 py-1 text-xs text-neutral-300"
        >
          {item}
        </span>
      ))}
    </div>
  );
}

function PillToggleGroup({
  options,
  selected,
  onToggle,
}: {
  options: string[];
  selected: string[];
  onToggle: (item: string) => void;
}) {
  return (
    <div className="flex flex-wrap gap-2">
      {options.map((option) => {
        const active = selected.includes(option);
        return (
          <button
            key={option}
            type="button"
            onClick={() => onToggle(option)}
            className={`rounded-full border px-3 py-1.5 text-xs font-medium transition-colors ${
              active
                ? 'border-violet-500/40 bg-violet-500/15 text-violet-200'
                : 'border-neutral-700 bg-neutral-900 text-neutral-400 hover:border-neutral-500 hover:text-neutral-200'
            }`}
          >
            {option}
          </button>
        );
      })}
    </div>
  );
}
