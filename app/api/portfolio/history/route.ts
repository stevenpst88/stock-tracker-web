import { NextResponse } from 'next/server';
import { and, asc, eq, gte, lte } from 'drizzle-orm';
import { db, transactions, fifoLots } from '@/lib/db/client';
import { withAuth, parseQuery } from '@/lib/auth-helper';
import { fetchHistory } from '@/lib/providers/yahooFinance';
import type { PortfolioHistoryPoint } from '@/shared/types';

/**
 * 回傳過去 N 天的每日總值 + 累計成本曲線
 * 演算法:對每個交易日:
 *   1. 從 transactions 累積計算當日持有的股數
 *   2. × 當日收盤價(從 Yahoo history 抓)
 *   3. 對每支股票求和
 */
export const GET = withAuth(async (req, { userId }) => {
  const q = parseQuery(req);
  const days = Math.min(365, Math.max(30, Number(q.days ?? '90')));
  const endDate = new Date();
  const startDate = new Date(endDate.getTime() - days * 86400_000);
  const startYmd = startDate.toISOString().slice(0, 10);
  const endYmd = endDate.toISOString().slice(0, 10);

  // 拿所有 BUY/SELL(不含 DIVIDEND)
  const txns = await db
    .select()
    .from(transactions)
    .where(
      and(
        eq(transactions.userId, userId),
        lte(transactions.date, endYmd),
      ),
    )
    .orderBy(asc(transactions.date));

  if (txns.length === 0) return NextResponse.json([]);

  // 拿所有股票的歷史價
  const stockCodes = Array.from(new Set(txns.map((t) => t.stockCode)));
  const priceMap: Record<string, Map<string, number>> = {};
  await Promise.all(
    stockCodes.map(async (code) => {
      try {
        const hist = await fetchHistory(code, startDate, endDate);
        const m = new Map(hist.map((p) => [p.date, p.close]));
        priceMap[code] = m;
      } catch {
        priceMap[code] = new Map();
      }
    }),
  );

  // 生成每個交易日的曲線
  const dates: string[] = [];
  for (
    let d = new Date(startDate);
    d.getTime() <= endDate.getTime();
    d.setDate(d.getDate() + 1)
  ) {
    dates.push(d.toISOString().slice(0, 10));
  }

  const points: PortfolioHistoryPoint[] = [];
  for (const ymd of dates) {
    let totalValue = 0;
    let totalCost = 0;
    for (const code of stockCodes) {
      // 到當日為止的淨持股 + 淨成本
      let shares = 0;
      let cost = 0;
      for (const t of txns) {
        if (t.stockCode !== code || t.date > ymd) continue;
        if (t.type === 'BUY') {
          shares += t.shares;
          cost += t.shares * t.pricePerShare + t.brokerageFee;
        } else if (t.type === 'SELL') {
          const avgCost = shares > 0 ? cost / shares : 0;
          const soldCost = Math.min(shares, t.shares) * avgCost;
          shares -= t.shares;
          cost -= soldCost;
        }
      }
      if (shares <= 0) continue;
      const price = priceMap[code].get(ymd);
      if (price != null) totalValue += price * shares;
      totalCost += cost;
    }
    points.push({ date: ymd, value: totalValue, cost: totalCost });
  }

  return NextResponse.json(points);
});
