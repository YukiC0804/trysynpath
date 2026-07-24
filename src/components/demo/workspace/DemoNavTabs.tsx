import { Link } from 'react-router-dom';

export type DemoNavTab = 'operations' | 'agents' | 'sage';

interface DemoNavTabsProps {
  active: DemoNavTab;
  /** Compact for cramped top-bar / mobile */
  size?: 'sm' | 'md';
}

const TABS: { id: DemoNavTab; label: string; shortLabel: string; to: string }[] = [
  { id: 'operations', label: 'Operations', shortLabel: 'Ops', to: '/' },
  { id: 'agents', label: 'Agent Workforce', shortLabel: 'Agents', to: '/agents' },
  { id: 'sage', label: 'Ghost Boards · Sage', shortLabel: 'Ghost Boards', to: '/sage-integration' },
];

export function DemoNavTabs({ active, size = 'md' }: DemoNavTabsProps) {
  const pad = size === 'sm' ? 'px-2.5 py-1 text-[11px]' : 'px-3 py-1.5 text-xs';

  return (
    <nav
      aria-label="Demo pages"
      className="inline-flex items-center rounded-lg border border-neutral-800 bg-neutral-950 p-0.5"
    >
      {TABS.map((tab) => {
        const isActive = tab.id === active;
        const className = `shrink-0 rounded-md font-medium transition-colors ${pad} ${
          isActive
            ? 'bg-white text-black'
            : 'text-neutral-400 hover:bg-neutral-900 hover:text-white'
        }`;

        if (isActive) {
          return (
            <span key={tab.id} className={className} aria-current="page">
              <span className="sm:hidden">{tab.shortLabel}</span>
              <span className="hidden sm:inline">{tab.label}</span>
            </span>
          );
        }

        return (
          <Link key={tab.id} to={tab.to} className={className}>
            <span className="sm:hidden">{tab.shortLabel}</span>
            <span className="hidden sm:inline">{tab.label}</span>
          </Link>
        );
      })}
    </nav>
  );
}
