'use client';

import { useState } from 'react';
import useSWR, { mutate } from 'swr';
import clsx from 'clsx';
import { apiFetch, swrFetcher } from '@/lib/api-client';
import CurrencyDisplay from '@/components/CurrencyDisplay';
import type { Transaction, TxnType } from '@/shared/types';

const TYPE_LABEL: Record<TxnType, string> = {
  BUY: '買入',
  SELL: '賣出',
  DIVIDEND: '配息',
};

const TYPE_STYLE: Record<TxnType, string> = {
  BUY: 'bg-emerald-900/60 text-emerald-300',
  SELL: 'bg-red-900/60 text-red-300',
  DIVIDEND: 'bg-amber-900/60 text-amber-300',
};

export default function TransactionsPage() {
  const [filterCode, setFilterCode] = useState('');
  const [filterType, setFilterType] = useState<TxnType | ''>('');
  const query = new URLSearchParams();
  if (filterCode) query.set('stockCode', filterCode);
  if (filterType) query.set('type', filterType);
  const key = `/api/transactions${query.toString() ? '?' + query : ''}`;

  const { data, error, isLoading } = useSWR<Transaction[]>(key, swrFetcher);

  async function handleDelete(id: number) {
    if (!confirm('確定要刪除這筆交易嗎?若為賣單會還原 FIFO 剩餘股數。')) return;
    try {
      await apiFetch(`/api/transactions/${id}`, { method: 'DELETE' });
      mutate(key);
    } catch (e) {
      alert(`刪除失敗:${String(e)}`);
    }
  }

  return (
    <div className="p-6 space-y-4">
      <div className="flex items-baseline justify-between">
        <h1 className="text-2xl font-bold">交易紀錄</h1>
        <div className="flex gap-2 items-center">
          <input
            type="text"
            placeholder="搜代號"
            value={filterCode}
            onChange={(e) => setFilterCode(e.target.value)}
            className="bg-slate-900 border border-slate-800 rounded px-3 py-1.5 text-sm w-32"
          />
          <select
            value={filterType}
            onChange={(e) => setFilterType(e.target.value as TxnType | '')}
            className="bg-slate-900 border border-slate-800 rounded px-3 py-1.5 text-sm"
          >
            <option value="">全部類型</option>
            <option value="BUY">買入</option>
            <option value="SELL">賣出</option>
            <option value="DIVIDEND">配息</option>
          </select>
        </div>
      </div>

      {isLoading ? (
        <div className="text-slate-400">載入中…</div>
      ) : error ? (
        <div className="text-red-400">錯誤:{String(error)}</div>
      ) : !data || data.length === 0 ? (
        <div className="bg-slate-900 border border-slate-800 rounded-2xl p-12 text-center text-slate-400">
          沒有符合的交易紀錄
        </div>
      ) : (
        <div className="bg-slate-900 border border-slate-800 rounded-2xl overflow-hidden">
          <table className="w-full text-sm">
            <thead className="text-xs text-slate-500 border-b border-slate-800 bg-slate-950/50">
              <tr>
                <th className="text-left py-3 px-3">日期</th>
                <th className="text-left py-3 px-3">代號</th>
                <th className="text-left py-3 px-3">類型</th>
                <th className="text-right py-3 px-3">股數</th>
                <th className="text-right py-3 px-3">單價</th>
                <th className="text-right py-3 px-3">手續費</th>
                <th className="text-right py-3 px-3">交易稅</th>
                <th className="text-right py-3 px-3">淨額</th>
                <th className="text-left py-3 px-3">備註</th>
                <th className="py-3 px-3 w-16"></th>
              </tr>
            </thead>
            <tbody>
              {data.map((t) => (
                <tr
                  key={t.id}
                  className="border-b border-slate-800/40 hover:bg-slate-800/30"
                >
                  <td className="py-2 px-3 text-slate-400">{t.date}</td>
                  <td className="py-2 px-3 font-mono">{t.stockCode}</td>
                  <td className="py-2 px-3">
                    <span
                      className={clsx(
                        'text-[10px] px-1.5 py-0.5 rounded',
                        TYPE_STYLE[t.type],
                      )}
                    >
                      {TYPE_LABEL[t.type]}
                    </span>
                  </td>
                  <td className="py-2 px-3 text-right tabular-nums">
                    {t.shares.toLocaleString()}
                  </td>
                  <td className="py-2 px-3 text-right tabular-nums">
                    <CurrencyDisplay value={t.pricePerShare} decimals={2} />
                  </td>
                  <td className="py-2 px-3 text-right tabular-nums text-xs text-slate-500">
                    <CurrencyDisplay value={t.brokerageFee} />
                  </td>
                  <td className="py-2 px-3 text-right tabular-nums text-xs text-slate-500">
                    <CurrencyDisplay value={t.transactionTax} />
                  </td>
                  <td className="py-2 px-3 text-right tabular-nums font-medium">
                    <CurrencyDisplay value={t.netAmount} colorize showSign />
                  </td>
                  <td className="py-2 px-3 text-slate-500 text-xs">
                    {t.notes ?? '—'}
                  </td>
                  <td className="py-2 px-3 text-right">
                    <button
                      onClick={() => handleDelete(t.id)}
                      className="text-red-400 hover:text-red-300 text-xs"
                    >
                      刪除
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <p className="text-xs text-slate-600">
        新增交易目前尚未實作(Phase 5 剩下的功能),之後補上表單。目前可透過本機 API 加。
      </p>
    </div>
  );
}
