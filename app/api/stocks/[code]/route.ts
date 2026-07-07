import { NextResponse } from 'next/server';
import { and, eq } from 'drizzle-orm';
import { db, stocks } from '@/lib/db/client';
import { withAuth } from '@/lib/auth-helper';

export const DELETE = withAuth<{ params: Promise<{ code: string }> }>(
  async (_req, { userId, params }) => {
    const { code } = await params;
    await db.delete(stocks).where(and(eq(stocks.userId, userId), eq(stocks.code, code)));
    return NextResponse.json({ ok: true });
  },
);
