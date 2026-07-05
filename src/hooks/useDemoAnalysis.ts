import { useCallback, useRef, useState } from 'react';
import {
  ANALYSIS_STEPS,
  FOLLOW_UP_STEP_INTERVAL_MS,
  STEP_INTERVAL_MS,
  routePrompt,
  type ResultType,
} from '../data/demoWorkspace';

export type DemoPhase = 'idle' | 'analyzing' | 'result';

export interface PromptHistoryItem {
  prompt: string;
  resultType: ResultType;
  timestamp: number;
}

export function useDemoAnalysis() {
  const [phase, setPhase] = useState<DemoPhase>('idle');
  const [prompt, setPrompt] = useState('');
  const [activePrompt, setActivePrompt] = useState('');
  const [resultType, setResultType] = useState<ResultType | null>(null);
  const [currentStepIndex, setCurrentStepIndex] = useState(-1);
  const [history, setHistory] = useState<PromptHistoryItem[]>([]);
  const [completedActions, setCompletedActions] = useState<Set<string>>(new Set());
  const [activeSteps, setActiveSteps] = useState<string[]>([]);
  const timerRef = useRef<number | null>(null);

  const clearTimer = useCallback(() => {
    if (timerRef.current !== null) {
      window.clearInterval(timerRef.current);
      timerRef.current = null;
    }
  }, []);

  const runAnalysis = useCallback(
    (input: string, options?: { fast?: boolean }) => {
      const trimmed = input.trim();
      if (!trimmed) return;

      clearTimer();
      const type = routePrompt(trimmed);
      const steps = ANALYSIS_STEPS[type];
      const interval = options?.fast ? FOLLOW_UP_STEP_INTERVAL_MS : STEP_INTERVAL_MS;
      const stepsToRun = options?.fast ? steps.slice(-3) : steps;

      setPrompt(trimmed);
      setActivePrompt(trimmed);
      setResultType(type);
      setActiveSteps(stepsToRun);
      setPhase('analyzing');
      setCurrentStepIndex(0);
      setCompletedActions(new Set());

      let step = 0;
      timerRef.current = window.setInterval(() => {
        step += 1;
        if (step >= stepsToRun.length) {
          clearTimer();
          setCurrentStepIndex(stepsToRun.length - 1);
          setPhase('result');
          setHistory((prev) => {
            const next = [{ prompt: trimmed, resultType: type, timestamp: Date.now() }, ...prev];
            return next.slice(0, 8);
          });
        } else {
          setCurrentStepIndex(step);
        }
      }, interval);
    },
    [clearTimer],
  );

  const completeAction = useCallback((actionId: string) => {
    setCompletedActions((prev) => new Set(prev).add(actionId));
  }, []);

  const reset = useCallback(() => {
    clearTimer();
    setPhase('idle');
    setPrompt('');
    setActivePrompt('');
    setResultType(null);
    setCurrentStepIndex(-1);
    setActiveSteps([]);
    setCompletedActions(new Set());
  }, [clearTimer]);

  const analysisSteps = activeSteps;

  return {
    phase,
    prompt,
    setPrompt,
    activePrompt,
    resultType,
    currentStepIndex,
    analysisSteps,
    history,
    completedActions,
    runAnalysis,
    completeAction,
    reset,
  };
}
