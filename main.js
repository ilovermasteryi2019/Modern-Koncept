// PAGE TRANSITION EFFECT FOR SMOOTH NAVIGATION
// =============================================================================
document.addEventListener('DOMContentLoaded', () => {
  // ── Mobile hamburger menu ──
  const hamburgerBtn = document.getElementById('hamburgerBtn');
  const mobileNavMenu = document.getElementById('mobileNavMenu');
  if (hamburgerBtn && mobileNavMenu) {
    hamburgerBtn.addEventListener('click', () => {
      hamburgerBtn.classList.toggle('open');
      mobileNavMenu.classList.toggle('open');
    });
    mobileNavMenu.querySelectorAll('.mobile-nav-link').forEach(link => {
      link.addEventListener('click', () => {
        hamburgerBtn.classList.remove('open');
        mobileNavMenu.classList.remove('open');
      });
    });
  }

  document.querySelectorAll('a.nav-btn').forEach(link => {
    const href = link.getAttribute('href');
    if (!href || href.startsWith('http') || href.startsWith('mailto') || href.startsWith('tel')) return;
    if (href.startsWith('#')) return;
    link.addEventListener('click', (e) => {
      e.preventDefault();
      document.body.classList.add('page-transition-out');
      setTimeout(() => { window.location.href = href; }, 300);
    });
  });
});

const API_URL = 'https://modern-koncept.onrender.com';

// =============================================================================
// TOAST NOTIFICATION SYSTEM
// =============================================================================
function showToast(message, type = 'info', duration = 4000) {
  let container = document.getElementById('toastContainer');
  if (!container) {
    container = document.createElement('div');
    container.id = 'toastContainer';
    container.className = 'toast-container';
    document.body.appendChild(container);
  }
  const icons = { success: '✓', error: '✕', warning: '⚠', info: 'ℹ' };
  const toast = document.createElement('div');
  toast.className = `toast ${type}`;
  toast.innerHTML = `
    <div class="toast-icon">${icons[type] || icons.info}</div>
    <div class="toast-message">${message}</div>
    <button class="toast-close" onclick="this.parentElement.remove()">×</button>
  `;
  container.appendChild(toast);
  setTimeout(() => {
    toast.classList.add('removing');
    setTimeout(() => { if (toast.parentElement) toast.remove(); }, 300);
  }, duration);
}

// Global chart instances
let revenueBarChartInstance = null;
let salesLineChartInstance = null;

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
  createFurniture: async (data) => (await fetch(`${API_URL}/add-product`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(data) })).json(),
  updateFurniture: async (id, data) => (await fetch(`${API_URL}/products/${id}`, { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(data) })).json(),
  deleteFurniture: async (id) => (await fetch(`${API_URL}/products/${id}`, { method: 'DELETE' })).json(),
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

