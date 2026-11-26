import fs from 'fs';

/**
 * Generic API error helper. Logs detail server-side; client gets a stable code.
 * @param {string} errorsLogPath
 */
export function createErrRes(errorsLogPath) {
  return function errRes(res, status, code, err) {
    if (code === 'server-error' && err) {
      if (err.code === 'ENOSPC') code = 'disk-full';
      else if (err.code === 'EACCES' || err.code === 'EPERM') code = 'no-permission';
    }
    if (err) {
      try {
        const ts = new Date().toISOString();
        const msg = err && err.stack ? err.stack : String(err);
        fs.appendFileSync(errorsLogPath, `[${ts}] [api:${code}] ${msg}\n`, 'utf-8');
      } catch { /* ignore log failures */ }
    }
    const MESSAGES = {
      'bad-request': 'Invalid request',
      'not-found': 'Not found',
      'conflict': 'Conflict with existing resource',
      'server-error': 'Internal server error',
      'forbidden': 'Refused',
      'invalid-path': 'Invalid path',
      'payload-too-large': 'Request body too large',
      'disk-full': 'The disk is full: free some space and try again',
      'no-permission': 'The app is not allowed to write to its data folder',
    };
    return res.status(status).json({ error: MESSAGES[code] || code, code });
  };
}
