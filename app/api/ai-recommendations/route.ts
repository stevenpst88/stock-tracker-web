import { NextResponse } from 'next/server';
import { and, desc, eq, gte } from 'drizzle-orm';
import { db, aiRecommendations } from '@/lib/db/client';
import { withAuth, parseQuery } from '@/lib/auth-helper';

export const GET = withAuth(async (req, { userId }) => {
  const q = parseQuery(req);
  const days = Number(q.days ?? '30');
  const since = new Date(Date.now() - days * 86400_000);
  const rows = await db
    .select()
    .from(aiRecommendations)
    .where(and(eq(aiRecommendations.userId, userId), gte(aiRecommendations.recommendedAt, since)))
    .orderBy(desc(aiRecommendations.recommendedAt))
    .limit(200);
  return NextResponse.json(
    rows.map((r) => ({
      id: r.id,
      stockCode: r.stockCode,
      mode: r.mode,
      provider: r.provider,
      buyAt: r.buyAt,
      stopLoss: r.stopLoss,
      targetShares: r.targetShares,
      confidence: r.confidence,
      note: r.note,
      priceAtRec: r.priceAtRec,
      recommendedAt: r.recommendedAt.toISOString(),
    })),
  );
});

interface AiRecPayload {
  stockCode: string;
  mode: string;
  provider: string;
  buyAt?: number;
  stopLoss?: number;
  targetShares?: number;
  confidence?: number;
  note?: string;
  priceAtRec?: number;
}

export const POST = withAuth(async (req, { userId }) => {
  const items = (await req.json()) as AiRecPayload[];
  if (!Array.isArray(items) || items.length === 0) return NextResponse.json({ inserted: 0 });
  await db.insert(aiRecommendations).values(
    items.map((i) => ({
      userId,
      stockCode: i.stockCode,
      mode: i.mode,
      provider: i.provider,
      buyAt: i.buyAt,
      stopLoss: i.stopLoss,
      targetShares: i.targetShares,
      confidence: i.confidence,
      note: i.note,
      priceAtRec: i.priceAtRec,
    })),
  );
  return NextResponse.json({ inserted: items.length });
});
