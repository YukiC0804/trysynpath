import type { ReactNode } from 'react';

interface WorkspaceSectionScrollProps {
  children: ReactNode;
}

/** Scrollable main area for workspace sections below the top bar. */
export function WorkspaceSectionScroll({ children }: WorkspaceSectionScrollProps) {
  return (
    <div className="min-h-0 flex-1 overflow-y-auto overscroll-y-contain">
      {children}
    </div>
  );
}
