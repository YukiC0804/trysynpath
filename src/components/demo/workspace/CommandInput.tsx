import type { KeyboardEvent } from 'react';
import { ArrowUp, Loader2 } from 'lucide-react';

interface CommandInputProps {
  value: string;
  onChange: (value: string) => void;
  onSubmit: () => void;
  disabled?: boolean;
  variant?: 'hero' | 'compact';
}

export function CommandInput({
  value,
  onChange,
  onSubmit,
  disabled = false,
  variant = 'hero',
}: CommandInputProps) {
  const isHero = variant === 'hero';

  const handleKeyDown = (e: KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      onSubmit();
    }
  };

  return (
    <div
      className={`relative w-full transition-all ${
        isHero
          ? 'rounded-[20px] border border-neutral-700/70 bg-neutral-900/50 shadow-lg shadow-black/25 focus-within:border-violet-500/35 focus-within:shadow-[0_0_0_1px_rgba(139,92,246,0.25),0_0_28px_rgba(139,92,246,0.07)]'
          : 'rounded-xl border border-neutral-700 bg-neutral-900 shadow-lg shadow-black/20 focus-within:border-neutral-500'
      }`}
    >
      <textarea
        value={value}
        onChange={(e) => onChange(e.target.value)}
        onKeyDown={handleKeyDown}
        disabled={disabled}
        rows={isHero ? 5 : 1}
        placeholder={
          isHero
            ? 'Ask about an order, RFQ, machine issue, capacity constraint, inventory shortage, or describe the operational tool you want to build...'
            : 'Ask anything about orders, production, RFQs, capacity, inventory, or operations…'
        }
        className={`w-full resize-none bg-transparent text-sm text-white placeholder:text-neutral-600 focus:outline-none disabled:opacity-50 ${
          isHero
            ? 'min-h-[168px] px-5 pb-14 pt-4'
            : 'px-4 py-3.5 pr-14'
        }`}
      />
      <button
        type="button"
        onClick={onSubmit}
        disabled={disabled || !value.trim()}
        className={`absolute flex items-center justify-center rounded-xl bg-white text-black transition-colors hover:bg-neutral-200 disabled:cursor-not-allowed disabled:opacity-40 ${
          isHero ? 'bottom-3 right-3 h-9 w-9' : 'bottom-2.5 right-2.5 h-9 w-9'
        }`}
        aria-label="Run command"
      >
        {disabled ? <Loader2 className="h-4 w-4 animate-spin" /> : <ArrowUp className="h-4 w-4" />}
      </button>
    </div>
  );
}
