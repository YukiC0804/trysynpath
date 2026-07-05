import { ArrowRight } from 'lucide-react';
import type { OperationalAlert } from '../../../data/demoAlerts';
import { AlertSeverityBadge } from './AlertSeverityBadge';
import { SourceBadge } from './SourceBadge';

interface AlertCardProps {
  alert: OperationalAlert;
  selected?: boolean;
  onSelect: () => void;
  onRunWorkflow: () => void;
}

export function AlertCard({ alert, selected, onSelect, onRunWorkflow }: AlertCardProps) {
  return (
    <article
      role="button"
      tabIndex={0}
      onClick={onSelect}
      onKeyDown={(e) => {
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault();
          onSelect();
        }
      }}
      className={`cursor-pointer rounded-xl border p-4 transition-colors ${
        selected
          ? 'border-violet-500/40 bg-violet-500/5'
          : 'border-neutral-800 bg-[#0a0a0a] hover:border-neutral-700 hover:bg-neutral-900/40'
      }`}
    >
      <div className="mb-3 flex flex-wrap items-center gap-2">
        <SourceBadge source={alert.source} />
        <AlertSeverityBadge severity={alert.severity} />
        <span className="ml-auto text-[10px] text-neutral-500">{alert.timestamp}</span>
      </div>

      <h3 className="mb-1 text-sm font-semibold text-white">{alert.title}</h3>
      <p className="mb-2 text-[11px] text-neutral-500">{alert.businessObjects}</p>
      <p className="mb-2 text-xs text-neutral-400">{alert.detectedSignal}</p>
      <p className="mb-3 text-xs font-medium text-amber-400/90">{alert.businessImpact}</p>

      <div className="mb-3 rounded-lg border border-neutral-800 bg-black/40 px-3 py-2">
        <p className="mb-1 text-[10px] uppercase tracking-wider text-neutral-600">Suggested workflow</p>
        <p className="text-xs text-neutral-300">&ldquo;{alert.suggestedPrompt}&rdquo;</p>
      </div>

      <button
        type="button"
        onClick={(e) => {
          e.stopPropagation();
          onRunWorkflow();
        }}
        className="inline-flex w-full items-center justify-center gap-1.5 rounded-lg bg-white px-3 py-2 text-xs font-medium text-black transition-colors hover:bg-neutral-200 sm:w-auto"
      >
        {alert.buttonLabel}
        <ArrowRight className="h-3.5 w-3.5" />
      </button>
    </article>
  );
}
