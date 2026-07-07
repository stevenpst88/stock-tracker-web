import { NextResponse } from 'next/server';
import { and, desc, eq } from 'drizzle-orm';
import { db, radarInstHistory, radarStocks } from '@/lib/db/client';
import { withAuth } from '@/lib/auth-helper';
import type { InstTrend } from '@/shared/types';

/**
 * 從 radar_inst_history 算 5 日/10 日趨勢 + 連買連賣 streak
 */
export const GET = withAuth(async (_req, { userId }) => {
  // 拿 radar 內的所有股票 code
  const stocks = await db
    .select({ code: radarStocks.stockCode })
    .from(radarStocks)
    .where(eq(radarStocks.userId, userId));
  const codes = stocks.map((s) => s.code);
  if (codes.length === 0) return NextResponse.json({});

  const out: Record<string, InstTrend> = {};

  for (const code of codes) {
    const rows = await db
      .select()
      .from(radarInstHistory)
      .where(and(eq(radarInstHistory.userId, userId), eq(radarInstHistory.stockCode, code)))
      .orderBy(desc(radarInstHistory.date))
      .limit(10);

    if (rows.length === 0) continue;

    const foreignSeries = rows.map((r) => r.foreignNet);
    const trustSeries = rows.map((r) => r.trustNet);
    const totalSeries = rows.map((r) => r.totalNet);

    const streak = (arr: number[]): number => {
      if (arr.length === 0) return 0;
      const first = arr[0];
      if (first === 0) return 0;
      const sign = first > 0 ? 1 : -1;
      let n = 0;
      for (const v of arr) {
        if (v * sign > 0) n++;
        else break;
      }
      return sign * n;
    };

    out[code] = {
      stockCode: code,
      foreignStreak: streak(foreignSeries),
      trustStreak: streak(trustSeries),
      totalStreak: streak(totalSeries),
      foreign5d: foreignSeries.slice(0, 5).reduce((s, v) => s + v, 0),
      total5d: totalSeries.slice(0, 5).reduce((s, v) => s + v, 0),
      total10d: totalSeries.slice(0, 10).reduce((s, v) => s + v, 0),
      daysAvailable: rows.length,
    };
  }
  return NextResponse.json(out);
});
