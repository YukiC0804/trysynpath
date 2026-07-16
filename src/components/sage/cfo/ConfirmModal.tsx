import type { ReactNode } from 'react';

export function ConfirmModal({
  open,
  title,
  children,
  confirmLabel,
  busy,
  confirmDisabled,
  onCancel,
  onConfirm,
}: {
  open: boolean;
  title: string;
  children: ReactNode;
  confirmLabel: string;
  busy?: boolean;
  confirmDisabled?: boolean;
  onCancel: () => void;
  onConfirm: () => void;
}) {
  if (!open) return null;
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4">
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="cfo-confirm-title"
        className="w-full max-w-lg rounded-2xl border border-neutral-700 bg-[#0f0f0f] p-6 shadow-2xl"
      >
        <h2 id="cfo-confirm-title" className="font-display text-lg font-semibold text-white">
          {title}
        </h2>
        <div className="mt-4 space-y-3 text-sm text-neutral-300">{children}</div>
        <div className="mt-6 flex flex-wrap justify-end gap-2">
          <button
            type="button"
            disabled={busy}
            onClick={onCancel}
            className="rounded-lg border border-neutral-700 px-4 py-2 text-sm text-neutral-300 disabled:opacity-40"
          >
            Cancel
          </button>
          <button
            type="button"
            disabled={busy || confirmDisabled}
            onClick={onConfirm}
            className="rounded-lg bg-white px-4 py-2 text-sm font-semibold text-black disabled:opacity-40"
          >
            {busy ? 'Working…' : confirmLabel}
          </button>
        </div>
      </div>
    </div>
  );
}
