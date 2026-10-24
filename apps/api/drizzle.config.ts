import type { Config } from 'drizzle-kit';

/** Migrations are plain SQL under ./drizzle, generated from src/schema.ts. */
export default {
  schema: './src/schema.ts',
  out: './drizzle',
  dialect: 'sqlite',
  dbCredentials: { url: (process.env.DATABASE_URL ?? 'file:./aura.db').replace(/^file:/, '') },
  strict: true,
  verbose: true
} satisfies Config;
