require('dotenv').config();
const express = require('express');
const cors = require('cors');
const { createClient } = require('@supabase/supabase-js');
const { GoogleGenAI } = require('@google/genai');
const crypto = require('crypto');

// =============================================================================
// PASSWORD HASHING (Node built-in crypto.scrypt - no extra npm package needed)
// Stored format:  scrypt$N$r$p$<salt base64>$<hash base64>
// Each password gets its own random salt. Old plain-text passwords are still accepted
// at login and are re-saved as hashes automatically.
// =============================================================================
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


const app = express();
const PORT = process.env.PORT || 3000;

app.use(express.json({ limit: '50mb' }));
app.use(cors());

const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });
const db = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_KEY);

console.log('✅ Supabase client initialized');

// =============================================================================
// ROLE-BASED AUTHORIZATION (signed login token, built-in crypto - no new package)
// Set AUTH_SECRET in your environment (Render > Environment). If it is missing,
// a random secret is generated, which means tokens stop working after a restart.
// =============================================================================
const AUTH_SECRET = process.env.AUTH_SECRET || crypto.randomBytes(32).toString('hex');
if (!process.env.AUTH_SECRET) console.warn('⚠️ AUTH_SECRET is not set. Add it to your environment so login tokens survive restarts.');
const TOKEN_TTL_MS = 12 * 60 * 60 * 1000; // 12 hours (absolute maximum session length)

// Server-side session list: a login token only works while its session is in this list.
// - Logout removes the session, so a copied token stops working immediately.
// - A session that is not used for SESSION_IDLE_MS is dropped (the dashboards send a keep-alive while the user is active).
// - The list lives in memory: restarting/redeploying the server logs everyone out (they simply log in again).
const SESSION_IDLE_MS = (Number(process.env.SESSION_IDLE_MINUTES) || 35) * 60 * 1000;
const MAX_SESSIONS = 5000;
const sessions = new Map(); // jti -> { userId, createdAt, lastSeen }

function createSession(user) {
  const jti = crypto.randomUUID();
  const now = Date.now();
  sessions.set(jti, { userId: user.id, createdAt: now, lastSeen: now });
  while (sessions.size > MAX_SESSIONS) sessions.delete(sessions.keys().next().value); // drop the oldest
  return signToken(user, jti);
}

function revokeUserSessions(userId) {
  for (const [jti, session] of sessions) {
    if (String(session.userId) === String(userId)) sessions.delete(jti);
  }
}

setInterval(() => {
  const now = Date.now();
  for (const [jti, session] of sessions) {
    if (now - session.lastSeen > SESSION_IDLE_MS || now - session.createdAt > TOKEN_TTL_MS) sessions.delete(jti);
  }
}, 5 * 60 * 1000).unref();

function signToken(user, jti) {
  const payload = Buffer.from(JSON.stringify({ id: user.id, role: user.role, jti, exp: Date.now() + TOKEN_TTL_MS })).toString('base64url');
  const sig = crypto.createHmac('sha256', AUTH_SECRET).update(payload).digest('base64url');
  return `${payload}.${sig}`;
}

function verifyToken(token) {
  if (!token || typeof token !== 'string' || !token.includes('.')) return null;
  const [payload, sig] = token.split('.');
  const expected = crypto.createHmac('sha256', AUTH_SECRET).update(payload).digest('base64url');
  const a = Buffer.from(sig || '');
  const b = Buffer.from(expected);
  if (a.length !== b.length || !crypto.timingSafeEqual(a, b)) return null;
  try {
    const data = JSON.parse(Buffer.from(payload, 'base64url').toString());
    if (!data.exp || data.exp < Date.now()) return null;
    return data;
  } catch (e) { return null; }
}

// Allows the request only if the token is valid AND the user's CURRENT role in the
// users table is one of the allowed roles (so the frontend role can never be trusted alone).
function requireRole(...allowedRoles) {
  return async (req, res, next) => {
    const header = req.headers.authorization || '';
    const token = header.startsWith('Bearer ') ? header.slice(7) : null;
    const decoded = verifyToken(token);
    if (!decoded) return res.status(401).json({ success: false, message: 'Session expired or not logged in. Please log out and log in again.' });
    // The token must belong to a live server-side session (not logged out, not idle for too long)
    const session = decoded.jti ? sessions.get(decoded.jti) : null;
    if (!session || String(session.userId) !== String(decoded.id) || Date.now() - session.lastSeen > SESSION_IDLE_MS) {
      if (decoded.jti) sessions.delete(decoded.jti);
      return res.status(401).json({ success: false, message: 'Your session has expired. Please log in again.' });
    }
    const { data: user, error } = await db.from('users').select('id,name,email,role').eq('id', decoded.id).single();
    if (error || !user) return res.status(401).json({ success: false, message: 'Account not found. Please log in again.' });
    const role = user.role || 'staff';
    if (!allowedRoles.includes(role)) return res.status(403).json({ success: false, message: 'You do not have permission to perform this action.' });
    session.lastSeen = Date.now();
    req.authUser = { id: user.id, name: user.name, email: user.email, role };
    next();
  };
}

function generateRefCode() {
  const year = new Date().getFullYear();
  const random = Math.random().toString(36).substr(2, 6).toUpperCase();
  return `DEL-${year}-${random}`;
}

// =============================================================================
// DUPLICATE-SUBMISSION PROTECTION (idempotency keys)
// The website sends a random request_id with every "create" request. If the same request_id arrives again
// (double click, retry after a slow answer) while the first is running, or after it already succeeded, the
// original result is returned and NOTHING is created a second time. A request that FAILED is not remembered,
// so the user can simply try again. Requests without a request_id behave exactly as before.
// The list lives in memory (like the login sessions) and entries expire after 10 minutes.
// =============================================================================
const IDEMPOTENCY_TTL_MS = 10 * 60 * 1000;
const IDEMPOTENCY_MAX = 5000;
const IDEMPOTENCY_UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const idempotencyStore = new Map(); // scope -> { promise, createdAt }

setInterval(() => {
  const now = Date.now();
  for (const [scope, entry] of idempotencyStore) {
    if (now - entry.createdAt > IDEMPOTENCY_TTL_MS) idempotencyStore.delete(scope);
  }
}, 60 * 1000).unref();

function withIdempotency(routeName, handler) {
  return async (req, res) => {
    const requestId = req.body && typeof req.body.request_id === 'string' ? req.body.request_id : null;
    if (!requestId || !IDEMPOTENCY_UUID_RE.test(requestId)) return handler(req, res);

    const scope = `${routeName}:${req.authUser ? req.authUser.id : 'public'}:${requestId.toLowerCase()}`;
    const existing = idempotencyStore.get(scope);
    if (existing) {
      const first = await existing.promise; // waits if the first request is still running
      if (first.status >= 200 && first.status < 300) {
        return res.status(first.status).json({ ...first.body, duplicate: true });
      }
      return handler(req, res); // the first attempt failed, so this is a genuine retry
    }

    // Run the real handler, capturing its answer (the handlers only use res.status().json() / res.json())
    const captured = { status: 200, body: undefined };
    const recorder = {
      status(code) { captured.status = code; return recorder; },
      json(body) { captured.body = body; return recorder; }
    };
    const promise = (async () => {
      try {
        await handler(req, recorder);
      } catch (err) {
        console.error(`Unexpected error in ${routeName}:`, err && err.message);
        captured.status = 500;
        captured.body = { success: false, message: 'Something went wrong. Please try again.' };
      }
      return captured;
    })();
    idempotencyStore.set(scope, { promise, createdAt: Date.now() });
    while (idempotencyStore.size > IDEMPOTENCY_MAX) idempotencyStore.delete(idempotencyStore.keys().next().value);

    const result = await promise;
    if (!(result.status >= 200 && result.status < 300)) idempotencyStore.delete(scope); // failed: allow a clean retry
    return res.status(result.status).json(result.body);
  };
}

// =============================================================================
// AUTH
// =============================================================================
// Hashes a password for storage. Returns null (and the caller answers 500) if hashing fails.
async function hashForStorage(password) {
  try { return await hashPassword(password); } catch (e) { console.error('Password hashing failed:', e.message); return null; }
}

// Accounts are created by the Admin only (Staff Accounts module -> POST /staff). This older route is kept but now needs an Admin login.
app.post('/signup', requireRole('admin'), async (req, res) => {
  const { name, email, password } = req.body;
  if (!name || !email || !password) return res.status(400).json({ success: false, message: 'All fields are required' });
  if (typeof password !== 'string' || password.length > 128) return res.status(400).json({ success: false, message: 'Invalid password' });
  const { data: existing } = await db.from('users').select('id').eq('email', email).single();
  if (existing) return res.status(400).json({ success: false, message: 'Email already exists' });
  const passwordHash = await hashForStorage(password);
  if (!passwordHash) return res.status(500).json({ success: false, message: 'Failed to create account' });
  const { data, error } = await db.from('users').insert({ name, email, password: passwordHash, role: 'staff' }).select().single();
  if (error && error.code === '23505') return res.status(400).json({ success: false, message: 'Email already exists' });
  if (error) return res.status(500).json({ success: false, message: 'Failed to create account' });
  res.status(201).json({ success: true, message: 'Account created successfully', userId: data.id });
});

app.post('/login', async (req, res) => {
  const { email, password } = req.body;
  if (!email || !password) return res.status(400).json({ success: false, message: 'Email and password are required' });
  if (typeof email !== 'string' || typeof password !== 'string' || password.length > 128) return res.status(401).json({ success: false, message: 'Invalid email or password' });
  const { data, error } = await db.from('users').select('id,name,email,role,password').eq('email', email).single();
  if (error || !data) return res.status(401).json({ success: false, message: 'Invalid email or password' });
  const check = await verifyPassword(password, data.password);
  if (!check.ok) return res.status(401).json({ success: false, message: 'Invalid email or password' });
  if (check.needsUpgrade) {
    // Old plain-text account: it logged in correctly, so re-save its password as a hash (login still succeeds if this fails)
    const upgraded = await hashForStorage(password);
    if (upgraded) {
      const { error: upgradeError } = await db.from('users').update({ password: upgraded }).eq('id', data.id).eq('password', data.password);
      if (upgradeError) console.error('Password upgrade failed:', upgradeError.message);
    }
  }
  // Correct password, but NO session yet: the user must still pass the SMS verification (see "SMS OTP MFA" below).
  // The number comes from this account's own record - never from the browser.
  const phone = await getMfaPhoneForUser(data.id);
  if (!phone.ok) {
    if (phone.code === 'ACCOUNT_NOT_FOUND') return res.status(401).json({ success: false, message: 'Invalid email or password' });
    return res.status(403).json({ success: false, code: phone.code, message: phone.message });
  }
  const challengeId = createMfaChallenge(data.id, phone.phone);
  res.json({ success: true, mfaRequired: true, challengeId, maskedPhone: phone.maskedPhone, expiresInSeconds: MFA_CHALLENGE_TTL_MS / 1000 });
});

