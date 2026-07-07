// 雷達畫面共用的純函式與常數
// 抽出來給 index.tsx 和 AnalysisModal.tsx 共用

import type { RadarStock, InstData, InstTrend, TechData } from '@/shared/types';
// (InstTrend used by getSignal V2)

// ── Signal types & thresholds ─────────────────────────────────────
export type Signal = 'green' | 'orange' | 'yellow' | 'red' | 'grey';

// 單位：股（TWSE 直接報股；TPEX 改新 endpoint 後也是股）
export const BUY_THRESHOLD  =  500_000;  // 合計淨買 > 50萬股 (≈500張)
export const SELL_THRESHOLD = -100_000;  // 合計淨賣 < -10萬股 (≈100張)
export const STRONG_BUY_THRESHOLD = 1_000_000; // 強買訊號：合計 > 100 萬股

/**
 * 動態閾值：根據 20 日平均成交量計算「對這支股票而言有意義的法人量」
 * - 大型股（如台積電 日均 3000 萬）：法人 50 萬只佔 1.6%，雜訊，閾值要拉高
 * - 中小型股（如閎康 日均 100 萬）：50 萬佔 50%，已是大買訊號
 *
 * 公式：max(預設閾值, 日均量 × 2%)
 */
function dynamicBuyThreshold(avgVolume?: number): number {
  if (!avgVolume || avgVolume <= 0) return BUY_THRESHOLD;
  return Math.max(BUY_THRESHOLD, Math.round(avgVolume * 0.02));
}
function dynamicSellThreshold(avgVolume?: number): number {
  if (!avgVolume || avgVolume <= 0) return SELL_THRESHOLD;
  return Math.min(SELL_THRESHOLD, Math.round(-avgVolume * 0.005));
}

/**
 * 燈號判斷邏輯（V3，納入 5 日外資累計 + 動態閾值）
 */
export function getSignal(
  stock: RadarStock,
  inst: InstData | undefined,
  trend?: InstTrend | undefined,
  tech?: TechData | undefined,
): Signal {
  if (!inst) return stock.isHolding ? 'yellow' : 'grey';

  // 依股票市值/流動性動態調整門檻
  const buyT  = dynamicBuyThreshold(tech?.avgVolume);
  const sellT = dynamicSellThreshold(tech?.avgVolume);

  const has5d = trend && trend.daysAvailable >= 5;
  const fiveDayForeignBuying = has5d && trend.foreign5d > buyT;
  const fiveDayForeignSelling = has5d && trend.foreign5d < buyT * -1;
  const continuousForeignSell = trend && trend.foreignStreak <= -3;
  const continuousForeignBuy  = trend && trend.foreignStreak >= 3;

  if (stock.isHolding) {
    if (inst.foreignNet < 0 && inst.totalNet < sellT && (fiveDayForeignSelling || !has5d)) {
      return 'orange';
    }
    if (continuousForeignSell) return 'orange';
  }

  if (inst.totalNet > buyT && inst.foreignNet > 0 && (!trend || trend.foreignStreak >= 0)) {
    return 'green';
  }
  if (continuousForeignBuy && inst.totalNet >= 0) return 'green';

  if (stock.isHolding) return 'yellow';

  if (inst.totalNet < 0 && (fiveDayForeignSelling || !has5d || trend.foreign5d < 0)) {
    return 'red';
  }
  if (fiveDayForeignBuying) return 'grey';
  return 'grey';
}

export const SIGNAL_STYLE: Record<Signal, string> = {
  green:  'bg-emerald-500 shadow-emerald-500/50 shadow-md',
  orange: 'bg-orange-500 shadow-orange-500/50 shadow-md animate-pulse',
  yellow: 'bg-amber-400 shadow-amber-400/50 shadow-md',
  red:    'bg-red-500/60',
  grey:   'bg-slate-600',
};

export const SIGNAL_LABEL: Record<Signal, string> = {
  green:  '買入訊號',
  orange: '考慮賣出',
  yellow: '持有觀察',
  red:    '無訊號',
  grey:   '待更新',
};

export const CARD_BORDER: Record<Signal, string> = {
  green:  'border-l-2 border-l-emerald-500',
  orange: 'border-l-2 border-l-orange-500',
  yellow: 'border-l-2 border-l-amber-400',
  red:    '',
  grey:   '',
};

export const MARKET_BADGE: Record<string, string> = {
  TWSE: 'bg-blue-900/60 text-blue-300',
  OTC:  'bg-green-900/60 text-green-300',
  ETF:  'bg-amber-900/60 text-amber-300',
};

// ── Formatters ────────────────────────────────────────────────────
export function fmt(n: number | null | undefined, decimals = 0): string {
  if (n == null) return '—';
  return n.toLocaleString('zh-TW', { minimumFractionDigits: decimals, maximumFractionDigits: decimals });
}

