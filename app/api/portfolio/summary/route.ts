import { NextResponse } from 'next/server';
import { withAuth } from '@/lib/auth-helper';
import { buildPortfolioSummary } from '@/lib/services/portfolio';

export const GET = withAuth(async (_req, { userId }) => {
  const summary = await buildPortfolioSummary(userId);
  return NextResponse.json(summary);
});
