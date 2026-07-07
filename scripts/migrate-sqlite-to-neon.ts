/**
 * 一次性遷移腳本:本機 Electron SQLite → Neon Postgres
 *
 * 用法:
 *   USER_ID=<你的 UUID> \
 *   SQLITE_PATH="/Users/Steven/Library/Application Support/stock-tracker/stock-tracker.db" \
 *   DATABASE_URL="postgresql://..." \
 *   npx tsx scripts/migrate-sqlite-to-neon.ts
 *
 * 特性:
 * - 整個遷移包在 transaction 裡,失敗全 rollback
 * - 大表用 multi-value bulk insert(chunk=500),避免 82k 行一列一次來回
 * - radar cache 只搬「跟你 radar_stocks 相關的股票」— 全市場 26k 行沒必要搬
 * - 保留原本 auto-increment ID + SETVAL
 */
import { DatabaseSync } from 'node:sqlite';
import { Client } from 'pg';
import { config } from 'dotenv';

config({ path: '.env.local' });

const USER_ID = process.env.USER_ID;
const SQLITE_PATH = process.env.SQLITE_PATH;
const DATABASE_URL = process.env.DATABASE_URL;
const CHUNK_SIZE = 500;

if (!USER_ID || !SQLITE_PATH || !DATABASE_URL) {
  console.error('缺少環境變數:USER_ID / SQLITE_PATH / DATABASE_URL');
  process.exit(1);
}

function toDate(s: string | null | undefined): Date | null {
  if (!s) return null;
  return new Date(s + (s.includes('T') ? '' : 'Z'));
}

/**
 * Bulk INSERT — 一次塞 CHUNK_SIZE 列
 *
 * @param cols column names,例:['user_id', 'stock_code', 'date', ...]
 * @param rows 每列的值陣列(按 cols 順序)
 */
async function bulkInsert(
  pg: Client,
  table: string,
  cols: string[],
  rows: unknown[][],
): Promise<void> {
  if (rows.length === 0) return;

  const colNames = cols.map((c) => `"${c}"`).join(', ');
  for (let i = 0; i < rows.length; i += CHUNK_SIZE) {
    const chunk = rows.slice(i, i + CHUNK_SIZE);
    const placeholders = chunk
      .map((_, rowIdx) => {
        const start = rowIdx * cols.length + 1;
        return `(${cols.map((_, j) => `$${start + j}`).join(', ')})`;
      })
      .join(', ');
    const flat = chunk.flat();
    await pg.query(
      `INSERT INTO ${table} (${colNames}) VALUES ${placeholders}`,
      flat,
    );
  }
}