// Checks the current session (used by the dashboards when they open and as a keep-alive while the user is active)
app.get('/session', requireRole('admin', 'manager', 'staff'), (req, res) => {
  const { id, name, email, role } = req.authUser;
  res.json({ success: true, user: { id, name, email, role }, idleTimeoutMs: SESSION_IDLE_MS });
});

// Logout: ends the server-side session so the token can no longer be used. Always answers success.
app.post('/logout', (req, res) => {
  const header = req.headers.authorization || '';
  const decoded = verifyToken(header.startsWith('Bearer ') ? header.slice(7) : null);
  if (decoded && decoded.jti) sessions.delete(decoded.jti);
  res.json({ success: true, message: 'Logged out' });
});

// =============================================================================
// SMS OTP MFA (Semaphore) - applies to Admin, Manager and Staff
//
//   POST /login              password OK -> { mfaRequired, challengeId, maskedPhone }   (NO token)
//   POST /login/mfa/send     { challengeId }        generate an OTP and send it by SMS (first code)
//   POST /login/mfa/resend   { challengeId }        same, the cooldown is enforced here
//   POST /login/mfa/verify   { challengeId, code }  the ONLY place a login token is issued
//   POST /login/mfa/cancel   { challengeId }        forget the pending login
//
// A "challenge" is a pending login kept in server memory (like the session list above): it is bound to ONE user,
// is addressed by an unguessable id, and holds only an HMAC of the OTP (never the OTP itself). Restarting the server
// drops pending challenges - users simply log in again.
// Environment: SEMAPHORE_API_KEY (required) and SEMAPHORE_SENDER_NAME (your approved sender name).
// =============================================================================
const SEMAPHORE_OTP_URL = 'https://api.semaphore.co/api/v4/otp'; // Semaphore's dedicated OTP route (2 credits / SMS)
const MFA_OTP_LENGTH = 6;
const MFA_OTP_TTL_MS = 5 * 60 * 1000;            // a code is valid for 5 minutes
const MFA_CHALLENGE_TTL_MS = 10 * 60 * 1000;     // the pending login (password step) is valid for 10 minutes
const MFA_RESEND_COOLDOWN_MS = 60 * 1000;        // minimum time between two SMS for the same login
const MFA_RETRY_AFTER_FAILURE_MS = 5 * 1000;     // minimum spacing after a provider failure
const MFA_MAX_VERIFY_ATTEMPTS = 5;               // wrong codes allowed per code; then the login must start over
const MFA_MAX_SENDS_PER_CHALLENGE = 3;           // successful SMS per login
const MFA_MAX_FAILED_SENDS_PER_CHALLENGE = 5;    // provider failures tolerated per login
const MFA_MAX_SMS_PER_USER_PER_HOUR = 5;         // SMS-bombing / credit protection per account
const MFA_SMS_TIMEOUT_MS = 15 * 1000;
const MFA_MAX_CHALLENGES = 2000;
const MFA_CHALLENGE_ID_RE = /^[A-Za-z0-9_-]{43}$/;

const mfaChallenges = new Map(); // challengeId -> challenge
const mfaSmsLog = new Map();     // userId -> timestamps of successful SMS (last hour)

if (!process.env.SEMAPHORE_API_KEY) console.warn('⚠️ SEMAPHORE_API_KEY is not set. Nobody can complete the SMS login until it is configured.');
if (!process.env.SEMAPHORE_SENDER_NAME) console.warn('⚠️ SEMAPHORE_SENDER_NAME is not set. SMS codes will use the default sender name of your Semaphore account.');

setInterval(() => {
  const now = Date.now();
  for (const [id, challenge] of mfaChallenges) if (challenge.expiresAt <= now) mfaChallenges.delete(id);
  for (const [userId, stamps] of mfaSmsLog) {
    const recent = stamps.filter(t => now - t < 60 * 60 * 1000);
    if (recent.length) mfaSmsLog.set(userId, recent); else mfaSmsLog.delete(userId);
  }
}, 60 * 1000).unref();

function mfaFail(res, status, code, message, extra) {
  return res.status(status).json({ success: false, code, message, ...(extra || {}) });
}

function generateOtp() {
  return String(crypto.randomInt(0, 10 ** MFA_OTP_LENGTH)).padStart(MFA_OTP_LENGTH, '0'); // cryptographically secure
}

// The OTP is only stored as an HMAC bound to this challenge AND this user, so a code can never be replayed
// against another login or another account.
function mfaOtpHash(challengeId, userId, otp) {
  return crypto.createHmac('sha256', AUTH_SECRET).update(`mfa|${challengeId}|${userId}|${otp}`).digest();
}

function createMfaChallenge(userId, phone) {
  for (const [id, challenge] of mfaChallenges) { // one pending login per account: a new password login replaces the old one
    if (String(challenge.userId) === String(userId)) mfaChallenges.delete(id);
  }
  const id = crypto.randomBytes(32).toString('base64url');
  const now = Date.now();
  mfaChallenges.set(id, {
    userId, phone, createdAt: now, expiresAt: now + MFA_CHALLENGE_TTL_MS,
    otpHash: null, otpExpiresAt: 0, verifyAttempts: 0,
    sendCount: 0, failedSends: 0, lastSentAt: 0, lastFailedAt: 0, sending: false
  });
  while (mfaChallenges.size > MFA_MAX_CHALLENGES) mfaChallenges.delete(mfaChallenges.keys().next().value); // drop the oldest
  return id;
}

// Returns { id, challenge } or { error: { status, code, message } }
function findMfaChallenge(rawId) {
  const gone = { error: { status: 404, code: 'CHALLENGE_NOT_FOUND', message: 'Your verification session was not found. Please log in again.' } };
  if (typeof rawId !== 'string' || !MFA_CHALLENGE_ID_RE.test(rawId)) return gone;
  const challenge = mfaChallenges.get(rawId);
  if (!challenge) return gone;
  if (challenge.expiresAt <= Date.now()) {
    mfaChallenges.delete(rawId);
    return { error: { status: 410, code: 'CHALLENGE_EXPIRED', message: 'Your verification session expired. Please log in again.' } };
  }
  return { id: rawId, challenge };
}

// Never log the OTP: provider answers can echo the message text, so any 6-digit run is masked.
function mfaSafeLog(value) {
  return String(value).replace(/\d{6}/g, '******').slice(0, 300);
}

// Sends the code with Semaphore's OTP route. `phone` is the stored +639XXXXXXXXX number of the account.
async function sendOtpSms(phone, otp) {
  const apiKey = process.env.SEMAPHORE_API_KEY;
  if (!apiKey) return { ok: false, reason: 'CONFIG' };
  const checked = normalizePhPhone(phone);
  if (!checked.ok) return { ok: false, reason: 'PHONE' };
  const number = '0' + checked.value.slice(3); // +639171234567 -> 09171234567 (the format used in Semaphore's own examples)
  const params = new URLSearchParams({
    apikey: apiKey,
    number,
    message: 'Modern Koncept Furniture Centre: Your verification code is {otp}. It expires in 5 minutes. Do not share it with anyone.',
    code: otp // our own code, so the server (not the provider) decides what is valid
  });
  if (process.env.SEMAPHORE_SENDER_NAME) params.set('sendername', process.env.SEMAPHORE_SENDER_NAME);

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), MFA_SMS_TIMEOUT_MS);
  try {
    const response = await fetch(SEMAPHORE_OTP_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: params,
      signal: controller.signal
    });
    let body = null;
    try { body = await response.json(); } catch (e) { body = null; }
    const first = Array.isArray(body) ? body[0] : null;
    const providerStatus = first && first.status ? String(first.status).toLowerCase() : '';
    if (!response.ok || !first || providerStatus === 'failed' || providerStatus === 'refunded') {
      const detail = Array.isArray(body) ? `status=${providerStatus || 'none'}` : mfaSafeLog(JSON.stringify(body));
      const lowCredits = /credit|balance|insufficient/i.test(detail);
      console.error(`❌ [Semaphore OTP] rejected (HTTP ${response.status}) ${detail}${lowCredits ? ' - the account may be out of credits' : ''}`);
      return { ok: false, reason: 'PROVIDER' };
    }
    return { ok: true };
  } catch (error) {
    console.error(`❌ [Semaphore OTP] request failed: ${error && error.name === 'AbortError' ? 'timed out' : 'network error'}`);
    return { ok: false, reason: 'NETWORK' };
  } finally {
    clearTimeout(timer);
  }
}

