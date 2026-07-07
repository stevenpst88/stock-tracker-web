import { NextResponse } from 'next/server';
import { eq } from 'drizzle-orm';
import { db, radarStocks, radarFundamentalCache } from '@/lib/db/client';
import { withAuth } from '@/lib/auth-helper';
import { fetchFundamental } from '@/lib/providers/yahooFinance';
import type { FundamentalData } from '@/shared/types';

const TTL_MS = 7 * 86400_000; // 7 days

export const GET = withAuth(async (_req, { userId }) => {
  const stocks = await db
    .select({ code: radarStocks.stockCode })
    .from(radarStocks)
    .where(eq(radarStocks.userId, userId));
  const codes = stocks.map((s) => s.code);
  if (codes.length === 0) return NextResponse.json({});

  const cached = await db
    .select()
    .from(radarFundamentalCache)
    .where(eq(radarFundamentalCache.userId, userId));

  const now = Date.now();
  const cacheMap = new Map(
    cached
      .filter((c) => now - c.fetchedAt.getTime() < TTL_MS)
      .map((c) => [c.stockCode, c]),
  );

  const out: Record<string, FundamentalData> = {};
  const needFetch: string[] = [];

  for (const code of codes) {
    const c = cacheMap.get(code);
    if (c) {
      out[code] = {
        stockCode: code,
        pe: c.pe ?? undefined,
        eps: c.eps ?? undefined,
        dividendYield: c.dividendYield ?? undefined,
        marketCap: c.marketCap ?? undefined,
        fetchedAt: c.fetchedAt.toISOString(),
      };
    } else {
      needFetch.push(code);
    }
  }

  // 過期或沒 cache — 重抓
  if (needFetch.length > 0) {
    await Promise.all(
      needFetch.map(async (code) => {
        try {
          const f = await fetchFundamental(code);
          if (!f) return;
          out[code] = f;
          await db
            .insert(radarFundamentalCache)
            .values({
              userId,
              stockCode: code,
              pe: f.pe,
              eps: f.eps,
              dividendYield: f.dividendYield,
              marketCap: f.marketCap,
              fetchedAt: new Date(),
            })
            .onConflictDoUpdate({
              target: [radarFundamentalCache.userId, radarFundamentalCache.stockCode],
              set: {
                pe: f.pe,
                eps: f.eps,
                dividendYield: f.dividendYield,
                marketCap: f.marketCap,
                fetchedAt: new Date(),
              },
            });
        } catch (e) {
          console.warn(`[fund] ${code} failed:`, (e as Error).message);
        }
      }),
    );
  }

  return NextResponse.json(out);
});
