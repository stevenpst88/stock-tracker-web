/**
 * API route 統一 auth 包裝
 *
 * 用法：
 *   export const GET = withAuth(async (req, { userId }) => {
 *     const stocks = await db.select().from(stocksTable).where(eq(stocksTable.userId, userId));
 *     return Response.json(stocks);
 *   });
 *
 * 強制每支 route 都拿 userId + 過濾，避免忘記 WHERE user_id = ... 造成資料外洩
 */
import { auth } from './auth';
import { NextResponse } from 'next/server';

type Handler<TCtx = { params: Promise<Record<string, string>> }> = (
  req: Request,
  ctx: TCtx & { userId: string },
) => Promise<Response> | Response;

export function withAuth<TCtx = { params: Promise<Record<string, string>> }>(
  handler: Handler<TCtx>,
) {
  return async (req: Request, ctx: TCtx) => {
    const session = await auth();
    if (!session?.user?.id) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }
    try {
      return await handler(req, { ...ctx, userId: session.user.id });
    } catch (err) {
      console.error('[API]', req.url, err);
      const msg = err instanceof Error ? err.message : String(err);
      return NextResponse.json({ error: msg }, { status: 500 });
    }
  };
}

export function parseQuery(req: Request): Record<string, string> {
  const url = new URL(req.url);
  const out: Record<string, string> = {};
  url.searchParams.forEach((v, k) => (out[k] = v));
  return out;
}
