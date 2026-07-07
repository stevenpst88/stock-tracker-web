import { NextResponse } from 'next/server';
import { and, desc, eq } from 'drizzle-orm';
import { db, transactions, stocks } from '@/lib/db/client';
import { withAuth, parseQuery } from '@/lib/auth-helper';
import { calcFees, processBuy, processSell } from '@/lib/services/fifo';
import type { AddTransactionInput, TxnFilter } from '@/shared/types';

export const GET = withAuth(async (req, { userId }) => {
  const q = parseQuery(req) as TxnFilter;
  const conds = [eq(transactions.userId, userId)];
  if (q.stockCode) conds.push(eq(transactions.stockCode, q.stockCode));
  if (q.type) conds.push(eq(transactions.type, q.type));
  const rows = await db
    .select()
    .from(transactions)
    .where(and(...conds))
    .orderBy(desc(transactions.date), desc(transactions.id));
  return NextResponse.json(
    rows.map((r) => ({
      id: r.id,
      stockCode: r.stockCode,
      type: r.type,
      date: r.date,
      shares: r.shares,
      pricePerShare: r.pricePerShare,
      brokerageFee: r.brokerageFee,
      transactionTax: r.transactionTax,
      netAmount: r.netAmount,
      notes: r.notes ?? undefined,
      createdAt: r.createdAt.toISOString(),
    })),
  );
});

export const POST = withAuth(async (req, { userId }) => {
  const body = (await req.json()) as AddTransactionInput;

  // 用戶端可能沒送手續費/稅（用預設費率算）
  const fees = calcFees(body.type, body.shares, body.pricePerShare);
  const brokerageFee = body.brokerageFee ?? fees.brokerageFee;
  const transactionTax = body.transactionTax ?? fees.transactionTax;
  const netAmount =
    body.type === 'BUY'
      ? -(body.shares * body.pricePerShare + brokerageFee)
      : body.shares * body.pricePerShare - brokerageFee - transactionTax;

  // 確保 stock 存在（若無則自動加）
  await db
    .insert(stocks)
    .values({ userId, code: body.stockCode, name: body.stockCode, market: 'TWSE' })
    .onConflictDoNothing();

  const [inserted] = await db
    .insert(transactions)
    .values({
      userId,
      stockCode: body.stockCode,
      type: body.type,
      date: body.date,
      shares: body.shares,
      pricePerShare: body.pricePerShare,
      brokerageFee,
      transactionTax,
      netAmount,
      notes: body.notes,
    })
    .returning({ id: transactions.id });

  // FIFO
  if (body.type === 'BUY') {
    await processBuy({
      userId,
      txnId: inserted.id,
      stockCode: body.stockCode,
      date: body.date,
      shares: body.shares,
      pricePerShare: body.pricePerShare,
      brokerageFee,
    });
  } else if (body.type === 'SELL') {
    await processSell({
      userId,
      txnId: inserted.id,
      stockCode: body.stockCode,
      date: body.date,
      shares: body.shares,
      sellPrice: body.pricePerShare,
      brokerageFee,
      transactionTax,
    });
  }

  return NextResponse.json({ id: inserted.id });
});
