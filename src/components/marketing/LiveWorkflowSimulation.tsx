import { useEffect, useState } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { Check, Mail, Package, Truck, FileText, UserCheck } from 'lucide-react';
import { WORKFLOW_SIMULATION } from '../../data/marketingContent';
import { MarketingSection } from './MarketingSection';

const STEP_ICONS = [Mail, FileText, Mail, Package, Truck, FileText, UserCheck];
const STEP_DURATION_MS = 3800;

export function LiveWorkflowSimulation() {
  const [activeStep, setActiveStep] = useState(0);
  const steps = WORKFLOW_SIMULATION.steps;

  useEffect(() => {
    const timer = window.setInterval(() => {
      setActiveStep((prev) => (prev + 1) % steps.length);
    }, STEP_DURATION_MS);
    return () => window.clearInterval(timer);
  }, [steps.length]);

  const step = steps[activeStep];
  const Icon = STEP_ICONS[activeStep] ?? FileText;

  return (
    <MarketingSection
      id="workflow"
      headline={WORKFLOW_SIMULATION.headline}
      subheadline={WORKFLOW_SIMULATION.subheadline}
    >
      {/* Progress steps */}
      <div className="mb-8 hidden gap-1 sm:flex">
        {steps.map((s, i) => (
          <button
            key={s.id}
            type="button"
            onClick={() => setActiveStep(i)}
            className="group flex flex-1 flex-col items-center gap-2"
          >
            <div
              className={`flex h-8 w-8 items-center justify-center rounded-full border text-xs font-medium transition-colors ${
                i <= activeStep
                  ? 'border-violet-500/50 bg-violet-500/15 text-violet-300'
                  : 'border-neutral-700 bg-neutral-900 text-neutral-500'
              }`}
            >
              {i < activeStep ? <Check className="h-3.5 w-3.5" /> : i + 1}
            </div>
            <span
              className={`hidden text-center text-[10px] leading-tight lg:block ${
                i === activeStep ? 'text-white' : 'text-neutral-500'
              }`}
            >
              {s.title}
            </span>
          </button>
        ))}
      </div>

      {/* Mobile progress */}
      <div className="mb-6 sm:hidden">
        <div className="mb-2 flex justify-between text-xs text-neutral-500">
          <span>Step {activeStep + 1} of {steps.length}</span>
          <span>{Math.round(((activeStep + 1) / steps.length) * 100)}%</span>
        </div>
        <div className="h-1 overflow-hidden rounded-full bg-neutral-800">
          <motion.div
            className="h-full bg-violet-500"
            animate={{ width: `${((activeStep + 1) / steps.length) * 100}%` }}
            transition={{ duration: 0.4 }}
          />
        </div>
      </div>

      <AnimatePresence mode="wait">
        <motion.div
          key={step.id}
          initial={{ opacity: 0, y: 12 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0, y: -8 }}
          transition={{ duration: 0.35 }}
          className="rounded-xl border border-neutral-800 bg-[#0a0a0a] p-6 sm:p-8"
        >
          <div className="mb-6 flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-lg border border-violet-500/30 bg-violet-500/10">
              <Icon className="h-5 w-5 text-violet-400" />
            </div>
            <div>
              <p className="text-[10px] font-semibold uppercase tracking-wider text-violet-400">
                Step {activeStep + 1}
              </p>
              <h3 className="text-lg font-semibold text-white">{step.title}</h3>
            </div>
          </div>

          <StepContent step={step} />
        </motion.div>
      </AnimatePresence>
    </MarketingSection>
  );
}

