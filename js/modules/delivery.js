// =============================================================================
// K-DESK · delivery.js
// delivery
// Cut from the original main.js (lines 1018-2234 region). Code is unchanged except where a comment says otherwise.
// =============================================================================

import { API, API_URL, formatDate, kdCreateOnce } from './core.js';
import { hideModal, kdConfirm, kdDeleteOptions as del, kdFormOptions as submit, kdGuard, kdOpenOptions as open, kdRun, kdWrapBusy, kdWrapLoader, showModal, showToast } from './ui.js';

const VALID_DELIVERY_STATUSES = ['Pending', 'Processing', 'In Transit', 'Delivered'];
const DELIVERY_WINDOW_STORAGE_KEY = 'kd_delivery_windows_v1';

function readLocalDeliveryWindows() {
  try {
    const raw = localStorage.getItem(DELIVERY_WINDOW_STORAGE_KEY);
    return raw ? JSON.parse(raw) : {};
  } catch (_) {
    return {};
  }
}

function writeLocalDeliveryWindow(id, refCode, meta) {
  try {
    const map = readLocalDeliveryWindows();
    if (id != null) map[`id:${id}`] = { ...(map[`id:${id}`] || {}), ...meta };
    if (refCode) map[`ref:${String(refCode).toUpperCase()}`] = { ...(map[`ref:${String(refCode).toUpperCase()}`] || {}), ...meta };
    localStorage.setItem(DELIVERY_WINDOW_STORAGE_KEY, JSON.stringify(map));
  } catch (_) { /* ignore storage quota errors */ }
}

function mergeLocalDeliveryWindow(item) {
  if (!item) return item;
  const map = readLocalDeliveryWindows();
  const byId = item.id != null ? map[`id:${item.id}`] : null;
  const byRef = item.ref_code ? map[`ref:${String(item.ref_code).toUpperCase()}`] : null;
  const local = byId || byRef;
  if (!local) return item;
  // Only use local window end if the start date still matches or server hasn't supplied delivery_end_date
  const startKey = toDeliveryDateKey(item.delivery_date);
  const localStart = local.delivery_date ? toDeliveryDateKey(local.delivery_date) : startKey;
  const endFromLocal = (!localStart || localStart === startKey) ? (local.delivery_end_date || null) : null;
  return {
    ...item,
    delivery_end_date: item.delivery_end_date || endFromLocal || null,
    delivered_at: item.delivered_at || local.delivered_at || null
  };
}

