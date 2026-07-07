export type MarketType = 'TWSE' | 'OTC' | 'ETF';
export type TxnType = 'BUY' | 'SELL' | 'DIVIDEND';

// ── User & Auth ─────────────────────────────────────────────
export interface User {
  id: string;           // NextAuth UUID
  email: string;
  name: string | null;
  image: string | null;
  createdAt: string;
}

/** 使用者可調的個人化設定（存 user_settings.json_data） */
export interface UserSettings {
  /** AI Model IDs — 未來 Anthropic/Google 換模型使用者自己在 UI 改字串即可 */
  claudeModel?: string;    // e.g. 'claude-sonnet-4-6', 'claude-opus-4-8'
  geminiModel?: string;    // e.g. 'gemini-2.5-flash', 'gemini-2.5-pro'
  /** 戰備現金（新台幣） — 現有 UI 已有此設定 */
  reserveCash?: number;
  /** 雷達評分 preset key — 現有 UI 已有此設定 */
  radarScorePreset?: string;
}

export interface Stock {
  code: string;
  name: string;
  market: MarketType;
  currency: 'TWD';
}

export interface Transaction {
  id: number;
  stockCode: string;
  type: TxnType;
  date: string;
  shares: number;
  pricePerShare: number;
  brokerageFee: number;
  transactionTax: number;
  netAmount: number;
  notes?: string;
  createdAt: string;
}

export interface FifoLot {
  id: number;
  transactionId: number;
  stockCode: string;
  purchaseDate: string;
  originalShares: number;
  remainingShares: number;
  costPerShare: number;
}

export interface RealizedPnlRecord {
  id: number;
  sellTxnId: number;
  lotId: number;
  stockCode: string;
  sellDate: string;
  sharesSold: number;
  costPerShare: number;
  sellPrice: number;
  grossProfit: number;
  brokerageFee: number;
  transactionTax: number;
  netProfit: number;
}

export interface QuoteData {
  stockCode: string;
  price: number;
  changeAbs: number;
  changePct: number;
  volume: number;
  fetchedAt: string;
  isDelayed: boolean;
}

/** 大盤 context — 給 AI 看當下市場環境 */
export interface MarketContext {
  taiex?:    { value: number; changePct: number };  // 加權指數
  otc?:      { value: number; changePct: number };  // 櫃買指數
  esFutures?: { value: number; changePct: number }; // S&P 500 期貨（美股預期）
  usdTwd?:   { value: number; changePct: number };  // 美元/新台幣（外資進出指標）
  fetchedAt: string;
}

export interface HoldingSummary {
  stockCode: string;
  stockName: string;
  market: MarketType;
  totalShares: number;
  avgCostPerShare: number;
  totalCost: number;
  currentPrice: number;
  currentValue: number;
  unrealizedPnl: number;
  unrealizedPnlPct: number;
  dayChange: number;
  dayChangePct: number;
  lots: FifoLot[];
}

export interface PortfolioSummary {
  totalCost: number;
  totalValue: number;
  totalUnrealizedPnl: number;
  totalUnrealizedPnlPct: number;
  totalRealizedPnl: number;
  totalDividendIncome: number;
  dayChange: number;
  holdings: HoldingSummary[];
  pricesLastUpdated: string;
}

export interface PriceHistoryPoint {
  date: string;
  close: number;
  volume: number;
  open?: number;   // K 線需要；舊呼叫端可忽略
  high?: number;
  low?: number;
}

export interface PortfolioHistoryPoint {
  date: string;
  value: number;
  cost: number;
}

export interface FeeCalculation {
  brokerageFee: number;
  transactionTax: number;
  netAmount: number;
}

export interface TxnFilter {
  stockCode?: string;
  type?: TxnType;
  dateFrom?: string;
  dateTo?: string;
}

export interface AddStockInput {
  code: string;
  name: string;
  market: MarketType;
}

export interface AddTransactionInput {
  stockCode: string;
  type: TxnType;
  date: string;
  shares: number;
  pricePerShare: number;
  brokerageFee: number;
  transactionTax: number;
  notes?: string;
}

