import type { DocumentExtract, InvoiceLineExtract } from '../../../shared/ghost';
import { normalizeSheetSize } from './sku';

function looksLikePhysicalSpec(value: number, thicknessMm: number | null | undefined): boolean {
  if (value <= 0) return true;
  if (thicknessMm != null && Math.abs(value - thicknessMm) < 1e-6) return true;
  if (value >= 0.5 && value <= 2.5) return true;
  if (
    thicknessMm != null &&
    value >= 1 &&
    value <= 25 &&
    Math.abs(value - thicknessMm) < 0.6
  ) {
    return true;
  }
  return false;
}

export function sanitizeExtract(doc: DocumentExtract): DocumentExtract {
  const notes: string[] = [];
  const fixedLines: InvoiceLineExtract[] = doc.lines.map((ln) => {
    let unit = Number(ln.unit_price || 0);
    const qty = Number(ln.quantity || 0);
    const amt = ln.amount;
    let size = ln.size ?? null;
    if (size) {
      const norm = normalizeSheetSize(size);
      if (norm !== size) {
        notes.push(`size ${size} → ${norm}`);
        size = norm;
      }
    }
    if (ln.is_acrylic && qty > 0 && amt != null && Number(amt) > 0) {
      const derived = Number(amt) / qty;
      if (
        looksLikePhysicalSpec(unit, ln.thickness_mm) ||
        (Math.abs(unit - derived) / Math.max(derived, 1e-9) > 0.15 &&
          !looksLikePhysicalSpec(derived, ln.thickness_mm))
      ) {
        if (Math.abs(unit - derived) > 1e-6) {
          notes.push(
            `unit_price ${unit} → ${derived.toFixed(4)} from amount/qty (${ln.raw_description.slice(0, 40)})`,
          );
        }
        unit = derived;
      }
    } else if (ln.is_acrylic && looksLikePhysicalSpec(unit, ln.thickness_mm)) {
      notes.push(
        `rejected suspicious unit_price=${unit} on acrylic line (${ln.raw_description.slice(0, 40)}); set 0`,
      );
      unit = 0;
    }
    return { ...ln, unit_price: unit, size };
  });

  let freight = doc.freight_amount ?? null;
  let duty = doc.duty_amount ?? null;
  let total = doc.invoice_total ?? null;
  if (doc.document_role === 'freight') {
    if ((freight == null || freight <= 2.5) && total && total > 2.5) {
      freight = total;
      notes.push(`freight_amount ← invoice_total (${total})`);
    } else if (freight && freight > 2.5 && (total == null || total <= 2.5)) {
      total = freight;
    }
  }
  if (doc.document_role === 'duty') {
    if (total && total > 2.5) {
      if (duty != null && Math.abs(Number(duty) - Number(total)) > 0.01) {
        notes.push(`duty_amount ${duty} → invoice_total (${total})`);
      }
      duty = total;
    } else if (duty && duty > 2.5 && (total == null || total <= 2.5)) {
      total = duty;
      notes.push(`invoice_total ← duty_amount (${duty})`);
    }
  }
  const noteExtra = notes.length ? notes.join('; ') : null;
  const combined = [doc.notes, noteExtra].filter(Boolean).join(' | ') || null;
  return {
    ...doc,
    lines: fixedLines,
    freight_amount: freight,
    duty_amount: duty,
    invoice_total: total,
    notes: combined,
  };
}
