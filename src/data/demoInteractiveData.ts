export type AgentId =
  | 'daily-order-risk'
  | 'material-shortage'
  | 'machine-downtime'
  | 'rfq-follow-up'
  | 'quality-escalation';

export type DashboardId =
  | 'coo-briefing'
  | 'production-bottlenecks'
  | 'inventory-risk'
  | 'customer-delivery'
  | 'operations-risk';

export type AppId =
  | 'order-entry'
  | 'shop-floor-logger'
  | 'supplier-delay'
  | 'rfq-intake'
  | 'sensor-estimator';

export type WorkflowId =
  | 'rfq-quote'
  | 'urgent-recovery'
  | 'breakdown-response'
  | 'order-validation';

export interface AgentRules {
  priorityFilter: 'High only' | 'High + Medium' | 'All customer orders';
  dueWithinDays: number;
  materialShortageUnits: number;
  supplierDelayDays: number;
  machineUtilisationPercent: number;
  notifyRecipients: string[];
  deliveryChannels: string[];
}

export const DEFAULT_AGENT_RULES: AgentRules = {
  priorityFilter: 'High + Medium',
  dueWithinDays: 5,
  materialShortageUnits: 100,
  supplierDelayDays: 1,
  machineUtilisationPercent: 90,
  notifyRecipients: ['COO', 'Operations Director'],
  deliveryChannels: ['Command Centre', 'Messenger alert'],
};

export const NOTIFY_RECIPIENT_OPTIONS = [
  'COO',
  'Operations Director',
  'Production Planner',
  'Account Manager',
];

export const DELIVERY_CHANNEL_OPTIONS = ['Command Centre', 'Email summary', 'Messenger alert'];

export const AGENT_DEFINITIONS: Record<
  AgentId,
  {
    title: string;
    subtitle: string;
    schedule: string;
    owner: string;
    lastRun: string;
    nextRun: string;
    connectedData: string[];
    recentOutput: string[];
    runSteps: string[];
    runSummary: { label: string; value: string }[];
    commandCentrePrompt?: string;
  }
> = {
  'daily-order-risk': {
    title: 'Daily Order Risk Agent',
    subtitle: 'Checks high-priority customer orders every morning and recommends recovery actions.',
    schedule: 'Every weekday at 08:00',
    owner: 'COO Workspace',
    lastRun: 'Today 08:02',
    nextRun: 'Tomorrow 08:00',
    connectedData: [
      'ERP orders',
      'Inventory',
      'Supplier POs',
      'Production Schedule',
      'Machine Logs',
      'Quality Logs',
    ],
    recentOutput: [
      'Bosch SO-1048 flagged as High risk',
      'PO-7782 delayed by 2 days',
      'Recommended recovery plan created',
      '£84,000 revenue at risk',
    ],
    runSteps: [
      'Checking high-priority ERP orders...',
      'Matching orders to production jobs...',
      'Checking material availability...',
      'Checking supplier PO delays...',
      'Reading machine logs...',
      'Calculating delivery risk...',
      'Generating recommended actions...',
    ],
    runSummary: [
      { label: 'Orders checked', value: '3' },
      { label: 'High-risk orders', value: '1' },
      { label: 'Flagged order', value: 'Bosch SO-1048' },
      { label: 'Revenue at risk', value: '£84,000' },
      { label: 'Recommended action', value: 'Expedite PO-7782 from MetalWorks Ltd' },
    ],
    commandCentrePrompt:
      'Bosch SO-1048 is due on 12 Jul. Are we actually on track to ship?',
  },
  'material-shortage': {
    title: 'Material Shortage Agent',
    subtitle: 'Monitors inventory levels against production demand and flags shortages early.',
    schedule: 'Daily at 07:30',
    owner: 'Supply Chain Manager',
    lastRun: 'Today 07:30',
    nextRun: 'Tomorrow 07:30',
    connectedData: ['Inventory', 'BOM', 'Purchase Orders', 'Production Plan', 'Supplier POs'],
    recentOutput: [
      'Aluminium Casing Blank shortage of 280 units',
      'PCB Board A below reorder point',
      'Expedite PO recommended for PO-7782',
    ],
    runSteps: [
      'Reading inventory levels...',
      'Matching BOM demand to open jobs...',
      'Checking inbound purchase orders...',
      'Calculating shortage impact...',
      'Generating expedite recommendations...',
    ],
    runSummary: [
      { label: 'Materials checked', value: '142' },
      { label: 'Shortages found', value: '3' },
      { label: 'Highest risk', value: 'Aluminium Casing Blank' },
      { label: 'Recommended action', value: 'Expedite PO-7782' },
    ],
  },
  'machine-downtime': {
    title: 'Machine Downtime Agent',
    subtitle: 'Detects prolonged machine downtime and calculates customer delivery impact.',
    schedule: 'Real-time',
    owner: 'Production Manager',
    lastRun: 'Today 06:45',
    nextRun: 'Continuous monitoring',
    connectedData: ['Machine Logs', 'MES', 'Maintenance Logs', 'Production Schedule'],
    recentOutput: [
      'CNC-04 downtime exceeded 2 hours',
      'Line 3 capacity reduced by 18%',
      'Maintenance task suggested',
    ],
    runSteps: [
      'Reading machine telemetry...',
      'Identifying affected production jobs...',
      'Calculating customer impact...',
      'Searching alternative machines...',
      'Generating maintenance recommendation...',
    ],
    runSummary: [
      { label: 'Machines monitored', value: '12' },
      { label: 'Downtime events', value: '1' },
      { label: 'Affected machine', value: 'CNC-04' },
      { label: 'Recommended action', value: 'Create maintenance task' },
    ],
  },
  'rfq-follow-up': {
    title: 'RFQ Follow-up Agent',
    subtitle: 'Processes incoming RFQs and generates quote drafts with margin recommendations.',
    schedule: 'When new RFQ received',
    owner: 'Commercial Manager',
    lastRun: 'Today 09:12',
    nextRun: 'On next RFQ',
    connectedData: ['RFQ Inbox', 'Historical Quotes', 'Cost Models', 'CRM', 'Capacity Schedule'],
    recentOutput: [
      'Quote draft generated for Schneider Electric',
      'Recommended price £27.50/unit',
      'Margin 33.1% · Lead time 23 days',
    ],
    runSteps: [
      'Reading RFQ email...',
      'Extracting requirements...',
      'Matching historical quotes...',
      'Calculating unit cost...',
      'Applying margin rules...',
      'Generating quote draft...',
    ],
    runSummary: [
      { label: 'RFQs processed', value: '1' },
      { label: 'Customer', value: 'Schneider Electric' },
      { label: 'Recommended price', value: '£27.50/unit' },
      { label: 'Total quote', value: '£55,000' },
    ],
    commandCentrePrompt: 'Generate quote for Schneider Electric RFQ SE-HOUSING-4421',
  },
  'quality-escalation': {
    title: 'Quality Escalation Agent',
    subtitle: 'Monitors defect rates and escalates quality issues before customer impact.',
    schedule: 'Hourly',
    owner: 'Quality Manager',
    lastRun: 'Yesterday 16:30',
    nextRun: 'Top of next hour',
    connectedData: ['Quality Logs', 'Production Jobs', 'Customer Orders', 'Inspection Reports'],
    recentOutput: [
      'Surface scratch defect rate rose to 4.2% on J-883',
      'Threshold breach on Line 2',
      'QA review suggested',
    ],
    runSteps: [
      'Reading quality inspection logs...',
      'Calculating defect rates by job...',
      'Checking customer order impact...',
      'Comparing against thresholds...',
      'Generating escalation notice...',
    ],
    runSummary: [
      { label: 'Jobs inspected', value: '8' },
      { label: 'Escalations', value: '1' },
      { label: 'Affected job', value: 'J-883' },
      { label: 'Recommended action', value: 'Notify Quality Manager' },
    ],
  },
};

