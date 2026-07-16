import type {
  AllocationMethod,
  LandedCostAllocation,
  LandedCostComponent,
  ShipmentLine,
} from '../../../shared/workflow';

export interface LandedCostResult {
  allocations: LandedCostAllocation[];
  reconciliation: {
    sourceGoodsTotal: number;
    freightTotal: number;
    dutyTotal: number;
    taxTotal: number;
    otherCharges: number;
    totalCapitalizableCost: number;
    totalAllocated: number;
    variance: number;
    withinTolerance: boolean;
  };
  errors: string[];
}

const money = (value: number) => Number(value.toFixed(2));
const precise = (value: number) => Number(value.toFixed(6));

function basisFor(line: ShipmentLine, method: AllocationMethod): number {
  if (method === 'product_value') return line.vendorLineTotal;
  if (method === 'quantity') return line.receivedQuantity;
  if (method === 'weight') return line.weight;
  if (method === 'volume') return line.volume;
  return 0;
}

function allocateComponent(
  component: LandedCostComponent,
  lines: ShipmentLine[],
): { amounts: Record<string, number>; error?: string } {
  const amounts: Record<string, number> = Object.fromEntries(lines.map((line) => [line.sku, 0]));
  const total = money(component.baseCurrencyAmount);
  if (!component.capitalizable || component.recoverableTax) return { amounts };

  if (component.allocationMethod === 'manual_amount') {
    for (const line of lines) amounts[line.sku] = money(component.manualAllocations?.[line.sku] ?? 0);
    const allocated = money(Object.values(amounts).reduce((sum, amount) => sum + amount, 0));
    return allocated === total
      ? { amounts }
      : { amounts, error: `${component.id}: manual amounts do not reconcile (${allocated} vs ${total})` };
  }

  if (component.allocationMethod === 'manual_percentage') {
    const percentages = lines.map((line) => component.manualAllocations?.[line.sku] ?? 0);
    const percentageTotal = precise(percentages.reduce((sum, amount) => sum + amount, 0));
    if (Math.abs(percentageTotal - 100) > 0.000001) {
      return {
        amounts,
        error: `${component.id}: manual percentages must total 100 (currently ${percentageTotal})`,
      };
    }
    return allocateByWeights(component, lines, percentages);
  }

  const weights = lines.map((line) => basisFor(line, component.allocationMethod));
  if (weights.some((weight) => weight < 0)) {
    return { amounts, error: `${component.id}: allocation basis cannot be negative` };
  }
  return allocateByWeights(component, lines, weights);
}

function allocateByWeights(
  component: LandedCostComponent,
  lines: ShipmentLine[],
  weights: number[],
): { amounts: Record<string, number>; error?: string } {
  const amounts: Record<string, number> = {};
  const totalWeight = weights.reduce((sum, value) => sum + value, 0);
  const total = money(component.baseCurrencyAmount);
  if (totalWeight <= 0) {
    return {
      amounts: Object.fromEntries(lines.map((line) => [line.sku, 0])),
      error: `${component.id}: allocation basis totals zero`,
    };
  }
  let allocated = 0;
  lines.forEach((line, index) => {
    const amount =
      index === lines.length - 1
        ? money(total - allocated)
        : money((total * weights[index]) / totalWeight);
    amounts[line.sku] = amount;
    allocated = money(allocated + amount);
  });
  return { amounts };
}

function bucketFor(component: LandedCostComponent): keyof Pick<
  LandedCostAllocation,
  | 'allocatedFreight'
  | 'allocatedDuty'
  | 'allocatedBrokerage'
  | 'allocatedInsurance'
  | 'allocatedTax'
  | 'allocatedOther'
> {
  if (component.type === 'freight') return 'allocatedFreight';
  if (component.type === 'duty') return 'allocatedDuty';
  if (component.type === 'brokerage') return 'allocatedBrokerage';
  if (component.type === 'insurance') return 'allocatedInsurance';
  if (component.type === 'tax') return 'allocatedTax';
  return 'allocatedOther';
}

export function calculateLandedCosts(
  lines: ShipmentLine[],
  components: LandedCostComponent[],
  tolerance = 0.01,
): LandedCostResult {
  const errors: string[] = [];
  const allocations = lines.map<LandedCostAllocation>((line) => ({
    sku: line.sku,
    goodsCost: money(line.vendorLineTotal),
    allocatedFreight: 0,
    allocatedDuty: 0,
    allocatedBrokerage: 0,
    allocatedInsurance: 0,
    allocatedTax: 0,
    allocatedOther: 0,
    landedCostTotal: 0,
    landedUnitCost: 0,
    roundingAdjustment: 0,
  }));
  const bySku = new Map(allocations.map((allocation) => [allocation.sku, allocation]));

  for (const component of components) {
    const result = allocateComponent(component, lines);
    if (result.error) errors.push(result.error);
    const bucket = bucketFor(component);
    for (const [sku, amount] of Object.entries(result.amounts)) {
      const allocation = bySku.get(sku);
      if (allocation) allocation[bucket] = money(allocation[bucket] + amount);
    }
  }

  for (const allocation of allocations) {
    const charges =
      allocation.allocatedFreight +
      allocation.allocatedDuty +
      allocation.allocatedBrokerage +
      allocation.allocatedInsurance +
      allocation.allocatedTax +
      allocation.allocatedOther;
    allocation.landedCostTotal = money(allocation.goodsCost + charges);
    const quantity = lines.find((line) => line.sku === allocation.sku)?.receivedQuantity ?? 0;
    allocation.landedUnitCost = quantity > 0 ? precise(allocation.landedCostTotal / quantity) : 0;
  }

  const sourceGoodsTotal = money(lines.reduce((sum, line) => sum + line.vendorLineTotal, 0));
  const capitalizable = components.filter(
    (component) => component.capitalizable && !component.recoverableTax,
  );
  const freightTotal = money(
    capitalizable
      .filter((component) => component.type === 'freight')
      .reduce((sum, component) => sum + component.baseCurrencyAmount, 0),
  );
  const dutyTotal = money(
    capitalizable
      .filter((component) => component.type === 'duty')
      .reduce((sum, component) => sum + component.baseCurrencyAmount, 0),
  );
  const taxTotal = money(
    components
      .filter((component) => component.type === 'tax')
      .reduce((sum, component) => sum + component.baseCurrencyAmount, 0),
  );
  const otherCharges = money(
    capitalizable
      .filter((component) => !['freight', 'duty'].includes(component.type))
      .reduce((sum, component) => sum + component.baseCurrencyAmount, 0),
  );
  const totalCapitalizableCost = money(
    sourceGoodsTotal +
      capitalizable.reduce((sum, component) => sum + component.baseCurrencyAmount, 0),
  );
  const totalAllocated = money(
    allocations.reduce((sum, allocation) => sum + allocation.landedCostTotal, 0),
  );
  const variance = money(totalCapitalizableCost - totalAllocated);
  return {
    allocations,
    reconciliation: {
      sourceGoodsTotal,
      freightTotal,
      dutyTotal,
      taxTotal,
      otherCharges,
      totalCapitalizableCost,
      totalAllocated,
      variance,
      withinTolerance: Math.abs(variance) <= tolerance && errors.length === 0,
    },
    errors,
  };
}
