// Unlock session for the optional app PIN (v1.10.86 security hardening).
// When a PIN is set, APIs require a short-lived HttpOnly cookie issued only
// after /api/lock/verify (or after turning the PIN on). "Lock now" clears it.
// Token is 256 random bits; only a SHA-256 hash is kept in memory.
import crypto from 'crypto';
import { hashToken, newToken, readCookie } from './phoneAccess.js';

export const UNLOCK_COOKIE = 'fgsb_unlock';
const SESSION_TTL_MS = 12 * 60 * 60 * 1000; // one working day at most
const CONFIRM_PIN_HEADER = 'x-confirm-pin';

/** Paths that must work while the books are locked (API only). */
export const LOCK_PUBLIC_API = new Set([
  '/api/lock',
  '/api/lock/verify',
  '/api/lock/set',
  '/api/lock/clear',
  '/api/health',
  '/api/version',
  '/api/pair',
  '/api/pair/info',
]);

/** Destructive / portable actions that need a fresh PIN even when unlocked. */
export function isPinConfirmRoute(method, pathname) {
  let p;
  try { p = decodeURIComponent(String(pathname || '')); } catch { return false; }
  p = p.toLowerCase().replace(/\/+/g, '/').replace(/(.)\/$/, '$1');
  const m = String(method || 'GET').toUpperCase();
  if (p === '/api/export' && m === 'GET') return true;
  if (p === '/api/import' && m === 'POST') return true;
  if (p === '/api/control-panel/launch-script' && m === 'POST') return true;
  if (p === '/api/control-panel/uninstall' && m === 'POST') return true;
  if (p === '/api/control-panel/restart' && m === 'POST') return true;
  if (p === '/api/backups/now' && m === 'POST') return true;
  if (/^\/api\/backups\/[^/]+\/restore$/.test(p) && m === 'POST') return true;
  if (/^\/api\/backups\/[^/]+$/.test(p) && m === 'DELETE') return true;
  return false;
}

export function createUnlockSessions({ now = Date.now } = {}) {
  /** @type {Map<string, number>} hash -> expiresAt */
  const sessions = new Map();

  const prune = () => {
    const t = now();
    for (const [h, exp] of sessions) if (exp <= t) sessions.delete(h);
  };

  return {
    issue() {
      prune();
      const token = newToken();
      sessions.set(hashToken(token), now() + SESSION_TTL_MS);
      return token;
    },
    clearAll() {
      sessions.clear();
    },
    revoke(token) {
      if (token) sessions.delete(hashToken(token));
    },
    has(token) {
      if (!token) return false;
      prune();
      const exp = sessions.get(hashToken(token));
      return !!exp && exp > now();
    },
    readToken(req) {
      return readCookie(req.headers?.cookie, UNLOCK_COOKIE);
    },
    cookieHeader(token, { secure = false } = {}) {
      const parts = [
        `${UNLOCK_COOKIE}=${token}`,
        'Path=/',
        `Max-Age=${Math.floor(SESSION_TTL_MS / 1000)}`,
        'HttpOnly',
        'SameSite=Strict',
      ];
      if (secure) parts.push('Secure');
      return parts.join('; ');
    },
    clearCookieHeader({ secure = false } = {}) {
      const parts = [`${UNLOCK_COOKIE}=`, 'Path=/', 'Max-Age=0', 'HttpOnly', 'SameSite=Strict'];
      if (secure) parts.push('Secure');
      return parts.join('; ');
    },
  };
}

export function confirmPinFromRequest(req) {
  const header = req.get?.(CONFIRM_PIN_HEADER) || req.headers?.[CONFIRM_PIN_HEADER];
  if (header != null && String(header) !== '') return String(header);
  if (req.body && typeof req.body === 'object' && req.body.pin != null) return String(req.body.pin);
  return '';
}

export { CONFIRM_PIN_HEADER, hashToken, crypto };
