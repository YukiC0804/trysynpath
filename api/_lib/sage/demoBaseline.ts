export type GhostboardsBaselineSku = {
  sku: string;
  description: string;
  costPrice: number;
  salesPrice: number;
  quantityInStock: number;
  reorderLevel: number;
  reorderQuantity?: number;
};

/**
 * Canonical Ghostboards Demo Stock Items from live PO#GHOACRUGOL051926.
 * Baseline quantity is empty (0) so Reset restores a clean zero-inventory state.
 */
export const GHOSTBOARDS_BASELINE_SKUS: readonly GhostboardsBaselineSku[] = [
  {
    sku: 'ACR-WHT-3MM-48X96',
    description: 'White Acrylic Sheet 3mm 48 × 96',
    costPrice: 24.16,
    salesPrice: 39.45,
    quantityInStock: 0,
    reorderLevel: 10,
  },
  {
    sku: 'ACR-WHT-18MM-48X96',
    description: 'White Acrylic Sheet 18mm 48 × 96',
    costPrice: 144.9,
    salesPrice: 227.26,
    quantityInStock: 0,
    reorderLevel: 5,
  },
  {
    sku: 'ACR-WHT-25MM-48X96',
    description: 'White Acrylic Sheet 25mm 48 × 96',
    costPrice: 214.1,
    salesPrice: 331.97,
    quantityInStock: 0,
    reorderLevel: 5,
  },
  {
    sku: 'ACR-WHT-4P8MM-60X120',
    description: 'White Acrylic Sheet 4.8mm 60 × 120',
    costPrice: 57.43,
    salesPrice: 98.06,
    quantityInStock: 0,
    reorderLevel: 10,
  },
  {
    sku: 'ACR-CLR-4MM-48X96',
    description: 'Clear Acrylic Sheet 4mm 48 × 96',
    costPrice: 34.3,
    salesPrice: 0,
    quantityInStock: 0,
    reorderLevel: 20,
  },
  {
    sku: 'ACR-PC-CLR-9P5MM-48X96',
    description: 'Clear Polycarbonate Sheet 9.5mm 48 × 96',
    costPrice: 89,
    salesPrice: 144.84,
    quantityInStock: 0,
    reorderLevel: 10,
  },
] as const;

/** Reference used for baseline quantity create/reconcile Stock Movements. */
export const GHOSTBOARDS_BASELINE_MOVEMENT_REFERENCE = 'GHOSTBOARDS-DEMO-BASELINE';

/** SKUs used by the live PO#GHOACRUGOL051926 workflow. */
export const GHOSTBOARDS_DEMO_WORKFLOW_SKUS = GHOSTBOARDS_BASELINE_SKUS.map(
  (item) => item.sku,
) as readonly string[];

/** @deprecated Prefer GHOSTBOARDS_BASELINE_SKUS */
export type DemoStockBaseline = {
  sku: string;
  description: string;
  costPrice: number;
  salesPrice: number;
  reorderLevel: number;
  reorderQuantity?: number;
  supplierPartNumber?: string;
};

/** @deprecated Prefer GHOSTBOARDS_BASELINE_SKUS */
export const SAGE_DEMO_BASELINE: readonly DemoStockBaseline[] = GHOSTBOARDS_BASELINE_SKUS.map(
  (item) => ({
    sku: item.sku,
    description: item.description,
    costPrice: item.costPrice,
    salesPrice: item.salesPrice,
    reorderLevel: item.reorderLevel,
    reorderQuantity: item.reorderQuantity,
  }),
);

export const SAGE_DEMO_CREATED_SKUS = ['ACR-WHT-3MM-48X96'] as const;
export const SAGE_DEMO_PURCHASE_INVOICE_REFERENCE = 'SYN-PO-2026-0714-001';
