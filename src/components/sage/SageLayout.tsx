import type { ReactNode } from 'react';
import { Link } from 'react-router-dom';
import { GHOST_BOARDS } from '../../data/sageIntegrationData';

export function SageLayout({ children }: { children: ReactNode }) {
  return (
    <div className="min-h-screen bg-black text-neutral-200">
      <header className="sticky top-0 z-40 border-b border-neutral-800 bg-black/90 backdrop-blur">
        <div className="mx-auto flex h-14 max-w-6xl items-center justify-between px-4 sm:px-6">
          <div className="flex items-center gap-4">
            <Link to="/" className="text-sm font-semibold text-white">
              Synpath AI
            </Link>
            <span className="hidden text-neutral-700 sm:inline">/</span>
            <span className="hidden text-xs text-neutral-400 sm:inline">{GHOST_BOARDS.brand}</span>
          </div>
          <nav className="flex items-center gap-3 text-xs">
            <Link to="/" className="text-neutral-400 hover:text-white">
              Operations Demo
            </Link>
            <Link to="/sage-integration" className="rounded-lg bg-white px-3 py-1.5 font-semibold text-black">
              Sage Integration
            </Link>
          </nav>
        </div>
      </header>
      <main className="mx-auto max-w-6xl px-4 py-8 sm:px-6 sm:py-10">{children}</main>
    </div>
  );
}
