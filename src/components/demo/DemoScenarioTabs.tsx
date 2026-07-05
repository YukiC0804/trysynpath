import { AlertTriangle, CheckCircle2 } from 'lucide-react';
import type { ScenarioId } from '../../data/demoScenarios';
import { DEMO_SCENARIOS } from '../../data/demoScenarios';

interface DemoScenarioTabsProps {
  activeId: ScenarioId;
  onSelect: (id: ScenarioId) => void;
}

export function DemoScenarioTabs({ activeId, onSelect }: DemoScenarioTabsProps) {
  return (
    <nav className="space-y-1" aria-label="Demo scenarios">
      {DEMO_SCENARIOS.map((scenario) => {
        const isActive = scenario.id === activeId;
        return (
          <button
            key={scenario.id}
            type="button"
            onClick={() => onSelect(scenario.id)}
            className={`flex w-full items-start gap-3 rounded-xl border px-3 py-3 text-left transition-all sm:px-4 sm:py-3.5 ${
              isActive
                ? 'border-white/20 bg-white/10 text-white shadow-[0_0_15px_rgba(255,255,255,0.08)]'
                : 'border-transparent bg-transparent text-neutral-400 hover:border-neutral-800 hover:bg-neutral-900/50 hover:text-white'
            }`}
          >
            <span className="mt-0.5 shrink-0">
              {isActive ? (
                <CheckCircle2 className="h-4 w-4 text-emerald-400" />
              ) : (
                <span className="block h-4 w-4 rounded-full border border-neutral-700" />
              )}
            </span>
            <span>
              <span className="block text-sm font-medium">{scenario.label}</span>
              {scenario.id === 'urgent-order' && (
                <span className="mt-0.5 flex items-center gap-1 text-[10px] text-amber-400">
                  <AlertTriangle className="h-3 w-3" />
                  Featured scenario
                </span>
              )}
            </span>
          </button>
        );
      })}
    </nav>
  );
}
