import type { Config } from 'drizzle-kit';
import { config } from 'dotenv';

// drizzle-kit 直接跑 node，不會用 Next.js 的 env 讀取邏輯，
// 所以手動指定 .env.local
config({ path: '.env.local' });

export default {
  schema: './lib/db/schema.ts',
  out: './lib/db/migrations',
  dialect: 'postgresql',
  dbCredentials: {
    url: process.env.DATABASE_URL!,
  },
  verbose: true,
  strict: true,
} satisfies Config;
