import { NextResponse } from 'next/server';
import { and, asc, eq } from 'drizzle-orm';
import { db, radarStocks, radarInstHistory, radarBacktestCache } from '@/lib/db/client';
import { withAuth } from '@/lib/auth-helper';
import { fetchHistory } from '@/lib/providers/yahooFinance';
import type { BacktestResult } from '@/shared/types';

const TTL_MS = 24 * 3600_000; // 24 hours
const FOREIGN_STRONG_BUY_THRESHOLD = 500_000;

/**
 * 回測「外資連買 3 日」訊號的真實勝率
 * 用 radar_inst_history 找觸發日,對 Yahoo 抓後續 5d/10d 漲跌
 */
export const GET = withAuth(async (_req, { userId }) => {
  const stocks = await db
    .select({ code: radarStocks.stockCode })
    .from(radarStocks)
    .where(eq(radarStocks.userId, userId));
  const codes = stocks.map((s) => s.code);
  if (codes.length === 0) return NextResponse.json({});

  const cached = await db
    .select()
    .from(radarBacktestCache)
    .where(eq(radarBacktestCache.userId, userId));

  const now = Date.now();
  const cacheMap = new Map(
    cached
      .filter((c) => now - c.fetchedAt.getTime() < TTL_MS)
      .map((c) => [c.stockCode, c]),
  );

  const out: Record<string, BacktestResult> = {};
  const needFetch: string[] = [];

  for (const code of codes) {
    const c = cacheMap.get(code);
    if (c) {
      out[code] = {
        stockCode: code,
        greenSignalCount: c.greenSignalCount,
        greenWinRate5d: c.greenWinRate5d ?? undefined,
        greenAvgReturn5d: c.greenAvgReturn5d ?? undefined,
        greenWinRate10d: c.greenWinRate10d ?? undefined,
        greenAvgReturn10d: c.greenAvgReturn10d ?? undefined,
        fetchedAt: c.fetchedAt.toISOString(),
      };
    } else {
      needFetch.push(code);
    }
  }

  if (needFetch.length > 0) {
    const to = new Date();
    const from = new Date(to.getTime() - 120 * 86400_000);

    await Promise.all(
      needFetch.map(async (code) => {
        try {
          // 找過去的外資連買 3 日觸發點
          const hist = await db
            .select()
            .from(radarInstHistory)
            .where(and(eq(radarInstHistory.userId, userId), eq(radarInstHistory.stockCode, code)))
            .orderBy(asc(radarInstHistory.date));
          if (hist.length < 3) return;

          const triggers: string[] = [];
          for (let i = 2; i < hist.length; i++) {
            if (
              hist[i].foreignNet > FOREIGN_STRONG_BUY_THRESHOLD &&
              hist[i - 1].foreignNet > 0 &&
              hist[i - 2].foreignNet > 0
            ) {
              triggers.push(hist[i].date);
            }
          }

          if (triggers.length === 0) {
            const result: BacktestResult = {
              stockCode: code,
              greenSignalCount: 0,
              fetchedAt: new Date().toISOString(),
            };
            out[code] = result;
            await db
              .insert(radarBacktestCache)
              .values({
                userId,
                stockCode: code,
                greenSignalCount: 0,
                fetchedAt: new Date(),
              })
              .onConflictDoUpdate({
                target: [radarBacktestCache.userId, radarBacktestCache.stockCode],
                set: { greenSignalCount: 0, fetchedAt: new Date() },
              });
            return;
          }

          // 抓 120 天股價
          const prices = await fetchHistory(code, from, to);
          if (prices.length === 0) return;
          const priceMap = new Map(prices.map((p) => [p.date, p.close]));

          const returns5d: number[] = [];
          const returns10d: number[] = [];
          for (const t of triggers) {
            const start = priceMap.get(t);
            if (!start) continue;
            const idxTrigger = prices.findIndex((p) => p.date === t);
            if (idxTrigger < 0) continue;
            const after5 = prices[idxTrigger + 5]?.close;
            const after10 = prices[idxTrigger + 10]?.close;
            if (after5) returns5d.push(((after5 - start) / start) * 100);
            if (after10) returns10d.push(((after10 - start) / start) * 100);
          }

          const winRate = (arr: number[]): number =>
            arr.length ? (arr.filter((r) => r > 0).length / arr.length) * 100 : 0;
          const avg = (arr: number[]): number =>
            arr.length ? arr.reduce((s, v) => s + v, 0) / arr.length : 0;

          const result: BacktestResult = {
            stockCode: code,
            greenSignalCount: triggers.length,
            greenWinRate5d: returns5d.length ? winRate(returns5d) : undefined,
            greenAvgReturn5d: returns5d.length ? avg(returns5d) : undefined,
            greenWinRate10d: returns10d.length ? winRate(returns10d) : undefined,
            greenAvgReturn10d: returns10d.length ? avg(returns10d) : undefined,
            fetchedAt: new Date().toISOString(),
          };
          out[code] = result;

          await db
            .insert(radarBacktestCache)
            .values({
              userId,
              stockCode: code,
              greenSignalCount: triggers.length,
              greenWinRate5d: result.greenWinRate5d,
              greenAvgReturn5d: result.greenAvgReturn5d,
              greenWinRate10d: result.greenWinRate10d,
              greenAvgReturn10d: result.greenAvgReturn10d,
              fetchedAt: new Date(),
            })
            .onConflictDoUpdate({
              target: [radarBacktestCache.userId, radarBacktestCache.stockCode],
              set: {
                greenSignalCount: triggers.length,
                greenWinRate5d: result.greenWinRate5d,
                greenAvgReturn5d: result.greenAvgReturn5d,
                greenWinRate10d: result.greenWinRate10d,
                greenAvgReturn10d: result.greenAvgReturn10d,
                fetchedAt: new Date(),
              },
            });
        } catch (e) {
          console.warn(`[backtest] ${code} failed:`, (e as Error).message);
        }
      }),
    );
  }

  return NextResponse.json(out);
});
