export const MARKETING_BRAND = {
  name: 'Synpath AI',
  tagline: 'AI Operating Assistant for manufacturing and operations teams',
  logoAlt: 'Synpath AI',
};

export const HERO_CONTENT = {
  headline: 'Your 24/7 AI Operating Assistant',
  subheadline:
    'Synpath AI sits on top of your existing workflows — automating supplier follow-ups, pricing collection, freight comparisons, inventory checks, and RFQ quoting while your team focuses on decisions.',
  body: 'Synpath AI works in the background across your operational workflows — collecting supplier pricing, checking freight rates, preparing RFQ responses, and escalating only the exceptions that need human judgment.',
  primaryCta: 'Book a workflow assessment',
  secondaryCta: 'Try the live demo',
};

export const WORKFLOW_NODES = [
  'Supplier Emails',
  'Pricing Updates',
  'Inventory Data',
  'Freight Providers',
  'Customer RFQs',
  'Quote Drafts',
  'Finance / Accounting Handoff',
] as const;

export const PROBLEM_CONTENT = {
  headline: 'Manual operations are slow and fragmented',
  subheadline:
    'Most teams still coordinate suppliers, freight, inventory, and quoting through email threads and spreadsheets — creating delays, missing data, and inconsistent customer responses.',
  painPoints: [
    'Supplier pricing chased manually across inboxes',
    'Freight quotes compared in spreadsheets',
    'RFQ details copied between systems',
    'Quote drafts rebuilt from scratch each time',
    'No single view of inventory or delivery risk',
  ],
};

export const WORKFLOW_SIMULATION = {
  headline: 'Live workflow simulation',
  subheadline: 'Watch one complete RFQ-to-quote process — repetitive work automated, humans stay in control.',
  steps: [
    {
      id: 'rfq-received',
      title: 'Customer RFQ received',
      description: 'New RFQ received from customer',
      detail: 'RFQ-2847 · Precision housing · 2,000 units · Manchester delivery',
    },
    {
      id: 'extract',
      title: 'AI extracts requirements',
      description: 'Structured fields extracted automatically',
      fields: ['Material: Aluminium 6061-T6', 'Quantity: 2,000 units', 'Delivery: Manchester', 'Required date: 18 Aug', 'Special: Anodised finish'],
    },
    {
      id: 'suppliers',
      title: 'AI contacts suppliers',
      description: 'Pricing requests sent to multiple suppliers',
      suppliers: ['MetalWorks Ltd', 'AeroForm UK', 'Precision Metals Co'],
    },
    {
      id: 'replies',
      title: 'Supplier replies arrive',
      description: 'Responses parsed into structured pricing',
      replies: [
        { supplier: 'MetalWorks Ltd', price: '£12.40/unit', lead: '14 days' },
        { supplier: 'AeroForm UK', price: '£11.95/unit', lead: '18 days' },
        { supplier: 'Precision Metals', price: '£12.10/unit', lead: '12 days' },
      ],
    },
    {
      id: 'freight',
      title: 'AI requests freight rates',
      description: 'Freight providers quoted and compared',
      freight: [
        { provider: 'Northline Freight', cost: '£1,240', eta: '3 days' },
        { provider: 'EuroShip Logistics', cost: '£1,180', eta: '4 days' },
        { provider: 'RapidHaul UK', cost: '£1,320', eta: '2 days' },
      ],
    },
    {
      id: 'quote',
      title: 'AI prepares draft quote',
      description: 'Supplier cost, freight, margin, and timeline combined',
      quote: {
        unitCost: '£11.95',
        freight: '£1,180',
        margin: '28%',
        total: '£31,480',
        delivery: '18 Aug',
      },
    },
    {
      id: 'approval',
      title: 'Ready for review',
      description: 'Human approval before anything is sent',
      actions: ['Approve', 'Edit', 'Escalate'],
    },
  ],
};

export const USE_CASES = [
  {
    id: 'supplier-pricing',
    headline: 'Supplier Communication & Pricing Collection',
    value: 'Automated follow-ups and structured pricing extraction reduce manual chasing and speed up sourcing decisions.',
    tag: 'Human approval where needed',
  },
  {
    id: 'inventory',
    headline: 'Inventory & Operational Visibility',
    value: 'Real-time stock visibility flags shortages early and connects inventory risk to customer commitments.',
    tag: 'Human approval where needed',
  },
  {
    id: 'freight',
    headline: 'Freight Rate Collection',
    value: 'Freight requests and responses are collected automatically, then ranked by price, lead time, and reliability.',
    tag: 'Human approval where needed',
  },
  {
    id: 'rfq-quote',
    headline: 'RFQ Response & Quoting Support',
    value: 'RFQ data, supplier pricing, freight cost, and margin flow into a draft quote your team can approve in minutes.',
    tag: 'Human approval where needed',
  },
] as const;

