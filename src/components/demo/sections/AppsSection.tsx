import { useState } from 'react';
import { SectionHeader } from '../workspace/SectionHeader';
import { WorkspaceSectionScroll } from '../workspace/WorkspaceSectionScroll';
import { EntityCard, CardButton } from '../workspace/EntityCard';
import {
  ModalButton,
  ModalField,
  ModalSection,
  WorkspaceModal,
  modalInputClassName,
  modalSelectClassName,
} from '../interactive/WorkspaceModal';
import { APP_FIELD_OPTIONS, APP_RULE_TOGGLES, type AppId } from '../../../data/demoInteractiveData';
import type { WorkspaceCreatedState } from '../../../types/workspace';

interface AppsSectionProps {
  createdState: WorkspaceCreatedState;
  showToast?: (message: string) => void;
}

type AppModal = 'open' | 'edit-fields' | 'edit-rules' | null;

const APP_META: Record<AppId, { title: string; description: string; meta: { label: string; value: string }[] }> = {
  'order-entry': {
    title: 'Order Entry App',
    description: 'Captures new customer orders, checks material availability, validates capacity, and creates production jobs.',
    meta: [
      { label: 'Used by', value: 'Sales, Operations' },
      { label: 'Records this week', value: '18' },
    ],
  },
  'shop-floor-logger': {
    title: 'Shop-floor Issue Logger',
    description: 'Logs production issues, downtime, quality concerns, and escalation notes.',
    meta: [{ label: 'Used by', value: 'Shift Supervisors' }, { label: 'Records this week', value: '42' }],
  },
  'supplier-delay': {
    title: 'Supplier Expedite Request App',
    description: 'Tracks supplier delays and creates expedite requests for impacted production jobs.',
    meta: [{ label: 'Used by', value: 'Supply Chain' }, { label: 'Records this week', value: '11' }],
  },
  'rfq-intake': {
    title: 'RFQ Intake App',
    description: 'Captures RFQs, extracts requirements, estimates cost, and generates quote drafts.',
    meta: [{ label: 'Used by', value: 'Commercial Team' }, { label: 'Records this week', value: '7' }],
  },
  'sensor-estimator': {
    title: 'Sensor Module X Estimator',
    description: 'Reusable estimating workflow for Sensor Module X RFQs with BOM, routing, and margin rules.',
    meta: [{ label: 'Used by', value: 'Commercial Team' }, { label: 'Last updated', value: 'Just now' }],
  },
};

