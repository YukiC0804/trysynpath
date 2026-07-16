import type { ReactNode } from 'react';

export function TechnicalDetails({
  title = 'Technical details',
  children,
}: {
  title?: string;
  children: ReactNode;
}) {
  return (
    <details className="mt-4 rounded-lg border border-neutral-800 bg-black/20">
      <summary className="cursor-pointer px-3 py-2 text-xs font-medium text-neutral-400">
        {title}
      </summary>
      <div className="border-t border-neutral-800 p-3 text-xs text-neutral-400">
        {children}
      </div>
    </details>
  );
}

export function JsonDetails({ title, value }: { title: string; value: unknown }) {
  return (
    <TechnicalDetails title={title}>
      <pre className="max-h-80 overflow-auto whitespace-pre-wrap break-all text-[11px]">
        {JSON.stringify(value, null, 2)}
      </pre>
    </TechnicalDetails>
  );
}