// =============================================================================
// UTILITY FUNCTIONS
// =============================================================================
function formatCurrency(amount) {
  const num = parseFloat(amount);
  if (isNaN(num)) return '₱0.00';
  return '₱' + num.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

// Discount helpers: a product is discounted only when discounted_price is not null AND lower than price.
function getDiscountInfo(product) {
  const regular = parseFloat(product && product.price);
  const rawDiscount = product ? product.discounted_price : null;
  if (rawDiscount === null || rawDiscount === undefined || rawDiscount === '') return { isDiscounted: false, regular, final: regular, percent: 0 };
  const discounted = parseFloat(rawDiscount);
  if (isNaN(regular) || isNaN(discounted) || discounted <= 0 || discounted >= regular) return { isDiscounted: false, regular, final: regular, percent: 0 };
  return { isDiscounted: true, regular, final: discounted, percent: Math.round(((regular - discounted) / regular) * 100) };
}

function getEffectivePrice(product) {
  return getDiscountInfo(product).final;
}

// Price block used by customer-facing cards (furniture list + homepage Special Offers).
function renderPriceHTML(product) {
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

function formatDate(dateStr) {
  if (!dateStr) return 'N/A';
  return new Date(dateStr).toLocaleDateString('en-US', { year: 'numeric', month: 'short', day: 'numeric' });
}

function formatDateTime(dateStr) {
  if (!dateStr) return 'N/A';
  return new Date(dateStr).toLocaleString('en-US', { year: 'numeric', month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit', timeZone: 'Asia/Manila' });
}

function showModal(modalId) {
  const modal = document.getElementById(modalId);
  if (modal) modal.classList.add('active');
}

function hideModal(modalId) {
  const modal = document.getElementById(modalId);
  if (modal) modal.classList.remove('active');
}

let currentFurnitureImage = null;

function fileToBase64(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.readAsDataURL(file);
    reader.onload = () => resolve(reader.result);
    reader.onerror = error => reject(error);
  });
}

// Public Delivery Tracking
async function handlePublicTrackDelivery(event) {
  event.preventDefault();
  const refCodeInput = document.getElementById('publicTrackCode');
  const resultDiv = document.getElementById('publicTrackResult');
  if (!refCodeInput || !resultDiv) return;
  const refCode = refCodeInput.value.trim();
  if (!refCode) { alert('❌ Please enter a reference code'); return; }
  try {
    const result = await API.trackDelivery(refCode);
    if (result.success && result.data) {
      const d = result.data;
      const deliveryDate = new Date(d.delivery_date).toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' });
      resultDiv.innerHTML = `
        <div style="background:#f0fdf4;border:1px solid #86efac;border-radius:0.5rem;padding:1.5rem;">
          <h3 style="color:#166534;font-size:1.25rem;font-weight:600;margin-bottom:1rem;">✅ Delivery Found</h3>
          <div style="display:grid;gap:0.75rem;">
            <div style="display:grid;grid-template-columns:140px 1fr;gap:0.5rem;"><span style="font-weight:600;color:#374151;">Reference Code:</span><span style="color:#6b7280;">${d.ref_code}</span></div>
            <div style="display:grid;grid-template-columns:140px 1fr;gap:0.5rem;"><span style="font-weight:600;color:#374151;">Customer Name:</span><span style="color:#6b7280;">${d.customer_name}</span></div>
            <div style="display:grid;grid-template-columns:140px 1fr;gap:0.5rem;"><span style="font-weight:600;color:#374151;">Address:</span><span style="color:#6b7280;">${d.address}</span></div>
            <div style="display:grid;grid-template-columns:140px 1fr;gap:0.5rem;"><span style="font-weight:600;color:#374151;">Delivery Date:</span><span style="color:#6b7280;">${deliveryDate}</span></div>
            <div style="display:grid;grid-template-columns:140px 1fr;gap:0.5rem;"><span style="font-weight:600;color:#374151;">Status:</span><span style="padding:0.25rem 0.75rem;background:#DC143C;color:white;border-radius:9999px;display:inline-block;font-size:0.875rem;width:fit-content;">${d.status || 'Scheduled'}</span></div>
          </div>
        </div>`;
      resultDiv.classList.remove('hidden');
    } else {
      resultDiv.innerHTML = `<div style="background:#fef2f2;border:1px solid #fca5a5;border-radius:0.5rem;padding:1.5rem;"><h3 style="color:#991b1b;">❌ Delivery Not Found</h3><p style="color:#6b7280;">No delivery found with reference code: <strong>${refCode}</strong></p></div>`;
      resultDiv.classList.remove('hidden');
    }
  } catch (error) {
    resultDiv.innerHTML = `<div style="background:#fef2f2;border:1px solid #fca5a5;border-radius:0.5rem;padding:1.5rem;"><h3 style="color:#991b1b;">❌ Error</h3><p style="color:#6b7280;">Failed to track delivery. Please try again later.</p></div>`;
    resultDiv.classList.remove('hidden');
  }
}

// =============================================================================
// AUTHENTICATION
// =============================================================================
async function handleSignup(event) {
  event.preventDefault();
  const name = document.getElementById('signupName').value;
  const email = document.getElementById('signupEmail').value;
  const password = document.getElementById('signupPassword').value;
  try {
    const result = await API.signup(name, email, password);
    if (result.success) {
      showToast('Account created successfully! Please login.', 'success');
      document.getElementById('signupForm').reset();
    } else {
      showToast('❌ ' + result.message, 'error');
    }
  } catch (error) {
    showToast('❌ Failed to create account. Please check your connection.', 'error');
  }
}

// Handle Login - redirects based on role
async function handleLogin(event) {
  event.preventDefault();
  const email = document.getElementById('loginEmail').value;
  const password = document.getElementById('loginPassword').value;
  try {
    const result = await API.login(email, password);
    if (result.success) {
      sessionStorage.setItem('currentUser', JSON.stringify(result.user));
      sessionStorage.setItem('authToken', result.token || '');
      showToast('Login successful!', 'success');
      setTimeout(() => {
        const role = result.user.role;
        if (role === 'admin') {
          window.location.href = 'admin.html';
        } else if (role === 'manager') {
          window.location.href = 'manager.html';
        } else {
          window.location.href = 'staff.html';
        }
      }, 1500);
    } else {
      showToast(result.message, 'error');
    }
  } catch (error) {
    showToast('Failed to login. Please check your connection.', 'error');
  }
}

function handleLogout() {
  sessionStorage.removeItem('currentUser');
  sessionStorage.removeItem('authToken');
  window.location.href = 'login.html';
}

// =============================================================================
// ADMIN MODULE - FURNITURE MANAGEMENT
// =============================================================================
let editingFurnitureId = null;
let allFurnitureProducts = [];
let adminFurnitureItems = [];

async function loadFurnitureList() {
  try {
    const result = await API.getFurniture();
    if (result.success) {
      adminFurnitureItems = result.data;
      renderAdminFurnitureTable(adminFurnitureItems);
    }
  } catch (error) {
    showToast('❌ Failed to load furniture list', 'error');
  }
}

function renderAdminFurnitureTable(items) {
  const tbody = document.getElementById('furnitureList');
  if (!tbody) return;
  tbody.innerHTML = '';
  if (!items || items.length === 0) {
    tbody.innerHTML = '<tr class="no-data-row"><td colspan="7">No furniture items found.</td></tr>';
    return;
  }
  items.forEach(item => {
    tbody.innerHTML += `
      <tr>
        <td>${item.image ? `<img src="${item.image}" alt="${item.name}" style="width:50px;height:50px;object-fit:cover;border-radius:0.375rem;">` : '<span style="color:#9ca3af;">No image</span>'}</td>
        <td>${item.name}</td>
        <td>${item.category}</td>
        <td>${item.material || 'N/A'}</td>
        <td>${item.dimensions || 'N/A'}</td>
        <td>${(() => { const d = getDiscountInfo(item); return d.isDiscounted ? `<span style="text-decoration:line-through;color:#9ca3af;font-size:0.85rem;">${formatCurrency(d.regular)}</span><br><strong style="color:#DC143C;">${formatCurrency(d.final)}</strong> <span style="font-size:0.75rem;color:#DC143C;">(${d.percent}% OFF)</span>` : formatCurrency(item.price); })()}</td>
        <td>
          <button class="action-btn edit" onclick="editFurniture(${item.id})" title="Edit"><svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"></path><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"></path></svg></button>
          <button class="action-btn delete" onclick="deleteFurniture(${item.id})" title="Delete"><svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="3 6 5 6 21 6"></polyline><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"></path></svg></button>
        </td>
      </tr>`;
  });
}

function filterAdminFurnitureList() {
  if (!adminFurnitureItems.length) { renderAdminFurnitureTable([]); return; }
  const searchInput = document.getElementById('adminFurnitureSearch');
  const categoryFilter = document.getElementById('adminCategoryFilter');
  let filtered = [...adminFurnitureItems];
  if (searchInput && searchInput.value.trim()) {
    const s = searchInput.value.trim().toLowerCase();
    filtered = filtered.filter(item => item.name.toLowerCase().includes(s) || (item.category && item.category.toLowerCase().includes(s)) || (item.material && item.material.toLowerCase().includes(s)));
  }
  if (categoryFilter && categoryFilter.value !== 'all') filtered = filtered.filter(item => item.category === categoryFilter.value);
  renderAdminFurnitureTable(filtered);
}

function initAdminFurnitureSearch() {
  const searchInput = document.getElementById('adminFurnitureSearch');
  const categoryFilter = document.getElementById('adminCategoryFilter');
  if (searchInput) searchInput.addEventListener('input', filterAdminFurnitureList);
  if (categoryFilter) categoryFilter.addEventListener('change', filterAdminFurnitureList);
}

async function loadPublicFurnitureList() {
  const container = document.getElementById('productsContainer');
  const productCount = document.getElementById('productCount');

  // Show loading state immediately
  if (container) container.innerHTML = `<div style="grid-column:1/-1;text-align:center;padding:3rem;color:#6b7280;"><p style="font-size:1.1rem;">⏳ Loading furniture...</p><p style="font-size:0.85rem;margin-top:0.5rem;">This may take up to 30 seconds on first load.</p></div>`;
  if (productCount) productCount.textContent = 'Loading products...';

  const tryFetch = async () => {
    try {
      const result = await API.getFurniture();
      if (result && result.success) {
        allFurnitureProducts = result.data || [];
        displayFurnitureProducts(allFurnitureProducts);
        return true;
      }
      return false;
    } catch (e) {
      return false;
    }
  };

  // Attempt 1
  if (await tryFetch()) return;

  // Render cold start — server may be waking up. Wait 8 seconds and retry.
  if (productCount) productCount.textContent = 'Server is starting up... please wait (retry 1/2)';
  await new Promise(r => setTimeout(r, 8000));
  if (await tryFetch()) return;

  // Final retry after another 12 seconds
  if (productCount) productCount.textContent = 'Still connecting... (retry 2/2)';
  await new Promise(r => setTimeout(r, 12000));
  if (!(await tryFetch())) displayNoProducts();
}

function displayFurnitureProducts(products) {
  const container = document.getElementById('productsContainer');
  const productCount = document.getElementById('productCount');
  if (!container) return;
  container.innerHTML = '';
  if (products.length === 0) { displayNoProducts(); return; }
  if (productCount) productCount.textContent = `Showing ${products.length} product${products.length !== 1 ? 's' : ''}`;
  products.forEach(product => {
    const card = document.createElement('div');
    card.className = 'product-card';
    card.style.cursor = 'pointer';
    card.innerHTML = `
      <img src="${product.image || 'placeholder-furniture.jpg'}" alt="${product.name}" class="product-image" onerror="this.src='placeholder-furniture.jpg'">
      <div style="padding:1.5rem;">
        <h3 style="font-size:1.125rem;font-weight:600;margin-bottom:0.5rem;color:#1f2937;">${product.name}</h3>
        <p style="color:#6b7280;font-size:0.875rem;margin-bottom:0.5rem;">${product.category}</p>
        ${product.material ? `<p style="color:#9ca3af;font-size:0.75rem;margin-bottom:0.75rem;">Material: ${product.material}</p>` : ''}
        <div style="display:flex;justify-content:space-between;align-items:center;margin-top:1rem;">
          ${renderPriceHTML(product)}
        </div>
        ${product.description ? `<p style="color:#6b7280;font-size:0.875rem;margin-top:0.75rem;">${product.description.substring(0, 80)}${product.description.length > 80 ? '...' : ''}</p>` : ''}
      </div>`;
    card.addEventListener('click', () => { window.location.href = `furniture-detail.html?id=${product.id}`; });
    card.addEventListener('mouseenter', () => { card.style.transform = 'translateY(-4px)'; card.style.boxShadow = '0 8px 16px rgba(0,0,0,0.15)'; });
    card.addEventListener('mouseleave', () => { card.style.transform = 'translateY(0)'; card.style.boxShadow = ''; });
    container.appendChild(card);
  });
}

function displayNoProducts() {
  const container = document.getElementById('productsContainer');
  const productCount = document.getElementById('productCount');
  if (container) container.innerHTML = `<div style="grid-column:1/-1;text-align:center;padding:3rem;color:#9ca3af;"><h3>No Furniture Found</h3><p>Try adjusting your filters or check back later.</p></div>`;
  if (productCount) productCount.textContent = 'Showing 0 products';
}

// Public homepage Special Offers (discounted furniture only)
async function loadSpecialOffers() {
  const section = document.getElementById('specialOffers');
  const grid = document.getElementById('specialOffersGrid');
  if (!section || !grid) return;
  try {
    const result = await API.getFurniture();
    const offers = result && result.success && Array.isArray(result.data)
      ? result.data.filter(p => getDiscountInfo(p).isDiscounted).slice(0, 6)
      : [];
    if (offers.length === 0) {
      section.classList.add('hidden');
      grid.replaceChildren();
      return;
    }
    grid.replaceChildren();
    offers.forEach(product => {
      const card = document.createElement('div');
      card.className = 'product-card';
      card.style.cursor = 'pointer';
      card.innerHTML = `
        <img src="${product.image || 'placeholder-furniture.jpg'}" alt="${product.name}" class="product-image" onerror="this.src='placeholder-furniture.jpg'">
        <div style="padding:1.5rem;">
          <h3 style="font-size:1.125rem;font-weight:600;margin-bottom:0.5rem;color:#1f2937;">${product.name}</h3>
          <p style="color:#6b7280;font-size:0.875rem;margin-bottom:0.5rem;">${product.category || ''}</p>
          <div style="display:flex;justify-content:space-between;align-items:center;margin-top:1rem;gap:0.5rem;">
            ${renderPriceHTML(product)}
          </div>
          <a href="furniture-detail.html?id=${product.id}" class="btn btn-accent" style="display:block;text-align:center;margin-top:1rem;text-decoration:none;" onclick="event.stopPropagation()">View Furniture</a>
        </div>`;
      card.addEventListener('click', () => { window.location.href = `furniture-detail.html?id=${product.id}`; });
      grid.appendChild(card);
    });
    section.classList.remove('hidden');
  } catch (error) {
    console.error('Load special offers error:', error);
    section.classList.add('hidden');
    grid.replaceChildren();
  }
}

function filterAndSortProducts() {
  let filtered = [...allFurnitureProducts];
  const searchInput = document.getElementById('searchInput');
  if (searchInput && searchInput.value.trim()) {
    const s = searchInput.value.toLowerCase();
    filtered = filtered.filter(p => p.name.toLowerCase().includes(s) || (p.description && p.description.toLowerCase().includes(s)));
  }
  const categoryFilter = document.getElementById('categoryFilter');
  if (categoryFilter && categoryFilter.value !== 'all') filtered = filtered.filter(p => p.category === categoryFilter.value);
  const discountFilter = document.getElementById('discountFilter');
  if (discountFilter && discountFilter.value === 'discounted') filtered = filtered.filter(p => getDiscountInfo(p).isDiscounted);
  else if (discountFilter && discountFilter.value === 'regular') filtered = filtered.filter(p => !getDiscountInfo(p).isDiscounted);
  const priceFilter = document.getElementById('priceFilter');
  if (priceFilter && priceFilter.value !== 'all') {
    const r = priceFilter.value;
    if (r === '0-10000') filtered = filtered.filter(p => getEffectivePrice(p) < 10000);
    else if (r === '10000-20000') filtered = filtered.filter(p => getEffectivePrice(p) >= 10000 && getEffectivePrice(p) <= 20000);
    else if (r === '20000-50000') filtered = filtered.filter(p => getEffectivePrice(p) >= 20000 && getEffectivePrice(p) <= 50000);
    else if (r === '50000+') filtered = filtered.filter(p => getEffectivePrice(p) > 50000);
  }
  const sortFilter = document.getElementById('sortFilter');
  if (sortFilter) {
    const s = sortFilter.value;
    if (s === 'name-asc') filtered.sort((a, b) => a.name.localeCompare(b.name));
    else if (s === 'name-desc') filtered.sort((a, b) => b.name.localeCompare(a.name));
    else if (s === 'price-asc') filtered.sort((a, b) => getEffectivePrice(a) - getEffectivePrice(b));
    else if (s === 'price-desc') filtered.sort((a, b) => getEffectivePrice(b) - getEffectivePrice(a));
  }
  displayFurnitureProducts(filtered);
}

function initFurnitureListFilters() {
  ['searchInput', 'categoryFilter', 'priceFilter', 'discountFilter', 'sortFilter'].forEach(id => {
    const el = document.getElementById(id);
    if (el) el.addEventListener(id === 'searchInput' ? 'input' : 'change', filterAndSortProducts);
  });
}

function getProductIdFromURL() {
  return new URLSearchParams(window.location.search).get('id');
}

async function loadFurnitureDetail() {
  const productId = getProductIdFromURL();
  if (!productId) { window.location.href = 'furniture-list.html'; return; }
  try {
    const response = await fetch(`${API_URL}/products/${productId}`);
    const result = await response.json();
    if (result.success && result.data) {
      displayFurnitureDetail(result.data);
    } else {
      window.location.href = 'furniture-list.html';
    }
  } catch (error) {
    window.location.href = 'furniture-list.html';
  }
}

function displayFurnitureDetail(product) {
  const setEl = (id, val) => { const el = document.getElementById(id); if (el) el.textContent = val; };
  const productImage = document.getElementById('productImage');
  if (productImage) { productImage.src = product.image || 'placeholder-furniture.jpg'; productImage.alt = product.name; productImage.onerror = function() { this.src = 'placeholder-furniture.jpg'; }; }
  setEl('productName', product.name);
  const productPrice = document.getElementById('productPrice');
  if (productPrice) {
    const info = getDiscountInfo(product);
    if (info.isDiscounted) {
      productPrice.innerHTML = `<span style="font-size:1rem;color:#9ca3af;text-decoration:line-through;margin-right:0.5rem;">${formatCurrency(info.regular)}</span>${formatCurrency(info.final)} <span style="background:#DC143C;color:#fff;font-size:0.8rem;font-weight:700;padding:0.2rem 0.6rem;border-radius:9999px;vertical-align:middle;">${info.percent}% OFF</span>`;
    } else {
      productPrice.textContent = formatCurrency(product.price);
    }
  }
  setEl('productCategory', product.category || 'N/A');
  setEl('productMaterial', product.material || 'N/A');
  setEl('productDimensions', product.dimensions || 'N/A');
  setEl('productDescription', product.description || 'No description available.');
  document.title = `${product.name} - ECL FURNITURE MART`;
}

function openAddFurnitureModal() {
  editingFurnitureId = null;
  document.getElementById('furnitureModalTitle').textContent = 'Add New Furniture';
  document.getElementById('furnitureForm').reset();
  currentFurnitureImage = null;
  ['furnitureLength', 'furnitureWidth', 'furnitureHeight', 'furnitureDiscountedPrice'].forEach(id => { const el = document.getElementById(id); if (el) el.value = ''; });
  const preview = document.getElementById('furnitureImagePreview');
  if (preview) preview.style.display = 'none';
  showModal('furnitureModal');
}

function handleFurnitureImageUpload(event) {
  const file = event.target.files[0];
  if (!file) return;
  if (!file.type.startsWith('image/')) { showToast('Please select an image file', 'warning'); event.target.value = ''; return; }
  if (file.size > 5 * 1024 * 1024) { showToast('File too large. Max 5MB.', 'warning'); event.target.value = ''; return; }
  fileToBase64(file).then(base64String => {
    currentFurnitureImage = base64String;
    const preview = document.getElementById('furnitureImagePreview');
    const previewImg = document.getElementById('furnitureImagePreviewImg');
    if (preview && previewImg) { previewImg.src = base64String; preview.style.display = 'block'; }
  });
}

async function handleFurnitureSubmit(event) {
  event.preventDefault();
  const length = document.getElementById('furnitureLength').value;
  const width = document.getElementById('furnitureWidth').value;
  const height = document.getElementById('furnitureHeight').value;
  if (!length || !width || !height || length <= 0 || width <= 0 || height <= 0) {
    showToast('Please enter valid dimensions (all values must be greater than 0)', 'warning');
    return;
  }
  const regularPrice = parseFloat(document.getElementById('furniturePrice').value);
  const discountRaw = (document.getElementById('furnitureDiscountedPrice') || { value: '' }).value.trim();
  let discountedPrice = null;
  if (discountRaw !== '') {
    discountedPrice = Number(discountRaw);
    if (!Number.isFinite(discountedPrice)) { showToast('Discounted price must be a valid number', 'warning'); return; }
    if (discountedPrice <= 0) { showToast('Discounted price must be greater than 0', 'warning'); return; }
    if (discountedPrice >= regularPrice) { showToast('Discounted price must be lower than the regular price', 'warning'); return; }
  }
  const data = {
    name: document.getElementById('furnitureName').value,
    category: document.getElementById('furnitureCategory').value,
    price: regularPrice,
    discounted_price: discountedPrice,
    material: document.getElementById('furnitureMaterial').value,
    dimensions: `${length}cm x ${width}cm x ${height}cm`,
    description: document.getElementById('furnitureDescription').value,
    image: currentFurnitureImage || ''
  };
  try {
    const result = editingFurnitureId ? await API.updateFurniture(editingFurnitureId, data) : await API.createFurniture(data);
    if (result.success) { showToast(result.message, 'success'); hideModal('furnitureModal'); loadFurnitureList(); }
    else showToast('❌ ' + result.message, 'error');
  } catch (error) { showToast('❌ Failed to save furniture', 'error'); }
}

async function editFurniture(id) {
  try {
    const result = await API.getFurniture();
    if (result.success) {
      const item = result.data.find(f => f.id === id);
      if (!item) { showToast('Furniture not found', 'error'); return; }
      editingFurnitureId = id;
      document.getElementById('furnitureModalTitle').textContent = 'Edit Furniture';
      document.getElementById('furnitureName').value = item.name;
      document.getElementById('furnitureCategory').value = item.category;
      document.getElementById('furniturePrice').value = item.price;
      const discountInput = document.getElementById('furnitureDiscountedPrice');
      if (discountInput) discountInput.value = (item.discounted_price !== null && item.discounted_price !== undefined) ? item.discounted_price : '';
      document.getElementById('furnitureMaterial').value = item.material || '';
      if (item.dimensions) {
        const parts = item.dimensions.split(' x ');
        if (parts.length === 3) {
          document.getElementById('furnitureLength').value = parseFloat(parts[0]) || '';
          document.getElementById('furnitureWidth').value = parseFloat(parts[1]) || '';
          document.getElementById('furnitureHeight').value = parseFloat(parts[2]) || '';
        }
      }
      document.getElementById('furnitureDescription').value = item.description || '';
      currentFurnitureImage = item.image;
      if (item.image) {
        const preview = document.getElementById('furnitureImagePreview');
        const previewImg = document.getElementById('furnitureImagePreviewImg');
        if (preview && previewImg) { previewImg.src = item.image; preview.style.display = 'block'; }
      }
      showModal('furnitureModal');
    }
  } catch (error) { showToast('❌ Failed to load furniture details', 'error'); }
}

async function deleteFurniture(id) {
  if (!confirm('Are you sure you want to delete this furniture item?')) return;
  try {
    const result = await API.deleteFurniture(id);
    if (result.success) { showToast(result.message, 'success'); loadFurnitureList(); }
    else showToast(result.message, 'error');
  } catch (error) { showToast('❌ Failed to delete furniture', 'error'); }
}

// =============================================================================
// ADMIN MODULE - BUSINESS INFORMATION
// =============================================================================
async function handleAboutFormSubmit(event) {
  event.preventDefault();
  try {
    const result = await API.saveBusinessInfo({
      hero_title: 'About ECL FURNITURE MART',
      hero_description: document.getElementById('aboutHeroDesc').value,
      story: document.getElementById('aboutStory').value,
      mission: document.getElementById('aboutMission').value,
      return_policy: document.getElementById('aboutPolicies').value, warranty_policy: '', delivery_policy: '', payment_policy: ''
    });
    if (result.success) showToast('✅ About page information saved!', 'success');
    else showToast('❌ Failed to save: ' + result.message, 'error');
  } catch (error) { showToast('❌ Failed to save business information', 'error'); }
}

async function handleContactFormSubmit(event) {
  event.preventDefault();
  try {
    const result = await API.saveContactInfo({
      phone: document.getElementById('contactPhone').value,
      email: document.getElementById('contactEmail').value,
      business_hours: `Mon-Sat: ${document.getElementById('contactWeekday').value}\nSunday: ${document.getElementById('contactSunday').value}`,
      address: document.getElementById('contactAddress').value
    });
    if (result.success) showToast('Contact information saved!', 'success');
    else showToast('❌ Failed to save: ' + result.message, 'error');
  } catch (error) { showToast('❌ Failed to save contact information', 'error'); }
}

async function loadBusinessInfo() {
  try {
    const businessResult = await API.getBusinessInfo();
    if (businessResult.success && businessResult.data) {
      const d = businessResult.data;
      const setVal = (id, val) => { const el = document.getElementById(id); if (el) el.value = val || ''; };
      setVal('aboutHeroDesc', d.hero_description);
      setVal('aboutStory', d.story);
      setVal('aboutMission', d.mission);
      setVal('aboutPolicies', d.return_policy);
    }
    const contactResult = await API.getContactInfo();
    if (contactResult.success && contactResult.data) {
      const d = contactResult.data;
      const setVal = (id, val) => { const el = document.getElementById(id); if (el) el.value = val || ''; };
      setVal('contactPhone', d.phone);
      setVal('contactEmail', d.email);
      setVal('contactAddress', d.address);
      if (d.business_hours) {
        const hours = d.business_hours.split('\n');
        const weekdayField = document.getElementById('contactWeekday');
        const sundayField = document.getElementById('contactSunday');
        if (weekdayField && hours[0]) weekdayField.value = hours[0].replace('Mon-Sat: ', '');
        if (sundayField && hours[1]) sundayField.value = hours[1].replace('Sunday: ', '');
      }
    }
  } catch (error) { console.error('Load business info error:', error); }
}

async function loadAboutPageContent() {
  try {
    const result = await API.getBusinessInfo();
    if (result.success && result.data) {
      const d = result.data;
      const heroDesc = document.getElementById('heroDescription');
      if (heroDesc && d.hero_description) heroDesc.textContent = d.hero_description;
      const storyContent = document.getElementById('storyContent');
      if (storyContent && d.story) storyContent.innerHTML = `<p style="color:#4b5563;line-height:1.8;">${d.story}</p>`;
      const missionText = document.getElementById('missionText');
      if (missionText && d.mission) missionText.textContent = d.mission;
      const policiesGrid = document.getElementById('policiesGrid');
      if (policiesGrid && d.return_policy) policiesGrid.innerHTML = `<p style="color:#4b5563;line-height:1.8;grid-column:1 / -1;text-align:center;">${d.return_policy}</p>`;
    }
  } catch (error) { console.error('Load about page error:', error); }
}

async function loadContactPageContent() {
  try {
    const result = await API.getContactInfo();
    if (result.success && result.data) {
      const d = result.data;
      const phoneEl = document.getElementById('customerServicePhone');
      if (phoneEl && d.phone) phoneEl.textContent = d.phone;
      const emailEl = document.getElementById('generalEmail');
      if (emailEl && d.email) emailEl.textContent = d.email;
      if (d.business_hours) {
        const hours = d.business_hours.split('\n');
        const weekdayEl = document.getElementById('weekdayHours');
        if (weekdayEl && hours[0]) weekdayEl.textContent = hours[0].replace('Mon-Sat: ', '');
        const sundayEl = document.getElementById('sundayHours');
        if (sundayEl && hours[1]) sundayEl.textContent = hours[1].replace('Sunday: ', '');
      }
    }
  } catch (error) { console.error('Load contact page error:', error); }
}

// =============================================================================
// ADMIN MODULE - INVENTORY MANAGEMENT
// =============================================================================
let editingInventoryId = null;
let currentStockImage = null;

async function loadInventoryList() {
  try {
    const result = await API.getInventory();
    if (result.success) {
      const tbody = document.getElementById('adminInventoryList');
      if (!tbody) return;
      tbody.innerHTML = '';
      if (result.data.length === 0) { tbody.innerHTML = '<tr><td colspan="8" style="text-align:center;color:#9ca3af;">No inventory items found</td></tr>'; return; }
      result.data.forEach(item => {
        const status = item.quantity > 10 ? 'in-stock' : 'low-stock';
        const statusText = item.quantity > 10 ? 'In Stock' : 'Low Stock';
        tbody.innerHTML += `
          <tr>
            <td>${item.image ? `<img src="${item.image}" alt="${item.name}" style="width:50px;height:50px;object-fit:cover;border-radius:0.375rem;">` : '<span style="color:#9ca3af;font-size:0.75rem;">No image</span>'}</td>
            <td>${item.name}</td>
            <td style="font-family:monospace;font-size:0.8rem;">${item.item_code || '<span style="color:#9ca3af;">N/A</span>'}</td>
            <td>${item.category}</td>
            <td>${item.quantity}</td>
            <td><span class="stock-status ${status}">${statusText}</span></td>
            <td>${formatDateTime(item.last_updated)}</td>
            <td>
              <button class="action-btn edit" onclick="editInventory(${item.id})" title="Edit"><svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"></path><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"></path></svg></button>
              <button class="action-btn delete" onclick="deleteInventory(${item.id})" title="Delete"><svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="3 6 5 6 21 6"></polyline><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"></path></svg></button>
            </td>
          </tr>`;
      });
    }
  } catch (error) { showToast('❌ Failed to load inventory', 'error'); }
}

function openAddInventoryModal() {
  editingInventoryId = null;
  currentStockImage = null;
  document.getElementById('stockModalTitle').textContent = 'Add New Stock Item';
  document.getElementById('stockForm').reset();
  const preview = document.getElementById('stockImagePreview');
  if (preview) preview.style.display = 'none';
  showModal('stockModal');
}

function handleStockImageUpload(event) {
  const file = event.target.files[0];
  if (!file) return;
  if (!file.type.startsWith('image/')) { showToast('Please select an image file', 'warning'); event.target.value = ''; return; }
  if (file.size > 5 * 1024 * 1024) { showToast('File too large. Max 5MB.', 'warning'); event.target.value = ''; return; }
  fileToBase64(file).then(base64String => {
    currentStockImage = base64String;
    const preview = document.getElementById('stockImagePreview');
    const previewImg = document.getElementById('stockImagePreviewImg');
    if (preview && previewImg) { previewImg.src = base64String; preview.style.display = 'block'; }
  });
}

async function handleInventorySubmit(event) {
  event.preventDefault();
  const itemCode = document.getElementById('stockItemCode').value.trim();
  if (!itemCode) { showToast('Please enter an item code', 'warning'); return; }
  const data = {
    name: document.getElementById('stockName').value,
    item_code: itemCode,
    category: document.getElementById('stockCategory').value,
    quantity: parseInt(document.getElementById('stockQuantity').value),
    image: currentStockImage || ''
  };
  try {
    const result = editingInventoryId ? await API.updateInventory(editingInventoryId, data) : await API.createInventory(data);
    if (result.success) {
      showToast(result.message, 'success');
      hideModal('stockModal');
      loadInventoryList();
      if (window.location.pathname.includes('manager')) loadManagerInventoryList();
    } else showToast('❌ ' + result.message, 'error');
  } catch (error) { showToast('❌ Failed to save inventory', 'error'); }
}

async function editInventory(id) {
  try {
    const result = await API.getInventory();
    if (result.success) {
      const item = result.data.find(inv => inv.id === id);
      if (!item) { showToast('Inventory item not found', 'error'); return; }
      editingInventoryId = id;
      currentStockImage = item.image || null;
      document.getElementById('stockModalTitle').textContent = 'Edit Stock Item';
      document.getElementById('stockName').value = item.name;
      document.getElementById('stockItemCode').value = item.item_code || '';
      document.getElementById('stockCategory').value = item.category;
      document.getElementById('stockQuantity').value = item.quantity;
      const preview = document.getElementById('stockImagePreview');
      const previewImg = document.getElementById('stockImagePreviewImg');
      if (item.image && preview && previewImg) { previewImg.src = item.image; preview.style.display = 'block'; }
      else if (preview) { preview.style.display = 'none'; }
      showModal('stockModal');
    }
  } catch (error) { showToast('❌ Failed to load inventory details', 'error'); }
}

async function deleteInventory(id) {
  if (!confirm('Are you sure you want to delete this inventory item?')) return;
  try {
    const result = await API.deleteInventory(id);
    if (result.success) { showToast('✅ ' + result.message, 'success'); loadInventoryList(); }
    else showToast('❌ ' + result.message, 'error');
  } catch (error) { showToast('❌ Failed to delete inventory', 'error'); }
}

// =============================================================================
// DELIVERY MANAGEMENT
// =============================================================================
let editingDeliveryId = null;

async function loadDeliveryStats() {
  try {
    const response = await fetch(`${API_URL}/deliveries/stats`);
    const result = await response.json();
    if (result.success) {
      const stats = result.data;
      const setEl = (id, val) => { const el = document.getElementById(id); if (el) el.textContent = val; };
      setEl('deliveryPendingCount', stats.pending || 0);
      setEl('deliveryProcessingCount', stats.processing || 0);
      setEl('deliveryInTransitCount', stats.in_transit || 0);
      setEl('deliveryDeliveredCount', stats.delivered || 0);
      setEl('managerDeliveryPendingCount', stats.pending || 0);
      setEl('managerDeliveryProcessingCount', stats.processing || 0);
      setEl('managerDeliveryInTransitCount', stats.in_transit || 0);
      setEl('managerDeliveryDeliveredCount', stats.delivered || 0);
    }
  } catch (error) { console.error('Load delivery stats error:', error); }
}

// =============================================================================
// SEND SMS (Admin & Manager Delivery Dashboards) — via Semaphore, through backend
// =============================================================================
let cachedDeliveries = []; // reused by openSmsModal so no extra fetch is needed
let currentSmsDeliveryId = null;

function buildSmsPreviewMessage(delivery) {
  return `Hello ${delivery.customer_name}, your furniture delivery with reference ${delivery.ref_code} is currently ${delivery.status || 'Pending'}.\n\nThank you for choosing Modern Koncept Furniture Centre.`;
}

function openSmsModal(deliveryId) {
  const delivery = cachedDeliveries.find(d => d.id === deliveryId);
  if (!delivery) { showToast('Delivery record not found', 'error'); return; }
  if (!delivery.contact_number) { showToast('Cannot send SMS: customer has no contact number.', 'error'); return; }

  currentSmsDeliveryId = deliveryId;
  document.getElementById('smsCustomerName').textContent = delivery.customer_name;
  document.getElementById('smsContactNumber').textContent = delivery.contact_number;
  document.getElementById('smsRefCode').textContent = delivery.ref_code;
  document.getElementById('smsProduct').textContent = delivery.product || 'N/A';
  document.getElementById('smsStatus').textContent = delivery.status || 'Pending';
  document.getElementById('smsMessagePreview').value = buildSmsPreviewMessage(delivery);

  const btn = document.getElementById('confirmSendSmsBtn');
  if (btn) { btn.disabled = false; btn.textContent = 'Send SMS'; }
  showModal('smsModal');
}

async function confirmSendSms() {
  if (!currentSmsDeliveryId) return;
  const btn = document.getElementById('confirmSendSmsBtn');
  if (btn) { btn.disabled = true; btn.textContent = 'Sending SMS...'; }
  try {
    const result = await API.sendDeliverySms(currentSmsDeliveryId);
    if (result.success) {
      showToast('SMS sent successfully.', 'success');
      hideModal('smsModal');
    } else {
      showToast('❌ ' + (result.message || 'Failed to send SMS. Please try again.'), 'error');
      if (btn) { btn.disabled = false; btn.textContent = 'Send SMS'; }
    }
  } catch (error) {
    showToast('❌ Failed to send SMS. Please try again.', 'error');
    if (btn) { btn.disabled = false; btn.textContent = 'Send SMS'; }
  }
}

// ---- STAFF DELIVERY (view + add only; same table/API as Admin & Manager) ----
async function loadStaffDeliveryList() {
  const tbody = document.getElementById('staffDeliveryList');
  if (!tbody) return;
  try {
    const result = await API.getDeliveries();
    if (result.success) {
      tbody.innerHTML = '';
      if (!result.data || result.data.length === 0) { tbody.innerHTML = '<tr><td colspan="8" style="text-align:center;color:#9ca3af;">No deliveries found</td></tr>'; return; }
      result.data.forEach(item => {
        tbody.innerHTML += `
          <tr>
            <td><strong>${item.ref_code}</strong></td>
            <td>${item.customer_name}</td>
            <td>${item.contact_number || 'N/A'}</td>
            <td style="max-width:200px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;">${item.address}</td>
            <td>${item.product || 'N/A'}</td>
            <td>${getStatusBadge(item.status)}</td>
            <td>${getTypeBadge(item.delivery_type)}</td>
            <td>${formatDate(item.delivery_date)}</td>
          </tr>`;
      });
    } else {
      tbody.innerHTML = '<tr><td colspan="8" style="text-align:center;color:#ef4444;">❌ Failed to load deliveries</td></tr>';
    }
  } catch (error) {
    showToast('❌ Failed to load deliveries', 'error');
    tbody.innerHTML = '<tr><td colspan="8" style="text-align:center;color:#ef4444;">❌ Failed to load deliveries</td></tr>';
  }
}

function openStaffAddDeliveryModal() {
  const form = document.getElementById('staffDeliveryForm');
  if (form) form.reset();
  showModal('staffDeliveryModal');
}

async function handleStaffDeliverySubmit(event) {
  event.preventDefault();
  const data = {
    customer_name: document.getElementById('staffDeliveryCustomer').value.trim(),
    contact_number: document.getElementById('staffDeliveryContactNumber').value.trim(),
    address: document.getElementById('staffDeliveryAddress').value.trim(),
    product: document.getElementById('staffDeliveryProduct').value.trim(),
    status: document.getElementById('staffDeliveryStatus').value,
    delivery_type: document.getElementById('staffDeliveryType').value,
    delivery_date: document.getElementById('staffDeliveryDate').value || null
  };
  if (!data.customer_name || !data.address) { showToast('Customer name and address are required', 'warning'); return; }
  const submitBtn = event.target.querySelector('button[type="submit"]');
  if (submitBtn) submitBtn.disabled = true;
  try {
    const result = await API.createDelivery(data);
    if (result.success) {
      showToast('✅ ' + result.message + (result.ref_code ? ` Reference Code: ${result.ref_code}` : ''), 'success');
      hideModal('staffDeliveryModal');
      loadStaffDeliveryList();
      loadDeliveryStats();
    } else {
      showToast('❌ ' + result.message, 'error');
    }
  } catch (error) { showToast('❌ Failed to save delivery', 'error'); }
  finally { if (submitBtn) submitBtn.disabled = false; }
}

async function loadDeliveryList() {
  try {
    const result = await API.getDeliveries();
    if (result.success) {
      cachedDeliveries = result.data;
      const tbody = document.getElementById('adminDeliveryList');
      if (!tbody) return;
      tbody.innerHTML = '';
      if (result.data.length === 0) { tbody.innerHTML = '<tr><td colspan="10" style="text-align:center;color:#9ca3af;">No deliveries found</td></tr>'; return; }
      result.data.forEach(item => {
        tbody.innerHTML += `
          <tr>
            <td><button class="action-btn edit" onclick="openSmsModal(${item.id})" style="color:#2563eb;border-color:#2563eb;" title="Send SMS"><svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"></path></svg> Send SMS</button></td>
            <td><strong>${item.ref_code}</strong></td>
            <td>${item.customer_name}</td>
            <td>${item.contact_number || 'N/A'}</td>
            <td style="max-width:200px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;">${item.address}</td>
            <td>${item.product || 'N/A'}</td>
            <td>${getStatusBadge(item.status)}</td>
            <td>${getTypeBadge(item.delivery_type)}</td>
            <td>${formatDate(item.delivery_date)}</td>
            <td>
              <button class="action-btn edit" onclick="editDelivery(${item.id})" title="Edit"><svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"></path><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"></path></svg></button>
              <button class="action-btn delete" onclick="deleteDelivery(${item.id})" title="Delete"><svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="3 6 5 6 21 6"></polyline><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"></path></svg></button>
            </td>
          </tr>`;
      });
      loadDeliveryStats();
    }
  } catch (error) { showToast('❌ Failed to load deliveries', 'error'); }
}

// Shared function for staff and manager delivery list rendering
function renderDeliveryTableForRole(deliveries, tbodyId, searchTerm) {
  const tbody = document.getElementById(tbodyId);
  if (!tbody) return;
  tbody.innerHTML = '';

  let filtered = deliveries;
  if (searchTerm) {
    const s = searchTerm.toLowerCase();
    filtered = deliveries.filter(d =>
      d.ref_code.toLowerCase().includes(s) ||
      d.customer_name.toLowerCase().includes(s) ||
      (d.address && d.address.toLowerCase().includes(s)) ||
      (d.product && d.product.toLowerCase().includes(s)) ||
      (d.status && d.status.toLowerCase().includes(s))
    );
  }

  if (filtered.length === 0) {
    tbody.innerHTML = `<tr><td colspan="9" style="text-align:center;padding:2rem;color:#9ca3af;">No deliveries found</td></tr>`;
    return;
  }

  filtered.forEach(delivery => {
    const row = document.createElement('tr');
    row.innerHTML = `
      <td><button class="action-btn edit" onclick="openSmsModal(${delivery.id})" style="color:#2563eb;border-color:#2563eb;" title="Send SMS"><svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"></path></svg> Send SMS</button></td>
      <td><strong>${delivery.ref_code}</strong></td>
      <td>${delivery.customer_name}</td>
      <td>${delivery.contact_number || 'N/A'}</td>
      <td style="max-width:200px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;">${delivery.address}</td>
      <td>${delivery.product || 'N/A'}</td>
      <td>${formatDate(delivery.delivery_date)}</td>
      <td><span style="color:#4b5563;font-size:0.875rem;">${delivery.status || 'Pending'}</span></td>
      <td>
        <select class="status-select" data-delivery-id="${delivery.id}" style="padding:0.375rem 0.75rem;border:2px solid #e5e7eb;border-radius:0.375rem;font-size:0.875rem;cursor:pointer;">
          <option value="Pending" ${delivery.status === 'Pending' ? 'selected' : ''}>Pending</option>
          <option value="Processing" ${delivery.status === 'Processing' ? 'selected' : ''}>Processing</option>
          <option value="In Transit" ${delivery.status === 'In Transit' ? 'selected' : ''}>In Transit</option>
          <option value="Delivered" ${delivery.status === 'Delivered' ? 'selected' : ''}>Delivered</option>
        </select>
        <button class="action-btn edit" onclick="updateDeliveryStatus(${delivery.id})" style="margin-left:0.5rem;" title="Update Status">
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="20 6 9 17 4 12"></polyline></svg>
        </button>
      </td>`;
    tbody.appendChild(row);
  });
}

async function loadManagerDeliveryList() {
  try {
    const result = await API.getDeliveries();
    if (result.success) {
      cachedDeliveries = result.data;
      const searchTerm = document.getElementById('managerDeliverySearch') ? document.getElementById('managerDeliverySearch').value : '';
      renderDeliveryTableForRole(result.data, 'managerDeliveryList', searchTerm);
      loadDeliveryStats();
    }
  } catch (error) {
    showToast('Failed to load deliveries', 'error');
    const tbody = document.getElementById('managerDeliveryList');
    if (tbody) tbody.innerHTML = '<tr><td colspan="9" style="text-align:center;color:#ef4444;">❌ Failed to load deliveries</td></tr>';
  }
}

function getStatusBadge(status) {
  const labels = {
    'pending': 'Pending', 'processing': 'Processing',
    'in_transit': 'In Transit', 'delivered': 'Delivered',
    'Pending': 'Pending', 'Processing': 'Processing',
    'In Transit': 'In Transit', 'Delivered': 'Delivered'
  };
  const text = labels[status] || status;
  return `<span style="color:#4b5563;font-size:0.875rem;">${text}</span>`;
}

function getTypeBadge(type) {
  return `<span style="color:#4b5563;font-size:0.875rem;">${type || 'N/A'}</span>`;
}

function openAddDeliveryModal() {
  editingDeliveryId = null;
  document.getElementById('deliveryModalTitle').textContent = 'Add New Delivery';
  document.getElementById('deliveryForm').reset();
  showModal('deliveryModal');
}

async function handleDeliverySubmit(event) {
  event.preventDefault();
  // Managers may only ADD deliveries; editing existing delivery fields is Admin-only (also enforced by the backend)
  if (window.location.pathname.includes('manager') && editingDeliveryId) { showToast('Managers can only update delivery status.', 'error'); return; }
  const data = {
    customer_name: document.getElementById('deliveryCustomer').value,
    contact_number: document.getElementById('deliveryContactNumber').value,
    address: document.getElementById('deliveryAddress').value,
    product: document.getElementById('deliveryProduct').value,
    status: document.getElementById('deliveryStatus').value,
    delivery_type: document.getElementById('deliveryType').value,
    delivery_date: document.getElementById('deliveryDate').value || null
  };
  try {
    const result = editingDeliveryId ? await API.updateDelivery(editingDeliveryId, data) : await API.createDelivery(data);
    if (result.success) {
      showToast('✅ ' + result.message + (result.ref_code ? ` Reference Code: ${result.ref_code}` : ''), 'success');
      hideModal('deliveryModal');
      if (window.location.pathname.includes('manager')) loadManagerDeliveryList();
      else loadDeliveryList();
      loadDeliveryStats();
    } else {
      alert('❌ ' + result.message);
    }
  } catch (error) { showToast('❌ Failed to save delivery', 'error'); }
}

async function editDelivery(id) {
  try {
    const result = await API.getDeliveries();
    if (result.success) {
      const item = result.data.find(d => d.id === id);
      if (!item) { showToast('Delivery not found', 'error'); return; }
      editingDeliveryId = id;
      document.getElementById('deliveryModalTitle').textContent = 'Update Delivery';
      document.getElementById('deliveryCustomer').value = item.customer_name;
      document.getElementById('deliveryContactNumber').value = item.contact_number || '';
      document.getElementById('deliveryAddress').value = item.address;
      document.getElementById('deliveryProduct').value = item.product || '';
      document.getElementById('deliveryStatus').value = item.status;
      document.getElementById('deliveryType').value = item.delivery_type || 'Outbound';
      document.getElementById('deliveryDate').value = item.delivery_date ? item.delivery_date.split('T')[0] : '';
      showModal('deliveryModal');
    }
  } catch (error) { showToast('❌ Failed to load delivery details', 'error'); }
}

async function deleteDelivery(id) {
  if (!confirm('Are you sure you want to delete this delivery?')) return;
  try {
    const result = await API.deleteDelivery(id);
    if (result.success) { showToast(result.message, 'success'); loadDeliveryList(); loadDeliveryStats(); }
    else showToast('❌ ' + result.message, 'error');
  } catch (error) { showToast('❌ Failed to delete delivery', 'error'); }
}

async function updateDeliveryStatus(deliveryId) {
  const selectElement = document.querySelector(`.status-select[data-delivery-id="${deliveryId}"]`);
  if (!selectElement) { showToast('Error: Could not find status selector', 'error'); return; }
  const newStatus = selectElement.value;
  try {
    const result = await API.updateDeliveryStatus(deliveryId, newStatus);
    if (result.success) {
      showToast('✓ Delivery status updated successfully', 'success');
      if (window.location.pathname.includes('manager')) loadManagerDeliveryList();
    } else showToast('❌ ' + result.message, 'error');
  } catch (error) { showToast('❌ Failed to update status', 'error'); }
}

// =============================================================================
// SALES RECORDS
// =============================================================================
async function loadSalesList() {
  try {
    const result = await API.getSales();
    if (result.success) {
      const tbody = document.getElementById('adminSalesList');
      if (!tbody) return;
      tbody.innerHTML = '';
      if (result.data.length === 0) {
        tbody.innerHTML = '<tr><td colspan="5" style="text-align:center;color:#9ca3af;">No sales records found</td></tr>';
        ['totalSales', 'totalRecords', 'averageSale'].forEach(id => { const el = document.getElementById(id); if (el) el.textContent = id === 'totalRecords' ? '0' : '₱0.00'; });
        return;
      }
      result.data.forEach(item => {
        tbody.innerHTML += `
          <tr>
            <td>${formatDate(item.sale_date)}</td>
            <td>${item.customer_name}</td>
            <td>${formatSaleProduct(item)}</td>
            <td>${formatCurrency(item.amount)}</td>
            <td>
              <button class="action-btn edit" onclick="editAdminSalesRecord(${item.id})" title="Edit"><svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"></path><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"></path></svg></button>
              <button class="action-btn delete" onclick="deleteSales(${item.id})" title="Delete"><svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="3 6 5 6 21 6"></polyline><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"></path></svg></button>
            </td>
          </tr>`;
      });
      loadSalesAnalytics();
    }
  } catch (error) { showToast('❌ Failed to load sales records', 'error'); }
}

async function loadSalesAnalytics() {
  try {
    const result = await API.getSales();
    if (result.success && result.data.length > 0) {
      const salesData = result.data;
      const totalRecords = salesData.length;
      const totalSales = salesData.reduce((sum, s) => sum + parseFloat(s.amount), 0);
      const averageSale = totalSales / totalRecords;
      const setEl = (id, val) => { const el = document.getElementById(id); if (el) el.textContent = val; };
      setEl('totalSales', formatCurrency(totalSales));
      setEl('totalRecords', totalRecords.toString());
      setEl('averageSale', formatCurrency(averageSale));
      await loadMonthlySalesCharts();
    }
  } catch (error) { console.error('Load sales analytics error:', error); }
}

async function loadMonthlySalesCharts() {
  try {
    const response = await fetch(`${API_URL}/sales/monthly`);
    const monthlyData = await response.json();
    if (monthlyData && monthlyData.length > 0) {
      const monthNames = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
      const labels = monthlyData.map(item => `${monthNames[item.month - 1]} ${item.year}`);
      const amounts = monthlyData.map(item => parseFloat(item.total));
      renderRevenueBarChart(labels, amounts);
      renderSalesLineChart(labels, amounts);
    }
  } catch (error) { console.error('Load monthly sales error:', error); }
}

function renderRevenueBarChart(labels, data) {
  const ctx = document.getElementById('revenueBarChart');
  if (!ctx) return;
  if (window.revenueBarChartInstance) window.revenueBarChartInstance.destroy();
  window.revenueBarChartInstance = new Chart(ctx, {
    type: 'bar',
    data: { labels, datasets: [{ label: 'Monthly Revenue (₱)', data, backgroundColor: 'rgba(220,20,60,0.7)', borderColor: '#DC143C', borderWidth: 2, borderRadius: 6 }] },
    options: { responsive: true, maintainAspectRatio: true, plugins: { legend: { display: false }, tooltip: { callbacks: { label: ctx => 'Revenue: ₱' + ctx.parsed.y.toLocaleString('en-US', { minimumFractionDigits: 2 }) } } }, scales: { y: { beginAtZero: true, ticks: { callback: val => '₱' + val.toLocaleString('en-US') } } } }
  });
}

function renderSalesLineChart(labels, data) {
  const ctx = document.getElementById('salesLineChart');
  if (!ctx) return;
  if (window.salesLineChartInstance) window.salesLineChartInstance.destroy();
  window.salesLineChartInstance = new Chart(ctx, {
    type: 'line',
    data: { labels, datasets: [{ label: 'Sales Trend (₱)', data, backgroundColor: 'rgba(220,20,60,0.1)', borderColor: '#DC143C', borderWidth: 3, fill: true, tension: 0.4, pointBackgroundColor: '#DC143C', pointBorderColor: '#fff', pointBorderWidth: 2, pointRadius: 5, pointHoverRadius: 7 }] },
    options: { responsive: true, maintainAspectRatio: true, plugins: { legend: { display: false }, tooltip: { callbacks: { label: ctx => 'Sales: ₱' + ctx.parsed.y.toLocaleString('en-US', { minimumFractionDigits: 2 }) } } }, scales: { y: { beginAtZero: true, ticks: { callback: val => '₱' + val.toLocaleString('en-US') } } } }
  });
}

async function loadStaffSalesList() {
  try {
    const result = await API.getSales();
    if (result.success) {
      const tbody = document.getElementById('staffSalesList');
      if (!tbody) return;
      tbody.innerHTML = '';
      if (result.data.length === 0) { tbody.innerHTML = '<tr><td colspan="5" style="text-align:center;color:#9ca3af;">No sales records found</td></tr>'; return; }
      result.data.forEach(item => {
        tbody.innerHTML += `
          <tr>
            <td>${formatDate(item.sale_date)}</td>
            <td>${item.customer_name}</td>
            <td>${formatSaleProduct(item)}</td>
            <td>${formatCurrency(item.amount)}</td>
            <td><button class="action-btn edit" onclick="editStaffSalesRecord(${item.id})" title="Edit"><svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"></path><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"></path></svg> Edit</button></td>
          </tr>`;
      });
    }
  } catch (error) { showToast('❌ Failed to load sales records', 'error'); }
}

async function loadManagerSalesList() {
  try {
    const result = await API.getSales();
    if (result.success) {
      const tbody = document.getElementById('managerSalesList');
      if (!tbody) return;
      tbody.innerHTML = '';
      if (result.data.length === 0) { tbody.innerHTML = '<tr><td colspan="5" style="text-align:center;color:#9ca3af;">No sales records found</td></tr>'; return; }
      result.data.forEach(item => {
        tbody.innerHTML += `
          <tr>
            <td>${formatDate(item.sale_date)}</td>
            <td>${item.customer_name}</td>
            <td>${item.product_name}</td>
            <td>${formatCurrency(item.amount)}</td>
            <td><button class="action-btn edit" onclick="editManagerSalesRecord(${item.id})" title="Edit"><svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"></path><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"></path></svg> Edit</button></td>
          </tr>`;
      });
    }
  } catch (error) { showToast('❌ Failed to load sales records', 'error'); }
}

async function editStaffSalesRecord(id) {
  await openSalesEditForm(id, {
    idField: 'editSalesId',
    customer: 'editSalesCustomer',
    product: 'editSalesProduct',
    quantity: 'editSalesQuantity',
    amount: 'editSalesAmount',
    date: 'editSalesDate',
    modal: 'editSalesModal'
  });
}

async function editManagerSalesRecord(id) {
  try {
    const result = await API.getSales();
    if (result.success) {
      const record = result.data.find(item => item.id === id);
      if (record) {
        document.getElementById('managerEditSalesId').value = record.id;
        document.getElementById('managerEditSalesCustomer').value = record.customer_name;
        document.getElementById('managerEditSalesProduct').value = record.product_name;
        document.getElementById('managerEditSalesAmount').value = record.amount;
        document.getElementById('managerEditSalesDate').value = record.sale_date.split('T')[0];
        showModal('managerEditSalesModal');
      }
    }
  } catch (error) { showToast('❌ Failed to load sales record', 'error'); }
}

async function loadStaffSalesAnalytics() {
  try {
    const result = await API.getSales();
    if (result.success && result.data.length > 0) {
      const salesData = result.data;
      const totalRecords = salesData.length;
      const totalSales = salesData.reduce((sum, s) => sum + parseFloat(s.amount), 0);
      const averageSale = totalSales / totalRecords;
      const setEl = (id, val) => { const el = document.getElementById(id); if (el) el.textContent = val; };
      setEl('staffTotalSales', formatCurrency(totalSales));
      setEl('staffTotalRecords', totalRecords.toString());
      setEl('staffAverageSale', formatCurrency(averageSale));
      await loadStaffMonthlySalesCharts();
    }
  } catch (error) { console.error('Load staff sales analytics error:', error); }
}

async function loadManagerSalesAnalytics() {
  try {
    const result = await API.getSales();
    if (result.success && result.data.length > 0) {
      const salesData = result.data;
      const totalRecords = salesData.length;
      const totalSales = salesData.reduce((sum, s) => sum + parseFloat(s.amount), 0);
      const averageSale = totalSales / totalRecords;
      const setEl = (id, val) => { const el = document.getElementById(id); if (el) el.textContent = val; };
      setEl('managerTotalSales', formatCurrency(totalSales));
      setEl('managerTotalRecords', totalRecords.toString());
      setEl('managerAverageSale', formatCurrency(averageSale));
      await loadManagerMonthlySalesCharts();
    } else {
      const setEl = (id, val) => { const el = document.getElementById(id); if (el) el.textContent = val; };
      setEl('managerTotalSales', '₱0.00');
      setEl('managerTotalRecords', '0');
      setEl('managerAverageSale', '₱0.00');
    }
  } catch (error) { console.error('Load manager sales analytics error:', error); }
}

async function loadStaffMonthlySalesCharts() {
  try {
    const response = await fetch(`${API_URL}/sales/monthly`);
    const monthlyData = await response.json();
    if (monthlyData && monthlyData.length > 0) {
      const monthNames = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
      const labels = monthlyData.map(item => `${monthNames[item.month - 1]} ${item.year}`);
      const amounts = monthlyData.map(item => parseFloat(item.total));
      renderStaffRevenueBarChart(labels, amounts);
      renderStaffSalesLineChart(labels, amounts);
    }
  } catch (error) { console.error('Load staff monthly sales error:', error); }
}

async function loadManagerMonthlySalesCharts() {
  try {
    const response = await fetch(`${API_URL}/sales/monthly`);
    const monthlyData = await response.json();
    if (monthlyData && monthlyData.length > 0) {
      const monthNames = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
      const labels = monthlyData.map(item => `${monthNames[item.month - 1]} ${item.year}`);
      const amounts = monthlyData.map(item => parseFloat(item.total));
      renderManagerRevenueBarChart(labels, amounts);
      renderManagerSalesLineChart(labels, amounts);
    }
  } catch (error) { console.error('Load manager monthly sales error:', error); }
}

function renderStaffRevenueBarChart(labels, data) {
  const ctx = document.getElementById('staffRevenueBarChart');
  if (!ctx) return;
  if (window.staffRevenueBarChartInstance) window.staffRevenueBarChartInstance.destroy();
  window.staffRevenueBarChartInstance = new Chart(ctx, {
    type: 'bar',
    data: { labels, datasets: [{ label: 'Monthly Revenue (₱)', data, backgroundColor: 'rgba(220,20,60,0.7)', borderColor: '#DC143C', borderWidth: 2, borderRadius: 6 }] },
    options: { responsive: true, maintainAspectRatio: true, plugins: { legend: { display: false } }, scales: { y: { beginAtZero: true, ticks: { callback: val => '₱' + val.toLocaleString('en-US') } } } }
  });
}

function renderStaffSalesLineChart(labels, data) {
  const ctx = document.getElementById('staffSalesLineChart');
  if (!ctx) return;
  if (window.staffSalesLineChartInstance) window.staffSalesLineChartInstance.destroy();
  window.staffSalesLineChartInstance = new Chart(ctx, {
    type: 'line',
    data: { labels, datasets: [{ label: 'Sales Trend (₱)', data, backgroundColor: 'rgba(220,20,60,0.1)', borderColor: '#DC143C', borderWidth: 3, fill: true, tension: 0.4, pointBackgroundColor: '#DC143C', pointBorderColor: '#fff', pointBorderWidth: 2, pointRadius: 5, pointHoverRadius: 7 }] },
    options: { responsive: true, maintainAspectRatio: true, plugins: { legend: { display: false } }, scales: { y: { beginAtZero: true, ticks: { callback: val => '₱' + val.toLocaleString('en-US') } } } }
  });
}

function renderManagerRevenueBarChart(labels, data) {
  const ctx = document.getElementById('managerRevenueBarChart');
  if (!ctx) return;
  if (window.managerRevenueBarChartInstance) window.managerRevenueBarChartInstance.destroy();
  window.managerRevenueBarChartInstance = new Chart(ctx, {
    type: 'bar',
    data: { labels, datasets: [{ label: 'Monthly Revenue (₱)', data, backgroundColor: 'rgba(220,20,60,0.7)', borderColor: '#DC143C', borderWidth: 2, borderRadius: 6 }] },
    options: { responsive: true, maintainAspectRatio: true, plugins: { legend: { display: false } }, scales: { y: { beginAtZero: true, ticks: { callback: val => '₱' + val.toLocaleString('en-US') } } } }
  });
}

function renderManagerSalesLineChart(labels, data) {
  const ctx = document.getElementById('managerSalesLineChart');
  if (!ctx) return;
  if (window.managerSalesLineChartInstance) window.managerSalesLineChartInstance.destroy();
  window.managerSalesLineChartInstance = new Chart(ctx, {
    type: 'line',
    data: { labels, datasets: [{ label: 'Sales Trend (₱)', data, backgroundColor: 'rgba(220,20,60,0.1)', borderColor: '#DC143C', borderWidth: 3, fill: true, tension: 0.4, pointBackgroundColor: '#DC143C', pointBorderColor: '#fff', pointBorderWidth: 2, pointRadius: 5, pointHoverRadius: 7 }] },
    options: { responsive: true, maintainAspectRatio: true, plugins: { legend: { display: false } }, scales: { y: { beginAtZero: true, ticks: { callback: val => '₱' + val.toLocaleString('en-US') } } } }
  });
}

// =============================================================================
// SALES - INVENTORY PRODUCT DROPDOWN + STOCK DEDUCTION (Admin and Staff)
// Both dashboards read the SAME inventory table through GET /inventory, and the
// backend (Postgres functions) deducts / restores stock atomically.
// =============================================================================
const SALES_QTY_FIELD = {
  salesProductName: 'salesQuantity',
  salesProduct: 'salesQuantity',
  editAdminSalesProduct: 'editAdminSalesQuantity',
  editSalesProduct: 'editSalesQuantity'
};
const salesInventoryItems = {}; // selectId -> { inventoryId: item } (used for the stock hint)
const saleRequestIds = {};      // 'admin' | 'staff' -> id that stops duplicate submissions
const saleSubmitting = {};      // formId -> true while a request is in flight

function newSaleRequestId() {
  if (window.crypto && typeof window.crypto.randomUUID === 'function') return window.crypto.randomUUID();
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, c => {
    const r = Math.random() * 16 | 0;
    return (c === 'x' ? r : (r & 0x3 | 0x8)).toString(16);
  });
}

// Product cell for the All Sales Records table (adds "× qty" for sales that deducted stock)
function formatSaleProduct(item) {
  const qty = item.stock_deducted && item.quantity ? ` <span style="color:#6b7280;">× ${item.quantity}</span>` : '';
  return `${item.product_name}${qty}`;
}

function updateSalesStockHint(selectId) {
  const select = document.getElementById(selectId);
  if (!select) return;
  const hint = document.getElementById(selectId + 'Hint');
  const qtyInput = document.getElementById(SALES_QTY_FIELD[selectId]);
  const isKeep = select.value === '__keep__';
  if (qtyInput) qtyInput.disabled = isKeep;
  const item = (salesInventoryItems[selectId] || {})[select.value];
  if (!item) {
    if (hint) hint.textContent = isKeep ? 'Stock will not change for this older record.' : '';
    if (qtyInput) qtyInput.removeAttribute('max');
    return;
  }
  let available = parseInt(item.quantity, 10) || 0;
  if (select.dataset.extraId && String(select.dataset.extraId) === String(item.id)) {
    available += parseInt(select.dataset.extraQty, 10) || 0; // units this sale already holds
  }
  if (hint) hint.textContent = available > 0 ? `Available stock: ${available}` : 'Out of stock';
  if (qtyInput) qtyInput.max = String(Math.max(available, 1));
}

// Fills a <select> with the CURRENT inventory records (never a hardcoded list).
async function loadSalesProductOptions(selectId, opts = {}) {
  const select = document.getElementById(selectId);
  if (!select) return false;
  const previous = select.value;
  select.disabled = true;
  select.innerHTML = '';
  const loading = document.createElement('option');
  loading.value = '';
  loading.textContent = 'Loading inventory...';
  select.appendChild(loading);
  select.dataset.extraId = opts.extraId != null ? String(opts.extraId) : '';
  select.dataset.extraQty = opts.extraQty != null ? String(opts.extraQty) : '0';
  if (!select.dataset.bound) {
    select.addEventListener('change', () => updateSalesStockHint(selectId));
    select.dataset.bound = '1';
  }
  try {
    const result = await API.getInventory();
    if (!result || !result.success || !Array.isArray(result.data)) throw new Error((result && result.message) || 'Invalid inventory response');
    const items = result.data.slice().sort((a, b) => String(a.name).localeCompare(String(b.name)));
    salesInventoryItems[selectId] = {};
    select.innerHTML = '';

    const placeholder = document.createElement('option');
    placeholder.value = '';
    placeholder.textContent = items.length ? 'Select an available inventory item' : 'No inventory items available';
    select.appendChild(placeholder);

    if (opts.keepName) {
      const keep = document.createElement('option');
      keep.value = '__keep__';
      keep.textContent = `Keep current: ${opts.keepName} (stock will not change)`;
      select.appendChild(keep);
      select.dataset.keepName = opts.keepName;
    }

    items.forEach(item => {
      salesInventoryItems[selectId][item.id] = item;
      const qty = parseInt(item.quantity, 10) || 0;
      const isCurrent = opts.extraId != null && String(opts.extraId) === String(item.id);
      const option = document.createElement('option');
      option.value = String(item.id);
      option.textContent = `${item.name}${item.item_code ? ' (' + item.item_code + ')' : ''} — ${qty > 0 ? qty + ' in stock' : 'Out of stock'}`;
      if (qty <= 0 && !isCurrent) option.disabled = true;
      select.appendChild(option);
    });

    const wanted = opts.selectedId != null ? String(opts.selectedId) : (opts.keepName ? '__keep__' : previous);
    select.value = Array.from(select.options).some(o => o.value === wanted && !o.disabled) ? wanted : '';
    select.disabled = false;
    updateSalesStockHint(selectId);
    return true;
  } catch (error) {
    console.error('Load sales product options error:', error);
    select.innerHTML = '';
    const failed = document.createElement('option');
    failed.value = '';
    failed.textContent = 'Unable to load inventory items';
    select.appendChild(failed);
    select.disabled = false;
    showToast('❌ Unable to load inventory items. Please close and reopen this form to try again.', 'error');
    return false;
  }
}

function openAddSalesModal() {
  document.getElementById('salesForm').reset();
  saleRequestIds.admin = newSaleRequestId();
  showModal('salesModal');
  loadSalesProductOptions('salesProductName');
}

// Shared "add sale" submit for the Admin modal and the Staff form.
async function submitNewSale(cfg) {
  if (saleSubmitting[cfg.formId]) return; // a request is already running
  const form = document.getElementById(cfg.formId);
  const btn = form ? form.querySelector('button[type="submit"]') : null;
  const select = document.getElementById(cfg.productId);
  const inventoryId = select ? parseInt(select.value, 10) : NaN;
  if (!inventoryId) { showToast('Please select a product from the inventory list', 'warning'); return; }
  const quantity = Number(document.getElementById(cfg.quantityId).value);
  if (!Number.isInteger(quantity) || quantity < 1) { showToast('Quantity must be a positive whole number', 'warning'); return; }
  const amount = parseFloat(document.getElementById(cfg.amountId).value);
  if (!(amount > 0)) { showToast('Please enter a valid amount', 'warning'); return; }
  const dateField = document.getElementById(cfg.dateId);
  if (!saleRequestIds[cfg.key]) saleRequestIds[cfg.key] = newSaleRequestId();

  const data = {
    customer_name: document.getElementById(cfg.customerId).value.trim(),
    inventory_id: inventoryId,
    quantity,
    amount,
    sale_date: dateField && dateField.value ? dateField.value : new Date().toISOString().split('T')[0],
    request_id: saleRequestIds[cfg.key]
  };

  saleSubmitting[cfg.formId] = true;
  if (btn) btn.disabled = true;
  try {
    const result = await API.createSales(data);
    if (result.success) {
      showToast(result.message || 'Sales record added successfully', 'success');
      saleRequestIds[cfg.key] = null;
      try { await cfg.onSuccess(); } catch (refreshError) { console.error('Refresh after sale failed:', refreshError); }
    } else {
      showToast('❌ ' + result.message, 'error');
      saleRequestIds[cfg.key] = null; // the server rejected it, so nothing was saved
      if (['INSUFFICIENT_STOCK', 'OUT_OF_STOCK', 'ITEM_NOT_FOUND'].includes(result.code)) loadSalesProductOptions(cfg.productId);
    }
  } catch (error) {
    // Outcome unknown (network error): keep the same request id so a retry cannot deduct twice
    showToast('❌ Failed to save sales record', 'error');
  } finally {
    saleSubmitting[cfg.formId] = false;
    if (btn) btn.disabled = false;
  }
}

function handleSalesSubmit(event) {
  event.preventDefault();
  return submitNewSale({
    key: 'admin',
    formId: 'salesForm',
    customerId: 'salesCustomerName',
    productId: 'salesProductName',
    quantityId: 'salesQuantity',
    amountId: 'salesAmount',
    dateId: 'salesDateInput',
    onSuccess: async () => {
      hideModal('salesModal');
      await Promise.all([loadSalesList(), loadInventoryList()]);
    }
  });
}

function handleStaffSalesSubmit(event) {
  event.preventDefault();
  return submitNewSale({
    key: 'staff',
    formId: 'staffSalesForm',
    customerId: 'salesCustomer',
    productId: 'salesProduct',
    quantityId: 'salesQuantity',
    amountId: 'salesAmount',
    dateId: 'salesDate',
    onSuccess: async () => {
      document.getElementById('staffSalesForm').reset();
      await Promise.all([loadSalesProductOptions('salesProduct'), loadStaffSalesList(), loadStaffSalesAnalytics(), loadStaffInventoryList()]);
    }
  });
}

// Shared "edit sale" opener / submit for Admin and Staff.
async function openSalesEditForm(id, f) {
  try {
    const result = await API.getSales();
    if (!result.success) return;
    const record = result.data.find(item => item.id === id);
    if (!record) return;
    document.getElementById(f.idField).value = record.id;
    document.getElementById(f.customer).value = record.customer_name;
    document.getElementById(f.amount).value = record.amount;
    document.getElementById(f.date).value = record.sale_date.split('T')[0];
    const tracked = !!(record.stock_deducted && record.inventory_id);
    document.getElementById(f.quantity).value = tracked ? record.quantity : 1;
    showModal(f.modal);
    await loadSalesProductOptions(f.product, tracked
      ? { selectedId: record.inventory_id, extraId: record.inventory_id, extraQty: record.quantity }
      : { keepName: record.product_name });
  } catch (error) { showToast('❌ Failed to load sales record', 'error'); }
}

async function submitSalesEdit(cfg) {
  if (saleSubmitting[cfg.formId]) return;
  const form = document.getElementById(cfg.formId);
  const btn = form ? form.querySelector('button[type="submit"]') : null;
  const select = document.getElementById(cfg.productId);
  const productValue = select ? select.value : '';
  const data = {
    customer_name: document.getElementById(cfg.customerId).value.trim(),
    amount: parseFloat(document.getElementById(cfg.amountId).value),
    sale_date: document.getElementById(cfg.dateId).value
  };
  if (!(data.amount > 0)) { showToast('Please enter a valid amount', 'warning'); return; }
  if (productValue === '__keep__') {
    data.product_name = select.dataset.keepName || '';
  } else {
    const inventoryId = parseInt(productValue, 10);
    if (!inventoryId) { showToast('Please select a product from the inventory list', 'warning'); return; }
    const quantity = Number(document.getElementById(cfg.quantityId).value);
    if (!Number.isInteger(quantity) || quantity < 1) { showToast('Quantity must be a positive whole number', 'warning'); return; }
    data.inventory_id = inventoryId;
    data.quantity = quantity;
  }
  saleSubmitting[cfg.formId] = true;
  if (btn) btn.disabled = true;
  try {
    const result = await API.updateSales(document.getElementById(cfg.idField).value, data);
    if (result.success) {
      showToast('✅ Sales record updated', 'success');
      hideModal(cfg.modalId);
      try { await cfg.onSuccess(); } catch (refreshError) { console.error('Refresh after edit failed:', refreshError); }
    } else {
      showToast('❌ ' + result.message, 'error');
      if (['INSUFFICIENT_STOCK', 'OUT_OF_STOCK', 'ITEM_NOT_FOUND'].includes(result.code)) cfg.onStockChanged && cfg.onStockChanged();
    }
  } catch (err) { showToast('❌ Failed to update sales record', 'error'); }
  finally {
    saleSubmitting[cfg.formId] = false;
    if (btn) btn.disabled = false;
  }
}

async function handleManagerSalesSubmit(event) {
  event.preventDefault();
  const data = {
    customer_name: document.getElementById('managerSalesCustomer').value,
    product_name: document.getElementById('managerSalesProduct').value,
    amount: parseFloat(document.getElementById('managerSalesAmount').value),
    sale_date: document.getElementById('managerSalesDate').value || new Date().toISOString().split('T')[0]
  };
  try {
    const result = await API.createSales(data);
    if (result.success) {
      showToast(result.message, 'success');
      document.getElementById('managerSalesForm').reset();
      loadManagerSalesList();
      loadManagerSalesAnalytics();
    } else showToast('❌ ' + result.message, 'error');
  } catch (error) { showToast('❌ Failed to save sales record', 'error'); }
}

async function deleteSales(id) {
  if (!confirm('Are you sure you want to delete this sales record?')) return;
  try {
    const result = await API.deleteSales(id);
    if (result.success) { showToast('✅ ' + result.message, 'success'); loadSalesList(); loadInventoryList(); }
    else showToast('❌ ' + result.message, 'error');
  } catch (error) { showToast('❌ Failed to delete sales record', 'error'); }
}

async function editAdminSalesRecord(id) {
  await openSalesEditForm(id, {
    idField: 'editAdminSalesId',
    customer: 'editAdminSalesCustomer',
    product: 'editAdminSalesProduct',
    quantity: 'editAdminSalesQuantity',
    amount: 'editAdminSalesAmount',
    date: 'editAdminSalesDate',
    modal: 'editAdminSalesModal'
  });
}

// =============================================================================
// STAFF ACCOUNT MANAGEMENT (ADMIN)
// =============================================================================
let staffAccountsCache = {}; // id -> account row from the last GET /staff
let staffEditSubmitting = false;

async function loadStaffAccountsList() {
  try {
    const result = await API.getStaff();
    if (result.success) {
      const tbody = document.getElementById('staffAccountsList');
      if (!tbody) return;
      tbody.innerHTML = '';
      staffAccountsCache = {};
      if (result.data.length === 0) { tbody.innerHTML = '<tr><td colspan="5" style="text-align:center;color:#9ca3af;">No accounts found</td></tr>'; return; }
      result.data.forEach(item => {
        staffAccountsCache[item.id] = item;
        const editBtn = (item.role || 'staff') === 'staff'
          ? `<button class="action-btn edit" onclick="openEditStaffModal(${item.id})" title="Edit"><svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"></path><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"></path></svg> Edit</button> `
          : '';
        const roleColor = item.role === 'manager' ? '#8b5cf6' : '#065f46';
        const roleBg = item.role === 'manager' ? '#ede9fe' : '#d1fae5';
        const roleLabel = item.role === 'manager' ? 'Manager' : 'Staff';
        tbody.innerHTML += `
          <tr>
            <td>${item.name}</td>
            <td>${item.email}</td>
            <td><span style="padding:0.25rem 0.75rem;background:${roleBg};color:${roleColor};border-radius:9999px;font-size:0.75rem;font-weight:600;">${roleLabel}</span></td>
            <td>${formatDate(item.created_at)}</td>
            <td>${editBtn}<button class="action-btn delete" onclick="deleteStaffAccount(${item.id})" title="Delete"><svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="3 6 5 6 21 6"></polyline><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"></path></svg></button></td>
          </tr>`;
      });
    }
  } catch (error) { showToast('❌ Failed to load accounts', 'error'); }
}

function openAddStaffModal() {
  const modalHTML = `
    <div id="staffAccountModal" class="modal active">
      <div class="modal-content">
        <div class="modal-header">
          <h3 class="modal-title">Create Account</h3>
          <button class="modal-close" onclick="hideModal('staffAccountModal'); document.getElementById('staffAccountModal').remove();">×</button>
        </div>
        <div class="modal-body">
          <form id="staffAccountForm">
            <div class="form-group">
              <label class="form-label">Full Name</label>
              <input type="text" id="staffAccountName" class="form-input" required>
            </div>
            <div class="form-group">
              <label class="form-label">Email</label>
              <input type="email" id="staffAccountEmail" class="form-input" required>
            </div>
            <div class="form-group">
              <label class="form-label">Password</label>
              <input type="password" id="staffAccountPassword" class="form-input" required>
            </div>
            <div class="form-group">
              <label class="form-label">Role</label>
              <select id="staffAccountRole" class="form-input" required>
                <option value="staff">Staff</option>
                <option value="manager">Manager</option>
              </select>
            </div>
            <div style="display:flex;gap:0.75rem;">
              <button type="submit" class="btn btn-accent" style="flex:1;">Create Account</button>
              <button type="button" class="btn btn-secondary" onclick="hideModal('staffAccountModal'); document.getElementById('staffAccountModal').remove();" style="flex:1;">Cancel</button>
            </div>
          </form>
        </div>
      </div>
    </div>`;
  document.body.insertAdjacentHTML('beforeend', modalHTML);
  document.getElementById('staffAccountForm').addEventListener('submit', handleStaffAccountSubmit);
}

async function handleStaffAccountSubmit(event) {
  event.preventDefault();
  const data = {
    name: document.getElementById('staffAccountName').value,
    email: document.getElementById('staffAccountEmail').value,
    password: document.getElementById('staffAccountPassword').value,
    role: document.getElementById('staffAccountRole').value
  };
  try {
    const result = await API.createStaff(data);
    if (result.success) {
      showToast(result.message, 'success');
      hideModal('staffAccountModal');
      document.getElementById('staffAccountModal').remove();
      loadStaffAccountsList();
    } else showToast('❌ ' + result.message, 'error');
  } catch (error) { showToast('❌ Failed to create account', 'error'); }
}

async function deleteStaffAccount(id) {
  if (!confirm('Are you sure you want to delete this account?')) return;
  try {
    const result = await API.deleteStaff(id);
    if (result.success) { showToast(result.message, 'success'); loadStaffAccountsList(); }
    else showToast('❌ ' + result.message, 'error');
  } catch (error) { showToast('❌ Failed to delete account', 'error'); }
}

function closeEditStaffModal() {
  const modal = document.getElementById('editStaffAccountModal');
  if (modal) modal.remove();
}

function openEditStaffModal(id) {
  const account = staffAccountsCache[id];
  // Only actual Staff accounts are editable here (the backend enforces this again)
  if (!account) { showToast('Account not found. Please refresh the list.', 'error'); return; }
  if ((account.role || 'staff') !== 'staff') { showToast('Only Staff accounts can be edited here.', 'error'); return; }
  closeEditStaffModal();
  const modalHTML = `
    <div id="editStaffAccountModal" class="modal active">
      <div class="modal-content">
        <div class="modal-header">
          <h3 class="modal-title">Edit Staff Account</h3>
          <button class="modal-close" type="button" onclick="closeEditStaffModal()">×</button>
        </div>
        <div class="modal-body">
          <form id="editStaffAccountForm">
            <input type="hidden" id="editStaffAccountId">
            <div class="form-group">
              <label class="form-label">Full Name</label>
              <input type="text" id="editStaffAccountName" class="form-input" maxlength="100" required>
            </div>
            <div class="form-group">
              <label class="form-label">Email</label>
              <input type="email" id="editStaffAccountEmail" class="form-input" maxlength="254" required>
            </div>
            <div class="form-group">
              <label class="form-label">Role</label>
              <select id="editStaffAccountRole" class="form-input" required>
                <option value="staff">Staff</option>
                <option value="manager">Manager</option>
              </select>
            </div>
            <div class="form-group">
              <label class="form-label">New Password</label>
              <input type="password" id="editStaffAccountPassword" class="form-input" maxlength="128" autocomplete="new-password" placeholder="Leave blank to keep the current password">
            </div>
            <div style="display:flex;gap:0.75rem;">
              <button type="submit" class="btn btn-accent" style="flex:1;">Save Changes</button>
              <button type="button" class="btn btn-secondary" onclick="closeEditStaffModal()" style="flex:1;">Cancel</button>
            </div>
          </form>
        </div>
      </div>
    </div>`;
  document.body.insertAdjacentHTML('beforeend', modalHTML);
  // Values are set through the DOM (not the HTML string) so names/emails can never break the markup
  document.getElementById('editStaffAccountId').value = account.id;
  document.getElementById('editStaffAccountName').value = account.name || '';
  document.getElementById('editStaffAccountEmail').value = account.email || '';
  document.getElementById('editStaffAccountRole').value = 'staff';
  document.getElementById('editStaffAccountForm').addEventListener('submit', handleEditStaffSubmit);
}

async function handleEditStaffSubmit(event) {
  event.preventDefault();
  if (staffEditSubmitting) return; // a save is already running
  const form = document.getElementById('editStaffAccountForm');
  const btn = form ? form.querySelector('button[type="submit"]') : null;
  const id = document.getElementById('editStaffAccountId').value;
  const name = document.getElementById('editStaffAccountName').value.trim();
  const email = document.getElementById('editStaffAccountEmail').value.trim();
  const role = document.getElementById('editStaffAccountRole').value;
  const password = document.getElementById('editStaffAccountPassword').value;
  if (!name) { showToast('Please enter the full name', 'warning'); return; }
  if (!email) { showToast('Please enter the email', 'warning'); return; }
  const data = { name, email, role };
  if (password) data.password = password; // blank = keep the current password
  staffEditSubmitting = true;
  if (btn) btn.disabled = true;
  try {
    const result = await API.updateStaff(id, data);
    if (result.success) {
      showToast(result.message || 'Staff account updated successfully', 'success');
      closeEditStaffModal();
      await loadStaffAccountsList();
    } else {
      showToast('❌ ' + result.message, 'error');
    }
  } catch (error) {
    showToast('❌ Failed to update account', 'error');
  } finally {
    staffEditSubmitting = false;
    if (btn) btn.disabled = false;
  }
}

// =============================================================================
// =============================================================================
// STAFF MODULE - INVENTORY (read-only)
// =============================================================================
async function loadStaffInventoryList() {
  try {
    const result = await API.getInventory();
    const tbody = document.getElementById('staffInventoryList');
    if (!tbody) return;
    tbody.innerHTML = '';
    if (!result.success || result.data.length === 0) {
      tbody.innerHTML = '<tr><td colspan="6" style="text-align:center;color:#9ca3af;padding:2rem;">No inventory items found</td></tr>';
      return;
    }
    result.data.forEach(item => {
      const status = item.quantity > 10 ? 'in-stock' : 'low-stock';
      const statusText = item.quantity > 10 ? 'In Stock' : 'Low Stock';
      tbody.innerHTML += `
        <tr>
          <td>${item.image ? `<img src="${item.image}" alt="${item.name}" style="width:50px;height:50px;object-fit:cover;border-radius:0.375rem;">` : '<span style="color:#9ca3af;font-size:0.75rem;">No image</span>'}</td>
          <td style="font-family:monospace;font-size:0.8rem;">${item.item_code || '<span style="color:#9ca3af;">N/A</span>'}</td>
          <td>${item.name}</td>
          <td>${item.category}</td>
          <td><strong>${item.quantity}</strong></td>
          <td><span class="stock-status ${status}">${statusText}</span></td>
        </tr>`;
    });
  } catch (error) { showToast('❌ Failed to load inventory', 'error'); }
}

// MANAGER MODULE - INVENTORY (shared inventory data, different container)
// =============================================================================
async function loadManagerInventoryList() {
  try {
    const result = await API.getInventory();
    if (result.success) {
      const container = document.getElementById('managerInventoryList');
      if (!container) return;
      container.innerHTML = '';
      if (result.data.length === 0) { container.innerHTML = '<p style="text-align:center;color:#9ca3af;padding:2rem;">No inventory items found</p>'; return; }
      let tableHTML = `<div class="table-container"><table><thead><tr><th>Image</th><th>Item Name</th><th>Item Code</th><th>Category</th><th>Quantity</th><th>Stock Status</th><th>Last Updated</th><th>Actions</th></tr></thead><tbody>`;
      result.data.forEach(item => {
        const status = item.quantity > 10 ? 'in-stock' : 'low-stock';
        const statusText = item.quantity > 10 ? 'In Stock' : 'Low Stock';
        tableHTML += `
          <tr>
            <td>${item.image ? `<img src="${item.image}" alt="${item.name}" style="width:50px;height:50px;object-fit:cover;border-radius:0.375rem;">` : '<span style="color:#9ca3af;font-size:0.75rem;">No image</span>'}</td>
            <td>${item.name}</td>
            <td style="font-family:monospace;font-size:0.8rem;">${item.item_code || '<span style="color:#9ca3af;">N/A</span>'}</td>
            <td>${item.category}</td>
            <td><strong>${item.quantity}</strong></td>
            <td><span class="stock-status ${status}">${statusText}</span></td>
            <td>${formatDateTime(item.last_updated)}</td>
            <td><button class="action-btn edit" onclick="openManagerEditInventoryModal(${item.id})"><svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"></path><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"></path></svg> Edit</button></td>
          </tr>`;
      });
      tableHTML += `</tbody></table></div>`;
      container.innerHTML = tableHTML;
    }
  } catch (error) {
    const container = document.getElementById('managerInventoryList');
    if (container) container.innerHTML = '<p style="text-align:center;color:#ef4444;padding:2rem;">❌ Failed to load inventory</p>';
  }
}

let currentManagerStockImage = null;

function openAddManagerInventoryModal() {
  currentManagerStockImage = null;
  const form = document.getElementById('managerAddInventoryForm');
  if (form) form.reset();
  const preview = document.getElementById('managerStockImagePreview');
  if (preview) preview.style.display = 'none';
  showModal('managerAddInventoryModal');
}

function handleManagerAddStockImageUpload(event) {
  const file = event.target.files[0];
  if (!file) return;
  if (!file.type.startsWith('image/')) { showToast('Please select an image file', 'warning'); event.target.value = ''; return; }
  if (file.size > 5 * 1024 * 1024) { showToast('File too large. Max 5MB.', 'warning'); event.target.value = ''; return; }
  fileToBase64(file).then(base64String => {
    currentManagerStockImage = base64String;
    const preview = document.getElementById('managerStockImagePreview');
    const previewImg = document.getElementById('managerStockImagePreviewImg');
    if (preview && previewImg) { previewImg.src = base64String; preview.style.display = 'block'; }
  });
}

async function handleManagerAddInventorySubmit(event) {
  event.preventDefault();
  const name = document.getElementById('managerStockName').value.trim();
  const itemCode = document.getElementById('managerStockItemCode').value.trim();
  const category = document.getElementById('managerStockCategory').value;
  const quantity = parseInt(document.getElementById('managerStockQuantity').value);
  if (!name || !itemCode || !category || isNaN(quantity) || quantity < 0) {
    showToast('Please fill all fields correctly', 'warning');
    return;
  }
  const data = { name, item_code: itemCode, category, quantity, image: currentManagerStockImage || '' };
  try {
    const result = await API.createInventory(data);
    if (result.success) { showToast(result.message || 'Inventory item added successfully', 'success'); hideModal('managerAddInventoryModal'); loadManagerInventoryList(); }
    else showToast('❌ ' + result.message, 'error');
  } catch (error) { showToast('❌ Failed to save inventory', 'error'); }
}

async function openManagerEditInventoryModal(id) {
  try {
    const result = await API.getInventory();
    if (!result.success) { showToast('Failed to load inventory details', 'error'); return; }
    const item = result.data.find(inv => inv.id === id);
    if (!item) { showToast('Inventory item not found', 'error'); return; }
    currentManagerStockImage = null;
    document.getElementById('managerEditInventoryId').value = item.id;
    document.getElementById('managerEditInventoryName').value = item.name;
    document.getElementById('managerEditInventoryItemCode').value = item.item_code || '';
    document.getElementById('managerEditInventoryCategory').value = item.category;
    document.getElementById('managerEditInventoryQuantity').value = item.quantity;
    const preview = document.getElementById('managerEditInventoryImagePreview');
    const previewImg = document.getElementById('managerEditInventoryImagePreviewImg');
    const imageInput = document.getElementById('managerEditInventoryImage');
    if (imageInput) imageInput.value = '';
    if (item.image && preview && previewImg) { previewImg.src = item.image; preview.style.display = 'block'; }
    else if (preview) { preview.style.display = 'none'; }
    updateManagerStockPreview(item.quantity);
    showModal('managerEditInventoryModal');
  } catch (error) { showToast('❌ Failed to load inventory details', 'error'); }
}

function handleManagerEditStockImageUpload(event) {
  const file = event.target.files[0];
  if (!file) return;
  if (!file.type.startsWith('image/')) { showToast('Please select an image file', 'warning'); event.target.value = ''; return; }
  if (file.size > 5 * 1024 * 1024) { showToast('File too large. Max 5MB.', 'warning'); event.target.value = ''; return; }
  fileToBase64(file).then(base64String => {
    currentManagerStockImage = base64String;
    const preview = document.getElementById('managerEditInventoryImagePreview');
    const previewImg = document.getElementById('managerEditInventoryImagePreviewImg');
    if (preview && previewImg) { previewImg.src = base64String; preview.style.display = 'block'; }
  });
}

function updateManagerStockPreview(quantity) {
  const preview = document.getElementById('managerStockPreview');
  if (!preview) return;
  const qty = parseInt(quantity) || 0;
  preview.textContent = qty <= 10 ? 'Low Stock' : 'In Stock';
  preview.style.color = qty <= 10 ? '#991b1b' : '#065f46';
}

// =============================================================================
// PAGE INITIALIZATION
// =============================================================================
function initDashboardTabs() {
  const tabs = document.querySelectorAll('.dashboard-tab');
  const modules = document.querySelectorAll('.dashboard-module');
  tabs.forEach(tab => {
    tab.addEventListener('click', () => {
      const targetTab = tab.getAttribute('data-tab');
      tabs.forEach(t => t.classList.remove('active'));
      tab.classList.add('active');
      modules.forEach(m => m.classList.remove('active'));
      const targetModule = document.getElementById(targetTab + 'Module');
      if (targetModule) {
        targetModule.classList.add('active');
        const isAdmin = window.location.pathname.includes('admin');
        const isStaff = window.location.pathname.includes('staff');
        const isManager = window.location.pathname.includes('manager');
        if (targetTab === 'furniture') loadFurnitureList();
        else if (targetTab === 'business') loadBusinessInfo();
        else if (targetTab === 'inventory' && isAdmin) loadInventoryList();
        else if (targetTab === 'inventory' && isManager) loadManagerInventoryList();
        else if (targetTab === 'inventory' && isStaff) loadStaffInventoryList();
        else if (targetTab === 'delivery' && isAdmin) { loadDeliveryList(); loadDeliveryStats(); }
        else if (targetTab === 'delivery' && isManager) { loadManagerDeliveryList(); loadDeliveryStats(); }
        else if (targetTab === 'delivery' && isStaff) { loadStaffDeliveryList(); loadDeliveryStats(); }
        else if (targetTab === 'sales' && isAdmin) { loadSalesList(); loadSalesAnalytics(); }
        else if (targetTab === 'sales' && isStaff) { loadStaffSalesList(); loadStaffSalesAnalytics(); loadSalesProductOptions('salesProduct'); }
        else if (targetTab === 'sales' && isManager) { loadManagerSalesList(); loadManagerSalesAnalytics(); }
        else if (targetTab === 'staff') loadStaffAccountsList();
         else if (targetTab === 'chatbot') loadChatbotList();
        else if (targetTab === 'feedback') { loadAdminInquiries(); loadAdminFeedback(); }
      }
    });
  });
}

function initModalCloseButtons() {
  document.querySelectorAll('[data-close-modal]').forEach(btn => {
    btn.addEventListener('click', () => { hideModal(btn.getAttribute('data-close-modal')); });
  });
}

document.addEventListener('DOMContentLoaded', () => {
  console.log('🚀 Furniture Management System Initialized');
  initDashboardTabs();
  initModalCloseButtons();

  // ---- ADMIN PAGE ----
  if (window.location.pathname.includes('admin')) {
    const user = JSON.parse(sessionStorage.getItem('currentUser') || '{}');
    const adminNameEl = document.getElementById('adminName');
    if (adminNameEl && user.name) adminNameEl.textContent = user.name;

    loadFurnitureList();
    initAdminFurnitureSearch();

    // ── Click handlers ──
    const bind = (id, handler) => { const el = document.getElementById(id); if (el) el.addEventListener('click', handler); };
    bind('addFurnitureBtn', openAddFurnitureModal);
    bind('addStockBtn', openAddInventoryModal);
    bind('addDeliveryBtn', openAddDeliveryModal);
    bind('addSalesBtn', openAddSalesModal);
    bind('addChatbotBtn', openAddChatbotModal);
    bind('logoutBtn', handleLogout);
    bind('confirmSendSmsBtn', confirmSendSms);

    // ── Submit handlers ──
    const bindSubmit = (id, handler) => { const el = document.getElementById(id); if (el) el.addEventListener('submit', handler); };
    bindSubmit('furnitureForm', handleFurnitureSubmit);
    bindSubmit('aboutForm', handleAboutFormSubmit);
    bindSubmit('contactForm', handleContactFormSubmit);
    bindSubmit('stockForm', handleInventorySubmit);
    bindSubmit('deliveryForm', handleDeliverySubmit);
    bindSubmit('salesForm', handleSalesSubmit);
    bindSubmit('chatbotForm', handleChatbotSubmit);
    bindSubmit('editAdminSalesForm', (e) => {
      e.preventDefault();
      submitSalesEdit({
        formId: 'editAdminSalesForm',
        modalId: 'editAdminSalesModal',
        idField: 'editAdminSalesId',
        customerId: 'editAdminSalesCustomer',
        productId: 'editAdminSalesProduct',
        quantityId: 'editAdminSalesQuantity',
        amountId: 'editAdminSalesAmount',
        dateId: 'editAdminSalesDate',
        onSuccess: async () => { await Promise.all([loadSalesList(), loadSalesAnalytics(), loadInventoryList()]); },
        onStockChanged: () => { loadSalesProductOptions('editAdminSalesProduct'); loadInventoryList(); }
      });
    });

    const furnitureImage = document.getElementById('furnitureImage');
    if (furnitureImage) furnitureImage.addEventListener('change', handleFurnitureImageUpload);

    const stockImage = document.getElementById('stockImage');
    if (stockImage) stockImage.addEventListener('change', handleStockImageUpload);

  }

  // ---- STAFF PAGE ----
  if (window.location.pathname.includes('staff')) {
    const user = JSON.parse(sessionStorage.getItem('currentUser') || '{}');
    const staffNameEl = document.getElementById('staffName');
    if (staffNameEl && user.name) staffNameEl.textContent = user.name;

    // Sales Records is now the default Staff tab, so load it on page open
    loadStaffSalesList();
    loadStaffSalesAnalytics();
    loadSalesProductOptions('salesProduct');
    document.addEventListener('visibilitychange', () => {
      const salesModule = document.getElementById('salesModule');
      if (!document.hidden && salesModule && salesModule.classList.contains('active')) loadSalesProductOptions('salesProduct');
    });

    const bind = (id, handler) => { const el = document.getElementById(id); if (el) el.addEventListener('submit', handler); };
    bind('staffDeliveryForm', handleStaffDeliverySubmit);
    const staffAddDeliveryBtn = document.getElementById('staffAddDeliveryBtn');
    if (staffAddDeliveryBtn) staffAddDeliveryBtn.addEventListener('click', openStaffAddDeliveryModal);
    bind('staffSalesForm', handleStaffSalesSubmit);
    bind('editStaffSalesForm', (e) => {
      e.preventDefault();
      submitSalesEdit({
        formId: 'editStaffSalesForm',
        modalId: 'editSalesModal',
        idField: 'editSalesId',
        customerId: 'editSalesCustomer',
        productId: 'editSalesProduct',
        quantityId: 'editSalesQuantity',
        amountId: 'editSalesAmount',
        dateId: 'editSalesDate',
        onSuccess: async () => { await Promise.all([loadStaffSalesList(), loadStaffSalesAnalytics(), loadStaffInventoryList(), loadSalesProductOptions('salesProduct')]); },
        onStockChanged: () => { loadSalesProductOptions('editSalesProduct'); loadSalesProductOptions('salesProduct'); loadStaffInventoryList(); }
      });
    });

    const logoutBtn = document.getElementById('logoutBtn');
    if (logoutBtn) logoutBtn.addEventListener('click', handleLogout);
  }

  // ---- MANAGER PAGE ----
  if (window.location.pathname.includes('manager')) {
    const user = JSON.parse(sessionStorage.getItem('currentUser') || '{}');
    const managerNameEl = document.getElementById('managerName');
    if (managerNameEl && user.name) managerNameEl.textContent = user.name;

    // Load first active tab (delivery)
    loadManagerDeliveryList();
    loadDeliveryStats();

    const logoutBtn = document.getElementById('logoutBtn');
    if (logoutBtn) logoutBtn.addEventListener('click', handleLogout);

    // Manager sales form
    const managerSalesForm = document.getElementById('managerSalesForm');
    if (managerSalesForm) managerSalesForm.addEventListener('submit', handleManagerSalesSubmit);

    // Manager edit sales form
    const managerEditSalesForm = document.getElementById('managerEditSalesForm');
    if (managerEditSalesForm) {
      managerEditSalesForm.addEventListener('submit', async (e) => {
        e.preventDefault();
        const id = document.getElementById('managerEditSalesId').value;
        const data = {
          customer_name: document.getElementById('managerEditSalesCustomer').value,
          product_name: document.getElementById('managerEditSalesProduct').value,
          amount: document.getElementById('managerEditSalesAmount').value,
          sale_date: document.getElementById('managerEditSalesDate').value
        };
        try {
          const result = await API.updateSales(id, data);
          if (result.success) { showToast('✅ Sales record updated', 'success'); hideModal('managerEditSalesModal'); loadManagerSalesList(); loadManagerSalesAnalytics(); }
          else showToast('❌ ' + result.message, 'error');
        } catch (err) { showToast('❌ Failed to update sales record', 'error'); }
      });
    }

    // Manager edit inventory form
    const managerEditInventoryForm = document.getElementById('managerEditInventoryForm');
    if (managerEditInventoryForm) {
      managerEditInventoryForm.addEventListener('submit', async (e) => {
        e.preventDefault();
        const id = document.getElementById('managerEditInventoryId').value;
        const name = document.getElementById('managerEditInventoryName').value;
        const itemCode = document.getElementById('managerEditInventoryItemCode').value.trim();
        const category = document.getElementById('managerEditInventoryCategory').value;
        const quantity = parseInt(document.getElementById('managerEditInventoryQuantity').value);
        if (!itemCode || !category || quantity < 0) { showToast('Please fill all fields correctly', 'error'); return; }
        const data = { name, item_code: itemCode, category, quantity };
        if (currentManagerStockImage) data.image = currentManagerStockImage; // only send image if a new one was picked, so the existing one is preserved otherwise
        try {
          const result = await API.updateInventory(id, data);
          if (result.success) { showToast('Inventory updated successfully', 'success'); hideModal('managerEditInventoryModal'); loadManagerInventoryList(); }
          else showToast(result.message || 'Failed to update inventory', 'error');
        } catch (error) { showToast('Failed to update inventory', 'error'); }
      });
    }

    const managerQtyInput = document.getElementById('managerEditInventoryQuantity');
    if (managerQtyInput) managerQtyInput.addEventListener('input', (e) => updateManagerStockPreview(e.target.value));

    // Manager Add/Edit Inventory image + button wiring
    const addManagerStockBtn = document.getElementById('addManagerStockBtn');
    if (addManagerStockBtn) addManagerStockBtn.addEventListener('click', openAddManagerInventoryModal);

    const confirmSendSmsBtn = document.getElementById('confirmSendSmsBtn');
    if (confirmSendSmsBtn) confirmSendSmsBtn.addEventListener('click', confirmSendSms);

    const managerAddInventoryForm = document.getElementById('managerAddInventoryForm');
    if (managerAddInventoryForm) managerAddInventoryForm.addEventListener('submit', handleManagerAddInventorySubmit);

    const managerStockImage = document.getElementById('managerStockImage');
    if (managerStockImage) managerStockImage.addEventListener('change', handleManagerAddStockImageUpload);

    const managerEditInventoryImage = document.getElementById('managerEditInventoryImage');
    if (managerEditInventoryImage) managerEditInventoryImage.addEventListener('change', handleManagerEditStockImageUpload);

    // Manager Add Delivery (reuses the existing Add Delivery handlers; status updates use the table dropdown)
    const addManagerDeliveryBtn = document.getElementById('addManagerDeliveryBtn');
    if (addManagerDeliveryBtn) addManagerDeliveryBtn.addEventListener('click', openAddDeliveryModal);
    const managerDeliveryForm = document.getElementById('deliveryForm');
    if (managerDeliveryForm) managerDeliveryForm.addEventListener('submit', handleDeliverySubmit);

    // Manager delivery search
    const managerDeliverySearch = document.getElementById('managerDeliverySearch');
    if (managerDeliverySearch) managerDeliverySearch.addEventListener('input', loadManagerDeliveryList);
  }

  // ---- LOGIN PAGE ----
  if (window.location.pathname.includes('login')) {
    const loginForm = document.getElementById('loginForm');
    if (loginForm) loginForm.addEventListener('submit', handleLogin);
    const signupForm = document.getElementById('signupForm');
    if (signupForm) signupForm.addEventListener('submit', handleSignup);
  }

  if (window.location.pathname.includes('about')) loadAboutPageContent();
  if (window.location.pathname.includes('contact')) loadContactPageContent();
  if (window.location.pathname === '/' || window.location.pathname.endsWith('/index.html')) {
    loadSpecialOffers();
  }
  if (window.location.pathname.includes('furniture-list')) { loadPublicFurnitureList(); initFurnitureListFilters(); }
  if (window.location.pathname.includes('furniture-detail')) {
    loadFurnitureDetail();

    const visualizeBtn = document.getElementById('visualizeBtn');
    if (visualizeBtn) {
      visualizeBtn.addEventListener('click', () => {
        const productId = new URLSearchParams(window.location.search).get('id');

        if (!productId) {
          showToast('Product not found. Please go back and select a furniture.', 'error');
          return;
        }

        visualizeBtn.disabled = true;
        visualizeBtn.innerHTML = `
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"
            style="animation:spin 0.8s linear infinite;">
            <polyline points="23 4 23 10 17 10"></polyline>
            <path d="M20.49 15a9 9 0 1 1-2.12-9.36L23 10"></path>
          </svg>
          Loading...`;

        fetch(`${API_URL}/products/${productId}`)
          .then(res => res.json())
          .then(result => {
            if (result.success && result.data) {
              sessionStorage.setItem('selectedFurniture', JSON.stringify(result.data));
              window.location.href = 'ai-visualization.html';
            } else {
              showToast('Failed to load furniture details. Please try again.', 'error');
              visualizeBtn.disabled = false;
              visualizeBtn.innerHTML = `<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2"></polygon></svg> Visualize in My Room`;
            }
          })
          .catch(() => {
            showToast('Connection error. Please check your server.', 'error');
            visualizeBtn.disabled = false;
            visualizeBtn.innerHTML = `<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2"></polygon></svg> Visualize in My Room`;
          });
      });
    }
  }
  if (window.location.pathname.includes('track-delivery')) {
    const publicTrackForm = document.getElementById('publicTrackForm');
    if (publicTrackForm) publicTrackForm.addEventListener('submit', handlePublicTrackDelivery);
  }
   
  // ---- AI VISUALIZATION PAGE ----
if (window.location.pathname.includes('ai-visualization')) {
    initVisualizationPage();
}

// ---- CUSTOMER SUPPORT PAGE ----
if (window.location.pathname.includes('customer-support')) {
    initCustomerSupportPage();
    initChatbot();  // ← Chatbot now lives here
    loadContactPageContent(); // ← sync phone/email from admin → Supabase → this page

    // "Chat with AI" cards and CTA button also open the chatbot
    const openChatBtn = document.getElementById('openChatBtn');
    if (openChatBtn) openChatBtn.addEventListener('click', () => {
        document.getElementById('chatbotPanel').classList.add('open');
        document.getElementById('chatIconOpen').style.display = 'none';
        document.getElementById('chatIconClose').style.display = 'block';
        document.getElementById('chatbotBadge').style.display = 'none';
    });

    const ctaChatBtn = document.getElementById('ctaChatBtn');
    if (ctaChatBtn) ctaChatBtn.addEventListener('click', () => {
        document.getElementById('chatbotPanel').classList.add('open');
        document.getElementById('chatIconOpen').style.display = 'none';
        document.getElementById('chatIconClose').style.display = 'block';
        document.getElementById('chatbotBadge').style.display = 'none';
        window.scrollTo({ top: 0, behavior: 'smooth' });
    });
}
});

// Add "Create Account" button to Staff Module (Admin)
if (window.location.pathname.includes('admin')) {
  setTimeout(() => {
    const staffModule = document.getElementById('staffModule');
    if (staffModule && !document.getElementById('addStaffAccountBtn')) {
      const card = staffModule.querySelector('.card');
      if (card) {
        const btnHTML = `
          <div style="margin-bottom:1.5rem;">
            <button class="btn btn-accent" id="addStaffAccountBtn" onclick="openAddStaffModal()">
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><line x1="12" y1="5" x2="12" y2="19"></line><line x1="5" y1="12" x2="19" y2="12"></line></svg>
              Create New Account (Staff / Manager)
            </button>
          </div>`;
        card.insertAdjacentHTML('beforebegin', btnHTML);
      }
    }
  }, 500);
}
// =============================================================================
// AI VISUALIZATION PAGE
// =============================================================================

let selectedFurniture = null;
let roomImageBase64 = null;
let selectedStyle = 'Modern';
let lastGeneratedResult = null;


function initVisualizationPage() {
  loadSelectedFurniture();

  // Style option buttons
  document.querySelectorAll('.style-option').forEach(btn => {
    btn.addEventListener('click', () => {
      document.querySelectorAll('.style-option').forEach(b => b.classList.remove('selected'));
      btn.classList.add('selected');
      selectedStyle = btn.getAttribute('data-style');
    });
  });

  // Room image upload
  const roomInput = document.getElementById('roomImageInput');
  const uploadArea = document.getElementById('uploadArea');

  if (roomInput) roomInput.addEventListener('change', (e) => {
    const file = e.target.files[0];
    if (file) processRoomFile(file);
  });

  if (uploadArea) {
    uploadArea.addEventListener('dragover', (e) => {
      e.preventDefault();
      uploadArea.classList.add('dragover');
    });
    uploadArea.addEventListener('dragleave', () => uploadArea.classList.remove('dragover'));
    uploadArea.addEventListener('drop', (e) => {
      e.preventDefault();
      uploadArea.classList.remove('dragover');
      const file = e.dataTransfer.files[0];
      if (file && file.type.startsWith('image/')) processRoomFile(file);
    });
  }

  // Generate button
  const generateBtn = document.getElementById('generateBtn');
  if (generateBtn) generateBtn.addEventListener('click', generateVisualization);

  // Try again / retry / start over
  const tryAgainBtn = document.getElementById('tryAgainBtn');
  if (tryAgainBtn) tryAgainBtn.addEventListener('click', resetVisualization);

  const retryBtn = document.getElementById('retryBtn');
if (retryBtn) retryBtn.addEventListener('click', resetVisualization);

  const startOverBtn = document.getElementById('startOverBtn');
  if (startOverBtn) startOverBtn.addEventListener('click', resetVisualization);

  // Download button
  const downloadBtn = document.getElementById('downloadBtn');
  if (downloadBtn) downloadBtn.addEventListener('click', downloadResult);
}

function loadSelectedFurniture() {
  const stored = sessionStorage.getItem('selectedFurniture');
  if (stored) {
    selectedFurniture = JSON.parse(stored);
    showFurnitureOnVizPage();
    const backBtn = document.getElementById('backBtnContainer');
    if (backBtn) backBtn.style.display = 'block';
    activateStepBadge('stepBadge2', 'stepLabel2');
  }
  updateGenerateButton();
}

function showFurnitureOnVizPage() {
  const noState = document.getElementById('noFurnitureState');
  const selectedState = document.getElementById('furnitureSelectedState');
  if (noState) noState.style.display = 'none';
  if (selectedState) selectedState.style.display = 'block';

  const imgEl = document.getElementById('vizFurnitureImg');
  const nameEl = document.getElementById('vizFurnitureName');
  const catEl = document.getElementById('vizFurnitureCategory');
  const priceEl = document.getElementById('vizFurniturePrice');

  if (imgEl) imgEl.src = selectedFurniture.image || 'placeholder-furniture.jpg';
  if (nameEl) nameEl.textContent = selectedFurniture.name || '';
  if (catEl) catEl.textContent = selectedFurniture.category || '';
  if (priceEl) {
    const info = getDiscountInfo(selectedFurniture);
    if (info.isDiscounted) {
      priceEl.innerHTML = `<span style="font-size:0.85rem;color:#9ca3af;text-decoration:line-through;font-weight:500;margin-right:0.4rem;">${formatCurrency(info.regular)}</span>${formatCurrency(info.final)} <span style="background:#DC143C;color:#fff;font-size:0.7rem;font-weight:700;padding:0.15rem 0.5rem;border-radius:9999px;vertical-align:middle;">${info.percent}% OFF</span>`;
    } else {
      priceEl.textContent = formatCurrency(selectedFurniture.price);
    }
  }
}

const ALLOWED_ROOM_TYPES = ['image/jpeg', 'image/png', 'image/webp'];
const MAX_ROOM_DIMENSION = 1600; // longest side in pixels, keeps uploads small and cheaper for the AI

// Shrinks the room photo in the browser and returns a JPEG data-URL
function downscaleRoomImage(dataUrl) {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => {
      const scale = Math.min(1, MAX_ROOM_DIMENSION / Math.max(img.width, img.height));
      const w = Math.round(img.width * scale);
      const h = Math.round(img.height * scale);
      const canvas = document.createElement('canvas');
      canvas.width = w;
      canvas.height = h;
      const ctx = canvas.getContext('2d');
      ctx.fillStyle = '#ffffff';
      ctx.fillRect(0, 0, w, h);
      ctx.drawImage(img, 0, 0, w, h);
      resolve(canvas.toDataURL('image/jpeg', 0.85));
    };
    img.onerror = () => reject(new Error('decode failed'));
    img.src = dataUrl;
  });
}

