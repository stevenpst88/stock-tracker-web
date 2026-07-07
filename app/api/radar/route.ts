import { NextResponse } from 'next/server';
import { and, asc, eq } from 'drizzle-orm';
import { db, radarStocks } from '@/lib/db/client';
import { withAuth } from '@/lib/auth-helper';
import type { AddRadarInput, RadarStock } from '@/shared/types';

export const GET = withAuth(async (_req, { userId }) => {
  const rows = await db
    .select()
    .from(radarStocks)
    .where(eq(radarStocks.userId, userId))
    .orderBy(asc(radarStocks.sortOrder), asc(radarStocks.id));

  const out: RadarStock[] = rows.map((r) => ({
    id: r.id,
    stockCode: r.stockCode,
    stockName: r.stockName,
    market: (r.market as 'TWSE' | 'OTC' | 'ETF') ?? 'TWSE',
    buyAt: r.buyAt,
    stopLoss: r.stopLoss,
    targetShares: r.targetShares,
    note: r.note,
    remark: r.remark,
    isHolding: r.isHolding,
    sortOrder: r.sortOrder,
  }));
  return NextResponse.json(out);
});

export const POST = withAuth(async (req, { userId }) => {
  const body = (await req.json()) as AddRadarInput;
  const [inserted] = await db
    .insert(radarStocks)
    .values({
      userId,
      stockCode: body.stockCode,
      stockName: body.stockName,
      market: body.market ?? 'TWSE',
      buyAt: body.buyAt ?? null,
      stopLoss: body.stopLoss ?? null,
      targetShares: body.targetShares ?? null,
      note: body.note ?? null,
      remark: body.remark ?? null,
      isHolding: body.isHolding ?? false,
    })
    .returning({ id: radarStocks.id });
  return NextResponse.json({ id: inserted.id });
});
