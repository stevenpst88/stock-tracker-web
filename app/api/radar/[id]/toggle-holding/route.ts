import { NextResponse } from 'next/server';
import { and, eq } from 'drizzle-orm';
import { db, radarStocks } from '@/lib/db/client';
import { withAuth } from '@/lib/auth-helper';

export const POST = withAuth<{ params: Promise<{ id: string }> }>(
  async (_req, { userId, params }) => {
    const { id } = await params;
    const [row] = await db
      .select({ isHolding: radarStocks.isHolding })
      .from(radarStocks)
      .where(and(eq(radarStocks.userId, userId), eq(radarStocks.id, Number(id))));
    if (!row) return NextResponse.json({ error: 'not found' }, { status: 404 });
    await db
      .update(radarStocks)
      .set({ isHolding: !row.isHolding })
      .where(and(eq(radarStocks.userId, userId), eq(radarStocks.id, Number(id))));
    return NextResponse.json({ isHolding: !row.isHolding });
  },
);
