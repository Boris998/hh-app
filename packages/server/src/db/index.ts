// packages/server/src/db/index.ts
import { drizzle } from 'drizzle-orm/postgres-js';
import postgres from 'postgres';
import { Resource } from 'sst';
import * as schema from './schema.js';

const connectionString = Resource.DatabaseUrl.value;
const client = postgres(connectionString);

export const db = drizzle(client, { schema });
export type Database = typeof db;