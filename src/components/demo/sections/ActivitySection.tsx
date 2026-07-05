import { useMemo, useState } from 'react';
import { SectionHeader } from '../workspace/SectionHeader';
import { WorkspaceSectionScroll } from '../workspace/WorkspaceSectionScroll';
import { StatusBadge } from '../StatusBadge';
import type { WorkspaceCreatedState } from '../../../types/workspace';

type ActivityFilter = 'all' | 'agents' | 'workflows' | 'dashboards' | 'apps' | 'alerts';

interface ActivityEntry {
  time: string;
  category: ActivityFilter;
  title: string;
  details: string[];
  badge?: { label: string; variant: 'healthy' | 'warning' | 'danger' | 'ai' | 'neutral' };
}

const ACTIVITY_ENTRIES: ActivityEntry[] = [
  {
    time: 'Today 09:12',
    category: 'workflows',
    title: 'RFQ to Quote Workflow generated quote draft for Schneider Electric',
    details: ['Confidence: 87%', 'Status: Awaiting commercial approval'],
    badge: { label: 'Workflow', variant: 'ai' },
  },
  {
    time: 'Today 08:05',
    category: 'dashboards',
    title: 'COO Daily Briefing dashboard refreshed',
    details: ['3 orders at risk', '£221k revenue affected'],
    badge: { label: 'Dashboard', variant: 'neutral' },
  },
  {
    time: 'Today 08:03',
    category: 'workflows',
    title: 'Urgent Order Recovery Workflow generated recovery plan for Bosch SO-1048',
    details: ['Suggested moving J-901 from Line 3 to Line 2'],
    badge: { label: 'Workflow', variant: 'ai' },
  },
  {
    time: 'Today 08:00',
    category: 'agents',
    title: 'Daily Order Risk Agent completed scheduled run',
    details: ['Found 1 high-risk order and 2 medium-risk orders'],
    badge: { label: 'Agent', variant: 'healthy' },
  },
  {
    time: 'Today 07:30',
    category: 'agents',
    title: 'Material Shortage Agent detected shortage of Aluminium Casing Blank',
    details: ['Recommended expediting PO-7782'],
    badge: { label: 'Alert', variant: 'danger' },
  },
  {
    time: 'Today 06:45',
    category: 'alerts',
    title: 'Machine Downtime Agent detected CNC-04 downtime above threshold',
    details: ['Suggested maintenance review and production reschedule'],
    badge: { label: 'Alert', variant: 'warning' },
  },
  {
    time: 'Yesterday 16:30',
    category: 'agents',
    title: 'Quality Escalation Agent flagged surface scratch defect rate on J-883',
    details: ['Defect rate increased to 4.2%'],
    badge: { label: 'Agent', variant: 'warning' },
  },
  {
    time: 'Yesterday 15:22',
    category: 'workflows',
    title: 'New Order Validation Workflow checked Siemens SO-1051',
    details: ['Capacity warning raised'],
    badge: { label: 'Workflow', variant: 'warning' },
  },
];

const FILTERS: { id: ActivityFilter; label: string }[] = [
  { id: 'all', label: 'All' },
  { id: 'agents', label: 'Agents' },
  { id: 'workflows', label: 'Workflows' },
  { id: 'dashboards', label: 'Dashboards' },
  { id: 'apps', label: 'Apps' },
  { id: 'alerts', label: 'Alerts' },
];

interface ActivitySectionProps {
  createdState: WorkspaceCreatedState;
}

export function ActivitySection({ createdState }: ActivitySectionProps) {
  const [filter, setFilter] = useState<ActivityFilter>('all');

  const entries = useMemo(() => {
    const dynamic: ActivityEntry[] = [];

    if (createdState.dailyRiskAgentCreated) {
      dynamic.unshift({
        time: 'Just now',
        category: 'agents',
        title: 'Daily Order Risk Agent created from Command Centre',
        details: ['Checks high-priority orders every morning at 8:00', 'Sends recommended actions to COO'],
        badge: { label: 'New', variant: 'ai' },
      });
    }
    if (createdState.operationsDashboardSaved) {
      dynamic.unshift({
        time: 'Just now',
        category: 'dashboards',
        title: 'Operations Risk Dashboard saved from Command Centre',
        details: ['3 orders at risk', '£221k revenue at risk', 'Pinned to dashboards'],
        badge: { label: 'New', variant: 'ai' },
      });
    }
    if (createdState.orderEntryPublished) {
      dynamic.unshift({
        time: 'Just now',
        category: 'apps',
        title: 'Order Entry App published from Command Centre',
        details: ['Available to Sales and Operations teams'],
        badge: { label: 'App', variant: 'healthy' },
      });
    }

    const all = [...dynamic, ...ACTIVITY_ENTRIES];
    if (filter === 'all') return all;
    return all.filter((e) => e.category === filter);
  }, [filter, createdState]);

  return (
    <WorkspaceSectionScroll>
      <div className="mx-auto max-w-4xl px-4 py-6 sm:px-6">
      <SectionHeader
        title="Activity"
        subtitle="Recent AI actions, alerts, workflow runs, and user activity."
      />

      <div className="mb-6 flex flex-wrap gap-2">
        {FILTERS.map((f) => (
          <button
            key={f.id}
            type="button"
            onClick={() => setFilter(f.id)}
            className={`rounded-full px-3 py-1.5 text-xs font-medium transition-colors ${
              filter === f.id
                ? 'bg-white text-black'
                : 'border border-neutral-800 bg-neutral-900 text-neutral-400 hover:text-white'
            }`}
          >
            {f.label}
          </button>
        ))}
      </div>

      <div className="space-y-0">
        {entries.map((entry, i) => (
          <div key={`${entry.time}-${entry.title}`} className="relative flex gap-4 pb-6">
            {i < entries.length - 1 && (
              <div className="absolute left-[7px] top-4 h-full w-px bg-neutral-800" />
            )}
            <div className="relative z-10 mt-1.5 h-3.5 w-3.5 shrink-0 rounded-full border-2 border-neutral-600 bg-neutral-900" />
            <div className="min-w-0 flex-1 rounded-xl border border-neutral-800 bg-neutral-900/40 p-4">
              <div className="mb-1 flex flex-wrap items-center gap-2">
                <span className="text-xs text-neutral-500">{entry.time}</span>
                {entry.badge && (
                  <StatusBadge variant={entry.badge.variant}>{entry.badge.label}</StatusBadge>
                )}
              </div>
              <p className="text-sm font-medium text-white">{entry.title}</p>
              <ul className="mt-2 space-y-0.5">
                {entry.details.map((d) => (
                  <li key={d} className="text-xs text-neutral-400">
                    {d}
                  </li>
                ))}
              </ul>
            </div>
          </div>
        ))}
      </div>
      </div>
    </WorkspaceSectionScroll>
  );
}
