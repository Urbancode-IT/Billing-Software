/**
 * Database client: embedded PGlite (default) or external PostgreSQL via DATABASE_URL.
 *
 *   DATABASE_URL=postgres://user:pass@localhost:5432/freegst   → real Postgres
 *   (unset)                                                    → PGlite under data/pglite
 */
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const SCHEMA = fs.readFileSync(
  path.join(path.dirname(fileURLToPath(import.meta.url)), 'schema.sql'),
  'utf8',
);

/**
 * @param {{ dataDir: string }} opts
 * @returns {Promise<{ kind: 'pglite'|'postgres', query: Function, exec: Function, close: Function }>}
 */
export async function openDatabase({ dataDir }) {
  const url = String(process.env.DATABASE_URL || '').trim();

  if (url) {
    const pg = await import('pg');
    const pool = new pg.default.Pool({ connectionString: url });
    const client = await pool.connect();
    try {
      await client.query(SCHEMA);
    } finally {
      client.release();
    }
    console.log('  Database: PostgreSQL (DATABASE_URL)');
    return {
      kind: 'postgres',
      query: (text, params) => pool.query(text, params),
      exec: (text) => pool.query(text),
      close: () => pool.end(),
    };
  }

  const { PGlite } = await import('@electric-sql/pglite');
  const pgDir = path.join(dataDir, 'pglite');
  fs.mkdirSync(pgDir, { recursive: true });
  const db = new PGlite(pgDir);
  await db.waitReady;
  await db.exec(SCHEMA);
  console.log(`  Database: PostgreSQL (PGlite) → ${pgDir}`);
  return {
    kind: 'pglite',
    query: (text, params) => db.query(text, params),
    exec: (text) => db.exec(text),
    close: () => db.close(),
  };
}
