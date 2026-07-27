/**
 * P&L rollup for the Intelligence dashboard, built entirely from data the
 * app has already produced: the SKU catalog (Supply & Costing landed
 * costs) and the Sales Order store (customer invoice records). No fixture
 * numbers — an empty catalog/store just yields zeros/empty lists.
 */
import type { PnlSummary, SkuMarginRow, TopCustomer } from '../../../shared/ghost';
import { listSkuCatalog } from './skuCatalog';
import { listSalesOrderRecords } from './salesOrderStore';

export async function computePnlSummary(): Promise<PnlSummary> {
  const [catalog, salesRecords] = await Promise.all([listSkuCatalog(), listSalesOrderRecords()]);

  let totalLandCost = 0;
  let totalCost = 0;
  const costBySku = new Map<string, { qty: number; costSum: number; description: string }>();
  for (const entry of catalog) {
    totalLandCost += entry.land_cost_per_sheet * entry.quantity;
    totalCost += entry.amount;
    const bucket = costBySku.get(entry.sku_id) ?? { qty: 0, costSum: 0, description: entry.description };
    bucket.qty += entry.quantity;
    bucket.costSum += entry.quantity * entry.landed_unit_cost;
    costBySku.set(entry.sku_id, bucket);
  }

  let totalRevenue = 0;
  const salesBySku = new Map<string, { qty: number; salesSum: number; description: string }>();
  const amountByCustomer = new Map<string, number>();
  for (const record of salesRecords) {
    let recordTotal = 0;
    for (const line of record.lines) {
      totalRevenue += line.amount;
      recordTotal += line.amount;
      const bucket = salesBySku.get(line.sku_id) ?? { qty: 0, salesSum: 0, description: line.description };
      bucket.qty += line.quantity;
      bucket.salesSum += line.quantity * line.sales_price;
      salesBySku.set(line.sku_id, bucket);
    }
    amountByCustomer.set(
      record.customer_name,
      (amountByCustomer.get(record.customer_name) ?? 0) + recordTotal,
    );
  }

  // Margin needs both a cost observation (bought via Supply) and a sales
  // observation (sold via Sales Order) for the same sku_id — skip anything
  // only seen on one side rather than showing a half-known margin.
  const sku_margins: SkuMarginRow[] = [];
  for (const [skuId, sales] of salesBySku) {
    const cost = costBySku.get(skuId);
    if (!cost || cost.qty <= 0 || sales.qty <= 0) continue;
    const weighted_cost_price = cost.costSum / cost.qty;
    const weighted_sales_price = sales.salesSum / sales.qty;
    const margin_per_unit = weighted_sales_price - weighted_cost_price;
    sku_margins.push({
      sku_id: skuId,
      description: sales.description,
      quantity_sold: sales.qty,
      weighted_sales_price,
      weighted_cost_price,
      margin_per_unit,
      margin_pct: weighted_sales_price > 0 ? (margin_per_unit / weighted_sales_price) * 100 : 0,
    });
  }
  sku_margins.sort((a, b) => b.margin_per_unit * b.quantity_sold - a.margin_per_unit * a.quantity_sold);

  const top_customers: TopCustomer[] = [...amountByCustomer.entries()]
    .map(([customer_name, total_amount]) => ({ customer_name, total_amount }))
    .sort((a, b) => b.total_amount - a.total_amount)
    .slice(0, 3);

  return {
    total_revenue: totalRevenue,
    total_land_cost: totalLandCost,
    total_cost: totalCost,
    sku_margins,
    top_customers,
  };
}