async function mfaSendHandler(req, res) {
  const found = findMfaChallenge((req.body || {}).challengeId);
  if (found.error) return mfaFail(res, found.error.status, found.error.code, found.error.message);
  const { id, challenge } = found;
  const now = Date.now();

  if (challenge.sending) return mfaFail(res, 429, 'SMS_IN_PROGRESS', 'A code is already being sent. Please wait a moment.');
  if (challenge.lastSentAt && now - challenge.lastSentAt < MFA_RESEND_COOLDOWN_MS) {
    const retry = Math.ceil((MFA_RESEND_COOLDOWN_MS - (now - challenge.lastSentAt)) / 1000);
    return mfaFail(res, 429, 'MFA_COOLDOWN', `Please wait ${retry} seconds before requesting another code.`, { retryAfterSeconds: retry });
  }
  if (challenge.lastFailedAt && now - challenge.lastFailedAt < MFA_RETRY_AFTER_FAILURE_MS) {
    const retry = Math.ceil((MFA_RETRY_AFTER_FAILURE_MS - (now - challenge.lastFailedAt)) / 1000);
    return mfaFail(res, 429, 'MFA_COOLDOWN', `Please wait ${retry} seconds and try again.`, { retryAfterSeconds: retry });
  }
  if (challenge.sendCount >= MFA_MAX_SENDS_PER_CHALLENGE || challenge.failedSends >= MFA_MAX_FAILED_SENDS_PER_CHALLENGE) {
    return mfaFail(res, 429, 'MFA_SEND_LIMIT', 'Too many codes were requested for this login. Please go back and log in again.');
  }
  const recent = (mfaSmsLog.get(String(challenge.userId)) || []).filter(t => now - t < 60 * 60 * 1000);
  if (recent.length >= MFA_MAX_SMS_PER_USER_PER_HOUR) {
    return mfaFail(res, 429, 'MFA_SEND_LIMIT', 'Too many verification codes were requested for this account. Please try again later.');
  }
  if (!process.env.SEMAPHORE_API_KEY) {
    console.error('❌ [Semaphore OTP] SEMAPHORE_API_KEY is missing in the server environment.');
    return mfaFail(res, 503, 'MFA_UNAVAILABLE', 'SMS verification is not available right now. Please contact the Administrator.');
  }

  const otp = generateOtp();
  challenge.sending = true; // set before the first await: a double click cannot send two SMS
  let result;
  try { result = await sendOtpSms(challenge.phone, otp); } finally { challenge.sending = false; }

  if (mfaChallenges.get(id) !== challenge) return mfaFail(res, 404, 'CHALLENGE_NOT_FOUND', 'Your verification session was not found. Please log in again.'); // cancelled meanwhile
  if (!result.ok) {
    challenge.failedSends += 1;
    challenge.lastFailedAt = Date.now();
    if (result.reason === 'CONFIG') return mfaFail(res, 503, 'MFA_UNAVAILABLE', 'SMS verification is not available right now. Please contact the Administrator.');
    return mfaFail(res, 502, 'SMS_FAILED', 'We could not send the SMS. Please try again in a moment.');
  }

  // The new code replaces any earlier one (the old code stops working) and the attempt counter starts again
  challenge.otpHash = mfaOtpHash(id, challenge.userId, otp);
  challenge.otpExpiresAt = Date.now() + MFA_OTP_TTL_MS;
  challenge.verifyAttempts = 0;
  challenge.lastSentAt = Date.now();
  challenge.sendCount += 1;
  recent.push(Date.now());
  mfaSmsLog.set(String(challenge.userId), recent);
  res.json({ success: true, cooldownSeconds: MFA_RESEND_COOLDOWN_MS / 1000, expiresInSeconds: MFA_OTP_TTL_MS / 1000 });
}

app.post('/login/mfa/send', mfaSendHandler);
app.post('/login/mfa/resend', mfaSendHandler);

app.post('/login/mfa/verify', async (req, res) => {
  const found = findMfaChallenge((req.body || {}).challengeId);
  if (found.error) return mfaFail(res, found.error.status, found.error.code, found.error.message);
  const { id, challenge } = found;

  const code = typeof (req.body || {}).code === 'string' ? req.body.code.trim() : '';
  if (!new RegExp(`^\\d{${MFA_OTP_LENGTH}}$`).test(code)) return mfaFail(res, 400, 'INVALID_CODE', `Enter the ${MFA_OTP_LENGTH}-digit code.`);
  if (!challenge.otpHash) return mfaFail(res, 400, 'CODE_NOT_SENT', 'Request a verification code first.');
  if (Date.now() > challenge.otpExpiresAt) {
    challenge.otpHash = null; // expired codes can never be used again
    return mfaFail(res, 400, 'CODE_EXPIRED', 'That code has expired. Request a new one.');
  }

  challenge.verifyAttempts += 1;
  const given = mfaOtpHash(id, challenge.userId, code);
  if (!crypto.timingSafeEqual(given, challenge.otpHash)) {
    if (challenge.verifyAttempts >= MFA_MAX_VERIFY_ATTEMPTS) {
      mfaChallenges.delete(id); // too many wrong codes: the whole login must start again with the password
      return mfaFail(res, 429, 'TOO_MANY_ATTEMPTS', 'Too many incorrect codes. Please log in again.');
    }
    return mfaFail(res, 400, 'INVALID_CODE', 'That code is not correct.', { attemptsRemaining: MFA_MAX_VERIFY_ATTEMPTS - challenge.verifyAttempts });
  }

  // Correct code. The challenge is removed BEFORE anything is awaited, so the same code cannot be used twice,
  // not even by two requests arriving at the same moment.
  mfaChallenges.delete(id);
  const { data: user, error } = await db.from('users').select('id,name,email,role').eq('id', challenge.userId).single();
  if (error || !user) return mfaFail(res, 401, 'CHALLENGE_EXPIRED', 'Your account could not be found. Please log in again.');
  const loggedInUser = { id: user.id, name: user.name, email: user.email, role: user.role || 'staff' }; // role comes from the database, never from the browser
  res.json({ success: true, message: 'Login successful', user: loggedInUser, token: createSession(loggedInUser) });
});

app.post('/login/mfa/cancel', (req, res) => {
  const id = (req.body || {}).challengeId;
  if (typeof id === 'string' && MFA_CHALLENGE_ID_RE.test(id)) mfaChallenges.delete(id);
  res.json({ success: true });
});

// =============================================================================
// FURNITURE
// =============================================================================
// Validates the optional discounted_price against the regular price.
// Returns { ok: true, value } where value is a number or null (no discount),
// or { ok: false, message } when the input is invalid.
function parseDiscountedPrice(rawDiscount, regularPrice) {
  if (rawDiscount === undefined || rawDiscount === null || String(rawDiscount).trim() === '') return { ok: true, value: null };
  const discount = Number(rawDiscount);
  if (!Number.isFinite(discount)) return { ok: false, message: 'Discounted price must be a valid number' };
  if (discount <= 0) return { ok: false, message: 'Discounted price must be greater than 0' };
  const regular = Number(regularPrice);
  if (!Number.isFinite(regular)) return { ok: false, message: 'Regular price must be a valid number' };
  if (discount >= regular) return { ok: false, message: 'Discounted price must be lower than the regular price' };
  return { ok: true, value: discount };
}

app.get('/products', async (req, res) => {
  const { data, error } = await db.from('furniture').select('*').order('id', { ascending: false });
  if (error) return res.status(500).json({ success: false, message: 'Failed to fetch furniture', error: error.message });
  res.json({ success: true, data });
});

app.get('/products/:id', async (req, res) => {
  const { data, error } = await db.from('furniture').select('*').eq('id', req.params.id).single();
  if (error || !data) return res.status(404).json({ success: false, message: 'Furniture not found' });
  res.json({ success: true, data });
});

// Furniture records are created from Inventory Management: a database trigger creates/updates the linked
// furniture row (see furniture_inventory_link_migration.sql). Creating furniture directly is therefore disabled.
app.post('/add-product', (req, res) => {
  res.status(410).json({ success: false, message: 'Furniture can no longer be added here. Add the item in Inventory Management and it will appear in Furniture Management.' });
});

// Furniture Management only maintains these details. Name, category, price and image come from Inventory Management.
const FURNITURE_SOURCE_FIELDS = ['name', 'category', 'price', 'image', 'inventory_id'];
const FURNITURE_TEXT_LIMITS = { material: 100, dimensions: 100, description: 5000 };

app.put('/products/:id', requireRole('admin'), async (req, res) => {
  const furnitureId = Number(req.params.id);
  if (!Number.isInteger(furnitureId) || furnitureId <= 0) return res.status(400).json({ success: false, message: 'Invalid furniture id' });
  const body = req.body || {};
  const has = (key) => Object.prototype.hasOwnProperty.call(body, key);

  // Enforced here, not just by hiding inputs: source-controlled fields are rejected.
  if (FURNITURE_SOURCE_FIELDS.some(has)) {
    return res.status(400).json({ success: false, message: 'Furniture name, category, price and image are managed in Inventory Management and cannot be edited here.' });
  }

  // Only fields that were actually sent are updated, so nothing is overwritten with empty values.
  const updates = {};
  for (const field of Object.keys(FURNITURE_TEXT_LIMITS)) {
    if (!has(field)) continue;
    if (typeof body[field] !== 'string') return res.status(400).json({ success: false, message: `Invalid ${field}` });
    const value = body[field].trim();
    if (value.length > FURNITURE_TEXT_LIMITS[field]) return res.status(400).json({ success: false, message: `${field.charAt(0).toUpperCase() + field.slice(1)} is too long` });
    updates[field] = value;
  }
  if (!has('discounted_price') && Object.keys(updates).length === 0) {
    return res.status(400).json({ success: false, message: 'No editable furniture details were provided' });
  }

  const { data: existing, error: findError } = await db.from('furniture').select('id, price').eq('id', furnitureId).maybeSingle();
  if (findError) return res.status(500).json({ success: false, message: 'Failed to update furniture' });
  if (!existing) return res.status(404).json({ success: false, message: 'Furniture not found' });

  if (has('discounted_price')) {
    // Validated against the price stored in the database (never a price sent by the browser)
    const discount = parseDiscountedPrice(body.discounted_price, existing.price);
    if (!discount.ok) return res.status(400).json({ success: false, message: discount.message });
    updates.discounted_price = discount.value;
  }

  const { error } = await db.from('furniture').update(updates).eq('id', furnitureId);
  if (error) return res.status(500).json({ success: false, message: 'Failed to update furniture' });
  res.json({ success: true, message: 'Furniture updated successfully' });
});

// Furniture can no longer be deleted here. Deleting the item in Inventory Management removes its furniture record
// (database cascade, see furniture_delete_cascade.sql), which also removes it from furniture-list.html.
app.delete('/products/:id', (req, res) => {
  res.status(410).json({ success: false, message: 'Furniture cannot be deleted here. Delete the item in Inventory Management and it will be removed from Furniture Management and the customer furniture list.' });
});

// =============================================================================
// INVENTORY
// =============================================================================
app.get('/inventory', async (req, res) => {
  const { data, error } = await db.from('inventory').select('*').order('last_updated', { ascending: false });
  if (error) return res.status(500).json({ success: false, message: 'Failed to fetch inventory' });
  res.json({ success: true, data });
});

// Validates the optional unit price of an inventory item.
// Returns { ok: true, provided, value } or { ok: false, message }.
// "provided" is false when the request did not include a price at all, so older
// forms (e.g. the Manager's) that do not send one never overwrite an existing price.
function parseInventoryPrice(raw) {
  if (raw === undefined) return { ok: true, provided: false, value: null };
  if (raw === null || String(raw).trim() === '') return { ok: true, provided: true, value: null };
  const price = Number(raw);
  if (!Number.isFinite(price) || price <= 0) return { ok: false, message: 'Price must be a valid number greater than 0' };
  if (price > 9999999999) return { ok: false, message: 'Price is too large' };
  return { ok: true, provided: true, value: Math.round(price * 100) / 100 };
}

