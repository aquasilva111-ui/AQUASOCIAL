import pg from 'pg';
import { migrateEcosystem } from './store.ts';
if (!process.env.DATABASE_URL)
  throw new Error('Defina DATABASE_URL para aplicar as migrations');
const pool = new pg.Pool({ connectionString: process.env.DATABASE_URL });
try {
  await migrateEcosystem(pool);
  console.log('Migration 001_ecosystem aplicada');
} finally {
  await pool.end();
}