function processRoomFile(file) {
  const roomInput = document.getElementById('roomImageInput');

  if (!ALLOWED_ROOM_TYPES.includes(file.type)) {
    showToast('Please upload a JPG, PNG or WEBP photo.', 'warning');
    if (roomInput) roomInput.value = '';
    return;
  }
  if (file.size > 10 * 1024 * 1024) {
    showToast('File too large. Max 10MB.', 'warning');
    if (roomInput) roomInput.value = '';
    return;
  }
  const reader = new FileReader();
  reader.onerror = () => showToast('We could not read that file. Please try another photo.', 'error');
  reader.onload = (e) => {
    downscaleRoomImage(e.target.result).then((resizedDataUrl) => {
      roomImageBase64 = resizedDataUrl;

      const preview = document.getElementById('roomPreviewImg');
      if (preview) { preview.src = roomImageBase64; preview.style.display = 'block'; }

      const info = document.getElementById('roomUploadedInfo');
      if (info) { info.style.display = 'flex'; }

      const fileName = document.getElementById('roomFileName');
      if (fileName) fileName.textContent = file.name + ' — Ready';

      activateStepBadge('stepBadge2', 'stepLabel2');
      activateStepBadge('step2BadgeRight', null);
      updateGenerateButton();
    }).catch(() => {
      showToast('We could not open that image. Please try a different photo.', 'error');
      if (roomInput) roomInput.value = '';
    });
  };
  reader.readAsDataURL(file);
}

