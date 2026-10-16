/* =============================================================================
 * K-Desk | js/modules/delivery.js
 * Deliveries
 * -----------------------------------------------------------------------------
 * WHAT IT DOES : Customer Track Delivery page, Admin / Manager / Staff delivery management (list, add, update, status),
 * delivery statistics cards and the Send SMS workflow (the Semaphore key stays on the backend).
 * DEPENDS ON   : API, utils.js (formatDate), showToast, showModal/hideModal.
 * LOAD ORDER   : file 11 of 19 (see scripts-block.html). These are plain scripts that share one
 *                global scope, so inline onclick="..." handlers in the HTML keep working.
 * CONTENTS     :
 * handlePublicTrackDelivery, editingDeliveryId, loadDeliveryStats, cachedDeliveries,
 * currentSmsDeliveryId, buildSmsPreviewMessage, openSmsModal, confirmSendSms,
 * loadStaffDeliveryList, openStaffAddDeliveryModal, handleStaffDeliverySubmit, loadDeliveryList,
 * renderDeliveryTableForRole, loadManagerDeliveryList, getStatusBadge, getTypeBadge,
 * openAddDeliveryModal, handleDeliverySubmit, editDelivery, deleteDelivery, updateDeliveryStatus
 * ============================================================================= */

// Public Delivery Tracking
async function handlePublicTrackDelivery(event) {
  event.preventDefault();
  const refCodeInput = document.getElementById('publicTrackCode');
  const resultDiv = document.getElementById('publicTrackResult');
  if (!refCodeInput || !resultDiv) return;
  const refCode = refCodeInput.value.trim();
  if (!refCode) { alert('❌ Please enter a reference code'); return; }
  resultDiv.classList.remove('hidden');
  resultDiv.innerHTML = '<div style="padding:1.5rem;text-align:center;color:#6b7280;"><span class="kd-spinner" aria-hidden="true"></span>Looking up your delivery...</div>';
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
// DELIVERY MANAGEMENT
// =============================================================================
let editingDeliveryId = null;

// Loads the delivery counts (pending, processing, in transit, delivered) for the dashboard cards.
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

// Builds the SMS text shown in the preview before it is sent.
function buildSmsPreviewMessage(delivery) {
  return `Hello ${delivery.customer_name}, your furniture delivery with reference ${delivery.ref_code} is currently ${delivery.status || 'Pending'}.\n\nThank you for choosing Modern Koncept Furniture Centre.`;
}

// Opens the Send SMS modal for a delivery (the delivery needs a contact number).
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

// Sends the SMS through the backend (the Semaphore API key never reaches the browser).
async function confirmSendSms() {
  if (!currentSmsDeliveryId) return;
  try {
    const result = await API.sendDeliverySms(currentSmsDeliveryId);
    if (result.success) {
      showToast('SMS sent successfully.', 'success');
      hideModal('smsModal');
    } else {
      showToast('❌ ' + (result.message || 'Failed to send SMS. Please try again.'), 'error');
    }
  } catch (error) {
    showToast('❌ Failed to send SMS. Please try again.', 'error');
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

// Staff: opens the empty Add Delivery modal.
function openStaffAddDeliveryModal() {
  const form = document.getElementById('staffDeliveryForm');
  if (form) form.reset();
  showModal('staffDeliveryModal');
}

// Staff: creates a delivery (Staff can view and add only).
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
  try {
    const result = await kdCreateOnce('delivery-create', data, API.createDelivery);
    if (result.success) {
      showToast('✅ ' + result.message + (result.ref_code ? ` Reference Code: ${result.ref_code}` : ''), 'success');
      hideModal('staffDeliveryModal');
      loadStaffDeliveryList();
      loadDeliveryStats();
    } else {
      showToast('❌ ' + result.message, 'error');
    }
  } catch (error) { showToast('❌ Failed to save delivery', 'error'); }
}

// Admin: loads all deliveries into the Delivery table.
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
    tbody.innerHTML = `<tr><td colspan="10" style="text-align:center;padding:2rem;color:#9ca3af;">No deliveries found</td></tr>`;
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
      </td>
      <td>
        <button class="action-btn edit" onclick="editDelivery(${delivery.id})" title="Edit delivery">
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"></path><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"></path></svg>
        </button>
      </td>`;
    tbody.appendChild(row);
  });
}

// Manager: loads the deliveries (filtered by the search box) into the Delivery table.
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

// Returns the readable status text of a delivery (Pending, Processing, In Transit, Delivered).
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

// Returns the delivery type text (or N/A).
function getTypeBadge(type) {
  return `<span style="color:#4b5563;font-size:0.875rem;">${type || 'N/A'}</span>`;
}

// Admin / Manager: opens the empty Add Delivery modal.
function openAddDeliveryModal() {
  editingDeliveryId = null;
  document.getElementById('deliveryModalTitle').textContent = 'Add New Delivery';
  document.getElementById('deliveryForm').reset();
  showModal('deliveryModal');
}

// Admin / Manager: creates a new delivery or saves changes to the one being edited.
async function handleDeliverySubmit(event) {
  event.preventDefault();
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
    const result = editingDeliveryId ? await API.updateDelivery(editingDeliveryId, data) : await kdCreateOnce('delivery-create', data, API.createDelivery);
    if (result.success) {
      showToast('✅ ' + result.message + (result.ref_code ? ` Reference Code: ${result.ref_code}` : ''), 'success');
      hideModal('deliveryModal');
      if (window.location.pathname.includes('manager')) loadManagerDeliveryList();
      else loadDeliveryList();
      loadDeliveryStats();
    } else {
      showToast('❌ ' + result.message, 'error');
    }
  } catch (error) { showToast('❌ Failed to save delivery', 'error'); }
}

// Opens the Update Delivery modal filled with the selected delivery.
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

// Deletes a delivery (the Delete button exists on the Admin dashboard).
async function deleteDelivery(id) {
  if (!confirm('Are you sure you want to delete this delivery?')) return;
  try {
    const result = await API.deleteDelivery(id);
    if (result.success) { showToast(result.message, 'success'); loadDeliveryList(); loadDeliveryStats(); }
    else showToast('❌ ' + result.message, 'error');
  } catch (error) { showToast('❌ Failed to delete delivery', 'error'); }
}

// Admin / Manager: saves the status chosen in the row's dropdown.
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
