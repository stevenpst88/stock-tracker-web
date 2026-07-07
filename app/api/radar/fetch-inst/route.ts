import { NextResponse } from 'next/server';
import { db, radarInstCache, radarInstHistory, radarMarginCache } from '@/lib/db/client';
import { withAuth } from '@/lib/auth-helper';
import { fetchInstFlow, fetchMarginBalance } from '@/lib/providers/instFlow';

export const POST = withAuth(async (_req, { userId }) => {
  const today = new Date().toISOString().slice(0, 10);
  const { date, data } = await fetchInstFlow(today);

  // Upsert inst cache + history for each stock
  const codes = Object.keys(data);
  for (const code of codes) {
    const d = data[code];
    await db
      .insert(radarInstCache)
      .values({
        userId,
        stockCode: code,
        date: d.date,
        foreignNet: d.foreignNet,
        trustNet: d.trustNet,
        dealerNet: d.dealerNet,
        totalNet: d.totalNet,
        fetchedAt: new Date(),
      })
      .onConflictDoUpdate({
        target: [radarInstCache.userId, radarInstCache.stockCode],
        set: {
          date: d.date,
          foreignNet: d.foreignNet,
          trustNet: d.trustNet,
          dealerNet: d.dealerNet,
          totalNet: d.totalNet,
          fetchedAt: new Date(),
        },
      });
    await db
      .insert(radarInstHistory)
      .values({
        userId,
        stockCode: code,
        date: d.date,
        foreignNet: d.foreignNet,
        trustNet: d.trustNet,
        dealerNet: d.dealerNet,
        totalNet: d.totalNet,
      })
      .onConflictDoUpdate({
        target: [radarInstHistory.userId, radarInstHistory.stockCode, radarInstHistory.date],
        set: {
          foreignNet: d.foreignNet,
          trustNet: d.trustNet,
          dealerNet: d.dealerNet,
          totalNet: d.totalNet,
        },
      });
  }

  // Margin
  try {
    const marginMap = await fetchMarginBalance(date);
    for (const [code, m] of Object.entries(marginMap)) {
      await db
        .insert(radarMarginCache)
        .values({
          userId,
          stockCode: code,
          date: m.date,
          marginBalance: m.marginBalance,
          marginChange: m.marginChange,
          shortBalance: m.shortBalance,
          shortChange: m.shortChange,
          fetchedAt: new Date(),
        })
        .onConflictDoUpdate({
          target: [radarMarginCache.userId, radarMarginCache.stockCode],
          set: {
            date: m.date,
            marginBalance: m.marginBalance,
            marginChange: m.marginChange,
            shortBalance: m.shortBalance,
            shortChange: m.shortChange,
            fetchedAt: new Date(),
          },
        });
    }
  } catch (e) {
    console.warn('[fetch-inst] margin failed:', e);
  }

  return NextResponse.json({ date, count: codes.length });
});