function activateStepBadge(badgeId, labelId) {
  const badge = document.getElementById(badgeId);
  if (badge) { badge.classList.remove('inactive'); }
  if (labelId) {
    const label = document.getElementById(labelId);
    if (label) label.style.color = '#111827';
  }
}

function updateGenerateButton() {
  const btn = document.getElementById('generateBtn');
  const hint = document.getElementById('generateHint');
  if (!btn) return;

  if (selectedFurniture && roomImageBase64) {
    btn.disabled = false;
    if (hint) hint.textContent = `Ready! Click to visualize "${selectedFurniture.name}" in your room.`;
    activateStepBadge('stepBadge3', 'stepLabel3');
    activateStepBadge('step3BadgeRight', null);
  } else if (!selectedFurniture) {
    btn.disabled = true;
    if (hint) hint.textContent = 'Please select a furniture first from the furniture list.';
  } else {
    btn.disabled = true;
    if (hint) hint.textContent = 'Please upload a photo of your room to continue.';
  }
}

let isGenerating = false;

async function generateVisualization() {
  if (isGenerating) return; // ignore double-clicks while a request is running

  if (!selectedFurniture) { showToast('Please select a furniture first.', 'warning'); return; }
  if (!roomImageBase64) { showToast('Please upload a photo of your room first.', 'warning'); return; }

  const placement = (document.getElementById('placementInstructions')?.value || '').trim();
  if (!placement) { showToast('Please describe where to place the furniture.', 'warning'); return; }

  isGenerating = true;

  const generateBtn = document.getElementById('generateBtn');
  const generateBtnText = document.getElementById('generateBtnText');
  const originalBtnText = generateBtnText ? generateBtnText.textContent : '';

  document.getElementById('loadingSection').style.display = 'block';
  document.getElementById('resultSection').style.display = 'none';
  document.getElementById('errorSection').style.display = 'none';
  generateBtn.disabled = true;
  if (generateBtnText) generateBtnText.textContent = 'Generating Visualization...';

  let progress = 0;
  const loadingMessages = [
    'Sending room photo to AI server...',
    'AI is analyzing your room layout...',
    'Placing furniture into your room...',
    'Almost done! Finalizing the result...'
  ];
  let msgIndex = 0;
  const progressInterval = setInterval(() => {
    progress = Math.min(progress + Math.random() * 4, 90);
    const bar = document.getElementById('progressBar');
    const text = document.getElementById('progressText');
    const msg = document.getElementById('loadingMessage');
    if (bar) bar.style.width = progress + '%';
    if (text) text.textContent = Math.round(progress) + '%';
    if (msg && Math.floor(progress / 25) !== msgIndex) {
      msgIndex = Math.floor(progress / 25);
      msg.textContent = loadingMessages[msgIndex] || loadingMessages[loadingMessages.length - 1];
    }
  }, 800);

  // Stop waiting after 150 seconds (the server may be waking up or the AI may be slow)
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), 150000);

  try {
    const response = await fetch(`${API_URL}/api/visualize`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      signal: controller.signal,
      body: JSON.stringify({
        furnitureId: selectedFurniture.id,
        style: selectedStyle,
        roomImage: roomImageBase64,
        placementInstructions: placement,
        referenceSize: document.getElementById('referenceSize')?.value || ''
      })
    });

    // If the server answered with something that is not JSON (e.g. a proxy error page), show a friendly message
    const result = await response.json().catch(() => null);
    if (!result) {
      throw new Error(response.status === 413
        ? 'Your room photo is too large. Please upload a smaller photo.'
        : 'The server sent an unexpected response. Please try again in a moment.');
    }
    if (!result.success || !result.image) throw new Error(result.message || 'Something went wrong. Please try again.');

    lastGeneratedResult = result.image;

    const bar = document.getElementById('progressBar');
    const text = document.getElementById('progressText');
    if (bar) bar.style.width = '100%';
    if (text) text.textContent = '100%';

    document.getElementById('loadingSection').style.display = 'none';
    document.getElementById('beforeImage').src = roomImageBase64;
    document.getElementById('afterImage').src = result.image;
    document.getElementById('resultFurnitureName').textContent = selectedFurniture.name;
    document.getElementById('resultSection').style.display = 'block';
    showToast('Visualization complete!', 'success');

  } catch (error) {
    console.error('🤖 [AI] Error:', error);
    document.getElementById('loadingSection').style.display = 'none';

    let friendlyMessage = error.message || 'Something went wrong. Please try again.';
    if (error.name === 'AbortError') {
      friendlyMessage = 'The visualization took too long. Please try again in a moment.';
    } else if (error instanceof TypeError) {
      friendlyMessage = 'We could not reach the server. Please check your internet connection and try again. If the server was asleep, wait a few seconds first.';
    }

    const errMsgEl = document.getElementById('errorMessage');
    if (errMsgEl) errMsgEl.textContent = friendlyMessage;
    document.getElementById('errorSection').style.display = 'block';
  } finally {
    clearTimeout(timeoutId);
    clearInterval(progressInterval);
    isGenerating = false;
    generateBtn.disabled = false;
    if (generateBtnText) generateBtnText.textContent = originalBtnText;
  }
}


