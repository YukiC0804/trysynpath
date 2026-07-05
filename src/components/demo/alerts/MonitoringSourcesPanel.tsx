import type { MonitoringSource } from '../../../data/demoAlerts';

interface MonitoringSourcesPanelProps {
  sources: MonitoringSource[];
}

export function MonitoringSourcesPanel({ sources }: MonitoringSourcesPanelProps) {
  return (
    <div className="mb-6 rounded-xl border border-neutral-800 bg-[#0a0a0a] p-4">
      <p className="mb-3 text-[10px] font-semibold uppercase tracking-wider text-neutral-500">
        Monitoring sources
      </p>
      <div className="flex flex-wrap gap-2">
        {sources.map((source) => (
          <div
            key={source.id}
            className="flex min-w-[9rem] flex-col gap-0.5 rounded-lg border border-neutral-800 bg-neutral-900/60 px-3 py-2"
          >
            <div className="flex items-center gap-1.5">
              <span className="h-1.5 w-1.5 shrink-0 rounded-full bg-emerald-400" />
              <span className="text-xs font-medium text-white">{source.label}</span>
              <span className="ml-auto rounded-full bg-emerald-500/15 px-1.5 py-0.5 text-[9px] font-medium uppercase tracking-wider text-emerald-400">
                Live
              </span>
            </div>
            {source.sublabel && <p className="text-[10px] text-neutral-500">{source.sublabel}</p>}
          </div>
        ))}
      </div>
    </div>
  );
}
