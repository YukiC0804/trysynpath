import type { ReactNode } from 'react';
import { motion } from 'motion/react';
import { StatusBadge } from '../../demo/StatusBadge';
import {
  STAGE_META,
  statusVariant,
  type CfoStageId,
  type CfoStageStatus,
} from './helpers';

export function WorkflowTimeline({
  activeStage,
  statuses,
  children,
}: {
  activeStage: CfoStageId;
  statuses: Record<CfoStageId, CfoStageStatus>;
  children: Record<CfoStageId, ReactNode>;
}) {
  return (
    <ol className="relative space-y-3">
      {STAGE_META.map((stage, index) => {
        const status = statuses[stage.id];
        const expanded = activeStage === stage.id;
        const completed = status === 'Completed';
        return (
          <li key={stage.id} className="relative pl-10">
            {index < STAGE_META.length - 1 && (
              <span
                aria-hidden
                className={`absolute left-[15px] top-8 h-[calc(100%-8px)] w-px ${
                  completed ? 'bg-emerald-500/50' : 'bg-neutral-800'
                }`}
              />
            )}
            <span
              aria-hidden
              className={`absolute left-1.5 top-2 flex h-6 w-6 items-center justify-center rounded-full border text-[10px] font-semibold ${
                completed
                  ? 'border-emerald-500/60 bg-emerald-500/20 text-emerald-300'
                  : expanded
                    ? 'border-white/40 bg-white text-black'
                    : 'border-neutral-700 bg-[#0a0a0a] text-neutral-500'
              }`}
            >
              {completed ? '✓' : index + 1}
            </span>
            <div
              className={`rounded-xl border transition-colors ${
                expanded
                  ? 'border-neutral-600 bg-[#0c0c0c]'
                  : 'border-neutral-800/80 bg-[#080808]'
              }`}
            >
              <div className="flex flex-wrap items-center justify-between gap-2 px-4 py-3">
                <div>
                  <p className="text-sm font-medium text-white">{stage.label}</p>
                  {!expanded && (
                    <p className="mt-0.5 text-xs text-neutral-500">{stage.title}</p>
                  )}
                </div>
                <StatusBadge variant={statusVariant(status)}>{status}</StatusBadge>
              </div>
              {expanded && (
                <motion.div
                  initial={{ opacity: 0, y: 6 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ duration: 0.25 }}
                  className="border-t border-neutral-800 px-4 py-4"
                >
                  <h3 className="font-display text-base font-semibold text-white">
                    {stage.title}
                  </h3>
                  <div className="mt-4">{children[stage.id]}</div>
                </motion.div>
              )}
            </div>
          </li>
        );
      })}
    </ol>
  );
}