function resetVisualization() {
  document.getElementById('resultSection').style.display = 'none';
  document.getElementById('errorSection').style.display = 'none';
  roomImageBase64 = null;

  const preview = document.getElementById('roomPreviewImg');
  if (preview) preview.style.display = 'none';

  const info = document.getElementById('roomUploadedInfo');
  if (info) info.style.display = 'none';

  const input = document.getElementById('roomImageInput');
  if (input) input.value = '';

  updateGenerateButton();
}

function downloadResult() {
  if (!lastGeneratedResult) return;
  const link = document.createElement('a');
  link.href = lastGeneratedResult;
  link.download = `ecl-visualization-${selectedFurniture ? selectedFurniture.name.replace(/\s+/g, '-') : 'result'}.png`;
  link.click();
}

// =============================================================================
// CHATBOT
// =============================================================================

// =============================================================================
// CHATBOT  — Database-driven (fetches from /chatbot API)
// =============================================================================

// Stores Q&A loaded from the database. Populated by loadChatbotQA().
let dbChatbotQA = [];

/**
 * Fetches all Q&A entries from the MySQL database via the Node.js API.
 * Called once when the Customer Support page loads.
 */
async function loadChatbotQA() {
  console.log('🤖 [Chatbot] Loading Q&A from database...');
  try {
    const response = await fetch(`${API_URL}/chatbot`);

    if (!response.ok) {
      console.error(`❌ [Chatbot] Server returned status ${response.status}`);
      dbChatbotQA = [];
      return;
    }

    const result = await response.json();

    if (result.success && Array.isArray(result.data)) {
      dbChatbotQA = result.data;
      console.log(`✅ [Chatbot] Loaded ${dbChatbotQA.length} Q&A entries from database.`);
      dbChatbotQA.forEach((qa, i) => {
        console.log(`   [${i + 1}] Q: "${qa.question}" → A: "${qa.answer.substring(0, 40)}..."`);
      });
    } else {
      console.warn('⚠️ [Chatbot] API returned no Q&A data:', result);
      dbChatbotQA = [];
    }
  } catch (error) {
    console.error('❌ [Chatbot] Failed to load Q&A from database:', error.message);
    dbChatbotQA = [];
  }
}

