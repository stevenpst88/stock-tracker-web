/**
 * Drizzle Schema for Neon Postgres
 *
 * 從 Electron 版 SQLite schema 遷移過來，重要差異：
 * 1. 每張存使用者資料的 table 都加了 `userId` 欄位 + CASCADE
 *    → 家人 A 看不到家人 B 的資料
 * 2. SQLite REAL → Postgres doublePrecision（IEEE 754 double）
 * 3. INTEGER PK AUTOINCREMENT → SERIAL
 * 4. 舊 `settings` table 拿掉 → 全域常數放 code、使用者級覆寫放 user_settings.jsonData
 * 5. NextAuth 的 users/accounts/sessions/verificationTokens 由 @auth/drizzle-adapter 用
 */

import {
  pgTable,
  text,
  serial,
  integer,
  bigint,
  doublePrecision,
  boolean,
  timestamp,
  jsonb,
  primaryKey,
  uniqueIndex,
  index,
} from 'drizzle-orm/pg-core';

// ── NextAuth Tables ──────────────────────────────────
// @auth/drizzle-adapter 要求這四張 table 的 schema

export const users = pgTable('users', {
  id: text('id')
    .primaryKey()
    .$defaultFn(() => crypto.randomUUID()),
  name: text('name'),
  email: text('email').notNull().unique(),
  emailVerified: timestamp('emailVerified', { mode: 'date' }),
  image: text('image'),
  createdAt: timestamp('createdAt', { mode: 'date' }).notNull().defaultNow(),
});

export const accounts = pgTable(
  'accounts',
  {
    userId: text('userId')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    type: text('type').notNull(),
    provider: text('provider').notNull(),
    providerAccountId: text('providerAccountId').notNull(),
    refresh_token: text('refresh_token'),
    access_token: text('access_token'),
    expires_at: integer('expires_at'),
    token_type: text('token_type'),
    scope: text('scope'),
    id_token: text('id_token'),
    session_state: text('session_state'),
  },
  (account) => ({
    pk: primaryKey({ columns: [account.provider, account.providerAccountId] }),
  }),
);

export const sessions = pgTable('sessions', {
  sessionToken: text('sessionToken').primaryKey(),
  userId: text('userId')
    .notNull()
    .references(() => users.id, { onDelete: 'cascade' }),
  expires: timestamp('expires', { mode: 'date' }).notNull(),
});

export const verificationTokens = pgTable(
  'verificationTokens',
  {
    identifier: text('identifier').notNull(),
    token: text('token').notNull(),
    expires: timestamp('expires', { mode: 'date' }).notNull(),
  },
  (vt) => ({
    pk: primaryKey({ columns: [vt.identifier, vt.token] }),
  }),
);

// ── User-level Settings（JSON blob，未來新設定不動 schema） ─────
// 存：claudeModel、geminiModel、reserveCash、radarScorePreset、
//     brokerageFeeRate/transactionTaxRate 覆寫、cacheTtlSeconds 等
export const userSettings = pgTable('user_settings', {
  userId: text('user_id')
    .primaryKey()
    .references(() => users.id, { onDelete: 'cascade' }),
  jsonData: jsonb('json_data').notNull().default({}),
  updatedAt: timestamp('updated_at', { mode: 'date' }).notNull().defaultNow(),
});

