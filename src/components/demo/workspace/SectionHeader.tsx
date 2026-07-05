interface SectionHeaderProps {
  title: string;
  subtitle: string;
}

export function SectionHeader({ title, subtitle }: SectionHeaderProps) {
  return (
    <div className="mb-6">
      <h2 className="text-xl font-semibold text-white sm:text-2xl">{title}</h2>
      <p className="mt-1 text-sm text-neutral-400">{subtitle}</p>
    </div>
  );
}
