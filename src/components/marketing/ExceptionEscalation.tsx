import { motion } from 'motion/react';
import { CheckCircle2, AlertCircle } from 'lucide-react';
import { EXCEPTION_ESCALATION } from '../../data/marketingContent';
import { MarketingSection } from './MarketingSection';

const SEVERITY_STYLES = {
  warning: 'border-amber-500/30 bg-amber-500/10 text-amber-300',
  danger: 'border-red-500/30 bg-red-500/10 text-red-300',
  neutral: 'border-neutral-600 bg-neutral-900/60 text-neutral-300',
};

export function ExceptionEscalation() {
  return (
    <MarketingSection
      headline={EXCEPTION_ESCALATION.headline}
      subheadline={EXCEPTION_ESCALATION.subheadline}
      dark={false}
    >
      <div className="grid gap-8 lg:grid-cols-2">
        {/* Auto-completed */}
        <div className="rounded-xl border border-neutral-800 bg-[#0a0a0a] p-6">
          <p className="mb-4 text-[10px] font-semibold uppercase tracking-wider text-emerald-400">
            Completed automatically
          </p>
          <ul className="space-y-2">
            {EXCEPTION_ESCALATION.autoCompleted.map((task, i) => (
              <motion.li
                key={task}
                initial={{ opacity: 0, x: -8 }}
                whileInView={{ opacity: 1, x: 0 }}
                viewport={{ once: true }}
                transition={{ delay: i * 0.08 }}
                className="flex items-center gap-2 text-sm text-neutral-300"
              >
                <CheckCircle2 className="h-4 w-4 text-emerald-400" />
                {task}
              </motion.li>
            ))}
          </ul>
        </div>

        {/* Exception queue */}
        <div className="rounded-xl border border-amber-500/20 bg-amber-500/5 p-6">
          <p className="mb-4 text-[10px] font-semibold uppercase tracking-wider text-amber-400">
            {EXCEPTION_ESCALATION.queueLabel}
          </p>
          <div className="space-y-2">
            {EXCEPTION_ESCALATION.exceptions.map((exc, i) => (
              <motion.div
                key={exc.label}
                initial={{ opacity: 0, x: 20 }}
                whileInView={{ opacity: 1, x: 0 }}
                viewport={{ once: true }}
                transition={{ delay: i * 0.1 }}
                className={`flex items-center gap-2 rounded-lg border px-3 py-2.5 text-xs ${SEVERITY_STYLES[exc.severity]}`}
              >
                <AlertCircle className="h-3.5 w-3.5 shrink-0" />
                {exc.label}
              </motion.div>
            ))}
          </div>
        </div>
      </div>
    </MarketingSection>
  );
}
