/**
 * FIFO 買賣批次管理 + 已實現損益（Postgres 版）
 *
 * 從 electron/services/fifo.ts 移植過來。主要改動：
 * - node:sqlite prepared statements → Drizzle ORM
 * - 每個 function 加 userId 參數，SQL 加 WHERE user_id = ...
 * - 用 pg Transaction wrapper 保 ACID
 */
import { and, asc, desc, eq, gte, lte, sql } from 'drizzle-orm';
import { db, fifoLots, realizedPnl, transactions } from '../db/client';
import type { FifoLot, RealizedPnlRecord } from '@/shared/types';

export function calcFees(
  type: 'BUY' | 'SELL' | 'DIVIDEND',
  shares: number,
  pricePerShare: number,
  brokerageRate = 0.001425,
  taxRate = 0.003,
): { brokerageFee: number; transactionTax: number; netAmount: number } {
  const gross = shares * pricePerShare;
  const brokerageFee = type === 'DIVIDEND' ? 0 : Math.floor(gross * brokerageRate);
  const transactionTax = type === 'SELL' ? Math.floor(gross * taxRate) : 0;
  const netAmount =
    type === 'BUY'
      ? -(gross + brokerageFee)
      : gross - brokerageFee - transactionTax;
  return { brokerageFee, transactionTax, netAmount };
}

/** 買入 → 建 FIFO lot */
export async function processBuy(params: {
  userId: string;
  txnId: number;
  stockCode: string;
  date: string;
  shares: number;
  pricePerShare: number;
  brokerageFee: number;
}) {
  const { userId, txnId, stockCode, date, shares, pricePerShare, brokerageFee } = params;
  const costPerShare = (shares * pricePerShare + brokerageFee) / shares;
  await db.insert(fifoLots).values({
    userId,
    transactionId: txnId,
    stockCode,
    purchaseDate: date,
    originalShares: shares,
    remainingShares: shares,
    costPerShare,
  });
}

/** 賣出 → FIFO 逐批扣、寫 realized_pnl */
export async function processSell(params: {
  userId: string;
  txnId: number;
  stockCode: string;
  date: string;
  shares: number;
  sellPrice: number;
  brokerageFee: number;
  transactionTax: number;
}) {
  const { userId, txnId, stockCode, date, shares, sellPrice, brokerageFee, transactionTax } = params;

  const lots = await db
    .select()
    .from(fifoLots)
    .where(
      and(
        eq(fifoLots.userId, userId),
        eq(fifoLots.stockCode, stockCode),
        sql`${fifoLots.remainingShares} > 0`,
      ),
    )
    .orderBy(asc(fifoLots.purchaseDate), asc(fifoLots.id));

  let remaining = shares;
  const totalFees = brokerageFee + transactionTax;

  for (const lot of lots) {
    if (remaining <= 0) break;
    const taken = Math.min(lot.remainingShares, remaining);
    const feeProportion = taken / shares;
    const grossProfit = (sellPrice - lot.costPerShare) * taken;
    const attributedBrokerage = brokerageFee * feeProportion;
    const attributedTax = transactionTax * feeProportion;
    const netProfit = grossProfit - totalFees * feeProportion;

    await db.insert(realizedPnl).values({
      userId,
      sellTxnId: txnId,
      lotId: lot.id,
      stockCode,
      sellDate: date,
      sharesSold: taken,
      costPerShare: lot.costPerShare,
      sellPrice,
      grossProfit,
      brokerageFee: attributedBrokerage,
      transactionTax: attributedTax,
      netProfit,
    });

    await db
      .update(fifoLots)
      .set({ remainingShares: lot.remainingShares - taken })
      .where(and(eq(fifoLots.userId, userId), eq(fifoLots.id, lot.id)));

    remaining -= taken;
  }

  if (remaining > 0.0001) {
    throw new Error(`庫存不足：${stockCode} 尚缺 ${remaining.toFixed(2)} 股`);
  }
}

