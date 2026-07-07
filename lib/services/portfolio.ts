/**
 * 組合投資彙總（Postgres 版）
 * 從 electron/services/portfolioService.ts 移植
 */
import { and, eq, sql } from 'drizzle-orm';
import {
  db,
  fifoLots,
  transactions,
  stocks,
  priceCache,
} from '@/lib/db/client';
import type { PortfolioSummary, HoldingSummary, FifoLot } from '@/shared/types';

interface StockAgg {
  stockCode: string;
  totalShares: number;
  totalCost: number;
  lots: FifoLot[];
}

export async function buildPortfolioSummary(userId: string): Promise<PortfolioSummary> {
  // 1. 抓所有活著的 lots
  const lots = await db
    .select()
    .from(fifoLots)
    .where(and(eq(fifoLots.userId, userId), sql`${fifoLots.remainingShares} > 0`));

  // 2. Group by stockCode
  const bystock = new Map<string, StockAgg>();
  for (const l of lots) {
    const agg = bystock.get(l.stockCode) ?? {
      stockCode: l.stockCode,
      totalShares: 0,
      totalCost: 0,
      lots: [],
    };
    agg.totalShares += l.remainingShares;
    agg.totalCost += l.remainingShares * l.costPerShare;
    agg.lots.push({
      id: l.id,
      transactionId: l.transactionId,
      stockCode: l.stockCode,
      purchaseDate: l.purchaseDate,
      originalShares: l.originalShares,
      remainingShares: l.remainingShares,
      costPerShare: l.costPerShare,
    });
    bystock.set(l.stockCode, agg);
  }

  // 3. Stock metadata
  const stockRows = await db
    .select()
    .from(stocks)
    .where(eq(stocks.userId, userId));
  const stockMeta = new Map(stockRows.map((s) => [s.code, s]));

  // 4. Current prices from cache
  const priceRows = await db
    .select()
    .from(priceCache)
    .where(eq(priceCache.userId, userId));
  const priceMap = new Map(priceRows.map((p) => [p.stockCode, p]));

  // 5. Realized P&L totals
  const rpnlRow = await db.execute<{ total: number | null }>(
    sql`SELECT COALESCE(SUM(net_profit), 0)::float AS total FROM realized_pnl WHERE user_id = ${userId}`,
  );
  const totalRealizedPnl = Number(rpnlRow.rows[0]?.total ?? 0);

  // 6. Dividend income totals
  const divRow = await db.execute<{ total: number | null }>(
    sql`SELECT COALESCE(SUM(net_amount), 0)::float AS total FROM transactions WHERE user_id = ${userId} AND type = 'DIVIDEND'`,
  );
  const totalDividendIncome = Number(divRow.rows[0]?.total ?? 0);

  // 7. Build holding summaries
  const holdings: HoldingSummary[] = [];
  let totalCost = 0;
  let totalValue = 0;
  let dayChange = 0;

  for (const agg of bystock.values()) {
    const meta = stockMeta.get(agg.stockCode);
    const price = priceMap.get(agg.stockCode);
    const currentPrice = price?.price ?? 0;
    const currentValue = currentPrice * agg.totalShares;
    const avgCostPerShare = agg.totalCost / agg.totalShares;
    const dayCh = (price?.changeAbs ?? 0) * agg.totalShares;
    const unrealizedPnl = currentValue - agg.totalCost;
    const unrealizedPnlPct = agg.totalCost > 0 ? (unrealizedPnl / agg.totalCost) * 100 : 0;

    holdings.push({
      stockCode: agg.stockCode,
      stockName: meta?.name ?? agg.stockCode,
      market: (meta?.market as 'TWSE' | 'OTC' | 'ETF') ?? 'TWSE',
      totalShares: agg.totalShares,
      avgCostPerShare,
      totalCost: agg.totalCost,
      currentPrice,
      currentValue,
      unrealizedPnl,
      unrealizedPnlPct,
      dayChange: dayCh,
      dayChangePct: price?.changePct ?? 0,
      lots: agg.lots,
    });

    totalCost += agg.totalCost;
    totalValue += currentValue;
    dayChange += dayCh;
  }

  const totalUnrealizedPnl = totalValue - totalCost;
  const totalUnrealizedPnlPct = totalCost > 0 ? (totalUnrealizedPnl / totalCost) * 100 : 0;
  const latestFetchAt = priceRows.length
    ? priceRows.map((p) => p.fetchedAt.getTime()).reduce((a, b) => Math.max(a, b), 0)
    : Date.now();

  return {
    totalCost,
    totalValue,
    totalUnrealizedPnl,
    totalUnrealizedPnlPct,
    totalRealizedPnl,
    totalDividendIncome,
    dayChange,
    holdings: holdings.sort((a, b) => b.currentValue - a.currentValue),
    pricesLastUpdated: new Date(latestFetchAt).toISOString(),
  };
}
