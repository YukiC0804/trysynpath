import type { ReactNode } from 'react';
import { Link } from 'react-router-dom';
import { GHOST_BOARDS } from '../../data/sageIntegrationData';
import { useWorkspaceTheme } from '../../hooks/useWorkspaceTheme';
import { DemoNavTabs } from '../demo/workspace/DemoNavTabs';
import { ThemeToggle } from '../demo/workspace/ThemeToggle';

export function SageLayout({ children }: { children: ReactNode }) {
  const { theme, setWorkspaceTheme } = useWorkspaceTheme();

  return (
    <div
      className="demo-workspace min-h-screen bg-black text-neutral-200"
      data-theme={theme}
    >
      <header className="sticky top-0 z-40 border-b border-neutral-800 bg-[#0a0a0a] backdrop-blur">
        <div className="mx-auto flex h-14 max-w-6xl items-center justify-between gap-3 px-4 sm:px-6">
          <div className="flex min-w-0 items-center gap-4">
            <Link to="/" className="shrink-0 text-sm font-semibold text-white">
              Synpath AI
            </Link>
            <span className="hidden text-neutral-700 sm:inline">/</span>
            <span className="hidden truncate text-xs text-neutral-400 sm:inline">
              {GHOST_BOARDS.brand} — Sage Integration
            </span>
          </div>
          <div className="flex shrink-0 items-center gap-2 sm:gap-3">
            <DemoNavTabs active="sage" size="sm" />
            <ThemeToggle theme={theme} onChange={setWorkspaceTheme} />
          </div>
        </div>
      </header>
      <main className="mx-auto max-w-6xl px-4 py-8 sm:px-6 sm:py-10">{children}</main>
    </div>
  );
}
