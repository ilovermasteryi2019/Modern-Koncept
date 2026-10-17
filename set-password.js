// Sets a NEW password (saved as a hash) for any account in the users table - Admin, Manager or Staff.
// Run it on your computer, in the project folder (the one with your .env):
//   node set-password.js someone@example.com
// After saving, it reads the account back from the database and checks that the new password really works.
require('dotenv').config();
const crypto = require('crypto');
const readline = require('readline');
const { createClient } = require('@supabase/supabase-js');

// --- same hashing code as server.js (must stay identical) ---
const PREFIX = 'scrypt$';
const PARAMS = { N: 16384, r: 8, p: 1, keylen: 64 };

function scryptAsync(password, salt, keylen, opts) {
  return new Promise((resolve, reject) => {
    crypto.scrypt(password, salt, keylen, opts, (err, key) => (err ? reject(err) : resolve(key)));
  });
}

async function hashPassword(password) {
  const salt = crypto.randomBytes(16);
  const key = await scryptAsync(password, salt, PARAMS.keylen, { N: PARAMS.N, r: PARAMS.r, p: PARAMS.p });
  return `${PREFIX}${PARAMS.N}$${PARAMS.r}$${PARAMS.p}$${salt.toString('base64')}$${key.toString('base64')}`;
}

async function checkHash(password, stored) {
  if (typeof stored !== 'string' || !stored.startsWith(PREFIX)) return false;
  const parts = stored.split('$');
  if (parts.length !== 6) return false;
  const expected = Buffer.from(parts[5], 'base64');
  const actual = await scryptAsync(password, Buffer.from(parts[4], 'base64'), expected.length, { N: Number(parts[1]), r: Number(parts[2]), p: Number(parts[3]) });
  return actual.length === expected.length && crypto.timingSafeEqual(actual, expected);
}
// -------------------------------------------------------------

// Asks a question and hides what is typed (so the password does not show on screen)
function askHidden(question) {
  return new Promise((resolve) => {
    const rl = readline.createInterface({ input: process.stdin, output: process.stdout, terminal: true });
    rl._writeToOutput = function (text) {
      if (text.startsWith(question)) rl.output.write(question);
      else if (text === '\r\n' || text === '\n') rl.output.write('\n');
    };
    rl.question(question, (answer) => { rl.close(); resolve(answer); });
  });
}

(async () => {
  const email = (process.argv[2] || '').trim();
  if (!email) { console.error('Usage: node set-password.js someone@example.com'); process.exit(1); }
  if (!process.env.SUPABASE_URL || !process.env.SUPABASE_KEY) { console.error('SUPABASE_URL / SUPABASE_KEY are missing from your .env file.'); process.exit(1); }

  // Shows only the project address (never the key) so you can compare it with the one on Render
  let host = process.env.SUPABASE_URL;
  try { host = new URL(process.env.SUPABASE_URL).host; } catch (e) { /* keep the raw value */ }
  console.log(`Database project: ${host}`);

  const db = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_KEY);

  const { data: user, error } = await db.from('users').select('id,name,email,role').eq('email', email).single();
  if (error || !user) { console.error(`No account found with the email "${email}".`); process.exit(1); }
  console.log(`Account: ${user.name} (${user.role}) - ${user.email}`);

  const first = await askHidden('New password: ');
  if (!first || first.length < 8 || first.length > 128) { console.error('The password must be 8 to 128 characters long. Nothing was changed.'); process.exit(1); }
  const second = await askHidden('Type it again: ');
  if (first !== second) { console.error('The two passwords do not match. Nothing was changed.'); process.exit(1); }

  const hash = await hashPassword(first);
  const { data: updated, error: updateError } = await db.from('users').update({ password: hash }).eq('id', user.id).select('id');
  if (updateError) { console.error('Failed to save the password:', updateError.message); process.exit(1); }
  if (!updated || updated.length === 0) {
    console.error('The database accepted the request but changed 0 rows, so the password was NOT saved.');
    console.error('This usually means Row Level Security is blocking your SUPABASE_KEY. Use the service_role key in your local .env for this script.');
    process.exit(1);
  }

  // Read it back and test the new password against what is really stored
  const { data: saved, error: readError } = await db.from('users').select('password').eq('id', user.id).single();
  if (readError || !saved) { console.error('Saved, but could not read it back to double-check:', readError ? readError.message : 'no data'); process.exit(1); }
  const works = await checkHash(first, saved.password);
  if (!works) { console.error('The saved value does not match the password you typed. Nothing is working yet - please run the script again.'); process.exit(1); }

  console.log('Done. Verified: the new password is saved as a hash and checks out against the database.');
  console.log('If the login page still says "Invalid email or password", the website server (Render) is the problem, not this account.');
  process.exit(0);
})();