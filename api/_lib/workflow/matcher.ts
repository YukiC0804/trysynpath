import type { ShipmentLine } from '../../../shared/workflow';

export interface MatchableStockItem {
  id: string;
  sku: string;
}

export function matchShipmentLines(
  lines: ShipmentLine[],
  stockItems: MatchableStockItem[],
): string[] {
  const errors: string[] = [];
  for (const line of lines) {
    const matches = stockItems.filter(
      (item) => item.sku.toUpperCase() === line.sku.toUpperCase(),
    );
    if (matches.length === 1) {
      line.matchedSageStockItemId = matches[0].id;
      line.matchedSageItemCode = matches[0].sku;
      line.matchingStatus = 'exact';
      line.matchingConfidence = 1;
    } else if (matches.length > 1) {
      line.matchingStatus = 'ambiguous';
      line.matchingConfidence = 0.5;
      errors.push(`${line.sku}: ambiguous Sage Stock Item match`);
    } else {
      line.matchingStatus = 'unmatched';
      line.matchingConfidence = 0;
      errors.push(`${line.sku}: no Sage Stock Item match`);
    }
  }
  return errors;
}