function StepContent({ step }: { step: (typeof WORKFLOW_SIMULATION.steps)[number] }) {
  switch (step.id) {
    case 'rfq-received':
      return (
        <motion.div
          initial={{ scale: 0.95 }}
          animate={{ scale: 1 }}
          className="rounded-lg border border-emerald-500/25 bg-emerald-500/5 px-4 py-3"
        >
          <p className="text-sm font-medium text-emerald-300">{step.description}</p>
          <p className="mt-1 text-xs text-neutral-400">{step.detail}</p>
        </motion.div>
      );

    case 'extract':
      return (
        <div className="grid gap-2 sm:grid-cols-2">
          {step.fields?.map((field, i) => (
            <motion.div
              key={field}
              initial={{ opacity: 0, x: -8 }}
              animate={{ opacity: 1, x: 0 }}
              transition={{ delay: i * 0.12 }}
              className="rounded-lg border border-neutral-700 bg-neutral-900/60 px-3 py-2 text-xs text-neutral-300"
            >
              <span className="text-violet-400">▸</span> {field}
            </motion.div>
          ))}
        </div>
      );

    case 'suppliers':
      return (
        <div className="flex flex-wrap gap-3">
          {step.suppliers?.map((supplier, i) => (
            <motion.div
              key={supplier}
              initial={{ opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: i * 0.2 }}
              className="flex items-center gap-2 rounded-lg border border-neutral-700 bg-neutral-900/60 px-3 py-2"
            >
              <Mail className="h-3.5 w-3.5 text-sky-400" />
              <span className="text-xs text-neutral-300">Sent to {supplier}</span>
              <motion.span
                animate={{ opacity: [0, 1, 0] }}
                transition={{ duration: 1.5, repeat: Infinity, delay: i * 0.3 }}
                className="text-[10px] text-sky-400"
              >
                →
              </motion.span>
            </motion.div>
          ))}
        </div>
      );

    case 'replies':
      return (
        <div className="overflow-x-auto">
          <table className="w-full min-w-[320px] text-left text-xs">
            <thead>
              <tr className="border-b border-neutral-800 text-neutral-500">
                <th className="pb-2 pr-4 font-medium">Supplier</th>
                <th className="pb-2 pr-4 font-medium">Price</th>
                <th className="pb-2 font-medium">Lead time</th>
              </tr>
            </thead>
            <tbody>
              {step.replies?.map((reply, i) => (
                <motion.tr
                  key={reply.supplier}
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  transition={{ delay: i * 0.25 }}
                  className="border-b border-neutral-800/50"
                >
                  <td className="py-2.5 pr-4 text-neutral-200">{reply.supplier}</td>
                  <td className="py-2.5 pr-4 text-emerald-400">{reply.price}</td>
                  <td className="py-2.5 text-neutral-400">{reply.lead}</td>
                </motion.tr>
              ))}
            </tbody>
          </table>
        </div>
      );

    case 'freight':
      return (
        <div className="grid gap-2 sm:grid-cols-3">
          {step.freight?.map((f, i) => (
            <motion.div
              key={f.provider}
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              transition={{ delay: i * 0.2 }}
              className={`rounded-lg border px-3 py-3 ${
                i === 1 ? 'border-violet-500/40 bg-violet-500/10' : 'border-neutral-700 bg-neutral-900/60'
              }`}
            >
              <div className="flex items-center gap-2">
                <Truck className="h-3.5 w-3.5 text-neutral-400" />
                <span className="text-xs font-medium text-white">{f.provider}</span>
              </div>
              <p className="mt-2 text-sm font-semibold text-white">{f.cost}</p>
              <p className="text-[10px] text-neutral-500">ETA {f.eta}</p>
              {i === 1 && (
                <span className="mt-2 inline-block rounded bg-violet-500/20 px-1.5 py-0.5 text-[9px] font-semibold uppercase text-violet-300">
                  Best value
                </span>
              )}
            </motion.div>
          ))}
        </div>
      );

    case 'quote':
      return step.quote ? (
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
          {[
            { label: 'Unit cost', value: step.quote.unitCost },
            { label: 'Freight', value: step.quote.freight },
            { label: 'Margin', value: step.quote.margin },
            { label: 'Total quote', value: step.quote.total },
            { label: 'Delivery', value: step.quote.delivery },
          ].map((item, i) => (
            <motion.div
              key={item.label}
              initial={{ opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: i * 0.1 }}
              className="rounded-lg border border-neutral-700 bg-neutral-900/60 px-3 py-2.5"
            >
              <p className="text-[10px] uppercase tracking-wider text-neutral-500">{item.label}</p>
              <p className="mt-0.5 text-sm font-semibold text-white">{item.value}</p>
            </motion.div>
          ))}
        </div>
      ) : null;

    case 'approval':
      return (
        <div className="space-y-4">
          <div className="rounded-lg border border-emerald-500/25 bg-emerald-500/5 px-4 py-3">
            <p className="text-sm font-medium text-emerald-300">{step.description}</p>
          </div>
          <div className="flex flex-wrap gap-2">
            {step.actions?.map((action, i) => (
              <motion.button
                key={action}
                type="button"
                initial={{ opacity: 0, scale: 0.95 }}
                animate={{ opacity: 1, scale: 1 }}
                transition={{ delay: i * 0.15 }}
                className={`rounded-lg px-4 py-2 text-xs font-semibold ${
                  action === 'Approve'
                    ? 'bg-white text-black'
                    : action === 'Edit'
                      ? 'border border-neutral-600 text-neutral-200'
                      : 'border border-amber-500/40 text-amber-300'
                }`}
              >
                {action}
              </motion.button>
            ))}
          </div>
          <p className="text-xs text-neutral-500">
            The AI does the repetitive work — your team approves before anything goes to the customer.
          </p>
        </div>
      );

    default:
      return <p className="text-sm text-neutral-400">{step.description}</p>;
  }
}
