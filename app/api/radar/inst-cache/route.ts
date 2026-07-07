import { NextResponse } from 'next/server';
import { eq } from 'drizzle-orm';
import { db, radarInstCache } from '@/lib/db/client';
import { withAuth } from '@/lib/auth-helper';
import type { InstData } from '@/shared/types';

export const GET = withAuth(async (_req, { userId }) => {
  const rows = await db.select().from(radarInstCache).where(eq(radarInstCache.userId, userId));
  const out: Record<string, InstData> = {};
  for (const r of rows) {
    out[r.stockCode] = {
      date: r.date,
      foreignNet: r.foreignNet,
      trustNet: r.trustNet,
      dealerNet: r.dealerNet,
      totalNet: r.totalNet,
    };
  }
  return NextResponse.json(out);
});
