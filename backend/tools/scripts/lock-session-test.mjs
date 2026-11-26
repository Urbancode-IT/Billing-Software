// v1.10.86 — unlock session + Setup digest fail-closed unit tests.
import assert from 'assert';
import {
  createUnlockSessions, isPinConfirmRoute, LOCK_PUBLIC_API, confirmPinFromRequest,
} from '../../modules/utils/lockSession.js';
import { checkSetupBytes, setupAssetFrom } from '../../modules/utils/setupDownload.js';
import crypto from 'crypto';

let passed = 0, failed = 0;
function ok(cond, label) {
  if (cond) { passed++; console.log(`  ok ${label}`); }
  else { failed++; console.error(`  FAIL ${label}`); }
}

const sessions = createUnlockSessions({ now: () => 1_000_000 });
const token = sessions.issue();
ok(sessions.has(token), 'issued unlock token is accepted');
ok(!sessions.has('nope'), 'unknown token is refused');
sessions.revoke(token);
ok(!sessions.has(token), 'revoked token is refused');

ok(LOCK_PUBLIC_API.has('/api/lock/verify') && LOCK_PUBLIC_API.has('/api/health'), 'lock/health stay public while locked');
ok(isPinConfirmRoute('GET', '/api/export') && isPinConfirmRoute('POST', '/api/import'), 'export/import need confirm PIN');
ok(isPinConfirmRoute('POST', '/api/control-panel/uninstall'), 'uninstall needs confirm PIN');
ok(!isPinConfirmRoute('GET', '/api/bills'), 'ordinary reads do not need confirm PIN');

ok(confirmPinFromRequest({ get: () => '123456', body: {} }) === '123456', 'confirm PIN from header');
ok(confirmPinFromRequest({ get: () => '', headers: {}, body: { pin: '99999999' } }) === '99999999', 'confirm PIN from body');

const exe = Buffer.concat([Buffer.from('MZ'), Buffer.alloc(100)]);
const sum = crypto.createHash('sha256').update(exe).digest('hex');
ok(checkSetupBytes(exe, { size: 102, sha256: sum }).ok, 'Setup with digest accepted');
ok(!checkSetupBytes(exe, { size: 102 }).ok, 'Setup without digest refused');
ok(setupAssetFrom({
  assets: [{
    name: 'Free-GST-Billing-Windows-Setup.exe',
    size: 9,
    browser_download_url: 'https://github.com/IamRamgarhia/Free-GST-Billing-Software/releases/download/v1/Free-GST-Billing-Windows-Setup.exe',
  }],
}) === null, 'release asset without digest is ignored');

console.log(`\nlock-session-test: ${passed} passed, ${failed} failed`);
if (failed) process.exit(1);
assert.ok(passed > 0);
