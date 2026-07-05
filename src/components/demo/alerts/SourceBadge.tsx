interface SourceBadgeProps {
  source: string;
}

export function SourceBadge({ source }: SourceBadgeProps) {
  return (
    <span className="inline-flex items-center gap-1 rounded-full border border-neutral-800 bg-black/40 px-2 py-0.5 text-[11px] text-neutral-400">
      <span className="h-1 w-1 shrink-0 rounded-full bg-emerald-400" />
      {source}
    </span>
  );
}