/** 大數字自動轉「萬」單位；< 1萬則顯示原值 */
export function fmtShares(n: number | null | undefined): string {
  if (n == null) return '—';
  const abs = Math.abs(n);
  const prefix = n > 0 ? '+' : '';
  if (abs >= 10_000) {
    const wan = n / 10_000;
    const formatted = wan % 1 === 0 ? wan.toFixed(0) : wan.toFixed(1);
    return `${prefix}${formatted}萬`;
  }
  return `${prefix}${n.toLocaleString()}`;
}

export function fmtPct(n: number): string {
  const sign = n > 0 ? '+' : '';
  return `${sign}${n.toFixed(1)}%`;
}

// ── Composite score weights & presets ───────────────────────────
export interface ScoreWeights {
  inst:     number;  // 法人單日訊號的權重（預設 1.0）
  trend:    number;  // 多日趨勢
  distance: number;  // 距買點/停損
  tech:     number;  // 技術面 MA
}

export const SCORE_PRESETS: Record<string, { label: string; weights: ScoreWeights }> = {
  balanced:    { label: '平衡',   weights: { inst: 1.0, trend: 1.0, distance: 1.0, tech: 1.0 } },
  inst:        { label: '重法人', weights: { inst: 1.5, trend: 1.5, distance: 0.7, tech: 0.5 } },
  tech:        { label: '重技術', weights: { inst: 0.5, trend: 0.7, distance: 1.0, tech: 1.8 } },
  swing:       { label: '波段',   weights: { inst: 1.0, trend: 1.2, distance: 1.5, tech: 0.8 } },
};

export type ScorePresetKey = keyof typeof SCORE_PRESETS;

// ── Composite score (0-100) ───────────────────────────────────────
export function computeScore(
  stock: RadarStock,
  inst: InstData | undefined,
  trend: InstTrend | undefined,
  tech: TechData | undefined,
  price: { price: number; pct: number } | undefined,
  weights: ScoreWeights = SCORE_PRESETS.balanced.weights,
): number {
  let score = 50;

  // 動態閾值（如 tech 有 avgVolume）
  const buyT = dynamicBuyThreshold(tech?.avgVolume);

  if (inst) {
    let instDelta = 0;
    if (inst.totalNet >= buyT * 2) instDelta = 15;
    else if (inst.totalNet >= buyT) instDelta = 10;
    else if (inst.totalNet >= 100_000) instDelta = 4;
    else if (inst.totalNet <= -buyT) instDelta = -15;
    else if (inst.totalNet <= SELL_THRESHOLD) instDelta = -8;
    score += instDelta * weights.inst;
  }

  if (trend) {
    let trendDelta = 0;
    if (trend.foreignStreak >= 3) trendDelta += Math.min(15, 8 + (trend.foreignStreak - 3) * 2);
    else if (trend.foreignStreak <= -3) trendDelta -= Math.min(15, 8 + Math.abs(trend.foreignStreak + 3) * 2);
    if (trend.trustStreak >= 2) trendDelta += 5;
    else if (trend.trustStreak <= -2) trendDelta -= 5;
    score += trendDelta * weights.trend;
  }

  if (stock.buyAt && price) {
    let distDelta = 0;
    const dist = (price.price - stock.buyAt) / stock.buyAt;
    if (dist >= -0.02 && dist <= 0.02) distDelta = 20;
    else if (dist > -0.05 && dist < -0.02) distDelta = 12;
    else if (dist > 0.10) distDelta = -10;
    score += distDelta * weights.distance;
  }

  if (stock.isHolding && stock.stopLoss && price) {
    let stopDelta = 0;
    const distFromStop = (price.price - stock.stopLoss) / stock.stopLoss;
    if (distFromStop < 0.03) stopDelta = -25;
    else if (distFromStop < 0.08) stopDelta = -12;
    score += stopDelta * weights.distance;   // 停損距離也用 distance 權重
  }

  if (tech && tech.lastClose > 0 && tech.ma20 > 0) {
    let techDelta = 0;
    const aboveMa20 = tech.lastClose > tech.ma20;
    const aboveMa60 = tech.ma60 > 0 && tech.lastClose > tech.ma60;
    if (aboveMa20 && aboveMa60) techDelta = 10;
    else if (aboveMa20) techDelta = 4;
    else if (tech.ma60 > 0 && tech.lastClose < tech.ma60) techDelta = -8;
    else techDelta = -4;
    score += techDelta * weights.tech;
  }

  return Math.max(0, Math.min(100, Math.round(score)));
}

export function scoreColor(s: number): string {
  if (s >= 75) return 'text-emerald-400 bg-emerald-900/30';
  if (s >= 60) return 'text-emerald-300 bg-emerald-900/20';
  if (s >= 45) return 'text-slate-300 bg-slate-800';
  if (s >= 30) return 'text-amber-300 bg-amber-900/20';
  return 'text-red-400 bg-red-900/30';
}
