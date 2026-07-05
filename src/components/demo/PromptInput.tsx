import type { KeyboardEvent } from 'react';
import { ArrowRight, Sparkles } from 'lucide-react';
import type { ScenarioId } from '../../data/demoScenarios';
import { PROMPT_CHIPS } from '../../data/demoScenarios';

interface PromptInputProps {
  value: string;
  onChange: (value: string) => void;
  onRun: () => void;
  onChipSelect: (scenarioId: ScenarioId) => void;
  isRunning?: boolean;
}

export function PromptInput({ value, onChange, onRun, onChipSelect, isRunning = false }: PromptInputProps) {
  const handleKeyDown = (e: KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      onRun();
    }
  };

  return (
    <div className="space-y-4">
      <div className="rounded-2xl border border-neutral-800 bg-neutral-900/80 p-3 sm:p-4">
        <div className="mb-2 flex items-center gap-2 text-xs text-violet-400">
          <Sparkles className="h-3.5 w-3.5" />
          <span className="font-medium uppercase tracking-wider">Natural language command</span>
        </div>
        <textarea
          value={value}
          onChange={(e) => onChange(e.target.value)}
          onKeyDown={handleKeyDown}
          rows={2}
          placeholder="Ask anything about your operations..."
          className="w-full resize-none rounded-xl border border-neutral-800 bg-[#0a0a0a] px-4 py-3 text-sm text-white placeholder:text-neutral-600 focus:border-neutral-600 focus:outline-none"
        />
        <div className="mt-3 flex justify-end">
          <button
            type="button"
            onClick={onRun}
            disabled={isRunning || !value.trim()}
            className="inline-flex items-center gap-2 rounded-md bg-white px-5 py-2.5 text-sm font-semibold text-black transition-colors hover:bg-neutral-200 disabled:cursor-not-allowed disabled:opacity-50"
          >
            {isRunning ? 'Analysing...' : 'Run Prompt'}
            <ArrowRight className="h-4 w-4" />
          </button>
        </div>
      </div>

      <div className="flex flex-wrap gap-2">
        {PROMPT_CHIPS.map((chip) => (
          <button
            key={chip.scenarioId}
            type="button"
            onClick={() => onChipSelect(chip.scenarioId)}
            className="rounded-full border border-neutral-800 bg-neutral-900/50 px-3 py-1.5 text-xs text-neutral-400 transition-all hover:border-neutral-600 hover:text-white sm:px-4 sm:py-2 sm:text-sm"
          >
            {chip.label}
          </button>
        ))}
      </div>
    </div>
  );
}
