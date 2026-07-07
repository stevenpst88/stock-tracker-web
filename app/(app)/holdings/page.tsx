'use client';

import { Fragment, useState } from 'react';
import useSWR from 'swr';
import clsx from 'clsx';
import { swrFetcher } from '@/lib/api-client';
import CurrencyDisplay from '@/components/CurrencyDisplay';
import type { PortfolioSummary } from '@/shared/types';

const MARKET_BADGE: Record<string, string> = {
  TWSE: 'bg-blue-900/60 text-blue-300',
  OTC: 'bg-green-900/60 text-green-300',
  ETF: 'bg-amber-900/60 text-amber-300',
};

export default function HoldingsPage() {
  const { data, error, isLoading } = useSWR<PortfolioSummary>(
    '/api/portfolio/summary',
    swrFetcher,
    { refreshInterval: 60_000 },
  );
  const [expanded, setExpanded] = useState<Set<string>>(new Set());

  if (isLoading) return <div className="p-8 text-slate-400">載入中…</div>;
  if (error) return <div className="p-8 text-red-400">錯誤:{String(error)}</div>;
  if (!data) return <div className="p-8 text-slate-400">沒資料</div>;

  const toggle = (code: string) => {
    const next = new Set(expanded);
    if (next.has(code)) next.delete(code);
    else next.add(code);
    setExpanded(next);
  };

  return (
    <div className="p-6 space-y-4">
      <div className="flex items-baseline justify-between">
        <h1 className="text-2xl font-bold">持倉</h1>
        <div className="text-xs text-slate-500">
          共 {data.holdings.length} 支 · 價格:
          {new Date(data.pricesLastUpdated).toLocaleTimeString('zh-TW')}
        </div>
      </div>

      {data.holdings.length === 0 ? (
        <div className="bg-slate-900 border border-slate-800 rounded-2xl p-12 text-center text-slate-400">
          目前沒有持倉
        </div>
      ) : (
        <div className="bg-slate-900 border border-slate-800 rounded-2xl overflow-hidden">
          <table className="w-full text-sm">
            <thead className="text-xs text-slate-500 border-b border-slate-800 bg-slate-950/50">
              <tr>
                <th className="text-left py-3 px-3">代號</th>
                <th className="text-left py-3 px-3">名稱</th>
                <th className="text-left py-3 px-3">市場</th>
                <th className="text-right py-3 px-3">股數</th>
                <th className="text-right py-3 px-3">均價</th>
                <th className="text-right py-3 px-3">現價</th>
                <th className="text-right py-3 px-3">今日</th>
                <th className="text-right py-3 px-3">市值</th>
                <th className="text-right py-3 px-3">未實現損益</th>
                <th className="py-3 px-3 w-8"></th>
              </tr>
            </thead>
            <tbody>
              {data.holdings.map((h) => (
                <Fragment key={h.stockCode}>
                  <tr
                    className="border-b border-slate-800/40 hover:bg-slate-800/30 cursor-pointer"
                    onClick={() => toggle(h.stockCode)}
                  >
                    <td className="py-2 px-3 font-mono text-slate-400">{h.stockCode}</td>
                    <td className="py-2 px-3">{h.stockName}</td>
                    <td className="py-2 px-3">
                      <span
                        className={clsx(
                          'text-[10px] px-1.5 py-0.5 rounded',
                          MARKET_BADGE[h.market] ?? 'bg-slate-800 text-slate-400',
                        )}
                      >
                        {h.market}
                      </span>
                    </td>
                    <td className="py-2 px-3 text-right tabular-nums">
                      {h.totalShares.toLocaleString()}
                    </td>
                    <td className="py-2 px-3 text-right tabular-nums">
                      <CurrencyDisplay value={h.avgCostPerShare} decimals={2} />
                    </td>
                    <td className="py-2 px-3 text-right tabular-nums">
                      <CurrencyDisplay value={h.currentPrice} decimals={2} />
                    </td>
                    <td className="py-2 px-3 text-right tabular-nums">
                      <CurrencyDisplay value={h.dayChange} colorize showSign />
                      <div className="text-[10px] text-slate-500">
                        {h.dayChangePct >= 0 ? '+' : ''}
                        {h.dayChangePct.toFixed(2)}%
                      </div>
                    </td>
                    <td className="py-2 px-3 text-right tabular-nums font-medium">
                      <CurrencyDisplay value={h.currentValue} />
                    </td>
                    <td className="py-2 px-3 text-right tabular-nums">
                      <CurrencyDisplay value={h.unrealizedPnl} colorize showSign />
                      <div className="text-[10px] text-slate-500">
                        {h.unrealizedPnlPct >= 0 ? '+' : ''}
                        {h.unrealizedPnlPct.toFixed(1)}%
                      </div>
                    </td>
                    <td className="py-2 px-3 text-slate-500 text-center">
                      {expanded.has(h.stockCode) ? '▲' : '▼'}
                    </td>
                  </tr>
                  {expanded.has(h.stockCode) && h.lots.length > 0 && (
                    <tr className="bg-slate-950/60">
                      <td colSpan={10} className="py-2 px-6">
                        <div className="text-xs text-slate-500 mb-2">
                          FIFO 買入批次({h.lots.length} 筆)
                        </div>
                        <table className="w-full text-xs">
                          <thead className="text-slate-600">
                            <tr>
                              <th className="text-left py-1">購買日</th>
                              <th className="text-right py-1">原始股數</th>
                              <th className="text-right py-1">剩餘股數</th>
                              <th className="text-right py-1">成本/股</th>
                              <th className="text-right py-1">本批市值</th>
                            </tr>
                          </thead>
                          <tbody>
                            {h.lots.map((l) => (
                              <tr key={l.id} className="text-slate-400">
                                <td className="py-1">{l.purchaseDate}</td>
                                <td className="py-1 text-right tabular-nums">
                                  {l.originalShares.toLocaleString()}
                                </td>
                                <td className="py-1 text-right tabular-nums">
                                  {l.remainingShares.toLocaleString()}
                                </td>
                                <td className="py-1 text-right tabular-nums">
                                  <CurrencyDisplay value={l.costPerShare} decimals={2} />
                                </td>
                                <td className="py-1 text-right tabular-nums">
                                  <CurrencyDisplay
                                    value={l.remainingShares * h.currentPrice}
                                  />
                                </td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </td>
                    </tr>
                  )}
                </Fragment>
              ))}
            </tbody>
            <tfoot className="border-t border-slate-800 bg-slate-950/50">
              <tr className="text-sm font-medium">
                <td colSpan={7} className="py-3 px-3 text-right text-slate-400">
                  合計
                </td>
                <td className="py-3 px-3 text-right tabular-nums">
                  <CurrencyDisplay value={data.totalValue} />
                </td>
                <td className="py-3 px-3 text-right tabular-nums">
                  <CurrencyDisplay value={data.totalUnrealizedPnl} colorize showSign />
                </td>
                <td></td>
              </tr>
            </tfoot>
          </table>
        </div>
      )}
    </div>
  );
}