export interface CalcFeesInput {
  type: TxnType;
  shares: number;
  pricePerShare: number;
  stockCode?: string; // 用於判斷 ETF vs 一般股票稅率
}

/** 配息同步：預覽一筆待匯入配息 */
export interface DividendSyncItem {
  stockCode: string;
  stockName: string;
  date: string;        // YYYY-MM-DD (除息日)
  perShare: number;    // 每股配息金額 (TWD)
  sharesHeld: number;  // 當時持股股數
  total: number;       // perShare × sharesHeld
}

export interface YearlyPnl {
  year: number;
  realizedPnl: number;
  dividendIncome: number;
  totalTxns: number;
}

// ── Radar ────────────────────────────────────────────────
export interface RadarStock {
  id: number;
  stockCode: string;
  stockName: string;
  market: MarketType;
  buyAt: number | null;
  stopLoss: number | null;
  targetShares: number | null;
  note: string | null;
  remark: string | null;
  isHolding: boolean;
  sortOrder: number;
}

export interface InstData {
  date: string;
  foreignNet: number;   // 股 (TWSE raw shares; TPEX lots × 1000)
  trustNet: number;
  dealerNet: number;
  totalNet: number;
}

export interface AddRadarInput {
  stockCode: string;
  stockName: string;
  market: MarketType;
  buyAt?: number | null;
  stopLoss?: number | null;
  targetShares?: number | null;
  note?: string;
  remark?: string;
  isHolding?: boolean;
}

/** 多日法人趨勢（從 radar_inst_history 計算） */
export interface InstTrend {
  stockCode: string;
  foreignStreak: number;   // +N=連續買 N 日，-N=連續賣 N 日，0=無方向
  trustStreak: number;
  totalStreak: number;
  foreign5d: number;       // 最近 5 日累積（股）
  total5d: number;
  total10d: number;
  daysAvailable: number;   // 有資料的天數
}

/** 技術線型（從 yahoo finance 抓的歷史價計算） */
export interface TechData {
  stockCode: string;
  lastClose: number;
  ma5: number;   // 0 表示資料不足
  ma20: number;
  ma60: number;
  rsi14?: number;     // RSI(14): 0-100，>70 超買、<30 超賣
  kdK?: number;       // KD(9,3,3) K 值
  kdD?: number;       // KD(9,3,3) D 值
  macd?: number;      // MACD 主線 (12, 26)
  macdSignal?: number; // 訊號線 (9 EMA)
  macdHist?: number;  // 柱狀 (MACD - Signal)
  avgVolume?: number; // 過去 20 日平均成交量（股）— 給動態閾值用
  atr14?: number;     // ATR(14)：日均真實波動（元）— 給智能停損建議用
  return20d?: number;     // 近 20 個交易日漲跌幅（%）— 動能
  distFromHigh60d?: number; // 距 60 日高點百分比（負值，例 -8.5 表示距高點 -8.5%）
}

/** 歷史回測：法人訊號的真實勝率 */
export interface BacktestResult {
  stockCode: string;
  greenSignalCount: number;       // 過去 90 天「外資連買 3 日」觸發次數
  greenWinRate5d?: number;        // 5 日後股價上漲的勝率 %
  greenAvgReturn5d?: number;      // 5 日後平均報酬 %
  greenWinRate10d?: number;
  greenAvgReturn10d?: number;
  fetchedAt: string;
}

/** 基本面（變動慢，週/月更新） */
export interface FundamentalData {
  stockCode: string;
  pe?: number;             // 本益比 (trailingPE)
  eps?: number;            // 每股盈餘 (trailingEps, TTM)
  dividendYield?: number;  // 殖利率（百分比，5.0 = 5%）
  marketCap?: number;      // 市值（元）
  fetchedAt: string;
}

/** 融資融券（散戶情緒指標）*/
export interface MarginData {
  date: string;
  marginBalance: number;   // 融資餘額（張）
  marginChange: number;    // 融資增減（今日 - 前日）
  shortBalance: number;    // 融券餘額（張）
  shortChange: number;     // 融券增減
}
