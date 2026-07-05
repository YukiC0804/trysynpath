import type { KeyboardEvent, ReactNode } from 'react';
import { ArrowUp, Loader2 } from 'lucide-react';
import { COMMAND_CHIPS } from '../../../data/demoWorkspace';

interface CommandInputProps {
  value: string;
  onChange: (value: string) => void;
  onSubmit: () => void;
  onChipClick: (chip: string) => void;
  disabled?: boolean;
  compact?: boolean;
}

export function CommandInput({
  value,
  onChange,
  onSubmit,
  onChipClick,
  disabled = false,
  compact = false,
}: CommandInputProps) {
  const handleKeyDown = (e: KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      onSubmit();
    }
  };

  return (
    <div className={compact ? 'space-y-2' : 'space-y-3'}>
      <div className="relative rounded-xl border border-neutral-700 bg-neutral-900 shadow-lg shadow-black/20 focus-within:border-neutral-500">
        <textarea
          value={value}
          onChange={(e) => onChange(e.target.value)}
          onKeyDown={handleKeyDown}
          disabled={disabled}
          rows={compact ? 1 : 2}
          placeholder="Ask anything about orders, production, RFQs, capacity, inventory, or operations…"
          className="w-full resize-none bg-transparent px-4 py-3.5 pr-14 text-sm text-white placeholder:text-neutral-600 focus:outline-none disabled:opacity-50"
        />
        <button
          type="button"
          onClick={onSubmit}
          disabled={disabled || !value.trim()}
          className="absolute bottom-2.5 right-2.5 flex h-9 w-9 items-center justify-center rounded-lg bg-white text-black transition-colors hover:bg-neutral-200 disabled:cursor-not-allowed disabled:opacity-40"
          aria-label="Run command"
        >
          {disabled ? <Loader2 className="h-4 w-4 animate-spin" /> : <ArrowUp className="h-4 w-4" />}
        </button>
      </div>

      {!compact && (
        <div className="flex flex-wrap gap-2">
          {COMMAND_CHIPS.map((chip) => (
            <button
              key={chip}
              type="button"
              onClick={() => onChipClick(chip)}
              disabled={disabled}
              className="rounded-full border border-neutral-800 bg-neutral-900/60 px-3 py-1.5 text-xs text-neutral-400 transition-all hover:border-neutral-600 hover:text-white disabled:opacity-50"
            >
              {chip}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
