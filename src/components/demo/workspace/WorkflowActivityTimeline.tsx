interface WorkflowActivityTimelineProps {
  entries: string[];
  title?: string;
}

export function WorkflowActivityTimeline({
  entries,
  title = 'Activity timeline',
}: WorkflowActivityTimelineProps) {
  return (
    <div className="rounded-xl border border-neutral-800 bg-neutral-900/40 p-4">
      <p className="mb-3 text-[10px] font-semibold uppercase tracking-wider text-neutral-500">{title}</p>
      <ul className="space-y-1.5">
        {entries.map((entry) => (
          <li key={entry} className="flex gap-2 text-xs text-neutral-400">
            <span className="shrink-0 text-neutral-600">•</span>
            <span>{entry}</span>
          </li>
        ))}
      </ul>
    </div>
  );
}