export const DASHBOARD_DEFINITIONS: Record<
  DashboardId,
  {
    title: string;
    metrics: { label: string; value: string; tone?: 'danger' | 'warning' }[];
  }
> = {
  'coo-briefing': {
    title: 'COO Operations Dashboard',
    metrics: [
      { label: 'Orders at risk', value: '3', tone: 'danger' },
      { label: 'Revenue at risk', value: '£221k', tone: 'danger' },
      { label: 'Delayed jobs', value: '4', tone: 'warning' },
      { label: 'Avg machine utilisation', value: '80%' },
      { label: 'Material shortages', value: '3', tone: 'warning' },
      { label: 'Supplier delays', value: '2', tone: 'warning' },
    ],
  },
  'production-bottlenecks': {
    title: 'Machine Utilisation Dashboard',
    metrics: [
      { label: 'Line 3 utilisation', value: '96%', tone: 'danger' },
      { label: 'CNC-04 downtime', value: '2.5h', tone: 'warning' },
      { label: 'Delayed jobs', value: '4' },
      { label: 'Bottleneck machine', value: 'CNC-04', tone: 'danger' },
    ],
  },
  'inventory-risk': {
    title: 'Supplier Risk Dashboard',
    metrics: [
      { label: 'Materials below level', value: '3', tone: 'warning' },
      { label: 'Supplier delays', value: '2', tone: 'warning' },
      { label: 'Highest risk material', value: 'Aluminium Casing Blank' },
    ],
  },
  'customer-delivery': {
    title: 'Customer Impact Dashboard',
    metrics: [
      { label: 'High-risk orders', value: '1', tone: 'danger' },
      { label: 'Medium-risk orders', value: '2', tone: 'warning' },
      { label: 'Customers affected', value: 'Bosch, Siemens, ABB' },
    ],
  },
  'operations-risk': {
    title: 'Operations Risk Dashboard',
    metrics: [
      { label: 'Orders at risk', value: '3', tone: 'danger' },
      { label: 'Revenue at risk', value: '£221k', tone: 'danger' },
      { label: 'Delayed jobs', value: '4', tone: 'warning' },
      { label: 'Material shortages', value: '3', tone: 'warning' },
    ],
  },
};