// Public Delivery Tracking
export async function handlePublicTrackDelivery(event) {
  event.preventDefault();
  const refCodeInput = document.getElementById('publicTrackCode');
  const resultDiv = document.getElementById('publicTrackResult');
  if (!refCodeInput || !resultDiv) return;
  const refCode = refCodeInput.value.trim();
  if (!refCode) { showToast('Please enter a reference code.', 'warning'); return; }
  resultDiv.classList.remove('hidden');
  resultDiv.innerHTML = '<div style="padding:1.5rem;text-align:center;color:#6b7280;"><span class="kd-spinner" aria-hidden="true"></span>Looking up your delivery...</div>';
  try {
    const result = await API.trackDelivery(refCode);
    if (result.success && result.data) {
      const d = mergeLocalDeliveryWindow(result.data);
      const applicable = getApplicableDeliveryDate(d);
      const win = getDeliveryWindow(d);
      const deliveryDate = applicable.key ? formatReadableDeliveryDay(applicable.key) : (d.delivery_date ? formatDate(d.delivery_date) : 'N/A');
      const windowRow = win.isRange
        ? `<div style="display:grid;grid-template-columns:140px 1fr;gap:0.5rem;"><span style="font-weight:600;color:#374151;">Scheduled Window:</span><span style="color:#6b7280;">${escapeDeliveryHtml(formatDeliveryWindowText(d))}</span></div>`
        : '';
      resultDiv.innerHTML = `
        <div style="background:#f0fdf4;border:1px solid #86efac;border-radius:0.5rem;padding:1.5rem;">
          <h3 style="color:#166534;font-size:1.25rem;font-weight:600;margin-bottom:1rem;">✅ Delivery Found</h3>
          <div style="display:grid;gap:0.75rem;">
            <div style="display:grid;grid-template-columns:140px 1fr;gap:0.5rem;"><span style="font-weight:600;color:#374151;">Reference Code:</span><span style="color:#6b7280;">${escapeDeliveryHtml(d.ref_code)}</span></div>
            <div style="display:grid;grid-template-columns:140px 1fr;gap:0.5rem;"><span style="font-weight:600;color:#374151;">Customer Name:</span><span style="color:#6b7280;">${escapeDeliveryHtml(d.customer_name)}</span></div>
            <div style="display:grid;grid-template-columns:140px 1fr;gap:0.5rem;"><span style="font-weight:600;color:#374151;">Address:</span><span style="color:#6b7280;">${escapeDeliveryHtml(d.address)}</span></div>
            <div style="display:grid;grid-template-columns:140px 1fr;gap:0.5rem;"><span style="font-weight:600;color:#374151;">Delivery Date:</span><span style="color:#6b7280;">${escapeDeliveryHtml(deliveryDate)}</span></div>
            ${windowRow}
            <div style="display:grid;grid-template-columns:140px 1fr;gap:0.5rem;"><span style="font-weight:600;color:#374151;">Status:</span><span style="padding:0.25rem 0.75rem;background:#DC143C;color:white;border-radius:9999px;display:inline-block;font-size:0.875rem;width:fit-content;">${escapeDeliveryHtml(d.status || 'Scheduled')}</span></div>
          </div>
        </div>`;
      resultDiv.classList.remove('hidden');
    } else {
      resultDiv.innerHTML = `<div style="background:#fef2f2;border:1px solid #fca5a5;border-radius:0.5rem;padding:1.5rem;"><h3 style="color:#991b1b;">❌ Delivery Not Found</h3><p style="color:#6b7280;">No delivery found with reference code: <strong>${escapeDeliveryHtml(refCode)}</strong></p></div>`;
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

export async function loadDeliveryStats() {
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
let cachedDeliveries = [];

 // reused by openSmsModal so no extra fetch is needed
let currentSmsDeliveryId = null;

function buildSmsPreviewMessage(delivery) {
  return `Hello ${delivery.customer_name}, your furniture delivery with reference ${delivery.ref_code} is currently ${delivery.status || 'Pending'}.\n\nThank you for choosing Modern Koncept Furniture Centre.`;
}

export function openSmsModal(deliveryId) {
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

export async function confirmSendSms() {
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
export async function loadStaffDeliveryList() {
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

export function openStaffAddDeliveryModal() {
  const form = document.getElementById('staffDeliveryForm');
  if (form) form.reset();
  showModal('staffDeliveryModal');
}

export async function handleStaffDeliverySubmit(event) {
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

let adminDeliveryControlsInitialized = false;
const DELIVERY_MONTH_NAMES = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

function escapeDeliveryHtml(str) {
  return String(str ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function normalizeDeliveryStatus(status) {
  const raw = String(status || '').trim().toLowerCase();
  if (raw === 'delivered') return 'Delivered';
  if (raw === 'in transit' || raw === 'in_transit') return 'In Transit';
  if (raw === 'processing') return 'Processing';
  return 'Pending';
}

function toDeliveryDateKey(dateVal) {
  if (!dateVal) return '';
  // plain DATE columns ('YYYY-MM-DD') are used as-is; timestamps are converted to the local calendar day
  if (typeof dateVal === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(dateVal)) {
    return dateVal;
  }
  const d = new Date(dateVal);
  if (Number.isNaN(d.getTime())) return '';
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

function parseDeliveryDateKey(dateKey) {
  if (!dateKey || !/^\d{4}-\d{2}-\d{2}$/.test(dateKey)) return null;
  const [y, m, d] = dateKey.split('-').map(Number);
  return new Date(y, m - 1, d);
}

function formatReadableDeliveryDay(dateKey) {
  const d = parseDeliveryDateKey(dateKey);
  if (!d) return dateKey;
  return `${DELIVERY_MONTH_NAMES[d.getMonth()]} ${d.getDate()}, ${d.getFullYear()}`;
}

function getDeliveryWeekStartKey(dateKey) {
  const d = parseDeliveryDateKey(dateKey);
  if (!d) return dateKey;
  const dayOfWeek = d.getDay();
  const diffToMonday = dayOfWeek === 0 ? -6 : 1 - dayOfWeek;
  d.setDate(d.getDate() + diffToMonday);
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

// ---- Delivery window / applicable date ----
// delivery_date = scheduled date (start of the window); delivery_end_date = optional end of the window (NULL = single day);
// delivered_at = actual completion time; status_updated_at = last status change (both optional, see deliveries-date-range-migration.sql).
// The stored window is never rewritten by the UI. The *applicable* delivery date is derived for display:
//   Delivered            -> the actual completion date (delivered_at) when it was recorded
//   today before window  -> the window start
//   today inside window  -> today            (e.g. window Oct 6–7, still In Transit on Oct 7 -> Oct 7)
//   window has passed    -> the window end, flagged Overdue
function getDeliveryWindow(item) {
  const start = toDeliveryDateKey(item && item.delivery_date);
  const rawEnd = toDeliveryDateKey(item && item.delivery_end_date);
  const end = start && rawEnd && rawEnd > start ? rawEnd : start;
  return { start, end, isRange: Boolean(start && end && end !== start) };
}

function getApplicableDeliveryDate(item) {
  const { start, end } = getDeliveryWindow(item);
  const norm = normalizeDeliveryStatus(item && item.status);
  if (norm === 'Delivered') {
    const doneKey = toDeliveryDateKey(item && item.delivered_at);
    if (doneKey) return { key: doneKey, basis: 'delivered', label: 'Delivered on' };
    return { key: end || start, basis: 'delivered-unrecorded', label: 'Delivered (completion date not recorded)' };
  }
  if (!start) return { key: '', basis: 'unscheduled', label: 'Not scheduled' };
  const today = toDeliveryDateKey(new Date());
  if (today < start) return { key: start, basis: 'upcoming', label: 'Scheduled' };
  if (today <= end) return { key: today, basis: 'in-window', label: start === end ? 'Scheduled today' : 'Today (within window)' };
  return { key: end, basis: 'overdue', label: 'Window ended' };
}

function formatDeliveryWindowText(item) {
  const { start, end, isRange } = getDeliveryWindow(item);
  if (!start) return 'N/A';
  return isRange ? `${formatReadableDeliveryDay(start)} – ${formatReadableDeliveryDay(end)}` : formatReadableDeliveryDay(start);
}

function renderDeliveryDateCell(item) {
  const { start, isRange } = getDeliveryWindow(item);
  const applicable = getApplicableDeliveryDate(item);
  if (!start && applicable.basis !== 'delivered') return 'N/A';
  const main = applicable.key ? formatReadableDeliveryDay(applicable.key) : 'N/A';
  const windowLine = isRange ? `<div class="kd-delivery-window">Window: ${escapeDeliveryHtml(formatDeliveryWindowText(item))}</div>` : '';
  const showBasis = isRange || applicable.basis === 'delivered' || applicable.basis === 'delivered-unrecorded';
  const basisLine = showBasis ? `<div class="kd-delivery-basis">${escapeDeliveryHtml(applicable.label)}</div>` : '';
  return `<div class="kd-delivery-date"><strong>${escapeDeliveryHtml(main)}</strong>${basisLine}${windowLine}</div>`;
}

function isDeliveryOverdue(item) {
  if (!item) return false;
  const normStatus = normalizeDeliveryStatus(item.status);
  if (normStatus === 'Delivered') return false;
  const { end } = getDeliveryWindow(item);
  if (!end) return false;
  const todayKey = toDeliveryDateKey(new Date());
  return end < todayKey;
}

function populateAdminDeliveryTypeFilter(deliveries) {
  const select = document.getElementById('adminDeliveryTypeFilter');
  if (!select) return;
  const previous = select.value || 'all';
  const types = new Set(['Outbound', 'Inbound']);
  (deliveries || []).forEach(d => {
    const t = typeof d.delivery_type === 'string' && d.delivery_type.trim() ? d.delivery_type.trim() : null;
    if (t) types.add(t);
  });
  const sorted = Array.from(types);
  select.innerHTML = '<option value="all">All Types</option>' +
    sorted.map(t => `<option value="${escapeDeliveryHtml(t)}">${escapeDeliveryHtml(t)}</option>`).join('');
  if (previous === 'all' || sorted.includes(previous)) select.value = previous;
  else select.value = 'all';
}

function getAdminDeliveryFilterState() {
  const searchEl = document.getElementById('adminDeliverySearch');
  const statusEl = document.getElementById('adminDeliveryStatusFilter');
  const typeEl = document.getElementById('adminDeliveryTypeFilter');
  const dateFromEl = document.getElementById('adminDeliveryDateFrom');
  const dateToEl = document.getElementById('adminDeliveryDateTo');
  const sortEl = document.getElementById('adminDeliverySort');
  const dateFieldEl = document.getElementById('deliveryChartDateField');
  const intervalEl = document.getElementById('deliveryChartInterval');
  const viewEl = document.getElementById('deliveryChartView');

  const search = searchEl ? searchEl.value.trim().toLowerCase() : '';
  const status = statusEl ? statusEl.value : 'all';
  const deliveryType = typeEl ? typeEl.value : 'all';
  const dateFrom = dateFromEl ? dateFromEl.value : '';
  const dateTo = dateToEl ? dateToEl.value : '';
  const sort = sortEl ? sortEl.value : 'date-desc';
  const dateField = dateFieldEl ? dateFieldEl.value : 'delivery_date';
  const interval = intervalEl ? intervalEl.value : 'auto';
  const chartView = viewEl ? viewEl.value : 'status_breakdown';

  const hasActiveFilters = Boolean(
    search ||
    (status && status !== 'all') ||
    (deliveryType && deliveryType !== 'all') ||
    dateFrom ||
    dateTo
  );

  return { search, status, deliveryType, dateFrom, dateTo, sort, dateField, interval, chartView, hasActiveFilters };
}

function filterAndSortAdminDeliveries(deliveries, filterState) {
  const { search, status, deliveryType, dateFrom, dateTo, sort } = filterState;

  const filtered = (deliveries || []).filter(item => {
    const normStatus = normalizeDeliveryStatus(item.status);
    if (status && status !== 'all') {
      if (status === 'Overdue') {
        if (!isDeliveryOverdue(item)) return false;
      } else if (normStatus.toLowerCase() !== status.toLowerCase()) {
        return false;
      }
    }

    if (deliveryType && deliveryType !== 'all') {
      const itemType = String(item.delivery_type || '').trim();
      if (itemType.toLowerCase() !== deliveryType.toLowerCase()) return false;
    }

    // Date-range filter: a record matches when its scheduled window (start..end) overlaps the selected range.
    // Unscheduled records fall back to their created date.
    const win = getDeliveryWindow(item);
    const createdKey = toDeliveryDateKey(item.created_at);
    const rowStart = win.start || createdKey;
    const rowEnd = win.end || createdKey;
    if (dateFrom && (!rowEnd || rowEnd < dateFrom)) return false;
    if (dateTo && (!rowStart || rowStart > dateTo)) return false;

    if (search) {
      const ref = String(item.ref_code || '').toLowerCase();
      const cust = String(item.customer_name || '').toLowerCase();
      const prod = String(item.product || '').toLowerCase();
      const addr = String(item.address || '').toLowerCase();
      const phone = String(item.contact_number || '').toLowerCase();
      if (!ref.includes(search) && !cust.includes(search) && !prod.includes(search) && !addr.includes(search) && !phone.includes(search)) {
        return false;
      }
    }

    return true;
  });

  const STATUS_ORDER = { 'Pending': 1, 'Processing': 2, 'In Transit': 3, 'Delivered': 4 };

  const sorted = [...filtered].sort((a, b) => {
    if (sort === 'date-desc' || sort === 'date-asc') {
      // sorted by scheduled window start, then window end
      const wa = getDeliveryWindow(a);
      const wb = getDeliveryWindow(b);
      const da = (wa.start || toDeliveryDateKey(a.created_at)) + '|' + (wa.end || '');
      const db = (wb.start || toDeliveryDateKey(b.created_at)) + '|' + (wb.end || '');
      if (da !== db) {
        return sort === 'date-asc' ? da.localeCompare(db) : db.localeCompare(da);
      }
      return sort === 'date-asc' ? (Number(a.id) - Number(b.id)) : (Number(b.id) - Number(a.id));
    }
    if (sort === 'status-asc' || sort === 'status-desc') {
      const sa = STATUS_ORDER[normalizeDeliveryStatus(a.status)] || 99;
      const sb = STATUS_ORDER[normalizeDeliveryStatus(b.status)] || 99;
      if (sa !== sb) return sort === 'status-asc' ? sa - sb : sb - sa;
      return Number(b.id) - Number(a.id);
    }
    if (sort === 'customer-asc' || sort === 'customer-desc') {
      const ca = String(a.customer_name || '');
      const cb = String(b.customer_name || '');
      const cmp = ca.localeCompare(cb, undefined, { sensitivity: 'base' });
      return sort === 'customer-asc' ? cmp : -cmp;
    }
    if (sort === 'id-asc' || sort === 'id-desc') {
      const ra = String(a.ref_code || '');
      const rb = String(b.ref_code || '');
      const cmp = ra.localeCompare(rb, undefined, { numeric: true, sensitivity: 'base' });
      return sort === 'id-asc' ? cmp : -cmp;
    }
    return 0;
  });

  return sorted;
}

function updateAdminDeliveryFilterScopes(filteredDeliveries, allDeliveries, hasActiveFilters) {
  const summaryEl = document.getElementById('adminDeliveryFilterSummary');
  const allCount = (allDeliveries || []).length;
  const filteredCount = (filteredDeliveries || []).length;

  if (summaryEl) {
    summaryEl.textContent = hasActiveFilters
      ? `Showing ${filteredCount} of ${allCount} deliveries (filtered)`
      : `Showing all ${allCount} deliver${allCount === 1 ? 'y' : 'ies'}`;
  }

  const overdueCount = (filteredDeliveries || []).filter(isDeliveryOverdue).length;
  const setScope = (id, text) => { const el = document.getElementById(id); if (el) el.textContent = text; };

  if (hasActiveFilters) {
    const fPending = filteredDeliveries.filter(d => normalizeDeliveryStatus(d.status) === 'Pending').length;
    const fProc = filteredDeliveries.filter(d => normalizeDeliveryStatus(d.status) === 'Processing').length;
    const fTransit = filteredDeliveries.filter(d => normalizeDeliveryStatus(d.status) === 'In Transit').length;
    const fDeliv = filteredDeliveries.filter(d => normalizeDeliveryStatus(d.status) === 'Delivered').length;
    setScope('deliveryPendingScope', `${fPending} in current filter`);
    setScope('deliveryProcessingScope', `${fProc} in current filter`);
    setScope('deliveryInTransitScope', `${fTransit} in current filter`);
    setScope('deliveryDeliveredScope', `${fDeliv} in current filter`);
  } else {
    setScope('deliveryPendingScope', overdueCount > 0 ? `Awaiting processing (${overdueCount} overdue overall)` : 'Awaiting processing');
    setScope('deliveryProcessingScope', 'Preparing shipment');
    setScope('deliveryInTransitScope', 'Active on route');
    setScope('deliveryDeliveredScope', 'Completed');
  }
}

const selectedAdminDeliveryIds = new Set();
const selectedManagerDeliveryIds = new Set();
let visibleAdminDeliveryIds = [];
let visibleManagerDeliveryIds = [];
let managerDeliveryControlsInitialized = false;

function getRoleSelectionSet(role) {
  return role === 'manager' ? selectedManagerDeliveryIds : selectedAdminDeliveryIds;
}

function getRoleVisibleIds(role) {
  return role === 'manager' ? visibleManagerDeliveryIds : visibleAdminDeliveryIds;
}

function syncBulkSelectionUi(role) {
  const isManager = role === 'manager';
  const selectedSet = getRoleSelectionSet(role);
  const visibleIds = getRoleVisibleIds(role);
  const selectAllEl = document.getElementById(isManager ? 'managerDeliverySelectAll' : 'adminDeliverySelectAll');
  const countEl = document.getElementById(isManager ? 'managerBulkSelectedCount' : 'adminBulkSelectedCount');
  const applyBtn = document.getElementById(isManager ? 'managerBulkApplyBtn' : 'adminBulkApplyBtn');
  const clearBtn = document.getElementById(isManager ? 'managerBulkClearBtn' : 'adminBulkClearBtn');
  const tbodyId = isManager ? 'managerDeliveryList' : 'adminDeliveryList';

  // Prune any selected IDs that no longer exist in cachedDeliveries
  const validAllIds = new Set((cachedDeliveries || []).map(d => Number(d.id)));
  Array.from(selectedSet).forEach(id => {
    if (!validAllIds.has(Number(id))) selectedSet.delete(id);
  });

  const visibleSelectedCount = visibleIds.filter(id => selectedSet.has(Number(id))).length;
  if (selectAllEl) {
    if (visibleIds.length === 0) {
      selectAllEl.checked = false;
      selectAllEl.indeterminate = false;
      selectAllEl.disabled = true;
    } else {
      selectAllEl.disabled = false;
      selectAllEl.checked = visibleSelectedCount === visibleIds.length;
      selectAllEl.indeterminate = visibleSelectedCount > 0 && visibleSelectedCount < visibleIds.length;
    }
  }

  const totalSelected = selectedSet.size;
  if (countEl) {
    if (totalSelected === 0) {
      countEl.textContent = '0 selected';
    } else if (visibleSelectedCount !== totalSelected) {
      countEl.textContent = `${totalSelected} selected (${visibleSelectedCount} in current view)`;
    } else {
      countEl.textContent = `${totalSelected} deliver${totalSelected === 1 ? 'y' : 'ies'} selected`;
    }
  }

  if (applyBtn) applyBtn.disabled = totalSelected === 0;
  if (clearBtn) clearBtn.style.display = totalSelected > 0 ? 'inline-flex' : 'none';

  const tbody = document.getElementById(tbodyId);
  if (tbody) {
    tbody.querySelectorAll('.delivery-row-checkbox').forEach(cb => {
      const id = Number(cb.getAttribute('data-delivery-id'));
      const checked = selectedSet.has(id);
      cb.checked = checked;
      const tr = cb.closest('tr');
      if (tr) tr.classList.toggle('kd-row-selected', checked);
    });
  }
}

export function toggleDeliverySelection(id, checked, role = 'admin') {
  const numId = Number(id);
  if (!Number.isFinite(numId)) return;
  const set = getRoleSelectionSet(role);
  if (checked) set.add(numId);
  else set.delete(numId);
  syncBulkSelectionUi(role);
}

export function toggleSelectAllDeliveries(checked, role = 'admin') {
  const set = getRoleSelectionSet(role);
  const visibleIds = getRoleVisibleIds(role);
  visibleIds.forEach(id => {
    if (checked) set.add(Number(id));
    else set.delete(Number(id));
  });
  syncBulkSelectionUi(role);
}

export function clearDeliverySelection(role = 'admin') {
  const set = getRoleSelectionSet(role);
  set.clear();
  syncBulkSelectionUi(role);
}

export async function handleBulkDeliveryStatusUpdate(role = 'admin') {
  const isManager = role === 'manager';
  const selectedSet = getRoleSelectionSet(role);
  const statusSelect = document.getElementById(isManager ? 'managerBulkDeliveryStatus' : 'adminBulkDeliveryStatus');
  const applyBtn = document.getElementById(isManager ? 'managerBulkApplyBtn' : 'adminBulkApplyBtn');

  const ids = Array.from(selectedSet).map(Number).filter(Boolean);
  if (ids.length === 0) {
    showToast('Please select at least one delivery record first.', 'warning');
    return;
  }

  const newStatus = statusSelect ? statusSelect.value : '';
  if (!VALID_DELIVERY_STATUSES.includes(newStatus)) {
    showToast('Please select a valid delivery status.', 'warning');
    return;
  }

  const selectedRecords = ids
    .map(id => (cachedDeliveries || []).find(d => Number(d.id) === id))
    .filter(Boolean);
  const refList = selectedRecords.slice(0, 6).map(d => d.ref_code).join(', ') +
    (selectedRecords.length > 6 ? `, +${selectedRecords.length - 6} more` : '');

  const confirmed = await kdConfirm(
    `Update ${ids.length} selected deliver${ids.length === 1 ? 'y' : 'ies'} to "${newStatus}"?\n\nSelected: ${refList || ids.join(', ')}`,
    { title: 'Confirm Bulk Status Update', confirmText: `Update ${ids.length} Record${ids.length === 1 ? '' : 's'}`, cancelText: 'Cancel' }
  );
  if (!confirmed) return;

  await kdRun(`bulkDeliveryStatus:${role}`, async () => {
    let result = await API.bulkUpdateDeliveryStatus(ids, newStatus);

    // Fallback to sequential single-record status PATCH if the remote server hasn't deployed /deliveries/bulk-status yet
    if (!result || (result.message && result.message.includes('not available on the server'))) {
      const updated = [];
      const failed = [];
      for (const id of ids) {
        try {
          const singleRes = await API.updateDeliveryStatus(id, newStatus);
          const rec = selectedRecords.find(r => Number(r.id) === id);
          if (singleRes && singleRes.success) {
            updated.push({ id, ref_code: rec ? rec.ref_code : String(id) });
          } else {
            failed.push({ id, ref_code: rec ? rec.ref_code : String(id), reason: (singleRes && singleRes.message) || 'Update failed' });
          }
        } catch (err) {
          failed.push({ id, ref_code: String(id), reason: 'Network error' });
        }
      }
      result = {
        success: failed.length === 0 && updated.length > 0,
        partial: updated.length > 0 && failed.length > 0,
        updated,
        unchanged: [],
        failed,
        message: failed.length === 0
          ? `${updated.length} deliver${updated.length === 1 ? 'y' : 'ies'} set to ${newStatus}.`
          : `${updated.length} of ${ids.length} deliveries updated to ${newStatus}; ${failed.length} failed.`
      };
    }

    const nowIso = new Date().toISOString();
    const succeededIds = new Set([
      ...((result && result.updated) || []).map(r => Number(r.id)),
      ...((result && result.unchanged) || []).map(r => Number(r.id))
    ]);
    succeededIds.forEach(id => {
      const rec = (cachedDeliveries || []).find(d => Number(d.id) === id);
      writeLocalDeliveryWindow(id, rec && rec.ref_code, {
        delivered_at: newStatus === 'Delivered' ? nowIso : null,
        status_updated_at: nowIso
      });
    });

    if (result && result.success) {
      showToast('✅ ' + (result.message || `Updated ${ids.length} deliveries to ${newStatus}`), 'success');
      selectedSet.clear();
    } else if (result && result.partial) {
      const failedRefs = (result.failed || []).map(f => f.ref_code || `#${f.id}`).join(', ');
      showToast(`⚠️ ${result.message} (Failed: ${failedRefs})`, 'warning', 6000);
      // Keep only failed IDs selected so the user can retry them easily
      selectedSet.clear();
      (result.failed || []).forEach(f => { if (f && f.id) selectedSet.add(Number(f.id)); });
    } else {
      showToast('❌ ' + ((result && result.message) || 'Failed to update delivery statuses'), 'error');
    }

    if (isManager) await loadManagerDeliveryList();
    else await loadDeliveryList();
    await loadDeliveryStats();
  }, { button: applyBtn, loadingText: 'Updating...', progress: 'Updating selected delivery statuses...' });
}

function renderAdminDeliveryTableRows(filteredDeliveries, allDeliveriesCount) {
  const tbody = document.getElementById('adminDeliveryList');
  if (!tbody) return;
  tbody.innerHTML = '';

  visibleAdminDeliveryIds = (filteredDeliveries || []).map(item => Number(item.id)).filter(Boolean);

  if (!filteredDeliveries || filteredDeliveries.length === 0) {
    const emptyMsg = allDeliveriesCount > 0
      ? 'No deliveries match your selected filters.'
      : 'No deliveries found';
    tbody.innerHTML = `<tr><td colspan="12" style="text-align:center;color:#9ca3af;padding:2rem;">${emptyMsg}</td></tr>`;
    syncBulkSelectionUi('admin');
    return;
  }

  filteredDeliveries.forEach(item => {
    const isChecked = selectedAdminDeliveryIds.has(Number(item.id));
    const normStatus = normalizeDeliveryStatus(item.status);
    const driverDisplay = item.assigned_driver_name
      ? `<span style="font-weight:600;color:#1e40af;">${escapeDeliveryHtml(item.assigned_driver_name)}</span>`
      : '<span style="color:#9ca3af;font-size:0.8rem;">Unassigned</span>';

    tbody.innerHTML += `
      <tr class="${isChecked ? 'kd-row-selected' : ''}">
        <td style="text-align:center;">
          <input type="checkbox" class="delivery-row-checkbox" data-role="admin" data-delivery-id="${item.id}" ${isChecked ? 'checked' : ''} onchange="toggleDeliverySelection(${item.id}, this.checked, 'admin')" aria-label="Select delivery ${escapeDeliveryHtml(item.ref_code)}">
        </td>
        <td><button class="action-btn edit" onclick="openSmsModal(${item.id})" style="color:#2563eb;border-color:#2563eb;" title="Send SMS"><svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"></path></svg> Send SMS</button></td>
        <td><strong>${escapeDeliveryHtml(item.ref_code)}</strong></td>
        <td>${escapeDeliveryHtml(item.customer_name)}</td>
        <td>${escapeDeliveryHtml(item.contact_number || 'N/A')}</td>
        <td style="max-width:200px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;" title="${escapeDeliveryHtml(item.address)}">${escapeDeliveryHtml(item.address)}</td>
        <td>${escapeDeliveryHtml(item.product || 'N/A')}${item.quantity && item.quantity > 1 ? ` <span style="font-weight:600;color:#6b7280;font-size:0.8125rem;">(×${item.quantity})</span>` : ''}${item.amount ? `<div style="font-size:0.75rem;color:#16a34a;font-weight:600;">₱${Number(item.amount).toLocaleString('en-US', { minimumFractionDigits: 2 })}</div>` : ''}</td>
        <td>${driverDisplay}</td>
        <td>${renderDeliveryDateCell(item)}</td>
        <td>${getStatusBadge(item.status, item)}</td>
        <td>
          <select class="status-select" data-delivery-id="${item.id}" style="padding:0.375rem 0.65rem;border:2px solid #e5e7eb;border-radius:0.375rem;font-size:0.875rem;cursor:pointer;">
            <option value="Pending" ${normStatus === 'Pending' ? 'selected' : ''}>Pending</option>
            <option value="Processing" ${normStatus === 'Processing' ? 'selected' : ''}>Processing</option>
            <option value="In Transit" ${normStatus === 'In Transit' ? 'selected' : ''}>In Transit</option>
            ${normStatus === 'Delivered' ? '<option value="Delivered" selected disabled>Delivered (Locked)</option>' : ''}
          </select>
          <button class="action-btn edit" onclick="updateDeliveryStatus(${item.id})" style="margin-left:0.4rem;" title="Update Status" ${normStatus === 'Delivered' ? 'disabled style="opacity:0.4;cursor:not-allowed;"' : ''}>
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="20 6 9 17 4 12"></polyline></svg>
          </button>
        </td>
        <td>
          <button class="action-btn edit" onclick="editDelivery(${item.id})" title="Edit"><svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"></path><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"></path></svg></button>
          <button class="action-btn delete" onclick="deleteDelivery(${item.id})" title="Delete"><svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="3 6 5 6 21 6"></polyline><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"></path></svg></button>
        </td>
      </tr>`;
  });
  syncBulkSelectionUi('admin');
}

function chooseEffectiveDeliveryInterval(deliveries, dateField, requestedInterval) {
  if (requestedInterval && requestedInterval !== 'auto') return requestedInterval;
  const dateKeys = (deliveries || [])
    .map(d => toDeliveryDateKey(d[dateField] || d.delivery_date || d.created_at))
    .filter(Boolean)
    .sort();
  if (dateKeys.length <= 1) return 'day';
  const first = parseDeliveryDateKey(dateKeys[0]);
  const last = parseDeliveryDateKey(dateKeys[dateKeys.length - 1]);
  if (!first || !last) return 'day';
  const spanDays = Math.round((last - first) / (1000 * 60 * 60 * 24));
  if (spanDays <= 45) return 'day';
  if (spanDays <= 180) return 'week';
  return 'month';
}

function aggregateDeliveriesChronologically(deliveries, dateField, interval) {
  const buckets = new Map();
  (deliveries || []).forEach(row => {
    const rawDate = row[dateField] || row.delivery_date || row.created_at;
    const dateKey = toDeliveryDateKey(rawDate);
    if (!dateKey) return;

    let bucketKey = dateKey;
    let label = '';
    if (interval === 'month') {
      bucketKey = dateKey.slice(0, 7);
      const [y, m] = bucketKey.split('-').map(Number);
      label = `${DELIVERY_MONTH_NAMES[m - 1]} ${y}`;
    } else if (interval === 'week') {
      bucketKey = getDeliveryWeekStartKey(dateKey);
      label = `Week of ${formatReadableDeliveryDay(bucketKey)}`;
    } else {
      bucketKey = dateKey;
      label = formatReadableDeliveryDay(dateKey);
    }

    if (!buckets.has(bucketKey)) {
      buckets.set(bucketKey, {
        key: bucketKey,
        label,
        total: 0,
        delivered: 0,
        inTransit: 0,
        pendingOrProcessing: 0,
        overdue: 0
      });
    }
    const entry = buckets.get(bucketKey);
    entry.total += 1;
    const normStatus = normalizeDeliveryStatus(row.status);
    if (normStatus === 'Delivered') entry.delivered += 1;
    else if (normStatus === 'In Transit') entry.inTransit += 1;
    else entry.pendingOrProcessing += 1;

    if (isDeliveryOverdue(row)) {
      entry.overdue += 1;
    }
  });

  return Array.from(buckets.values()).sort((a, b) => a.key.localeCompare(b.key));
}

function renderAdminDeliveryLineChart(filteredDeliveries, filterState) {
  const ctx = document.getElementById('deliveryLineChart');
  if (!ctx) return;

  const noticeEl = document.getElementById('deliveryChartNotice');
  const setNotice = (msg, isWarning = false) => {
    if (!noticeEl) return;
    if (!msg) {
      noticeEl.style.display = 'none';
      noticeEl.textContent = '';
      return;
    }
    noticeEl.style.display = 'block';
    noticeEl.style.background = isWarning ? '#fffbeb' : '#eff6ff';
    noticeEl.style.color = isWarning ? '#92400e' : '#1e40af';
    noticeEl.style.borderColor = isWarning ? '#fde68a' : '#bfdbfe';
    noticeEl.innerHTML = msg;
  };

  if (window.deliveryLineChartInstance) {
    window.deliveryLineChartInstance.destroy();
    window.deliveryLineChartInstance = null;
  }

  if (!filteredDeliveries || filteredDeliveries.length === 0) {
    setNotice('No delivery records match the current filter selection. Adjust your filters or add deliveries to view the delivery trend line graph.', true);
    window.deliveryLineChartInstance = new Chart(ctx, {
      type: 'line',
      data: {
        labels: ['No matching deliveries'],
        datasets: [{ label: 'Deliveries', data: [0], borderColor: '#9ca3af', backgroundColor: 'rgba(156,163,175,0.1)', borderWidth: 2 }]
      },
      options: { responsive: true, maintainAspectRatio: false, scales: { y: { beginAtZero: true, ticks: { precision: 0 } } } }
    });
    return;
  }

  const effectiveInterval = chooseEffectiveDeliveryInterval(filteredDeliveries, filterState.dateField, filterState.interval);
  const aggregated = aggregateDeliveriesChronologically(filteredDeliveries, filterState.dateField, effectiveInterval);

  const intervalLabelMap = { day: 'Daily', week: 'Weekly', month: 'Monthly' };
  const intervalTitle = intervalLabelMap[effectiveInterval] || 'Chronological';
  const dateBasisTitle = filterState.dateField === 'created_at' ? 'Record Created Date' : 'Scheduled Delivery Date';

  if (aggregated.length === 1) {
    setNotice(`Showing actual delivery data for <strong>${escapeDeliveryHtml(aggregated[0].label)}</strong> (${filteredDeliveries.length} deliver${filteredDeliveries.length === 1 ? 'y' : 'ies'} by ${dateBasisTitle}). Additional deliveries across multiple dates will form a multi-point timeline.`);
  } else {
    setNotice(`Grouped by <strong>${intervalTitle}</strong> (${dateBasisTitle}) across ${aggregated.length} chronological periods (${filteredDeliveries.length} total deliver${filteredDeliveries.length === 1 ? 'y' : 'ies'}).`);
  }

  const labels = aggregated.map(b => b.label);

  // Semantic colors based on Task 5:
  // Green (#10b981): Delivered / completed
  // Blue (#3b82f6): In Transit / active progress / total volume
  // Orange (#f59e0b): Pending / Processing (queued / attention)
  // Red (#ef4444): Overdue (scheduled delivery_date passed & not Delivered)
  let datasets = [];
  if (filterState.chartView === 'total_vs_completed') {
    datasets = [
      {
        label: 'Total Scheduled / Created',
        data: aggregated.map(b => b.total),
        borderColor: '#3b82f6',
        backgroundColor: 'rgba(59, 130, 246, 0.10)',
        borderWidth: 3,
        fill: true,
        tension: 0.35,
        pointBackgroundColor: '#3b82f6',
        pointBorderColor: '#ffffff',
        pointBorderWidth: 2,
        pointRadius: 5,
        pointHoverRadius: 7
      },
      {
        label: 'Delivered (Completed)',
        data: aggregated.map(b => b.delivered),
        borderColor: '#10b981',
        backgroundColor: 'rgba(16, 185, 129, 0.12)',
        borderWidth: 3,
        fill: false,
        tension: 0.35,
        pointBackgroundColor: '#10b981',
        pointBorderColor: '#ffffff',
        pointBorderWidth: 2,
        pointRadius: 5,
        pointHoverRadius: 7
      },
      {
        label: 'Overdue (Past Due & Not Delivered)',
        data: aggregated.map(b => b.overdue),
        borderColor: '#ef4444',
        backgroundColor: 'rgba(239, 68, 68, 0.08)',
        borderWidth: 2,
        borderDash: [5, 4],
        fill: false,
        tension: 0.35,
        pointBackgroundColor: '#ef4444',
        pointBorderColor: '#ffffff',
        pointBorderWidth: 2,
        pointRadius: 4,
        pointHoverRadius: 6
      }
    ];
  } else {
    datasets = [
      {
        label: 'Delivered (Completed)',
        data: aggregated.map(b => b.delivered),
        borderColor: '#10b981',
        backgroundColor: 'rgba(16, 185, 129, 0.12)',
        borderWidth: 3,
        fill: true,
        tension: 0.35,
        pointBackgroundColor: '#10b981',
        pointBorderColor: '#ffffff',
        pointBorderWidth: 2,
        pointRadius: 5,
        pointHoverRadius: 7
      },
      {
        label: 'In Transit (Active Progress)',
        data: aggregated.map(b => b.inTransit),
        borderColor: '#3b82f6',
        backgroundColor: 'rgba(59, 130, 246, 0.10)',
        borderWidth: 3,
        fill: false,
        tension: 0.35,
        pointBackgroundColor: '#3b82f6',
        pointBorderColor: '#ffffff',
        pointBorderWidth: 2,
        pointRadius: 5,
        pointHoverRadius: 7
      },
      {
        label: 'Pending / Processing (Queued)',
        data: aggregated.map(b => b.pendingOrProcessing),
        borderColor: '#f59e0b',
        backgroundColor: 'rgba(245, 158, 11, 0.10)',
        borderWidth: 3,
        fill: false,
        tension: 0.35,
        pointBackgroundColor: '#f59e0b',
        pointBorderColor: '#ffffff',
        pointBorderWidth: 2,
        pointRadius: 5,
        pointHoverRadius: 7
      },
      {
        label: 'Overdue (Past Due & Not Delivered)',
        data: aggregated.map(b => b.overdue),
        borderColor: '#ef4444',
        backgroundColor: 'rgba(239, 68, 68, 0.08)',
        borderWidth: 2,
        borderDash: [5, 4],
        fill: false,
        tension: 0.35,
        pointBackgroundColor: '#ef4444',
        pointBorderColor: '#ffffff',
        pointBorderWidth: 2,
        pointRadius: 4,
        pointHoverRadius: 6
      }
    ];
  }

  window.deliveryLineChartInstance = new Chart(ctx, {
    type: 'line',
    data: { labels, datasets },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      interaction: { mode: 'index', intersect: false },
      plugins: {
        legend: { display: true, position: 'top' },
        tooltip: {
          callbacks: {
            label: context => `${context.dataset.label}: ${context.parsed.y} deliver${context.parsed.y === 1 ? 'y' : 'ies'}`
          }
        }
      },
      scales: {
        x: {
          title: { display: true, text: `${dateBasisTitle} (${intervalTitle})`, color: '#4b5563', font: { weight: '600' } }
        },
        y: {
          beginAtZero: true,
          title: { display: true, text: 'Number of Deliveries', color: '#4b5563', font: { weight: '600' } },
          ticks: { precision: 0, stepSize: 1 }
        }
      }
    }
  });
}

function applyAdminDeliveryView() {
  const filterState = getAdminDeliveryFilterState();
  const filtered = filterAndSortAdminDeliveries(cachedDeliveries, filterState);
  renderAdminDeliveryTableRows(filtered, cachedDeliveries.length);
  updateAdminDeliveryFilterScopes(filtered, cachedDeliveries, filterState.hasActiveFilters);
  renderAdminDeliveryLineChart(filtered, filterState);
}

export function initAdminDeliveryControls() {
  if (adminDeliveryControlsInitialized) return;
  const searchEl = document.getElementById('adminDeliverySearch');
  if (!searchEl) return;
  adminDeliveryControlsInitialized = true;

  const bindChange = (id, evt = 'change') => {
    const el = document.getElementById(id);
    if (el) el.addEventListener(evt, () => applyAdminDeliveryView());
  };

  bindChange('adminDeliverySearch', 'input');
  bindChange('adminDeliveryStatusFilter', 'change');
  bindChange('adminDeliveryTypeFilter', 'change');
  bindChange('adminDeliveryDateFrom', 'change');
  bindChange('adminDeliveryDateTo', 'change');
  bindChange('adminDeliverySort', 'change');
  bindChange('deliveryChartDateField', 'change');
  bindChange('deliveryChartInterval', 'change');
  bindChange('deliveryChartView', 'change');

  const selectAllEl = document.getElementById('adminDeliverySelectAll');
  if (selectAllEl) {
    selectAllEl.addEventListener('change', (e) => toggleSelectAllDeliveries(e.target.checked, 'admin'));
  }
  const bulkApplyBtn = document.getElementById('adminBulkApplyBtn');
  if (bulkApplyBtn) {
    bulkApplyBtn.addEventListener('click', () => handleBulkDeliveryStatusUpdate('admin'));
  }
  const bulkClearBtn = document.getElementById('adminBulkClearBtn');
  if (bulkClearBtn) {
    bulkClearBtn.addEventListener('click', () => clearDeliverySelection('admin'));
  }

  // Link start date -> end date min attribute in the delivery modal
  const startDateInput = document.getElementById('deliveryDate');
  const endDateInput = document.getElementById('deliveryEndDate');
  if (startDateInput && endDateInput) {
    startDateInput.addEventListener('change', () => {
      endDateInput.min = startDateInput.value || '';
      if (endDateInput.value && startDateInput.value && endDateInput.value < startDateInput.value) {
        endDateInput.value = startDateInput.value;
      }
    });
  }

  const resetBtn = document.getElementById('adminDeliveryResetFilters');
  if (resetBtn) {
    resetBtn.addEventListener('click', () => {
      const s = document.getElementById('adminDeliverySearch');
      const st = document.getElementById('adminDeliveryStatusFilter');
      const tp = document.getElementById('adminDeliveryTypeFilter');
      const df = document.getElementById('adminDeliveryDateFrom');
      const dt = document.getElementById('adminDeliveryDateTo');
      const sort = document.getElementById('adminDeliverySort');
      const cField = document.getElementById('deliveryChartDateField');
      const cInt = document.getElementById('deliveryChartInterval');
      const cView = document.getElementById('deliveryChartView');
      if (s) s.value = '';
      if (st) st.value = 'all';
      if (tp) tp.value = 'all';
      if (df) df.value = '';
      if (dt) dt.value = '';
      if (sort) sort.value = 'date-desc';
      if (cField) cField.value = 'delivery_date';
      if (cInt) cInt.value = 'auto';
      if (cView) cView.value = 'status_breakdown';
      applyAdminDeliveryView();
    });
  }
}

export async function loadDeliveryList() {
  try {
    initAdminDeliveryControls();
    const result = await API.getDeliveries();
    if (result.success) {
      cachedDeliveries = (Array.isArray(result.data) ? result.data : []).map(mergeLocalDeliveryWindow);
      populateAdminDeliveryTypeFilter(cachedDeliveries);
      applyAdminDeliveryView();
      loadDeliveryStats();
    }
  } catch (error) { showToast('❌ Failed to load deliveries', 'error'); }
}

function getManagerDeliveryFilterState() {
  const searchEl = document.getElementById('managerDeliverySearch');
  const statusEl = document.getElementById('managerDeliveryStatusFilter');
  const dateFromEl = document.getElementById('managerDeliveryDateFrom');
  const dateToEl = document.getElementById('managerDeliveryDateTo');
  const sortEl = document.getElementById('managerDeliverySort');

  const search = searchEl ? searchEl.value.trim().toLowerCase() : '';
  const status = statusEl ? statusEl.value : 'all';
  const dateFrom = dateFromEl ? dateFromEl.value : '';
  const dateTo = dateToEl ? dateToEl.value : '';
  const sort = sortEl ? sortEl.value : 'date-desc';
  const hasActiveFilters = Boolean(search || (status && status !== 'all') || dateFrom || dateTo);
  return { search, status, deliveryType: 'all', dateFrom, dateTo, sort, hasActiveFilters };
}

export function initManagerDeliveryControls() {
  if (managerDeliveryControlsInitialized) return;
  const searchEl = document.getElementById('managerDeliverySearch');
  if (!searchEl) return;
  managerDeliveryControlsInitialized = true;

  const bindChange = (id, evt = 'change') => {
    const el = document.getElementById(id);
    if (el) el.addEventListener(evt, () => applyManagerDeliveryView());
  };

  bindChange('managerDeliverySearch', 'input');
  bindChange('managerDeliveryStatusFilter', 'change');
  bindChange('managerDeliveryDateFrom', 'change');
  bindChange('managerDeliveryDateTo', 'change');
  bindChange('managerDeliverySort', 'change');

  const selectAllEl = document.getElementById('managerDeliverySelectAll');
  if (selectAllEl) {
    selectAllEl.addEventListener('change', (e) => toggleSelectAllDeliveries(e.target.checked, 'manager'));
  }
  const bulkApplyBtn = document.getElementById('managerBulkApplyBtn');
  if (bulkApplyBtn) {
    bulkApplyBtn.addEventListener('click', () => handleBulkDeliveryStatusUpdate('manager'));
  }
  const bulkClearBtn = document.getElementById('managerBulkClearBtn');
  if (bulkClearBtn) {
    bulkClearBtn.addEventListener('click', () => clearDeliverySelection('manager'));
  }

  const startDateInput = document.getElementById('deliveryDate');
  const endDateInput = document.getElementById('deliveryEndDate');
  if (startDateInput && endDateInput) {
    startDateInput.addEventListener('change', () => {
      endDateInput.min = startDateInput.value || '';
      if (endDateInput.value && startDateInput.value && endDateInput.value < startDateInput.value) {
        endDateInput.value = startDateInput.value;
      }
    });
  }

  const resetBtn = document.getElementById('managerDeliveryResetFilters');
  if (resetBtn) {
    resetBtn.addEventListener('click', () => {
      const s = document.getElementById('managerDeliverySearch');
      const st = document.getElementById('managerDeliveryStatusFilter');
      const df = document.getElementById('managerDeliveryDateFrom');
      const dt = document.getElementById('managerDeliveryDateTo');
      const sort = document.getElementById('managerDeliverySort');
      if (s) s.value = '';
      if (st) st.value = 'all';
      if (df) df.value = '';
      if (dt) dt.value = '';
      if (sort) sort.value = 'date-desc';
      applyManagerDeliveryView();
    });
  }
}

function applyManagerDeliveryView() {
  const filterState = getManagerDeliveryFilterState();
  const filtered = filterAndSortAdminDeliveries(cachedDeliveries, filterState);
  const summaryEl = document.getElementById('managerDeliveryFilterSummary');
  if (summaryEl) {
    const allCount = (cachedDeliveries || []).length;
    summaryEl.textContent = filterState.hasActiveFilters
      ? `Showing ${filtered.length} of ${allCount} deliveries (filtered)`
      : `Showing all ${allCount} deliver${allCount === 1 ? 'y' : 'ies'}`;
  }
  renderDeliveryTableForRole(filtered, 'managerDeliveryList', '');
}

// Shared function for manager delivery list rendering
function renderDeliveryTableForRole(deliveries, tbodyId, searchTerm) {
  const tbody = document.getElementById(tbodyId);
  if (!tbody) return;
  tbody.innerHTML = '';

  let filtered = deliveries || [];
  if (searchTerm) {
    const s = searchTerm.toLowerCase();
    filtered = filtered.filter(d =>
      String(d.ref_code || '').toLowerCase().includes(s) ||
      String(d.customer_name || '').toLowerCase().includes(s) ||
      (d.address && d.address.toLowerCase().includes(s)) ||
      (d.product && d.product.toLowerCase().includes(s)) ||
      (d.status && d.status.toLowerCase().includes(s))
    );
  }

  visibleManagerDeliveryIds = filtered.map(d => Number(d.id)).filter(Boolean);

  if (filtered.length === 0) {
    tbody.innerHTML = `<tr><td colspan="11" style="text-align:center;padding:2rem;color:#9ca3af;">No deliveries found</td></tr>`;
    syncBulkSelectionUi('manager');
    return;
  }

  filtered.forEach(delivery => {
    const isChecked = selectedManagerDeliveryIds.has(Number(delivery.id));
    const normStatus = normalizeDeliveryStatus(delivery.status);
    const row = document.createElement('tr');
    if (isChecked) row.className = 'kd-row-selected';
    row.innerHTML = `
      <td style="text-align:center;">
        <input type="checkbox" class="delivery-row-checkbox" data-role="manager" data-delivery-id="${delivery.id}" ${isChecked ? 'checked' : ''} onchange="toggleDeliverySelection(${delivery.id}, this.checked, 'manager')" aria-label="Select delivery ${escapeDeliveryHtml(delivery.ref_code)}">
      </td>
      <td><button class="action-btn edit" onclick="openSmsModal(${delivery.id})" style="color:#2563eb;border-color:#2563eb;" title="Send SMS"><svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"></path></svg> Send SMS</button></td>
      <td><strong>${escapeDeliveryHtml(delivery.ref_code)}</strong></td>
      <td>${escapeDeliveryHtml(delivery.customer_name)}</td>
      <td>${escapeDeliveryHtml(delivery.contact_number || 'N/A')}</td>
      <td style="max-width:200px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;" title="${escapeDeliveryHtml(delivery.address)}">${escapeDeliveryHtml(delivery.address)}</td>
      <td>${escapeDeliveryHtml(delivery.product || 'N/A')}${delivery.quantity && delivery.quantity > 1 ? ` <span style="font-weight:600;color:#6b7280;font-size:0.8125rem;">(×${delivery.quantity})</span>` : ''}${delivery.amount ? `<div style="font-size:0.75rem;color:#16a34a;font-weight:600;">₱${Number(delivery.amount).toLocaleString('en-US', { minimumFractionDigits: 2 })}</div>` : ''}</td>
      <td>${delivery.assigned_driver_name ? `<span style="font-weight:600;color:#1e40af;">${escapeDeliveryHtml(delivery.assigned_driver_name)}</span>` : '<span style="color:#9ca3af;font-size:0.8rem;">Unassigned</span>'}</td>
      <td>${renderDeliveryDateCell(delivery)}</td>
      <td>${getStatusBadge(delivery.status, delivery)}</td>
      <td>
        <select class="status-select" data-delivery-id="${delivery.id}" style="padding:0.375rem 0.75rem;border:2px solid #e5e7eb;border-radius:0.375rem;font-size:0.875rem;cursor:pointer;">
          <option value="Pending" ${normStatus === 'Pending' ? 'selected' : ''}>Pending</option>
          <option value="Processing" ${normStatus === 'Processing' ? 'selected' : ''}>Processing</option>
          <option value="In Transit" ${normStatus === 'In Transit' ? 'selected' : ''}>In Transit</option>
          ${normStatus === 'Delivered' ? '<option value="Delivered" selected disabled>Delivered (Locked)</option>' : ''}
        </select>
        <button class="action-btn edit" onclick="updateDeliveryStatus(${delivery.id})" style="margin-left:0.5rem;" title="Update Status" ${normStatus === 'Delivered' ? 'disabled style="opacity:0.4;cursor:not-allowed;"' : ''}>
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
  syncBulkSelectionUi('manager');
}

export async function loadManagerDeliveryList() {
  try {
    initManagerDeliveryControls();
    const result = await API.getDeliveries();
    if (result.success) {
      cachedDeliveries = (Array.isArray(result.data) ? result.data : []).map(mergeLocalDeliveryWindow);
      applyManagerDeliveryView();
      loadDeliveryStats();
    }
  } catch (error) {
    showToast('Failed to load deliveries', 'error');
    const tbody = document.getElementById('managerDeliveryList');
    if (tbody) tbody.innerHTML = '<tr><td colspan="11" style="text-align:center;color:#ef4444;">❌ Failed to load deliveries</td></tr>';
  }
}

function getStatusBadge(status, itemOrDate) {
  const norm = normalizeDeliveryStatus(status);
  const styleMap = {
    'Delivered': 'background:#d1fae5;color:#065f46;border:1px solid #a7f3d0;',
    'In Transit': 'background:#dbeafe;color:#1e40af;border:1px solid #bfdbfe;',
    'Processing': 'background:#fef3c7;color:#92400e;border:1px solid #fde68a;',
    'Pending': 'background:#ffedd5;color:#9a3412;border:1px solid #fed7aa;'
  };
  const badgeStyle = styleMap[norm] || 'background:#f3f4f6;color:#374151;';
  const recordObj = itemOrDate && typeof itemOrDate === 'object'
    ? itemOrDate
    : (itemOrDate ? { status: norm, delivery_date: itemOrDate } : null);
  const overdue = recordObj && isDeliveryOverdue(recordObj);
  const overdueBadge = overdue
    ? ' <span class="status-badge" style="background:#fee2e2;color:#991b1b;border:1px solid #fecaca;font-size:0.7rem;margin-left:0.25rem;" title="Scheduled delivery window has passed">Overdue</span>'
    : '';
  return `<span class="status-badge" style="${badgeStyle}">${escapeDeliveryHtml(norm)}</span>${overdueBadge}`;
}

function getTypeBadge(type) {
  const t = type || 'N/A';
  return `<span style="color:#4b5563;font-size:0.875rem;font-weight:500;">${escapeDeliveryHtml(t)}</span>`;
}

export async function populateDriverDropdown(selectEl, selectedId) {
  if (!selectEl) return;
  selectEl.innerHTML = '<option value="">Unassigned</option>';
  try {
    const res = await API.getDrivers();
    if (res && res.success && Array.isArray(res.data)) {
      res.data.forEach(d => {
        const opt = document.createElement('option');
        opt.value = d.id;
        opt.textContent = `${d.name} (${d.email})`;
        if (selectedId && String(selectedId) === String(d.id)) opt.selected = true;
        selectEl.appendChild(opt);
      });
    }
  } catch (e) { /* non-critical */ }
}

const deliveryInventoryItems = {};

export async function loadDeliveryProductOptions(selectedId = null, selectedName = null) {
  const select = document.getElementById('deliveryProduct');
  const qtyInput = document.getElementById('deliveryQuantity');
  const amountInput = document.getElementById('deliveryAmount');
  const hintEl = document.getElementById('deliveryProductHint');
  if (!select) return;

  function updateDeliveryAmount() {
    if (!select || !qtyInput || !amountInput) return;
    const invId = select.value;
    const item = deliveryInventoryItems[invId];
    const qty = parseInt(qtyInput.value, 10) || 0;
    if (!item) {
      if (amountInput) amountInput.value = '';
      if (hintEl) hintEl.textContent = '';
      return;
    }
    const unitPrice = parseFloat(item.price) || 0;
    const total = Math.round(unitPrice * qty * 100) / 100;
    amountInput.value = total > 0 ? total.toFixed(2) : '0.00';
    if (hintEl) {
      const stock = parseInt(item.quantity, 10) || 0;
      hintEl.textContent = `Unit Price: ₱${unitPrice.toLocaleString('en-US', { minimumFractionDigits: 2 })} | Available Stock: ${stock} unit(s)`;
      if (qty > stock) {
        hintEl.style.color = '#dc2626';
        hintEl.textContent += ' ⚠️ Warning: Quantity exceeds available stock!';
      } else {
        hintEl.style.color = '#6b7280';
      }
    }
  }

  if (!select.dataset.deliveryBound) {
    select.addEventListener('change', updateDeliveryAmount);
    if (qtyInput) qtyInput.addEventListener('input', updateDeliveryAmount);
    select.dataset.deliveryBound = '1';
  }

  select.disabled = true;
  select.innerHTML = '<option value="">Loading inventory items...</option>';

  try {
    const result = await API.getInventory();
    if (!result || !result.success || !Array.isArray(result.data)) throw new Error('Failed to load inventory');
    const items = result.data.slice().sort((a, b) => String(a.name).localeCompare(String(b.name)));
    select.innerHTML = '';
    const placeholder = document.createElement('option');
    placeholder.value = '';
    placeholder.textContent = items.length ? 'Select an available inventory item' : 'No inventory items available';
    select.appendChild(placeholder);

    items.forEach(item => {
      deliveryInventoryItems[item.id] = item;
      const stock = parseInt(item.quantity, 10) || 0;
      const opt = document.createElement('option');
      opt.value = String(item.id);
      opt.dataset.name = item.name;
      opt.dataset.price = item.price || 0;
      opt.dataset.stock = stock;
      opt.textContent = `${item.name}${item.item_code ? ' (' + item.item_code + ')' : ''} — ${stock > 0 ? stock + ' in stock' : 'Out of stock'}`;
      if (stock <= 0 && (!selectedId || String(selectedId) !== String(item.id))) {
        opt.disabled = true;
      }
      select.appendChild(opt);
    });

    select.disabled = false;
    if (selectedId && deliveryInventoryItems[selectedId]) {
      select.value = String(selectedId);
    } else if (selectedName) {
      const found = items.find(it => it.name.trim().toLowerCase() === selectedName.trim().toLowerCase());
      if (found) select.value = String(found.id);
      else select.value = '';
    } else {
      select.value = '';
    }
    updateDeliveryAmount();
  } catch (err) {
    console.error('Error loading delivery inventory:', err);
    select.innerHTML = '<option value="">Unable to load inventory items</option>';
    select.disabled = false;
  }
}

export function openAddDeliveryModal() {
  editingDeliveryId = null;
  document.getElementById('deliveryModalTitle').textContent = 'Add New Delivery';
  document.getElementById('deliveryForm').reset();
  const endEl = document.getElementById('deliveryEndDate');
  if (endEl) { endEl.value = ''; endEl.min = ''; }
  const driverSelect = document.getElementById('deliveryDriverSelect');
  if (driverSelect) populateDriverDropdown(driverSelect, '');
  const qtyEl = document.getElementById('deliveryQuantity');
  if (qtyEl) qtyEl.value = 1;
  const amtEl = document.getElementById('deliveryAmount');
  if (amtEl) amtEl.value = '';
  loadDeliveryProductOptions();
  showModal('deliveryModal');
}

export async function handleDeliverySubmit(event) {
  event.preventDefault();
  const startDate = document.getElementById('deliveryDate').value || null;
  const endEl = document.getElementById('deliveryEndDate');
  const endDate = endEl && endEl.value ? endEl.value : null;

  if (endDate && !startDate) {
    showToast('Please select a Delivery Start Date before setting a Delivery End Date.', 'warning');
    return;
  }
  if (startDate && endDate && endDate < startDate) {
    showToast('Delivery End Date cannot be earlier than the Delivery Start Date.', 'error');
    return;
  }

  const normalizedEnd = startDate && endDate && endDate > startDate ? endDate : null;
  const statusVal = document.getElementById('deliveryStatus').value;
  if (statusVal === 'Delivered') {
    showToast('New deliveries cannot be created with Delivered status. Only Delivery Drivers mark completion.', 'warning');
    return;
  }

  const driverSelect = document.getElementById('deliveryDriverSelect');
  const assignedDriverId = driverSelect && driverSelect.value ? driverSelect.value : null;
  const assignedDriverName = driverSelect && driverSelect.value && driverSelect.selectedIndex >= 0
    ? driverSelect.options[driverSelect.selectedIndex].text.split(' (')[0].trim()
    : null;

  const productSelect = document.getElementById('deliveryProduct');
  const inventoryId = productSelect && productSelect.value ? parseInt(productSelect.value, 10) : null;
  const selectedOption = productSelect && productSelect.selectedIndex >= 0 ? productSelect.options[productSelect.selectedIndex] : null;
  const productName = selectedOption && selectedOption.dataset.name ? selectedOption.dataset.name : (productSelect ? productSelect.value : '');
  const quantity = parseInt(document.getElementById('deliveryQuantity').value, 10) || 1;
  const amountVal = document.getElementById('deliveryAmount') && document.getElementById('deliveryAmount').value ? parseFloat(document.getElementById('deliveryAmount').value) : null;

  if (!productName || !inventoryId) {
    showToast('Please select an available product from the inventory list.', 'warning');
    return;
  }
  if (!quantity || quantity <= 0) {
    showToast('Quantity must be a positive number.', 'warning');
    return;
  }

  const data = {
    customer_name: document.getElementById('deliveryCustomer').value,
    contact_number: document.getElementById('deliveryContactNumber').value,
    address: document.getElementById('deliveryAddress').value,
    inventory_id: inventoryId,
    product: productName,
    quantity: quantity,
    amount: amountVal,
    status: statusVal,
    delivery_type: document.getElementById('deliveryType').value,
    delivery_date: startDate,
    delivery_end_date: normalizedEnd,
    assigned_driver_id: assignedDriverId,
    assigned_driver_name: assignedDriverName
  };
  try {
    const result = editingDeliveryId ? await API.updateDelivery(editingDeliveryId, data) : await kdCreateOnce('delivery-create', data, API.createDelivery);
    if (result.success) {
      const targetId = editingDeliveryId || result.id;
      const nowIso = new Date().toISOString();
      writeLocalDeliveryWindow(targetId, result.ref_code, {
        delivery_date: startDate,
        delivery_end_date: normalizedEnd,
        delivered_at: null,
        status_updated_at: nowIso,
        assigned_driver_id: assignedDriverId,
        assigned_driver_name: assignedDriverName
      });
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

export async function editDelivery(id) {
  try {
    const result = await API.getDeliveries();
    if (result.success) {
      const rawItem = result.data.find(d => d.id === id);
      if (!rawItem) { showToast('Delivery not found', 'error'); return; }
      const item = mergeLocalDeliveryWindow(rawItem);
      editingDeliveryId = id;
      document.getElementById('deliveryModalTitle').textContent = 'Update Delivery';
      document.getElementById('deliveryCustomer').value = item.customer_name;
      document.getElementById('deliveryContactNumber').value = item.contact_number || '';
      document.getElementById('deliveryAddress').value = item.address;
      document.getElementById('deliveryStatus').value = item.status;
      document.getElementById('deliveryType').value = item.delivery_type || 'Outbound';
      const qtyEl = document.getElementById('deliveryQuantity');
      if (qtyEl) qtyEl.value = item.quantity || 1;
      const amtEl = document.getElementById('deliveryAmount');
      if (amtEl && item.amount) amtEl.value = Number(item.amount).toFixed(2);
      await loadDeliveryProductOptions(item.inventory_id, item.product);

      const startVal = item.delivery_date ? item.delivery_date.split('T')[0] : '';
      const endVal = item.delivery_end_date ? String(item.delivery_end_date).split('T')[0] : '';
      document.getElementById('deliveryDate').value = startVal;
      const endEl = document.getElementById('deliveryEndDate');
      if (endEl) {
        endEl.min = startVal || '';
        endEl.value = endVal && endVal > startVal ? endVal : '';
      }
      const driverSelect = document.getElementById('deliveryDriverSelect');
      if (driverSelect) await populateDriverDropdown(driverSelect, item.assigned_driver_id);
      showModal('deliveryModal');
    } else {
      showToast('❌ ' + (result.message || 'Failed to load delivery details'), 'error');
    }
  } catch (error) { showToast('❌ Failed to load delivery details', 'error'); }
}

export async function deleteDelivery(id) {
  if (!(await kdConfirm('Are you sure you want to delete this delivery?', { title: 'Delete Delivery' }))) return;
  try {
    const result = await API.deleteDelivery(id);
    if (result.success) {
      selectedAdminDeliveryIds.delete(Number(id));
      selectedManagerDeliveryIds.delete(Number(id));
      showToast(result.message, 'success');
      loadDeliveryList();
      loadDeliveryStats();
    }
    else showToast('❌ ' + result.message, 'error');
  } catch (error) { showToast('❌ Failed to delete delivery', 'error'); }
}

export async function updateDeliveryStatus(deliveryId) {
  const selectElement = document.querySelector(`.status-select[data-delivery-id="${deliveryId}"]`);
  if (!selectElement) { showToast('Error: Could not find status selector', 'error'); return; }
  const newStatus = selectElement.value;
  if (newStatus === 'Delivered') {
    showToast('Only delivery drivers can mark a delivery as Delivered.', 'warning');
    return;
  }
  try {
    const result = await API.updateDeliveryStatus(deliveryId, newStatus);
    if (result.success) {
      const rec = (cachedDeliveries || []).find(d => Number(d.id) === Number(deliveryId));
      const nowIso = new Date().toISOString();
      writeLocalDeliveryWindow(deliveryId, rec && rec.ref_code, {
        delivered_at: null,
        status_updated_at: nowIso
      });
      showToast('✓ Delivery status updated successfully', 'success');
      if (window.location.pathname.includes('manager')) loadManagerDeliveryList();
      else { loadDeliveryList(); loadDeliveryStats(); }
    } else showToast('❌ ' + result.message, 'error');
  } catch (error) { showToast('❌ Failed to update status', 'error'); }
}

// =============================================================================
// DELIVERY DRIVER DASHBOARD LOGIC
// Dedicated workflow for delivery drivers: view assigned deliveries & mark as Delivered
// =============================================================================
let driverDeliveriesCache = [];
let driverDeliveryControlsInitialized = false;

export function getDriverDeliveryFilterState() {
  const s = document.getElementById('driverDeliverySearch');
  const sf = document.getElementById('driverDeliveryStatusFilter');
  const df = document.getElementById('driverDeliveryDateFrom');
  const dt = document.getElementById('driverDeliveryDateTo');
  const sort = document.getElementById('driverDeliverySort');

  const search = s ? s.value.trim().toLowerCase() : '';
  const statusFilter = sf ? sf.value : 'In Transit';
  const dateFrom = df ? df.value : '';
  const dateTo = dt ? dt.value : '';
  const sortBy = sort ? sort.value : 'date-desc';
  const hasActiveFilters = Boolean(search || (statusFilter && statusFilter !== 'all') || dateFrom || dateTo);

  return { search, statusFilter, dateFrom, dateTo, sortBy, hasActiveFilters };
}

export function filterAndSortDriverDeliveries(deliveries, filterState) {
  const { search, statusFilter, dateFrom, dateTo, sortBy } = filterState;

  const filtered = (deliveries || []).filter(item => {
    const norm = normalizeDeliveryStatus(item.status);
    if (statusFilter && statusFilter !== 'all') {
      if (norm.toLowerCase() !== statusFilter.toLowerCase()) return false;
    }
    const appDate = getApplicableDeliveryDate(item);
    const dateKey = toDeliveryDateKey(appDate || item.delivery_date || item.created_at);
    if (dateFrom && (!dateKey || dateKey < dateFrom)) return false;
    if (dateTo && (!dateKey || dateKey > dateTo)) return false;
    if (search) {
      const ref = String(item.ref_code || '').toLowerCase();
      const cust = String(item.customer_name || '').toLowerCase();
      const prod = String(item.product || '').toLowerCase();
      const addr = String(item.address || '').toLowerCase();
      if (!ref.includes(search) && !cust.includes(search) && !prod.includes(search) && !addr.includes(search)) return false;
    }
    return true;
  });

  return [...filtered].sort((a, b) => {
    if (sortBy === 'date-asc' || sortBy === 'date-desc') {
      const da = toDeliveryDateKey(getApplicableDeliveryDate(a) || a.delivery_date || a.created_at);
      const db = toDeliveryDateKey(getApplicableDeliveryDate(b) || b.delivery_date || b.created_at);
      if (da !== db) return sortBy === 'date-asc' ? da.localeCompare(db) : db.localeCompare(da);
      return sortBy === 'date-asc' ? (Number(a.id) - Number(b.id)) : (Number(b.id) - Number(a.id));
    }
    if (sortBy === 'customer-asc' || sortBy === 'customer-desc') {
      const ca = String(a.customer_name || '');
      const cb = String(b.customer_name || '');
      const cmp = ca.localeCompare(cb, undefined, { sensitivity: 'base' });
      return sortBy === 'customer-asc' ? cmp : -cmp;
    }
    if (sortBy === 'status-asc') {
      const priority = { 'In Transit': 1, 'Processing': 2, 'Pending': 3, 'Delivered': 4 };
      const pa = priority[normalizeDeliveryStatus(a.status)] || 9;
      const pb = priority[normalizeDeliveryStatus(b.status)] || 9;
      return pa - pb;
    }
    return Number(b.id) - Number(a.id);
  });
}

export function updateDriverDeliveryMetrics(allDeliveries) {
  const setEl = (id, count) => { const el = document.getElementById(id); if (el) el.textContent = String(count); };
  const all = allDeliveries || [];
  const total = all.length;
  let inTransit = 0;
  let pendingProcessing = 0;
  let delivered = 0;

  all.forEach(d => {
    const s = normalizeDeliveryStatus(d.status);
    if (s === 'In Transit') inTransit++;
    else if (s === 'Delivered') delivered++;
    else pendingProcessing++;
  });

  setEl('driverTotalCount', total);
  setEl('driverInTransitCount', inTransit);
  setEl('driverPendingCount', pendingProcessing);
  setEl('driverDeliveredCount', delivered);
}

export function renderDriverDeliveryTableRows(filtered, allCount) {
  const tbody = document.getElementById('driverDeliveryList');
  if (!tbody) return;
  tbody.innerHTML = '';

  const summaryEl = document.getElementById('driverDeliveryFilterSummary');
  if (summaryEl) {
    summaryEl.textContent = `Showing ${filtered.length} of ${allCount} assigned orders`;
  }

  if (!filtered || filtered.length === 0) {
    const msg = allCount > 0 ? 'No assigned deliveries match your filter.' : 'No deliveries currently assigned to your account.';
    tbody.innerHTML = `<tr><td colspan="8" style="text-align:center;color:#6b7280;padding:2rem;">${msg}</td></tr>`;
    return;
  }

  filtered.forEach(item => {
    const norm = normalizeDeliveryStatus(item.status);
    const phoneDisplay = item.contact_number
      ? `<a href="tel:${escapeDeliveryHtml(item.contact_number)}" style="color:#2563eb;text-decoration:underline;font-weight:500;">${escapeDeliveryHtml(item.contact_number)}</a>`
      : '<span style="color:#9ca3af;">N/A</span>';

    let actionHtml = '';
    if (norm === 'In Transit') {
      actionHtml = `
        <button type="button" class="action-btn deliver-btn" onclick="markDeliveryAsDelivered('${item.id}')" title="Mark as Delivered">
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><polyline points="20 6 9 17 4 12"></polyline></svg>
          Mark as Delivered
        </button>
      `;
    } else if (norm === 'Delivered') {
      actionHtml = `<span style="color:#059669;font-weight:600;font-size:0.875rem;display:inline-flex;align-items:center;gap:0.3rem;"><svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"></path><polyline points="22 4 12 14.01 9 11.01"></polyline></svg> Delivered</span>`;
    } else {
      actionHtml = `<span style="color:#6b7280;font-size:0.8125rem;">Awaiting Transit</span>`;
    }

    tbody.innerHTML += `
      <tr>
        <td><strong>${escapeDeliveryHtml(item.ref_code)}</strong></td>
        <td>${escapeDeliveryHtml(item.customer_name)}</td>
        <td>${phoneDisplay}</td>
        <td style="max-width:220px;white-space:normal;font-size:0.8125rem;">${escapeDeliveryHtml(item.address)}</td>
        <td>${escapeDeliveryHtml(item.product || 'N/A')}</td>
        <td>${renderDeliveryDateCell(item)}</td>
        <td>${getStatusBadge(item.status, item)}</td>
        <td style="text-align:center;">${actionHtml}</td>
      </tr>
    `;
  });
}

export function applyDriverDeliveryView() {
  const filterState = getDriverDeliveryFilterState();
  const filtered = filterAndSortDriverDeliveries(driverDeliveriesCache, filterState);
  updateDriverDeliveryMetrics(driverDeliveriesCache);
  renderDriverDeliveryTableRows(filtered, driverDeliveriesCache.length);
}

export function initDriverDeliveryControls() {
  if (driverDeliveryControlsInitialized) return;
  const searchEl = document.getElementById('driverDeliverySearch');
  if (!searchEl) return;
  driverDeliveryControlsInitialized = true;

  const bind = (id, evt = 'change') => {
    const el = document.getElementById(id);
    if (el) el.addEventListener(evt, () => applyDriverDeliveryView());
  };

  bind('driverDeliverySearch', 'input');
  bind('driverDeliveryStatusFilter', 'change');
  bind('driverDeliveryDateFrom', 'change');
  bind('driverDeliveryDateTo', 'change');
  bind('driverDeliverySort', 'change');

  const resetBtn = document.getElementById('driverDeliveryResetFilters');
  if (resetBtn) {
    resetBtn.addEventListener('click', () => {
      const s = document.getElementById('driverDeliverySearch');
      const sf = document.getElementById('driverDeliveryStatusFilter');
      const df = document.getElementById('driverDeliveryDateFrom');
      const dt = document.getElementById('driverDeliveryDateTo');
      const sort = document.getElementById('driverDeliverySort');
      if (s) s.value = '';
      if (sf) sf.value = 'all';
      if (df) df.value = '';
      if (dt) dt.value = '';
      if (sort) sort.value = 'date-desc';
      applyDriverDeliveryView();
    });
  }
}

export async function loadDriverDeliveryList() {
  try {
    initDriverDeliveryControls();
    const result = await API.getDeliveries();
    if (result && result.success) {
      driverDeliveriesCache = (Array.isArray(result.data) ? result.data : []).map(mergeLocalDeliveryWindow);
      applyDriverDeliveryView();
    } else {
      showToast('❌ ' + ((result && result.message) || 'Failed to load assigned deliveries'), 'error');
    }
  } catch (e) {
    showToast('❌ Failed to load assigned deliveries', 'error');
  }
}

export async function markDeliveryAsDelivered(id) {
  const rec = (driverDeliveriesCache || []).find(d => String(d.id) === String(id) || Number(d.id) === Number(id));
  const ref = rec ? rec.ref_code : `#${id}`;
  const customer = rec ? ` for ${rec.customer_name}` : '';

  const confirmed = await kdConfirm(
    `Mark delivery ${ref}${customer} as Delivered?\n\nThis confirms that the furniture was successfully handed over to the customer.`,
    { title: 'Confirm Delivery Completion', confirmText: 'Confirm Delivered' }
  );
  if (!confirmed) return;

  try {
    const result = await API.updateDeliveryStatus(id, 'Delivered');
    if (result && result.success) {
      showToast('✓ Delivery marked as Delivered successfully! Sales record generated.', 'success');
      const nowIso = new Date().toISOString();
      writeLocalDeliveryWindow(id, rec && rec.ref_code, {
        delivered_at: nowIso,
        status_updated_at: nowIso
      });
      try {
        localStorage.setItem('kd_sales_updated', String(Date.now()));
      } catch (_) {}
      await loadDriverDeliveryList();
    } else {
      showToast('❌ ' + ((result && result.message) || 'Failed to update delivery status'), 'error');
    }
  } catch (error) {
    showToast('❌ Failed to mark delivery as Delivered', 'error');
  }
}


// ---- loading / duplicate-click protection (helpers live in ui.js; each function is wrapped once, here, where it is defined) ----
handleStaffDeliverySubmit = kdGuard(handleStaffDeliverySubmit, submit('Adding Delivery...', 'Saving delivery...'));
handleDeliverySubmit = kdGuard(handleDeliverySubmit, { button: 'event', progress: 'Saving delivery...', loadingText: () => (editingDeliveryId ? 'Saving...' : 'Adding Delivery...') });
handlePublicTrackDelivery = kdGuard(handlePublicTrackDelivery, { button: 'event', loadingText: 'Tracking...' });
confirmSendSms = kdGuard(confirmSendSms, { key: () => 'sendSms:' + currentSmsDeliveryId, button: '#confirmSendSmsBtn', loadingText: 'Sending SMS...', progress: 'Sending SMS...' });
deleteDelivery = kdGuard(deleteDelivery, del('delivery'));
updateDeliveryStatus = kdGuard(updateDeliveryStatus, {
    key: (id) => 'deliveryStatus:' + id,
    progress: 'Updating status...',
    disable: (id) => document.querySelector('.status-select[data-delivery-id="' + id + '"]')
  });
editDelivery = kdGuard(editDelivery, open('delivery'));
loadDeliveryList = kdWrapLoader(loadDeliveryList, { target: 'adminDeliveryList', loading: 'Loading deliveries...', empty: 'No deliveries found', error: 'Unable to load deliveries.' });
loadStaffDeliveryList = kdWrapLoader(loadStaffDeliveryList, { target: 'staffDeliveryList', loading: 'Loading deliveries...', empty: 'No deliveries found', error: 'Unable to load deliveries.' });
loadManagerDeliveryList = kdWrapLoader(loadManagerDeliveryList, { target: 'managerDeliveryList', loading: 'Loading deliveries...', empty: 'No deliveries found', error: 'Unable to load deliveries.' });
loadDeliveryStats = kdWrapBusy(loadDeliveryStats, '[id$="PendingCount"], [id$="ProcessingCount"], [id$="InTransitCount"], [id$="DeliveredCount"]');
markDeliveryAsDelivered = kdGuard(markDeliveryAsDelivered, {
  key: (id) => 'markDelivered:' + id,
  progress: 'Marking as Delivered...'
});
loadDriverDeliveryList = kdWrapLoader(loadDriverDeliveryList, {
  target: 'driverDeliveryList',
  loading: 'Loading assigned deliveries...',
  empty: 'No assigned deliveries found',
  error: 'Unable to load assigned deliveries.'
});