export const BEFORE_AFTER = {
  headline: 'Before vs after Synpath AI',
  subheadline: 'Replace fragmented manual coordination with a structured operating assistant.',
  before: {
    title: 'Before Synpath',
    items: [
      'Manually chase suppliers',
      'Copy pricing from emails',
      'Compare freight quotes manually',
      'Build quotes in spreadsheets',
      'Delays and missing information',
    ],
  },
  after: {
    title: 'With Synpath AI',
    items: [
      'Supplier follow-ups automated',
      'Pricing extracted into structured data',
      'Freight options compared automatically',
      'Draft quote prepared by AI',
      'Exceptions escalated to the team',
    ],
  },
};

export const EXCEPTION_ESCALATION = {
  headline: 'Exception escalation',
  subheadline:
    'Synpath AI handles the repetitive work automatically and escalates exceptions where human judgment is required.',
  autoCompleted: [
    'Supplier pricing collected',
    'Freight options compared',
    'RFQ fields extracted',
    'Draft quote prepared',
    'Inventory levels checked',
  ],
  exceptions: [
    { label: 'Supplier price increased by 18%', severity: 'warning' as const },
    { label: 'Delivery date does not meet customer requirement', severity: 'danger' as const },
    { label: 'Inventory below required quantity', severity: 'warning' as const },
    { label: 'Freight quote unusually high', severity: 'warning' as const },
    { label: 'Missing supplier response', severity: 'neutral' as const },
  ],
  queueLabel: 'Needs human review',
};

export const PRICING_OPTIONS = [
  {
    id: 'starter',
    name: 'Starter Workflow Automation',
    description: 'Focused on one or two priority workflows, such as supplier pricing collection and RFQ drafting.',
    features: [
      '1–2 priority workflows',
      'Supplier pricing collection',
      'RFQ draft preparation',
      'Exception escalation queue',
    ],
    highlighted: false,
  },
  {
    id: 'operations',
    name: 'Operations Assistant',
    description:
      'Covers supplier communication, pricing extraction, freight rate collection, inventory visibility, and quote preparation.',
    features: [
      'Supplier communication automation',
      'Freight rate collection',
      'Inventory visibility alerts',
      'Quote preparation workflow',
      'Team approval controls',
    ],
    highlighted: true,
  },
  {
    id: 'full',
    name: 'Full AI Operating Assistant',
    description:
      'A broader 24/7 assistant across supplier management, finance handoff, inventory, freight, RFQs, and quoting, with deeper workflow integration.',
    features: [
      'All core operational workflows',
      'Finance / accounting handoff',
      'Deeper ERP and tool integration',
      'Custom escalation rules',
      'Dedicated onboarding support',
    ],
    highlighted: false,
  },
] as const;

export const PRICING_PLACEHOLDERS = {
  setupFee: '£X',
  monthlyFee: '£X/month',
  performance: 'Optional performance-based component',
};

export const IMPLEMENTATION_ROADMAP = {
  headline: 'Start small, expand later',
  subheadline:
    'We usually start with the highest-impact workflow first, prove measurable value, then expand into a broader AI operating assistant.',
  phases: [
    {
      phase: 1,
      title: 'Pick highest-impact workflow',
      examples: 'Supplier pricing collection, freight rate automation, or RFQ quoting support',
      metric: 'Workflow selected',
    },
    {
      phase: 2,
      title: 'Deploy AI assistant on current workflow',
      examples: 'Integrate with email, spreadsheets, ERP/accounting, or internal tools',
      metric: 'Live in production',
    },
    {
      phase: 3,
      title: 'Measure time saved and accuracy',
      examples: 'Quote turnaround time, supplier response tracking, manual hours saved',
      metric: 'ROI validated',
    },
    {
      phase: 4,
      title: 'Expand into broader operating assistant',
      examples: 'Additional workflows added across supplier, freight, inventory, and quoting',
      metric: 'Full assistant scope',
    },
  ],
};

export const CTA_CONTENT = {
  headline: 'Ready to automate your highest-impact workflow?',
  subheadline:
    'Book a workflow assessment to identify where Synpath AI can save time, reduce errors, and keep your team in control.',
  primaryCta: 'Book a workflow assessment',
  secondaryCta: 'Start with one workflow',
  demoCta: 'Try the live operations demo',
};
