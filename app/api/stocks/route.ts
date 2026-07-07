import { NextResponse } from 'next/server';
import { and, eq } from 'drizzle-orm';
import { db, stocks } from '@/lib/db/client';
import { withAuth } from '@/lib/auth-helper';
import type { AddStockInput } from '@/shared/types';

export const GET = withAuth(async (_req, { userId }) => {
  const rows = await db.select().from(stocks).where(eq(stocks.userId, userId));
  return NextResponse.json(rows);
});

export const POST = withAuth(async (req, { userId }) => {
  const body = (await req.json()) as AddStockInput;
  await db
    .insert(stocks)
    .values({
      userId,
      code: body.code,
      name: body.name,
      market: body.market,
      currency: 'TWD',
    })
    .onConflictDoNothing();
  return NextResponse.json({ ok: true });
});
