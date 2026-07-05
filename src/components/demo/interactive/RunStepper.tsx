import { useEffect, useState } from 'react';
import { Check, Loader2 } from 'lucide-react';

interface RunStepperProps {
  steps: string[];
  running: boolean;
  onComplete: () => void;
  intervalMs?: number;
}

export function RunStepper({ steps, running, onComplete, intervalMs = 550 }: RunStepperProps) {
  const [activeIndex, setActiveIndex] = useState(-1);

  useEffect(() => {
    if (!running) {
      setActiveIndex(-1);
      return;
    }

    setActiveIndex(0);
    let index = 0;
    const timer = window.setInterval(() => {
      index += 1;
      if (index >= steps.length) {
        window.clearInterval(timer);
        onComplete();
        return;
      }
      setActiveIndex(index);
    }, intervalMs);

    return () => window.clearInterval(timer);
  }, [running, steps, intervalMs, onComplete]);

  return (
    <ul className="space-y-2">
      {steps.map((step, index) => {
        const done = activeIndex > index;
        const active = activeIndex === index;
        return (
          <li
            key={step}
            className={`flex items-center gap-2 rounded-lg border px-3 py-2 text-sm ${
              done
                ? 'border-emerald-500/20 bg-emerald-500/5 text-emerald-200'
                : active
                  ? 'border-violet-500/30 bg-violet-500/5 text-white'
                  : 'border-neutral-800 bg-neutral-900/40 text-neutral-500'
            }`}
          >
            {done ? (
              <Check className="h-4 w-4 shrink-0 text-emerald-400" />
            ) : active ? (
              <Loader2 className="h-4 w-4 shrink-0 animate-spin text-violet-400" />
            ) : (
              <span className="h-4 w-4 shrink-0 rounded-full border border-neutral-700" />
            )}
            {step}
          </li>
        );
      })}
    </ul>
  );
}
