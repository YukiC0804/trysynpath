import { Bot, CheckCircle2 } from 'lucide-react';

interface AgentCreatedCardProps {
  message: string;
}

export function AgentCreatedCard({ message }: AgentCreatedCardProps) {
  return (
    <div className="rounded-xl border border-violet-500/25 bg-violet-500/10 p-4 sm:p-5">
      <div className="mb-2 flex items-center gap-2">
        <CheckCircle2 className="h-5 w-5 text-violet-400" />
        <span className="text-sm font-semibold text-violet-300">Automation created</span>
      </div>
      <div className="flex items-start gap-3">
        <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg border border-violet-500/25 bg-violet-500/15">
          <Bot className="h-5 w-5 text-violet-400" />
        </div>
        <p className="text-sm leading-relaxed text-neutral-300">{message}</p>
      </div>
    </div>
  );
}
