import { NextResponse } from 'next/server';
import { withAuth, parseQuery } from '@/lib/auth-helper';
import { fetchHistory } from '@/lib/providers/yahooFinance';

export const GET = withAuth<{ params: Promise<{ code: string }> }>(
  async (req, { params }) => {
    const { code } = await params;
    const q = parseQuery(req);
    const from = q.from ? new Date(q.from) : new Date(Date.now() - 90 * 86400_000);
    const to = q.to ? new Date(q.to) : new Date();
    const hist = await fetchHistory(code, from, to);
    return NextResponse.json(hist);
  },
);
