import { describe, expect, it } from 'vitest';
import { demoInvoiceDates } from '../api/_lib/workflow/fixtures';
import {
  buildGhoacrugolBundle,
  fallbackSpandexParse,
  fallbackUgoldenParse,
  GHOACRUGOL_PACK_LINES,
} from '../api/_lib/workflow/ghoacrugolBundle';
import {
  calculateLandedCosts,
  sheetCutAreaRatio,
} from '../api/_lib/workflow/landedCostEngine';

describe('Ghoacrugol cut-to-size landed cost', () => {
  it('hardcodes UGolden ACRYLIC SHEET lines and Spandex GA18 sell prices', () => {
    const vendor = fallbackUgoldenParse();
    const sales = fallbackSpandexParse();
    expect(vendor.lines).toHaveLength(6);
    expect(vendor.lines[0]).toMatchObject({
      sku: 'ACR-WHT-3MM-48X96',
      description: 'ACRYLIC SHEET WHITE 3mm 1220×2440',
      quantity: 102,
      vendorUnitCost: 24.16,
      widthMm: 1220,
      lengthMm: 2440,
      weight: 1123,
    });
    expect(sales.lines[0]).toMatchObject({
      sku: 'ACR-WHT-3MM-48X96',
      description: 'COLORED ACRYLIC SHEET 3mm x 48" x 96" WHITE',
      salesUnitPrice: 39.45,
      quantity: 102,
    });
    expect(sales.lines.find((line) => line.sku === 'ACR-CLR-4MM-48X96')).toBeUndefined();
    expect(GHOACRUGOL_PACK_LINES.map((line) => line.vendorUnitCost)).toEqual([
      24.16, 144.9, 214.1, 57.43, 34.3, 89,
    ]);
  });

  it('scales inventory unit cost by sale/purchase area and DDP-by-weight', () => {
    const bundle = buildGhoacrugolBundle([], demoInvoiceDates(), {
      vendor: fallbackUgoldenParse(),
      sales: fallbackSpandexParse(),
    });
    const line = bundle.shipment.lines.find((item) => item.sku === 'ACR-WHT-3MM-48X96');
    expect(line).toBeTruthy();
    const ratio = sheetCutAreaRatio(line!);
    // 48"×96" in mm² / 1220×2440 mm²
    expect(ratio).toBeCloseTo((48 * 25.4 * 96 * 25.4) / (1220 * 2440), 6);

    const result = calculateLandedCosts(
      bundle.shipment.lines,
      bundle.landedCostComponents,
    );
    expect(result.reconciliation.withinTolerance).toBe(true);
    expect(result.reconciliation.totalCapitalizableCost).toBe(46845.34);

    const allocation = result.allocations.find((item) => item.sku === 'ACR-WHT-3MM-48X96');
    expect(allocation).toBeTruthy();
    const ddpPerPiece = allocation!.allocatedDuty / 102;
    const palletPerPiece = allocation!.allocatedFreight / 102;
    const expected = (24.16 + ddpPerPiece) * ratio + palletPerPiece;
    expect(allocation!.landedUnitCost).toBeCloseTo(expected, 5);
    // Cut scaling makes inventory unit cost slightly below unscaled landed/qty.
    expect(allocation!.landedUnitCost).toBeLessThan(allocation!.landedCostTotal / 102);
    expect(allocation!.landedUnitCost).toBeGreaterThan(24.16);
  });
});
