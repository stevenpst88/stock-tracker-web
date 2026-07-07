import { NextResponse } from 'next/server';
import { withAuth } from '@/lib/auth-helper';
import { fetchMarketContext } from '@/lib/providers/yahooFinance';

export const GET = withAuth(async () => {
  const ctx = await fetchMarketContext();
  return NextResponse.json(ctx);
});
