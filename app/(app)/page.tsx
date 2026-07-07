'use client';

import useSWR from 'swr';
import { swrFetcher } from '@/lib/api-client';
import CurrencyDisplay from '@/components/CurrencyDisplay';
import type { PortfolioSummary } from '@/shared/types';

export default function DashboardPage() {
  const { data, error, isLoading } = useSWR<PortfolioSummary>(
    '/api/portfolio/summary',
    swrFetcher,
    { refreshInterval: 60_000 },
  );

  if (isLoading) return <div className="p-8 text-slate-400">載入中…</div>;
  if (error)
    return (
      <div className="p-8 text-red-400">
        錯誤:{String(error)}
      </div>
    );
  if (!data) return <div className="p-8 text-slate-400">沒資料</div>;

  const empty = data.holdings.length === 0;

  return (
    <div className="p-6 space-y-6">
      <div>
        <h1 className="text-2xl font-bold">總覽</h1>
        <p className="text-xs text-slate-500 mt-1">
          價格資料:{new Date(data.pricesLastUpdated).toLocaleString('zh-TW')}
        </p>
      </div>

      {empty ? (
        <div className="bg-slate-900 border border-slate-800 rounded-2xl p-12 text-center">
          <div className="text-slate-400 mb-2">目前沒有持倉資料</div>
          <div className="text-xs text-slate-600">
            進到「交易紀錄」+ 新增買入,或跑資料遷移把 SQLite 匯進來
          </div>
        </div>
      ) : (
        <>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            <Card label="總成本" value={data.totalCost} />
            <Card label="市值" value={data.totalValue} />
            <Card
              label="未實現損益"
              value={data.totalUnrealizedPnl}
              pct={data.totalUnrealizedPnlPct}
              colorize
            />
            <Card label="今日漲跌" value={data.dayChange} colorize />
          </div>

          <div className="bg-slate-900 border border-slate-800 rounded-2xl p-4">
            <h2 className="text-sm font-medium mb-3 text-slate-300">持倉明細</h2>
            <table className="w-full text-sm">
              <thead className="text-xs text-slate-500 border-b border-slate-800">
                <tr>
                  <th className="text-left py-2 px-2">代號</th>
                  <th className="text-left py-2 px-2">名稱</th>
                  <th className="text-right py-2 px-2">股數</th>
                  <th className="text-right py-2 px-2">均價</th>
                  <th className="text-right py-2 px-2">現價</th>
                  <th className="text-right py-2 px-2">市值</th>
                  <th className="text-right py-2 px-2">損益</th>
                </tr>
              </thead>
              <tbody>
                {data.holdings.map((h) => (
                  <tr
                    key={h.stockCode}
                    className="border-b border-slate-800/40 hover:bg-slate-800/30"
                  >
                    <td className="py-2 px-2 font-mono text-slate-400">{h.stockCode}</td>
                    <td className="py-2 px-2">{h.stockName}</td>
                    <td className="py-2 px-2 text-right tabular-nums">
                      {h.totalShares.toLocaleString()}
                    </td>
                    <td className="py-2 px-2 text-right tabular-nums">
                      <CurrencyDisplay value={h.avgCostPerShare} decimals={2} />
                    </td>
                    <td className="py-2 px-2 text-right tabular-nums">
                      <CurrencyDisplay value={h.currentPrice} decimals={2} />
                    </td>
                    <td className="py-2 px-2 text-right tabular-nums">
                      <CurrencyDisplay value={h.currentValue} />
                    </td>
                    <td className="py-2 px-2 text-right tabular-nums">
                      <CurrencyDisplay value={h.unrealizedPnl} colorize showSign />
                      <span className="text-xs text-slate-500 ml-1">
                        ({h.unrealizedPnlPct.toFixed(1)}%)
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </>
      )}
    </div>
  );
}

function Card({
  label,
  value,
  pct,
  colorize = false,
}: {
  label: string;
  value: number;
  pct?: number;
  colorize?: boolean;
}) {
  return (
    <div className="bg-slate-900 border border-slate-800 rounded-2xl p-4">
      <div className="text-xs text-slate-500 mb-1">{label}</div>
      <div className="text-xl font-medium tabular-nums">
        <CurrencyDisplay value={value} colorize={colorize} showSign={colorize} />
      </div>
      {pct != null && (
        <div className="text-xs text-slate-500 mt-1">
          {pct >= 0 ? '+' : ''}
          {pct.toFixed(2)}%
        </div>
      )}
    </div>
  );
}
