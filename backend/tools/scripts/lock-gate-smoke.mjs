// Quick smoke: PIN lock gates /api and export needs confirm PIN.
import http from 'http';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const portFile = path.join(__dirname, '../../data/port.txt');
const port = Number(fs.readFileSync(portFile, 'utf8').trim()) || 47371;
const pin = '87654321';

function req(method, urlPath, { body, cookie, headers } = {}) {
  const data = body != null ? JSON.stringify(body) : null;
  return new Promise((resolve, reject) => {
    const r = http.request({
      hostname: '127.0.0.1',
      port,
      path: urlPath,
      method,
      headers: {
        'Content-Type': 'application/json',
        ...(data ? { 'Content-Length': Buffer.byteLength(data) } : {}),
        ...(cookie ? { Cookie: cookie } : {}),
        ...(headers || {}),
      },
    }, (res) => {
      let b = '';
      res.on('data', (c) => { b += c; });
      res.on('end', () => resolve({
        status: res.statusCode,
        cookie: [].concat(res.headers['set-cookie'] || []).map((x) => x.split(';')[0].trim()).filter(Boolean).join('; '),
        body: b,
      }));
    });
    r.on('error', reject);
    if (data) r.write(data);
    r.end();
  });
}

let failed = 0;
const check = (cond, label) => {
  if (cond) console.log(`  ok ${label}`);
  else { failed++; console.error(`  FAIL ${label}`); }
};

const set = await req('POST', '/api/lock/set', { body: { pin } });
check(set.status === 200, `set PIN -> ${set.status}`);
const cookie = set.cookie;
check(/fgsb_unlock=/.test(cookie), 'unlock cookie issued on set');

await req('POST', '/api/lock/clear', { cookie });
const locked = await req('GET', '/api/bills');
check(locked.status === 401 && locked.body.includes('locked'), `bills while locked -> ${locked.status}`);

const verified = await req('POST', '/api/lock/verify', { body: { pin } });
check(verified.status === 200, 'verify PIN');
const c2 = verified.cookie || cookie;
const bills = await req('GET', '/api/bills', { cookie: c2 });
check(bills.status === 200, `bills after verify -> ${bills.status}`);

const expNo = await req('GET', '/api/export', { cookie: c2 });
check(expNo.status === 401, `export without confirm PIN -> ${expNo.status}`);
const expYes = await req('GET', '/api/export', { cookie: c2, headers: { 'X-Confirm-Pin': pin } });
check(expYes.status === 200 && !expYes.body.includes('"hideLock"') && !expYes.body.includes('"appLock"'), 'export with confirm PIN, no lock hashes');

await req('POST', '/api/lock/set', { body: { pin: null, currentPin: pin }, cookie: c2 });
console.log(failed ? `\nlock-gate-smoke: ${failed} failed` : '\nlock-gate-smoke: all passed');
process.exit(failed ? 1 : 0);
