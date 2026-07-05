import { Check, Loader2 } from 'lucide-react';
import { motion } from 'motion/react';

interface AnalysisStepperProps {
  steps: string[];
  currentStepIndex: number;
  isComplete: boolean;
}

export function AnalysisStepper({ steps, currentStepIndex, isComplete }: AnalysisStepperProps) {
  return (
    <div className="rounded-xl border border-neutral-800 bg-neutral-900/60 p-4">
      <p className="mb-3 text-[10px] font-semibold uppercase tracking-wider text-violet-400">Analysing</p>
      <ul className="space-y-2">
        {steps.map((step, index) => {
          const isDone = isComplete || index < currentStepIndex;
          const isCurrent = !isComplete && index === currentStepIndex;

          return (
            <motion.li
              key={step}
              initial={{ opacity: 0, x: -8 }}
              animate={{ opacity: 1, x: 0 }}
              transition={{ duration: 0.2, delay: index * 0.05 }}
              className="flex items-center gap-3 text-sm"
            >
              <span className="flex h-5 w-5 shrink-0 items-center justify-center">
                {isDone ? (
                  <Check className="h-4 w-4 text-emerald-400" />
                ) : isCurrent ? (
                  <Loader2 className="h-4 w-4 animate-spin text-violet-400" />
                ) : (
                  <span className="h-2 w-2 rounded-full bg-neutral-700" />
                )}
              </span>
              <span
                className={
                  isDone ? 'text-neutral-300' : isCurrent ? 'font-medium text-white' : 'text-neutral-600'
                }
              >
                {step}
              </span>
            </motion.li>
          );
        })}
      </ul>
    </div>
  );
}
