/** Ghost Acrylics purchase → landed cost domain types (ported from ai_erp models.py). */

export type ImportCostMethod = 'ddp_on_invoice' | 'freight_and_duty' | 'none';

export type DocumentRole = 'purchase_invoice' | 'freight' | 'duty' | 'unknown';

export type LineKind = 'acrylic' | 'packing' | 'ddp' | 'freight' | 'duty' | 'other';

export interface VendorExtract {
  id: string;
  name: string;
  company_name?: string | null;
  email?: string | null;
  address1?: string | null;
  address2?: string | null;
  city?: string | null;
  state?: string | null;
  zip?: string | null;
  country?: string | null;
}

export interface InvoiceLineExtract {
  raw_description: string;
  is_acrylic: boolean;
  is_packing_or_misc: boolean;
  product_code?: string | null;
  color_code?: string | null;
  color_name?: string | null;
  vendor_product_name?: string | null;
  thickness_mm?: number | null;
  size?: string | null;
  quantity: number;
  unit_price: number;
  amount?: number | null;
  line_kind: LineKind;
}

export interface DocumentExtract {
  document_role: DocumentRole;
  vendor?: VendorExtract | null;
  invoice_number?: string | null;
  invoice_date?: string | null;
  currency?: string | null;
  invoice_total?: number | null;
  includes_ddp: boolean;
  ddp_amount?: number | null;
  freight_amount?: number | null;
  duty_amount?: number | null;
  lines: InvoiceLineExtract[];
  notes?: string | null;
}

export interface AcrylicSkuLine {
  sku_id: string;
  description: string;
  thickness_mm: number;
  size: string;
  quantity: number;
  raw_unit_price: number;
  sheet_weight_kg: number;
  land_cost_per_sheet: number;
  landed_unit_cost: number;
  amount: number;
  raw_description?: string | null;
}

export interface LandedCostBreakdown {
  method: ImportCostMethod;
  import_pool: number;
  total_acrylic_product_cost: number;
  total_weight_kg: number;
  import_cost_per_kg: number;
  invoice_total?: number | null;
  ddp_amount?: number | null;
  freight_amount?: number | null;
  duty_amount?: number | null;
}

export interface PurchaseWritePlan {
  vendor: VendorExtract;
  invoice_number: string;
  invoice_date: string;
  po_reference_number: string;
  receive_reference_number: string;
  gl_account_id: string;
  landed: LandedCostBreakdown;
  lines: AcrylicSkuLine[];
  packing_and_other_excluded: InvoiceLineExtract[];
  sageWrite: 'preview_only';
}

export type SalesReviewReason =
  | 'missing_data'
  | 'unusual_price'
  | 'stock_conflict'
  | 'possible_duplicate';

export interface SalesOrderLine {
  sku: string;
  description: string;
  quantity: number;
  unit_price: number;
  amount: number;
  line_kind: LineKind;
  list_price?: number | null;
  on_hand?: number | null;
}

export interface SalesOrderPlan {
  customer: string;
  customer_id?: string | null;
  po_number?: string | null;
  invoice_number?: string | null;
  invoice_date?: string | null;
  currency: string;
  lines: SalesOrderLine[];
  totals: { subtotal: number; freight: number; total: number };
  needs_review: boolean;
  review_reasons: SalesReviewReason[];
  sageWrite: 'preview_only';
}

export interface ActivityEvent {
  id: string;
  agent: string;
  summary: string;
  at: string;
  status?: string;
}

export interface CfoAuditRecord {
  user: string;
  at: string;
  invoiceNumber: string;
  method: ImportCostMethod;
  pool: number;
  lineSkus: string[];
  proposedSagePayload: PurchaseWritePlan;
  status: 'approved';
}
