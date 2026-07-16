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
const MM_PER_INCH = 25.4;

/**
 * Cut-to-size area ratio: Spandex/Sage sell size (inches) vs UGolden purchase size (mm).
 * Example: 3mm WHITE 1220×2440 → 48"×96"
 *   ratio = (48×25.4 × 96×25.4) / (1220 × 2440)
 */
export function sheetCutAreaRatio(line: Pick<
  ShipmentLine,
  'purchaseWidthMm' | 'purchaseLengthMm' | 'saleWidthIn' | 'saleLengthIn'
>): number {
  const purchaseW = Number(line.purchaseWidthMm ?? 0);
  const purchaseL = Number(line.purchaseLengthMm ?? 0);
  const saleWIn = Number(line.saleWidthIn ?? 0);
  const saleLIn = Number(line.saleLengthIn ?? 0);
  if (purchaseW <= 0 || purchaseL <= 0 || saleWIn <= 0 || saleLIn <= 0) return 1;
  const saleAreaMm2 = saleWIn * MM_PER_INCH * saleLIn * MM_PER_INCH;
  const purchaseAreaMm2 = purchaseW * purchaseL;
  if (purchaseAreaMm2 <= 0) return 1;
  return saleAreaMm2 / purchaseAreaMm2;
}

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
    // Keep line total for Purchase Invoice / DDP reconciliation (full UGolden amount).
    allocation.landedCostTotal = money(allocation.goodsCost + charges);
    const line = lines.find((item) => item.sku === allocation.sku);
    const quantity = line?.receivedQuantity ?? 0;
    if (!line || quantity <= 0) {
      allocation.landedUnitCost = 0;
      continue;
    }
    // Inventory cost per cut sheet (Sage stock item size):
    // (UGolden unit price + DDP-by-weight per piece) × saleArea/purchaseArea
    // + pallet share per piece.
    const ddpPerPiece = allocation.allocatedDuty / quantity;
    const palletPerPiece = allocation.allocatedFreight / quantity;
    const otherPerPiece =
      (allocation.allocatedBrokerage +
        allocation.allocatedInsurance +
        allocation.allocatedTax +
        allocation.allocatedOther) /
      quantity;
    const ratio = sheetCutAreaRatio(line);
    allocation.landedUnitCost = precise(
      (line.vendorUnitCost + ddpPerPiece) * ratio + palletPerPiece + otherPerPiece,
    );
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
