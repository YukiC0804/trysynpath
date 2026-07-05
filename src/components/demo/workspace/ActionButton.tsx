import type { ReactNode } from 'react';
import { Check } from 'lucide-react';

interface ActionButtonProps {
  id: string;
  label: string;
  variant?: 'primary' | 'secondary';
  completed?: boolean;
  completedLabel?: string;
  successMessage?: string;
  onClick: (id: string) => void;
}

export function ActionButton({
  id,
  label,
  variant = 'secondary',
  completed = false,
  completedLabel,
  successMessage,
  onClick,
}: ActionButtonProps) {
  if (completed && successMessage) {
    return (
      <div className="inline-flex items-center gap-2 rounded-lg border border-emerald-500/25 bg-emerald-500/10 px-3 py-2 text-xs text-emerald-300">
        <Check className="h-3.5 w-3.5 shrink-0" />
        <span>{successMessage}</span>
      </div>
    );
  }

  if (completed) {
    return (
      <span className="inline-flex items-center gap-1.5 rounded-lg border border-emerald-500/25 bg-emerald-500/10 px-3 py-2 text-xs font-medium text-emerald-400">
        <Check className="h-3.5 w-3.5" />
        {completedLabel ?? 'Done'}
      </span>
    );
  }

  return (
    <button
      type="button"
      onClick={() => onClick(id)}
      className={
        variant === 'primary'
          ? 'rounded-lg bg-white px-4 py-2 text-xs font-semibold text-black transition-colors hover:bg-neutral-200'
          : 'rounded-lg border border-neutral-700 bg-neutral-900 px-4 py-2 text-xs font-medium text-neutral-300 transition-colors hover:border-neutral-500 hover:text-white'
      }
    >
      {label}
    </button>
  );
}

export function ActionButtonGroup({ children }: { children: ReactNode }) {
  return <div className="flex flex-wrap gap-2">{children}</div>;
}

export function InlineArtifact({ title, children }: { title: string; children: ReactNode }) {
  return (
    <div className="rounded-xl border border-violet-500/20 bg-violet-500/5 p-4">
      <p className="mb-3 text-[10px] font-semibold uppercase tracking-wider text-violet-400">{title}</p>
      {children}
    </div>
  );
}