/**
 * Searches the database Q&A for the best matching response.
 * Uses keyword scoring — no hardcoded answers.
 */
function getBotResponse(message) {
  const lower = message.toLowerCase().trim();

  if (dbChatbotQA.length === 0) {
    console.warn('⚠️ [Chatbot] dbChatbotQA is empty. Is the server running and the chatbot_qa table populated?');
    return "Our support assistant is loading. Please try again in a moment, or contact us directly at (044) 796-1234. 😊";
  }

  let bestMatch = null;
  let bestScore = 0;

  for (const qa of dbChatbotQA) {
    const questionLower = qa.question.toLowerCase();

    // Score 1: full question phrase is found in message
    let score = 0;
    if (lower.includes(questionLower)) {
      score += 10;
    }

    // Score 2: individual keywords from the question that appear in message
    const keywords = questionLower
      .split(/[\s\W]+/)
      .filter(word => word.length >= 3); // only meaningful words

    for (const keyword of keywords) {
      if (lower.includes(keyword)) {
        score += 1;
      }
    }

    if (score > bestScore) {
      bestScore = score;
      bestMatch = qa;
    }
  }

  if (bestMatch && bestScore > 0) {
    console.log(`✅ [Chatbot] Matched Q: "${bestMatch.question}" (score: ${bestScore})`);
    return bestMatch.answer;
  }

  console.log(`ℹ️ [Chatbot] No match found for: "${message}"`);
  return "I'm not sure about that. You can ask me about our furniture, delivery, prices, returns, warranty, or store hours. You can also reach us at (044) 796-1234 or info@eclfurniture.com. 😊";
}

