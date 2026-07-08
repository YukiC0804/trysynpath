import type { ReactNode } from 'react';
import { useState } from 'react';
import { motion } from 'motion/react';
import { StatusBadge } from '../StatusBadge';
import { DataTable } from '../DataTable';
import { ActionButton, ActionButtonGroup } from '../workspace/ActionButton';
import { DataSourceBadges } from '../workspace/DataSourceBadges';
import { WorkflowActivityTimeline } from '../workspace/WorkflowActivityTimeline';
import { DATA_SOURCES_BY_RESULT } from '../../../data/demoWorkspace';
import {
  ACRYLIC_UPCOMING_ORDERS,
  ACRYLIC_INVENTORY_LEVELS,
  ACRYLIC_INVENTORY_RECOMMENDATIONS,
  ACRYLIC_SUPPLIER_QUOTE_SUMMARY,
  ACRYLIC_INVENTORY_SUMMARY,
  ACRYLIC_INVENTORY_EXPLAIN,
  ACRYLIC_INVENTORY_TIMELINE,
} from '../../../data/acrylicDemoData';

interface AcrylicInventoryResultProps {
  completedActions: Set<string>;
  onAction: (id: string) => void;
}

export function AcrylicInventoryResult({ completedActions, onAction }: AcrylicInventoryResultProps) {
  const [showQuotes, setShowQuotes] = useState(false);
  const [showExplain, setShowExplain] = useState(false);

  const handleRequestQuotes = () => {
    setShowQuotes(true);
    onAction('acrylic-request-quotes');
  };

  const handleExplain = () => {
    setShowExplain(true);
    onAction('acrylic-inventory-explain');
  };

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h3 className="text-lg font-semibold text-white">Acrylic Inventory Risk Analysis</h3>
        <StatusBadge variant="warning">2 risks detected</StatusBadge>
      </div>

      <StepCard step={1} title="Upcoming acrylic orders scanned">
        <div className="grid gap-3 sm:grid-cols-3">
          {ACRYLIC_UPCOMING_ORDERS.map((order, i) => (
            <motion.div
              key={order.order}
              initial={{ opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: i * 0.1 }}
              className="rounded-lg border border-neutral-700 bg-neutral-900/60 p-3"
            >
              <p className="text-xs font-semibold text-white">Order {order.order}</p>
              <p className="mt-1 text-[10px] text-neutral-400">{order.product}</p>
              <p className="mt-2 text-xs text-neutral-300">{order.material}</p>
              <p className="mt-1 text-[10px] text-neutral-500">
                {order.sheets} sheets · due in {order.dueDays} days
              </p>
            </motion.div>
          ))}
        </div>
      </StepCard>

      <StepCard step={2} title="Inventory levels checked">
        <div className="space-y-4">
          {ACRYLIC_INVENTORY_LEVELS.map((level, i) => {
            const fillPct = Math.min(100, (level.inStock / (level.required || 1)) * 100);
            const barColor =
              level.risk === 'high' ? 'bg-red-500' : level.risk === 'medium' ? 'bg-amber-500' : 'bg-emerald-500';

            return (
              <motion.div
                key={level.thickness}
                initial={{ opacity: 0, x: -8 }}
                animate={{ opacity: 1, x: 0 }}
                transition={{ delay: i * 0.1 }}
                className="rounded-lg border border-neutral-800 bg-neutral-900/40 p-3"
              >
                <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
                  <p className="text-sm font-medium text-white">{level.thickness}</p>
                  <StatusBadge variant={level.risk === 'high' ? 'danger' : 'warning'}>
                    {level.status}
                  </StatusBadge>
                </div>
                <div className="mb-2 h-2 overflow-hidden rounded-full bg-neutral-800">
                  <motion.div
                    className={`h-full rounded-full ${barColor}`}
                    initial={{ width: 0 }}
                    animate={{ width: `${fillPct}%` }}
                    transition={{ duration: 0.8, delay: 0.2 + i * 0.1 }}
                  />
                </div>
                <div className="grid gap-1 text-[10px] text-neutral-400 sm:grid-cols-2">
                  <span>In stock: {level.inStock} sheets</span>
                  <span>Required: {level.required} sheets</span>
                  {'shortage' in level && level.shortage != null && (
                    <span className="text-red-400">Shortage: {level.shortage} sheets</span>
                  )}
                  {'remaining' in level && level.remaining != null && (
                    <span>Remaining after order: {level.remaining} sheets</span>
                  )}
                  <span>Reorder threshold: {level.reorderThreshold} sheets</span>
                </div>
              </motion.div>
            );
          })}
        </div>
      </StepCard>

      <StepCard step={3} title="Inventory risks flagged">
        <div className="space-y-2">
          <RiskRow
            severity="high"
            label="6mm clear acrylic shortage of 60 sheets for Order #1052"
          />
          <RiskRow
            severity="medium"
            label="3mm clear acrylic will fall below reorder threshold after Order #1048"
          />
          <RiskRow
            severity="medium"
            label="10mm clear acrylic will fall below reorder threshold after Order #1057"
          />
        </div>
      </StepCard>

      <StepCard step={4} title="Replenishment recommendations">
        <ol className="space-y-3">
          {ACRYLIC_INVENTORY_RECOMMENDATIONS.map((rec, i) => (
            <motion.li
              key={rec.material}
              initial={{ opacity: 0, x: -8 }}
              animate={{ opacity: 1, x: 0 }}
              transition={{ delay: i * 0.1 }}
              className="rounded-lg border border-neutral-700 bg-neutral-900/60 px-3 py-2.5 text-sm"
            >
              <span className="font-medium text-violet-300">{rec.material}: </span>
              <span className="text-neutral-300">{rec.text}</span>
            </motion.li>
          ))}
        </ol>
      </StepCard>

      <StepCard step={5} title="Link to supplier pricing">
        <ActionButton
          id="acrylic-request-quotes"
          label="Request Acrylic Supplier Quotes"
          variant="primary"
          completed={showQuotes}
          completedLabel="Quotes Requested"
          onClick={handleRequestQuotes}
        />
        {showQuotes && (
          <motion.div
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            className="mt-3 space-y-3"
          >
            <p className="text-sm text-neutral-300">
              Synpath will request updated pricing for 3mm, 6mm, and 10mm clear acrylic sheets from approved
              suppliers.
            </p>
            <DataTable
              columns={[
                { key: 'material', header: 'Material', className: 'text-white' },
                { key: 'supplier', header: 'Recommended supplier' },
                { key: 'price', header: 'Unit price' },
                { key: 'lead', header: 'Lead time' },
                { key: 'qty', header: 'Suggested order qty' },
              ]}
              rows={ACRYLIC_SUPPLIER_QUOTE_SUMMARY.map((row) => ({
                material: row.material,
                supplier: row.supplier,
                price: row.price,
                lead: row.lead,
                qty: row.qty,
              }))}
              minWidth="560px"
            />
          </motion.div>
        )}
      </StepCard>

      <StepCard step={6} title="Purchase recommendation summary">
        <div className="rounded-lg border border-neutral-700 bg-neutral-900/60 px-4 py-3 text-sm leading-relaxed text-neutral-300 whitespace-pre-line">
          {ACRYLIC_INVENTORY_SUMMARY}
        </div>
        <ActionButtonGroup>
          <ActionButton
            id="acrylic-approve-purchase"
            label="Approve Purchase Recommendation"
            variant="primary"
            completed={completedActions.has('acrylic-approve-purchase')}
            completedLabel="Approved"
            onClick={onAction}
          />
          <ActionButton
            id="acrylic-edit-quantities"
            label="Edit Order Quantities"
            completed={completedActions.has('acrylic-edit-quantities')}
            completedLabel="Editor Opened"
            onClick={onAction}
          />
          <ActionButton
            id="acrylic-inventory-explain"
            label="Ask AI Why"
            completed={showExplain}
            completedLabel="Explained"
            onClick={handleExplain}
          />
        </ActionButtonGroup>
        {showExplain && (
          <motion.div
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            className="mt-3 rounded-lg border border-violet-500/25 bg-violet-500/10 px-4 py-3 text-sm text-neutral-200"
          >
            {ACRYLIC_INVENTORY_EXPLAIN}
          </motion.div>
        )}
      </StepCard>

      <WorkflowActivityTimeline entries={ACRYLIC_INVENTORY_TIMELINE} />
      <DataSourceBadges sources={DATA_SOURCES_BY_RESULT['acrylic-inventory']} />
    </div>
  );
}

function StepCard({
  step,
  title,
  children,
}: {
  step: number;
  title: string;
  children: ReactNode;
}) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay: step * 0.04 }}
      className="rounded-xl border border-neutral-800 bg-[#0a0a0a] p-4"
    >
      <p className="mb-3 text-[10px] font-semibold uppercase tracking-wider text-violet-400">
        Step {step} — {title}
      </p>
      <div className="space-y-3">{children}</div>
    </motion.div>
  );
}

function RiskRow({ severity, label }: { severity: 'high' | 'medium'; label: string }) {
  return (
    <div
      className={`rounded-lg border px-3 py-2.5 text-xs ${
        severity === 'high'
          ? 'border-red-500/30 bg-red-500/10 text-red-300'
          : 'border-amber-500/30 bg-amber-500/10 text-amber-300'
      }`}
    >
      <span className="font-semibold uppercase">{severity === 'high' ? 'High risk' : 'Medium risk'}: </span>
      {label}
    </div>
  );
}
