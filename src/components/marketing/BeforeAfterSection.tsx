import { motion } from 'motion/react';
import { Mail, FileSpreadsheet, Clock, CheckCircle2 } from 'lucide-react';
import { BEFORE_AFTER } from '../../data/marketingContent';
import { MarketingSection } from './MarketingSection';

export function BeforeAfterSection() {
  return (
    <MarketingSection
      headline={BEFORE_AFTER.headline}
      subheadline={BEFORE_AFTER.subheadline}
    >
      <div className="grid gap-6 lg:grid-cols-2">
        {/* Before */}
        <motion.div
          initial={{ opacity: 0, x: -20 }}
          whileInView={{ opacity: 1, x: 0 }}
          viewport={{ once: true }}
          className="rounded-xl border border-neutral-800 bg-[#0a0a0a] p-6"
        >
          <h3 className="mb-4 text-sm font-semibold text-neutral-400">{BEFORE_AFTER.before.title}</h3>
          <ul className="mb-6 space-y-2">
            {BEFORE_AFTER.before.items.map((item) => (
              <li key={item} className="flex items-start gap-2 text-sm text-neutral-400">
                <span className="mt-1.5 h-1 w-1 shrink-0 rounded-full bg-neutral-600" />
                {item}
              </li>
            ))}
          </ul>

          <div className="relative h-36 overflow-hidden rounded-lg border border-neutral-800 bg-neutral-900/40 p-3">
            <motion.div
              animate={{ y: [0, -4, 0], rotate: [-1, 1, -1] }}
              transition={{ duration: 4, repeat: Infinity }}
              className="absolute left-3 top-3 flex items-center gap-2 rounded border border-neutral-700 bg-neutral-900 px-2 py-1.5 text-[10px] text-neutral-400"
            >
              <Mail className="h-3 w-3" /> Supplier email
            </motion.div>
            <motion.div
              animate={{ y: [0, 3, 0], rotate: [1, -1, 1] }}
              transition={{ duration: 3.5, repeat: Infinity, delay: 0.5 }}
              className="absolute right-4 top-8 flex items-center gap-2 rounded border border-neutral-700 bg-neutral-900 px-2 py-1.5 text-[10px] text-neutral-400"
            >
              <FileSpreadsheet className="h-3 w-3" /> Pricing.xlsx
            </motion.div>
            <motion.div
              animate={{ opacity: [0.6, 1, 0.6] }}
              transition={{ duration: 2, repeat: Infinity }}
              className="absolute bottom-3 left-1/2 flex -translate-x-1/2 items-center gap-1.5 rounded-full border border-amber-500/30 bg-amber-500/10 px-2.5 py-1 text-[10px] text-amber-400"
            >
              <Clock className="h-3 w-3" /> Delayed
            </motion.div>
          </div>
        </motion.div>

        {/* After */}
        <motion.div
          initial={{ opacity: 0, x: 20 }}
          whileInView={{ opacity: 1, x: 0 }}
          viewport={{ once: true }}
          className="rounded-xl border border-violet-500/20 bg-violet-500/5 p-6"
        >
          <h3 className="mb-4 text-sm font-semibold text-violet-300">{BEFORE_AFTER.after.title}</h3>
          <ul className="mb-6 space-y-2">
            {BEFORE_AFTER.after.items.map((item) => (
              <li key={item} className="flex items-start gap-2 text-sm text-neutral-200">
                <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-emerald-400" />
                {item}
              </li>
            ))}
          </ul>

          <div className="relative h-36 overflow-hidden rounded-lg border border-violet-500/20 bg-black/40 p-3">
            <div className="grid h-full grid-cols-3 gap-2 text-[9px]">
              {['Supplier data', 'Freight', 'Quote'].map((col, i) => (
                <motion.div
                  key={col}
                  initial={{ opacity: 0, y: 8 }}
                  whileInView={{ opacity: 1, y: 0 }}
                  viewport={{ once: true }}
                  transition={{ delay: i * 0.15 }}
                  className="flex flex-col rounded border border-neutral-700 bg-neutral-900/80 p-2"
                >
                  <span className="mb-1 font-medium text-neutral-400">{col}</span>
                  <motion.div
                    animate={{ opacity: [0.5, 1, 0.5] }}
                    transition={{ duration: 2, repeat: Infinity, delay: i * 0.4 }}
                    className="mt-auto rounded bg-violet-500/20 px-1 py-0.5 text-violet-300"
                  >
                    Structured
                  </motion.div>
                </motion.div>
              ))}
            </div>
            <motion.div
              animate={{ opacity: [0.7, 1, 0.7] }}
              transition={{ duration: 2, repeat: Infinity }}
              className="absolute bottom-2 right-2 rounded-full border border-emerald-500/30 bg-emerald-500/10 px-2 py-0.5 text-[9px] font-semibold text-emerald-400"
            >
              Quote ready
            </motion.div>
          </div>
        </motion.div>
      </div>
    </MarketingSection>
  );
}
