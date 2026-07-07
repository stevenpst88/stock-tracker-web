import { neon } from '@neondatabase/serverless';
import { drizzle } from 'drizzle-orm/neon-http';
import * as schema from './schema';

if (!process.env.DATABASE_URL) {
  throw new Error(
    'DATABASE_URL 未設定。請把 Neon 的 connection string 放進 .env.local。',
  );
}

// Neon HTTP driver：serverless-friendly、無連線池、每 query 一個 request
const sql = neon(process.env.DATABASE_URL);
export const db = drizzle(sql, { schema });
export * from './schema';
