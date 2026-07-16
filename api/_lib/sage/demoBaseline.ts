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
 * Reset restores a completely empty demo baseline: cost, sales price and qty are 0.
 * Workflow 2 writes landed cost; Workflow 3 writes sales prices.
 */
export const GHOSTBOARDS_BASELINE_SKUS: readonly GhostboardsBaselineSku[] = [
  {
    sku: 'ACR-WHT-3MM-48X96',
    description: 'COLORED ACRYLIC SHEET 3mm x 48" x 96" WHITE',
    costPrice: 0,
    salesPrice: 0,
    quantityInStock: 0,
    reorderLevel: 10,
  },
  {
    sku: 'ACR-WHT-18MM-48X96',
    description: 'COLORED ACRYLIC SHEET 18mm x 48" x 96" WHITE',
    costPrice: 0,
    salesPrice: 0,
    quantityInStock: 0,
    reorderLevel: 5,
  },
  {
    sku: 'ACR-WHT-25MM-48X96',
    description: 'COLORED ACRYLIC SHEET 25mm x 48" x 96" WHITE',
    costPrice: 0,
    salesPrice: 0,
    quantityInStock: 0,
    reorderLevel: 5,
  },
  {
    sku: 'ACR-WHT-4P8MM-60X120',
    description: 'COLORED ACRYLIC SHEET 4.8mm x 60" x 120" WHITE',
    costPrice: 0,
    salesPrice: 0,
    quantityInStock: 0,
    reorderLevel: 10,
  },
  {
    sku: 'ACR-CLR-4MM-48X96',
    description: 'CLEAR ACRYLIC SHEET 4mm x 48" x 96"',
    costPrice: 0,
    salesPrice: 0,
    quantityInStock: 0,
    reorderLevel: 20,
  },
  {
    sku: 'ACR-PC-CLR-9P5MM-48X96',
    description: 'CLEAR ACRYLIC SHEET 9.5mm x 48" x 96" CLEAR POLY CARB',
    costPrice: 0,
    salesPrice: 0,
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

/**
 * Legacy Sage products that already exist and cannot be hard-deleted.
 * Reset never deletes or rewrites these — they stay as-is in the business.
 */
export const GHOSTBOARDS_PRESERVED_SKUS = [
  'ACR-MIR-SLV-3MM',
  'ACR-BLK-3MM-48X96',
  'ACR-CLR-6MM-48X96',
  'ACR-CLR-3MM-48X96',
] as const;

/** @deprecated No longer delete demo SKUs on reset — keep workflow products at qty 0. */
export const SAGE_DEMO_CREATED_SKUS: readonly string[] = [];
export const SAGE_DEMO_PURCHASE_INVOICE_REFERENCE = 'SYN-PO-2026-0714-001';
