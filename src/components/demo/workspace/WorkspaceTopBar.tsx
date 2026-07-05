import { ArrowLeft, Circle } from 'lucide-react';
import { COMPANY, CONNECTED_SYSTEMS } from '../../../data/demoWorkspace';
import type { WorkspaceTheme } from '../../../hooks/useWorkspaceTheme';
import { ThemeToggle } from './ThemeToggle';

interface WorkspaceTopBarProps {
  onBackToHome: () => void;
  theme: WorkspaceTheme;
  onThemeChange: (theme: WorkspaceTheme) => void;
}

export function WorkspaceTopBar({ onBackToHome, theme, onThemeChange }: WorkspaceTopBarProps) {
  return (
    <header className="flex h-14 shrink-0 items-center justify-between border-b border-neutral-800 bg-[#0a0a0a] px-4">
      <div className="flex items-center gap-3 sm:gap-4">
        <button
          type="button"
          onClick={onBackToHome}
          className="inline-flex items-center gap-1.5 rounded-lg border border-transparent px-2 py-1.5 text-xs text-neutral-400 transition-colors hover:border-neutral-800 hover:bg-neutral-900 hover:text-white"
        >
          <ArrowLeft className="h-3.5 w-3.5" />
          <span>Home</span>
        </button>
        <div className="h-6 w-px bg-neutral-800" />
        <div>
          <h1 className="text-sm font-semibold text-white">Operations Command Centre</h1>
          <p className="text-[11px] text-neutral-500">{COMPANY.name}</p>
        </div>
        <span className="hidden rounded-full border border-amber-500/30 bg-amber-500/10 px-2.5 py-0.5 text-[10px] font-semibold uppercase tracking-wider text-amber-400 lg:inline-flex">
          Demo environment
        </span>
      </div>

      <div className="flex items-center gap-2 sm:gap-3">
        <ThemeToggle theme={theme} onChange={onThemeChange} />
        <span className="hidden items-center gap-1.5 text-xs text-emerald-400 sm:flex">
          <Circle className="h-2 w-2 fill-emerald-400 text-emerald-400" />
          {CONNECTED_SYSTEMS.length} systems connected
        </span>
        <span className="rounded-lg border border-neutral-800 bg-neutral-900 px-2.5 py-1 text-xs text-neutral-400">
          COO workspace
        </span>
      </div>
    </header>
  );
}
