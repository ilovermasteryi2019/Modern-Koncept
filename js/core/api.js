/* =============================================================================
 * K-Desk | js/core/api.js
 * Backend requests
 * -----------------------------------------------------------------------------
 * WHAT IT DOES : authHeaders() adds the login token to a request. The API object lists every backend call (signup, login,
 * furniture, inventory, deliveries, sales, staff, business info, chatbot, inquiries, feedback...).
 * The browser only talks to the Express backend, never directly to Supabase, so no secret key reaches the frontend.
 * DEPENDS ON   : API_URL (config.js). Used by all feature files.
 * LOAD ORDER   : file 5 of 19 (see scripts-block.html). These are plain scripts that share one
 *                global scope, so inline onclick="..." handlers in the HTML keep working.
 * CONTENTS     :
 * authHeaders, API
 * ============================================================================= */

// Adds the login token (issued by the backend at login) so the backend can verify the user's role
function authHeaders(extra = {}) {
  const token = sessionStorage.getItem('authToken');
  return token ? { ...extra, Authorization: `Bearer ${token}` } : extra;
}

// =============================================================================
// API OBJECT
// =============================================================================
const API = {
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
  createChatbotQA: async (data) => (await fetch(`${API_URL}/chatbot`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(data) })).json(),
  updateChatbotQA: async (id, data) => (await fetch(`${API_URL}/chatbot/${id}`, { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(data) })).json(),
  deleteChatbotQA: async (id) => (await fetch(`${API_URL}/chatbot/${id}`, { method: 'DELETE' })).json(),
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
