/** Shared extract schema hint — ported from ai_erp parse_pdf._EXTRACT_SCHEMA_HINT */
export const EXTRACT_SCHEMA_HINT = `
Return ONLY a JSON object matching this shape (no markdown):
{
  "document_role": "purchase_invoice" | "freight" | "duty" | "unknown",
  "vendor": {
    "id": "short code e.g. GOK",
    "name": "full vendor name",
    "company_name": "...",
    "email": null,
    "address1": null, "address2": null, "city": null, "state": null,
    "zip": null, "country": null
  } | null,
  "invoice_number": "string",
  "invoice_date": "YYYY-MM-DD",
  "currency": "USD",
  "invoice_total": 1234.56,
  "includes_ddp": false,
  "ddp_amount": null,
  "freight_amount": null,
  "duty_amount": null,
  "lines": [
    {
      "raw_description": "...",
      "is_acrylic": true,
      "is_packing_or_misc": false,
      "product_code": "ACR",
      "color_code": "CLR",
      "color_name": "Clear",
      "vendor_product_name": "Gokai",
      "thickness_mm": 4,
      "size": "4x8",
      "quantity": 10,
      "unit_price": 42.5,
      "amount": 425.0,
      "line_kind": "acrylic" | "packing" | "ddp" | "freight" | "duty" | "other"
    }
  ],
  "notes": null
}

Rules:
- Acrylic sheet lines: is_acrylic=true, line_kind="acrylic", parse thickness (mm)
  and size. product_code default ACR, color_code default CLR (black→BLK).
- Gokai-style tables have separate columns: Code, Item, Color, width(mm),
  length(mm), Thick(mm), Density(g/cm3), Quantity(pcs), Unit Price(USD/Sheet),
  Amount(USD). Map:
  * thickness_mm ← Thick(mm) column (e.g. 18.00)
  * size ← convert width×length mm to feet SKU size: 1220×2440 → "4x8"
    (approx mm/305). NEVER leave size as "1220x2440" when it is a full sheet.
  * unit_price ← Unit Price (USD/Sheet); amount ← Amount (USD)
  * Density (~1.20) is NEVER unit_price.
  * Export pallet / packing rows: is_packing_or_misc=true, line_kind="packing".
- CRITICAL — money vs physical specs:
  * unit_price / amount / invoice_total / freight_amount / duty_amount / ddp_amount
    MUST be currency dollars (USD/$), NEVER Density, specific gravity, kg, mm, or qty.
  * Columns named Density / Spec Gravity / Weight / Thickness are NOT prices.
  * For acrylic lines ALWAYS capture line amount (extended $) when printed.
    Prefer unit_price = amount / quantity when both exist.
  * Typical acrylic sheet unit prices are tens of dollars (often ~20–300), not
    0.8–1.5 (density) or bare thickness values.
- Packing materials / misc: is_packing_or_misc=true, line_kind="packing" or "other".
- If the invoice includes DDP (delivered duty paid), set includes_ddp=true and
  ddp_amount to the DDP dollar amount (or residual); never a weight/density.
- Freight-only PDF: document_role="freight". freight_amount AND invoice_total =
  TOTAL Amount Due / PLEASE PAY THIS AMOUNT / Grand Total in dollars.
  No acrylic lines.
- Duty-only PDF: document_role="duty". duty_amount AND invoice_total = TOTAL
  Amount Due in dollars. No acrylic lines.
- vendor.id: invent a short 2–4 letter code from the vendor name when not printed
  (Gokai → GOK).
- JM Trophies / cut-to-size sheets: size like 18x24 from "cut to 18\\" x 24\\"";
  keep quantity and Unit Price from the table columns (not density).
`.trim();