app.post('/inventory', async (req, res) => {
  const { name, category, quantity, item_code, image, price } = req.body;
  if (!name || !category || quantity === undefined || !item_code) {
    return res.status(400).json({ success: false, message: 'Name, item code, category, and quantity are required' });
  }
  const parsedPrice = parseInventoryPrice(price);
  if (!parsedPrice.ok) return res.status(400).json({ success: false, message: parsedPrice.message });
  const { data, error } = await db.from('inventory').insert({
    name,
    category,
    quantity,
    item_code,
    price: parsedPrice.value,
    image: image || null
  }).select().single();
  if (error) {
    if (error.code === '23505') return res.status(409).json({ success: false, message: 'Item code already exists. Please use a unique item code.' });
    return res.status(500).json({ success: false, message: 'Failed to add inventory item' });
  }
  res.status(201).json({ success: true, message: 'Inventory item added successfully', id: data.id });
});

app.put('/inventory/:id', async (req, res) => {
  const { name, category, quantity, item_code, image, price } = req.body;
  if (!name || !category || quantity === undefined || !item_code) {
    return res.status(400).json({ success: false, message: 'Name, item code, category, and quantity are required' });
  }
  const parsedPrice = parseInventoryPrice(price);
  if (!parsedPrice.ok) return res.status(400).json({ success: false, message: parsedPrice.message });
  const updates = {
    name,
    category,
    quantity,
    item_code,
    image: image || null,
    last_updated: new Date()
  };
  if (parsedPrice.provided) updates.price = parsedPrice.value; // untouched when the request has no price
  const { error } = await db.from('inventory').update(updates).eq('id', req.params.id);
  if (error) {
    if (error.code === '23505') return res.status(409).json({ success: false, message: 'Item code already exists. Please use a unique item code.' });
    return res.status(500).json({ success: false, message: 'Failed to update inventory' });
  }
  res.json({ success: true, message: 'Inventory updated successfully' });
});

app.delete('/inventory/:id', async (req, res) => {
  const { error } = await db.from('inventory').delete().eq('id', req.params.id);
  if (error) return res.status(500).json({ success: false, message: 'Failed to delete inventory item' });
  res.json({ success: true, message: 'Inventory item deleted successfully' });
});

// =============================================================================
// DELIVERIES
// =============================================================================
app.get('/deliveries', async (req, res) => {
  const { data, error } = await db.from('deliveries').select('*').order('created_at', { ascending: false });
  if (error) return res.status(500).json({ success: false, message: 'Failed to fetch deliveries' });
  res.json({ success: true, data });
});

app.get('/deliveries/track/:refCode', async (req, res) => {
  const { data, error } = await db.from('deliveries').select('*').eq('ref_code', req.params.refCode).single();
  if (error || !data) return res.status(404).json({ success: false, message: 'Delivery not found' });
  res.json({ success: true, data });
});

app.get('/deliveries/stats', async (req, res) => {
  const { data, error } = await db.from('deliveries').select('status');
  if (error) return res.status(500).json({ success: false, message: 'Failed to fetch delivery statistics' });
  const stats = { pending: 0, processing: 0, in_transit: 0, delivered: 0 };
  data.forEach(row => {
    const key = row.status.toLowerCase().replace(/ /g, '_');
    if (stats.hasOwnProperty(key)) stats[key]++;
  });
  res.json({ success: true, data: stats });
});

app.post('/deliveries', requireRole('admin', 'manager', 'staff'), withIdempotency('deliveries', async (req, res) => {
  const { customer_name, contact_number, address, product, status, delivery_type, delivery_date } = req.body;
  if (!customer_name || !address) return res.status(400).json({ success: false, message: 'Customer name and address are required' });
  if (status && !['Pending', 'Processing', 'In Transit', 'Delivered'].includes(status)) return res.status(400).json({ success: false, message: 'Invalid status' });
  const ref_code = generateRefCode();
  const { data, error } = await db.from('deliveries').insert({ ref_code, customer_name, contact_number: contact_number || null, address, product: product || 'N/A', status: status || 'Pending', delivery_type: delivery_type || 'Outbound', delivery_date: delivery_date || null }).select().single();
  if (error) return res.status(500).json({ success: false, message: 'Failed to create delivery' });
  res.status(201).json({ success: true, message: 'Delivery created successfully', id: data.id, ref_code });
}));

app.put('/deliveries/:id', requireRole('admin', 'manager'), async (req, res) => {
  const { customer_name, contact_number, address, product, status, delivery_type, delivery_date } = req.body || {};
  if (!customer_name || !String(customer_name).trim() || !address || !String(address).trim()) {
    return res.status(400).json({ success: false, message: 'Customer name and address are required' });
  }
  if (status !== undefined && !['Pending', 'Processing', 'In Transit', 'Delivered'].includes(status)) {
    return res.status(400).json({ success: false, message: 'Invalid status' });
  }
  const { error } = await db.from('deliveries').update({ customer_name, contact_number, address, product, status, delivery_type, delivery_date }).eq('id', req.params.id);
  if (error) return res.status(500).json({ success: false, message: 'Failed to update delivery' });
  res.json({ success: true, message: 'Delivery updated successfully' });
});

app.patch('/deliveries/:id/status', requireRole('admin', 'manager'), async (req, res) => {
  const { status } = req.body;
  const validStatuses = ['Pending', 'Processing', 'In Transit', 'Delivered'];
  if (!validStatuses.includes(status)) return res.status(400).json({ success: false, message: 'Invalid status' });
  const { error } = await db.from('deliveries').update({ status }).eq('id', req.params.id);
  if (error) return res.status(500).json({ success: false, message: 'Failed to update delivery status' });
  res.json({ success: true, message: 'Delivery status updated successfully' });
});

app.delete('/deliveries/:id', requireRole('admin'), async (req, res) => {
  const { error } = await db.from('deliveries').delete().eq('id', req.params.id);
  if (error) return res.status(500).json({ success: false, message: 'Failed to delete delivery' });
  res.json({ success: true, message: 'Delivery deleted successfully' });
});

// =============================================================================
// SEND SMS (Admin & Manager Delivery Dashboards) — via Semaphore
// =============================================================================
// Duplicate-SMS protection: only one send per delivery at a time, and a short pause after a successful send,
// so a double click or a retry after a slow answer cannot text the customer twice.
const smsGuard = new Map(); // delivery id -> 'sending' | time of the last successful send
const SMS_COOLDOWN_MS = 10 * 1000;

app.post('/deliveries/:id/send-sms', requireRole('admin', 'manager'), async (req, res) => {
  const smsKey = String(req.params.id);
  const smsState = smsGuard.get(smsKey);
  if (smsState === 'sending') {
    return res.status(409).json({ success: false, message: 'An SMS for this delivery is already being sent. Please wait.' });
  }
  if (typeof smsState === 'number' && Date.now() - smsState < SMS_COOLDOWN_MS) {
    return res.status(429).json({ success: false, message: 'An SMS for this delivery was just sent. Please wait a few seconds before sending another.' });
  }
  smsGuard.set(smsKey, 'sending');
  try {
    const { data: delivery, error: fetchError } = await db.from('deliveries').select('*').eq('id', req.params.id).single();
    if (fetchError || !delivery) return res.status(404).json({ success: false, message: 'Delivery not found' });

    if (!delivery.contact_number) {
      return res.status(400).json({ success: false, message: 'Cannot send SMS: customer has no contact number.' });
    }

    // Validate the number matches an acceptable Philippine mobile format (Semaphore's own examples use 09XXXXXXXXX)
    const cleanedNumber = delivery.contact_number.replace(/[^0-9]/g, '');
    const isValidPhoneNumber = /^(09\d{9}|639\d{9})$/.test(cleanedNumber);
    if (!isValidPhoneNumber) {
      return res.status(400).json({ success: false, message: 'Cannot send SMS: invalid contact number format.' });
    }

    if (!process.env.SEMAPHORE_API_KEY) {
      console.error('❌ [Semaphore] SEMAPHORE_API_KEY is missing in .env configuration.');
      return res.status(500).json({ success: false, message: 'SMS service is not configured.' });
    }

    const message = `Hello ${delivery.customer_name}, your furniture delivery with reference ${delivery.ref_code} is currently ${delivery.status || 'Pending'}.\n\nThank you for choosing Modern Koncept Furniture Centre.`;

    const params = new URLSearchParams({
      apikey: process.env.SEMAPHORE_API_KEY,
      number: cleanedNumber,
      message: message
    });

    const smsResponse = await fetch('https://api.semaphore.co/api/v4/messages', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: params
    });

    const smsResult = await smsResponse.json();

    // Semaphore returns an array of message objects; a "Failed" status means the network rejected it
    const failed = !smsResponse.ok || (Array.isArray(smsResult) && smsResult[0] && smsResult[0].status === 'Failed');
    if (failed) {
      console.error('❌ [Semaphore] SMS send failed:', smsResult);
      return res.status(502).json({ success: false, message: 'Failed to send SMS. Please try again.' });
    }

    console.log(`✅ [Semaphore] SMS sent for delivery ${delivery.ref_code}`);
    smsGuard.set(smsKey, Date.now());
    res.json({ success: true, message: 'SMS sent successfully.' });

  } catch (err) {
    console.error('❌ [Semaphore] Error sending SMS:', err.message);
    res.status(500).json({ success: false, message: 'Failed to send SMS. Please try again.' });
  } finally {
    if (smsGuard.get(smsKey) === 'sending') smsGuard.delete(smsKey); // a failed send can be retried straight away
  }
});

// =============================================================================
// SALES
// =============================================================================
app.get('/sales', async (req, res) => {
  const { data, error } = await db.from('sales').select('*').order('sale_date', { ascending: false });
  if (error) return res.status(500).json({ success: false, message: 'Failed to fetch sales' });
  res.json({ success: true, data });
});

// Sales + inventory: stock is deducted / restored INSIDE Postgres functions
// (see sales-inventory-migration.sql) so the sale and the stock change are one
// atomic transaction and concurrent sales cannot oversell an item.
const SALE_ERROR_STATUS = { INVALID_QUANTITY: 400, ITEM_NOT_FOUND: 404, NOT_FOUND: 404, OUT_OF_STOCK: 409, INSUFFICIENT_STOCK: 409 };
const hasValue = (v) => v !== undefined && v !== null && v !== '';
const toPositiveInt = (v) => { const n = Number(v); return Number.isInteger(n) && n > 0 ? n : null; };
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function respondSaleFailure(res, result) {
  const code = result && result.code;
  return res.status(SALE_ERROR_STATUS[code] || 400).json({
    success: false,
    code,
    available: result ? result.available : undefined,
    message: (result && result.message) || 'The sales request could not be completed'
  });
}

