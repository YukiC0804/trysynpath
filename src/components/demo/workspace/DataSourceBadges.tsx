import { Database } from 'lucide-react';

interface DataSourceBadgesProps {
  sources: string[];
}

export function DataSourceBadges({ sources }: DataSourceBadgesProps) {
  return (
    <div className="flex flex-wrap items-center gap-2">
      <span className="flex items-center gap-1 text-[10px] uppercase tracking-wider text-neutral-500">
        <Database className="h-3 w-3" />
        Data used
      </span>
      {sources.map((source) => (
        <span
          key={source}
          className="inline-flex items-center gap-1 rounded-full border border-neutral-800 bg-black/40 px-2 py-0.5 text-[11px] text-neutral-400"
        >
          <span className="h-1 w-1 rounded-full bg-emerald-400" />
          {source}
        </span>
      ))}
    </div>
  );
}
