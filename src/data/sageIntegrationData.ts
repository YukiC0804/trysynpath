export const GHOST_BOARDS = {
  brand: 'Ghost Boards',
  pageTitle: 'Ghost Boards — Sage Integration',
  subtitle: 'Acrylic purchasing, supplier pricing and inventory automation',
  gmailAccount: 'alex@getsynpath-ai.com',
};

export const EXPECTED_SAGE_SKUS = [
  {
    sku: 'ACR-MIR-SLV-3MM',
    description: 'Silver Mirror Acrylic Sheet 3mm',
    costPrice: 68.0,
    salesPrice: 0.0,
    quantityInStock: 16,
    reorderLevel: 10,
    supplier: 'Nationwide Acrylics',
    supplierRef: 'NWA-003',
  },
  {
    sku: 'ACR-BLK-3MM-48X96',
    description: 'Black Acrylic Sheet 3mm 48 × 96',
    costPrice: 49.0,
    salesPrice: 0.0,
    quantityInStock: 54,
    reorderLevel: 25,
    supplier: 'Pacific Acrylic Supply',
    supplierRef: 'PAC-ACRYLIC-001',
  },
  {
    sku: 'ACR-CLR-6MM-48X96',
    description: 'Clear Acrylic Sheet 6mm 48 × 96',
    costPrice: 76.0,
    salesPrice: 0.0,
    quantityInStock: 38,
    reorderLevel: 20,
    supplier: 'West Coast Plastics',
    supplierRef: 'WCP-002',
  },
  {
    sku: 'ACR-CLR-3MM-48X96',
    description: 'Clear Acrylic Sheet 3mm 48 × 96',
    costPrice: 42.5,
    salesPrice: 0.0,
    quantityInStock: 82,
    reorderLevel: 40,
    supplier: 'Pacific Acrylic Supply',
    supplierRef: 'PAC-ACRYLIC-001',
  },
] as const;

export const SYNPATH_ONLY_PRODUCT = {
  sku: 'ACR-WHT-3MM-48X96',
  description: 'White Acrylic Sheet 3mm 48 × 96',
  type: 'Stock',
  costPrice: 51.4,
  salesPrice: 0.0,
  reorderLevel: 30,
  reorderQuantity: 50,
  supplier: 'Pacific Acrylic Supply',
  supplierRef: 'PAC-ACRYLIC-001',
  supplierPartNumber: 'PAC-WHT-3MM-4896',
} as const;

export const SKU_UPDATE_PROPOSAL = {
  sku: 'ACR-MIR-SLV-3MM',
  fields: [
    {
      key: 'description' as const,
      label: 'Description',
      current: 'Silver Mirror Acrylic Sheet 3mm',
      proposed: 'Silver Mirror Cast Acrylic Sheet 3mm',
    },
    {
      key: 'reorderLevel' as const,
      label: 'Reorder Level',
      current: 10,
      proposed: 20,
    },
  ],
};

export const MOCK_GMAIL_EMAIL = {
  sender: 'Pacific Acrylic Supply',
  senderAddress: 'yuki.chu@synpath-ai.com',
  recipient: 'alex@getsynpath-ai.com',
  subject: 'Daily Acrylic Price Update — July 14, 2026',
  received: 'July 14, 2026 at 6:19 PM',
  label: 'Synpath Pricing',
  body: `Hi Alex,

Please find today's acrylic sheet price update:

1) ACR-CLR-3MM-48X96 — Clear Acrylic Sheet 3mm 48 × 96
   New cost: £45.10 / sheet
   MOQ: 50
   Lead time: 10 days
   Freight: £420.00

2) ACR-CLR-6MM-48X96 — Clear Acrylic Sheet 6mm 48 × 96
   New cost: £74.80 / sheet
   MOQ: 50
   Lead time: 12 days

Regards,
Pacific Acrylic Supply`,
};

export const EXTRACTED_PRICE_UPDATES = [
  {
    sku: 'ACR-CLR-3MM-48X96',
    previousCost: 42.5,
    newCost: 45.1,
    moq: 50,
    leadTime: '10 days',
    freight: 420.0,
  },
  {
    sku: 'ACR-CLR-6MM-48X96',
    previousCost: 76.0,
    newCost: 74.8,
    moq: 50,
    leadTime: '12 days',
    freight: null as number | null,
  },
];

export const PURCHASE_ORDER = {
  number: 'SYN-PO-2026-0714-001',
  sku: 'ACR-MIR-SLV-3MM',
  quantityInStock: 16,
  reorderLevel: 20,
  orderQuantity: 50,
  supplier: 'Nationwide Acrylics',
  supplierRef: 'NWA-003',
  unitCost: 68.0,
  freight: 185.0,
  currency: 'GBP',
  writeBackMessage:
    'Purchase Order created in Synpath. PO write-back is unavailable for this connected Sage Accounting Plus edition. Ready for a Sage 200 or Sage Intacct connector.',
};

export function extractPricingFromEmail(body: string) {
  const skus = ['ACR-CLR-3MM-48X96', 'ACR-CLR-6MM-48X96'] as const;
  return skus
    .map((sku) => {
      const block = body.split(sku)[1]?.split(/\n\n|\n(?=\d\))/)?.[0] ?? '';
      const costMatch = block.match(/New cost:\s*£?([\d.]+)/i);
      const moqMatch = block.match(/MOQ:\s*(\d+)/i);
      const leadMatch = block.match(/Lead time:\s*([^\n]+)/i);
      const freightMatch = block.match(/Freight:\s*£?([\d.]+)/i);
      if (!costMatch) return null;
      return {
        sku,
        newCost: Number(costMatch[1]),
        moq: moqMatch ? Number(moqMatch[1]) : null,
        leadTime: leadMatch?.[1]?.trim() ?? null,
        freight: freightMatch ? Number(freightMatch[1]) : null,
      };
    })
    .filter(Boolean);
}
