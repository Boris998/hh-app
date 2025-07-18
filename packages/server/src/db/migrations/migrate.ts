import 'dotenv/config';
import { Pool } from 'pg';
import { drizzle } from 'drizzle-orm/node-postgres';
import { migrate } from 'drizzle-orm/node-postgres/migrator';

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  max: 1, 
});

const db = drizzle(pool);

async function main() {
  console.log('⏳ Running migrations...');
  try {
    await migrate(db, {
      migrationsFolder: './drizzle/migrations',
    });
    console.log('✅ Migrations completed');
  } catch (err) {
    console.error('❌ Migration failed:', err);
    process.exit(1);
  } finally {
    await pool.end();
  }
}

main();

// packages/server/src/db/migrate.ts
/* import { migrate } from 'drizzle-orm/postgres-js/migrator';
import { resolve } from 'node:path';
import { db } from '..';

await migrate(db, {
  migrationsFolder: resolve(__dirname, '../migrations'),
}); */