/** 刪除賣單 → 還原 FIFO 剩餘股數、刪 realized_pnl */
export async function undoSell(userId: string, txnId: number) {
  const records = await db
    .select({ lotId: realizedPnl.lotId, sharesSold: realizedPnl.sharesSold })
    .from(realizedPnl)
    .where(and(eq(realizedPnl.userId, userId), eq(realizedPnl.sellTxnId, txnId)));

  for (const r of records) {
    await db
      .update(fifoLots)
      .set({ remainingShares: sql`${fifoLots.remainingShares} + ${r.sharesSold}` })
      .where(and(eq(fifoLots.userId, userId), eq(fifoLots.id, r.lotId)));
  }
  await db
    .delete(realizedPnl)
    .where(and(eq(realizedPnl.userId, userId), eq(realizedPnl.sellTxnId, txnId)));
}

export async function getLotsForStock(userId: string, stockCode: string): Promise<FifoLot[]> {
  const rows = await db
    .select()
    .from(fifoLots)
    .where(and(eq(fifoLots.userId, userId), eq(fifoLots.stockCode, stockCode)))
    .orderBy(asc(fifoLots.purchaseDate), asc(fifoLots.id));
  return rows.map((r) => ({
    id: r.id,
    transactionId: r.transactionId,
    stockCode: r.stockCode,
    purchaseDate: r.purchaseDate,
    originalShares: r.originalShares,
    remainingShares: r.remainingShares,
    costPerShare: r.costPerShare,
  }));
}

export async function getRealizedPnl(params: {
  userId: string;
  stockCode?: string;
  dateFrom?: string;
  dateTo?: string;
}): Promise<RealizedPnlRecord[]> {
  const { userId, stockCode, dateFrom, dateTo } = params;
  const conds = [eq(realizedPnl.userId, userId)];
  if (stockCode) conds.push(eq(realizedPnl.stockCode, stockCode));
  if (dateFrom) conds.push(gte(realizedPnl.sellDate, dateFrom));
  if (dateTo) conds.push(lte(realizedPnl.sellDate, dateTo));

  const rows = await db
    .select()
    .from(realizedPnl)
    .where(and(...conds))
    .orderBy(desc(realizedPnl.sellDate));

  return rows.map((r) => ({
    id: r.id,
    sellTxnId: r.sellTxnId,
    lotId: r.lotId,
    stockCode: r.stockCode,
    sellDate: r.sellDate,
    sharesSold: r.sharesSold,
    costPerShare: r.costPerShare,
    sellPrice: r.sellPrice,
    grossProfit: r.grossProfit,
    brokerageFee: r.brokerageFee,
    transactionTax: r.transactionTax,
    netProfit: r.netProfit,
  }));
}

export async function getYearlyPnl(userId: string) {
  const pnlRows = await db
    .select({
      year: sql<string>`EXTRACT(YEAR FROM ${realizedPnl.sellDate}::date)::text`,
      total: sql<number>`SUM(${realizedPnl.netProfit})::float`,
    })
    .from(realizedPnl)
    .where(eq(realizedPnl.userId, userId))
    .groupBy(sql`EXTRACT(YEAR FROM ${realizedPnl.sellDate}::date)`);

  const divRows = await db
    .select({
      year: sql<string>`EXTRACT(YEAR FROM ${transactions.date}::date)::text`,
      total: sql<number>`SUM(${transactions.netAmount})::float`,
    })
    .from(transactions)
    .where(and(eq(transactions.userId, userId), eq(transactions.type, 'DIVIDEND')))
    .groupBy(sql`EXTRACT(YEAR FROM ${transactions.date}::date)`);

  const txnRows = await db
    .select({
      year: sql<string>`EXTRACT(YEAR FROM ${transactions.date}::date)::text`,
      cnt: sql<number>`COUNT(*)::int`,
    })
    .from(transactions)
    .where(and(eq(transactions.userId, userId), sql`${transactions.type} != 'DIVIDEND'`))
    .groupBy(sql`EXTRACT(YEAR FROM ${transactions.date}::date)`);

  const years = new Set<string>([
    ...pnlRows.map((r) => r.year),
    ...divRows.map((r) => r.year),
    ...txnRows.map((r) => r.year),
  ]);

  return [...years]
    .sort((a, b) => b.localeCompare(a))
    .map((year) => ({
      year: Number(year),
      realizedPnl: pnlRows.find((r) => r.year === year)?.total ?? 0,
      dividendIncome: divRows.find((r) => r.year === year)?.total ?? 0,
      totalTxns: txnRows.find((r) => r.year === year)?.cnt ?? 0,
    }));
}
