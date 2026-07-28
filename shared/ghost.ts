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
  /** Decimal digits the unit price / amount are printed with on the source document. */
  price_decimals?: number | null;
  /** Customer this line is earmarked for, when the source document bundles multiple
   * end customers into one purchase invoice (e.g. Gokai "Code (CUSTOMER)" tables). */
  customer_name?: string | null;
}

export interface DocumentExtract {
  document_role: DocumentRole;
  vendor?: VendorExtract | null;
  invoice_number?: string | null;
  invoice_date?: string | null;
  due_date?: string | null;
  currency?: string | null;
  invoice_total?: number | null;
  includes_ddp: boolean;
  ddp_amount?: number | null;
  freight_amount?: number | null;
  duty_amount?: number | null;
  lines: InvoiceLineExtract[];
  notes?: string | null;
  /** "Ship To" block lines as printed, in order (e.g. ["Cesar Orozco", "CN Ledge"]) — used to
   * resolve the customer on Sales Order documents, where `vendor` is the seller, not the buyer. */
  ship_to?: string[] | null;
}

export interface AcrylicSkuLine {
  sku_id: string;
  description: string;
  product_code?: string | null;
  color_code?: string | null;
  color_name?: string | null;
  thickness_mm: number;
  size: string;
  quantity: number;
  raw_unit_price: number;
  sheet_weight_kg: number;
  land_cost_per_sheet: number;
  landed_unit_cost: number;
  amount: number;
  raw_description?: string | null;
  /** Decimal digits raw_unit_price / landed_unit_cost / land_cost_per_sheet are rounded to. */
  price_decimals: number;
  /** All end customers this sku_id was seen under in the source invoice(s) — lookup aid only,
   * the price fields above are the single (possibly blended) value for this sku_id. */
  customer_names: string[];
}

export interface SkuCatalogEntry {
  sku_id: string;
  description: string;
  product_code?: string | null;
  color_code?: string | null;
  color_name?: string | null;
  thickness_mm: number;
  size: string;
  vendor_id: string;
  vendor_name?: string | null;
  vendor_company_name?: string | null;
  vendor_email?: string | null;
  vendor_address1?: string | null;
  vendor_address2?: string | null;
  vendor_city?: string | null;
  vendor_state?: string | null;
  vendor_zip?: string | null;
  vendor_country?: string | null;
  quantity: number;
  raw_unit_price: number;
  sheet_weight_kg: number;
  land_cost_per_sheet: number;
  landed_unit_cost: number;
  amount: number;
  raw_description?: string | null;
  price_decimals: number;
  freight_cost?: number | null;
  duty_cost?: number | null;
  ddp_cost?: number | null;
  customer_names: string[];
  invoice_number: string;
  /** Invoice date as printed on the source document, mm/dd/yyyy. */
  date: string;
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

export type SalesReviewReason = 'missing_data' | 'no_catalog_match';

export interface SalesOrderLine {
  sku: string;
  description: string;
  quantity: number;
  unit_price: number;
  amount: number;
  line_kind: LineKind;
}

export interface SalesOrderPlan {
  customer: string;
  po_number?: string | null;
  invoice_number?: string | null;
  invoice_date?: string | null;
  due_date?: string | null;
  currency: string;
  lines: SalesOrderLine[];
  totals: { subtotal: number; freight: number; total: number };
  needs_review: boolean;
  review_reasons: SalesReviewReason[];
  sageWrite: 'preview_only';
}

export interface SalesOrderPriceLine {
  sku_id: string;
  description: string;
  quantity: number;
  /** Rate as printed on the customer invoice — read directly, never derived. */
  sales_price: number;
  amount: number;
}

/** Persisted record for one customer invoice — keyed by invoice_number, full overwrite on reprocess. */
export interface SalesOrderRecord {
  customer_name: string;
  invoice_number: string;
  /** Invoice date as printed on the source document, mm/dd/yyyy. */
  date: string;
  currency: string;
  lines: SalesOrderPriceLine[];
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

/** Per-sku margin: sales price vs. landed cost, quantity-weighted when either side has multiple observations. */
export interface SkuMarginRow {
  sku_id: string;
  description: string;
  quantity_sold: number;
  weighted_sales_price: number;
  /** Weighted-average landed_unit_cost (raw_unit_price + land_cost_per_sheet) across SKU catalog entries. */
  weighted_cost_price: number;
  margin_per_unit: number;
  margin_pct: number;
}

export interface TopCustomer {
  customer_name: string;
  total_amount: number;
}

export interface PnlSummary {
  total_revenue: number;
  total_land_cost: number;
  total_cost: number;
  sku_margins: SkuMarginRow[];
  top_customers: TopCustomer[];
}
