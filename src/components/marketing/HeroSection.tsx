import { motion } from 'motion/react';
import { Link } from 'react-router-dom';
import { HERO_CONTENT, WORKFLOW_NODES } from '../../data/marketingContent';

const NODE_POSITIONS = [
  { x: 50, y: 8, label: WORKFLOW_NODES[0] },
  { x: 82, y: 22, label: WORKFLOW_NODES[1] },
  { x: 92, y: 50, label: WORKFLOW_NODES[2] },
  { x: 82, y: 78, label: WORKFLOW_NODES[3] },
  { x: 50, y: 92, label: WORKFLOW_NODES[4] },
  { x: 18, y: 78, label: WORKFLOW_NODES[5] },
  { x: 8, y: 50, label: WORKFLOW_NODES[6] },
];

export function HeroSection() {
  return (
    <section className="relative overflow-hidden px-4 pb-16 pt-12 sm:px-6 sm:pb-24 sm:pt-16 lg:px-8">
      <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(ellipse_at_center,rgba(139,92,246,0.08),transparent_65%)]" />

      <div className="relative mx-auto max-w-6xl">
        <div className="grid items-center gap-12 lg:grid-cols-2 lg:gap-16">
          <motion.div
            initial={{ opacity: 0, y: 24 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.5 }}
          >
            <p className="mb-4 inline-flex items-center gap-2 rounded-full border border-violet-500/25 bg-violet-500/10 px-3 py-1 text-[10px] font-semibold uppercase tracking-wider text-violet-300">
              <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-violet-400" />
              24/7 AI Operating Assistant
            </p>
            <h1 className="text-3xl font-semibold leading-tight tracking-tight text-white sm:text-4xl lg:text-5xl">
              {HERO_CONTENT.headline}
            </h1>
            <p className="mt-4 text-sm leading-relaxed text-neutral-400 sm:text-base">
              {HERO_CONTENT.subheadline}
            </p>
            <p className="mt-4 text-sm leading-relaxed text-neutral-500">{HERO_CONTENT.body}</p>
            <div className="mt-8 flex flex-wrap gap-3">
              <a
                href="#contact"
                className="rounded-lg bg-white px-5 py-2.5 text-sm font-semibold text-black transition-opacity hover:opacity-90"
              >
                {HERO_CONTENT.primaryCta}
              </a>
              <Link
                to="/demo"
                className="rounded-lg border border-neutral-700 px-5 py-2.5 text-sm font-medium text-neutral-200 transition-colors hover:border-neutral-600 hover:text-white"
              >
                {HERO_CONTENT.secondaryCta}
              </Link>
            </div>
          </motion.div>

          <motion.div
            initial={{ opacity: 0, scale: 0.96 }}
            animate={{ opacity: 1, scale: 1 }}
            transition={{ duration: 0.6, delay: 0.15 }}
            className="relative mx-auto aspect-square w-full max-w-md lg:max-w-none"
          >
            <HeroHubAnimation />
          </motion.div>
        </div>
      </div>
    </section>
  );
}

function HeroHubAnimation() {
  return (
    <div className="relative h-full w-full rounded-2xl border border-neutral-800 bg-[#0a0a0a] p-4 sm:p-6">
      <p className="mb-2 text-center text-[10px] font-semibold uppercase tracking-wider text-neutral-500">
        AI Operating Assistant · Working in background
      </p>

      <div className="relative mx-auto aspect-square w-full max-w-[340px]">
        <svg viewBox="0 0 100 100" className="h-full w-full" aria-hidden>
          {NODE_POSITIONS.map((node, i) => (
            <motion.line
              key={`line-${node.label}`}
              x1="50"
              y1="50"
              x2={node.x}
              y2={node.y}
              stroke="rgba(139,92,246,0.25)"
              strokeWidth="0.4"
              strokeDasharray="2 2"
              initial={{ pathLength: 0, opacity: 0 }}
              animate={{ pathLength: 1, opacity: 1 }}
              transition={{ duration: 1, delay: i * 0.1 }}
            />
          ))}
          {NODE_POSITIONS.map((node, i) => (
            <motion.circle
              key={`pulse-${node.label}`}
              cx={node.x}
              cy={node.y}
              r="1.2"
              fill="rgba(139,92,246,0.6)"
              animate={{ opacity: [0.3, 1, 0.3] }}
              transition={{ duration: 2, repeat: Infinity, delay: i * 0.3 }}
            />
          ))}
        </svg>

        {/* Centre hub */}
        <div className="absolute left-1/2 top-1/2 z-10 -translate-x-1/2 -translate-y-1/2">
          <motion.div
            animate={{ boxShadow: ['0 0 20px rgba(139,92,246,0.15)', '0 0 40px rgba(139,92,246,0.25)', '0 0 20px rgba(139,92,246,0.15)'] }}
            transition={{ duration: 3, repeat: Infinity }}
            className="flex h-24 w-24 flex-col items-center justify-center rounded-2xl border border-violet-500/40 bg-violet-500/10 sm:h-28 sm:w-28"
          >
            <span className="text-[10px] font-semibold uppercase tracking-wider text-violet-300">Synpath</span>
            <span className="mt-0.5 text-xs font-medium text-white">AI Assistant</span>
            <motion.span
              className="mt-2 h-1.5 w-1.5 rounded-full bg-emerald-400"
              animate={{ opacity: [1, 0.4, 1] }}
              transition={{ duration: 1.5, repeat: Infinity }}
            />
          </motion.div>
        </div>

        {/* Node labels */}
        {NODE_POSITIONS.map((node, i) => (
          <motion.div
            key={node.label}
            className="absolute max-w-[88px] -translate-x-1/2 -translate-y-1/2 text-center"
            style={{ left: `${node.x}%`, top: `${node.y}%` }}
            initial={{ opacity: 0, scale: 0.9 }}
            animate={{ opacity: 1, scale: 1 }}
            transition={{ delay: 0.3 + i * 0.08 }}
          >
            <div className="rounded-md border border-neutral-700 bg-neutral-900/90 px-1.5 py-1 text-[9px] leading-tight text-neutral-300 sm:text-[10px]">
              {node.label}
            </div>
          </motion.div>
        ))}

        {/* Flowing data particles */}
        {NODE_POSITIONS.slice(0, 4).map((node, i) => (
          <motion.div
            key={`particle-${i}`}
            className="absolute h-1 w-1 rounded-full bg-violet-400"
            style={{ left: `${node.x}%`, top: `${node.y}%` }}
            animate={{
              left: ['50%', `${node.x}%`, '50%'],
              top: ['50%', `${node.y}%`, '50%'],
              opacity: [0, 1, 0],
            }}
            transition={{ duration: 3, repeat: Infinity, delay: i * 0.75, ease: 'easeInOut' }}
          />
        ))}
      </div>
    </div>
  );
}
