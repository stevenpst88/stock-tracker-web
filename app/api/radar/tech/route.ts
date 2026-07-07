import { NextResponse } from 'next/server';
import { eq } from 'drizzle-orm';
import { db, radarStocks } from '@/lib/db/client';
import { withAuth } from '@/lib/auth-helper';
import { fetchHistory } from '@/lib/providers/yahooFinance';
import { computeTechData } from '@/lib/services/technical';
import type { TechData } from '@/shared/types';

/** 對 radar 每支股票計算技術指標 */
export const GET = withAuth(async (_req, { userId }) => {
  const stocks = await db
    .select({ code: radarStocks.stockCode })
    .from(radarStocks)
    .where(eq(radarStocks.userId, userId));

  const to = new Date();
  const from = new Date(to.getTime() - 90 * 86400_000);
  const out: Record<string, TechData> = {};

  await Promise.all(
    stocks.map(async ({ code }) => {
      try {
        const history = await fetchHistory(code, from, to);
        const t = computeTechData(code, history);
        if (t) out[code] = t;
      } catch (e) {
        console.warn(`[tech] ${code} failed:`, (e as Error).message);
      }
    }),
  );

  return NextResponse.json(out);
});
