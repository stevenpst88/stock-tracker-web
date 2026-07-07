/**
 * Yahoo Finance provider — Next.js server-side
 *
 * 從 electron/providers/yahooFinanceProvider.ts 移植過來。
 * 主要差異：class → 純 function、去掉 IPriceProvider interface（Next.js 這邊只有一家 provider）
 */
import YahooFinanceClass from 'yahoo-finance2';
import type {
  QuoteData,
  PriceHistoryPoint,
  MarketContext,
  FundamentalData,
} from '@/shared/types';

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const yf = new (YahooFinanceClass as any)({ suppressNotices: ['yahooSurvey'] });

const toTicker = (code: string) => `${code}.TW`;
const toTickerOTC = (code: string) => `${code}.TWO`;

interface YFQuote {
  regularMarketPrice?: number;
  regularMarketChange?: number;
  regularMarketChangePercent?: number;
  regularMarketVolume?: number;
  regularMarketPreviousClose?: number;
}

export async function fetchQuote(stockCode: string): Promise<QuoteData> {
  for (const ticker of [toTicker(stockCode), toTickerOTC(stockCode)]) {
    try {
      const r = (await yf.quote(ticker, {}, { validateResult: false })) as YFQuote;
      const price =
        r.regularMarketPrice && r.regularMarketPrice > 0
          ? r.regularMarketPrice
          : r.regularMarketPreviousClose ?? 0;
      if (price > 0) {
        return {
          stockCode,
          price,
          changeAbs: r.regularMarketChange ?? 0,
          changePct: r.regularMarketChangePercent ?? 0,
          volume: r.regularMarketVolume ?? 0,
          fetchedAt: new Date().toISOString(),
          isDelayed: true,
        };
      }
    } catch (err) {
      console.warn(`[Yahoo] ${ticker} quote failed:`, (err as Error).message);
    }
  }
  return {
    stockCode,
    price: 0,
    changeAbs: 0,
    changePct: 0,
    volume: 0,
    fetchedAt: new Date().toISOString(),
    isDelayed: true,
  };
}

export async function fetchQuotes(stockCodes: string[]): Promise<QuoteData[]> {
  const results = await Promise.allSettled(stockCodes.map((c) => fetchQuote(c)));
  return results
    .filter((r): r is PromiseFulfilledResult<QuoteData> => r.status === 'fulfilled')
    .map((r) => r.value);
}

interface ChartQuote {
  date: Date | string;
  open: number | null;
  high: number | null;
  low: number | null;
  close: number | null;
  volume: number | null;
}

export async function fetchHistory(
  stockCode: string,
  from: Date,
  to: Date,
): Promise<PriceHistoryPoint[]> {
  for (const ticker of [toTicker(stockCode), toTickerOTC(stockCode)]) {
    try {
      const r = (await yf.chart(
        ticker,
        { period1: from, period2: to, interval: '1d' },
        { validateResult: false },
      )) as { quotes: ChartQuote[] };
      const quotes = (r.quotes ?? []).filter((q) => q.close != null && q.close > 0);
      if (quotes.length > 0) {
        return quotes.map((d) => {
          const dt = d.date instanceof Date ? d.date : new Date(d.date as string);
          return {
            date: dt.toISOString().slice(0, 10),
            close: d.close!,
            volume: d.volume ?? 0,
            open: d.open ?? undefined,
            high: d.high ?? undefined,
            low: d.low ?? undefined,
          };
        });
      }
    } catch (err) {
      console.warn(`[Yahoo] ${ticker} history failed:`, (err as Error).message);
    }
  }
  return [];
}

export async function fetchMarketContext(): Promise<MarketContext> {
  const tickers: { key: keyof Omit<MarketContext, 'fetchedAt'>; ticker: string }[] = [
    { key: 'taiex', ticker: '^TWII' },
    { key: 'otc', ticker: '^TWOII' },
    { key: 'esFutures', ticker: 'ES=F' },
    { key: 'usdTwd', ticker: 'TWD=X' },
  ];
  const out: MarketContext = { fetchedAt: new Date().toISOString() };
  await Promise.allSettled(
    tickers.map(async ({ key, ticker }) => {
      try {
        const q = (await yf.quote(ticker)) as YFQuote;
        if (q?.regularMarketPrice != null) {
          out[key] = { value: q.regularMarketPrice, changePct: q.regularMarketChangePercent ?? 0 };
        }
      } catch { /* skip */ }
    }),
  );
  return out;
}

export async function fetchFundamental(stockCode: string): Promise<FundamentalData | null> {
  interface SD { trailingPE?: number; dividendYield?: number; marketCap?: number }
  interface KS { trailingEps?: number }
  for (const ticker of [toTicker(stockCode), toTickerOTC(stockCode)]) {
    try {
      const r = (await yf.quoteSummary(
        ticker,
        { modules: ['summaryDetail', 'defaultKeyStatistics'] },
        { validateResult: false },
      )) as { summaryDetail?: SD; defaultKeyStatistics?: KS };
      const sd = r.summaryDetail;
      const ks = r.defaultKeyStatistics;
      if (!sd && !ks) continue;
      return {
        stockCode,
        pe: sd?.trailingPE,
        eps: ks?.trailingEps,
        dividendYield: sd?.dividendYield != null ? sd.dividendYield * 100 : undefined,
        marketCap: sd?.marketCap,
        fetchedAt: new Date().toISOString(),
      };
    } catch { /* try next ticker */ }
  }
  return null;
}

export async function fetchDividends(
  stockCode: string,
  from: Date,
  to: Date,
): Promise<Array<{ date: string; perShare: number }>> {
  interface DivEntry { date: Date | number; amount: number }
  for (const ticker of [toTicker(stockCode), toTickerOTC(stockCode)]) {
    try {
      const r = (await yf.chart(
        ticker,
        { period1: from, period2: to, interval: '1d', events: 'div' },
        { validateResult: false },
      )) as { quotes: unknown[]; events?: { dividends?: DivEntry[] | Record<string, DivEntry> } };
      const raw = r.events?.dividends;
      if (!raw) continue;
      const arr = Array.isArray(raw) ? raw : Object.values(raw);
      if (arr.length === 0) continue;
      return arr
        .filter((d) => d.amount > 0)
        .map((d) => {
          const dt =
            d.date instanceof Date
              ? d.date
              : new Date(typeof d.date === 'number' ? d.date * 1000 : d.date);
          return { date: dt.toISOString().slice(0, 10), perShare: d.amount };
        })
        .sort((a, b) => a.date.localeCompare(b.date));
    } catch { /* try next ticker */ }
  }
  return [];
}
