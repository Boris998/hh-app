import { defineConfig } from 'drizzle-kit';
import * as dotenv from 'dotenv';
import z from 'zod';

// Load environment variables
dotenv.config();

const envSchema = z.object({
  DB_USER: z.string(),
  DB_PASSWORD: z.string(),
  DB_NAME: z.string(),
  DB_HOST: z.string(),
  DB_PORT: z.string().transform(Number),
  DATABASE_URL: z.string().url(),
});

const env = envSchema.parse(process.env);

export default defineConfig({
  schema: './src/db/schema.ts',
  out: './drizzle',
  dialect: 'postgresql',
  dbCredentials: {
    url: process.env.DATABASE_URL!,
  },
  verbose: true,
  strict: true,
});