// The sale amount for an inventory item is ALWAYS computed here (inventory price x quantity),
// so the amount sent by the browser can never change what is saved.
// Returns { ok: true, amount } or { ok: false, status, body } (ready to send as the response).
async function computeSaleAmount(inventoryId, quantity) {
  const { data: item, error } = await db.from('inventory').select('id,price').eq('id', inventoryId).maybeSingle();
  if (error) {
    console.error('Inventory price lookup error:', error.message);
    return { ok: false, status: 500, body: { success: false, message: 'Failed to look up the item price' } };
  }
  if (!item) return { ok: false, status: 404, body: { success: false, code: 'ITEM_NOT_FOUND', message: 'That inventory item no longer exists. Please reselect the product.' } };
  const unitPrice = Number(item.price);
  if (!Number.isFinite(unitPrice) || unitPrice <= 0) {
    return { ok: false, status: 409, body: { success: false, code: 'NO_PRICE', message: 'This item has no price yet. Ask the Admin or Manager to set its price in Inventory first.' } };
  }
  return { ok: true, amount: Math.round(unitPrice * quantity * 100) / 100 };
}

app.post('/sales', requireRole('admin', 'manager', 'staff'), async (req, res) => {
  const { customer_name, product_name, amount, sale_date, inventory_id, quantity, request_id } = req.body;
  const customer = typeof customer_name === 'string' ? customer_name.trim() : '';
  if (!customer) {
    return res.status(400).json({ success: false, message: 'Customer name and a valid amount are required' });
  }

  // Manager dashboard still sends a typed product name (no stock change, as before).
  if (!hasValue(inventory_id)) {
    const amt = Number(amount);
    if (!Number.isFinite(amt) || amt <= 0) {
      return res.status(400).json({ success: false, message: 'Customer name and a valid amount are required' });
    }
    if (req.authUser.role !== 'manager') {
      return res.status(400).json({ success: false, message: 'Please select a product from the inventory list' });
    }
    if (!product_name) return res.status(400).json({ success: false, message: 'Customer name, product name, and amount are required' });
    const { data, error } = await db.from('sales').insert({ customer_name: customer, product_name, amount: amt, sale_date: sale_date || new Date() }).select().single();
    if (error) return res.status(500).json({ success: false, message: 'Failed to add sales record' });
    return res.status(201).json({ success: true, message: 'Sales record added successfully', id: data.id });
  }

  const invId = toPositiveInt(inventory_id);
  const qty = toPositiveInt(quantity);
  if (!invId) return res.status(400).json({ success: false, message: 'Please select a valid product from the inventory list' });
  if (!qty) return res.status(400).json({ success: false, message: 'Quantity must be a positive whole number' });

  const computed = await computeSaleAmount(invId, qty);
  if (!computed.ok) return res.status(computed.status).json(computed.body);

  const { data, error } = await db.rpc('create_sale_with_inventory', {
    p_customer_name: customer,
    p_inventory_id: invId,
    p_quantity: qty,
    p_amount: computed.amount,
    p_sale_date: sale_date || null,
    p_request_id: typeof request_id === 'string' && UUID_RE.test(request_id) ? request_id : null
  });
  if (error) {
    console.error('create_sale_with_inventory error:', error.message);
    return res.status(500).json({ success: false, message: 'Failed to add sales record' });
  }
  if (!data || !data.success) return respondSaleFailure(res, data);
  res.status(201).json({
    success: true,
    id: data.sale_id,
    remaining: data.remaining,
    duplicate: !!data.duplicate,
    message: data.duplicate
      ? 'This sales record was already saved.'
      : `Sales record added successfully. Remaining stock: ${data.remaining}`
  });
});

app.put('/sales/:id', requireRole('admin', 'manager', 'staff'), async (req, res) => {
  const saleId = toPositiveInt(req.params.id);
  if (!saleId) return res.status(400).json({ success: false, message: 'Invalid sales record' });
  const { customer_name, product_name, amount, sale_date, inventory_id, quantity } = req.body;
  const customer = typeof customer_name === 'string' ? customer_name.trim() : '';
  if (!customer) {
    return res.status(400).json({ success: false, message: 'All fields required' });
  }

  let invId = null;
  let qty = null;
  let amt = Number(amount);
  if (hasValue(inventory_id)) {
    invId = toPositiveInt(inventory_id);
    qty = toPositiveInt(quantity);
    if (!invId) return res.status(400).json({ success: false, message: 'Please select a valid product from the inventory list' });
    if (!qty) return res.status(400).json({ success: false, message: 'Quantity must be a positive whole number' });
    const computed = await computeSaleAmount(invId, qty); // amount is inventory price x quantity, never the browser's value
    if (!computed.ok) return res.status(computed.status).json(computed.body);
    amt = computed.amount;
  } else if (!Number.isFinite(amt) || amt <= 0) {
    // older record kept as-is (no inventory item): its amount is still entered by hand
    return res.status(400).json({ success: false, message: 'All fields required' });
  }

  const { data, error } = await db.rpc('update_sale_with_inventory', {
    p_sale_id: saleId,
    p_customer_name: customer,
    p_amount: amt,
    p_sale_date: sale_date || null,
    p_inventory_id: invId,
    p_quantity: qty,
    p_product_name: typeof product_name === 'string' ? product_name.trim() : null
  });
  if (error) {
    console.error('update_sale_with_inventory error:', error.message);
    return res.status(500).json({ success: false, message: 'Failed to update sales record' });
  }
  if (!data || !data.success) return respondSaleFailure(res, data);
  res.json({ success: true, message: 'Sales record updated successfully' });
});

app.delete('/sales/:id', requireRole('admin'), async (req, res) => {
  const saleId = toPositiveInt(req.params.id);
  if (!saleId) return res.status(400).json({ success: false, message: 'Invalid sales record' });
  const { data, error } = await db.rpc('delete_sale_with_inventory', { p_sale_id: saleId });
  if (error) {
    console.error('delete_sale_with_inventory error:', error.message);
    return res.status(500).json({ success: false, message: 'Failed to delete sales record' });
  }
  if (!data || !data.success) return respondSaleFailure(res, data);
  res.json({
    success: true,
    message: data.restored > 0
      ? `Sales record deleted. ${data.restored} unit(s) returned to inventory.`
      : 'Sales record deleted successfully'
  });
});

app.get('/sales/monthly', async (req, res) => {
  const { data, error } = await db.from('sales').select('sale_date, amount');
  if (error) return res.status(500).json({ error: 'Failed to fetch monthly sales data' });
  const grouped = {};
  data.forEach(row => {
    const d = new Date(row.sale_date);
    const key = `${d.getFullYear()}-${d.getMonth() + 1}`;
    if (!grouped[key]) grouped[key] = { month: d.getMonth() + 1, year: d.getFullYear(), total: 0 };
    grouped[key].total += parseFloat(row.amount);
  });
  res.json(Object.values(grouped).sort((a, b) => a.year - b.year || a.month - b.month));
});

// =============================================================================
// REVIEWS
// =============================================================================
app.get('/reviews', async (req, res) => {
  const requestedLimit = Number.parseInt(req.query.limit, 10);
  const limit = Number.isInteger(requestedLimit) && requestedLimit > 0
    ? Math.min(requestedLimit, 100)
    : null;
  let query = db.from('reviews').select('*').order('review_date', { ascending: false });
  if (limit) query = query.limit(limit);
  const { data, error } = await query;
  if (error) return res.status(500).json({ success: false, message: 'Failed to fetch reviews' });
  res.json({ success: true, data });
});

app.post('/reviews', withIdempotency('reviews', async (req, res) => {
  const { product_name, reviewer_name, rating, review_text, review_date, image } = req.body;
  if (!product_name || !reviewer_name || !rating || !review_text) return res.status(400).json({ success: false, message: 'All fields are required' });
  const { data, error } = await db.from('reviews').insert({ product_name, reviewer_name, rating, review_text, review_date: review_date || new Date(), image: image || '' }).select().single();
  if (error) return res.status(500).json({ success: false, message: 'Failed to add review' });
  res.status(201).json({ success: true, message: 'Review added successfully', id: data.id });
}));

app.put('/reviews/:id', async (req, res) => {
  const { product_name, review_text, review_date, image } = req.body;
  if (!product_name || !review_text) return res.status(400).json({ success: false, message: 'Product name and text are required' });
  const updateData = { product_name, review_text };
  if (review_date) updateData.review_date = review_date;
  if (image !== undefined) updateData.image = image;
  const { error } = await db.from('reviews').update(updateData).eq('id', req.params.id);
  if (error) {
    console.error('Review update error:', JSON.stringify(error));
    return res.status(500).json({ success: false, message: error.message || error.details || error.hint || JSON.stringify(error) || 'Failed to update review' });
  }
  res.json({ success: true, message: 'Review updated successfully' });
});

app.delete('/reviews/:id', async (req, res) => {
  const { error } = await db.from('reviews').delete().eq('id', req.params.id);
  if (error) return res.status(500).json({ success: false, message: 'Failed to delete review' });
  res.json({ success: true, message: 'Review deleted successfully' });
});

// =============================================================================
// BUSINESS INFO
// =============================================================================
app.get('/business-info', async (req, res) => {
  const { data, error } = await db.from('business_info').select('*').eq('id', 1).single();
  if (error || !data) return res.json({ success: true, data: { hero_title: 'About ECL FURNITURE MART', hero_description: 'We offer complete line of ready made home and office furnitures.', story: '', mission: '', return_policy: '', warranty_policy: '', delivery_policy: '', payment_policy: '' } });
  res.json({ success: true, data });
});

app.post('/business-info', async (req, res) => {
  const { hero_title, hero_description, story, mission, return_policy, warranty_policy, delivery_policy, payment_policy } = req.body;
  const { data: existing } = await db.from('business_info').select('id').eq('id', 1).single();
  if (!existing) {
    const { error } = await db.from('business_info').insert({ id: 1, hero_title, hero_description, story, mission, return_policy, warranty_policy, delivery_policy, payment_policy });
    if (error) return res.status(500).json({ success: false, message: 'Failed to save business info' });
  } else {
    const { error } = await db.from('business_info').update({ hero_title, hero_description, story, mission, return_policy, warranty_policy, delivery_policy, payment_policy, updated_at: new Date() }).eq('id', 1);
    if (error) return res.status(500).json({ success: false, message: 'Failed to update business info' });
  }
  res.json({ success: true, message: 'Business information saved successfully' });
});

app.get('/contact-info', async (req, res) => {
  const { data, error } = await db.from('contact_info').select('*').eq('id', 1).single();
  if (error || !data) return res.json({ success: true, data: { phone: '(044) 796-1234', email: 'info@eclfurniture.com', address: 'REAL BLDG 1 JP RIZAL STREET Poblacion Sta Maria Bulacan', business_hours: 'Mon-Sat: 9:00 AM - 6:00 PM' } });
  res.json({ success: true, data });
});

