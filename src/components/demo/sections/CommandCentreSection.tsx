import { motion, AnimatePresence } from 'motion/react';
import { CommandInput } from '../workspace/CommandInput';
import { AnalysisStepper } from '../workspace/AnalysisStepper';
import { EmptyState } from '../workspace/EmptyState';
import { FollowUpPrompts } from '../workspace/FollowUpPrompts';
import { DataSourceBadges } from '../workspace/DataSourceBadges';
import { AlertsNotificationStrip } from '../workspace/AlertsNotificationStrip';
import { ConnectedSystemsStrip } from '../workspace/ConnectedSystemsStrip';
import { UrgentOrderImpactResult } from '../results/UrgentOrderImpactResult';
import { RFQQuoteResult } from '../results/RFQQuoteResult';
import { RescheduleResult } from '../results/RescheduleResult';
import { EstimateResult } from '../results/EstimateResult';
import { OrderEntryAppResult } from '../results/OrderEntryAppResult';
import { DashboardResult } from '../results/DashboardResult';
import { GeneralAnalysisResult } from '../results/GeneralAnalysisResult';
import { FOLLOW_UP_PROMPTS, DATA_SOURCES_BY_RESULT, type ResultType } from '../../../data/demoWorkspace';
import type { useDemoAnalysis } from '../../../hooks/useDemoAnalysis';

type AnalysisState = ReturnType<typeof useDemoAnalysis>;

interface CommandCentreSectionProps {
  analysis: AnalysisState;
  onAction: (actionId: string) => void;
  onViewAlerts: () => void;
}

export function CommandCentreSection({ analysis, onAction, onViewAlerts }: CommandCentreSectionProps) {
  const {
    phase,
    prompt,
    setPrompt,
    activePrompt,
    resultType,
    currentStepIndex,
    analysisSteps,
    completedActions,
    runAnalysis,
  } = analysis;

  const isAnalyzing = phase === 'analyzing';
  const hasResult = phase === 'result' && resultType !== null;

  const handleSubmit = () => runAnalysis(prompt);
  const handleChip = (chip: string) => {
    setPrompt(chip);
    runAnalysis(chip);
  };
  const handleFollowUp = (followUp: string) => {
    setPrompt(followUp);
    runAnalysis(followUp, { fast: true });
  };

  const handleAction = (actionId: string) => {
    onAction(actionId);
    analysis.completeAction(actionId);
  };

  const stepsToShow =
    isAnalyzing && analysisSteps.length > 0
      ? analysisSteps.slice(0, currentStepIndex + 1)
      : analysisSteps;

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <div className="shrink-0 border-b border-neutral-800 bg-black px-4 py-4 sm:px-6">
        <CommandInput
          value={prompt}
          onChange={setPrompt}
          onSubmit={handleSubmit}
          onChipClick={handleChip}
          disabled={isAnalyzing}
          compact={hasResult}
        />
        {phase === 'idle' && (
          <div className="mt-3 hidden sm:block">
            <ConnectedSystemsStrip />
          </div>
        )}
      </div>

      <div className="min-h-0 flex-1 overflow-y-auto px-4 py-6 sm:px-6">
        <AnimatePresence mode="wait">
          {phase === 'idle' && (
            <motion.div key="empty" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}>
              <div className="mx-auto max-w-2xl">
                <AlertsNotificationStrip onViewAlerts={onViewAlerts} />
                <EmptyState onSelectPrompt={handleChip} />
              </div>
            </motion.div>
          )}

          {isAnalyzing && (
            <motion.div
              key="analyzing"
              initial={{ opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0 }}
              className="mx-auto max-w-2xl space-y-4"
            >
              <div className="rounded-lg border border-neutral-800 bg-neutral-900/40 px-4 py-3">
                <p className="text-[10px] uppercase tracking-wider text-neutral-500">Command</p>
                <p className="text-sm text-white">&ldquo;{activePrompt}&rdquo;</p>
              </div>
              {resultType && <DataSourceBadges sources={DATA_SOURCES_BY_RESULT[resultType]} />}
              <AnalysisStepper steps={stepsToShow} currentStepIndex={currentStepIndex} isComplete={false} />
            </motion.div>
          )}

          {hasResult && resultType && (
            <motion.div
              key={`result-${resultType}-${activePrompt}`}
              initial={{ opacity: 0, y: 12 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.35 }}
              className="mx-auto max-w-4xl space-y-4"
            >
              <div className="rounded-lg border border-neutral-800 bg-neutral-900/40 px-4 py-3">
                <p className="text-[10px] uppercase tracking-wider text-neutral-500">Command</p>
                <p className="text-sm text-white">&ldquo;{activePrompt}&rdquo;</p>
              </div>

              <GeneratedResult
                resultType={resultType}
                prompt={activePrompt}
                completedActions={completedActions}
                onAction={handleAction}
                onFollowUp={handleFollowUp}
              />

              {resultType !== 'general' && (
                <FollowUpPrompts
                  prompts={FOLLOW_UP_PROMPTS[resultType]}
                  onSelect={handleFollowUp}
                  disabled={isAnalyzing}
                />
              )}
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    </div>
  );
}

function GeneratedResult({
  resultType,
  prompt,
  completedActions,
  onAction,
  onFollowUp,
}: {
  resultType: ResultType;
  prompt: string;
  completedActions: Set<string>;
  onAction: (id: string) => void;
  onFollowUp: (prompt: string) => void;
}) {
  const props = { completedActions, onAction };

  switch (resultType) {
    case 'urgent-order':
      return <UrgentOrderImpactResult {...props} />;
    case 'rfq-quote':
      return <RFQQuoteResult {...props} />;
    case 'rescheduling':
      return <RescheduleResult {...props} />;
    case 'estimating':
      return <EstimateResult prompt={prompt} {...props} />;
    case 'order-entry':
      return <OrderEntryAppResult {...props} />;
    case 'dashboard':
      return <DashboardResult prompt={prompt} {...props} />;
    default:
      return <GeneralAnalysisResult onFollowUp={onFollowUp} />;
  }
}
