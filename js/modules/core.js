// =============================================================================
// K-DESK · core.js
// Config + request plumbing: API_URL, API object, auth header, fetch interceptor (401 handler injected by auth.js, duplicate-write guard), idempotency keys, formatting / escaping / phone helpers.
// Cut from the original main.js (lines 329-2891 region). Code is unchanged except where a comment says otherwise.
// =============================================================================



export const API_URL = 'https://modern-koncept.onrender.com';

// -----------------------------------------------------------------------------
// Idempotency keys for create requests
// The same key is reused only while the outcome of the previous attempt is unknown (network error / timeout),
// so a retry can never create a second record. Any answer from the server (saved or rejected) ends the attempt.
// -----------------------------------------------------------------------------
const kdRequestIds = {};

function kdNewId() {
  if (window.crypto && typeof window.crypto.randomUUID === 'function') return window.crypto.randomUUID();
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, c => {
    const r = Math.random() * 16 | 0;
    return (c === 'x' ? r : (r & 0x3 | 0x8)).toString(16);
  });
}

function kdRequestId(scope, payload) {
  const fingerprint = JSON.stringify(payload || {});
  const saved = kdRequestIds[scope];
  if (saved && saved.fingerprint === fingerprint) return saved.id;
  const id = kdNewId();
  kdRequestIds[scope] = { id, fingerprint };
  return id;
}

export async function kdCreateOnce(scope, data, createFn) {
  const payload = { ...data, request_id: kdRequestId(scope, data) };
  const result = await createFn(payload);
  if (result && typeof result === 'object') delete kdRequestIds[scope]; // the server answered: the next attempt is a new request
  return result;
}

// Adds the login token (issued by the backend at login) so the backend can verify the user's role
export function authHeaders(extra = {}) {
  const token = sessionStorage.getItem('authToken');
  return token ? { ...extra, Authorization: `Bearer ${token}` } : extra;
}

// Any API answer of 401 to a request that carried our login token means the session is over
const nativeFetch = window.fetch.bind(window);

// The 401 handler is registered by auth.js (setUnauthorizedHandler), so core never imports auth.
let kdUnauthorizedHandler = null;
export function setUnauthorizedHandler(fn) { kdUnauthorizedHandler = fn; }

async function kdFetchWithSessionCheck(input, init) {
  const response = await nativeFetch(input, init);
  try {
    const url = typeof input === 'string' ? input : ((input && input.url) || '');
    const sentToken = !!(init && init.headers && init.headers.Authorization);
    if (response.status === 401 && sentToken && url.startsWith(API_URL) && kdUnauthorizedHandler) kdUnauthorizedHandler('expired');
  } catch (e) { /* never break a request because of this check */ }
  return response;
}

// Safety net against duplicate records: while a write request (POST/PUT/PATCH/DELETE) is still running, an
// IDENTICAL one (same method, address, login and body) is not sent again - the second caller simply receives the
// answer of the first. Once the first request has finished, a new identical request is sent normally.
const kdPendingWrites = new Map();

function kdWriteKey(input, init) {
  try {
    const url = typeof input === 'string' ? input : ((input && input.url) || '');
    if (!url.startsWith(API_URL)) return null;
    const method = String((init && init.method) || (input && input.method) || 'GET').toUpperCase();
    if (method === 'GET' || method === 'HEAD' || method === 'OPTIONS') return null;
    if (init && (init.keepalive || init.signal)) return null; // logout beacons and abortable requests keep their own behaviour
    const body = init && init.body;
    if (body !== undefined && typeof body !== 'string') return null;
    const auth = (init && init.headers && init.headers.Authorization) || '';
    return `${method} ${url} ${auth} ${body || ''}`;
  } catch (e) { return null; }
}

window.fetch = function (input, init) {
  const key = kdWriteKey(input, init);
  if (!key) return kdFetchWithSessionCheck(input, init);
  let pending = kdPendingWrites.get(key);
  if (!pending) {
    pending = kdFetchWithSessionCheck(input, init).finally(() => kdPendingWrites.delete(key));
    kdPendingWrites.set(key, pending);
  }
  return pending.then(response => response.clone());
};

