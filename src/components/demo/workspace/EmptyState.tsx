import { Sparkles } from 'lucide-react';
import { INITIAL_PROMPTS } from '../../../data/demoWorkspace';

interface EmptyStateProps {
  onSelectPrompt: (prompt: string) => void;
}

export function EmptyState({ onSelectPrompt }: EmptyStateProps) {
  return (
    <div className="flex flex-col items-center justify-center py-16 text-center">
      <div className="mb-4 flex h-12 w-12 items-center justify-center rounded-xl border border-neutral-800 bg-neutral-900">
        <Sparkles className="h-5 w-5 text-violet-400" />
      </div>
      <p className="mb-1 text-base font-medium text-white">
        Ask a question or describe the operational tool you want to build.
      </p>
      <p className="mb-8 max-w-lg text-sm text-neutral-500">
        Ask about a specific order, job, machine, RFQ, or build the operational tool your team needs — connected
        to Northbridge Components Ltd data.
      </p>
      <div className="flex w-full max-w-2xl flex-col gap-2">
        <p className="text-left text-[10px] font-semibold uppercase tracking-wider text-neutral-600">
          Suggested high-impact prompts
        </p>
        <div className="grid gap-2 sm:grid-cols-2">
          {INITIAL_PROMPTS.map((prompt) => (
            <button
              key={prompt}
              type="button"
              onClick={() => onSelectPrompt(prompt)}
              className="rounded-lg border border-neutral-800 bg-neutral-900/50 px-4 py-3 text-left text-sm text-neutral-300 transition-colors hover:border-neutral-600 hover:bg-neutral-900 hover:text-white"
            >
              {prompt}
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}
