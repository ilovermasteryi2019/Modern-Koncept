// ONE-TIME script: converts every plain-text password in the users table into a scrypt hash.
// Safe to run more than once - rows that are already hashed are skipped.
//
// Usage (in the project folder, with SUPABASE_URL and SUPABASE_KEY in your .env, same as server.js):
//   node migrate-passwords.js --dry-run     (only shows how many rows would change)
//   node migrate-passwords.js               (does the migration)
require('dotenv').config();
const { createClient } = require('@supabase/supabase-js');
const crypto = require('crypto');

// --- same hashing code as server.js (must stay identical) ---
const PREFIX = 'scrypt$';
const PARAMS = { N: 16384, r: 8, p: 1, keylen: 64 };

function scryptAsync(password, salt, keylen, opts) {
  return new Promise((resolve, reject) => {
    crypto.scrypt(password, salt, keylen, opts, (err, key) => (err ? reject(err) : resolve(key)));
  });
}

function isHashed(value) {
  return typeof value === 'string' && value.startsWith(PREFIX);
}

async function hashPassword(password) {
  const salt = crypto.randomBytes(16);
  const key = await scryptAsync(password, salt, PARAMS.keylen, { N: PARAMS.N, r: PARAMS.r, p: PARAMS.p });
  return `${PREFIX}${PARAMS.N}$${PARAMS.r}$${PARAMS.p}$${salt.toString('base64')}$${key.toString('base64')}`;
}

// Constant-time comparison that also works for strings of different length
function safeEqualText(a, b) {
  const ha = crypto.createHash('sha256').update(String(a)).digest();
  const hb = crypto.createHash('sha256').update(String(b)).digest();
  return crypto.timingSafeEqual(ha, hb);
}

// Returns { ok, needsUpgrade }.
//  - stored hash   -> verified with scrypt
//  - old plain text -> compared directly; needsUpgrade = true so the caller can re-save it as a hash
async function verifyPassword(password, stored) {
  if (typeof password !== 'string' || typeof stored !== 'string' || stored === '') return { ok: false, needsUpgrade: false };
  if (!isHashed(stored)) {
    const ok = safeEqualText(password, stored);
    return { ok, needsUpgrade: ok };
  }
  const parts = stored.split('$'); // ['scrypt', N, r, p, salt, hash]
  if (parts.length !== 6) return { ok: false, needsUpgrade: false };
  const N = Number(parts[1]), r = Number(parts[2]), p = Number(parts[3]);
  if (![N, r, p].every(Number.isInteger)) return { ok: false, needsUpgrade: false };
  try {
    const salt = Buffer.from(parts[4], 'base64');
    const expected = Buffer.from(parts[5], 'base64');
    const actual = await scryptAsync(password, salt, expected.length, { N, r, p });
    return { ok: actual.length === expected.length && crypto.timingSafeEqual(actual, expected), needsUpgrade: false };
  } catch (e) {
    return { ok: false, needsUpgrade: false };
  }
}
// -------------------------------------------------------------

const dryRun = process.argv.includes('--dry-run');
const db = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_KEY);

(async () => {
  const { data: users, error } = await db.from('users').select('id,password');
  if (error) { console.error('Failed to read users:', error.message); process.exit(1); }

  let converted = 0, skipped = 0, failed = 0;
  for (const user of users) {
    if (!user.password || isHashed(user.password)) { skipped++; continue; }
    if (dryRun) { converted++; continue; }
    try {
      const hash = await hashPassword(user.password);
      // The password filter makes sure we only overwrite the exact plain-text value we just read
      const { error: updateError } = await db.from('users').update({ password: hash }).eq('id', user.id).eq('password', user.password);
      if (updateError) { failed++; console.error(`User ${user.id}: ${updateError.message}`); }
      else converted++;
    } catch (e) { failed++; console.error(`User ${user.id}: ${e.message}`); }
  }
  console.log(`${dryRun ? '[dry run] would convert' : 'Converted'}: ${converted} | already hashed/empty: ${skipped} | failed: ${failed}`);
  process.exit(failed ? 1 : 0);
})();