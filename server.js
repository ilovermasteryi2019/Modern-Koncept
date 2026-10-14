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
// AUTH
// =============================================================================
// Hashes a password for storage. Returns null (and the caller answers 500) if hashing fails.
async function hashForStorage(password) {
  try { return await hashPassword(password); } catch (e) { console.error('Password hashing failed:', e.message); return null; }
}

app.post('/signup', async (req, res) => {
  const { name, email, password } = req.body;
  if (!name || !email || !password) return res.status(400).json({ success: false, message: 'All fields are required' });
  if (typeof password !== 'string' || password.length > 128) return res.status(400).json({ success: false, message: 'Invalid password' });
  const { data: existing } = await db.from('users').select('id').eq('email', email).single();
  if (existing) return res.status(400).json({ success: false, message: 'Email already exists' });
  const passwordHash = await hashForStorage(password);
  if (!passwordHash) return res.status(500).json({ success: false, message: 'Failed to create account' });
  const { data, error } = await db.from('users').insert({ name, email, password: passwordHash, role: 'staff' }).select().single();
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
  const loggedInUser = { id: data.id, name: data.name, email: data.email, role: data.role || 'staff' };
  res.json({ success: true, message: 'Login successful', user: loggedInUser, token: createSession(loggedInUser) });
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

app.post('/add-product', async (req, res) => {
  const { name, category, price, material, dimensions, description, image, discounted_price } = req.body;
  if (!name || !category || !price) return res.status(400).json({ success: false, message: 'Name, category, and price are required' });
  const discount = parseDiscountedPrice(discounted_price, price);
  if (!discount.ok) return res.status(400).json({ success: false, message: discount.message });
  const { data, error } = await db.from('furniture').insert({ name, category, price, discounted_price: discount.value, material: material || '', dimensions: dimensions || '', description: description || '', image: image || '' }).select().single();
  if (error) return res.status(500).json({ success: false, message: 'Failed to add furniture' });
  res.status(201).json({ success: true, message: 'Furniture added successfully', id: data.id });
});

app.put('/products/:id', async (req, res) => {
  const { name, category, price, material, dimensions, description, image, discounted_price } = req.body;
  const discount = parseDiscountedPrice(discounted_price, price);
  if (!discount.ok) return res.status(400).json({ success: false, message: discount.message });
  const { error } = await db.from('furniture').update({ name, category, price, discounted_price: discount.value, material, dimensions, description, image }).eq('id', req.params.id);
  if (error) return res.status(500).json({ success: false, message: 'Failed to update furniture' });
  res.json({ success: true, message: 'Furniture updated successfully' });
});

app.delete('/products/:id', async (req, res) => {
  const { error } = await db.from('furniture').delete().eq('id', req.params.id);
  if (error) return res.status(500).json({ success: false, message: 'Failed to delete furniture' });
  res.json({ success: true, message: 'Furniture deleted successfully' });
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

app.post('/deliveries', requireRole('admin', 'manager', 'staff'), async (req, res) => {
  const { customer_name, contact_number, address, product, status, delivery_type, delivery_date } = req.body;
  if (!customer_name || !address) return res.status(400).json({ success: false, message: 'Customer name and address are required' });
  if (status && !['Pending', 'Processing', 'In Transit', 'Delivered'].includes(status)) return res.status(400).json({ success: false, message: 'Invalid status' });
  const ref_code = generateRefCode();
  const { data, error } = await db.from('deliveries').insert({ ref_code, customer_name, contact_number: contact_number || null, address, product: product || 'N/A', status: status || 'Pending', delivery_type: delivery_type || 'Outbound', delivery_date: delivery_date || null }).select().single();
  if (error) return res.status(500).json({ success: false, message: 'Failed to create delivery' });
  res.status(201).json({ success: true, message: 'Delivery created successfully', id: data.id, ref_code });
});

app.put('/deliveries/:id', requireRole('admin'), async (req, res) => {
  const { customer_name, contact_number, address, product, status, delivery_type, delivery_date } = req.body;
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
app.post('/deliveries/:id/send-sms', requireRole('admin', 'manager'), async (req, res) => {
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
    res.json({ success: true, message: 'SMS sent successfully.' });

  } catch (err) {
    console.error('❌ [Semaphore] Error sending SMS:', err.message);
    res.status(500).json({ success: false, message: 'Failed to send SMS. Please try again.' });
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

app.post('/reviews', async (req, res) => {
  const { product_name, reviewer_name, rating, review_text, review_date, image } = req.body;
  if (!product_name || !reviewer_name || !rating || !review_text) return res.status(400).json({ success: false, message: 'All fields are required' });
  const { data, error } = await db.from('reviews').insert({ product_name, reviewer_name, rating, review_text, review_date: review_date || new Date(), image: image || '' }).select().single();
  if (error) return res.status(500).json({ success: false, message: 'Failed to add review' });
  res.status(201).json({ success: true, message: 'Review added successfully', id: data.id });
});

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
// STAFF/MANAGER ACCOUNTS
// =============================================================================
app.get('/staff', requireRole('admin'), async (req, res) => {
  const { data, error } = await db.from('users').select('id,name,email,role,created_at').neq('role', 'admin').order('created_at', { ascending: false });
  if (error) return res.status(500).json({ success: false, message: 'Failed to fetch staff accounts' });
  res.json({ success: true, data });
});

app.post('/staff', requireRole('admin'), async (req, res) => {
  const { name, email, password, role } = req.body;
  if (!name || !email || !password) return res.status(400).json({ success: false, message: 'Name, email, and password are required' });
  if (typeof password !== 'string' || password.length > 128) return res.status(400).json({ success: false, message: 'Invalid password' });
  const accountRole = role === 'manager' ? 'manager' : 'staff';
  const { data: existing } = await db.from('users').select('id').eq('email', email).single();
  if (existing) return res.status(400).json({ success: false, message: 'Email already exists' });
  const passwordHash = await hashForStorage(password);
  if (!passwordHash) return res.status(500).json({ success: false, message: 'Failed to create account' });
  const { data, error } = await db.from('users').insert({ name, email, password: passwordHash, role: accountRole }).select().single();
  if (error) return res.status(500).json({ success: false, message: 'Failed to create account' });
  res.status(201).json({ success: true, message: `${accountRole.charAt(0).toUpperCase() + accountRole.slice(1)} account created successfully`, id: data.id });
});

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
  const { name, email, role, password } = req.body || {};
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

  // ---- the target must currently be a Staff account (checked in the database, by unique id) ----
  const { data: target, error: targetError } = await db.from('users').select('id,name,email,role').eq('id', targetId).single();
  if (targetError && targetError.code !== 'PGRST116') return res.status(500).json({ success: false, message: 'Failed to load the account.' });
  if (!target) return res.status(404).json({ success: false, message: 'Account not found. Please refresh the list.' });
  if (String(target.id) === String(req.authUser.id)) return res.status(403).json({ success: false, message: 'You cannot edit your own account here.' });
  if ((target.role || 'staff') !== 'staff') return res.status(403).json({ success: false, message: 'Only Staff accounts can be edited here.' });

  // ---- email must not belong to another account ----
  const { data: clash, error: clashError } = await db.from('users').select('id').ilike('email', cleanEmail.replace(/[\\%_]/g, '\\$&')).neq('id', targetId).limit(1);
  if (clashError) return res.status(500).json({ success: false, message: 'Failed to validate the email.' });
  if (clash && clash.length > 0) return res.status(409).json({ success: false, message: 'Email already exists' });

  // ---- update (the role filter makes the write fail if the account stopped being Staff meanwhile) ----
  const updates = { name: cleanName, email: cleanEmail, role: newRole };
  if (changePassword) {
    updates.password = await hashForStorage(password); // stored as a hash, same as signup/create
    if (!updates.password) return res.status(500).json({ success: false, message: 'Failed to update account' });
  }
  let query = db.from('users').update(updates).eq('id', targetId);
  query = target.role ? query.eq('role', target.role) : query.is('role', null);
  const { data: updated, error } = await query.select('id,name,email,role').single();
  if (error) {
    if (error.code === '23505') return res.status(409).json({ success: false, message: 'Email already exists' });
    if (error.code === 'PGRST116') return res.status(409).json({ success: false, message: 'This account changed while you were editing. Please refresh the list.' });
    console.error('Staff update error:', error.message);
    return res.status(500).json({ success: false, message: 'Failed to update account' });
  }
  if (changePassword || updated.role !== target.role) revokeUserSessions(updated.id); // they must log in again with the new details
  const promoted = updated.role !== 'staff';
  res.json({
    success: true,
    message: promoted ? 'Account updated. It is now a Manager account and can no longer be edited here.' : 'Staff account updated successfully',
    data: { id: updated.id, name: updated.name, email: updated.email, role: updated.role }
  });
});

app.delete('/staff/:id', requireRole('admin'), async (req, res) => {
  const { error } = await db.from('users').delete().eq('id', req.params.id);
  if (error) return res.status(500).json({ success: false, message: 'Failed to delete account' });
  revokeUserSessions(req.params.id);
  res.json({ success: true, message: 'Account deleted successfully' });
});

// =============================================================================
// CHATBOT Q&A
// =============================================================================
app.get('/chatbot', async (req, res) => {
  const { data, error } = await db.from('chatbot_qa').select('*').order('category').order('created_at', { ascending: false });
  if (error) return res.status(500).json({ success: false, message: 'Failed to fetch chatbot Q&As' });
  res.json({ success: true, data });
});

app.post('/chatbot', async (req, res) => {
  const { question, answer, category } = req.body;
  if (!question || !answer) return res.status(400).json({ success: false, message: 'Question and answer are required' });
  const { data, error } = await db.from('chatbot_qa').insert({ question, answer, category: category || 'General' }).select().single();
  if (error) return res.status(500).json({ success: false, message: 'Failed to add Q&A' });
  res.status(201).json({ success: true, message: 'Q&A added successfully', id: data.id });
});

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

app.post('/inquiries', async (req, res) => {
  const { customer_name, email, phone, subject, message } = req.body;
  if (!customer_name || !email || !message) return res.status(400).json({ success: false, message: 'Name, email, and message are required' });
  const { data, error } = await db.from('customer_inquiries').insert({ customer_name, email, phone: phone || null, subject: subject || 'General', message }).select().single();
  if (error) return res.status(500).json({ success: false, message: 'Failed to submit inquiry' });
  res.status(201).json({ success: true, message: 'Inquiry submitted successfully', id: data.id });
});

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

app.post('/feedback', async (req, res) => {
  const { customer_name, email, product_name, rating, feedback_text } = req.body;
  if (!customer_name || !feedback_text) return res.status(400).json({ success: false, message: 'Name and feedback are required' });
  const { data, error } = await db.from('customer_feedback').insert({ customer_name, email: email || null, product_name: product_name || null, rating: rating || 3, feedback_text }).select().single();
  if (error) return res.status(500).json({ success: false, message: 'Failed to submit feedback' });
  res.status(201).json({ success: true, message: 'Feedback submitted successfully', id: data.id });
});

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