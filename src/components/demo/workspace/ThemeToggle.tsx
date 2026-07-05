import { Moon, Sun } from 'lucide-react';
import type { WorkspaceTheme } from '../../../hooks/useWorkspaceTheme';

interface ThemeToggleProps {
  theme: WorkspaceTheme;
  onChange: (theme: WorkspaceTheme) => void;
}

export function ThemeToggle({ theme, onChange }: ThemeToggleProps) {
  return (
    <div
      className="workspace-theme-toggle flex items-center rounded-lg border border-neutral-800 bg-neutral-900/60 p-0.5"
      role="group"
      aria-label="Theme"
    >
      <button
        type="button"
        onClick={() => onChange('light')}
        aria-pressed={theme === 'light'}
        className={`inline-flex items-center gap-1 rounded-md px-2 py-1 text-[11px] font-medium transition-colors ${
          theme === 'light'
            ? 'bg-white text-black shadow-sm'
            : 'text-neutral-500 hover:text-neutral-300'
        }`}
      >
        <Sun className="h-3.5 w-3.5" />
        <span className="hidden sm:inline">Light</span>
      </button>
      <button
        type="button"
        onClick={() => onChange('dark')}
        aria-pressed={theme === 'dark'}
        className={`inline-flex items-center gap-1 rounded-md px-2 py-1 text-[11px] font-medium transition-colors ${
          theme === 'dark'
            ? 'bg-white/10 text-white'
            : 'text-neutral-500 hover:text-neutral-300'
        }`}
      >
        <Moon className="h-3.5 w-3.5" />
        <span className="hidden sm:inline">Dark</span>
      </button>
    </div>
  );
}