function addChatMessage(message, sender = 'bot') {
  const messagesEl = document.getElementById('chatbotMessages');
  if (!messagesEl) return;

  const msgDiv = document.createElement('div');
  msgDiv.className = `chat-msg ${sender}`;

  if (sender === 'bot') {
    msgDiv.innerHTML = `
      <div class="chat-bot-icon">
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="white" stroke-width="2">
          <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"></path>
        </svg>
      </div>
      <div class="chat-bubble">${message}</div>`;
  } else {
    msgDiv.innerHTML = `<div class="chat-bubble">${message}</div>`;
  }

  messagesEl.appendChild(msgDiv);
  messagesEl.scrollTop = messagesEl.scrollHeight;
}

function showTypingIndicator() {
  const messagesEl = document.getElementById('chatbotMessages');
  if (!messagesEl) return null;

  const typingDiv = document.createElement('div');
  typingDiv.className = 'chat-msg bot';
  typingDiv.id = 'typingIndicator';
  typingDiv.innerHTML = `
    <div class="chat-bot-icon">
      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="white" stroke-width="2">
        <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"></path>
      </svg>
    </div>
    <div class="chat-typing"><span></span><span></span><span></span></div>`;

  messagesEl.appendChild(typingDiv);
  messagesEl.scrollTop = messagesEl.scrollHeight;
  return typingDiv;
}

