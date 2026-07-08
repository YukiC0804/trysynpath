import { motion } from 'motion/react';
import { Mail, Package, Truck, FileText } from 'lucide-react';
import { USE_CASES } from '../../data/marketingContent';
import { MarketingSection } from './MarketingSection';

const USE_CASE_ICONS = {
  'supplier-pricing': Mail,
  inventory: Package,
  freight: Truck,
  'rfq-quote': FileText,
} as const;

export function UseCaseCards() {
  return (
    <MarketingSection
      id="use-cases"
      headline="Four workflows. One operating assistant."
      subheadline="Synpath AI automates repetitive operational tasks across supplier, inventory, freight, and quoting — with human approval where it matters."
      dark={false}
    >
      <div className="grid gap-6 sm:grid-cols-2">
        {USE_CASES.map((useCase, i) => {
          const Icon = USE_CASE_ICONS[useCase.id];
          return (
            <motion.article
              key={useCase.id}
              initial={{ opacity: 0, y: 20 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true }}
              transition={{ delay: i * 0.1, duration: 0.45 }}
              className="flex flex-col rounded-xl border border-neutral-800 bg-[#0a0a0a] overflow-hidden"
            >
              <div className="border-b border-neutral-800 bg-neutral-900/40 px-4 py-3">
                <div className="flex items-center gap-2">
                  <Icon className="h-4 w-4 text-violet-400" />
                  <h3 className="text-sm font-semibold text-white">{useCase.headline}</h3>
                </div>
                <p className="mt-2 text-xs leading-relaxed text-neutral-400">{useCase.value}</p>
              </div>
              <div className="relative h-44 overflow-hidden p-4">
                <UseCaseAnimation id={useCase.id} />
              </div>
              <div className="border-t border-neutral-800 px-4 py-2.5">
                <span className="inline-flex rounded-full border border-violet-500/25 bg-violet-500/10 px-2.5 py-0.5 text-[10px] font-semibold uppercase tracking-wider text-violet-300">
                  {useCase.tag}
                </span>
              </div>
            </motion.article>
          );
        })}
      </div>
    </MarketingSection>
  );
}

function UseCaseAnimation({ id }: { id: (typeof USE_CASES)[number]['id'] }) {
  switch (id) {
    case 'supplier-pricing':
      return <SupplierPricingAnimation />;
    case 'inventory':
      return <InventoryAnimation />;
    case 'freight':
      return <FreightAnimation />;
    case 'rfq-quote':
      return <RfqQuoteAnimation />;
    default:
      return null;
  }
}

function SupplierPricingAnimation() {
  return (
    <div className="space-y-2">
      {['Request sent', 'Reminder sent', 'Reply received', 'Price extracted'].map((label, i) => (
        <motion.div
          key={label}
          animate={{ opacity: [0.4, 1, 0.4], x: [0, 4, 0] }}
          transition={{ duration: 3, repeat: Infinity, delay: i * 0.6 }}
          className="flex items-center justify-between rounded border border-neutral-700 bg-neutral-900/60 px-2.5 py-1.5 text-[10px]"
        >
          <span className="text-neutral-400">{label}</span>
          <span className="text-emerald-400">{i === 3 ? '£12.40/unit' : '✓'}</span>
        </motion.div>
      ))}
      <motion.div
        animate={{ opacity: [0.6, 1, 0.6] }}
        transition={{ duration: 2, repeat: Infinity }}
        className="mt-2 rounded border border-neutral-700 bg-black/40 p-2"
      >
        <div className="grid grid-cols-3 gap-1 text-[9px] text-neutral-500">
          <span>Supplier</span>
          <span>Price</span>
          <span>Lead</span>
        </div>
        <div className="mt-1 grid grid-cols-3 gap-1 text-[10px] text-neutral-300">
          <span>MetalWorks</span>
          <span className="text-emerald-400">£12.40</span>
          <span>14d</span>
        </div>
      </motion.div>
    </div>
  );
}

