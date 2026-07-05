import { ArrowRight } from 'lucide-react';

interface FollowUpPromptsProps {
  prompts: string[];
  onSelect: (prompt: string) => void;
  disabled?: boolean;
}

export function FollowUpPrompts({ prompts, onSelect, disabled }: FollowUpPromptsProps) {
  return (
    <div className="border-t border-neutral-800 pt-4">
      <p className="mb-2 text-[10px] font-semibold uppercase tracking-wider text-neutral-500">Follow-up</p>
      <div className="flex flex-wrap gap-2">
        {prompts.map((prompt) => (
          <button
            key={prompt}
            type="button"
            onClick={() => onSelect(prompt)}
            disabled={disabled}
            className="inline-flex items-center gap-1.5 rounded-full border border-neutral-800 bg-neutral-900/40 px-3 py-1.5 text-xs text-neutral-400 transition-colors hover:border-violet-500/30 hover:text-violet-300 disabled:opacity-50"
          >
            {prompt}
            <ArrowRight className="h-3 w-3" />
          </button>
        ))}
      </div>
    </div>
  );
}
