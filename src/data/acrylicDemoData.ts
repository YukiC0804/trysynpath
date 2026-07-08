export const ACRYLIC_PRICING_PROMPT =
  'Ask suppliers for updated acrylic material pricing and update material cost';

export const ACRYLIC_INVENTORY_PROMPT = 'Check acrylic inventory risk for upcoming orders';

export const ACRYLIC_MATERIAL = {
  name: 'Clear Cast Acrylic Sheet',
  spec: '6mm, 1220mm x 2440mm',
  previousCost: '$68.50',
  updatedCost: '$69.80',
  lastUpdatedDays: 5,
  targetQuantity: 250,
};

export const ACRYLIC_SUPPLIERS = ['Acrylic Supplier A', 'Acrylic Supplier B', 'Acrylic Supplier C'];

export const ACRYLIC_SUPPLIER_COMPARISON = [
  {
    supplier: 'Supplier A',
    unitPrice: '$71.20/sheet',
    available: '250',
    leadTime: '5 business days',
    notes: 'Fastest full fulfilment',
  },
  {
    supplier: 'Supplier B',
    unitPrice: '$69.80/sheet',
    available: '180 now / 250 in 12 days',
    leadTime: '7–12 business days',
    notes: 'Balanced option',
    recommended: true,
  },
  {
    supplier: 'Supplier C',
    unitPrice: '$67.90/sheet',
    available: '90 now',
    leadTime: '3 weeks for full quantity',
    notes: 'Lowest price but stock constrained',
  },
];

export const ACRYLIC_SUPPLIER_REPLIES = [
  {
    supplier: 'Supplier A',
    text: 'Current price is $71.20 per sheet. We have 250 sheets available. Lead time is 5 business days.',
  },
  {
    supplier: 'Supplier B',
    text: 'We can supply at $69.80 per sheet. Current stock is 180 sheets. Lead time is 7 business days for 180 sheets, 12 business days for the full quantity.',
  },
  {
    supplier: 'Supplier C',
    text: 'Price is $67.90 per sheet, but we only have 90 sheets available. Full replenishment expected in 3 weeks.',
  },
];

export const ACRYLIC_PRICING_TIMELINE = [
  '09:01 — Material price check triggered',
  '09:02 — Synpath identified acrylic cost last updated 5 days ago',
  '09:03 — Pricing requests sent to 3 suppliers',
  '09:06 — Supplier A replied',
  '09:08 — Supplier B replied',
  '09:11 — Supplier C replied',
  '09:12 — Supplier prices extracted',
  '09:13 — Recommended supplier selected',
  '09:14 — Material cost updated to $69.80/sheet',
  '09:15 — Human approval requested',
];

export const ACRYLIC_PRICING_EXPLAIN =
  'I selected Supplier B because Supplier A is faster but more expensive, while Supplier C is cheaper but cannot supply the full quantity on time. Supplier B provides the best balance between price, quantity availability, and delivery timeline.';

export const ACRYLIC_UPCOMING_ORDERS = [
  {
    order: '#1048',
    product: 'Acrylic display stands',
    material: '3mm clear acrylic',
    sheets: 80,
    dueDays: 5,
  },
  {
    order: '#1052',
    product: 'Protective acrylic machine guards',
    material: '6mm clear acrylic',
    sheets: 150,
    dueDays: 9,
  },
  {
    order: '#1057',
    product: 'Custom acrylic signage panels',
    material: '10mm clear acrylic',
    sheets: 40,
    dueDays: 12,
  },
];

export const ACRYLIC_INVENTORY_LEVELS = [
  {
    thickness: '3mm clear acrylic',
    inStock: 120,
    required: 80,
    remaining: 40,
    reorderThreshold: 60,
    status: 'Below reorder threshold after allocation',
    risk: 'medium' as const,
    order: '#1048',
  },
  {
    thickness: '6mm clear acrylic',
    inStock: 90,
    required: 150,
    shortage: 60,
    reorderThreshold: 80,
    status: 'Stock shortage',
    risk: 'high' as const,
    order: '#1052',
  },
  {
    thickness: '10mm clear acrylic',
    inStock: 55,
    required: 40,
    remaining: 15,
    reorderThreshold: 30,
    status: 'Below reorder threshold after allocation',
    risk: 'medium' as const,
    order: '#1057',
  },
];

export const ACRYLIC_INVENTORY_RECOMMENDATIONS = [
  {
    material: '6mm clear acrylic',
    text: 'Order at least 60 additional sheets immediately to fulfil Order #1052. Recommended purchase quantity: 140 sheets, including 80 sheets to restore safety stock.',
  },
  {
    material: '3mm clear acrylic',
    text: 'Order 100 sheets within the next 3 days to restore inventory above the reorder threshold.',
  },
  {
    material: '10mm clear acrylic',
    text: 'Order 60 sheets after confirming Order #1057 production schedule, as remaining stock will fall below threshold.',
  },
];

export const ACRYLIC_SUPPLIER_QUOTE_SUMMARY = [
  { material: '3mm clear acrylic', supplier: 'Supplier A', price: '$38.40/sheet', lead: '4 days', qty: '100 sheets' },
  { material: '6mm clear acrylic', supplier: 'Supplier B', price: '$69.80/sheet', lead: '7 days', qty: '140 sheets' },
  { material: '10mm clear acrylic', supplier: 'Supplier A', price: '$112.50/sheet', lead: '6 days', qty: '60 sheets' },
];

export const ACRYLIC_INVENTORY_SUMMARY = `Acrylic Inventory Summary:

Order #1052 is at risk because current 6mm clear acrylic stock is short by 60 sheets. I recommend ordering 140 sheets from Supplier B to cover the shortage and restore safety stock.

3mm and 10mm clear acrylic orders can be fulfilled with current inventory, but both materials will fall below reorder thresholds after allocation. I recommend replenishing 100 sheets of 3mm acrylic and 60 sheets of 10mm acrylic.`;

export const ACRYLIC_INVENTORY_EXPLAIN =
  'The recommended quantities cover confirmed order demand and restore each acrylic material to its reorder threshold. The 6mm acrylic purchase is urgent because there is an immediate shortage for Order #1052.';

export const ACRYLIC_INVENTORY_TIMELINE = [
  '10:01 — Upcoming acrylic orders scanned',
  '10:02 — Inventory levels checked',
  '10:03 — 6mm acrylic shortage detected',
  '10:04 — 3mm and 10mm reorder risks detected',
  '10:05 — Replenishment quantities calculated',
  '10:06 — Supplier pricing linked to reorder plan',
  '10:07 — Purchase recommendation prepared',
  '10:08 — Waiting for human approval',
];
