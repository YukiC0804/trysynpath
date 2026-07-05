import { CONNECTED_SYSTEMS } from '../../data/demoScenarios';

export function ConnectedSystemsPanel() {
  return (
    <div className="rounded-2xl border border-neutral-800 bg-neutral-900/60 p-4 sm:p-5">
      <div className="mb-3 flex items-center justify-between gap-2">
        <p className="text-[10px] font-semibold uppercase tracking-wider text-neutral-500">Connected systems</p>
        <span className="flex items-center gap-1.5 text-xs text-emerald-400">
          <span className="h-2 w-2 animate-pulse rounded-full bg-emerald-400" />
          All live
        </span>
      </div>
      <div className="flex flex-wrap gap-2">
        {CONNECTED_SYSTEMS.map((system) => (
          <span
            key={system}
            className="inline-flex items-center gap-1.5 rounded-full border border-neutral-800 bg-black/40 px-3 py-1.5 text-xs text-neutral-300"
          >
            <span className="h-1.5 w-1.5 rounded-full bg-emerald-400" />
            {system}
          </span>
        ))}
      </div>
      <p className="mt-3 text-xs text-neutral-500">{COMPANY_TAGLINE}</p>
    </div>
  );
}

const COMPANY_TAGLINE = 'Northbridge Components Ltd · Precision components manufacturer';
