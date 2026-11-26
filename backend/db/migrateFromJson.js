/**
 * One-shot import: backend/data JSON files into PostgreSQL documents table.
 * Skips pglite/, backups/, and non-document files (port.txt, locks, logs).
 */
import fs from 'fs';
import path from 'path';

const SKIP_DIRS = new Set(['pglite', 'backups', 'edit-history', 'Saved Invoices', 'trash']);

/**
 * @param {{ dataDir: string, query: Function }} opts
 * @returns {Promise<number>} rows upserted
 */
export async function migrateJsonIntoPostgres({ dataDir, query }) {
  let count = 0;

  async function upsert(collection, id, data) {
    await query(
      `INSERT INTO documents (collection, id, data, updated_at)
       VALUES ($1, $2, $3::jsonb, NOW())
       ON CONFLICT (collection, id)
       DO UPDATE SET data = EXCLUDED.data, updated_at = NOW()`,
      [collection, id, JSON.stringify(data)],
    );
    count += 1;
  }

  // Root JSON files: profile.json, meta.json, local-prefs.json, …
  for (const name of fs.readdirSync(dataDir)) {
    const full = path.join(dataDir, name);
    const st = fs.statSync(full);
    if (st.isFile() && name.endsWith('.json')) {
      try {
        const data = JSON.parse(fs.readFileSync(full, 'utf8').replace(/^\uFEFF/, ''));
        if (data && typeof data === 'object' && !Array.isArray(data)) {
          await upsert('_root', name.replace(/\.json$/i, ''), data);
        }
      } catch { /* skip damaged */ }
      continue;
    }
    if (!st.isDirectory() || SKIP_DIRS.has(name)) continue;

    for (const file of fs.readdirSync(full)) {
      if (!file.endsWith('.json')) continue;
      const fp = path.join(full, file);
      try {
        const data = JSON.parse(fs.readFileSync(fp, 'utf8').replace(/^\uFEFF/, ''));
        if (data && typeof data === 'object' && !Array.isArray(data)) {
          await upsert(name, file.replace(/\.json$/i, ''), data);
        }
      } catch { /* skip damaged */ }
    }
  }

  return count;
}
