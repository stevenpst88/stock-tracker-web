import { NextResponse } from 'next/server';
import { withAuth } from '@/lib/auth-helper';
import { calcFees } from '@/lib/services/fifo';
import type { CalcFeesInput } from '@/shared/types';

export const POST = withAuth(async (req) => {
  const body = (await req.json()) as CalcFeesInput;
  // ETF 稅率較低（0.001 vs 0.003），但我們先都用 0.003 — 之後可加 ETF 判斷
  return NextResponse.json(calcFees(body.type, body.shares, body.pricePerShare));
});
