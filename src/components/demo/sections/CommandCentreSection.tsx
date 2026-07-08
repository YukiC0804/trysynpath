import { motion, AnimatePresence } from 'motion/react';
import { CommandInput } from '../workspace/CommandInput';
import { AnalysisStepper } from '../workspace/AnalysisStepper';
import { SuggestedPrompts } from '../workspace/SuggestedPrompts';
import { FollowUpPrompts } from '../workspace/FollowUpPrompts';
import { DataSourceBadges } from '../workspace/DataSourceBadges';
import { AlertsNotificationStrip } from '../workspace/AlertsNotificationStrip';
import { ConnectedSystemsStrip } from '../workspace/ConnectedSystemsStrip';
import { UrgentOrderImpactResult } from '../results/UrgentOrderImpactResult';
import { UrgentCapacityResult } from '../results/UrgentCapacityResult';
import { MaterialCoverageResult } from '../results/MaterialCoverageResult';
import { AcrylicPricingResult } from '../results/AcrylicPricingResult';
import { AcrylicInventoryResult } from '../results/AcrylicInventoryResult';
import { RFQQuoteResult } from '../results/RFQQuoteResult';
import { RescheduleResult } from '../results/RescheduleResult';
import { EstimateResult } from '../results/EstimateResult';
import { OrderEntryAppResult } from '../results/OrderEntryAppResult';
import { DashboardResult } from '../results/DashboardResult';
import { GeneralAnalysisResult } from '../results/GeneralAnalysisResult';
import { COMPANY, FOLLOW_UP_PROMPTS, DATA_SOURCES_BY_RESULT, type ResultType } from '../../../data/demoWorkspace';
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
  const isIdle = phase === 'idle';

  const handleSubmit = () => runAnalysis(prompt);
  const handlePromptSelect = (text: string) => {
    setPrompt(text);
    runAnalysis(text);
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
      <AnimatePresence mode="wait">
        {isIdle ? (
          <motion.div
            key="idle"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="flex min-h-0 flex-1 flex-col overflow-y-auto"
          >
            <div className="mx-auto flex w-full max-w-[1000px] flex-1 flex-col px-4 py-6 sm:px-6 sm:py-8">
              {/* Header row */}
              <div className="flex flex-wrap items-start justify-between gap-4">
                <div>
                  <h2 className="text-base font-semibold tracking-tight text-white">Command Centre</h2>
                  <p className="mt-0.5 text-sm text-neutral-400">
                    AI operations agent connected to {COMPANY.name}.
                  </p>
                </div>
                <AlertsNotificationStrip compact onViewAlerts={onViewAlerts} />
              </div>

              {/* Connected systems */}
              <div className="mt-5">
                <ConnectedSystemsStrip />
              </div>

              {/* Main command area — centered, slightly below middle */}
              <div className="flex flex-1 flex-col justify-center py-10 sm:py-14">
                <div className="mx-auto w-full max-w-[1000px]">
                  <div className="mb-8 text-center sm:mb-10">
                    <h1 className="mx-auto max-w-3xl text-xl font-semibold leading-snug tracking-tight text-white sm:text-2xl">
                      What do you want the operations agent to investigate, decide, or build?
                    </h1>
                    <p className="mx-auto mt-3 max-w-2xl text-sm leading-relaxed text-neutral-400">
                      Ask about orders, RFQs, machines, inventory, capacity, or operations — connected to{' '}
                      {COMPANY.name} data.
                    </p>
                  </div>

                  <CommandInput
                    value={prompt}
                    onChange={setPrompt}
                    onSubmit={handleSubmit}
                    variant="hero"
                  />

                  <div className="mt-10">
                    <SuggestedPrompts onSelectPrompt={handlePromptSelect} />
                  </div>
                </div>
              </div>
            </div>
          </motion.div>
        ) : (
          <motion.div
            key="active"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="flex min-h-0 flex-1 flex-col"
          >
            <div className="shrink-0 border-b border-neutral-800 bg-black/40 px-4 py-4 sm:px-6">
              <div className="mx-auto max-w-4xl">
                <CommandInput
                  value={prompt}
                  onChange={setPrompt}
                  onSubmit={handleSubmit}
                  disabled={isAnalyzing}
                  variant="compact"
                />
              </div>
            </div>

            <div className="min-h-0 flex-1 overflow-y-auto px-4 py-6 sm:px-6">
              {isAnalyzing && (
                <motion.div
                  initial={{ opacity: 0, y: 8 }}
                  animate={{ opacity: 1, y: 0 }}
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
            </div>
          </motion.div>
        )}
      </AnimatePresence>
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
    case 'urgent-capacity':
      return <UrgentCapacityResult {...props} />;
    case 'material-coverage':
      return <MaterialCoverageResult {...props} />;
    case 'acrylic-pricing':
      return <AcrylicPricingResult {...props} />;
    case 'acrylic-inventory':
      return <AcrylicInventoryResult {...props} />;
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