// =============================================================================
// API OBJECT
// =============================================================================
export const API = {
  signup: async (name, email, password) => {
    const r = await fetch(`${API_URL}/signup`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ name, email, password }) });
    return r.json();
  },
  login: async (email, password) => {
    const r = await fetch(`${API_URL}/login`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ email, password }) });
    return r.json();
  },
  getFurniture: async () => (await fetch(`${API_URL}/products`)).json(),
  updateFurniture: async (id, data) => (await fetch(`${API_URL}/products/${id}`, { method: 'PUT', headers: authHeaders({ 'Content-Type': 'application/json' }), body: JSON.stringify(data) })).json(),
  getInventory: async () => (await fetch(`${API_URL}/inventory`)).json(),
  createInventory: async (data) => (await fetch(`${API_URL}/inventory`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(data) })).json(),
  updateInventory: async (id, data) => (await fetch(`${API_URL}/inventory/${id}`, { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(data) })).json(),
  deleteInventory: async (id) => (await fetch(`${API_URL}/inventory/${id}`, { method: 'DELETE' })).json(),
  getDeliveries: async () => (await fetch(`${API_URL}/deliveries`)).json(),
  trackDelivery: async (refCode) => (await fetch(`${API_URL}/deliveries/track/${refCode}`)).json(),
  createDelivery: async (data) => (await fetch(`${API_URL}/deliveries`, { method: 'POST', headers: authHeaders({ 'Content-Type': 'application/json' }), body: JSON.stringify(data) })).json(),
  updateDelivery: async (id, data) => (await fetch(`${API_URL}/deliveries/${id}`, { method: 'PUT', headers: authHeaders({ 'Content-Type': 'application/json' }), body: JSON.stringify(data) })).json(),
  updateDeliveryStatus: async (id, status) => (await fetch(`${API_URL}/deliveries/${id}/status`, { method: 'PATCH', headers: authHeaders({ 'Content-Type': 'application/json' }), body: JSON.stringify({ status }) })).json(),
  deleteDelivery: async (id) => (await fetch(`${API_URL}/deliveries/${id}`, { method: 'DELETE', headers: authHeaders() })).json(),
  sendDeliverySms: async (id) => (await fetch(`${API_URL}/deliveries/${id}/send-sms`, { method: 'POST', headers: authHeaders() })).json(),
  getSales: async () => (await fetch(`${API_URL}/sales`)).json(),
  createSales: async (data) => (await fetch(`${API_URL}/sales`, { method: 'POST', headers: authHeaders({ 'Content-Type': 'application/json' }), body: JSON.stringify(data) })).json(),
  updateSales: async (id, data) => (await fetch(`${API_URL}/sales/${id}`, { method: 'PUT', headers: authHeaders({ 'Content-Type': 'application/json' }), body: JSON.stringify(data) })).json(),
  deleteSales: async (id) => (await fetch(`${API_URL}/sales/${id}`, { method: 'DELETE', headers: authHeaders() })).json(),
  getReviews: async (limit) => {
    const query = Number.isInteger(limit) && limit > 0 ? `?limit=${limit}` : '';
    return (await fetch(`${API_URL}/reviews${query}`)).json();
  },
  createReview: async (data) => (await fetch(`${API_URL}/reviews`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(data) })).json(),
  updateReview: async (id, data) => (await fetch(`${API_URL}/reviews/${id}`, { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(data) })).json(),
  deleteReview: async (id) => (await fetch(`${API_URL}/reviews/${id}`, { method: 'DELETE' })).json(),
  getStaff: async () => (await fetch(`${API_URL}/staff`, { headers: authHeaders() })).json(),
  createStaff: async (data) => (await fetch(`${API_URL}/staff`, { method: 'POST', headers: authHeaders({ 'Content-Type': 'application/json' }), body: JSON.stringify(data) })).json(),
  updateStaff: async (id, data) => (await fetch(`${API_URL}/staff/${id}`, { method: 'PUT', headers: authHeaders({ 'Content-Type': 'application/json' }), body: JSON.stringify(data) })).json(),
  deleteStaff: async (id) => (await fetch(`${API_URL}/staff/${id}`, { method: 'DELETE', headers: authHeaders() })).json(),
  getMyAccount: async () => (await fetch(`${API_URL}/account/me`, { headers: authHeaders() })).json(),
  updateMyAccount: async (data) => (await fetch(`${API_URL}/account/me`, { method: 'PUT', headers: authHeaders({ 'Content-Type': 'application/json' }), body: JSON.stringify(data) })).json(),
  // SMS verification at login (backend routes: /login/mfa/send, /resend, /verify, /cancel - see "LOGIN WITH SMS VERIFICATION" below).
  mfaSend: (challengeId) => mfaRequest('/login/mfa/send', { challengeId }),
  mfaResend: (challengeId) => mfaRequest('/login/mfa/resend', { challengeId }),
  mfaVerify: (challengeId, code) => mfaRequest('/login/mfa/verify', { challengeId, code }),
  mfaCancel: (challengeId) => mfaRequest('/login/mfa/cancel', { challengeId }),
  getBusinessInfo: async () => (await fetch(`${API_URL}/business-info`)).json(),
  saveBusinessInfo: async (data) => (await fetch(`${API_URL}/business-info`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(data) })).json(),
  getContactInfo: async () => (await fetch(`${API_URL}/contact-info`)).json(),
  saveContactInfo: async (data) => (await fetch(`${API_URL}/contact-info`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(data) })).json(),
  // Chatbot Q&A
  getChatbotQA: async () => (await fetch(`${API_URL}/chatbot`)).json(),
  createChatbotQA: async (data) => (await fetch(`${API_URL}/chatbot`, { method: 'POST', headers: authHeaders({ 'Content-Type': 'application/json' }), body: JSON.stringify(data) })).json(),
  updateChatbotQA: async (id, data) => (await fetch(`${API_URL}/chatbot/${id}`, { method: 'PUT', headers: authHeaders({ 'Content-Type': 'application/json' }), body: JSON.stringify(data) })).json(),
  deleteChatbotQA: async (id) => (await fetch(`${API_URL}/chatbot/${id}`, { method: 'DELETE', headers: authHeaders() })).json(),
  // Inquiries
  getInquiries: async () => (await fetch(`${API_URL}/inquiries`)).json(),
  submitInquiry: async (data) => (await fetch(`${API_URL}/inquiries`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(data) })).json(),
  updateInquiryStatus: async (id, status) => (await fetch(`${API_URL}/inquiries/${id}/status`, { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ status }) })).json(),
  deleteInquiry: async (id) => (await fetch(`${API_URL}/inquiries/${id}`, { method: 'DELETE' })).json(),
  // Feedback
  getFeedback: async () => (await fetch(`${API_URL}/feedback`)).json(),
  submitFeedback: async (data) => (await fetch(`${API_URL}/feedback`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(data) })).json(),
  deleteFeedback: async (id) => (await fetch(`${API_URL}/feedback/${id}`, { method: 'DELETE' })).json(),
};

