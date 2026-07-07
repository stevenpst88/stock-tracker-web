import { NextResponse } from 'next/server';
import { and, eq } from 'drizzle-orm';
import { db, transactions, fifoLots } from '@/lib/db/client';
import { withAuth } from '@/lib/auth-helper';
import { undoSell } from '@/lib/services/fifo';

export const DELETE = withAuth<{ params: Promise<{ id: string }> }>(
  async (_req, { userId, params }) => {
    const { id } = await params;
    const txnId = Number(id);
    const [txn] = await db
      .select()
      .from(transactions)
      .where(and(eq(transactions.userId, userId), eq(transactions.id, txnId)));
    if (!txn) return NextResponse.json({ error: 'not found' }, { status: 404 });

    if (txn.type === 'SELL') await undoSell(userId, txnId);
    else if (txn.type === 'BUY') {
      // 刪對應 lot（CASCADE 也會清 realized_pnl）
      await db
        .delete(fifoLots)
        .where(and(eq(fifoLots.userId, userId), eq(fifoLots.transactionId, txnId)));
    }
    await db.delete(transactions).where(and(eq(transactions.userId, userId), eq(transactions.id, txnId)));
    return NextResponse.json({ ok: true });
  },
);