function InventoryAnimation() {
  const bars = [
    { label: 'Alu 7075', pct: 72, status: 'ok' },
    { label: 'Steel 316L', pct: 28, status: 'low' },
    { label: 'PKG-44', pct: 45, status: 'warn' },
  ];

  return (
    <div className="space-y-3">
      {bars.map((bar, i) => (
        <div key={bar.label}>
          <div className="mb-1 flex justify-between text-[10px]">
            <span className="text-neutral-400">{bar.label}</span>
            <span
              className={
                bar.status === 'low' ? 'text-red-400' : bar.status === 'warn' ? 'text-amber-400' : 'text-emerald-400'
              }
            >
              {bar.pct}%
            </span>
          </div>
          <div className="h-1.5 overflow-hidden rounded-full bg-neutral-800">
            <motion.div
              className={`h-full rounded-full ${
                bar.status === 'low' ? 'bg-red-500' : bar.status === 'warn' ? 'bg-amber-500' : 'bg-emerald-500'
              }`}
              animate={{ width: [`${bar.pct - 5}%`, `${bar.pct}%`, `${bar.pct - 5}%`] }}
              transition={{ duration: 2.5, repeat: Infinity, delay: i * 0.3 }}
            />
          </div>
        </div>
      ))}
      <motion.div
        animate={{ opacity: [0.5, 1, 0.5] }}
        transition={{ duration: 2, repeat: Infinity }}
        className="rounded border border-amber-500/30 bg-amber-500/10 px-2 py-1 text-[10px] text-amber-300"
      >
        Alert: Steel 316L below reorder point
      </motion.div>
    </div>
  );
}

function FreightAnimation() {
  const options = [
    { name: 'Northline', price: '£1,240', rank: 2 },
    { name: 'EuroShip', price: '£1,180', rank: 1 },
    { name: 'RapidHaul', price: '£1,320', rank: 3 },
  ];

  return (
    <div className="space-y-2">
      {options.map((opt, i) => (
        <motion.div
          key={opt.name}
          animate={{
            borderColor:
              opt.rank === 1
                ? ['rgba(139,92,246,0.2)', 'rgba(139,92,246,0.6)', 'rgba(139,92,246,0.2)']
                : 'rgba(64,64,64,0.8)',
          }}
          transition={{ duration: 2.5, repeat: Infinity, delay: i * 0.2 }}
          className={`flex items-center justify-between rounded border px-2.5 py-1.5 text-[10px] ${
            opt.rank === 1 ? 'border-violet-500/40 bg-violet-500/10' : 'border-neutral-700 bg-neutral-900/60'
          }`}
        >
          <span className="text-neutral-300">{opt.name}</span>
          <span className="font-medium text-white">{opt.price}</span>
          {opt.rank === 1 && <span className="text-violet-400">#1</span>}
        </motion.div>
      ))}
    </div>
  );
}

function RfqQuoteAnimation() {
  const items = ['RFQ data', 'Supplier cost', 'Freight', 'Margin', 'Draft quote'];

  return (
    <div className="flex flex-col items-center justify-center gap-2 py-2">
      {items.map((item, i) => (
        <motion.div
          key={item}
          initial={{ opacity: 0, x: -10 }}
          animate={{ opacity: [0.3, 1, 0.3], x: 0 }}
          transition={{ duration: 3, repeat: Infinity, delay: i * 0.5 }}
          className="flex w-full items-center gap-2 text-[10px]"
        >
          <span className="w-20 text-right text-neutral-500">{item}</span>
          <motion.div
            className="h-px flex-1 bg-violet-500/40"
            animate={{ scaleX: [0, 1, 0] }}
            transition={{ duration: 3, repeat: Infinity, delay: i * 0.5 }}
            style={{ transformOrigin: 'left' }}
          />
          <span className="w-16 text-violet-300">→</span>
        </motion.div>
      ))}
      <motion.div
        animate={{ scale: [0.98, 1, 0.98] }}
        transition={{ duration: 2, repeat: Infinity }}
        className="mt-1 w-full rounded border border-emerald-500/30 bg-emerald-500/10 px-3 py-2 text-center text-[10px] font-medium text-emerald-300"
      >
        Quote draft ready · £31,480
      </motion.div>
    </div>
  );
}
