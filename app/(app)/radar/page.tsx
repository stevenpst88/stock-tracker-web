'use client';

import { useState, useMemo } from 'react';
import useSWR, { mutate } from 'swr';
import clsx from 'clsx';
import { apiFetch, swrFetcher } from '@/lib/api-client';
import CurrencyDisplay from '@/components/CurrencyDisplay';
import {
  CARD_BORDER,
  MARKET_BADGE,
  SIGNAL_LABEL,
  SIGNAL_STYLE,
  computeScore,
  fmtShares,
  getSignal,
  scoreColor,
  SCORE_PRESETS,
  type ScorePresetKey,
} from './logic';
import type {
  RadarStock,
  InstData,
  InstTrend,
  TechData,
  FundamentalData,
  MarginData,
  BacktestResult,
} from '@/shared/types';

export default function RadarPage() {
  const { data: stocks } = useSWR<RadarStock[]>('/api/radar', swrFetcher);
  const { data: instMap } = useSWR<Record<string, InstData>>(
    '/api/radar/inst-cache',
    swrFetcher,
  );
  const { data: trendMap } = useSWR<Record<string, InstTrend>>(
    '/api/radar/inst-trends',
    swrFetcher,
  );
  const { data: techMap } = useSWR<Record<string, TechData>>(
    '/api/radar/tech',
    swrFetcher,
  );
  const { data: fundMap } = useSWR<Record<string, FundamentalData>>(
    '/api/radar/fundamental',
    swrFetcher,
  );
  const { data: marginMap } = useSWR<Record<string, MarginData>>(
    '/api/radar/margin-cache',
    swrFetcher,
  );
  const { data: backtestMap } = useSWR<Record<string, BacktestResult>>(
    '/api/radar/backtest',
    swrFetcher,
  );

  const priceCodes = stocks?.map((s) => s.stockCode) ?? [];
  const { data: priceMap } = useSWR<
    Record<string, { price: number; changeAbs: number; changePct: number }>
  >(
    priceCodes.length > 0 ? ['/api/prices/batch', priceCodes.join(',')] : null,
    async () => {
      const res = await fetch('/api/prices/batch', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ codes: priceCodes }),
      });
      return res.json();
    },
  );

  const [preset, setPreset] = useState<ScorePresetKey>('balanced');
  const [fetching, setFetching] = useState(false);

  const rows = useMemo(() => {
    if (!stocks) return [];
    return stocks
      .map((s) => {
        const inst = instMap?.[s.stockCode];
        const trend = trendMap?.[s.stockCode];
        const tech = techMap?.[s.stockCode];
        const price = priceMap?.[s.stockCode];
        const signal = getSignal(s, inst, trend, tech);
        const score = computeScore(
          s,
          inst,
          trend,
          tech,
          price ? { price: price.price, pct: price.changePct } : undefined,
          SCORE_PRESETS[preset].weights,
        );
        return {
          stock: s,
          inst,
          trend,
          tech,
          fund: fundMap?.[s.stockCode],
          margin: marginMap?.[s.stockCode],
          backtest: backtestMap?.[s.stockCode],
          price,
          signal,
          score,
        };
      })
      .sort((a, b) => b.score - a.score);
  }, [stocks, instMap, trendMap, techMap, fundMap, marginMap, backtestMap, priceMap, preset]);

  async function handleFetchInst() {
    setFetching(true);
    try {
      await apiFetch('/api/radar/fetch-inst', { method: 'POST' });
      mutate('/api/radar/inst-cache');
      mutate('/api/radar/inst-trends');
      mutate('/api/radar/margin-cache');
    } catch (e) {
      alert(`抓取失敗:${String(e)}`);
    } finally {
      setFetching(false);
    }
  }

  return (
    <div className="p-6 space-y-4">
      <div className="flex items-baseline justify-between">
        <h1 className="text-2xl font-bold">雷達</h1>
        <div className="flex items-center gap-2">
          <select
            value={preset}
            onChange={(e) => setPreset(e.target.value as ScorePresetKey)}
            className="bg-slate-900 border border-slate-800 rounded px-2 py-1 text-xs"
          >
            {Object.entries(SCORE_PRESETS).map(([k, v]) => (
              <option key={k} value={k}>
                {v.label}
              </option>
            ))}
          </select>
          <button
            onClick={handleFetchInst}
            disabled={fetching}
            className="bg-blue-600 hover:bg-blue-700 disabled:opacity-50 px-3 py-1 rounded text-xs"
          >
            {fetching ? '抓取中…' : '📡 抓法人資料'}
          </button>
        </div>
      </div>

      {!stocks || stocks.length === 0 ? (
        <div className="bg-slate-900 border border-slate-800 rounded-2xl p-12 text-center text-slate-400">
          雷達清單是空的
        </div>
      ) : (
        <div className="grid gap-3">
          {rows.map((r) => (
            <div
              key={r.stock.id}
              className={clsx(
                'bg-slate-900 border border-slate-800 rounded-2xl p-4',
                CARD_BORDER[r.signal],
              )}
            >
              <div className="flex items-baseline gap-3 mb-2">
                <div className="font-mono text-slate-400">{r.stock.stockCode}</div>
                <div className="font-medium">{r.stock.stockName}</div>
                <span
                  className={clsx(
                    'text-[10px] px-1.5 py-0.5 rounded',
                    MARKET_BADGE[r.stock.market] ?? 'bg-slate-800',
                  )}
                >
                  {r.stock.market}
                </span>
                {r.stock.isHolding && (
                  <span className="text-[10px] px-1.5 py-0.5 rounded bg-amber-900/60 text-amber-300">
                    持倉
                  </span>
                )}
                <div className="flex items-center gap-2 ml-auto">
                  <span
                    className={clsx(
                      'w-2.5 h-2.5 rounded-full inline-block',
                      SIGNAL_STYLE[r.signal],
                    )}
                    title={SIGNAL_LABEL[r.signal]}
                  />
                  <span className="text-xs text-slate-400">{SIGNAL_LABEL[r.signal]}</span>
                  <span
                    className={clsx(
                      'text-xs px-2 py-0.5 rounded tabular-nums',
                      scoreColor(r.score),
                    )}
                  >
                    {r.score}
                  </span>
                </div>
              </div>

              <div className="grid grid-cols-2 md:grid-cols-4 gap-3 text-xs">
                <div>
                  <div className="text-slate-500 mb-0.5">現價</div>
                  <div className="font-medium">
                    <CurrencyDisplay value={r.price?.price ?? 0} decimals={2} />
                    {r.price && (
                      <span
                        className={clsx(
                          'ml-2 text-[10px]',
                          r.price.changePct > 0
                            ? 'text-red-400'
                            : r.price.changePct < 0
                              ? 'text-emerald-400'
                              : 'text-slate-500',
                        )}
                      >
                        {r.price.changePct >= 0 ? '+' : ''}
                        {r.price.changePct.toFixed(2)}%
                      </span>
                    )}
                  </div>
                </div>
                <div>
                  <div className="text-slate-500 mb-0.5">目標買入 / 停損</div>
                  <div className="font-medium tabular-nums">
                    {r.stock.buyAt != null ? `$${r.stock.buyAt.toFixed(1)}` : '—'}
                    <span className="text-slate-600 mx-1">/</span>
                    {r.stock.stopLoss != null ? `$${r.stock.stopLoss.toFixed(1)}` : '—'}
                  </div>
                </div>
                {r.inst && (
                  <div>
                    <div className="text-slate-500 mb-0.5">外資 / 合計</div>
                    <div className="font-medium tabular-nums">
                      <span
                        className={
                          r.inst.foreignNet > 0
                            ? 'text-red-400'
                            : r.inst.foreignNet < 0
                              ? 'text-emerald-400'
                              : ''
                        }
                      >
                        {fmtShares(r.inst.foreignNet)}
                      </span>
                      <span className="text-slate-600 mx-1">/</span>
                      <span
                        className={
                          r.inst.totalNet > 0
                            ? 'text-red-400'
                            : r.inst.totalNet < 0
                              ? 'text-emerald-400'
                              : ''
                        }
                      >
                        {fmtShares(r.inst.totalNet)}
                      </span>
                    </div>
                  </div>
                )}
                {r.tech && r.tech.ma20 > 0 && (
                  <div>
                    <div className="text-slate-500 mb-0.5">MA5 / MA20</div>
                    <div className="font-medium tabular-nums">
                      {r.tech.ma5.toFixed(1)}
                      <span className="text-slate-600 mx-1">/</span>
                      {r.tech.ma20.toFixed(1)}
                    </div>
                  </div>
                )}
              </div>

              {(r.tech?.rsi14 != null || r.tech?.kdK != null) && (
                <div className="grid grid-cols-4 gap-2 text-[11px] mt-3 pt-2 border-t border-slate-800/40">
                  {r.tech?.rsi14 != null && (
                    <div>
                      <span className="text-slate-500">RSI</span>{' '}
                      <span
                        className={
                          r.tech.rsi14 > 70
                            ? 'text-red-400'
                            : r.tech.rsi14 < 30
                              ? 'text-emerald-400'
                              : ''
                        }
                      >
                        {r.tech.rsi14.toFixed(0)}
                      </span>
                    </div>
                  )}
                  {r.tech?.kdK != null && r.tech?.kdD != null && (
                    <div>
                      <span className="text-slate-500">KD</span>{' '}
                      {r.tech.kdK.toFixed(0)}/{r.tech.kdD.toFixed(0)}
                    </div>
                  )}
                  {r.tech?.macdHist != null && (
                    <div>
                      <span className="text-slate-500">MACD</span>{' '}
                      <span className={r.tech.macdHist > 0 ? 'text-red-400' : 'text-emerald-400'}>
                        {r.tech.macdHist > 0 ? '🔴' : '🟢'} {Math.abs(r.tech.macdHist).toFixed(2)}
                      </span>
                    </div>
                  )}
                  {r.tech?.atr14 != null && r.tech.lastClose > 0 && (
                    <div>
                      <span className="text-slate-500">波動</span>{' '}
                      <span className="text-amber-300">
                        ±{r.tech.atr14.toFixed(2)}
                      </span>
                    </div>
                  )}
                </div>
              )}

              {r.fund && (
                <div className="text-[11px] mt-2 text-slate-400 flex gap-4">
                  {r.fund.pe != null && <span>P/E {r.fund.pe.toFixed(1)}</span>}
                  {r.fund.eps != null && <span>EPS {r.fund.eps.toFixed(2)}</span>}
                  {r.fund.dividendYield != null && (
                    <span>殖利率 {r.fund.dividendYield.toFixed(2)}%</span>
                  )}
                </div>
              )}

              {r.backtest && r.backtest.greenSignalCount > 0 && (
                <div className="text-[11px] mt-2 text-emerald-300/70">
                  📈 過去外資連買 3 日觸發 {r.backtest.greenSignalCount} 次,
                  {r.backtest.greenWinRate5d != null &&
                    ` 5 日勝率 ${r.backtest.greenWinRate5d.toFixed(0)}%`}
                  {r.backtest.greenAvgReturn5d != null &&
                    ` (平均 ${r.backtest.greenAvgReturn5d >= 0 ? '+' : ''}${r.backtest.greenAvgReturn5d.toFixed(1)}%)`}
                </div>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
