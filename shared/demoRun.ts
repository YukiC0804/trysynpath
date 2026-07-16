export type DemoRunStatus =
  | 'prepared'
  | 'baseline_captured'
  | 'purchase_posted'
  | 'inventory_posted'
  | 'sales_posted'
  | 'resetting'
  | 'reset_complete'
  | 'reset_incomplete';

export interface DemoStockBaselineSnapshot {
  sageStockItemId: string;
  itemCode: string;
  description: string;
  quantityInStock: number;
  costPrice: number;
  lastCostPrice: number;
  averageCostPrice: number;
  salesPrice: number;
  costPriceLastUpdated?: string;
  snapshotAt: string;
  costPriceExplicitlyUpdated: boolean;
  afterQuantityInStock?: number;
  afterCostPrice?: number;
  afterLastCostPrice?: number;
  afterAverageCostPrice?: number;
}

export interface DemoTransactionRecord {
  type: 'purchase_invoice' | 'stock_movement' | 'sales_invoice' | 'stock_item_cost_update';
  sageTransactionId: string;
  externalReference: string;
  status: 'succeeded' | 'failed' | 'voided' | 'deleted' | 'restored';
  requestSummary: Record<string, unknown>;
  readBackSummary: Record<string, unknown>;
  readBackVerified: boolean;
  createdAt: string;
  cleanedAt?: string;
  error?: string;
}

export interface DemoRunRecord {
  id: string;
  demoRunReference: string;
  workflowRunId?: string;
  sageBusinessId: string;
  externalPoReference: string;
  vendorInvoiceReference: string;
  customerInvoiceReference: string;
  status: DemoRunStatus;
  createdAt: string;
  updatedAt: string;
  baseline: DemoStockBaselineSnapshot[];
  transactions: DemoTransactionRecord[];
  resetLog: string[];
  verification: {
    resetComplete: boolean;
    mismatches: Array<{ sku: string; field: string; expected: number; actual: number }>;
  };
}

export interface DemoPrepareResult {
  ready: boolean;
  demoRunReferencePreview: string;
  missingSkus: string[];
  stockItems: Array<{
    sku: string;
    description: string;
    quantityInStock: number;
    costPrice: number;
    lastCostPrice: number;
    averageCostPrice: number;
    exists: boolean;
  }>;
}
