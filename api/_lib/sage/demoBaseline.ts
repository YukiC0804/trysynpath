export type GhostboardsBaselineSku = {
  sku: string;
  description: string;
  costPrice: number;
  salesPrice: number;
  quantityInStock: number;
  reorderLevel: number;
  reorderQuantity?: number;
};

/** Canonical Ghostboards Demo Stock Items — protected server-side baseline. */
export const GHOSTBOARDS_BASELINE_SKUS: readonly GhostboardsBaselineSku[] = [
  {
    sku: 'ACR-MIR-SLV-3MM',
    description: 'Silver Mirror Acrylic Sheet 3mm',
    costPrice: 77.62,
    salesPrice: 0,
    quantityInStock: 66,
    reorderLevel: 10,
  },
  {
    sku: 'ACR-BLK-3MM-48X96',
    description: 'Black Acrylic Sheet 3mm 48 × 96',
    costPrice: 49,
    salesPrice: 0,
    quantityInStock: 54,
    reorderLevel: 25,
  },
  {
    sku: 'ACR-CLR-6MM-48X96',
    description: 'Clear Acrylic Sheet 6mm 48 × 96',
    costPrice: 86.62,
    salesPrice: 0,
    quantityInStock: 58,
    reorderLevel: 20,
  },
  {
    sku: 'ACR-CLR-3MM-48X96',
    description: 'Clear Acrylic Sheet 3mm 48 × 96',
    costPrice: 48.94,
    salesPrice: 0,
    quantityInStock: 122,
    reorderLevel: 40,
  },
] as const;

/** Reference used for baseline quantity create/reconcile Stock Movements. */
export const GHOSTBOARDS_BASELINE_MOVEMENT_REFERENCE = 'GHOSTBOARDS-DEMO-BASELINE';

/** SKUs used by the synthetic PO workflow (subset of baseline). */
export const GHOSTBOARDS_DEMO_WORKFLOW_SKUS = [
  'ACR-CLR-3MM-48X96',
] as const;

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
