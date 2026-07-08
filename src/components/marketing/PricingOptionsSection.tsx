import { motion } from 'motion/react';
import { Check } from 'lucide-react';
import { PRICING_OPTIONS, PRICING_PLACEHOLDERS } from '../../data/marketingContent';
import { MarketingSection } from './MarketingSection';

export function PricingOptionsSection() {
  return (
    <MarketingSection
      id="pricing"
      headline="Pricing options"
      subheadline="Flexible packages to match your operational maturity. Pricing placeholders are editable — final fees depend on workflow scope and integration depth."
    >
      <div className="grid gap-6 lg:grid-cols-3">
        {PRICING_OPTIONS.map((option, i) => (
          <motion.article
            key={option.id}
            initial={{ opacity: 0, y: 20 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true }}
            transition={{ delay: i * 0.1 }}
            className={`flex flex-col rounded-xl border p-6 ${
              option.highlighted
                ? 'border-violet-500/40 bg-violet-500/5 ring-1 ring-violet-500/20'
                : 'border-neutral-800 bg-[#0a0a0a]'
            }`}
          >
            {option.highlighted && (
              <span className="mb-3 self-start rounded-full border border-violet-500/30 bg-violet-500/15 px-2.5 py-0.5 text-[10px] font-semibold uppercase tracking-wider text-violet-300">
                Most popular
              </span>
            )}
            <h3 className="text-lg font-semibold text-white">{option.name}</h3>
            <p className="mt-2 text-xs leading-relaxed text-neutral-400">{option.description}</p>

            <div className="my-5 space-y-1 border-y border-neutral-800 py-4">
              <p className="text-sm text-neutral-300">
                Setup fee: <span className="font-semibold text-white">{PRICING_PLACEHOLDERS.setupFee}</span>
              </p>
              <p className="text-sm text-neutral-300">
                Monthly fee: <span className="font-semibold text-white">{PRICING_PLACEHOLDERS.monthlyFee}</span>
              </p>
              <p className="text-xs text-neutral-500">{PRICING_PLACEHOLDERS.performance}</p>
            </div>

            <ul className="mb-6 flex-1 space-y-2">
              {option.features.map((feature) => (
                <li key={feature} className="flex items-start gap-2 text-xs text-neutral-300">
                  <Check className="mt-0.5 h-3.5 w-3.5 shrink-0 text-emerald-400" />
                  {feature}
                </li>
              ))}
            </ul>

            <a
              href="#contact"
              className={`rounded-lg px-4 py-2.5 text-center text-xs font-semibold transition-opacity hover:opacity-90 ${
                option.highlighted ? 'bg-white text-black' : 'border border-neutral-700 text-neutral-200'
              }`}
            >
              Discuss this option
            </a>
          </motion.article>
        ))}
      </div>
    </MarketingSection>
  );
}