app.post('/contact-info', async (req, res) => {
  const { phone, email, address, business_hours } = req.body;
  const { data: existing } = await db.from('contact_info').select('id').eq('id', 1).single();
  if (!existing) {
    const { error } = await db.from('contact_info').insert({ id: 1, phone, email, address, business_hours });
    if (error) return res.status(500).json({ success: false, message: 'Failed to save contact info' });
  } else {
    const { error } = await db.from('contact_info').update({ phone, email, address, business_hours, updated_at: new Date() }).eq('id', 1);
    if (error) return res.status(500).json({ success: false, message: 'Failed to update contact info' });
  }
  res.json({ success: true, message: 'Contact information saved successfully' });
});

// =============================================================================
// ACCOUNT PHONE NUMBERS (registered mobile number of each Admin / Manager / Staff account)
// Used by the planned Semaphore SMS MFA. Nothing in this section sends an SMS or creates an OTP.
// =============================================================================
// Name of the phone column in the users table. Run the schema check + migration (SQL instructions) BEFORE deploying.
const USER_PHONE_COLUMN = 'phone_number';

// Accepts Philippine mobile numbers typed as 09171234567, 639171234567 or +639171234567
// (spaces, dashes, dots and brackets are allowed). Returns { ok: true, value: '+639171234567' } - the format that is
// stored in the database - or { ok: false, message }.
function normalizePhPhone(input) {
  if (typeof input !== 'string' || !input.trim()) return { ok: false, message: 'Phone number is required.' };
  const raw = input.trim();
  const invalid = { ok: false, message: 'Enter a valid Philippine mobile number (for example 09171234567 or +639171234567).' };
  if (raw.length > 20 || !/^\+?[0-9\s().-]+$/.test(raw)) return invalid;
  const digits = raw.replace(/\D/g, '');
  if (raw.startsWith('+') && !digits.startsWith('639')) return invalid;
  if (/^09\d{9}$/.test(digits)) return { ok: true, value: '+63' + digits.slice(1) };
  if (/^639\d{9}$/.test(digits)) return { ok: true, value: '+' + digits };
  return invalid;
}

// Masked version that is safe to show on the login page: only the last two digits are visible.
function maskPhone(storedPhone) {
  const n = normalizePhPhone(String(storedPhone || ''));
  return n.ok ? '+63 XXX XXX XX' + n.value.slice(-2) : null;
}

// For the Semaphore MFA task: finds the registered number of the account with this id (never a browser-supplied number).
// An account without a valid number gets a clear code/message and must NOT be allowed to skip MFA.
async function getMfaPhoneForUser(userId) {
  const { data, error } = await db.from('users').select(`id,${USER_PHONE_COLUMN}`).eq('id', userId).single();
  if (error || !data) return { ok: false, code: 'ACCOUNT_NOT_FOUND', message: 'Account not found.' };
  const stored = data[USER_PHONE_COLUMN];
  if (!stored) return { ok: false, code: 'MFA_PHONE_MISSING', message: 'No mobile number is registered for this account. Please contact the Administrator.' };
  const n = normalizePhPhone(stored);
  if (!n.ok) return { ok: false, code: 'MFA_PHONE_INVALID', message: 'The mobile number registered for this account is not valid. Please contact the Administrator.' };
  return { ok: true, phone: n.value, maskedPhone: maskPhone(n.value) };
}

// Account row as the dashboard receives it (the password hash is never included)
function publicAccount(row) {
  return { id: row.id, name: row.name, email: row.email, role: row.role, phone: row[USER_PHONE_COLUMN] || null, created_at: row.created_at };
}

// =============================================================================
// STAFF/MANAGER ACCOUNTS
// =============================================================================
app.get('/staff', requireRole('admin'), async (req, res) => {
  const { data, error } = await db.from('users').select(`id,name,email,role,${USER_PHONE_COLUMN},created_at`).neq('role', 'admin').order('created_at', { ascending: false });
  if (error) { console.error('Staff list error:', error.message); return res.status(500).json({ success: false, message: 'Failed to fetch staff accounts' }); }
  res.json({ success: true, data: data.map(publicAccount) });
});

app.post('/staff', requireRole('admin'), withIdempotency('staff', async (req, res) => {
  const { name, email, password, role, phone } = req.body;
  if (!name || !email || !password) return res.status(400).json({ success: false, message: 'Name, email, and password are required' });
  const phoneCheck = normalizePhPhone(phone);
  if (!phoneCheck.ok) return res.status(400).json({ success: false, message: phoneCheck.message });
  if (typeof password !== 'string' || password.length > 128) return res.status(400).json({ success: false, message: 'Invalid password' });
  const accountRole = role === 'manager' ? 'manager' : 'staff';
  const { data: existing } = await db.from('users').select('id').eq('email', email).single();
  if (existing) return res.status(400).json({ success: false, message: 'Email already exists' });
  const passwordHash = await hashForStorage(password);
  if (!passwordHash) return res.status(500).json({ success: false, message: 'Failed to create account' });
  const { data, error } = await db.from('users').insert({ name, email, password: passwordHash, role: accountRole, [USER_PHONE_COLUMN]: phoneCheck.value }).select().single();
  if (error && error.code === '23505') return res.status(400).json({ success: false, message: 'Email already exists' });
  if (error) return res.status(500).json({ success: false, message: 'Failed to create account' });
  res.status(201).json({ success: true, message: `${accountRole.charAt(0).toUpperCase() + accountRole.slice(1)} account created successfully`, id: data.id });
}));

// Edit a STAFF account (Admin only). Only accounts whose CURRENT role in the database is 'staff'
// can be edited here; Manager and Admin accounts are always rejected. The role can be changed to
// the same roles the existing "Create Account" flow can assign (staff / manager) - never admin.
const STAFF_EDITABLE_ROLES = ['staff', 'manager'];
const STAFF_EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

app.put('/staff/:id', requireRole('admin'), async (req, res) => {
  const rawId = String(req.params.id || '');
  const targetId = /^\d+$/.test(rawId) ? Number(rawId) : (UUID_RE.test(rawId) ? rawId : null);
  if (targetId === null) return res.status(400).json({ success: false, message: 'Invalid account.' });

  // ---- validate submitted fields ----
  const { name, email, role, password, phone } = req.body || {};
  const cleanName = typeof name === 'string' ? name.trim() : '';
  const cleanEmail = typeof email === 'string' ? email.trim() : '';
  const newRole = typeof role === 'string' ? role.trim().toLowerCase() : '';
  if (!cleanName || cleanName.length > 100) return res.status(400).json({ success: false, message: 'Full name is required (maximum 100 characters).' });
  if (!cleanEmail || cleanEmail.length > 254 || !STAFF_EMAIL_RE.test(cleanEmail)) return res.status(400).json({ success: false, message: 'A valid email is required.' });
  if (newRole === 'admin') return res.status(403).json({ success: false, message: 'You cannot assign the Admin role.' });
  if (!STAFF_EDITABLE_ROLES.includes(newRole)) return res.status(400).json({ success: false, message: 'Invalid role. Choose Staff or Manager.' });
  const changePassword = password !== undefined && password !== null && password !== '';
  if (changePassword && (typeof password !== 'string' || password.length > 128)) {
    return res.status(400).json({ success: false, message: 'Invalid password.' });
  }

  const phoneCheck = normalizePhPhone(phone);
  if (!phoneCheck.ok) return res.status(400).json({ success: false, message: phoneCheck.message });

  // ---- the target must currently be a Staff or Manager account (checked in the database, by unique id) ----
  const { data: target, error: targetError } = await db.from('users').select('id,name,email,role').eq('id', targetId).single();
  if (targetError && targetError.code !== 'PGRST116') return res.status(500).json({ success: false, message: 'Failed to load the account.' });
  if (!target) return res.status(404).json({ success: false, message: 'Account not found. Please refresh the list.' });
  if (String(target.id) === String(req.authUser.id)) return res.status(403).json({ success: false, message: 'You cannot edit your own account here.' });
  if (!STAFF_EDITABLE_ROLES.includes(target.role || 'staff')) return res.status(403).json({ success: false, message: 'Only Staff and Manager accounts can be edited here.' });

  // ---- email must not belong to another account ----
  const { data: clash, error: clashError } = await db.from('users').select('id').ilike('email', cleanEmail.replace(/[\\%_]/g, '\\$&')).neq('id', targetId).limit(1);
  if (clashError) return res.status(500).json({ success: false, message: 'Failed to validate the email.' });
  if (clash && clash.length > 0) return res.status(409).json({ success: false, message: 'Email already exists' });

  // ---- update (the role filter makes the write fail if the account stopped being Staff meanwhile) ----
  const updates = { name: cleanName, email: cleanEmail, role: newRole, [USER_PHONE_COLUMN]: phoneCheck.value };
  if (changePassword) {
    updates.password = await hashForStorage(password); // stored as a hash, same as signup/create
    if (!updates.password) return res.status(500).json({ success: false, message: 'Failed to update account' });
  }
  let query = db.from('users').update(updates).eq('id', targetId);
  query = target.role ? query.eq('role', target.role) : query.is('role', null);
  const { data: updated, error } = await query.select(`id,name,email,role,${USER_PHONE_COLUMN}`).single();
  if (error) {
    if (error.code === '23505') return res.status(409).json({ success: false, message: 'Email already exists' });
    if (error.code === 'PGRST116') return res.status(409).json({ success: false, message: 'This account changed while you were editing. Please refresh the list.' });
    console.error('Staff update error:', error.message);
    return res.status(500).json({ success: false, message: 'Failed to update account' });
  }
  if (changePassword || updated.role !== target.role) revokeUserSessions(updated.id); // they must log in again with the new details
  res.json({
    success: true,
    message: (updated.role === 'manager' ? 'Manager' : 'Staff') + ' account updated successfully',
    data: { id: updated.id, name: updated.name, email: updated.email, role: updated.role, phone: updated[USER_PHONE_COLUMN] || null }
  });
});

app.delete('/staff/:id', requireRole('admin'), async (req, res) => {
  const { error } = await db.from('users').delete().eq('id', req.params.id);
  if (error) return res.status(500).json({ success: false, message: 'Failed to delete account' });
  revokeUserSessions(req.params.id);
  res.json({ success: true, message: 'Account deleted successfully' });
});

