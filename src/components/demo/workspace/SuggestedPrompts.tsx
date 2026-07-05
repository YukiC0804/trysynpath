import { INITIAL_PROMPTS } from '../../../data/demoWorkspace';

interface SuggestedPromptsProps {
  onSelectPrompt: (prompt: string) => void;
}

export function SuggestedPrompts({ onSelectPrompt }: SuggestedPromptsProps) {
  return (
    <div className="w-full">
      <p className="mb-3 text-[10px] font-semibold uppercase tracking-wider text-neutral-500">
        Suggested high-impact prompts
      </p>
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        {INITIAL_PROMPTS.map((prompt) => (
          <button
            key={prompt}
            type="button"
            onClick={() => onSelectPrompt(prompt)}
            className="flex min-h-[88px] items-start rounded-xl border border-neutral-800/80 bg-neutral-900/40 px-4 py-3.5 text-left text-sm leading-relaxed text-neutral-200 transition-all hover:border-violet-500/30 hover:bg-neutral-900/70 hover:text-white hover:shadow-[0_0_20px_rgba(139,92,246,0.06)]"
          >
            {prompt}
          </button>
        ))}
      </div>
    </div>
  );
}
