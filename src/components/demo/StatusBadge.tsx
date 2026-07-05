import type { ReactNode } from 'react';
import type { StatusVariant } from '../../types/status';

const variantStyles: Record<StatusVariant, string> = {
  connected: 'bg-emerald-500/15 text-emerald-400 border-emerald-500/25',
  healthy: 'bg-emerald-500/15 text-emerald-400 border-emerald-500/25',
  warning: 'bg-amber-500/15 text-amber-400 border-amber-500/25',
  danger: 'bg-red-500/15 text-red-400 border-red-500/25',
  ai: 'bg-violet-500/15 text-violet-400 border-violet-500/25',
  neutral: 'bg-white/10 text-white border-white/20',
};

interface StatusBadgeProps {
  children: ReactNode;
  variant?: StatusVariant;
  className?: string;
}

export function StatusBadge({ children, variant = 'neutral', className = '' }: StatusBadgeProps) {
  return (
    <span
      className={`inline-flex items-center rounded px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wider border ${variantStyles[variant]} ${className}`}
    >
      {children}
    </span>
  );
}
