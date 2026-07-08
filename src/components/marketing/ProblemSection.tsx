import type { ReactNode } from 'react';
import { motion } from 'motion/react';
import { Mail, FileSpreadsheet, Clock, AlertTriangle } from 'lucide-react';
import { PROBLEM_CONTENT } from '../../data/marketingContent';
import { MarketingSection } from './MarketingSection';

export function ProblemSection() {
  return (
    <MarketingSection
      headline={PROBLEM_CONTENT.headline}
      subheadline={PROBLEM_CONTENT.subheadline}
      dark={false}
    >
      <div className="grid gap-8 lg:grid-cols-2 lg:gap-12">
        <motion.ul
          initial={{ opacity: 0, x: -16 }}
          whileInView={{ opacity: 1, x: 0 }}
          viewport={{ once: true }}
          transition={{ duration: 0.45 }}
          className="space-y-3"
        >
          {PROBLEM_CONTENT.painPoints.map((point, i) => (
            <motion.li
              key={point}
              initial={{ opacity: 0, x: -12 }}
              whileInView={{ opacity: 1, x: 0 }}
              viewport={{ once: true }}
              transition={{ delay: i * 0.08 }}
              className="flex items-start gap-3 rounded-lg border border-neutral-800 bg-neutral-900/40 px-4 py-3 text-sm text-neutral-300"
            >
              <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-amber-400/80" />
              {point}
            </motion.li>
          ))}
        </motion.ul>

        <motion.div
          initial={{ opacity: 0, x: 16 }}
          whileInView={{ opacity: 1, x: 0 }}
          viewport={{ once: true }}
          transition={{ duration: 0.45 }}
          className="relative rounded-xl border border-neutral-800 bg-[#0a0a0a] p-6"
        >
          <p className="mb-4 text-[10px] font-semibold uppercase tracking-wider text-neutral-500">
            Typical operations inbox
          </p>
          <div className="space-y-3">
            <ChaosCard icon={<Mail className="h-4 w-4" />} label="Supplier thread · 14 unread" delay={0} />
            <ChaosCard icon={<FileSpreadsheet className="h-4 w-4" />} label="Freight comparison.xlsx · outdated" delay={0.15} />
            <ChaosCard icon={<Clock className="h-4 w-4" />} label="RFQ follow-up · 3 days overdue" delay={0.3} variant="warning" />
            <ChaosCard icon={<Mail className="h-4 w-4" />} label="Customer chase · awaiting quote" delay={0.45} variant="danger" />
          </div>
        </motion.div>
      </div>
    </MarketingSection>
  );
}

function ChaosCard({
  icon,
  label,
  delay,
  variant = 'neutral',
}: {
  icon: ReactNode;
  label: string;
  delay: number;
  variant?: 'neutral' | 'warning' | 'danger';
}) {
  const border =
    variant === 'danger'
      ? 'border-red-500/30'
      : variant === 'warning'
        ? 'border-amber-500/30'
        : 'border-neutral-700';

  return (
    <motion.div
      animate={{ x: [0, 2, -1, 0], opacity: [0.85, 1, 0.9, 0.85] }}
      transition={{ duration: 4, repeat: Infinity, delay }}
      className={`flex items-center gap-3 rounded-lg border ${border} bg-neutral-900/60 px-3 py-2.5 text-xs text-neutral-400`}
    >
      <span className="text-neutral-500">{icon}</span>
      {label}
    </motion.div>
  );
}
