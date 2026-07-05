import { useEffect, useRef, useState } from 'react';
import type { ReactNode } from 'react';
import { SectionHeader } from '../workspace/SectionHeader';
import { WorkspaceSectionScroll } from '../workspace/WorkspaceSectionScroll';
import { EntityCard, CardButton } from '../workspace/EntityCard';
import { DataTable } from '../DataTable';
import { StatusBadge } from '../StatusBadge';
import type { WorkspaceCreatedState } from '../../../types/workspace';

interface AppsSectionProps {
  createdState: WorkspaceCreatedState;
}

export function AppsSection({ createdState }: AppsSectionProps) {
  const [showOrderEntry, setShowOrderEntry] = useState(false);
  const previewRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (createdState.orderEntryPublished) {
      setShowOrderEntry(true);
    }
  }, [createdState.orderEntryPublished]);

  useEffect(() => {
    if (showOrderEntry) {
      previewRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }
  }, [showOrderEntry]);

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
          meta={[
            { label: 'Used by', value: 'Sales, Operations' },
            { label: 'Created by', value: 'AI' },
            { label: 'Last updated', value: 'Today' },
            { label: 'Records this week', value: '18' },
          ]}
          description="Captures new customer orders, checks material availability, validates capacity, and creates production jobs."
          actions={
            <CardButton variant="primary" onClick={() => setShowOrderEntry(true)}>
              Open app
            </CardButton>
          }
        />

        <EntityCard
          title="Shop-floor Issue Logger"
          status={{ label: 'Published', variant: 'healthy' }}
          meta={[
            { label: 'Used by', value: 'Shift Supervisors' },
            { label: 'Records this week', value: '42' },
          ]}
          description="Logs production issues, downtime, quality concerns, and escalation notes."
          actions={<CardButton variant="primary">Open app</CardButton>}
        />

        <EntityCard
          title="Supplier Delay Tracker"
          status={{ label: 'Published', variant: 'healthy' }}
          meta={[
            { label: 'Used by', value: 'Supply Chain' },
            { label: 'Records this week', value: '11' },
          ]}
          description="Tracks supplier delays and links them to impacted production jobs and customer orders."
          actions={<CardButton variant="primary">Open app</CardButton>}
        />

        <EntityCard
          title="RFQ Intake App"
          status={{ label: createdState.estimatingToolCreated ? 'Published' : 'Draft', variant: createdState.estimatingToolCreated ? 'healthy' : 'neutral' }}
          meta={[
            { label: 'Used by', value: 'Commercial Team' },
            { label: 'Records this week', value: '7' },
          ]}
          description="Captures RFQs, extracts requirements, estimates cost, and generates quote drafts."
          actions={<CardButton variant="primary">Open app</CardButton>}
        />

        {createdState.estimatingToolCreated && (
          <EntityCard
            title="Sensor Module X Estimator"
            highlight
            status={{ label: 'New', variant: 'ai' }}
            meta={[
              { label: 'Created by', value: 'AI · Command Centre' },
              { label: 'Used by', value: 'Commercial Team' },
              { label: 'Last updated', value: 'Just now' },
            ]}
            description="Reusable estimating workflow for Sensor Module X RFQs with BOM, routing, and margin rules."
            actions={<CardButton variant="primary">Open app</CardButton>}
          />
        )}
      </div>

      {showOrderEntry && (
        <div ref={previewRef} className="rounded-xl border border-neutral-800 bg-[#0a0a0a] p-4 sm:p-6">
          <div className="mb-4 flex flex-wrap items-center justify-between gap-2">
            <h3 className="text-lg font-semibold text-white">Order Entry App</h3>
            <StatusBadge variant="healthy">Published</StatusBadge>
          </div>

          <div className="mb-6 grid gap-4 lg:grid-cols-2">
            <div>
              <p className="mb-3 text-[10px] font-semibold uppercase tracking-wider text-neutral-500">Form fields</p>
              <div className="grid grid-cols-2 gap-2">
                {[
                  'Customer',
                  'Product',
                  'Quantity',
                  'Required delivery date',
                  'Priority',
                  'Order value',
                  'Special instructions',
                  'Attach drawing/spec',
                  'Sales owner',
                  'Material availability',
                  'Capacity check',
                  'Delivery confidence',
                ].map((field) => (
                  <div key={field} className="rounded-lg border border-neutral-800 bg-neutral-900/50 px-2.5 py-2">
                    <p className="text-[10px] text-neutral-500">{field}</p>
                  </div>
                ))}
              </div>
            </div>

            <div>
              <p className="mb-3 text-[10px] font-semibold uppercase tracking-wider text-neutral-500">Automation rules</p>
              <ul className="space-y-2 text-xs text-neutral-300">
                {[
                  'If priority is High, notify Operations Director',
                  'If materials are unavailable, create purchase request',
                  'If capacity is constrained, suggest alternative delivery date',
                  'If order value exceeds £50,000, request manager approval',
                  'When order is approved, create production job automatically',
                ].map((rule, i) => (
                  <li key={rule} className="flex gap-2 rounded-lg border border-neutral-800 bg-black/30 px-3 py-2">
                    <span className="font-semibold text-violet-400">R{i + 1}</span>
                    {rule}
                  </li>
                ))}
              </ul>
            </div>
          </div>

          <p className="mb-3 text-[10px] font-semibold uppercase tracking-wider text-neutral-500">Recent records</p>
          <DataTable
            columns={[
              { key: 'customer', header: 'Customer', className: 'text-white' },
              { key: 'product', header: 'Product' },
              { key: 'qty', header: 'Qty', align: 'right' },
              { key: 'due', header: 'Due' },
              { key: 'priority', header: 'Priority' },
              { key: 'value', header: 'Value', align: 'right' },
              { key: 'status', header: 'Status' },
            ]}
            rows={[
              {
                customer: 'Bosch',
                product: 'Aluminium Casing A',
                qty: '600',
                due: '12 Jul',
                priority: <StatusBadge variant="danger">High</StatusBadge>,
                value: '£84,000',
                status: <span className="text-red-400">At risk</span>,
              },
              {
                customer: 'Siemens',
                product: 'Sensor Module X',
                qty: '300',
                due: '15 Jul',
                priority: <StatusBadge variant="danger">High</StatusBadge>,
                value: '£72,000',
                status: <span className="text-amber-400">Medium confidence</span>,
              },
              {
                customer: 'ABB',
                product: 'PCB Assembly B',
                qty: '500',
                due: '17 Jul',
                priority: <StatusBadge variant="warning">Medium</StatusBadge>,
                value: '£65,000',
                status: <span className="text-emerald-400">On track</span>,
              },
              {
                customer: 'Honeywell',
                product: 'Control Housing C',
                qty: '250',
                due: '22 Jul',
                priority: <StatusBadge variant="neutral">Low</StatusBadge>,
                value: '£31,000',
                status: <span className="text-emerald-400">On track</span>,
              },
            ]}
            minWidth="720px"
          />
        </div>
      )}
      </div>
    </WorkspaceSectionScroll>
  );
}
