export type ResultType =
  | 'urgent-order'
  | 'urgent-capacity'
  | 'material-coverage'
  | 'rfq-quote'
  | 'rescheduling'
  | 'estimating'
  | 'order-entry'
  | 'dashboard'
  | 'general';

export const COMPANY = {
  name: 'Northbridge Components Ltd',
  industry: 'Precision components manufacturer',
};

export const SYNPATH_LOGO_SRC = '/synpath-logo.png?v=2';

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

export const INITIAL_PROMPTS = [
  'Bosch SO-1048 is due on 12 Jul. Are we actually on track to ship?',
  'Read the Schneider Electric RFQ email and attached drawing. Create a quote draft.',
  'CNC-04 is down for 4 hours. Which jobs are affected and how should we reschedule?',
  'Create a COO dashboard for orders at risk, bottlenecks, shortages, and delayed jobs.',
  'Tesla SO-1073 is an urgent order requested for 10 Jul. Can we accept it without delaying Bosch SO-1048 or Siemens SO-1061?',
  'Do we have material coverage for all jobs due before 15 Jul, especially Bosch SO-1048, Airbus SO-1057, and Siemens SO-1061?',
];

export const COMMAND_CHIPS = [
  'Bosch SO-1048 is due on 12 Jul. Are we actually on track to ship?',
  'Read the Schneider Electric RFQ email and attached drawing. Create a quote draft.',
  'CNC-04 is down for 4 hours. Which jobs are affected and how should we reschedule?',
  'Estimate cost, margin, and lead time for 500 units of Sensor Module X.',
  'Create an internal order entry app with material checks, capacity checks, and approval rules.',
  'Create a COO dashboard for orders at risk, bottlenecks, shortages, and delayed jobs.',
];

export const ANALYSIS_STEPS: Record<ResultType, string[]> = {
  'urgent-order': [
    'Understanding order risk request…',
    'Checking ERP order SO-1048…',
    'Matching SO-1048 to production job J-883…',
    'Checking inventory availability…',
    'Checking supplier PO-7782…',
    'Reading CNC-04 machine logs…',
    'Checking production capacity…',
    'Calculating delivery risk…',
    'Generating recovery actions…',
  ],
  'urgent-capacity': [
    'Checking ERP for Tesla SO-1073 order details…',
    'Reviewing requested delivery date, quantity, margin, and operations…',
    'Loading current production schedule…',
    'Identifying required work centres: CNC-04, CNC-02, deburring, inspection, packing…',
    'Comparing against Bosch SO-1048 and Siemens SO-1061 commitments…',
    'Checking Aluminium 7075 billet availability…',
    'Simulating capacity impact if order is accepted…',
    'Generating accept / negotiate recommendation…',
  ],
  'material-coverage': [
    'Loading all open jobs due before 15 Jul…',
    'Pulling BOM material requirements from ERP…',
    'Comparing required quantities against inventory…',
    'Checking inbound supplier POs…',
    'Linking shortages to affected sales orders…',
    'Assessing Bosch SO-1048, Airbus SO-1057, Siemens SO-1061, Tesla SO-1073…',
    'Generating material coverage report and recommended actions…',
  ],
  'rfq-quote': [
    'Reading Schneider Electric RFQ email…',
    'Extracting requirements from SE-HOUSING-4421.pdf…',
    'Matching similar historical quotes…',
    'Calculating material and finishing cost…',
    'Checking machine rates and labour standards…',
    'Checking Line 2 capacity at Northbridge…',
    'Applying margin rules and generating quote draft…',
  ],
  rescheduling: [
    'Reading CNC-04 downtime event from machine logs…',
    'Identifying affected jobs on Line 3…',
    'Ranking impact on Bosch SO-1048 and other customer orders…',
    'Searching spare capacity on Line 2…',
    'Simulating reschedule alternatives…',
    'Generating recommended production plan…',
  ],
  estimating: [
    'Reading Sensor Module X requirements…',
    'Pulling BOM for Sensor Module X…',
    'Loading routing and machine rates…',
    'Calculating material cost for 500 units…',
    'Calculating labour and machine time…',
    'Estimating lead time against current capacity…',
    'Applying margin target and generating cost model…',
  ],
  'order-entry': [
    'Designing order entry form for Northbridge sales…',
    'Mapping fields to ERP and CRM…',
    'Adding material availability checks…',
    'Adding capacity validation rules…',
    'Adding approval rules for high-value orders…',
    'Generating app preview…',
  ],
  dashboard: [
    'Selecting COO briefing metrics…',
    'Connecting Bosch SO-1048, J-883, and PO-7782 data…',
    'Building orders-at-risk and bottleneck views…',
    'Adding machine utilisation for CNC-04 and Line 3…',
    'Generating COO dashboard layout…',
  ],
  general: [
    'Understanding request…',
    'Scanning Northbridge operational data…',
    'Identifying relevant signals…',
    'Preparing recommendations…',
  ],
};

