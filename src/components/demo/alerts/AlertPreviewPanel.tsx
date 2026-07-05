import { Paperclip } from 'lucide-react';
import type { OperationalAlert } from '../../../data/demoAlerts';
import { AlertSeverityBadge } from './AlertSeverityBadge';
import { SourceBadge } from './SourceBadge';

interface AlertPreviewPanelProps {
  alert: OperationalAlert | null;
  onRunWorkflow: (prompt: string) => void;
}

export function AlertPreviewPanel({ alert, onRunWorkflow }: AlertPreviewPanelProps) {
  if (!alert) {
    return (
      <div className="flex h-full min-h-[16rem] items-center justify-center rounded-xl border border-dashed border-neutral-800 bg-[#0a0a0a] p-6 text-center">
        <p className="text-sm text-neutral-500">Select an alert to preview detected signal and suggested workflow.</p>
      </div>
    );
  }

  const { preview } = alert;

  return (
    <div className="rounded-xl border border-neutral-800 bg-[#0a0a0a] p-4">
      <div className="mb-4 flex flex-wrap items-center gap-2">
        <SourceBadge source={alert.source} />
        <AlertSeverityBadge severity={alert.severity} />
      </div>

      <h3 className="mb-1 text-sm font-semibold text-white">{alert.title}</h3>
      <p className="mb-4 text-[11px] text-neutral-500">{alert.timestamp}</p>

      <div className="mb-4 rounded-lg border border-neutral-800 bg-black/40 p-3">
        <p className="mb-2 text-[10px] font-semibold uppercase tracking-wider text-neutral-500">
          {preview.heading}
        </p>
        <dl className="space-y-1.5">
          {preview.lines.map((line) => (
            <div key={line.label} className="grid grid-cols-[5.5rem_1fr] gap-2 text-xs">
              <dt className="text-neutral-500">{line.label}</dt>
              <dd className="text-neutral-200">{line.value}</dd>
            </div>
          ))}
        </dl>
        {preview.attachments && preview.attachments.length > 0 && (
          <div className="mt-3 border-t border-neutral-800 pt-3">
            <p className="mb-2 text-[10px] uppercase tracking-wider text-neutral-600">Attachments</p>
            <div className="flex flex-wrap gap-2">
              {preview.attachments.map((file) => (
                <span
                  key={file}
                  className="inline-flex items-center gap-1 rounded border border-neutral-800 bg-neutral-900 px-2 py-1 text-[11px] text-neutral-300"
                >
                  <Paperclip className="h-3 w-3" />
                  {file}
                </span>
              ))}
            </div>
          </div>
        )}
      </div>

      <div className="mb-4 rounded-lg border border-violet-500/20 bg-violet-500/5 px-3 py-2">
        <p className="mb-1 text-[10px] uppercase tracking-wider text-violet-400">Suggested action</p>
        <p className="text-sm text-white">{preview.suggestedAction}</p>
      </div>

      <button
        type="button"
        onClick={() => onRunWorkflow(alert.suggestedPrompt)}
        className="w-full rounded-lg bg-white px-3 py-2 text-xs font-medium text-black transition-colors hover:bg-neutral-200"
      >
        {alert.buttonLabel}
      </button>
    </div>
  );
}
