/**
 * PostgreSQL-backed store with the same sync API as services/store.js
 * (readAllFromDir / readJSON / writeJSON / deleteFile).
 *
 * Reads + writes hit an in-memory cache synchronously; every mutation is
 * also queued to PostgreSQL so Express route handlers stay unchanged.
 */
import path from 'path';
import { openDatabase } from '../db/client.js';
import { migrateJsonIntoPostgres } from '../db/migrateFromJson.js';

function stripJson(name) {
  return name.endsWith('.json') ? name.slice(0, -5) : name;
}

/**
 * Map an absolute JSON path under dataDir → { collection, id }.
 *   data/clients/cli_1.json  → { collection: 'clients', id: 'cli_1' }
 *   data/profile.json        → { collection: '_root', id: 'profile' }
 */
export function pathToDoc(dataDir, filePath) {
  const rel = path.relative(dataDir, path.resolve(filePath)).replace(/\\/g, '/');
  if (!rel || rel.startsWith('..')) return null;
  const parts = rel.split('/');
  if (parts.length === 1) {
    return { collection: '_root', id: stripJson(parts[0]) };
  }
  if (parts.length === 2 && parts[1].endsWith('.json')) {
    return { collection: parts[0], id: stripJson(parts[1]) };
  }
  return null;
}

/**
 * @param {{ dataDir: string, dirs: string[], logFatal?: Function }} opts
 */
export async function createPgStore({ dataDir, dirs, logFatal = () => {} }) {
  const db = await openDatabase({ dataDir });
  /** @type {Map<string, Map<string, object>>} */
  const cache = new Map();
  const writeQueue = [];
  let draining = false;

  function colMap(collection) {
    if (!cache.has(collection)) cache.set(collection, new Map());
    return cache.get(collection);
  }

  // First boot: import legacy JSON files if the DB is empty.
  {
    const existing = await db.query('SELECT COUNT(*)::int AS n FROM documents');
    const raw = existing.rows?.[0]?.n ?? existing.rows?.[0]?.count ?? 0;
    const count = typeof raw === 'string' ? parseInt(raw, 10) : Number(raw) || 0;
    if (count === 0) {
      const imported = await migrateJsonIntoPostgres({ dataDir, query: db.query });
      if (imported > 0) console.log(`  Migrated ${imported} JSON record(s) → PostgreSQL`);
    }
  }

  // Load every document into memory once at startup.
  {
    const res = await db.query('SELECT collection, id, data FROM documents');
    const rows = res.rows || [];
    for (const row of rows) {
      const data = typeof row.data === 'string' ? JSON.parse(row.data) : row.data;
      colMap(row.collection).set(row.id, data);
    }
  }

  async function drain() {
    if (draining) return;
    draining = true;
    try {
      while (writeQueue.length) {
        const job = writeQueue.shift();
        try {
          if (job.type === 'upsert') {
            await db.query(
              `INSERT INTO documents (collection, id, data, updated_at)
               VALUES ($1, $2, $3::jsonb, NOW())
               ON CONFLICT (collection, id)
               DO UPDATE SET data = EXCLUDED.data, updated_at = NOW()`,
              [job.collection, job.id, JSON.stringify(job.data)],
            );
          } else if (job.type === 'delete') {
            await db.query(
              'DELETE FROM documents WHERE collection = $1 AND id = $2',
              [job.collection, job.id],
            );
          }
        } catch (err) {
          logFatal(`PostgreSQL write failed: ${err.message}`, 'db');
          console.error('  PostgreSQL write failed:', err.message);
        }
      }
    } finally {
      draining = false;
      if (writeQueue.length) void drain();
    }
  }

  function enqueue(job) {
    writeQueue.push(job);
    void drain();
  }

  function invalidateCache() { /* memory is source of truth; no TTL cache */ }

  function readAllFromDir(dir) {
    return [...(cache.get(dir)?.values() || [])];
  }

  function readJSON(filePath, fallback = null) {
    const key = pathToDoc(dataDir, filePath);
    if (!key) return fallback;
    const hit = cache.get(key.collection)?.get(key.id);
    return hit === undefined ? fallback : hit;
  }

  function writeJSON(filePath, data) {
    const key = pathToDoc(dataDir, filePath);
    if (!key) {
      logFatal(`pgStore: path outside data model: ${filePath}`, 'db');
      return;
    }
    colMap(key.collection).set(key.id, data);
    enqueue({ type: 'upsert', collection: key.collection, id: key.id, data });
  }

  function deleteFile(filePath) {
    const key = pathToDoc(dataDir, filePath);
    if (!key) return;
    cache.get(key.collection)?.delete(key.id);
    enqueue({ type: 'delete', collection: key.collection, id: key.id });
  }

  function writeFileAtomic(filePath, contents) {
    // Used for a few non-JSON paths historically; try parse as JSON document.
    try {
      writeJSON(filePath, JSON.parse(contents));
    } catch {
      logFatal(`pgStore: writeFileAtomic non-JSON ignored: ${filePath}`, 'db');
    }
  }

  async function flush() {
    while (writeQueue.length || draining) {
      await drain();
      if (writeQueue.length) await new Promise((r) => setTimeout(r, 10));
      else break;
    }
  }

  return {
    readAllFromDir,
    readJSON,
    writeJSON,
    deleteFile,
    invalidateCache,
    writeFileAtomic,
    flush,
    close: async () => {
      await flush();
      await db.close();
    },
    dbKind: db.kind,
  };
}
