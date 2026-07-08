import { useEffect, useState } from 'react';
import { motion } from 'motion/react';
import { IMPLEMENTATION_ROADMAP } from '../../data/marketingContent';
import { MarketingSection } from './MarketingSection';

export function ImplementationRoadmap() {
  const [activePhase, setActivePhase] = useState(0);
  const phases = IMPLEMENTATION_ROADMAP.phases;

  useEffect(() => {
    const timer = window.setInterval(() => {
      setActivePhase((prev) => (prev + 1) % phases.length);
    }, 4000);
    return () => window.clearInterval(timer);
  }, [phases.length]);

  return (
    <MarketingSection
      headline={IMPLEMENTATION_ROADMAP.headline}
      subheadline={IMPLEMENTATION_ROADMAP.subheadline}
      dark={false}
    >
      <div className="relative">
        {/* Timeline line */}
        <div className="absolute left-4 top-0 hidden h-full w-px bg-neutral-800 sm:left-1/2 sm:block" />

        <div className="space-y-8">
          {phases.map((phase, i) => {
            const isActive = i === activePhase;
            const isComplete = i < activePhase;

            return (
              <motion.div
                key={phase.phase}
                initial={{ opacity: 0, y: 16 }}
                whileInView={{ opacity: 1, y: 0 }}
                viewport={{ once: true }}
                transition={{ delay: i * 0.1 }}
                className={`relative flex flex-col gap-4 sm:flex-row sm:items-center ${
                  i % 2 === 0 ? 'sm:flex-row' : 'sm:flex-row-reverse'
                }`}
              >
                <div className={`flex-1 ${i % 2 === 0 ? 'sm:pr-12 sm:text-right' : 'sm:pl-12'}`}>
                  <div
                    className={`rounded-xl border p-5 transition-colors ${
                      isActive
                        ? 'border-violet-500/40 bg-violet-500/10'
                        : isComplete
                          ? 'border-emerald-500/20 bg-emerald-500/5'
                          : 'border-neutral-800 bg-[#0a0a0a]'
                    }`}
                  >
                    <p className="text-[10px] font-semibold uppercase tracking-wider text-violet-400">
                      Phase {phase.phase}
                    </p>
                    <h3 className="mt-1 text-base font-semibold text-white">{phase.title}</h3>
                    <p className="mt-2 text-xs text-neutral-400">{phase.examples}</p>
                    <p className="mt-3 text-[10px] font-medium uppercase tracking-wider text-neutral-500">
                      {phase.metric}
                    </p>
                  </div>
                </div>

                <div className="absolute left-4 hidden -translate-x-1/2 sm:left-1/2 sm:block">
                  <motion.div
                    animate={{
                      scale: isActive ? 1.2 : 1,
                      borderColor: isActive
                        ? 'rgba(139,92,246,0.8)'
                        : isComplete
                          ? 'rgba(16,185,129,0.6)'
                          : 'rgba(64,64,64,0.8)',
                    }}
                    className={`flex h-8 w-8 items-center justify-center rounded-full border-2 bg-black text-xs font-bold ${
                      isActive ? 'text-violet-300' : isComplete ? 'text-emerald-400' : 'text-neutral-500'
                    }`}
                  >
                    {phase.phase}
                  </motion.div>
                </div>

                <div className="flex-1 sm:hidden">
                  <div className="ml-8 h-px bg-neutral-800" />
                </div>
              </motion.div>
            );
          })}
        </div>
      </div>
    </MarketingSection>
  );
}
