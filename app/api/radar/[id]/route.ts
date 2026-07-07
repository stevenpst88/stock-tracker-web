import { NextResponse } from 'next/server';
import { and, eq } from 'drizzle-orm';
import { db, radarStocks } from '@/lib/db/client';
import { withAuth } from '@/lib/auth-helper';
import type { AddRadarInput } from '@/shared/types';

export const PATCH = withAuth<{ params: Promise<{ id: string }> }>(
  async (req, { userId, params }) => {
    const { id } = await params;
    const patch = (await req.json()) as Partial<AddRadarInput> & { sortOrder?: number };
    await db
      .update(radarStocks)
      .set({
        ...(patch.stockName !== undefined && { stockName: patch.stockName }),
        ...(patch.market !== undefined && { market: patch.market }),
        ...(patch.buyAt !== undefined && { buyAt: patch.buyAt }),
        ...(patch.stopLoss !== undefined && { stopLoss: patch.stopLoss }),
        ...(patch.targetShares !== undefined && { targetShares: patch.targetShares }),
        ...(patch.note !== undefined && { note: patch.note }),
        ...(patch.remark !== undefined && { remark: patch.remark }),
        ...(patch.isHolding !== undefined && { isHolding: patch.isHolding }),
        ...(patch.sortOrder !== undefined && { sortOrder: patch.sortOrder }),
      })
      .where(and(eq(radarStocks.userId, userId), eq(radarStocks.id, Number(id))));
    return NextResponse.json({ ok: true });
  },
);

export const DELETE = withAuth<{ params: Promise<{ id: string }> }>(
  async (_req, { userId, params }) => {
    const { id } = await params;
    await db
      .delete(radarStocks)
      .where(and(eq(radarStocks.userId, userId), eq(radarStocks.id, Number(id))));
    return NextResponse.json({ ok: true });
  },
);