// ── 使用者關注的股票（per-user）─────────────────────────
export const stocks = pgTable(
  'stocks',
  {
    userId: text('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    code: text('code').notNull(),
    name: text('name').notNull(),
    market: text('market').notNull(), // 'TWSE' | 'OTC' | 'ETF'
    currency: text('currency').notNull().default('TWD'),
    createdAt: timestamp('created_at', { mode: 'date' }).notNull().defaultNow(),
  },
  (t) => ({
    pk: primaryKey({ columns: [t.userId, t.code] }),
  }),
);

// ── 交易紀錄 ──────────────────────────────────────────
export const transactions = pgTable(
  'transactions',
  {
    id: serial('id').primaryKey(),
    userId: text('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    stockCode: text('stock_code').notNull(),
    type: text('type').notNull(), // 'BUY' | 'SELL' | 'DIVIDEND'
    date: text('date').notNull(), // YYYY-MM-DD
    shares: doublePrecision('shares').notNull(),
    pricePerShare: doublePrecision('price_per_share').notNull(),
    brokerageFee: doublePrecision('brokerage_fee').notNull().default(0),
    transactionTax: doublePrecision('transaction_tax').notNull().default(0),
    netAmount: doublePrecision('net_amount').notNull(),
    notes: text('notes'),
    createdAt: timestamp('created_at', { mode: 'date' }).notNull().defaultNow(),
  },
  (t) => ({
    stockDateIdx: index('txn_stock_date_idx').on(t.userId, t.stockCode, t.date),
    typeIdx: index('txn_type_idx').on(t.userId, t.type),
  }),
);

// ── FIFO 買入批次 ───────────────────────────────────────
export const fifoLots = pgTable(
  'fifo_lots',
  {
    id: serial('id').primaryKey(),
    userId: text('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    transactionId: integer('transaction_id')
      .notNull()
      .references(() => transactions.id, { onDelete: 'cascade' }),
    stockCode: text('stock_code').notNull(),
    purchaseDate: text('purchase_date').notNull(),
    originalShares: doublePrecision('original_shares').notNull(),
    remainingShares: doublePrecision('remaining_shares').notNull(),
    costPerShare: doublePrecision('cost_per_share').notNull(),
    createdAt: timestamp('created_at', { mode: 'date' }).notNull().defaultNow(),
  },
  (t) => ({
    stockIdx: index('lot_stock_idx').on(t.userId, t.stockCode, t.purchaseDate),
  }),
);

// ── 已實現損益 ───────────────────────────────────────
export const realizedPnl = pgTable(
  'realized_pnl',
  {
    id: serial('id').primaryKey(),
    userId: text('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    sellTxnId: integer('sell_txn_id')
      .notNull()
      .references(() => transactions.id, { onDelete: 'cascade' }),
    lotId: integer('lot_id')
      .notNull()
      .references(() => fifoLots.id),
    stockCode: text('stock_code').notNull(),
    sellDate: text('sell_date').notNull(),
    sharesSold: doublePrecision('shares_sold').notNull(),
    costPerShare: doublePrecision('cost_per_share').notNull(),
    sellPrice: doublePrecision('sell_price').notNull(),
    grossProfit: doublePrecision('gross_profit').notNull(),
    brokerageFee: doublePrecision('brokerage_fee').notNull(),
    transactionTax: doublePrecision('transaction_tax').notNull(),
    netProfit: doublePrecision('net_profit').notNull(),
  },
  (t) => ({
    stockDateIdx: index('rpnl_stock_idx').on(t.userId, t.stockCode, t.sellDate),
  }),
);

// ── 即時報價快取（per-user；避免 A 手動 refresh 影響 B）─────
export const priceCache = pgTable(
  'price_cache',
  {
    userId: text('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    stockCode: text('stock_code').notNull(),
    provider: text('provider').notNull().default('yahoo'),
    price: doublePrecision('price').notNull(),
    changeAbs: doublePrecision('change_abs'),
    changePct: doublePrecision('change_pct'),
    volume: bigint('volume', { mode: 'number' }),
    fetchedAt: timestamp('fetched_at', { mode: 'date' }).notNull(),
  },
  (t) => ({
    pk: primaryKey({ columns: [t.userId, t.stockCode] }),
  }),
);

// ── 雷達股清單 ──────────────────────────────────────────
export const radarStocks = pgTable('radar_stocks', {
  id: serial('id').primaryKey(),
  userId: text('user_id')
    .notNull()
    .references(() => users.id, { onDelete: 'cascade' }),
  stockCode: text('stock_code').notNull(),
  stockName: text('stock_name').notNull(),
  market: text('market').notNull().default('TWSE'),
  buyAt: doublePrecision('buy_at'),
  stopLoss: doublePrecision('stop_loss'),
  targetShares: integer('target_shares'),
  note: text('note'),
  remark: text('remark'),
  isHolding: boolean('is_holding').notNull().default(false),
  sortOrder: integer('sort_order').notNull().default(0),
  createdAt: timestamp('created_at', { mode: 'date' }).notNull().defaultNow(),
});

// ── 法人單日 cache ─────────────────────────────────────
export const radarInstCache = pgTable(
  'radar_inst_cache',
  {
    userId: text('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    stockCode: text('stock_code').notNull(),
    date: text('date').notNull(),
    foreignNet: bigint('foreign_net', { mode: 'number' }).notNull().default(0),
    trustNet: bigint('trust_net', { mode: 'number' }).notNull().default(0),
    dealerNet: bigint('dealer_net', { mode: 'number' }).notNull().default(0),
    totalNet: bigint('total_net', { mode: 'number' }).notNull().default(0),
    fetchedAt: timestamp('fetched_at', { mode: 'date' }).notNull().defaultNow(),
  },
  (t) => ({
    pk: primaryKey({ columns: [t.userId, t.stockCode] }),
  }),
);

// ── 法人歷史（給 trend/backtest 用） ────────────────────
export const radarInstHistory = pgTable(
  'radar_inst_history',
  {
    userId: text('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    stockCode: text('stock_code').notNull(),
    date: text('date').notNull(),
    foreignNet: bigint('foreign_net', { mode: 'number' }).notNull().default(0),
    trustNet: bigint('trust_net', { mode: 'number' }).notNull().default(0),
    dealerNet: bigint('dealer_net', { mode: 'number' }).notNull().default(0),
    totalNet: bigint('total_net', { mode: 'number' }).notNull().default(0),
  },
  (t) => ({
    pk: primaryKey({ columns: [t.userId, t.stockCode, t.date] }),
    stockDateIdx: index('inst_hist_stock_date_idx').on(t.userId, t.stockCode, t.date),
  }),
);

// ── 融資融券 cache ─────────────────────────────────────
export const radarMarginCache = pgTable(
  'radar_margin_cache',
  {
    userId: text('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    stockCode: text('stock_code').notNull(),
    date: text('date').notNull(),
    marginBalance: bigint('margin_balance', { mode: 'number' }).notNull().default(0),
    marginChange: bigint('margin_change', { mode: 'number' }).notNull().default(0),
    shortBalance: bigint('short_balance', { mode: 'number' }).notNull().default(0),
    shortChange: bigint('short_change', { mode: 'number' }).notNull().default(0),
    fetchedAt: timestamp('fetched_at', { mode: 'date' }).notNull().defaultNow(),
  },
  (t) => ({
    pk: primaryKey({ columns: [t.userId, t.stockCode] }),
  }),
);

// ── 基本面（P/E, EPS, 殖利率）7 日 TTL ────────────────
export const radarFundamentalCache = pgTable(
  'radar_fundamental_cache',
  {
    userId: text('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    stockCode: text('stock_code').notNull(),
    pe: doublePrecision('pe'),
    eps: doublePrecision('eps'),
    dividendYield: doublePrecision('dividend_yield'),
    marketCap: doublePrecision('market_cap'),
    fetchedAt: timestamp('fetched_at', { mode: 'date' }).notNull().defaultNow(),
  },
  (t) => ({
    pk: primaryKey({ columns: [t.userId, t.stockCode] }),
  }),
);

// ── 回測結果（法人訊號真實勝率）24 小時 TTL ────────────
export const radarBacktestCache = pgTable(
  'radar_backtest_cache',
  {
    userId: text('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    stockCode: text('stock_code').notNull(),
    greenSignalCount: integer('green_signal_count').notNull().default(0),
    greenWinRate5d: doublePrecision('green_win_rate_5d'),
    greenAvgReturn5d: doublePrecision('green_avg_return_5d'),
    greenWinRate10d: doublePrecision('green_win_rate_10d'),
    greenAvgReturn10d: doublePrecision('green_avg_return_10d'),
    fetchedAt: timestamp('fetched_at', { mode: 'date' }).notNull().defaultNow(),
  },
  (t) => ({
    pk: primaryKey({ columns: [t.userId, t.stockCode] }),
  }),
);

// ── AI 過往建議紀錄（讓 AI 自我對帳） ────────────────
export const aiRecommendations = pgTable(
  'ai_recommendations',
  {
    id: serial('id').primaryKey(),
    userId: text('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    stockCode: text('stock_code').notNull(),
    mode: text('mode').notNull(), // 'premarket' | 'intraday' | 'postclose'
    provider: text('provider').notNull(), // 'claude' | 'gemini'
    buyAt: doublePrecision('buy_at'),
    stopLoss: doublePrecision('stop_loss'),
    targetShares: integer('target_shares'),
    confidence: integer('confidence'),
    note: text('note'),
    priceAtRec: doublePrecision('price_at_rec'),
    recommendedAt: timestamp('recommended_at', { mode: 'date' })
      .notNull()
      .defaultNow(),
  },
  (t) => ({
    dateIdx: index('ai_rec_date_idx').on(t.userId, t.recommendedAt),
    stockIdx: index('ai_rec_stock_idx').on(t.userId, t.stockCode, t.recommendedAt),
  }),
);
