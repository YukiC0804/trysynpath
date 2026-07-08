import { ACRYLIC_PRICING_PROMPT, ACRYLIC_INVENTORY_PROMPT } from './acrylicDemoData';

export type AlertSeverity = 'high' | 'medium' | 'low';

export interface MonitoringSource {
  id: string;
  label: string;
  sublabel?: string;
}

export interface AlertPreviewContent {
  heading: string;
  lines: { label: string; value: string }[];
  attachments?: string[];
  suggestedAction: string;
}

export interface OperationalAlert {
  id: string;
  source: string;
  severity: AlertSeverity;
  timestamp: string;
  title: string;
  businessObjects: string;
  detectedSignal: string;
  businessImpact: string;
  suggestedPrompt: string;
  buttonLabel: string;
  preview: AlertPreviewContent;
}

export const ALERT_SUMMARY = {
  activeAlerts: 9,
  highPriority: 3,
  revenueAtRisk: '£268k',
  newRfqs: 1,
  machineEvents: 1,
};

export const MONITORING_SOURCES: MonitoringSource[] = [
  { id: 'mailbox', label: 'Mailbox', sublabel: '12 new messages scanned' },
  { id: 'rfq', label: 'RFQ Inbox', sublabel: '1 new RFQ' },
  { id: 'shop-floor', label: 'Shop Floor', sublabel: '4 live events' },
  { id: 'machine-logs', label: 'Machine Logs', sublabel: '1 downtime event' },
  { id: 'messenger', label: 'Messenger', sublabel: '3 unread ops messages' },
  { id: 'erp', label: 'ERP' },
  { id: 'supplier-pos', label: 'Supplier POs', sublabel: '2 delayed POs' },
  { id: 'inventory', label: 'Inventory' },
  { id: 'schedule', label: 'Production Schedule' },
  { id: 'quality', label: 'Quality Logs' },
];

