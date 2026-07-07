/**
 * 法人買賣 + 融資融券 fetchers（TWSE + TPEX）
 *
 * 從 electron/ipc/handlers.ts RADAR_FETCH_INST 抽出成純函式：
 * - fetchInstFlow(): 抓當日法人買賣（TWSE + TPEX）
 * - fetchMarginBalance(): 抓當日融資融券（TWSE + TPEX）
 *
 * 沒動資料庫；由 API route 呼叫後自己上 DB
 */
import type { InstData, MarginData } from '@/shared/types';

const UA = { 'User-Agent': 'Mozilla/5.0 (compatible; StockTracker/1.0)' };

const parseNum = (v: string): number => {
  const n = parseFloat((v ?? '').replace(/,/g, ''));
  return isNaN(n) ? 0 : n;
};

const prevDay = (ymd: string, n: number): string => {
  const d = new Date(ymd);
  d.setDate(d.getDate() - n);
  return d.toISOString().slice(0, 10);
};

/** 抓當日法人買賣（會 fallback 到 5 日前找 data） */
export async function fetchInstFlow(dateYMD: string): Promise<{
  date: string;
  data: Record<string, InstData>;
}> {
  const result: Record<string, InstData> = {};
  let twseDate = dateYMD;

  // ── TWSE T86 ──
  for (let attempt = 0; attempt <= 5; attempt++) {
    const tryDate = prevDay(dateYMD, attempt);
    try {
      const url = `https://www.twse.com.tw/rwd/zh/fund/T86?response=json&date=${tryDate.replace(/-/g, '')}&selectType=ALL`;
      const resp = await fetch(url, {
        headers: UA,
        signal: AbortSignal.timeout(15000),
      });
      const json = (await resp.json()) as { stat: string; data?: string[][] };
      if (json.stat === 'OK' && Array.isArray(json.data) && json.data.length > 0) {
        twseDate = tryDate;
        for (const row of json.data) {
          const code = (row[0] ?? '').trim();
          if (!code) continue;
          if (row.length >= 21) {
            // 舊版 21 欄
            result[code] = {
              date: tryDate,
              foreignNet: Math.round(parseNum(row[10])),
              trustNet: Math.round(parseNum(row[13])),
              dealerNet: Math.round(parseNum(row[16]) + parseNum(row[19])),
              totalNet: Math.round(parseNum(row[20])),
            };
          } else if (row.length >= 19) {
            // 新版 19 欄
            result[code] = {
              date: tryDate,
              foreignNet: Math.round(parseNum(row[4]) + parseNum(row[7])),
              trustNet: Math.round(parseNum(row[10])),
              dealerNet: Math.round(parseNum(row[11])),
              totalNet: Math.round(parseNum(row[18])),
            };
          }
        }
        break;
      }
    } catch (e) {
      console.warn(`[TWSE] attempt ${attempt} failed:`, e);
    }
  }

  // ── TPEX ──
  try {
    const [y, m, d] = twseDate.split('-');
    const rocDate = `${Number(y) - 1911}/${m}/${d}`;
    const url = `https://www.tpex.org.tw/www/zh-tw/insti/dailyTrade?type=Daily&id=&response=json&date=${rocDate}`;
    const resp = await fetch(url, { headers: UA, signal: AbortSignal.timeout(15000) });
    interface TpexTable { data?: string[][] }
    const json = (await resp.json()) as { tables?: TpexTable[]; aaData?: string[][] };
    const rows = json.tables?.[0]?.data ?? json.aaData ?? [];
    for (const row of rows) {
      const code = (row[0] ?? '').trim();
      if (!code) continue;
      if (row.length >= 24) {
        result[code] = {
          date: twseDate,
          foreignNet: Math.round(parseNum(row[10])),
          trustNet: Math.round(parseNum(row[13])),
          dealerNet: Math.round(parseNum(row[22])),
          totalNet: Math.round(parseNum(row[23])),
        };
      } else if (row.length >= 18) {
        result[code] = {
          date: twseDate,
          foreignNet: Math.round(parseNum(row[10]) * 1000),
          trustNet: Math.round(parseNum(row[13]) * 1000),
          dealerNet: Math.round(parseNum(row[16]) * 1000),
          totalNet: Math.round(parseNum(row[17]) * 1000),
        };
      }
    }
  } catch (e) {
    console.warn('[TPEX] failed:', e);
  }

  return { date: twseDate, data: result };
}

/** 抓當日融資融券 — 傳入 TWSE 的日期 */
export async function fetchMarginBalance(twseDate: string): Promise<Record<string, MarginData>> {
  const out: Record<string, MarginData> = {};

  // TWSE MI_MARGN
  try {
    const url = `https://www.twse.com.tw/exchangeReport/MI_MARGN?response=json&date=${twseDate.replace(/-/g, '')}&selectType=ALL`;
    const r = await fetch(url, { headers: UA, signal: AbortSignal.timeout(15000) });
    interface MarginTable { data?: string[][] }
    const j = (await r.json()) as { tables?: MarginTable[] };
    const rows = j.tables?.[1]?.data ?? [];
    for (const row of rows) {
      if (row.length < 13) continue;
      const code = (row[0] ?? '').trim();
      if (!code) continue;
      const mPrev = parseNum(row[5]);
      const mCur = parseNum(row[6]);
      const sPrev = parseNum(row[11]);
      const sCur = parseNum(row[12]);
      out[code] = {
        date: twseDate,
        marginBalance: Math.round(mCur),
        marginChange: Math.round(mCur - mPrev),
        shortBalance: Math.round(sCur),
        shortChange: Math.round(sCur - sPrev),
      };
    }
  } catch (e) {
    console.warn('[TWSE margin] failed:', e);
  }

  // TPEX margin
  try {
    const [y, m, d] = twseDate.split('-');
    const rocDate = `${Number(y) - 1911}/${m}/${d}`;
    const url = `https://www.tpex.org.tw/www/zh-tw/margin/balance?response=json&date=${rocDate}`;
    const r = await fetch(url, { headers: UA, signal: AbortSignal.timeout(15000) });
    interface TpexTable { data?: string[][] }
    const j = (await r.json()) as { tables?: TpexTable[] };
    const rows = j.tables?.[0]?.data ?? [];
    for (const row of rows) {
      if (row.length < 15) continue;
      const code = (row[0] ?? '').trim();
      if (!code) continue;
      const mPrev = parseNum(row[2]);
      const mCur = parseNum(row[6]);
      const sPrev = parseNum(row[10]);
      const sCur = parseNum(row[14]);
      out[code] = {
        date: twseDate,
        marginBalance: Math.round(mCur),
        marginChange: Math.round(mCur - mPrev),
        shortBalance: Math.round(sCur),
        shortChange: Math.round(sCur - sPrev),
      };
    }
  } catch (e) {
    console.warn('[TPEX margin] failed:', e);
  }

  return out;
}
