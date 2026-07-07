import { NextResponse } from 'next/server';
import { withAuth } from '@/lib/auth-helper';
import { getYearlyPnl } from '@/lib/services/fifo';

export const GET = withAuth(async (_req, { userId }) => {
  const rows = await getYearlyPnl(userId);
  return NextResponse.json(rows);
});
