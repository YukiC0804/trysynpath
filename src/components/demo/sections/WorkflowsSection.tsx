import { useCallback, useState } from 'react';
import { GripVertical } from 'lucide-react';
import { SectionHeader } from '../workspace/SectionHeader';
import { WorkspaceSectionScroll } from '../workspace/WorkspaceSectionScroll';
import { EntityCard, CardButton } from '../workspace/EntityCard';
import { DataTable } from '../DataTable';
import { StatusBadge } from '../StatusBadge';
import {
  ModalButton,
  ModalSection,
  WorkspaceModal,
  modalInputClassName,
} from '../interactive/WorkspaceModal';
import { RunStepper } from '../interactive/RunStepper';
import { WORKFLOW_DEFINITIONS, type WorkflowId } from '../../../data/demoInteractiveData';

interface WorkflowsSectionProps {
  onRunPrompt?: (prompt: string) => void;
  showToast?: (message: string) => void;
}

type WorkflowModal = 'view' | 'run' | 'edit-steps' | null;

interface WorkflowStep {
  id: string;
  name: string;
  enabled: boolean;
}

export function WorkflowsSection({ onRunPrompt, showToast }: WorkflowsSectionProps) {
  const [modal, setModal] = useState<WorkflowModal>(null);
  const [selected, setSelected] = useState<WorkflowId | null>(null);
  const [stepsByWorkflow, setStepsByWorkflow] = useState<Record<WorkflowId, WorkflowStep[]>>(() =>
    Object.fromEntries(
      Object.entries(WORKFLOW_DEFINITIONS).map(([id, def]) => [
        id,
        def.steps.map((name, index) => ({
          id: `${id}-${index}`,
          name,
          enabled: true,
        })),
      ]),
    ) as Record<WorkflowId, WorkflowStep[]>,
  );
  const [draftSteps, setDraftSteps] = useState<WorkflowStep[]>([]);
  const [newStepName, setNewStepName] = useState('');
  const [running, setRunning] = useState(false);
  const [runComplete, setRunComplete] = useState(false);

  const open = (id: WorkflowId, type: WorkflowModal) => {
    setSelected(id);
    setModal(type);
    setRunComplete(false);
    setRunning(type === 'run');
    if (type === 'edit-steps') {
      setDraftSteps(stepsByWorkflow[id].map((s) => ({ ...s })));
    }
  };

  const closeModal = () => {
    setModal(null);
    setSelected(null);
    setRunning(false);
    setRunComplete(false);
    setNewStepName('');
  };

  const workflow = selected ? WORKFLOW_DEFINITIONS[selected] : null;

  const handleRunComplete = useCallback(() => {
    setRunning(false);
    setRunComplete(true);
    showToast?.('Workflow run complete.');
  }, [showToast]);

  const workflowStepsPreview = (id: WorkflowId) => (
    <ol className="mt-2 space-y-1">
      {stepsByWorkflow[id]
        .filter((s) => s.enabled)
        .map((step, i) => (
          <li key={step.id} className="flex gap-2 text-xs text-neutral-400">
            <span className="font-medium text-neutral-500">{i + 1}.</span>
            {step.name}
          </li>
        ))}
    </ol>
  );

  const workflowActions = (id: WorkflowId, primaryLabel = 'Run') => (
    <>
      <CardButton onClick={() => open(id, 'view')}>View</CardButton>
      <CardButton variant="primary" onClick={() => open(id, 'run')}>
        {primaryLabel}
      </CardButton>
      <CardButton onClick={() => open(id, 'edit-steps')}>Edit Steps</CardButton>
    </>
  );

  return (
    <WorkspaceSectionScroll>
      <div className="mx-auto max-w-6xl px-4 py-6 sm:px-6">
        <SectionHeader
          title="Workflows"
          subtitle="Operational workflows created in natural language and connected to manufacturing systems."
        />

        <div className="mb-8 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          <EntityCard
            title="RFQ to Quote Workflow"
            status={{ label: 'Active', variant: 'healthy' }}
            meta={[
              { label: 'Trigger', value: 'New RFQ received' },
              { label: 'Last run', value: 'Today 09:12' },
              { label: 'Last result', value: 'Quote draft generated for Schneider Electric' },
            ]}
            content={workflowStepsPreview('rfq-quote')}
            actions={workflowActions('rfq-quote')}
          />

          <EntityCard
            title="Supplier Expedite Workflow"
            status={{ label: 'Active', variant: 'healthy' }}
            meta={[
              { label: 'Trigger', value: 'High-priority order at risk' },
              { label: 'Last run', value: 'Today 08:03' },
              { label: 'Last result', value: 'Recovery plan generated for Bosch SO-1048' },
            ]}
            content={workflowStepsPreview('urgent-recovery')}
            actions={workflowActions('urgent-recovery')}
          />

          <EntityCard
            title="Breakdown Response Workflow"
            status={{ label: 'Active', variant: 'healthy' }}
            meta={[
              { label: 'Trigger', value: 'Machine downtime exceeds 60 minutes' },
              { label: 'Last run', value: 'Today 06:45' },
              { label: 'Last result', value: 'CNC-04 breakdown response suggested' },
            ]}
            content={workflowStepsPreview('breakdown-response')}
            actions={workflowActions('breakdown-response')}
          />

          <EntityCard
            title="Quote Approval Workflow"
            status={{ label: 'Draft', variant: 'neutral' }}
            meta={[{ label: 'Trigger', value: 'New order submitted' }]}
            content={workflowStepsPreview('order-validation')}
            actions={workflowActions('order-validation', 'Activate')}
          />

          <EntityCard
            title="Acrylic Material Price Update"
            status={{ label: 'Active', variant: 'healthy' }}
            meta={[
              { label: 'Trigger', value: 'Material cost stale > 30 days' },
              { label: 'Last run', value: 'Today 09:15' },
              { label: 'Last result', value: '6mm acrylic updated to $69.80/sheet' },
            ]}
            content={workflowStepsPreview('acrylic-pricing')}
            actions={workflowActions('acrylic-pricing')}
          />

          <EntityCard
            title="Acrylic Inventory Management"
            status={{ label: 'Active', variant: 'warning' }}
            meta={[
              { label: 'Trigger', value: 'Upcoming acrylic orders' },
              { label: 'Last run', value: 'Today 10:08' },
              { label: 'Last result', value: '6mm shortage flagged — purchase recommended' },
            ]}
            content={workflowStepsPreview('acrylic-inventory')}
            actions={workflowActions('acrylic-inventory')}
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
                time: '10:08',
                workflow: 'Acrylic Inventory',
                trigger: 'Orders #1048, #1052, #1057 scanned',
                result: 'Purchase recommendation prepared',
                status: <StatusBadge variant="warning">Awaiting approval</StatusBadge>,
              },
              {
                time: '09:15',
                workflow: 'Acrylic Price Update',
                trigger: '6mm acrylic cost stale 5 days',
                result: 'Material cost updated to $69.80',
                status: <StatusBadge variant="warning">Awaiting approval</StatusBadge>,
              },
              {
                time: '09:12',
                workflow: 'RFQ to Quote',
                trigger: 'New RFQ from Schneider Electric',
                result: 'Quote draft generated',
                status: <StatusBadge variant="healthy">Completed</StatusBadge>,
              },
              {
                time: '08:03',
                workflow: 'Supplier Expedite',
                trigger: 'Bosch SO-1048 flagged high risk',
                result: 'Recovery plan generated',
                status: <StatusBadge variant="healthy">Completed</StatusBadge>,
              },
              {
                time: '06:45',
                workflow: 'Breakdown Response',
                trigger: 'CNC-04 downtime > 60 min',
                result: 'Reschedule suggested',
                status: <StatusBadge variant="healthy">Completed</StatusBadge>,
              },
            ]}
            minWidth="680px"
          />
        </div>
      </div>

      <WorkspaceModal
        open={modal === 'view' && !!workflow}
        onClose={closeModal}
        title={workflow?.title ?? ''}
        subtitle="Workflow definition and connected systems"
        footer={
          <>
            <ModalButton variant="primary" onClick={() => selected && open(selected, 'run')}>
              Run workflow
            </ModalButton>
            <ModalButton onClick={() => selected && open(selected, 'edit-steps')}>Edit Steps</ModalButton>
            <ModalButton onClick={closeModal}>Close</ModalButton>
          </>
        }
      >
        {workflow && selected && (
          <>
            <ModalSection title="Steps">
              <ol className="space-y-2">
                {stepsByWorkflow[selected]
                  .filter((s) => s.enabled)
                  .map((step, index) => (
                    <li
                      key={step.id}
                      className="flex gap-2 rounded-lg border border-neutral-800 bg-neutral-900/40 px-3 py-2 text-sm text-neutral-300"
                    >
                      <span className="font-medium text-neutral-500">{index + 1}.</span>
                      {step.name}
                    </li>
                  ))}
              </ol>
            </ModalSection>
            <ModalSection title="Connected systems">
              <div className="flex flex-wrap gap-2">
                {workflow.connectedSystems.map((system) => (
                  <span
                    key={system}
                    className="rounded-full border border-neutral-700 bg-neutral-900 px-2.5 py-1 text-xs text-neutral-300"
                  >
                    {system}
                  </span>
                ))}
              </div>
            </ModalSection>
          </>
        )}
      </WorkspaceModal>

      <WorkspaceModal
        open={modal === 'run' && !!workflow}
        onClose={closeModal}
        title={runComplete ? 'Workflow run complete' : `Running ${workflow?.title ?? ''}`}
        subtitle={runComplete ? 'Result ready for review.' : 'Executing workflow steps across connected systems...'}
        footer={
          runComplete ? (
            <>
              {workflow?.commandCentrePrompt && (
                <ModalButton
                  variant="primary"
                  onClick={() => {
                    onRunPrompt?.(workflow.commandCentrePrompt!);
                    closeModal();
                  }}
                >
                  Open quote in Command Centre
                </ModalButton>
              )}
              <ModalButton onClick={closeModal}>Close</ModalButton>
            </>
          ) : (
            <ModalButton onClick={closeModal}>Cancel</ModalButton>
          )
        }
      >
        {workflow &&
          (runComplete ? (
            <p className="rounded-lg border border-emerald-500/20 bg-emerald-500/5 px-4 py-3 text-sm text-emerald-100">
              {workflow.runResult}
            </p>
          ) : (
            <RunStepper steps={workflow.runSteps} running={running} onComplete={handleRunComplete} />
          ))}
      </WorkspaceModal>

      <WorkspaceModal
        open={modal === 'edit-steps' && !!workflow && !!selected}
        onClose={closeModal}
        title="Edit Workflow Steps"
        subtitle="Enable, rename, or add steps to this workflow."
        footer={
          <>
            <ModalButton onClick={closeModal}>Cancel</ModalButton>
            <ModalButton
              variant="primary"
              onClick={() => {
                if (!selected) return;
                setStepsByWorkflow((prev) => ({ ...prev, [selected]: draftSteps }));
                showToast?.('Workflow steps updated.');
                closeModal();
              }}
            >
              Save Workflow
            </ModalButton>
          </>
        }
      >
        <div className="space-y-2">
          {draftSteps.map((step) => (
            <div
              key={step.id}
              className="flex items-center gap-2 rounded-lg border border-neutral-800 bg-neutral-900/40 px-3 py-2"
            >
              <GripVertical className="h-4 w-4 shrink-0 text-neutral-600" />
              <input
                type="checkbox"
                checked={step.enabled}
                onChange={(e) =>
                  setDraftSteps((prev) =>
                    prev.map((s) => (s.id === step.id ? { ...s, enabled: e.target.checked } : s)),
                  )
                }
                className="accent-violet-500"
              />
              <input
                className={`${modalInputClassName()} flex-1`}
                value={step.name}
                onChange={(e) =>
                  setDraftSteps((prev) =>
                    prev.map((s) => (s.id === step.id ? { ...s, name: e.target.value } : s)),
                  )
                }
              />
            </div>
          ))}
        </div>
        <div className="mt-4 flex gap-2">
          <input
            className={modalInputClassName()}
            placeholder="New step name"
            value={newStepName}
            onChange={(e) => setNewStepName(e.target.value)}
          />
          <ModalButton
            onClick={() => {
              if (!newStepName.trim() || !selected) return;
              setDraftSteps((prev) => [
                ...prev,
                { id: `${selected}-custom-${Date.now()}`, name: newStepName.trim(), enabled: true },
              ]);
              setNewStepName('');
            }}
          >
            Add Step
          </ModalButton>
        </div>
      </WorkspaceModal>
    </WorkspaceSectionScroll>
  );
}
