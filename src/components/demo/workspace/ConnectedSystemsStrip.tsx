import { CONNECTED_SYSTEMS } from '../../../data/demoWorkspace';

export function ConnectedSystemsStrip() {
  return (
    <div className="flex flex-wrap items-center gap-1.5 opacity-70">
      <span className="mr-1 text-[10px] font-medium uppercase tracking-wider text-neutral-600">
        Connected
      </span>
      {CONNECTED_SYSTEMS.map((system) => (
        <span
          key={system}
          className="inline-flex items-center gap-1 rounded-full border border-neutral-800/60 bg-neutral-900/30 px-2 py-0.5 text-[10px] text-neutral-500"
        >
          <span className="h-1 w-1 rounded-full bg-emerald-400/80" />
          {system}
        </span>
      ))}
    </div>
  );
}
