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
  sales_prices?: Array<{
    price?: string | number;
    price_name?: string;
    price_includes_tax?: boolean;
    product_sales_price_type?: { id?: string };
  }>;
  quantity_in_stock?: string | number;
  last_cost_price?: string | number;
  average_cost_price?: string | number;
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

export const COOKIE_SESSION = 'sage_session';
export const COOKIE_OAUTH_STATE = 'sage_oauth_state';
export const COOKIE_AUDIT = 'sage_audit';

export const SAGE_REQUIRED_ENV = [
  'APP_BASE_URL',
  'SAGE_CLIENT_ID',
  'SAGE_CLIENT_SECRET',
  'SAGE_REDIRECT_URI',
  'SAGE_API_BASE_URL',
  'TOKEN_ENCRYPTION_KEY',
] as const;