// =============================================================================
// ADMIN - OWN ACCOUNT (name, email, phone number, password)
// The account being edited ALWAYS comes from the logged-in session (req.authUser), never from the request.
// The role can never be changed here. Changing the email, phone number or password needs the current password.
// =============================================================================
const reauthFailures = new Map(); // admin id -> { count, since }
const REAUTH_MAX_FAILURES = 5;
const REAUTH_WINDOW_MS = 15 * 60 * 1000;

function reauthLocked(userId) {
  const entry = reauthFailures.get(String(userId));
  if (!entry) return false;
  if (Date.now() - entry.since > REAUTH_WINDOW_MS) { reauthFailures.delete(String(userId)); return false; }
  return entry.count >= REAUTH_MAX_FAILURES;
}
function recordReauthFailure(userId) {
  const key = String(userId);
  const entry = reauthFailures.get(key);
  if (!entry || Date.now() - entry.since > REAUTH_WINDOW_MS) reauthFailures.set(key, { count: 1, since: Date.now() });
  else entry.count++;
}

app.get('/account/me', requireRole('admin'), async (req, res) => {
  const { data, error } = await db.from('users').select(`id,name,email,role,${USER_PHONE_COLUMN}`).eq('id', req.authUser.id).single();
  if (error || !data) return res.status(404).json({ success: false, message: 'Account not found.' });
  res.json({ success: true, data: { id: data.id, name: data.name, email: data.email, role: data.role, phone: data[USER_PHONE_COLUMN] || null } });
});

app.put('/account/me', requireRole('admin'), async (req, res) => {
  const body = req.body || {};
  const myId = req.authUser.id; // identity comes from the session only

  // A request that names another account, or tries to change the role, is refused outright
  if ((body.id !== undefined && String(body.id) !== String(myId)) || (body.userId !== undefined && String(body.userId) !== String(myId))) {
    return res.status(403).json({ success: false, message: 'You can only edit your own account here.' });
  }
  if (body.role !== undefined && String(body.role).trim().toLowerCase() !== 'admin') {
    return res.status(403).json({ success: false, message: 'You cannot change your own role.' });
  }

  // ---- validate fields ----
  const cleanName = typeof body.name === 'string' ? body.name.trim() : '';
  const cleanEmail = typeof body.email === 'string' ? body.email.trim() : '';
  if (!cleanName || cleanName.length > 100) return res.status(400).json({ success: false, message: 'Full name is required (maximum 100 characters).' });
  if (!cleanEmail || cleanEmail.length > 254 || !STAFF_EMAIL_RE.test(cleanEmail)) return res.status(400).json({ success: false, message: 'A valid email is required.' });
  const phoneCheck = normalizePhPhone(body.phone);
  if (!phoneCheck.ok) return res.status(400).json({ success: false, message: phoneCheck.message });
  const newPassword = body.newPassword;
  const changePassword = newPassword !== undefined && newPassword !== null && newPassword !== '';
  if (changePassword && (typeof newPassword !== 'string' || newPassword.length < 8 || newPassword.length > 128)) {
    return res.status(400).json({ success: false, message: 'The new password must be 8 to 128 characters long.' });
  }
  if (body.currentPassword !== undefined && body.currentPassword !== null && (typeof body.currentPassword !== 'string' || body.currentPassword.length > 128)) {
    return res.status(400).json({ success: false, message: 'Invalid current password.' });
  }

  // ---- current record ----
  const { data: current, error: loadError } = await db.from('users').select(`id,name,email,role,password,${USER_PHONE_COLUMN}`).eq('id', myId).single();
  if (loadError || !current) return res.status(404).json({ success: false, message: 'Account not found.' });
  if ((current.role || 'staff') !== 'admin') return res.status(403).json({ success: false, message: 'Only the Admin can use this.' });

  const storedPhone = current[USER_PHONE_COLUMN] ? normalizePhPhone(String(current[USER_PHONE_COLUMN])) : null;
  const emailChanged = cleanEmail !== current.email;
  const phoneChanged = !storedPhone || !storedPhone.ok || storedPhone.value !== phoneCheck.value;
  const sensitiveChange = emailChanged || phoneChanged || changePassword;

  // ---- re-authentication for sensitive changes (the phone number is where MFA codes are sent) ----
  if (sensitiveChange) {
    if (typeof body.currentPassword !== 'string' || body.currentPassword === '') {
      return res.status(400).json({ success: false, message: 'Enter your current password to change your email, phone number or password.' });
    }
    if (reauthLocked(myId)) return res.status(429).json({ success: false, message: 'Too many incorrect attempts. Please try again in 15 minutes.' });
    const check = await verifyPassword(body.currentPassword, current.password);
    if (!check.ok) {
      recordReauthFailure(myId);
      // 403 (not 401) on purpose: the session itself is still valid
      return res.status(403).json({ success: false, message: 'Your current password is incorrect.' });
    }
    reauthFailures.delete(String(myId));
    if (changePassword && newPassword === body.currentPassword) {
      return res.status(400).json({ success: false, message: 'The new password must be different from the current one.' });
    }
  }

  // ---- email must not belong to another account ----
  if (emailChanged) {
    const { data: clash, error: clashError } = await db.from('users').select('id').ilike('email', cleanEmail.replace(/[\\%_]/g, '\\$&')).neq('id', myId).limit(1);
    if (clashError) return res.status(500).json({ success: false, message: 'Failed to validate the email.' });
    if (clash && clash.length > 0) return res.status(409).json({ success: false, message: 'Email already exists' });
  }

  // ---- save (role is never part of the update; the filter makes sure only the Admin row is touched) ----
  const updates = { name: cleanName, email: cleanEmail, [USER_PHONE_COLUMN]: phoneCheck.value };
  if (changePassword) {
    updates.password = await hashForStorage(newPassword);
    if (!updates.password) return res.status(500).json({ success: false, message: 'Failed to update your account.' });
  }
  const { data: updated, error } = await db.from('users').update(updates).eq('id', myId).eq('role', 'admin').select(`id,name,email,role,${USER_PHONE_COLUMN}`).single();
  if (error) {
    if (error.code === '23505') return res.status(409).json({ success: false, message: 'Email already exists' });
    console.error('Own account update error:', error.message);
    return res.status(500).json({ success: false, message: 'Failed to update your account.' });
  }

  const result = {
    success: true,
    message: 'Your account was updated successfully.',
    data: { id: updated.id, name: updated.name, email: updated.email, role: updated.role, phone: updated[USER_PHONE_COLUMN] || null }
  };
  if (sensitiveChange) {
    // Session safeguard: every session of this account (including other browsers) is ended and this browser gets a fresh one
    revokeUserSessions(updated.id);
    result.token = createSession({ id: updated.id, role: updated.role });
  }
  res.json(result);
});

// =============================================================================
// CHATBOT Q&A
// =============================================================================
app.get('/chatbot', async (req, res) => {
  const { data, error } = await db.from('chatbot_qa').select('*').order('category').order('created_at', { ascending: false });
  if (error) return res.status(500).json({ success: false, message: 'Failed to fetch chatbot Q&As' });
  res.json({ success: true, data });
});

app.post('/chatbot', withIdempotency('chatbot', async (req, res) => {
  const { question, answer, category } = req.body;
  if (!question || !answer) return res.status(400).json({ success: false, message: 'Question and answer are required' });
  const { data, error } = await db.from('chatbot_qa').insert({ question, answer, category: category || 'General' }).select().single();
  if (error) return res.status(500).json({ success: false, message: 'Failed to add Q&A' });
  res.status(201).json({ success: true, message: 'Q&A added successfully', id: data.id });
}));

app.put('/chatbot/:id', async (req, res) => {
  const { question, answer, category } = req.body;
  const { error } = await db.from('chatbot_qa').update({ question, answer, category: category || 'General', updated_at: new Date() }).eq('id', req.params.id);
  if (error) return res.status(500).json({ success: false, message: 'Failed to update Q&A' });
  res.json({ success: true, message: 'Q&A updated successfully' });
});

app.delete('/chatbot/:id', async (req, res) => {
  const { error } = await db.from('chatbot_qa').delete().eq('id', req.params.id);
  if (error) return res.status(500).json({ success: false, message: 'Failed to delete Q&A' });
  res.json({ success: true, message: 'Q&A deleted successfully' });
});

// =============================================================================
// CUSTOMER INQUIRIES
// =============================================================================
app.get('/inquiries', async (req, res) => {
  const { data, error } = await db.from('customer_inquiries').select('*').order('created_at', { ascending: false });
  if (error) return res.status(500).json({ success: false, message: 'Failed to fetch inquiries' });
  res.json({ success: true, data });
});

app.post('/inquiries', withIdempotency('inquiries', async (req, res) => {
  const { customer_name, email, phone, subject, message } = req.body;
  if (!customer_name || !email || !message) return res.status(400).json({ success: false, message: 'Name, email, and message are required' });
  const { data, error } = await db.from('customer_inquiries').insert({ customer_name, email, phone: phone || null, subject: subject || 'General', message }).select().single();
  if (error) return res.status(500).json({ success: false, message: 'Failed to submit inquiry' });
  res.status(201).json({ success: true, message: 'Inquiry submitted successfully', id: data.id });
}));

app.put('/inquiries/:id/status', async (req, res) => {
  const { status } = req.body;
  if (!['new', 'read', 'replied'].includes(status)) return res.status(400).json({ success: false, message: 'Invalid status' });
  const { error } = await db.from('customer_inquiries').update({ status }).eq('id', req.params.id);
  if (error) return res.status(500).json({ success: false, message: 'Failed to update status' });
  res.json({ success: true, message: 'Status updated successfully' });
});

app.delete('/inquiries/:id', async (req, res) => {
  const { error } = await db.from('customer_inquiries').delete().eq('id', req.params.id);
  if (error) return res.status(500).json({ success: false, message: 'Failed to delete inquiry' });
  res.json({ success: true, message: 'Inquiry deleted successfully' });
});

// =============================================================================
// CUSTOMER FEEDBACK
// =============================================================================
app.get('/feedback', async (req, res) => {
  const { data, error } = await db.from('customer_feedback').select('*').order('created_at', { ascending: false });
  if (error) return res.status(500).json({ success: false, message: 'Failed to fetch feedback' });
  res.json({ success: true, data });
});

app.post('/feedback', withIdempotency('feedback', async (req, res) => {
  const { customer_name, email, product_name, rating, feedback_text } = req.body;
  if (!customer_name || !feedback_text) return res.status(400).json({ success: false, message: 'Name and feedback are required' });
  const { data, error } = await db.from('customer_feedback').insert({ customer_name, email: email || null, product_name: product_name || null, rating: rating || 3, feedback_text }).select().single();
  if (error) return res.status(500).json({ success: false, message: 'Failed to submit feedback' });
  res.status(201).json({ success: true, message: 'Feedback submitted successfully', id: data.id });
}));