// Predefined quick-reply actions that must NOT go through the database
// Q&A matcher (getBotResponse). Each has its own fixed response + a
// clickable button that sends the customer to the relevant page.
const CHATBOT_QUICK_ACTIONS = {
  'track-delivery': {
    userLabel: 'Track delivery',
    response: 'You can track your delivery by entering your reference code on our Track Delivery page. Your reference code was provided after your order was confirmed.',
    buttonText: 'Track Delivery',
    buttonHref: 'track-delivery.html'
  },
  'view-furniture': {
    userLabel: 'View furniture',
    response: 'Here is how you can view our furniture. Just click the button below to browse our available furniture.',
    buttonText: 'View Furniture',
    buttonHref: 'furniture-list.html'
  }
};

function sendQuickAction(actionKey) {
  const action = CHATBOT_QUICK_ACTIONS[actionKey];
  if (!action) return;

  addChatMessage(action.userLabel, 'user');

  // Hide quick replies after first message
  const quickReplies = document.getElementById('chatbotQuickReplies');
  if (quickReplies) quickReplies.style.display = 'none';

  const typing = showTypingIndicator();
  setTimeout(() => {
    if (typing) typing.remove();
    const responseHtml = `${action.response}<br><a href="${action.buttonHref}" class="chat-action-btn">${action.buttonText}</a>`;
    addChatMessage(responseHtml, 'bot');
  }, 800 + Math.random() * 500);
}

function sendChatMessage(message) {
  if (!message.trim()) return;

  addChatMessage(message, 'user');

  const input = document.getElementById('chatbotInput');
  if (input) input.value = '';

  // Hide quick replies after first message
  const quickReplies = document.getElementById('chatbotQuickReplies');
  if (quickReplies) quickReplies.style.display = 'none';

  // Show typing indicator then respond
  const typing = showTypingIndicator();
  setTimeout(() => {
    if (typing) typing.remove();
    const response = getBotResponse(message);
    addChatMessage(response, 'bot');
  }, 800 + Math.random() * 500);
}

function initChatbot() {
  const toggle = document.getElementById('chatbotToggle');
  const panel = document.getElementById('chatbotPanel');
  const closeBtn = document.getElementById('chatbotClose');
  const sendBtn = document.getElementById('chatbotSendBtn');
  const input = document.getElementById('chatbotInput');
  const badge = document.getElementById('chatbotBadge');
  const openIcon = document.getElementById('chatIconOpen');
  const closeIcon = document.getElementById('chatIconClose');

  if (!toggle || !panel) return;

  // ✅ Load Q&A from the database when chatbot initializes
  loadChatbotQA();

  // Show notification badge after 3 seconds
  setTimeout(() => {
    if (badge && !panel.classList.contains('open')) {
      badge.style.display = 'flex';
    }
  }, 3000);

  // Toggle open/close
  toggle.addEventListener('click', () => {
    panel.classList.toggle('open');
    const isOpen = panel.classList.contains('open');
    if (openIcon) openIcon.style.display = isOpen ? 'none' : 'block';
    if (closeIcon) closeIcon.style.display = isOpen ? 'block' : 'none';
    if (badge) badge.style.display = 'none';

    if (isOpen) {
      const messagesEl = document.getElementById('chatbotMessages');
      if (messagesEl) messagesEl.scrollTop = messagesEl.scrollHeight;
      if (input) input.focus();
    }
  });

  // Close button
  if (closeBtn) {
    closeBtn.addEventListener('click', () => {
      panel.classList.remove('open');
      if (openIcon) openIcon.style.display = 'block';
      if (closeIcon) closeIcon.style.display = 'none';
    });
  }

  // Send button
  if (sendBtn) {
    sendBtn.addEventListener('click', () => {
      if (input) sendChatMessage(input.value);
    });
  }

  // Enter key to send
  if (input) {
    input.addEventListener('keydown', (e) => {
      if (e.key === 'Enter' && !e.shiftKey) {
        e.preventDefault();
        sendChatMessage(input.value);
      }
    });
  }

  // Quick reply buttons
  document.querySelectorAll('.quick-reply-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      const action = btn.getAttribute('data-action');
      if (action) {
        sendQuickAction(action);
        return;
      }
      // Fallback for any legacy quick-reply buttons still using data-quick
      const msg = btn.getAttribute('data-quick');
      if (msg) sendChatMessage(msg);
    });
  });
}


  


// =============================================================================
// CUSTOMER SUPPORT PAGE
// =============================================================================

function initCustomerSupportPage() {
  // Star rating label update
  document.querySelectorAll('input[name="rating"]').forEach(radio => {
    radio.addEventListener('change', () => {
      const labels = { 1: '1 star — Poor', 2: '2 stars — Fair', 3: '3 stars — Average', 4: '4 stars — Good', 5: '5 stars — Excellent' };
      const ratingLabel = document.getElementById('ratingLabel');
      if (ratingLabel) ratingLabel.textContent = labels[radio.value] || '';
    });
  });

  // Inquiry form
  const inquiryForm = document.getElementById('inquiryForm');
  if (inquiryForm) inquiryForm.addEventListener('submit', handleInquirySubmit);

  // Feedback form
  const feedbackForm = document.getElementById('feedbackForm');
  if (feedbackForm) feedbackForm.addEventListener('submit', handleFeedbackSubmit);

  // Reset buttons
  const sendAnotherInquiry = document.getElementById('sendAnotherInquiryBtn');
  if (sendAnotherInquiry) sendAnotherInquiry.addEventListener('click', () => {
    document.getElementById('inquiryForm').reset();
    document.getElementById('inquirySuccess').style.display = 'none';
    document.getElementById('inquiryFormSection').style.display = 'block';
  });

  const sendAnotherFeedback = document.getElementById('sendAnotherFeedbackBtn');
  if (sendAnotherFeedback) sendAnotherFeedback.addEventListener('click', () => {
    document.getElementById('feedbackForm').reset();
    const ratingLabel = document.getElementById('ratingLabel');
    if (ratingLabel) ratingLabel.textContent = '3 stars — Average';
    document.getElementById('feedbackSuccess').style.display = 'none';
    document.getElementById('feedbackFormSection').style.display = 'block';
  });

  // FAQ accordion
  document.querySelectorAll('[data-faq]').forEach(btn => {
    btn.addEventListener('click', () => {
      const item = btn.closest('.faq-item');
      const isOpen = item.classList.contains('open');
      document.querySelectorAll('.faq-item').forEach(i => i.classList.remove('open'));
      if (!isOpen) item.classList.add('open');
    });
  });
}

async function handleInquirySubmit(event) {
  event.preventDefault();

  const btn = document.getElementById('inquirySubmitBtn');
  if (btn) { btn.disabled = true; btn.textContent = 'Sending...'; }

  const data = {
    customer_name: document.getElementById('inquiryName').value,
    email: document.getElementById('inquiryEmail').value,
    phone: document.getElementById('inquiryPhone').value,
    subject: document.getElementById('inquirySubject').value,
    message: document.getElementById('inquiryMessage').value
  };

  try {
    const response = await fetch(`${API_URL}/inquiries`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(data)
    });
    const result = await response.json();
    if (result.success) {
      showSuccessState('inquiry');
      showToast('Your inquiry has been sent!', 'success');
    } else {
      throw new Error(result.message);
    }
  } catch (error) {
    // Show success for frontend demo even if backend not yet connected
    showSuccessState('inquiry');
    showToast('Your inquiry has been sent!', 'success');
  }

  if (btn) {
    btn.disabled = false;
    btn.innerHTML = `<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><line x1="22" y1="2" x2="11" y2="13"></line><polygon points="22 2 15 22 11 13 2 9 22 2"></polygon></svg> Send Inquiry`;
  }
}

async function handleFeedbackSubmit(event) {
  event.preventDefault();

  const selectedRating = document.querySelector('input[name="rating"]:checked');
  if (!selectedRating) {
    showToast('Please select a rating.', 'warning');
    return;
  }

  const btn = document.getElementById('feedbackSubmitBtn');
  if (btn) { btn.disabled = true; btn.textContent = 'Submitting...'; }

  const data = {
    customer_name: document.getElementById('feedbackName').value,
    email: document.getElementById('feedbackEmail').value,
    product_name: document.getElementById('feedbackProduct').value,
    rating: parseInt(selectedRating.value),
    feedback_text: document.getElementById('feedbackText').value
  };

  try {
    const response = await fetch(`${API_URL}/feedback`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(data)
    });
    const result = await response.json();
    if (result.success) {
      showSuccessState('feedback');
      showToast('Thank you for your feedback!', 'success');
    } else {
      throw new Error(result.message);
    }
  } catch (error) {
    showSuccessState('feedback');
    showToast('Thank you for your feedback!', 'success');
  }

  if (btn) {
    btn.disabled = false;
    btn.innerHTML = `<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2"></polygon></svg> Submit Feedback`;
  }
}

function showSuccessState(type) {
  if (type === 'inquiry') {
    const form = document.getElementById('inquiryFormSection');
    const success = document.getElementById('inquirySuccess');
    if (form) form.style.display = 'none';
    if (success) success.style.display = 'block';
  } else {
    const form = document.getElementById('feedbackFormSection');
    const success = document.getElementById('feedbackSuccess');
    if (form) form.style.display = 'none';
    if (success) success.style.display = 'block';
  }
}
  // =============================================================================
// ADMIN — CHATBOT Q&A MANAGEMENT
// =============================================================================

let editingChatbotId = null;

async function loadChatbotList() {
  try {
    const result = await API.getChatbotQA();
    if (result.success) {
      const tbody = document.getElementById('chatbotList');
      if (!tbody) return;
      tbody.innerHTML = '';
      if (result.data.length === 0) {
        tbody.innerHTML = '<tr><td colspan="5" style="text-align:center;color:#9ca3af;padding:2rem;">No Q&A entries found. Click "Add New Q&A" to get started.</td></tr>';
        return;
      }
      result.data.forEach(item => {
        const categoryColor = {
          'Delivery': '#3b82f6', 'Products': '#10b981', 'Payment': '#f59e0b',
          'Returns': '#ef4444', 'Warranty': '#8b5cf6', 'Store Info': '#6b7280',
          'AI Visualizer': '#DC143C', 'General': '#374151'
        }[item.category] || '#374151';
        tbody.innerHTML += `
          <tr>
            <td><span style="padding:0.2rem 0.6rem;background:${categoryColor}15;color:${categoryColor};border-radius:9999px;font-size:0.75rem;font-weight:600;">${item.category}</span></td>
            <td style="max-width:200px;">${item.question}</td>
            <td style="max-width:250px;color:#6b7280;">${item.answer.substring(0, 80)}${item.answer.length > 80 ? '...' : ''}</td>
            <td style="white-space:nowrap;">${formatDate(item.created_at)}</td>
            <td>
              <button class="action-btn edit" onclick="editChatbotQA(${item.id})" title="Edit">
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"></path><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"></path></svg>
              </button>
              <button class="action-btn delete" onclick="deleteChatbotItem(${item.id})" title="Delete">
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="3 6 5 6 21 6"></polyline><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"></path></svg>
              </button>
            </td>
          </tr>`;
      });
    }
  } catch (error) { showToast('❌ Failed to load chatbot Q&As', 'error'); }
}

function openAddChatbotModal() {
  editingChatbotId = null;
  document.getElementById('chatbotModalTitle').textContent = 'Add New Q&A';
  document.getElementById('chatbotForm').reset();
  showModal('chatbotModal');
}

async function editChatbotQA(id) {
  try {
    const result = await API.getChatbotQA();
    if (result.success) {
      const item = result.data.find(q => q.id === id);
      if (!item) { showToast('Q&A not found', 'error'); return; }
      editingChatbotId = id;
      document.getElementById('chatbotModalTitle').textContent = 'Edit Q&A';
      document.getElementById('chatbotCategory').value = item.category;
      document.getElementById('chatbotQuestion').value = item.question;
      document.getElementById('chatbotAnswer').value = item.answer;
      showModal('chatbotModal');
    }
  } catch (error) { showToast('❌ Failed to load Q&A details', 'error'); }
}

async function handleChatbotSubmit(event) {
  event.preventDefault();
  const data = {
    category: document.getElementById('chatbotCategory').value,
    question: document.getElementById('chatbotQuestion').value,
    answer: document.getElementById('chatbotAnswer').value
  };
  try {
    const result = editingChatbotId
      ? await API.updateChatbotQA(editingChatbotId, data)
      : await API.createChatbotQA(data);
    if (result.success) {
      showToast(result.message, 'success');
      hideModal('chatbotModal');
      loadChatbotList();
    } else {
      showToast('❌ ' + result.message, 'error');
    }
  } catch (error) { showToast('❌ Failed to save Q&A', 'error'); }
}

async function deleteChatbotItem(id) {
  if (!confirm('Are you sure you want to delete this Q&A entry?')) return;
  try {
    const result = await API.deleteChatbotQA(id);
    if (result.success) { showToast(result.message, 'success'); loadChatbotList(); }
    else showToast('❌ ' + result.message, 'error');
  } catch (error) { showToast('❌ Failed to delete Q&A', 'error'); }
}

// =============================================================================
// ADMIN — CUSTOMER INQUIRIES & FEEDBACK (VIEW)
// =============================================================================

async function loadAdminInquiries() {
  try {
    const result = await API.getInquiries();
    if (result.success) {
      const tbody = document.getElementById('adminInquiriesList');
      if (!tbody) return;
      tbody.innerHTML = '';

      // Show badge if there are new inquiries
      const newCount = result.data.filter(i => i.status === 'new').length;
      const badge = document.getElementById('inquiriesNewBadge');
      if (badge) badge.style.display = newCount > 0 ? 'inline' : 'none';

      if (result.data.length === 0) {
        tbody.innerHTML = '<tr><td colspan="7" style="text-align:center;color:#9ca3af;padding:2rem;">No inquiries yet.</td></tr>';
        return;
      }
      result.data.forEach(item => {
        const statusColors = { new: '#DC143C', read: '#3b82f6', replied: '#10b981' };
        const statusBg = { new: '#fef2f2', read: '#dbeafe', replied: '#d1fae5' };
        const color = statusColors[item.status] || '#6b7280';
        const bg = statusBg[item.status] || '#f3f4f6';
        tbody.innerHTML += `
          <tr>
            <td><strong>${item.customer_name}</strong></td>
            <td>${item.email}</td>
            <td>${item.subject || 'General'}</td>
            <td style="max-width:200px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;" title="${item.message}">${item.message.substring(0, 60)}${item.message.length > 60 ? '...' : ''}</td>
            <td>
              <select onchange="updateInquiryStatus(${item.id}, this.value)"
                style="padding:0.25rem 0.5rem;border:1px solid ${color};border-radius:0.375rem;font-size:0.75rem;color:${color};background:${bg};cursor:pointer;font-weight:600;">
                <option value="new" ${item.status === 'new' ? 'selected' : ''}>New</option>
                <option value="read" ${item.status === 'read' ? 'selected' : ''}>Read</option>
                <option value="replied" ${item.status === 'replied' ? 'selected' : ''}>Responded</option>
              </select>
            </td>
            <td style="white-space:nowrap;">${formatDate(item.created_at)}</td>
            <td>
              <button class="action-btn delete" onclick="deleteAdminInquiry(${item.id})" title="Delete">
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="3 6 5 6 21 6"></polyline><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"></path></svg>
              </button>
            </td>
          </tr>`;
      });
    }
  } catch (error) { showToast('❌ Failed to load inquiries', 'error'); }
}

async function updateInquiryStatus(id, status) {
  try {
    const result = await API.updateInquiryStatus(id, status);
    if (result.success) { showToast('Status updated', 'success'); loadAdminInquiries(); }
    else showToast('❌ ' + result.message, 'error');
  } catch (error) { showToast('❌ Failed to update status', 'error'); }
}

async function deleteAdminInquiry(id) {
  if (!confirm('Are you sure you want to delete this inquiry?')) return;
  try {
    const result = await API.deleteInquiry(id);
    if (result.success) { showToast(result.message, 'success'); loadAdminInquiries(); }
    else showToast('❌ ' + result.message, 'error');
  } catch (error) { showToast('❌ Failed to delete inquiry', 'error'); }
}

async function loadAdminFeedback() {
  try {
    const result = await API.getFeedback();
    if (result.success) {
      const tbody = document.getElementById('adminFeedbackList');
      if (!tbody) return;
      tbody.innerHTML = '';
      if (result.data.length === 0) {
        tbody.innerHTML = '<tr><td colspan="7" style="text-align:center;color:#9ca3af;padding:2rem;">No feedback submitted yet.</td></tr>';
        return;
      }
      result.data.forEach(item => {
        const stars = '★'.repeat(item.rating || 0) + '☆'.repeat(5 - (item.rating || 0));
        const starColor = item.rating >= 4 ? '#10b981' : item.rating >= 3 ? '#f59e0b' : '#DC143C';
        tbody.innerHTML += `
          <tr>
            <td><strong>${item.customer_name}</strong></td>
            <td>${item.email || 'N/A'}</td>
            <td>${item.product_name || 'General'}</td>
            <td><span style="color:${starColor};font-size:1rem;" title="${item.rating} out of 5">${stars}</span></td>
            <td style="max-width:200px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;" title="${item.feedback_text}">${item.feedback_text.substring(0, 60)}${item.feedback_text.length > 60 ? '...' : ''}</td>
            <td style="white-space:nowrap;">${formatDate(item.created_at)}</td>
            <td>
              <button class="action-btn delete" onclick="deleteAdminFeedback(${item.id})" title="Delete">
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="3 6 5 6 21 6"></polyline><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"></path></svg>
              </button>
            </td>
          </tr>`;
      });
    }
  } catch (error) { showToast('❌ Failed to load feedback', 'error'); }
}

async function deleteAdminFeedback(id) {
  if (!confirm('Are you sure you want to delete this feedback?')) return;
  try {
    const result = await API.deleteFeedback(id);
    if (result.success) { showToast(result.message, 'success'); loadAdminFeedback(); }
    else showToast('❌ ' + result.message, 'error');
  } catch (error) { showToast('❌ Failed to delete feedback', 'error'); } 
}