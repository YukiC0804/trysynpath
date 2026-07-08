import { motion } from 'motion/react';
import { Link } from 'react-router-dom';
import { CTA_CONTENT } from '../../data/marketingContent';

export function CallToActionSection() {
  return (
    <section id="contact" className="px-4 py-16 sm:px-6 sm:py-24 lg:px-8">
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        whileInView={{ opacity: 1, y: 0 }}
        viewport={{ once: true }}
        className="mx-auto max-w-3xl rounded-2xl border border-violet-500/25 bg-gradient-to-b from-violet-500/10 to-transparent px-6 py-12 text-center sm:px-12 sm:py-16"
      >
        <h2 className="text-2xl font-semibold tracking-tight text-white sm:text-3xl">
          {CTA_CONTENT.headline}
        </h2>
        <p className="mx-auto mt-4 max-w-xl text-sm leading-relaxed text-neutral-400 sm:text-base">
          {CTA_CONTENT.subheadline}
        </p>
        <div className="mt-8 flex flex-wrap justify-center gap-3">
          <a
            href="mailto:hello@synpath.ai?subject=Workflow%20Assessment"
            className="rounded-lg bg-white px-6 py-3 text-sm font-semibold text-black transition-opacity hover:opacity-90"
          >
            {CTA_CONTENT.primaryCta}
          </a>
          <a
            href="mailto:hello@synpath.ai?subject=Start%20with%20one%20workflow"
            className="rounded-lg border border-neutral-600 px-6 py-3 text-sm font-medium text-neutral-200 transition-colors hover:border-neutral-500 hover:text-white"
          >
            {CTA_CONTENT.secondaryCta}
          </a>
          <Link
            to="/demo"
            className="rounded-lg border border-violet-500/40 px-6 py-3 text-sm font-medium text-violet-300 transition-colors hover:border-violet-500/60 hover:text-violet-200"
          >
            {CTA_CONTENT.demoCta}
          </Link>
        </div>
      </motion.div>
    </section>
  );
}