app.delete('/feedback/:id', async (req, res) => {
  const { error } = await db.from('customer_feedback').delete().eq('id', req.params.id);
  if (error) return res.status(500).json({ success: false, message: 'Failed to delete feedback' });
  res.json({ success: true, message: 'Feedback deleted successfully' });
});

// =============================================================================
// AI VISUALIZATION — Gemini
// =============================================================================

// Which Gemini image model to use. Defaults to Nano Banana 2.1.
// Set GEMINI_IMAGE_MODEL in Render > Environment to switch models without changing code.
const IMAGE_MODEL = process.env.GEMINI_IMAGE_MODEL || 'gemini-nano-banana-2.1';

// Render runs behind a proxy, so this lets req.ip be the real visitor IP
app.set('trust proxy', 1);

// Limit Visualize tries per visitor per day (each try costs money).
// Kept in memory, so it resets if the server restarts or sleeps.
const MAX_VISUALIZE_PER_DAY = Number(process.env.VISUALIZE_DAILY_LIMIT) || 3;
const visualizeUsage = new Map(); // ip -> { count, resetAt }
const visualizeInFlight = new Set(); // ips that currently have a generation running

// Room photo rules (the browser already shrinks photos before sending)
const ALLOWED_ROOM_TYPES = ['image/jpeg', 'image/png', 'image/webp'];
const MAX_ROOM_IMAGE_BYTES = 8 * 1024 * 1024; // decoded size
const MAX_PLACEMENT_LENGTH = 500;
const ALLOWED_STYLES = ['Modern', 'Classic', 'Minimalist', 'Rustic', 'Scandinavian', 'Industrial'];

function limitVisualize(req, res, next) {
  const now = Date.now();
  let usage = visualizeUsage.get(req.ip);
  if (!usage || now > usage.resetAt) {
    usage = { count: 0, resetAt: now + 24 * 60 * 60 * 1000 };
    visualizeUsage.set(req.ip, usage);
  }
  if (usage.count >= MAX_VISUALIZE_PER_DAY) {
    return res.status(429).json({
      success: false,
      message: `You've reached today's limit of ${MAX_VISUALIZE_PER_DAY} visualizations. Please try again tomorrow, or contact us for help.`
    });
  }
  // Block double-clicks / multiple tabs from starting two paid generations at once
  if (visualizeInFlight.has(req.ip)) {
    return res.status(429).json({
      success: false,
      message: 'Your previous visualization is still being generated. Please wait for it to finish.'
    });
  }
  visualizeInFlight.add(req.ip);
  res.on('close', () => visualizeInFlight.delete(req.ip));
  // Only count requests that actually produced an image
  res.on('finish', () => { if (res.statusCode === 200) usage.count++; });
  next();
}

// Room photo must be a base64 data-URL (never a link, so the server can't be tricked into fetching URLs)
function parseRoomImage(src) {
  if (typeof src !== 'string' || !src.startsWith('data:image/')) return { error: 'Invalid room image. Please upload a JPG, PNG or WEBP photo.' };
  const comma = src.indexOf(',');
  if (comma === -1) return { error: 'Invalid room image. Please upload a JPG, PNG or WEBP photo.' };
  const [mimeType, encoding] = src.slice(5, comma).split(';');
  if (encoding !== 'base64' || !ALLOWED_ROOM_TYPES.includes(mimeType)) return { error: 'Invalid room image. Please upload a JPG, PNG or WEBP photo.' };
  const data = src.slice(comma + 1);
  if (!data) return { error: 'Invalid room image. Please upload a JPG, PNG or WEBP photo.' };
  if (data.length * 0.75 > MAX_ROOM_IMAGE_BYTES) return { error: 'Your room photo is too large. Please upload a smaller photo.' };
  return { image: { mimeType, data } };
}

// Converts the furniture image (a data-URL or a normal image URL from the database) into the format Gemini expects
async function toInlineImage(src) {
  if (!src) return null;
  if (src.startsWith('data:')) {
    const m = src.match(/^data:(image\/[\w+.-]+);base64,(.+)$/s);
    return m ? { mimeType: m[1], data: m[2] } : null;
  }
  const r = await fetch(src, { signal: AbortSignal.timeout(15000) });
  if (!r.ok) return null;
  const mimeType = (r.headers.get('content-type') || 'image/jpeg').split(';')[0];
  return { mimeType, data: Buffer.from(await r.arrayBuffer()).toString('base64') };
}

// Turns raw Gemini/SDK errors into a safe, friendly message (the real error is only logged on the server)
function friendlyGeminiError(err) {
  const status = Number(err?.status || err?.code || err?.error?.code) || 0;
  const msg = String(err?.message || '').toLowerCase();

  if (status === 429 || msg.includes('resource_exhausted') || msg.includes('rate limit') || msg.includes('quota')) {
    return { status: 503, message: 'The AI service is busy right now. Please wait a minute and try again.' };
  }
  if (status === 401 || status === 403 || msg.includes('api key') || msg.includes('permission_denied') || msg.includes('billing')) {
    return { status: 503, message: 'The visualization service is temporarily unavailable. Please contact the store for help.' };
  }
  if (status === 404 || msg.includes('not found')) {
    return { status: 503, message: 'The visualization service is temporarily unavailable. Please contact the store for help.' };
  }
  if (status === 400 || msg.includes('invalid_argument')) {
    return { status: 400, message: 'The AI could not process this photo. Please try a different JPG or PNG photo.' };
  }
  if (msg.includes('fetch failed') || msg.includes('econnreset') || msg.includes('etimedout') || msg.includes('enotfound') || msg.includes('network')) {
    return { status: 502, message: 'We could not reach the AI service. Please try again in a moment.' };
  }
  return { status: 500, message: 'AI processing failed. Please try again.' };
}

app.post('/api/visualize', limitVisualize, async (req, res) => {
  try {
    const { furnitureId, style, roomImage, placementInstructions, referenceSize } = req.body;
    if (!furnitureId || !roomImage) return res.status(400).json({ success: false, message: 'Furniture ID and room image are required.' });
    if (typeof placementInstructions !== 'string' || !placementInstructions.trim()) return res.status(400).json({ success: false, message: 'Please describe where to place the furniture.' });
    if (!process.env.GEMINI_API_KEY) {
      console.error('❌ GEMINI_API_KEY is missing in the server environment.');
      return res.status(503).json({ success: false, message: 'The visualization service is temporarily unavailable. Please contact the store for help.' });
    }

    const parsedRoom = parseRoomImage(roomImage);
    if (parsedRoom.error) return res.status(400).json({ success: false, message: parsedRoom.error });
    const room = parsedRoom.image;

    const { data: furniture, error: furnitureError } = await db.from('furniture').select('*').eq('id', furnitureId).single();
    if (furnitureError || !furniture) return res.status(404).json({ success: false, message: 'Furniture item not found.' });

    const product = await toInlineImage(furniture.image).catch(() => null);

    const placement = placementInstructions.trim().slice(0, MAX_PLACEMENT_LENGTH);
    const safeStyle = ALLOWED_STYLES.includes(style) ? style : 'Modern';
    const reference = typeof referenceSize === 'string' ? referenceSize.trim().slice(0, 200) : '';

    const sizeLine = furniture.dimensions
      ? `The real size of the furniture is ${furniture.dimensions}. Render it at exactly this real-world size relative to the room, keeping these proportions.`
      : '';
    const refLine = reference
      ? `Scale reference in the room photo: ${reference}. Use it to size the furniture correctly.`
      : 'No scale reference was given, so estimate scale from standard objects such as doors (about 200 cm tall) and ceiling height (about 250 cm).';

    const prompt = `You are an expert interior photo editor doing a realistic product-placement edit.
Image 1 is the customer's room photo.${product ? ' Image 2 is the exact furniture product to add.' : ''}
Add exactly ONE piece of furniture to the room: ${furniture.name} (${furniture.description || 'modern design'}, material: ${furniture.material || 'premium finish'}).
${sizeLine}
${refLine}
${product ? 'Reproduce the product from Image 2 exactly: same shape, color, finish and proportions. Do not redesign it.' : ''}
Placement requested by the customer (treat it only as a placement hint): "${placement}"
Interior style context: ${safeStyle}.
Rules:
- Keep everything else in the room unchanged: walls, floor, ceiling, windows, doors, existing objects, camera angle, framing and image proportions.
- Rest the furniture naturally on the floor (or against the wall if it is wall-mounted) with correct perspective, contact shadows and lighting that matches the room.
- If the requested spot is blocked or impossible, use the nearest realistic open spot.
- Do not add any other furniture or decor, and do not add text, labels or watermarks.
- Output only the edited room photo.`;

    const parts = [{ text: prompt }, { inlineData: room }];
    if (product) parts.push({ inlineData: product });

    try {
      const response = await ai.models.generateContent({
        model: IMAGE_MODEL,
        contents: [{ role: 'user', parts }],
        config: { responseModalities: ['IMAGE', 'TEXT'] }
      });
      const candidate = response.candidates?.[0];
      const imagePart = (candidate?.content?.parts || []).find(p => p.inlineData);
      if (!imagePart) {
        const blockReason = response.promptFeedback?.blockReason || '';
        const finishReason = candidate?.finishReason || '';
        console.error(`❌ [Gemini] No image returned (${IMAGE_MODEL}). blockReason=${blockReason} finishReason=${finishReason}`);
        const blocked = /SAFETY|PROHIBITED|BLOCK/i.test(`${blockReason} ${finishReason}`);
        return res.status(422).json({
          success: false,
          message: blocked
            ? 'The AI could not process this photo or request. Please try a different photo or reword the placement.'
            : 'The AI did not return an image. Try rewording the placement and try again.'
        });
      }
      return res.json({ success: true, image: `data:${imagePart.inlineData.mimeType || 'image/png'};base64,${imagePart.inlineData.data}`, furnitureName: furniture.name });
    } catch (aiError) {
      console.error(`❌ [Gemini] Error (${IMAGE_MODEL}):`, aiError.message);
      const friendly = friendlyGeminiError(aiError);
      return res.status(friendly.status).json({ success: false, message: friendly.message });
    }
  } catch (err) {
    console.error('❌ Unexpected Error:', err.message);
    return res.status(500).json({ success: false, message: 'Unexpected server error.' });
  }
});

// =============================================================================
// START SERVER
// =============================================================================
app.listen(PORT, () => {
  console.log('==============================================');
  console.log(`🚀 Server is running on http://localhost:${PORT}`);
  console.log('==============================================');
});