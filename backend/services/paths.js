import path from 'path';

/** Safe filename from an id (no path separators). */
export function safeFileName(id) {
  return String(id).replace(/[/\\:*?"<>|]/g, '_');
}

/**
 * Path-traversal-safe user-string → single path segment.
 * Never returns an empty string; falls back to a sentinel.
 */
export function safePathSegment(input, fallback = 'Untitled') {
  if (input === undefined || input === null) return fallback;
  let s;
  try { s = decodeURIComponent(String(input)); } catch { s = String(input); }
  // eslint-disable-next-line no-control-regex -- stripping control characters is the point
  s = s.replace(/[<>:"/\\|?*\x00-\x1f]/g, '-');
  s = s.replace(/\.{2,}/g, '-');
  s = s.replace(/^[.\s]+|[.\s]+$/g, '');
  s = s.slice(0, 120);
  return s || fallback;
}

/** True when `resolved` lives strictly inside `root`. */
export function isPathInside(resolved, root) {
  const fold = (s) => (process.platform === 'win32' ? s.toLowerCase() : s);
  const r = fold(path.resolve(root));
  const p = fold(path.resolve(resolved));
  return p === r || p.startsWith(r + path.sep);
}