export const OPERATIONAL_ALERTS: OperationalAlert[] = [
  {
    id: 'bosch-so-1048',
    source: 'ERP + Inventory + Supplier POs + Machine Logs',
    severity: 'high',
    timestamp: 'Detected 08:12 today',
    title: 'Bosch SO-1048 may miss 12 Jul delivery',
    businessObjects: 'Order SO-1048 · Job J-883 · PO-7782',
    detectedSignal:
      'ERP says SO-1048 is “In Production”, but connected data shows material shortage, supplier delay, and CNC-04 downtime.',
    businessImpact: '£84,000 revenue at risk',
    suggestedPrompt: 'Bosch SO-1048 is due on 12 Jul. Are we actually on track to ship?',
    buttonLabel: 'Run order risk workflow',
    preview: {
      heading: 'Order risk signal',
      lines: [
        { label: 'Order', value: 'SO-1048 (Bosch)' },
        { label: 'Job', value: 'J-883' },
        { label: 'Supplier PO', value: 'PO-7782 · MetalWorks Ltd' },
        { label: 'ERP status', value: 'In Production' },
        { label: 'Risk drivers', value: 'Material shortage, supplier delay, CNC-04 downtime' },
      ],
      suggestedAction: 'Run order risk workflow',
    },
  },
  {
    id: 'schneider-rfq',
    source: 'Mailbox + RFQ Inbox + Attachments',
    severity: 'medium',
    timestamp: 'Detected 09:04 today',
    title: 'New Schneider Electric RFQ received',
    businessObjects: 'SE-HOUSING-4421 · Schneider Electric',
    detectedSignal:
      'Email received with attached drawing SE-HOUSING-4421.pdf and specs.xlsx for custom aluminium housing.',
    businessImpact: 'Potential £55,000 quote value',
    suggestedPrompt:
      'Read the Schneider Electric RFQ email and attached drawing. Create a quote draft.',
    buttonLabel: 'Create quote draft',
    preview: {
      heading: 'RFQ email',
      lines: [
        { label: 'From', value: 'procurement@schneider-electric.com' },
        { label: 'Subject', value: 'RFQ — Custom Aluminium Housing · 2,000 units' },
      ],
      attachments: ['SE-HOUSING-4421.pdf', 'specs.xlsx'],
      suggestedAction: 'Create quote draft',
    },
  },
  {
    id: 'cnc-04-downtime',
    source: 'Shop Floor + Machine Logs + Production Schedule',
    severity: 'high',
    timestamp: 'Detected 09:42 today',
    title: 'CNC-04 down for 4 hours',
    businessObjects: 'CNC-04 · Line 3 · Bosch & ABB orders',
    detectedSignal:
      'Shop floor event reports CNC-04 unavailable. Five jobs on Line 3 may be affected, including Bosch and ABB orders.',
    businessImpact: '3 orders could become late if no reschedule is made',
    suggestedPrompt:
      'CNC-04 is down for 4 hours. Which jobs are affected and how should we reschedule?',
    buttonLabel: 'Run reschedule workflow',
    preview: {
      heading: 'Machine event',
      lines: [
        { label: 'Machine', value: 'CNC-04' },
        { label: 'Status', value: 'Down' },
        { label: 'Duration', value: '4 hours' },
        { label: 'Reported from', value: 'Shop Floor' },
        { label: 'Affected line', value: 'Line 3' },
      ],
      suggestedAction: 'Run reschedule workflow',
    },
  },
  {
    id: 'sensor-module-x',
    source: 'Messenger + CRM + Product Data',
    severity: 'medium',
    timestamp: 'Detected 10:16 today',
    title: 'Sales requested estimate for Sensor Module X',
    businessObjects: 'Sensor Module X · 500 units',
    detectedSignal:
      'Sales message asks whether Northbridge can price and deliver 500 units of Sensor Module X within the customer target window.',
    businessImpact: 'Potential £30,500 quote value',
    suggestedPrompt: 'Estimate cost, margin, and lead time for 500 units of Sensor Module X.',
    buttonLabel: 'Run estimate',
    preview: {
      heading: 'Sales request',
      lines: [
        { label: 'Product', value: 'Sensor Module X' },
        { label: 'Quantity', value: '500 units' },
        { label: 'Channel', value: 'Messenger · Sales ops' },
        { label: 'Request', value: 'Price and lead time within customer target window' },
      ],
      suggestedAction: 'Run estimate',
    },
  },
  {
    id: 'tesla-so-1073',
    source: 'ERP + CRM + Production Schedule + Inventory',
    severity: 'high',
    timestamp: 'Detected 10:28 today',
    title: 'Tesla SO-1073 urgent order may conflict with CNC-04 capacity',
    businessObjects: 'SO-1073 · ALU-BRACKET-TX9 · Bosch SO-1048 · Siemens SO-1061',
    detectedSignal:
      'Commercial escalation for 280 units by 10 Jul. CNC-04 is already loaded with Bosch recovery work and Siemens finishing operations.',
    businessImpact: '£58,000 new order at risk; Bosch and Siemens deliveries may slip if accepted as-is',
    suggestedPrompt:
      'Tesla SO-1073 is an urgent order requested for 10 Jul. Can we accept it without delaying Bosch SO-1048 or Siemens SO-1061?',
    buttonLabel: 'Run capacity impact workflow',
    preview: {
      heading: 'Urgent order signal',
      lines: [
        { label: 'Order', value: 'SO-1073 (Tesla)' },
        { label: 'Part', value: 'ALU-BRACKET-TX9 · 280 units' },
        { label: 'Requested ship', value: '10 Jul' },
        { label: 'CNC-04 time', value: '7.5 hours required' },
        { label: 'Conflict', value: 'Bosch SO-1048 recovery + Siemens SO-1061 finishing' },
      ],
      suggestedAction: 'Run capacity impact workflow',
    },
  },
  {
    id: 'material-coverage-jul15',
    source: 'ERP + Inventory + BOM + Supplier POs',
    severity: 'medium',
    timestamp: 'Detected 10:31 today',
    title: 'Material coverage gaps for jobs due before 15 Jul',
    businessObjects: 'SO-1048 · SO-1057 · SO-1061 · SO-1073 · PO-7782 · PO-7811',
    detectedSignal:
      'BOM demand for four open orders shows Stainless Steel 316L shortage, tight Aluminium 7075, and late packaging inserts for Bosch final packing.',
    businessImpact: 'Bosch SO-1048 and Airbus SO-1057 at risk unless supplier POs are expedited',
    suggestedPrompt:
      'Do we have material coverage for all jobs due before 15 Jul, especially Bosch SO-1048, Airbus SO-1057, and Siemens SO-1061?',
    buttonLabel: 'Run material coverage check',
    preview: {
      heading: 'Material coverage signal',
      lines: [
        { label: 'Orders checked', value: '4 jobs due before 15 Jul' },
        { label: 'Shortage risk', value: 'Stainless Steel 316L · 65 kg short' },
        { label: 'Inbound PO', value: 'PO-7782 delayed 1 day · PO-7811 due 12 Jul' },
        { label: 'Packaging', value: 'PKG-44 inserts likely late for Bosch' },
      ],
      suggestedAction: 'Run material coverage check',
    },
  },
  {
    id: 'acrylic-price-stale',
    source: 'Material cost table + Mailbox + Supplier master',
    severity: 'medium',
    timestamp: 'Detected 09:01 today',
    title: '6mm clear acrylic material cost not updated in 42 days',
    businessObjects: 'Clear Cast Acrylic Sheet · Suppliers A/B/C',
    detectedSignal:
      'Material cost table shows $68.50/sheet last updated 42 days ago. Synpath can request updated pricing from approved acrylic suppliers.',
    businessImpact: 'Quote accuracy risk for acrylic jobs using stale material cost',
    suggestedPrompt: ACRYLIC_PRICING_PROMPT,
    buttonLabel: 'Run acrylic pricing workflow',
    preview: {
      heading: 'Material pricing signal',
      lines: [
        { label: 'Material', value: 'Clear Cast Acrylic Sheet · 6mm' },
        { label: 'Current cost', value: '$68.50 / sheet' },
        { label: 'Last updated', value: '42 days ago' },
        { label: 'Target qty', value: '250 sheets' },
      ],
      suggestedAction: 'Run acrylic pricing workflow',
    },
  },
  {
    id: 'acrylic-inventory-risk',
    source: 'Inventory + ERP + Production Schedule',
    severity: 'high',
    timestamp: 'Detected 10:01 today',
    title: '6mm clear acrylic shortage risk for upcoming orders',
    businessObjects: 'Order #1052 · 3mm/6mm/10mm acrylic stock',
    detectedSignal:
      'Order #1052 requires 150 sheets of 6mm acrylic but only 90 sheets are in stock. 3mm and 10mm acrylic will fall below reorder thresholds after allocation.',
    businessImpact: 'Order #1052 at risk — 60 sheet shortage on 6mm clear acrylic',
    suggestedPrompt: ACRYLIC_INVENTORY_PROMPT,
    buttonLabel: 'Run inventory risk workflow',
    preview: {
      heading: 'Inventory risk signal',
      lines: [
        { label: 'High risk', value: '6mm acrylic short 60 sheets' },
        { label: 'Order', value: '#1052 · due in 9 days' },
        { label: 'Medium risk', value: '3mm and 10mm below threshold after orders' },
      ],
      suggestedAction: 'Run inventory risk workflow',
    },
  },
  {
    id: 'order-entry-friction',
    source: 'Messenger + ERP + Sales Ops',
    severity: 'low',
    timestamp: 'Detected yesterday 16:38',
    title: 'Sales team still entering customer orders manually',
    businessObjects: 'Sales ops · ERP order entry',
    detectedSignal:
      'Repeated messenger requests show sales operations asking production planners to check materials and capacity manually before confirming delivery dates.',
    businessImpact: 'Slow order confirmation and risk of inconsistent delivery promises',
    suggestedPrompt:
      'Create an internal order entry app with material checks, capacity checks, and approval rules.',
    buttonLabel: 'Build order entry app',
    preview: {
      heading: 'Process friction',
      lines: [
        { label: 'Pattern', value: 'Manual material & capacity checks before order confirmation' },
        { label: 'Channel', value: 'Messenger between sales and production planning' },
        { label: 'Frequency', value: 'Repeated this week' },
      ],
      suggestedAction: 'Build order entry app',
    },
  },
];