// =============================================================================
// UTILITY FUNCTIONS
// =============================================================================
export function formatCurrency(amount) {
  const num = parseFloat(amount);
  if (isNaN(num)) return '₱0.00';
  return '₱' + num.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

// Discount helpers: a product is discounted only when discounted_price is not null AND lower than price.
export function getDiscountInfo(product) {
  const regular = parseFloat(product && product.price);
  const rawDiscount = product ? product.discounted_price : null;
  if (rawDiscount === null || rawDiscount === undefined || rawDiscount === '') return { isDiscounted: false, regular, final: regular, percent: 0 };
  const discounted = parseFloat(rawDiscount);
  if (isNaN(regular) || isNaN(discounted) || discounted <= 0 || discounted >= regular) return { isDiscounted: false, regular, final: regular, percent: 0 };
  return { isDiscounted: true, regular, final: discounted, percent: Math.round(((regular - discounted) / regular) * 100) };
}

export function getEffectivePrice(product) {
  return getDiscountInfo(product).final;
}

// Price block used by customer-facing cards (furniture list + homepage Special Offers).
export function renderPriceHTML(product) {
  const info = getDiscountInfo(product);
  if (!info.isDiscounted) {
    return `<span style="font-size:1.25rem;font-weight:700;color:#DC143C;">${formatCurrency(info.regular)}</span>`;
  }
  return `
    <div style="display:flex;flex-direction:column;gap:0.15rem;">
      <span style="font-size:0.9rem;color:#9ca3af;text-decoration:line-through;">${formatCurrency(info.regular)}</span>
      <span style="font-size:1.25rem;font-weight:700;color:#DC143C;">${formatCurrency(info.final)}</span>
    </div>
    <span style="background:#DC143C;color:#fff;font-size:0.75rem;font-weight:700;padding:0.25rem 0.6rem;border-radius:9999px;white-space:nowrap;">${info.percent}% OFF</span>`;
}

export function formatDate(dateStr) {
  if (!dateStr) return 'N/A';
  return new Date(dateStr).toLocaleDateString('en-US', { year: 'numeric', month: 'short', day: 'numeric' });
}

export function formatDateTime(dateStr) {
  if (!dateStr) return 'N/A';
  return new Date(dateStr).toLocaleString('en-US', { year: 'numeric', month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit', timeZone: 'Asia/Manila' });
}

export function fileToBase64(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.readAsDataURL(file);
    reader.onload = () => resolve(reader.result);
    reader.onerror = error => reject(error);
  });
}

async function mfaRequest(path, body) {
  const response = await fetch(`${API_URL}${path}`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
  let data = null;
  try { data = await response.json(); } catch (error) { /* not JSON, e.g. the route does not exist yet */ }
  if (!data || typeof data !== 'object') return { success: false, code: 'MFA_UNAVAILABLE' };
  return data;
}

// =============================================================================
// STAFF ACCOUNT MANAGEMENT (ADMIN)
// =============================================================================
// Phone numbers: same rules as the server (Philippine mobile numbers). The server validates again.
export function normalizePhPhoneClient(input) {
  const raw = String(input || '').trim();
  if (!raw || raw.length > 20 || !/^\+?[0-9\s().-]+$/.test(raw)) return '';
  const digits = raw.replace(/\D/g, '');
  if (raw.startsWith('+') && !digits.startsWith('639')) return '';
  if (/^09\d{9}$/.test(digits)) return '+63' + digits.slice(1);
  if (/^639\d{9}$/.test(digits)) return '+' + digits;
  return '';
}

export function validatePhPhoneClient(input) {
  if (!String(input || '').trim()) return 'Please enter the phone number';
  return normalizePhPhoneClient(input) ? '' : 'Enter a valid Philippine mobile number (for example 09171234567 or +639171234567).';
}

export function formatPhoneForDisplay(stored) {
  const normalized = normalizePhPhoneClient(stored);
  return normalized ? `+63 ${normalized.slice(3, 6)} ${normalized.slice(6, 9)} ${normalized.slice(9)}` : String(stored || '');
}

export function escapeHtmlText(value) {
  return String(value).replace(/[&<>"']/g, ch => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[ch]));
}