async function main() {
  console.log('讀取 SQLite:', SQLITE_PATH);
  const sqlite = new DatabaseSync(SQLITE_PATH!);
  console.log('連線 Neon...');
  const pg = new Client({ connectionString: DATABASE_URL });
  await pg.connect();

  try {
    await pg.query('BEGIN');
    console.log('BEGIN transaction');

    // ── 0. 清舊資料 ──
    const cleanupTables = [
      'ai_recommendations',
      'realized_pnl',
      'fifo_lots',
      'transactions',
      'price_cache',
      'radar_backtest_cache',
      'radar_fundamental_cache',
      'radar_margin_cache',
      'radar_inst_history',
      'radar_inst_cache',
      'radar_stocks',
      'stocks',
    ];
    for (const t of cleanupTables) {
      await pg.query(`DELETE FROM ${t} WHERE user_id = $1`, [USER_ID]);
    }
    console.log('清掉舊資料(同 user)');

    // ── 1. stocks ──
    interface StockRow { code: string; name: string; market: string; currency: string; created_at: string; }
    const stockRows = sqlite.prepare('SELECT * FROM stocks').all() as unknown as StockRow[];
    await bulkInsert(
      pg,
      'stocks',
      ['user_id', 'code', 'name', 'market', 'currency', 'created_at'],
      stockRows.map((r) => [USER_ID, r.code, r.name, r.market, r.currency ?? 'TWD', toDate(r.created_at)]),
    );
    console.log(`  stocks: ${stockRows.length}`);

    // ── 2. transactions ──
    interface TxnRow {
      id: number; stock_code: string; type: string; date: string;
      shares: number; price_per_share: number; brokerage_fee: number;
      transaction_tax: number; net_amount: number; notes: string | null; created_at: string;
    }
    const txnRows = sqlite.prepare('SELECT * FROM transactions').all() as unknown as TxnRow[];
    await bulkInsert(
      pg,
      'transactions',
      ['id', 'user_id', 'stock_code', 'type', 'date', 'shares', 'price_per_share', 'brokerage_fee', 'transaction_tax', 'net_amount', 'notes', 'created_at'],
      txnRows.map((r) => [
        r.id, USER_ID, r.stock_code, r.type, r.date,
        r.shares, r.price_per_share, r.brokerage_fee, r.transaction_tax,
        r.net_amount, r.notes, toDate(r.created_at),
      ]),
    );
    console.log(`  transactions: ${txnRows.length}`);
    if (txnRows.length > 0) await pg.query(`SELECT setval('transactions_id_seq', (SELECT MAX(id) FROM transactions))`);

    // ── 3. fifo_lots ──
    interface LotRow { id: number; transaction_id: number; stock_code: string; purchase_date: string; original_shares: number; remaining_shares: number; cost_per_share: number; created_at: string; }
    const lotRows = sqlite.prepare('SELECT * FROM fifo_lots').all() as unknown as LotRow[];
    await bulkInsert(
      pg,
      'fifo_lots',
      ['id', 'user_id', 'transaction_id', 'stock_code', 'purchase_date', 'original_shares', 'remaining_shares', 'cost_per_share', 'created_at'],
      lotRows.map((r) => [r.id, USER_ID, r.transaction_id, r.stock_code, r.purchase_date, r.original_shares, r.remaining_shares, r.cost_per_share, toDate(r.created_at)]),
    );
    console.log(`  fifo_lots: ${lotRows.length}`);
    if (lotRows.length > 0) await pg.query(`SELECT setval('fifo_lots_id_seq', (SELECT MAX(id) FROM fifo_lots))`);

    // ── 4. realized_pnl ──
    interface PnlRow { id: number; sell_txn_id: number; lot_id: number; stock_code: string; sell_date: string; shares_sold: number; cost_per_share: number; sell_price: number; gross_profit: number; brokerage_fee: number; transaction_tax: number; net_profit: number; }
    const rpnlRows = sqlite.prepare('SELECT * FROM realized_pnl').all() as unknown as PnlRow[];
    await bulkInsert(
      pg,
      'realized_pnl',
      ['id', 'user_id', 'sell_txn_id', 'lot_id', 'stock_code', 'sell_date', 'shares_sold', 'cost_per_share', 'sell_price', 'gross_profit', 'brokerage_fee', 'transaction_tax', 'net_profit'],
      rpnlRows.map((r) => [r.id, USER_ID, r.sell_txn_id, r.lot_id, r.stock_code, r.sell_date, r.shares_sold, r.cost_per_share, r.sell_price, r.gross_profit, r.brokerage_fee, r.transaction_tax, r.net_profit]),
    );
    console.log(`  realized_pnl: ${rpnlRows.length}`);
    if (rpnlRows.length > 0) await pg.query(`SELECT setval('realized_pnl_id_seq', (SELECT MAX(id) FROM realized_pnl))`);

    // ── 5. price_cache ──
    interface PriceRow { stock_code: string; provider: string; price: number; change_abs: number | null; change_pct: number | null; volume: number | null; fetched_at: string; }
    const priceRows = sqlite.prepare('SELECT * FROM price_cache').all() as unknown as PriceRow[];
    await bulkInsert(
      pg,
      'price_cache',
      ['user_id', 'stock_code', 'provider', 'price', 'change_abs', 'change_pct', 'volume', 'fetched_at'],
      priceRows.map((r) => [USER_ID, r.stock_code, r.provider ?? 'yahoo', r.price, r.change_abs, r.change_pct, r.volume, toDate(r.fetched_at)]),
    );
    console.log(`  price_cache: ${priceRows.length}`);

    // ── 6. radar_stocks ──
    interface RadarRow { id: number; stock_code: string; stock_name: string; market: string; buy_at: number | null; stop_loss: number | null; target_shares: number | null; note: string | null; remark: string | null; is_holding: number; sort_order: number; created_at: string; }
    const radarRows = sqlite.prepare('SELECT * FROM radar_stocks').all() as unknown as RadarRow[];
    await bulkInsert(
      pg,
      'radar_stocks',
      ['id', 'user_id', 'stock_code', 'stock_name', 'market', 'buy_at', 'stop_loss', 'target_shares', 'note', 'remark', 'is_holding', 'sort_order', 'created_at'],
      radarRows.map((r) => [r.id, USER_ID, r.stock_code, r.stock_name, r.market ?? 'TWSE', r.buy_at, r.stop_loss, r.target_shares, r.note, r.remark, Boolean(r.is_holding), r.sort_order ?? 0, toDate(r.created_at)]),
    );
    console.log(`  radar_stocks: ${radarRows.length}`);
    if (radarRows.length > 0) await pg.query(`SELECT setval('radar_stocks_id_seq', (SELECT MAX(id) FROM radar_stocks))`);

    // 只搬與 radar_stocks 相關的 cache 資料(關鍵優化 — 全市場 26k 行沒必要搬)
    const radarCodes = new Set(radarRows.map((r) => r.stock_code));
    const codesArr = [...radarCodes];
    console.log(`  → 過濾 cache 資料範圍到 ${codesArr.length} 支雷達股`);
    if (codesArr.length === 0) {
      console.log('  ⚠ 無雷達股,cache/history 全部跳過');
      await pg.query('COMMIT');
      console.log('\n✓ 遷移完成(部分)');
      return;
    }
    const placeholders = codesArr.map((_, i) => `?`).join(',');
    const filterFn = <T extends { stock_code: string }>(rows: T[]) => rows.filter((r) => radarCodes.has(r.stock_code));

    // ── 7. radar_inst_cache ──
    interface InstCacheRow { stock_code: string; date: string; foreign_net: number; trust_net: number; dealer_net: number; total_net: number; fetched_at: string; }
    const instCacheAll = sqlite.prepare('SELECT * FROM radar_inst_cache').all() as unknown as InstCacheRow[];
    const instCacheFiltered = filterFn(instCacheAll);
    await bulkInsert(
      pg,
      'radar_inst_cache',
      ['user_id', 'stock_code', 'date', 'foreign_net', 'trust_net', 'dealer_net', 'total_net', 'fetched_at'],
      instCacheFiltered.map((r) => [USER_ID, r.stock_code, r.date, r.foreign_net ?? 0, r.trust_net ?? 0, r.dealer_net ?? 0, r.total_net ?? 0, toDate(r.fetched_at)]),
    );
    console.log(`  radar_inst_cache: ${instCacheFiltered.length} (from ${instCacheAll.length})`);

    // ── 8. radar_inst_history ──
    interface InstHistRow { stock_code: string; date: string; foreign_net: number; trust_net: number; dealer_net: number; total_net: number; }
    const instHistAll = sqlite.prepare('SELECT * FROM radar_inst_history').all() as unknown as InstHistRow[];
    const instHistFiltered = filterFn(instHistAll);
    await bulkInsert(
      pg,
      'radar_inst_history',
      ['user_id', 'stock_code', 'date', 'foreign_net', 'trust_net', 'dealer_net', 'total_net'],
      instHistFiltered.map((r) => [USER_ID, r.stock_code, r.date, r.foreign_net ?? 0, r.trust_net ?? 0, r.dealer_net ?? 0, r.total_net ?? 0]),
    );
    console.log(`  radar_inst_history: ${instHistFiltered.length} (from ${instHistAll.length})`);

    // ── 9. radar_margin_cache ──
    interface MarginRow { stock_code: string; date: string; margin_balance: number; margin_change: number; short_balance: number; short_change: number; fetched_at: string; }
    const marginAll = sqlite.prepare('SELECT * FROM radar_margin_cache').all() as unknown as MarginRow[];
    const marginFiltered = filterFn(marginAll);
    await bulkInsert(
      pg,
      'radar_margin_cache',
      ['user_id', 'stock_code', 'date', 'margin_balance', 'margin_change', 'short_balance', 'short_change', 'fetched_at'],
      marginFiltered.map((r) => [USER_ID, r.stock_code, r.date, r.margin_balance ?? 0, r.margin_change ?? 0, r.short_balance ?? 0, r.short_change ?? 0, toDate(r.fetched_at)]),
    );
    console.log(`  radar_margin_cache: ${marginFiltered.length} (from ${marginAll.length})`);

    // ── 10. radar_fundamental_cache ──
    interface FundRow { stock_code: string; pe: number | null; eps: number | null; dividend_yield: number | null; market_cap: number | null; fetched_at: string; }
    const fundAll = sqlite.prepare('SELECT * FROM radar_fundamental_cache').all() as unknown as FundRow[];
    const fundFiltered = filterFn(fundAll);
    await bulkInsert(
      pg,
      'radar_fundamental_cache',
      ['user_id', 'stock_code', 'pe', 'eps', 'dividend_yield', 'market_cap', 'fetched_at'],
      fundFiltered.map((r) => [USER_ID, r.stock_code, r.pe, r.eps, r.dividend_yield, r.market_cap, toDate(r.fetched_at)]),
    );
    console.log(`  radar_fundamental_cache: ${fundFiltered.length}`);

    // ── 11. radar_backtest_cache ──
    interface BkRow { stock_code: string; green_signal_count: number; green_win_rate_5d: number | null; green_avg_return_5d: number | null; green_win_rate_10d: number | null; green_avg_return_10d: number | null; fetched_at: string; }
    const bkAll = sqlite.prepare('SELECT * FROM radar_backtest_cache').all() as unknown as BkRow[];
    const bkFiltered = filterFn(bkAll);
    await bulkInsert(
      pg,
      'radar_backtest_cache',
      ['user_id', 'stock_code', 'green_signal_count', 'green_win_rate_5d', 'green_avg_return_5d', 'green_win_rate_10d', 'green_avg_return_10d', 'fetched_at'],
      bkFiltered.map((r) => [USER_ID, r.stock_code, r.green_signal_count ?? 0, r.green_win_rate_5d, r.green_avg_return_5d, r.green_win_rate_10d, r.green_avg_return_10d, toDate(r.fetched_at)]),
    );
    console.log(`  radar_backtest_cache: ${bkFiltered.length}`);

    // ── 12. ai_recommendations ──
    interface AiRow { id: number; stock_code: string; mode: string; provider: string; buy_at: number | null; stop_loss: number | null; target_shares: number | null; confidence: number | null; note: string | null; price_at_rec: number | null; recommended_at: string; }
    const aiRows = sqlite.prepare('SELECT * FROM ai_recommendations').all() as unknown as AiRow[];
    await bulkInsert(
      pg,
      'ai_recommendations',
      ['id', 'user_id', 'stock_code', 'mode', 'provider', 'buy_at', 'stop_loss', 'target_shares', 'confidence', 'note', 'price_at_rec', 'recommended_at'],
      aiRows.map((r) => [r.id, USER_ID, r.stock_code, r.mode, r.provider, r.buy_at, r.stop_loss, r.target_shares, r.confidence, r.note, r.price_at_rec, toDate(r.recommended_at)]),
    );
    console.log(`  ai_recommendations: ${aiRows.length}`);
    if (aiRows.length > 0) await pg.query(`SELECT setval('ai_recommendations_id_seq', (SELECT MAX(id) FROM ai_recommendations))`);

    await pg.query('COMMIT');
    console.log('\n✓ 遷移完成,全部 tables 已 COMMIT');
  } catch (err) {
    await pg.query('ROLLBACK');
    console.error('\n✗ 錯誤,ROLLBACK:', err);
    throw err;
  } finally {
    await pg.end();
    sqlite.close();
  }
}

main().catch(() => process.exit(1));