export const DASHBOARD_METRIC_OPTIONS = [
  'Orders at risk',
  'Revenue at risk',
  'Delayed jobs',
  'Machine utilisation',
  'Material shortages',
  'Supplier delays',
  'Quality issues',
];

export const APP_FIELD_OPTIONS = [
  'Customer',
  'Product',
  'Quantity',
  'Required delivery date',
  'Priority',
  'Sales owner',
  'Attach drawing/spec',
  'Special instructions',
  'Delivery confidence',
  'Material availability',
  'Capacity check',
];

export const APP_RULE_TOGGLES = [
  'If priority is High, notify Operations Director',
  'If materials are unavailable, create purchase request',
  'If capacity is constrained, suggest alternative delivery date',
  'If order value exceeds threshold, request manager approval',
  'When approved, create production job automatically',
];

export const WORKFLOW_DEFINITIONS: Record<
  WorkflowId,
  {
    title: string;
    steps: string[];
    connectedSystems: string[];
    runSteps: string[];
    runResult: string;
    commandCentrePrompt?: string;
  }
> = {
  'rfq-quote': {
    title: 'RFQ to Quote Workflow',
    steps: [
      'Read RFQ email',
      'Extract part, quantity, tolerance, delivery date',
      'Read attached drawing/spec',
      'Search historical quotes',
      'Calculate material, machine, labour, finishing, overhead',
      'Apply margin rules',
      'Generate quote draft',
      'Send to sales review',
    ],
    connectedSystems: [
      'Mailbox',
      'RFQ Inbox',
      'Excel Files',
      'Historical Quotes',
      'Material Cost Database',
      'Capacity Schedule',
      'CRM',
    ],
    runSteps: [
      'Reading RFQ email...',
      'Extracting requirements...',
      'Reading SE-HOUSING-4421.pdf...',
      'Reading specs.xlsx...',
      'Calculating unit cost...',
      'Applying margin rules...',
      'Generating quote draft...',
    ],
    runResult:
      'Quote draft generated for Schneider Electric. Recommended price £27.50/unit, total quote £55,000, margin 33.1%.',
    commandCentrePrompt: 'Generate quote for Schneider Electric RFQ SE-HOUSING-4421',
  },
  'urgent-recovery': {
    title: 'Urgent Order Recovery Workflow',
    steps: [
      'Identify root cause',
      'Check material shortage',
      'Check capacity alternatives',
      'Recommend reschedule',
      'Draft supplier expedite email',
      'Notify COO and production planner',
    ],
    connectedSystems: ['ERP', 'Inventory', 'Production Schedule', 'Supplier POs', 'Mailbox'],
    runSteps: [
      'Identifying root cause...',
      'Checking material shortage...',
      'Checking capacity alternatives...',
      'Drafting supplier expedite email...',
      'Generating recovery plan...',
    ],
    runResult: 'Recovery plan generated for Bosch SO-1048. Recommended expedite of PO-7782.',
    commandCentrePrompt:
      'Bosch SO-1048 is due on 12 Jul. Are we actually on track to ship?',
  },
  'breakdown-response': {
    title: 'Breakdown Response Workflow',
    steps: [
      'Identify affected jobs',
      'Calculate customer impact',
      'Search alternative machines',
      'Generate reschedule plan',
      'Notify maintenance and production manager',
    ],
    connectedSystems: ['Machine Logs', 'MES', 'Maintenance Logs', 'Production Schedule'],
    runSteps: [
      'Identifying affected jobs...',
      'Calculating customer impact...',
      'Searching alternative machines...',
      'Generating reschedule plan...',
    ],
    runResult: 'CNC-04 breakdown response suggested. 2 jobs can move to CNC-02.',
  },
  'order-validation': {
    title: 'New Order Validation Workflow',
    steps: [
      'Validate customer and product',
      'Check material availability',
      'Check production capacity',
      'Calculate delivery confidence',
      'Request approval if order value > £50,000',
      'Create production job',
    ],
    connectedSystems: ['ERP', 'Inventory', 'Production Schedule', 'CRM'],
    runSteps: [
      'Validating customer and product...',
      'Checking material availability...',
      'Checking production capacity...',
      'Calculating delivery confidence...',
    ],
    runResult: 'Siemens order validated with capacity warning. Manager approval recommended.',
  },
};

export const ORDERS_AT_RISK_ROWS = [
  { customer: 'Bosch', order: 'SO-1048', risk: 'High', value: '£84k', cause: 'Material + CNC downtime' },
  { customer: 'Siemens', order: 'SO-1051', risk: 'Medium', value: '£72k', cause: 'Line 3 capacity' },
  { customer: 'ABB', order: 'SO-1055', risk: 'Medium', value: '£65k', cause: 'Supplier delay' },
];

export const MACHINE_UTIL_ROWS = [
  { machine: 'CNC-04', util: '96%', status: 'Bottleneck' },
  { machine: 'CNC-02', util: '62%', status: 'Available' },
  { machine: 'ASM-01', util: '78%', status: 'Healthy' },
  { machine: 'QA-03', util: '85%', status: 'Watch' },
];
