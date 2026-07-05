interface MetricCardProps {
  label: string;
  value: string;
  subtext?: string;
  valueClassName?: string;
}

export function MetricCard({ label, value, subtext, valueClassName = 'text-white' }: MetricCardProps) {
  return (
    <div className="rounded-lg border border-neutral-800 bg-neutral-900/80 px-3 py-2.5">
      <p className="mb-1 text-[10px] font-medium uppercase tracking-wider text-neutral-500">{label}</p>
      <p className={`text-sm font-semibold sm:text-base ${valueClassName}`}>{value}</p>
      {subtext && <p className="mt-0.5 text-[10px] text-neutral-500">{subtext}</p>}
    </div>
  );
}
