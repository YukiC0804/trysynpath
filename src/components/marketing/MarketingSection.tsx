import type { ReactNode } from 'react';
import { motion } from 'motion/react';

interface MarketingSectionProps {
  id?: string;
  headline: string;
  subheadline?: string;
  children: ReactNode;
  className?: string;
  dark?: boolean;
}

export function MarketingSection({
  id,
  headline,
  subheadline,
  children,
  className = '',
  dark = true,
}: MarketingSectionProps) {
  return (
    <section
      id={id}
      className={`px-4 py-16 sm:px-6 sm:py-24 lg:px-8 ${dark ? 'bg-black' : 'bg-[#0a0a0a]'} ${className}`}
    >
      <div className="mx-auto max-w-6xl">
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true, margin: '-80px' }}
          transition={{ duration: 0.45 }}
          className="mb-10 text-center sm:mb-14"
        >
          <h2 className="text-2xl font-semibold tracking-tight text-white sm:text-3xl lg:text-4xl">
            {headline}
          </h2>
          {subheadline && (
            <p className="mx-auto mt-4 max-w-3xl text-sm leading-relaxed text-neutral-400 sm:text-base">
              {subheadline}
            </p>
          )}
        </motion.div>
        {children}
      </div>
    </section>
  );
}
