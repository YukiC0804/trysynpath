import type { ReactNode } from 'react';
import { StatusBadge } from '../StatusBadge';
import type { StatusVariant } from '../../../types/status';

interface EntityCardProps {
  title: string;
  status?: { label: string; variant: StatusVariant };
  meta?: { label: string; value: string }[];
  description?: string;
  content?: ReactNode;
  metrics?: { label: string; value: string; valueClassName?: string }[];
  actions?: ReactNode;
  highlight?: boolean;
}

export function EntityCard({
  title,
  status,
  meta,
  description,
  content,
  metrics,
  actions,
  highlight,
}: EntityCardProps) {
  return (
    <div
      className={`flex h-full flex-col rounded-xl border bg-neutral-900/50 p-4 transition-colors ${
        highlight ? 'border-violet-500/30 bg-violet-500/5' : 'border-neutral-800'
      }`}
    >
      <div className="mb-3 flex flex-wrap items-start justify-between gap-2">
        <h3 className="text-sm font-semibold text-white">{title}</h3>
        {status && <StatusBadge variant={status.variant}>{status.label}</StatusBadge>}
      </div>

      {meta && meta.length > 0 && (
        <div className="mb-3 space-y-1">
          {meta.map((m) => (
            <p key={m.label} className="text-xs text-neutral-400">
              <span className="text-neutral-500">{m.label}:</span>{' '}
              <span className="text-neutral-300">{m.value}</span>
            </p>
          ))}
        </div>
      )}

      {description && <p className="mb-3 text-xs leading-relaxed text-neutral-400">{description}</p>}

      {metrics && metrics.length > 0 && (
        <div className="mb-3 grid grid-cols-2 gap-2">
          {metrics.map((m) => (
            <div key={m.label} className="rounded-lg border border-neutral-800 bg-black/30 px-2.5 py-2">
              <p className="text-[10px] uppercase tracking-wider text-neutral-500">{m.label}</p>
              <p className={`text-sm font-medium ${m.valueClassName ?? 'text-white'}`}>{m.value}</p>
            </div>
          ))}
        </div>
      )}

      {content && <div className="flex-1">{content}</div>}

      {actions && (
        <div
          className={`flex flex-wrap items-center gap-2 ${
            content ? 'mt-4 border-t border-neutral-800 pt-4' : ''
          }`}
        >
          {actions}
        </div>
      )}
    </div>
  );
}

export function CardButton({
  children,
  variant = 'secondary',
  onClick,
}: {
  children: ReactNode;
  variant?: 'primary' | 'secondary';
  onClick?: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={
        variant === 'primary'
          ? 'rounded-lg bg-white px-4 py-2 text-xs font-semibold text-black transition-colors hover:bg-neutral-200'
          : 'rounded-lg border border-neutral-700 bg-neutral-900 px-4 py-2 text-xs font-medium text-neutral-300 transition-colors hover:border-neutral-500 hover:text-white'
      }
    >
      {children}
    </button>
  );
}
