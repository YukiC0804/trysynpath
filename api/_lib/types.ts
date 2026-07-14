export interface SageTokens {
  accessToken: string;
  refreshToken: string;
  expiresAt: number;
  tokenType?: string;
  scope?: string;
}

export interface SageSession {
  tokens: SageTokens;
  businessId?: string;
  businessName?: string;
  businessType?: string;
  connectedAt?: string;
  country?: string;
}

export interface SageStockItem {
  id: string;
  item_code?: string;
  description?: string;
  cost_price?: string | number;
  sales_price?: string | number;
  sales_prices?: Array<{ price?: string | number; price_name?: string }>;
  quantity_in_stock?: string | number;
  reorder_level?: string | number;
  reorder_quantity?: string | number;
  supplier_part_number?: string;
  usual_supplier?: { id?: string; displayed_as?: string; reference?: string } | null;
  active?: boolean;
  [key: string]: unknown;
}

export interface SageBusiness {
  id: string;
  name?: string;
  displayed_as?: string;
  country?: string;
  subscription?: string;
  product?: string;
  business_type?: string | { id?: string };
  [key: string]: unknown;
}

export interface AuditEntry {
  id: string;
  at: string;
  action: string;
  detail: string;
  status: 'info' | 'success' | 'warning' | 'error';
}

export const KNOWN_STOCK_ITEMS = [
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

export const NEW_STOCK_ITEM = {
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

export const SAGE_SUPPLIERS = [
  { name: 'Nationwide Acrylics', reference: 'NWA-003' },
  { name: 'Pacific Acrylic Supply', reference: 'PAC-ACRYLIC-001' },
  { name: 'West Coast Plastics', reference: 'WCP-002' },
] as const;

export const COOKIE_SESSION = 'sage_session';
export const COOKIE_OAUTH_STATE = 'sage_oauth_state';
export const COOKIE_AUDIT = 'sage_audit';
