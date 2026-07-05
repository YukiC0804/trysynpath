export type ScenarioId =
  | 'urgent-order'
  | 'rfq-quote'
  | 'rescheduling'
  | 'estimating'
  | 'order-entry'
  | 'build-dashboard';

export type StatusVariant = 'connected' | 'healthy' | 'warning' | 'danger' | 'ai' | 'neutral';

export interface DemoScenario {
  id: ScenarioId;
  label: string;
  description: string;
  prompt: string;
  dataSources: string[];
  actionLabel: string;
  actionType: 'agent' | 'quote' | 'reschedule' | 'tool' | 'app' | 'dashboard';
  successMessage: string;
}

export const COMPANY = {
  name: 'Northbridge Components Ltd',
  industry: 'Precision components manufacturer',
};

export const CONNECTED_SYSTEMS = [
  'ERP',
  'CRM',
  'Inventory',
  'Production Schedule',
  'Machine Logs',
  'Supplier POs',
  'RFQ Inbox',
  'Quality Logs',
  'Excel Files',
] as const;

export const PROMPT_CHIPS = [
  { label: 'Which urgent orders are at risk?', scenarioId: 'urgent-order' as ScenarioId },
  { label: 'Turn this RFQ into a quote', scenarioId: 'rfq-quote' as ScenarioId },
  { label: 'Reschedule production around a machine breakdown', scenarioId: 'rescheduling' as ScenarioId },
  { label: 'Estimate cost and margin for this job', scenarioId: 'estimating' as ScenarioId },
  { label: 'Create an order entry app', scenarioId: 'order-entry' as ScenarioId },
  { label: 'Build an operations dashboard', scenarioId: 'build-dashboard' as ScenarioId },
];

export const DEMO_SCENARIOS: DemoScenario[] = [
  {
    id: 'urgent-order',
    label: 'Urgent Order Impact',
    description:
      'Cross-reference ERP status with inventory, machine logs, supplier POs, and quality data to surface orders at risk before they become late.',
    prompt: 'Which urgent customer orders are at risk of being late, why, and what should we do?',
    dataSources: ['ERP', 'Inventory', 'Production Schedule', 'Machine Logs', 'Supplier POs', 'Quality Logs'],
    actionLabel: 'Create Daily Order Risk Agent',
    actionType: 'agent',
    successMessage:
      'Agent created: checks high-priority customer orders every morning at 8:00 and sends recommended actions to the COO.',
  },
  {
    id: 'rfq-quote',
    label: 'RFQ to Quote',
    description:
      'Turn an inbound RFQ into a costed quote draft using historical quotes, material costs, machine rates, and margin rules.',
    prompt: 'Create a quote from this RFQ and estimate cost, lead time, and margin.',
    dataSources: [
      'Historical quotes',
      'Material cost database',
      'Machine rate table',
      'Labour standards',
      'Supplier pricing',
      'Capacity schedule',
      'Margin rules',
    ],
    actionLabel: 'Generate Quote Draft',
    actionType: 'quote',
    successMessage: 'Quote draft Q-SE-2847 generated and ready for sales review.',
  },
  {
    id: 'rescheduling',
    label: 'Production Rescheduling',
    description:
      'When a machine goes down, rebalance the floor schedule to protect high-priority customer orders and recover capacity.',
    prompt: "CNC-04 is down for 4 hours. Reschedule today's production to minimise late orders.",
    dataSources: ['Production Schedule', 'Machine Logs', 'ERP', 'Inventory', 'Capacity calendar'],
    actionLabel: 'Apply Reschedule Plan',
    actionType: 'reschedule',
    successMessage: 'Reschedule plan applied. 3 jobs updated across Line 2 and Line 3.',
  },
  {
    id: 'estimating',
    label: 'Estimating',
    description:
      'Generate a structured cost estimate from BOM, routing, labour, machine rates, and current capacity — then save it as a reusable tool.',
    prompt: 'Estimate the cost and lead time for 500 units of Sensor Module X.',
    dataSources: ['BOM', 'Routing', 'Labour time', 'Machine rates', 'Historical jobs', 'Supplier prices', 'Current capacity'],
    actionLabel: 'Turn into reusable estimating tool',
    actionType: 'tool',
    successMessage: 'Estimating tool created. Your team can now reuse this workflow for future RFQs.',
  },
  {
    id: 'order-entry',
    label: 'Order Entry',
    description:
      'Build a custom order entry app with validation rules, material checks, and automated production job creation.',
    prompt: 'Create an order entry app for new customer orders.',
    dataSources: ['ERP', 'CRM', 'Inventory', 'Production Schedule', 'Customer master'],
    actionLabel: 'Publish Order Entry App',
    actionType: 'app',
    successMessage: 'Order Entry App published. Sales and operations teams can now use it for new orders.',
  },
  {
    id: 'build-dashboard',
    label: 'Build Dashboard',
    description:
      'Generate an operations dashboard from a natural-language prompt — bottlenecks, delays, utilisation, and revenue at risk in one view.',
    prompt:
      'Create a dashboard showing production bottlenecks, delayed jobs, machine utilisation, material shortages, and customer orders at risk.',
    dataSources: ['ERP', 'Production Schedule', 'Machine Logs', 'Inventory', 'Supplier POs', 'Quality Logs', 'CRM'],
    actionLabel: 'Generate Dashboard',
    actionType: 'dashboard',
    successMessage: 'Operations dashboard generated and pinned to your command centre.',
  },
];
