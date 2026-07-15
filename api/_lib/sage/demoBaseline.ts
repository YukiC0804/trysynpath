export type DemoStockBaseline = {
  sku: string;
  description: string;
  costPrice: number;
  salesPrice: number;
  reorderLevel: number;
  reorderQuantity?: number;
  supplierPartNumber?: string;
};

/**
 * Original values for every stock item changed by the Sage demo workflows.
 * Reset deliberately ignores non-demo Sage products.
 */
export const SAGE_DEMO_BASELINE: readonly DemoStockBaseline[] = [
  {
    sku: 'ACR-MIR-SLV-3MM',
    description: 'Silver Mirror Acrylic Sheet 3mm',
    costPrice: 68,
    salesPrice: 0,
    reorderLevel: 10,
  },
  {
    sku: 'ACR-BLK-3MM-48X96',
    description: 'Black Acrylic Sheet 3mm 48 × 96',
    costPrice: 49,
    salesPrice: 0,
    reorderLevel: 25,
  },
  {
    sku: 'ACR-CLR-6MM-48X96',
    description: 'Clear Acrylic Sheet 6mm 48 × 96',
    costPrice: 76,
    salesPrice: 0,
    reorderLevel: 20,
  },
  {
    sku: 'ACR-CLR-3MM-48X96',
    description: 'Clear Acrylic Sheet 3mm 48 × 96',
    costPrice: 42.5,
    salesPrice: 0,
    reorderLevel: 40,
  },
  {
    sku: 'ACR-WHT-3MM-48X96',
    description: 'White Acrylic Sheet 3mm 48 × 96',
    costPrice: 51.4,
    salesPrice: 0,
    reorderLevel: 30,
    reorderQuantity: 50,
    supplierPartNumber: 'PAC-WHT-3MM-4896',
  },
] as const;
