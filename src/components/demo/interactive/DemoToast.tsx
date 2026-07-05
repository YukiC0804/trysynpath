import { AnimatePresence, motion } from 'motion/react';
import { Check } from 'lucide-react';

interface DemoToastProps {
  message: string | null;
}

export function DemoToast({ message }: DemoToastProps) {
  return (
    <AnimatePresence>
      {message && (
        <motion.div
          initial={{ opacity: 0, y: 12, x: 12 }}
          animate={{ opacity: 1, y: 0, x: 0 }}
          exit={{ opacity: 0, y: 8, x: 8 }}
          className="fixed bottom-4 right-4 z-[60] flex max-w-sm items-start gap-2 rounded-xl border border-emerald-500/25 bg-[#0a0a0a] px-4 py-3 shadow-xl shadow-black/40"
        >
          <Check className="mt-0.5 h-4 w-4 shrink-0 text-emerald-400" />
          <p className="text-sm text-emerald-100">{message}</p>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
