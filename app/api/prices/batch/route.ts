import { NextResponse } from 'next/server';
import { and, eq, inArray, sql } from 'drizzle-orm';
import { db, priceCache } from '@/lib/db/client';
import { withAuth } from '@/lib/auth-helper';
import { fetchQuotes } from '@/lib/providers/yahooFinance';

const CACHE_TTL_MS = 15 * 60_000; // 15 min

export const POST = withAuth(async (req, { userId }) => {
  const { codes } = (await req.json()) as { codes: string[] };
  if (!codes || codes.length === 0) return NextResponse.json({});

  // 讀 cache
  const cached = await db
    .select()
    .from(priceCache)
    .where(and(eq(priceCache.userId, userId), inArray(priceCache.stockCode, codes)));

  const now = Date.now();
  const freshCache = new Map(
    cached
      .filter((c) => now - c.fetchedAt.getTime() < CACHE_TTL_MS && c.price > 0)
      .map((c) => [c.stockCode, c]),
  );

  const staleCodes = codes.filter((c) => !freshCache.has(c));
  if (staleCodes.length > 0) {
    const fresh = await fetchQuotes(staleCodes);
    for (const q of fresh) {
      if (q.price <= 0) continue;
      await db
        .insert(priceCache)
        .values({
          userId,
          stockCode: q.stockCode,
          provider: 'yahoo',
          price: q.price,
          changeAbs: q.changeAbs,
          changePct: q.changePct,
          volume: q.volume,
          fetchedAt: new Date(),
        })
        .onConflictDoUpdate({
          target: [priceCache.userId, priceCache.stockCode],
          set: {
            price: q.price,
            changeAbs: q.changeAbs,
            changePct: q.changePct,
            volume: q.volume,
            fetchedAt: new Date(),
          },
        });
      freshCache.set(q.stockCode, {
        userId,
        stockCode: q.stockCode,
        provider: 'yahoo',
        price: q.price,
        changeAbs: q.changeAbs,
        changePct: q.changePct,
        volume: q.volume,
        fetchedAt: new Date(),
      });
    }
  }

  const out: Record<string, { price: number; changeAbs: number; changePct: number; volume: number; fetchedAt: string }> = {};
  for (const [code, c] of freshCache) {
    out[code] = {
      price: c.price,
      changeAbs: c.changeAbs ?? 0,
      changePct: c.changePct ?? 0,
      volume: c.volume ?? 0,
      fetchedAt: c.fetchedAt.toISOString(),
    };
  }
  return NextResponse.json(out);
});
