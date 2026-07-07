import { NextResponse } from 'next/server';
import { eq } from 'drizzle-orm';
import { db, radarMarginCache } from '@/lib/db/client';
import { withAuth } from '@/lib/auth-helper';
import type { MarginData } from '@/shared/types';

export const GET = withAuth(async (_req, { userId }) => {
  const rows = await db.select().from(radarMarginCache).where(eq(radarMarginCache.userId, userId));
  const out: Record<string, MarginData> = {};
  for (const r of rows) {
    out[r.stockCode] = {
      date: r.date,
      marginBalance: r.marginBalance,
      marginChange: r.marginChange,
      shortBalance: r.shortBalance,
      shortChange: r.shortChange,
    };
  }
  return NextResponse.json(out);
});