export function AppsSection({ createdState, showToast }: AppsSectionProps) {
  const [modal, setModal] = useState<AppModal>(null);
  const [selected, setSelected] = useState<AppId | null>(null);
  const [fields, setFields] = useState<string[]>(APP_FIELD_OPTIONS);
  const [rules, setRules] = useState<string[]>(APP_RULE_TOGGLES);
  const [approvalThreshold, setApprovalThreshold] = useState(50000);
  const [testResult, setTestResult] = useState<string | null>(null);
  const [form, setForm] = useState({
    customer: 'Bosch',
    product: 'Aluminium Casing A',
    quantity: '600',
    deliveryDate: '2026-07-12',
    priority: 'High',
    salesOwner: 'James Reid',
    instructions: 'Expedite if material shortage detected',
  });

  const open = (id: AppId, type: AppModal) => {
    setSelected(id);
    setModal(type);
    setTestResult(null);
  };

  const closeModal = () => {
    setModal(null);
    setSelected(null);
    setTestResult(null);
  };

  const app = selected ? APP_META[selected] : null;

  const appActions = (id: AppId) => (
    <>
      <CardButton variant="primary" onClick={() => open(id, 'open')}>
        Open
      </CardButton>
      <CardButton onClick={() => open(id, 'edit-fields')}>Edit Fields</CardButton>
      <CardButton onClick={() => open(id, 'edit-rules')}>Edit Rules</CardButton>
    </>
  );

  return (
    <WorkspaceSectionScroll>
      <div className="mx-auto max-w-6xl px-4 py-6 sm:px-6">
        <SectionHeader
          title="Apps"
          subtitle="Internal manufacturing apps generated from natural-language requests."
        />

        <div className="mb-8 grid gap-4 sm:grid-cols-2">
          <EntityCard
            title="Order Entry App"
            highlight={createdState.orderEntryPublished}
            status={{ label: 'Published', variant: 'healthy' }}
            meta={APP_META['order-entry'].meta}
            description={APP_META['order-entry'].description}
            actions={appActions('order-entry')}
          />

          <EntityCard
            title="Shop-floor Issue Logger"
            status={{ label: 'Published', variant: 'healthy' }}
            meta={APP_META['shop-floor-logger'].meta}
            description={APP_META['shop-floor-logger'].description}
            actions={appActions('shop-floor-logger')}
          />

          <EntityCard
            title="Supplier Expedite Request App"
            status={{ label: 'Published', variant: 'healthy' }}
            meta={APP_META['supplier-delay'].meta}
            description={APP_META['supplier-delay'].description}
            actions={appActions('supplier-delay')}
          />

          <EntityCard
            title="RFQ Intake App"
            status={{
              label: createdState.estimatingToolCreated ? 'Published' : 'Draft',
              variant: createdState.estimatingToolCreated ? 'healthy' : 'neutral',
            }}
            meta={APP_META['rfq-intake'].meta}
            description={APP_META['rfq-intake'].description}
            actions={appActions('rfq-intake')}
          />

          {createdState.estimatingToolCreated && (
            <EntityCard
              title="Sensor Module X Estimator"
              highlight
              status={{ label: 'New', variant: 'ai' }}
              meta={APP_META['sensor-estimator'].meta}
              description={APP_META['sensor-estimator'].description}
              actions={appActions('sensor-estimator')}
            />
          )}
        </div>
      </div>

      <WorkspaceModal
        open={modal === 'open' && !!app}
        onClose={closeModal}
        title={app?.title ?? ''}
        subtitle="App preview with system validation checks"
        size="lg"
        footer={
          <>
            <ModalButton
              variant="primary"
              onClick={() =>
                setTestResult(
                  'Test order validated. Material shortage detected for Aluminium Casing Blanks. Suggested delivery date: 15 Jul.',
                )
              }
            >
              Submit test order
            </ModalButton>
            <ModalButton onClick={() => selected && open(selected, 'edit-fields')}>Edit fields</ModalButton>
            <ModalButton onClick={closeModal}>Close</ModalButton>
          </>
        }
      >
        {selected === 'order-entry' ? (
          <>
            <div className="grid gap-3 sm:grid-cols-2">
              <ModalField label="Customer">
                <input className={modalInputClassName()} value={form.customer} onChange={(e) => setForm({ ...form, customer: e.target.value })} />
              </ModalField>
              <ModalField label="Product">
                <input className={modalInputClassName()} value={form.product} onChange={(e) => setForm({ ...form, product: e.target.value })} />
              </ModalField>
              <ModalField label="Quantity">
                <input className={modalInputClassName()} value={form.quantity} onChange={(e) => setForm({ ...form, quantity: e.target.value })} />
              </ModalField>
              <ModalField label="Required delivery date">
                <input type="date" className={modalInputClassName()} value={form.deliveryDate} onChange={(e) => setForm({ ...form, deliveryDate: e.target.value })} />
              </ModalField>
              <ModalField label="Priority">
                <select className={modalSelectClassName()} value={form.priority} onChange={(e) => setForm({ ...form, priority: e.target.value })}>
                  <option>High</option>
                  <option>Medium</option>
                  <option>Low</option>
                </select>
              </ModalField>
              <ModalField label="Sales owner">
                <input className={modalInputClassName()} value={form.salesOwner} onChange={(e) => setForm({ ...form, salesOwner: e.target.value })} />
              </ModalField>
            </div>
            <ModalField label="Special instructions">
              <textarea className={`${modalInputClassName()} min-h-20`} value={form.instructions} onChange={(e) => setForm({ ...form, instructions: e.target.value })} />
            </ModalField>
            <ModalSection title="System checks">
              <ul className="space-y-2 text-sm text-neutral-300">
                <li className="rounded-lg border border-amber-500/20 bg-amber-500/5 px-3 py-2">Material availability · Shortage detected</li>
                <li className="rounded-lg border border-neutral-800 bg-neutral-900/40 px-3 py-2">Capacity check · Line 3 constrained</li>
                <li className="rounded-lg border border-neutral-800 bg-neutral-900/40 px-3 py-2">Delivery confidence · Medium</li>
                <li className="rounded-lg border border-neutral-800 bg-neutral-900/40 px-3 py-2">Manager approval · Not required</li>
              </ul>
            </ModalSection>
            {testResult && (
              <p className="mt-3 rounded-lg border border-emerald-500/20 bg-emerald-500/5 px-3 py-2 text-sm text-emerald-200">
                {testResult}
              </p>
            )}
          </>
        ) : (
          <p className="text-sm text-neutral-400">
            {app?.description} Preview form opens with the same validation pipeline as Order Entry App.
          </p>
        )}
      </WorkspaceModal>

      <WorkspaceModal
        open={modal === 'edit-fields' && !!app}
        onClose={closeModal}
        title="Edit App Fields"
        subtitle="Choose which fields appear in the app form."
        footer={
          <>
            <ModalButton onClick={closeModal}>Cancel</ModalButton>
            <ModalButton
              variant="primary"
              onClick={() => {
                showToast?.('App fields updated.');
                closeModal();
              }}
            >
              Save Fields
            </ModalButton>
          </>
        }
      >
        <div className="grid gap-2 sm:grid-cols-2">
          {APP_FIELD_OPTIONS.map((field) => (
            <label key={field} className="flex items-center gap-2 rounded-lg border border-neutral-800 bg-neutral-900/40 px-3 py-2 text-sm text-neutral-300">
              <input
                type="checkbox"
                checked={fields.includes(field)}
                onChange={() =>
                  setFields((prev) =>
                    prev.includes(field) ? prev.filter((f) => f !== field) : [...prev, field],
                  )
                }
                className="accent-violet-500"
              />
              {field}
            </label>
          ))}
        </div>
      </WorkspaceModal>

      <WorkspaceModal
        open={modal === 'edit-rules' && !!app}
        onClose={closeModal}
        title="Edit App Rules"
        subtitle="Automation rules applied when orders are submitted."
        footer={
          <>
            <ModalButton onClick={closeModal}>Cancel</ModalButton>
            <ModalButton
              variant="primary"
              onClick={() => {
                showToast?.(`${app?.title ?? 'App'} rules updated.`);
                closeModal();
              }}
            >
              Save Rules
            </ModalButton>
          </>
        }
      >
        <div className="space-y-2">
          {APP_RULE_TOGGLES.map((rule) => (
            <label key={rule} className="flex items-start gap-2 rounded-lg border border-neutral-800 bg-neutral-900/40 px-3 py-2 text-sm text-neutral-300">
              <input
                type="checkbox"
                checked={rules.includes(rule)}
                onChange={() =>
                  setRules((prev) =>
                    prev.includes(rule) ? prev.filter((r) => r !== rule) : [...prev, rule],
                  )
                }
                className="mt-0.5 accent-violet-500"
              />
              {rule}
            </label>
          ))}
        </div>
        <ModalField label="Order value approval threshold">
          <input
            type="number"
            className={modalInputClassName()}
            value={approvalThreshold}
            onChange={(e) => setApprovalThreshold(Number(e.target.value) || 0)}
          />
        </ModalField>
      </WorkspaceModal>
    </WorkspaceSectionScroll>
  );
}
