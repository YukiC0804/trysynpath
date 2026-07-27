export type AgentId =
  | 'supply'
  | 'sales'
  | 'outreach'
  | 'intelligence'
  | 'sourcing';

export const AGENTS: Array<{
  id: AgentId;
  title: string;
  blurb: string;
  commands: string[];
}> = [
  {
    id: 'supply',
    title: 'Supply & Costing',
    blurb: 'Vendor invoices, freight/duty, landed cost — Sage preview only.',
    commands: ['Process vendor invoice', 'Calculate landed cost'],
  },
  {
    id: 'sales',
    title: 'Sales Order',
    blurb: 'Customer orders with review for price, stock, and duplicates.',
    commands: ['Process sales order PDF', 'Review unusual pricing'],
  },
  {
    id: 'outreach',
    title: 'Outreach',
    blurb: 'Connect Gmail and send personalized follow-ups.',
    commands: ['Connect Gmail and send follow-up'],
  },
  {
    id: 'intelligence',
    title: 'Intelligence',
    blurb: 'Executive visibility across sales, spend, and exceptions.',
    commands: ['Show P&L and spend anomalies'],
  },
  {
    id: 'sourcing',
    title: 'Smart Sourcing',
    blurb: 'RFQs, compare quotes, recommend suppliers.',
    commands: ['Prepare RFQ and compare suppliers'],
  },
];

export function matchAgentFromPrompt(prompt: string): AgentId | null {
  const p = prompt.toLowerCase();
  if (/landed|vendor|purchase|supply|freight|duty|ddp|invoice/.test(p)) return 'supply';
  if (/sales order|customer po|quote confirm|sales/.test(p)) return 'sales';
  if (/gmail|outreach|email|follow-?up/.test(p)) return 'outreach';
  if (/p&l|pnl|spend|dashboard|margin|intelligence|forecast/.test(p)) return 'intelligence';
  if (/rfq|sourc|supplier|compare quote/.test(p)) return 'sourcing';
  return null;
}

/** Placeholder — no real email tracking/CRM data source wired up yet. */
export const FAKE_SALES_PIPELINE = [
  {
    rep: 'Yuki Chu',
    emailsSent: 142,
    deliveryRatePct: 98.6,
    openRatePct: 61.3,
    clickThroughRatePct: 18.9,
    responseRatePct: 12.7,
    meetingConversionPct: 5.6,
    hitRatePct: 3.5,
  },
  {
    rep: 'Russ Warner',
    emailsSent: 96,
    deliveryRatePct: 97.9,
    openRatePct: 54.2,
    clickThroughRatePct: 14.1,
    responseRatePct: 9.4,
    meetingConversionPct: 4.2,
    hitRatePct: 2.1,
  },
  {
    rep: 'Cesar Orozco',
    emailsSent: 58,
    deliveryRatePct: 99.1,
    openRatePct: 68.7,
    clickThroughRatePct: 22.4,
    responseRatePct: 16.0,
    meetingConversionPct: 7.1,
    hitRatePct: 4.8,
  },
];

export const FAKE_SOURCING = {
  item: 'Acrylic sheet 4mm Clear 4x8',
  qty: 200,
  quotes: [
    { supplier: 'Gokai', unit: 42.5, leadDays: 28, moq: 50, terms: 'Net 30', score: 92 },
    { supplier: 'AsiaPlas', unit: 39.8, leadDays: 45, moq: 100, terms: 'Net 45', score: 78 },
    { supplier: 'ClearSheet EU', unit: 51.0, leadDays: 14, moq: 20, terms: 'Net 15', score: 81 },
  ],
  recommended: 'Gokai',
};

export const FAKE_PROSPECTS = [
  { company: 'Northline Interiors', email: '', contact: 'Alex Rivera', territory: 'West' },
  { company: 'Harbor Sign Co', email: '', contact: 'Sam Chen', territory: 'East' },
];
