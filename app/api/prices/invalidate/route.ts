import { NextResponse } from 'next/server';
import { eq } from 'drizzle-orm';
import { db, priceCache } from '@/lib/db/client';
import { withAuth } from '@/lib/auth-helper';

export const POST = withAuth(async (_req, { userId }) => {
  await db.delete(priceCache).where(eq(priceCache.userId, userId));
  return NextResponse.json({ ok: true });
});
