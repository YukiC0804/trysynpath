import { useEffect, type ReactNode } from 'react';
import { AnimatePresence, motion } from 'motion/react';
import { X } from 'lucide-react';

interface WorkspaceModalProps {
  open: boolean;
  onClose: () => void;
  title: string;
  subtitle?: string;
  children: ReactNode;
  footer?: ReactNode;
  size?: 'md' | 'lg';
}

export function WorkspaceModal({
  open,
  onClose,
  title,
  subtitle,
  children,
  footer,
  size = 'md',
}: WorkspaceModalProps) {
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open, onClose]);

  return (
    <AnimatePresence>
      {open && (
        <div className="fixed inset-0 z-50 flex items-end justify-center p-4 sm:items-center">
          <motion.button
            type="button"
            aria-label="Close modal"
            className="absolute inset-0 bg-black/70 backdrop-blur-sm"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={onClose}
          />
          <motion.div
            role="dialog"
            aria-modal="true"
            aria-labelledby="workspace-modal-title"
            className={`relative flex max-h-[90vh] w-full flex-col overflow-hidden rounded-2xl border border-neutral-800 bg-[#0a0a0a] shadow-2xl shadow-black/50 ${
              size === 'lg' ? 'max-w-[900px]' : 'max-w-[720px]'
            }`}
            initial={{ opacity: 0, y: 16, scale: 0.98 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 12, scale: 0.98 }}
            transition={{ duration: 0.2 }}
          >
            <div className="flex items-start justify-between gap-4 border-b border-neutral-800 px-5 py-4">
              <div>
                <h2 id="workspace-modal-title" className="text-lg font-semibold text-white">
                  {title}
                </h2>
                {subtitle && <p className="mt-1 text-sm text-neutral-400">{subtitle}</p>}
              </div>
              <button
                type="button"
                onClick={onClose}
                className="rounded-lg border border-neutral-800 p-1.5 text-neutral-400 transition-colors hover:border-neutral-600 hover:text-white"
              >
                <X className="h-4 w-4" />
              </button>
            </div>

            <div className="flex-1 overflow-y-auto px-5 py-4">{children}</div>

            {footer && (
              <div className="flex flex-wrap items-center justify-end gap-2 border-t border-neutral-800 bg-black/30 px-5 py-4">
                {footer}
              </div>
            )}
          </motion.div>
        </div>
      )}
    </AnimatePresence>
  );
}

export function ModalButton({
  children,
  variant = 'secondary',
  onClick,
}: {
  children: ReactNode;
  variant?: 'primary' | 'secondary';
  onClick?: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={
        variant === 'primary'
          ? 'rounded-lg bg-white px-4 py-2 text-xs font-semibold text-black transition-colors hover:bg-neutral-200'
          : 'rounded-lg border border-neutral-700 bg-neutral-900 px-4 py-2 text-xs font-medium text-neutral-300 transition-colors hover:border-neutral-500 hover:text-white'
      }
    >
      {children}
    </button>
  );
}

export function ModalSection({ title, children }: { title: string; children: ReactNode }) {
  return (
    <div className="mb-5 last:mb-0">
      <p className="mb-2 text-[10px] font-semibold uppercase tracking-wider text-neutral-500">{title}</p>
      {children}
    </div>
  );
}

export function ModalField({
  label,
  children,
  suffix,
}: {
  label: string;
  children: ReactNode;
  suffix?: string;
}) {
  return (
    <label className="mb-3 block last:mb-0">
      <span className="mb-1.5 block text-xs font-medium text-neutral-300">{label}</span>
      <div className="flex items-center gap-2">
        {children}
        {suffix && <span className="shrink-0 text-xs text-neutral-500">{suffix}</span>}
      </div>
    </label>
  );
}

export function modalInputClassName() {
  return 'w-full rounded-lg border border-neutral-700 bg-neutral-900 px-3 py-2 text-sm text-white outline-none transition-colors focus:border-neutral-500';
}

export function modalSelectClassName() {
  return modalInputClassName();
}
