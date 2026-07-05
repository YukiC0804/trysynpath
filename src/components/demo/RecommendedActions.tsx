import { ArrowRight } from 'lucide-react';

interface RecommendedActionsProps {
  actions: string[];
  title?: string;
}

export function RecommendedActions({ actions, title = 'Recommended actions' }: RecommendedActionsProps) {
  return (
    <div className="rounded-xl border border-neutral-800 bg-neutral-900/50 p-4 sm:p-5">
      <p className="mb-3 text-[10px] font-semibold uppercase tracking-wider text-neutral-500">{title}</p>
      <ol className="space-y-2">
        {actions.map((action, index) => (
          <li
            key={action}
            className="flex items-start gap-3 rounded-lg border border-neutral-800 bg-black/30 px-3 py-2.5 text-sm text-neutral-300"
          >
            <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-violet-500/15 text-xs font-semibold text-violet-400">
              {index + 1}
            </span>
            <span className="flex-1 pt-0.5">{action}</span>
            <ArrowRight className="mt-0.5 h-4 w-4 shrink-0 text-neutral-600" />
          </li>
        ))}
      </ol>
    </div>
  );
}
