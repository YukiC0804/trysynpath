import { describe, expect, it } from 'vitest';
import type {
  AllocationMethod,
  LandedCostComponent,
  ShipmentLine,
} from '../shared/workflow';
import { calculateLandedCosts } from '../api/_lib/workflow/landedCostEngine';
import { FixtureSourceAdapter } from '../api/_lib/workflow/sourceAdapters';
import { FixtureDocumentExtractionAdapter } from '../api/_lib/workflow/extraction';

const lines: ShipmentLine[] = [
  {
    sku: 'A',
    description: 'A',
    quantity: 2,
    receivedQuantity: 2,
    unitOfMeasure: 'ea',
    vendorUnitCost: 50,
    vendorLineTotal: 100,
    weight: 10,
    volume: 1,
    matchingStatus: 'unmatched',
    matchingConfidence: 0,
  },
  {
    sku: 'B',
    description: 'B',
    quantity: 4,
    receivedQuantity: 4,
    unitOfMeasure: 'ea',
    vendorUnitCost: 50,
    vendorLineTotal: 200,
    weight: 30,
    volume: 3,
    matchingStatus: 'unmatched',
    matchingConfidence: 0,
  },
];

function charge(
  method: AllocationMethod,
  amount = 30,
  manualAllocations?: Record<string, number>,
): LandedCostComponent {
  return {
    id: `charge-${method}`,
    type: 'freight',
    supplier: 'Test',
    sourceDocumentId: 'doc',
    amount,
    currency: 'GBP',
    baseCurrencyAmount: amount,
    allocationMethod: method,
    classification: 'capitalizable',
    capitalizable: true,
    recoverableTax: false,
    manualAllocations,
  };
}

describe.each([
  ['product_value' as const, [10, 20]],
  ['quantity' as const, [10, 20]],
  ['weight' as const, [7.5, 22.5]],
  ['volume' as const, [7.5, 22.5]],
  ['manual_percentage' as const, [12, 18]],
  ['manual_amount' as const, [11, 19]],
])('landed-cost %s allocation', (method, expected) => {
  it('reconciles exactly to the source charge', () => {
    const manual =
      method === 'manual_percentage'
        ? { A: 40, B: 60 }
        : method === 'manual_amount'
          ? { A: 11, B: 19 }
          : undefined;
    const result = calculateLandedCosts(lines, [charge(method, 30, manual)]);
    expect(result.allocations.map((item) => item.allocatedFreight)).toEqual(expected);
    expect(result.reconciliation.variance).toBe(0);
    expect(result.reconciliation.withinTolerance).toBe(true);
  });
});

describe('landed-cost safety and currency behavior', () => {
  it('reconciles deterministic rounding to the final penny', () => {
    const result = calculateLandedCosts(
      lines.map((line, index) => ({
        ...line,
        sku: String.fromCharCode(65 + index),
        receivedQuantity: 1,
        vendorLineTotal: 1,
      })),
      [charge('quantity', 10.01)],
    );
    expect(
      result.allocations.reduce((sum, item) => sum + item.allocatedFreight, 0),
    ).toBe(10.01);
    expect(result.reconciliation.variance).toBe(0);
  });

  it('excludes recoverable tax from landed cost', () => {
    const vat = {
      ...charge('product_value', 60),
      id: 'vat',
      type: 'tax' as const,
      classification: 'recoverable_tax' as const,
      capitalizable: false,
      recoverableTax: true,
    };
    const result = calculateLandedCosts(lines, [vat]);
    expect(result.reconciliation.taxTotal).toBe(60);
    expect(result.reconciliation.totalCapitalizableCost).toBe(300);
    expect(result.allocations.every((item) => item.allocatedTax === 0)).toBe(true);
  });

  it('converts charge amounts using the shipment exchange rate', async () => {
    const source = await new FixtureSourceAdapter().collect();
    const result = await new FixtureDocumentExtractionAdapter().extract(source, {
      exchangeRate: 1.2,
      chargeAmounts: { 'charge-freight': 500 },
    });
    const freight = result.bundle.landedCostComponents.find(
      (component) => component.id === 'charge-freight',
    );
    expect(freight?.baseCurrencyAmount).toBe(600);
  });

  it('blocks unresolved manual allocations', () => {
    const result = calculateLandedCosts(lines, [
      charge('manual_percentage', 30, { A: 20, B: 20 }),
    ]);
    expect(result.errors[0]).toContain('must total 100');
    expect(result.reconciliation.withinTolerance).toBe(false);
  });
});
