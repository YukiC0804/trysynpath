import {
  LayoutDashboard,
  Bot,
  AppWindow,
  Workflow,
  Database,
  Activity,
  Command,
  Bell,
  Building2,
} from 'lucide-react';
import { Link } from 'react-router-dom';
import type { WorkspaceSection } from '../../../types/workspace';
import { ALERT_SUMMARY } from '../../../data/demoAlerts';
import { SYNPATH_LOGO_SRC } from '../../../data/demoWorkspace';

const NAV_ITEMS: { id: WorkspaceSection; label: string; icon: typeof Command; badge?: number }[] = [
  { id: 'command', label: 'Command Centre', icon: Command },
  { id: 'alerts', label: 'Alerts', icon: Bell, badge: ALERT_SUMMARY.activeAlerts },
  { id: 'agents', label: 'Agents', icon: Bot },
  { id: 'dashboards', label: 'Dashboards', icon: LayoutDashboard },
  { id: 'apps', label: 'Apps', icon: AppWindow },
  { id: 'workflows', label: 'Workflows', icon: Workflow },
  { id: 'data', label: 'Data Sources', icon: Database },
  { id: 'activity', label: 'Activity', icon: Activity },
];

interface WorkspaceSidebarProps {
  activeSection: WorkspaceSection;
  onNavigate: (section: WorkspaceSection) => void;
  recentPrompts: { prompt: string; resultType: string }[];
  onSelectPrompt?: (prompt: string) => void;
}

export function WorkspaceSidebar({
  activeSection,
  onNavigate,
  recentPrompts,
  onSelectPrompt,
}: WorkspaceSidebarProps) {
  return (
    <aside className="flex h-full w-56 shrink-0 flex-col border-r border-neutral-800 bg-[#0a0a0a]">
      <nav className="flex-1 space-y-0.5 p-3">
        {NAV_ITEMS.map((item) => {
          const Icon = item.icon;
          const isActive = activeSection === item.id;
          return (
            <button
              key={item.id}
              type="button"
              onClick={() => onNavigate(item.id)}
              className={`flex w-full items-center gap-2.5 rounded-lg px-3 py-2 text-left text-sm transition-colors ${
                isActive
                  ? 'bg-white/10 font-medium text-white'
                  : 'text-neutral-500 hover:bg-neutral-900 hover:text-neutral-300'
              }`}
            >
              <Icon className="h-4 w-4 shrink-0" />
              <span className="flex-1">{item.label}</span>
              {item.badge !== undefined && (
                <span className="rounded-full bg-violet-500/20 px-1.5 py-0.5 text-[10px] font-semibold text-violet-300">
                  {item.badge}
                </span>
              )}
            </button>
          );
        })}
      </nav>

      <div className="border-t border-neutral-800 px-3 py-3">
        <p className="mb-2 px-1 text-[10px] font-semibold uppercase tracking-wider text-neutral-600">
          Customer demos
        </p>
        <Link
          to="/sage-integration"
          className="flex w-full items-center gap-2.5 rounded-lg border border-emerald-500/20 bg-emerald-500/5 px-3 py-2 text-left text-sm text-emerald-300 transition-colors hover:border-emerald-500/40 hover:bg-emerald-500/10 hover:text-emerald-200"
        >
          <Building2 className="h-4 w-4 shrink-0" />
          <span className="flex-1 leading-tight">
            <span className="block font-medium text-emerald-200">Ghost Boards</span>
            <span className="block text-[11px] text-emerald-400/70">Sage Integration</span>
          </span>
        </Link>
      </div>

      {recentPrompts.length > 0 && activeSection === 'command' && (
        <div className="border-t border-neutral-800 p-3">
          <p className="mb-2 px-1 text-[10px] font-semibold uppercase tracking-wider text-neutral-600">
            Recent commands
          </p>
          <ul className="space-y-1">
            {recentPrompts.slice(0, 4).map((item) => (
              <li key={item.prompt}>
                <button
                  type="button"
                  onClick={() => onSelectPrompt?.(item.prompt)}
                  className="w-full truncate rounded px-2 py-1.5 text-left text-xs text-neutral-500 transition-colors hover:bg-neutral-900 hover:text-neutral-300"
                  title={item.prompt}
                >
                  {item.prompt}
                </button>
              </li>
            ))}
          </ul>
        </div>
      )}

      <div className="mt-auto border-t border-neutral-800 p-3.5">
        <div className="flex items-center gap-3 px-1">
          <div className="h-12 w-12 shrink-0 overflow-hidden rounded-lg">
            <img
              src={SYNPATH_LOGO_SRC}
              alt=""
              className="h-full w-full object-cover object-left"
            />
          </div>
          <span className="text-[1.5rem] font-semibold leading-none tracking-tight text-white">Synpath AI</span>
        </div>
      </div>
    </aside>
  );
}
