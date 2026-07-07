/**
 * 技術指標運算 — 純函式，從 electron/ipc/handlers.ts 抽出
 * MA、EMA、RSI(14)、KD(9,3,3)、MACD(12,26,9)、ATR(14) + 動能指標
 */
import type { PriceHistoryPoint, TechData } from '@/shared/types';

export function ma(arr: number[], n: number): number {
  if (arr.length < n) return 0;
  const slice = arr.slice(-n);
  return slice.reduce((s, v) => s + v, 0) / n;
}

export function ema(arr: number[], n: number): number[] {
  if (arr.length < n) return [];
  const k = 2 / (n + 1);
  const out: number[] = [];
  const initSma = arr.slice(0, n).reduce((s, v) => s + v, 0) / n;
  out.push(initSma);
  for (let i = n; i < arr.length; i++) {
    out.push(arr[i] * k + out[out.length - 1] * (1 - k));
  }
  return out;
}

/** RSI(14) with Wilder's smoothing */
export function rsi(closes: number[], period = 14): number {
  if (closes.length < period + 1) return 0;
  const gains: number[] = [];
  const losses: number[] = [];
  for (let i = 1; i < closes.length; i++) {
    const d = closes[i] - closes[i - 1];
    gains.push(d > 0 ? d : 0);
    losses.push(d < 0 ? -d : 0);
  }
  let avgGain = gains.slice(0, period).reduce((s, v) => s + v, 0) / period;
  let avgLoss = losses.slice(0, period).reduce((s, v) => s + v, 0) / period;
  for (let i = period; i < gains.length; i++) {
    avgGain = (avgGain * (period - 1) + gains[i]) / period;
    avgLoss = (avgLoss * (period - 1) + losses[i]) / period;
  }
  if (avgLoss === 0) return 100;
  return 100 - 100 / (1 + avgGain / avgLoss);
}

/** KD (Stochastic 9,3,3) */
export function kd(highs: number[], lows: number[], closes: number[]): { k: number; d: number } {
  const period = 9;
  if (closes.length < period) return { k: 50, d: 50 };
  const rsv: number[] = [];
  for (let i = period - 1; i < closes.length; i++) {
    const h = Math.max(...highs.slice(i - period + 1, i + 1));
    const l = Math.min(...lows.slice(i - period + 1, i + 1));
    rsv.push(h === l ? 50 : ((closes[i] - l) / (h - l)) * 100);
  }
  let k = 50, d = 50;
  for (const v of rsv) {
    k = (v + 2 * k) / 3;
    d = (k + 2 * d) / 3;
  }
  return { k, d };
}

/** ATR(14) with Wilder's smoothing */
export function atr(highs: number[], lows: number[], closes: number[], period = 14): number {
  if (closes.length < period + 1) return 0;
  const trs: number[] = [];
  for (let i = 1; i < closes.length; i++) {
    const hl = highs[i] - lows[i];
    const hc = Math.abs(highs[i] - closes[i - 1]);
    const lc = Math.abs(lows[i] - closes[i - 1]);
    trs.push(Math.max(hl, hc, lc));
  }
  let a = trs.slice(0, period).reduce((s, v) => s + v, 0) / period;
  for (let i = period; i < trs.length; i++) {
    a = (a * (period - 1) + trs[i]) / period;
  }
  return a;
}

/** MACD (12, 26, 9) */
export function macd(closes: number[]): { line: number; signal: number; hist: number } {
  if (closes.length < 35) return { line: 0, signal: 0, hist: 0 };
  const ema12 = ema(closes, 12);
  const ema26 = ema(closes, 26);
  const offset = ema12.length - ema26.length;
  const macdLine: number[] = [];
  for (let i = 0; i < ema26.length; i++) {
    macdLine.push(ema12[i + offset] - ema26[i]);
  }
  const sigArr = ema(macdLine, 9);
  const lastLine = macdLine[macdLine.length - 1] ?? 0;
  const lastSig = sigArr[sigArr.length - 1] ?? 0;
  return { line: lastLine, signal: lastSig, hist: lastLine - lastSig };
}

/**
 * 從 90 天 OHLC 歷史算出完整 TechData
 * 包含 MA、RSI、KD、MACD、ATR、平均成交量、20 日漲跌、距 60 日高
 */
export function computeTechData(
  stockCode: string,
  history: PriceHistoryPoint[],
): TechData | null {
  const validPoints = history.filter((p) => p.close > 0);
  if (validPoints.length === 0) return null;
  const closes = validPoints.map((p) => p.close);
  const highs = validPoints.map((p) => p.high ?? p.close);
  const lows = validPoints.map((p) => p.low ?? p.close);
  const volumes = validPoints.map((p) => p.volume).filter((v) => v > 0);

  const kdR = kd(highs, lows, closes);
  const macdR = macd(closes);
  const atr14 = atr(highs, lows, closes, 14);
  const recentVols = volumes.slice(-20);
  const avgVolume =
    recentVols.length > 0
      ? recentVols.reduce((s, v) => s + v, 0) / recentVols.length
      : undefined;
  const lastClose = closes[closes.length - 1];
  const close20dAgo = closes.length >= 21 ? closes[closes.length - 21] : undefined;
  const return20d =
    close20dAgo && close20dAgo > 0
      ? ((lastClose - close20dAgo) / close20dAgo) * 100
      : undefined;
  const last60Highs = highs.slice(-60);
  const high60d = last60Highs.length > 0 ? Math.max(...last60Highs) : undefined;
  const distFromHigh60d =
    high60d && high60d > 0 ? ((lastClose - high60d) / high60d) * 100 : undefined;

  return {
    stockCode,
    lastClose,
    ma5: ma(closes, 5),
    ma20: ma(closes, 20),
    ma60: ma(closes, 60),
    rsi14: rsi(closes, 14),
    kdK: kdR.k,
    kdD: kdR.d,
    macd: macdR.line,
    macdSignal: macdR.signal,
    macdHist: macdR.hist,
    avgVolume,
    atr14: atr14 > 0 ? atr14 : undefined,
    return20d,
    distFromHigh60d,
  };
}
