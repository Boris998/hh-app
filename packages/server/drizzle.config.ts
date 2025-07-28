import { defineConfig } from 'drizzle-kit';
import * as dotenv from 'dotenv';

// Try loading from multiple locations
dotenv.config({ path: '.env' });
dotenv.config({ path: '../../.env' });

export default defineConfig({
  schema: './src/db/schema.ts',
  out: './drizzle/migrations', 
  dialect: 'postgresql',
  dbCredentials: {
    url: "postgresql://postgres.wdqcduhctvmdppjwngou:PUT_204_nocontent@aws-0-us-east-2.pooler.supabase.com:6543/postgres",
  },
  verbose: true,
  strict: true,
});