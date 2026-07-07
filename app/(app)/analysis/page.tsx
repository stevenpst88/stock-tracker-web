'use client';

import useSWR from 'swr';
import {
  Bar,
  BarChart,
  Cell,
  Pie,
  PieChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import { swrFetcher } from '@/lib/api-client';
import CurrencyDisplay from '@/components/CurrencyDisplay';
import type { PortfolioSummary, YearlyPnl } from '@/shared/types';

const PIE_COLORS = [
  '#3b82f6', '#10b981', '#f59e0b', '#8b5cf6', '#ec4899',
  '#14b8a6', '#f97316', '#a78bfa', '#06b6d4', '#84cc16',
];

export default function AnalysisPage() {
  const { data: summary } = useSWR<PortfolioSummary>('/api/portfolio/summary', swrFetcher);
  const { data: yearly } = useSWR<YearlyPnl[]>('/api/portfolio/yearly-pnl', swrFetcher);

  const allocation =
    summary?.holdings.map((h, i) => ({
      name: `${h.stockCode} ${h.stockName}`,
      value: h.currentValue,
      pct: (h.currentValue / summary.totalValue) * 100,
      color: PIE_COLORS[i % PIE_COLORS.length],
    })) ?? [];

  return (
    <div className="p-6 space-y-6">
      <h1 className="text-2xl font-bold">分析</h1>

      {/* 年度損益 */}
      <div className="bg-slate-900 border border-slate-800 rounded-2xl p-6">
        <h2 className="text-sm text-slate-400 mb-4 font-medium">年度損益</h2>
        {!yearly || yearly.length === 0 ? (
          <div className="py-8 text-center text-slate-500 text-sm">尚無資料</div>
        ) : (
          <>
            <div className="h-64">
              <ResponsiveContainer>
                <BarChart data={[...yearly].reverse()}>
                  <XAxis
                    dataKey="year"
                    stroke="#64748b"
                    tick={{ fontSize: 11 }}
                  />
                  <YAxis stroke="#64748b" tick={{ fontSize: 11 }} />
                  <Tooltip
                    contentStyle={{
                      backgroundColor: '#1e293b',
                      border: '1px solid #334155',
                      borderRadius: 8,
                      fontSize: 12,
                    }}
                    formatter={(v) => Number(v).toLocaleString('zh-TW')}
                  />
                  <Bar dataKey="realizedPnl" name="已實現損益" fill="#3b82f6" />
                  <Bar dataKey="dividendIncome" name="配息收入" fill="#f59e0b" />
                </BarChart>
              </ResponsiveContainer>
            </div>
            <table className="w-full text-sm mt-4">
              <thead className="text-xs text-slate-500 border-b border-slate-800">
                <tr>
                  <th className="text-left py-2">年度</th>
                  <th className="text-right py-2">已實現損益</th>
                  <th className="text-right py-2">配息收入</th>
                  <th className="text-right py-2">總計</th>
                  <th className="text-right py-2">交易次數</th>
                </tr>
              </thead>
              <tbody>
                {yearly.map((y) => (
                  <tr key={y.year} className="border-b border-slate-800/40">
                    <td className="py-2 font-medium">{y.year}</td>
                    <td className="py-2 text-right tabular-nums">
                      <CurrencyDisplay value={y.realizedPnl} colorize showSign />
                    </td>
                    <td className="py-2 text-right tabular-nums">
                      <CurrencyDisplay value={y.dividendIncome} showSign />
                    </td>
                    <td className="py-2 text-right tabular-nums font-medium">
                      <CurrencyDisplay
                        value={y.realizedPnl + y.dividendIncome}
                        colorize
                        showSign
                      />
                    </td>
                    <td className="py-2 text-right tabular-nums text-slate-400">
                      {y.totalTxns}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </>
        )}
      </div>

      {/* 資產配置 */}
      <div className="bg-slate-900 border border-slate-800 rounded-2xl p-6">
        <h2 className="text-sm text-slate-400 mb-4 font-medium">資產配置</h2>
        {allocation.length === 0 ? (
          <div className="py-8 text-center text-slate-500 text-sm">尚無持倉</div>
        ) : (
          <div className="grid md:grid-cols-2 gap-6">
            <div className="h-72">
              <ResponsiveContainer>
                <PieChart>
                  <Pie
                    data={allocation}
                    dataKey="value"
                    nameKey="name"
                    cx="50%"
                    cy="50%"
                    outerRadius={90}
                  >
                    {allocation.map((a, i) => (
                      <Cell key={i} fill={a.color} />
                    ))}
                  </Pie>
                  <Tooltip
                    contentStyle={{
                      backgroundColor: '#1e293b',
                      border: '1px solid #334155',
                      borderRadius: 8,
                      fontSize: 12,
                    }}
                    formatter={(v) => Number(v).toLocaleString('zh-TW')}
                  />
                </PieChart>
              </ResponsiveContainer>
            </div>
            <div className="space-y-1 text-sm max-h-72 overflow-y-auto">
              {allocation.map((a) => (
                <div
                  key={a.name}
                  className="flex items-center justify-between py-1 border-b border-slate-800/40"
                >
                  <div className="flex items-center gap-2 min-w-0">
                    <span
                      className="w-3 h-3 rounded-sm shrink-0"
                      style={{ backgroundColor: a.color }}
                    />
                    <span className="truncate">{a.name}</span>
                  </div>
                  <div className="text-slate-400 tabular-nums text-xs shrink-0 ml-2">
                    {a.pct.toFixed(1)}%
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