export const DATA_SOURCES_BY_RESULT: Record<ResultType, string[]> = {
  'urgent-order': ['ERP', 'Inventory', 'Production Schedule', 'Machine Logs', 'Supplier POs', 'Quality Logs'],
  'urgent-capacity': [
    'ERP',
    'Production Schedule',
    'Machine Logs',
    'Inventory',
    'Capacity calendar',
    'CRM',
  ],
  'material-coverage': ['ERP', 'Inventory', 'BOM', 'Supplier POs', 'Production Schedule', 'Excel Files'],
  'rfq-quote': [
    'RFQ Inbox',
    'Historical quotes',
    'Material cost database',
    'Machine rate table',
    'Labour standards',
    'Capacity schedule',
    'Margin rules',
  ],
  rescheduling: ['Machine Logs', 'Production Schedule', 'ERP', 'Inventory', 'Capacity calendar'],
  estimating: ['BOM', 'Routing', 'Labour time', 'Machine rates', 'Historical jobs', 'Supplier prices', 'Current capacity'],
  'order-entry': ['ERP', 'CRM', 'Inventory', 'Production Schedule', 'Customer master'],
  dashboard: ['ERP', 'Production Schedule', 'Machine Logs', 'Inventory', 'Supplier POs', 'Quality Logs', 'CRM'],
  general: ['ERP', 'Production Schedule', 'Inventory', 'Machine Logs', 'CRM'],
};

export const FOLLOW_UP_PROMPTS: Record<ResultType, string[]> = {
  'urgent-order': [
    'Draft expedite email for PO-7782 to MetalWorks Ltd',
    'Move Job J-901 from Line 3 to Line 2',
    'Create an agent to monitor Bosch SO-1048 daily',
    'Notify Bosch account manager with updated delivery confidence',
  ],
  'urgent-capacity': [
    'Request CNC-04 overtime approval for Tesla SO-1073',
    'Move Siemens SO-1061 finishing to CNC-02',
    'Draft accept-with-conditions reply to Tesla',
    'Check material coverage before confirming Tesla order',
  ],
  'material-coverage': [
    'Expedite PO-7782 from MetalWorks Ltd',
    'Confirm PO-7811 arrival with AeroMetals UK',
    'Source emergency packaging inserts for Bosch SO-1048',
    'Create material shortage agent for jobs due before 15 Jul',
  ],
  'rfq-quote': [
    'Generate quote PDF for Schneider Electric',
    'Check if we can deliver SE-HOUSING-4421 in 3 weeks',
    'Compare with similar quotes for aluminium housings',
    'Create approval workflow for commercial manager',
  ],
  rescheduling: [
    'Apply reschedule plan for J-883 and J-901',
    'Notify production planner about CNC-04 breakdown',
    'Show before/after schedule for Line 3',
    'Create breakdown response agent for CNC-04',
  ],
  estimating: [
    'Turn Sensor Module X estimate into reusable tool',
    'Generate quote draft for 500 units',
    'Save cost model to estimating library',
  ],
  'order-entry': [
    'Publish order entry app to sales team',
    'Connect app to ERP sales orders',
    'Add manager approval for orders above £50,000',
  ],
  dashboard: [
    'Schedule COO Daily Briefing at 08:00',
    'Add quality issues from Job J-883',
    'Alert if revenue at risk exceeds £100k',
    'Filter to Bosch, Siemens, and ABB only',
  ],
  general: [
    'Bosch SO-1048 is due on 12 Jul. Are we actually on track to ship?',
    'Create a COO dashboard for orders at risk, bottlenecks, shortages, and delayed jobs.',
    'Read the Schneider Electric RFQ email and attached drawing. Create a quote draft.',
  ],
};

export function routePrompt(prompt: string): ResultType {
  const p = prompt.toLowerCase();

  if (/(tesla so-1073|alu-bracket-tx9|without delaying bosch so-1048|without delaying.*siemens so-1061)/.test(p)) {
    return 'urgent-capacity';
  }
  if (/(material coverage|coverage for all jobs due before|jobs due before 15 jul)/.test(p)) {
    return 'material-coverage';
  }
  if (/(so-1048|bosch.*12 jul|on track to ship|actually on track)/.test(p)) {
    return 'urgent-order';
  }
  if (/(schneider electric|se-housing-4421|rfq email|attached drawing)/.test(p)) {
    return 'rfq-quote';
  }
  if (/(cnc-04|reschedule|which jobs are affected|down for 4 hours)/.test(p)) {
    return 'rescheduling';
  }
  if (/(sensor module x|estimate cost.*margin.*lead time)/.test(p)) {
    return 'estimating';
  }
  if (/(order entry app|material checks|capacity checks|approval rules)/.test(p)) {
    return 'order-entry';
  }
  if (/(coo dashboard|orders at risk.*bottleneck|bottlenecks.*shortages)/.test(p)) {
    return 'dashboard';
  }
  if (/(urgent order|orders at risk|delivery risk|\blate\b)/.test(p) && !/tesla/.test(p)) {
    return 'urgent-order';
  }
  if (/\brfq\b|quotation|quote draft/.test(p)) {
    return 'rfq-quote';
  }
  if (/(estimate|estimating|\d+ units)/.test(p) && !/\bdashboard\b/.test(p)) {
    return 'estimating';
  }
  if (/(dashboard|bottleneck|machine utili[sz]ation|material shortages)/.test(p)) {
    return 'dashboard';
  }
  if (/\bquote\b/.test(p)) {
    return 'rfq-quote';
  }

  return 'general';
}

export const STEP_INTERVAL_MS = 650;
export const FOLLOW_UP_STEP_INTERVAL_MS = 450;
