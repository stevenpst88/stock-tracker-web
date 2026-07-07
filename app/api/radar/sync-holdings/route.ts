import { NextResponse } from 'next/server';
import { and, eq, sql } from 'drizzle-orm';
import { db, fifoLots, radarStocks, stocks } from '@/lib/db/client';
import { withAuth } from '@/lib/auth-helper';

/**
 * 把「目前有股數的股票」自動加到 radar,並標記 isHolding=true
 * 已存在的 radar 股票會被更新 isHolding
 */
export const POST = withAuth(async (_req, { userId }) => {
  const rows = await db
    .select({
      stockCode: fifoLots.stockCode,
      sum: sql<number>`SUM(${fifoLots.remainingShares})::float`,
    })
    .from(fifoLots)
    .where(and(eq(fifoLots.userId, userId), sql`${fifoLots.remainingShares} > 0`))
    .groupBy(fifoLots.stockCode);

  const activeCodes = new Set(rows.filter((r) => r.sum > 0).map((r) => r.stockCode));

  const existingRadar = await db
    .select({ id: radarStocks.id, stockCode: radarStocks.stockCode, isHolding: radarStocks.isHolding })
    .from(radarStocks)
    .where(eq(radarStocks.userId, userId));
  const existingMap = new Map(existingRadar.map((r) => [r.stockCode, r]));

  const stockMeta = await db
    .select()
    .from(stocks)
    .where(eq(stocks.userId, userId));
  const metaMap = new Map(stockMeta.map((s) => [s.code, s]));

  let added = 0;
  let updated = 0;
  for (const code of activeCodes) {
    const existing = existingMap.get(code);
    if (existing) {
      if (!existing.isHolding) {
        await db
          .update(radarStocks)
          .set({ isHolding: true })
          .where(and(eq(radarStocks.userId, userId), eq(radarStocks.id, existing.id)));
        updated++;
      }
    } else {
      const meta = metaMap.get(code);
      await db.insert(radarStocks).values({
        userId,
        stockCode: code,
        stockName: meta?.name ?? code,
        market: (meta?.market as 'TWSE' | 'OTC' | 'ETF') ?? 'TWSE',
        isHolding: true,
        note: '自持倉同步',
      });
      added++;
    }
  }

  // 反向:radar 標記 isHolding 但已無持股 → 取消 isHolding
  let cleared = 0;
  for (const r of existingRadar) {
    if (r.isHolding && !activeCodes.has(r.stockCode)) {
      await db
        .update(radarStocks)
        .set({ isHolding: false })
        .where(and(eq(radarStocks.userId, userId), eq(radarStocks.id, r.id)));
      cleared++;
    }
  }

  return NextResponse.json({ added, updated, cleared });
});
