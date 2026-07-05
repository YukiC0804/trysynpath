import { StatusBadge } from './StatusBadge';

const FORM_FIELDS = [
  { label: 'Customer', type: 'select', placeholder: 'Select customer' },
  { label: 'Product', type: 'select', placeholder: 'Select product' },
  { label: 'Quantity', type: 'number', placeholder: '0' },
  { label: 'Required delivery date', type: 'date', placeholder: '' },
  { label: 'Priority', type: 'select', placeholder: 'Normal' },
  { label: 'Special instructions', type: 'textarea', placeholder: 'Enter notes...' },
  { label: 'Attach drawing / spec', type: 'file', placeholder: 'Upload file' },
  { label: 'Assign sales owner', type: 'select', placeholder: 'Select owner' },
];

const TOGGLES = [
  'Create production job automatically',
  'Check material availability',
  'Check capacity before confirming delivery date',
];

const AUTOMATION_RULES = [
  'If customer priority is High, notify Operations Director',
  'If materials are unavailable, create purchase request',
  'If capacity is constrained, suggest alternative delivery date',
  'If order value is above £50,000, request manager approval',
];

export function AppBuilderPreview() {
  return (
    <div className="space-y-4">
      <div className="rounded-xl border border-violet-500/20 bg-violet-500/5 p-4">
        <div className="mb-1 flex items-center gap-2">
          <StatusBadge variant="ai">AI-generated app</StatusBadge>
        </div>
        <h4 className="text-lg font-semibold text-white">Order Entry App</h4>
        <p className="text-sm text-neutral-400">Preview of form and automation rules generated from your prompt</p>
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <div className="rounded-xl border border-neutral-800 bg-[#0a0a0a] p-4">
          <p className="mb-3 text-[10px] font-semibold uppercase tracking-wider text-neutral-500">Form fields</p>
          <div className="space-y-3">
            {FORM_FIELDS.map((field) => (
              <div key={field.label}>
                <label className="mb-1 block text-xs text-neutral-400">{field.label}</label>
                {field.type === 'textarea' ? (
                  <div className="h-16 rounded-lg border border-neutral-800 bg-neutral-900/50 px-3 py-2 text-xs text-neutral-600">
                    {field.placeholder}
                  </div>
                ) : field.type === 'file' ? (
                  <div className="rounded-lg border border-dashed border-neutral-700 bg-neutral-900/30 px-3 py-4 text-center text-xs text-neutral-500">
                    Drop file or click to upload
                  </div>
                ) : (
                  <div className="rounded-lg border border-neutral-800 bg-neutral-900/50 px-3 py-2 text-xs text-neutral-500">
                    {field.placeholder}
                  </div>
                )}
              </div>
            ))}
          </div>

          <div className="mt-4 space-y-2 border-t border-neutral-800 pt-4">
            {TOGGLES.map((toggle) => (
              <label key={toggle} className="flex items-center gap-2 text-xs text-neutral-300">
                <span className="flex h-4 w-4 items-center justify-center rounded border border-emerald-500/50 bg-emerald-500/15">
                  <span className="h-2 w-2 rounded-sm bg-emerald-400" />
                </span>
                {toggle}
              </label>
            ))}
          </div>
        </div>

        <div className="rounded-xl border border-neutral-800 bg-neutral-900/50 p-4">
          <p className="mb-3 text-[10px] font-semibold uppercase tracking-wider text-neutral-500">Automation rules</p>
          <ul className="space-y-2">
            {AUTOMATION_RULES.map((rule, i) => (
              <li
                key={rule}
                className="flex items-start gap-2 rounded-lg border border-neutral-800 bg-black/30 px-3 py-2.5 text-xs text-neutral-300"
              >
                <span className="font-semibold text-violet-400">R{i + 1}</span>
                {rule}
              </li>
            ))}
          </ul>
        </div>
      </div>
    </div>
  );
}
