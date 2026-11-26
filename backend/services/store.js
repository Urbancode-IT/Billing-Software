import fs from 'fs';
import path from 'path';

function writeFileAtomic(filePath, contents) {
  const tmp = filePath + '.tmp';
  fs.writeFileSync(tmp, contents, 'utf-8');
  fs.renameSync(tmp, filePath);
}

/**
 * JSON file store for data/<folder>/*.json with a short-lived directory cache.
 * @param {{ dataDir: string, dirs: string[], logFatal?: Function }} opts
 */
export function createStore({ dataDir, dirs, logFatal = () => {} }) {
  const dirCache = {};
  const DIR_CACHE_TTL_MS = 5000;
  const reportedDamaged = new Set();

  function invalidateCache(dir) { delete dirCache[dir]; }

  function reportDamagedFile(dir, file) {
    const key = `${dir}/${file}`;
    if (reportedDamaged.has(key)) return;
    reportedDamaged.add(key);
    const msg = `Skipped damaged file data/${key} (not valid JSON) - restore it from a backup`;
    console.warn(`  ${msg}`);
    logFatal(msg, 'data');
  }

  function readAllFromDir(dir) {
    const entry = dirCache[dir];
    if (entry && (Date.now() - entry.at) < DIR_CACHE_TTL_MS) return entry.value;
    const dirPath = path.join(dataDir, dir);
    if (!fs.existsSync(dirPath)) return [];
    const results = fs.readdirSync(dirPath)
      .filter((f) => f.endsWith('.json'))
      .map((f) => {
        try {
          const v = JSON.parse(fs.readFileSync(path.join(dirPath, f), 'utf-8').replace(/^\uFEFF/, ''));
          if (v && typeof v === 'object' && !Array.isArray(v)) return v;
        } catch { /* reported below */ }
        reportDamagedFile(dir, f);
        return null;
      })
      .filter(Boolean);
    dirCache[dir] = { at: Date.now(), value: results };
    return results;
  }

  function readJSON(filePath, fallback = null) {
    try {
      if (fs.existsSync(filePath)) return JSON.parse(fs.readFileSync(filePath, 'utf-8'));
    } catch { /* ignore */ }
    return fallback;
  }

  function writeJSON(filePath, data) {
    writeFileAtomic(filePath, JSON.stringify(data, null, 2));
    const parentDir = path.basename(path.dirname(filePath));
    if (dirs.includes(parentDir)) invalidateCache(parentDir);
  }

  function deleteFile(filePath) {
    if (fs.existsSync(filePath)) fs.unlinkSync(filePath);
    const parentDir = path.basename(path.dirname(filePath));
    if (dirs.includes(parentDir)) invalidateCache(parentDir);
  }

  return {
    readAllFromDir,
    readJSON,
    writeJSON,
    deleteFile,
    invalidateCache,
    writeFileAtomic,
  };
}
