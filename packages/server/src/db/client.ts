// src/db/client.ts - Updated with environment loading
import 'dotenv/config'; // Load environment variables
import { drizzle } from 'drizzle-orm/postgres-js';
import postgres from 'postgres';
import * as schema from './schema.js';

const connectionString = process.env.DATABASE_URL;

if (!connectionString) {
  throw new Error('DATABASE_URL environment variable is not set');
}

console.log('🔗 Connecting to database:', connectionString.substring(0, 30) + '...');

const client = postgres(connectionString);

export const db = drizzle(client, { schema });
export type Database = typeof db;