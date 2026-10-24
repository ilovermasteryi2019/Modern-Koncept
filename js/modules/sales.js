// =============================================================================
// K-DESK · sales.js
// sales
// Cut from the original main.js (lines 690-2863 region). Code is unchanged except where a comment says otherwise.
// =============================================================================

import { API, API_URL, formatCurrency, formatDate } from './core.js';
import { hideModal, kdConfirm, kdDeleteOptions as del, kdGuard, kdOpenOptions as open, kdWrapBusy, kdWrapLoader, showModal, showToast } from './ui.js';
import { getInventoryUnitPrice, loadInventoryList, loadManagerInventoryList, loadStaffInventoryList } from './inventory.js';

// Global chart instances
let revenueBarChartInstance = null;

let salesLineChartInstance = null;

// =============================================================================
// SALES RECORDS
// =============================================================================
export async function loadSalesList() {
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

export async function loadSalesAnalytics() {
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

export async function loadStaffSalesList() {
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

export async function loadManagerSalesList() {
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
            <td>${formatSaleProduct(item)}</td>
            <td>${formatCurrency(item.amount)}</td>
            <td><button class="action-btn edit" onclick="editManagerSalesRecord(${item.id})" title="Edit"><svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"></path><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"></path></svg> Edit</button></td>
          </tr>`;
      });
    }
  } catch (error) { showToast('❌ Failed to load sales records', 'error'); }
}

export async function editStaffSalesRecord(id) {
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

export async function editManagerSalesRecord(id) {
  await openSalesEditForm(id, {
    idField: 'managerEditSalesId',
    customer: 'managerEditSalesCustomer',
    product: 'managerEditSalesProduct',
    quantity: 'managerEditSalesQuantity',
    amount: 'managerEditSalesAmount',
    date: 'managerEditSalesDate',
    modal: 'managerEditSalesModal'
  });
}

export async function loadStaffSalesAnalytics() {
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

export async function loadManagerSalesAnalytics() {
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
  editSalesProduct: 'editSalesQuantity',
  managerSalesProduct: 'managerSalesQuantity',
  managerEditSalesProduct: 'managerEditSalesQuantity'
};

// Product dropdown -> { quantity input, amount input }.
// Amount = the inventory item's price x quantity (Admin, Manager and Staff). The Amount field is
// read-only; the server recomputes the same value from the inventory price when the sale is saved.
const SALES_AMOUNT_FIELDS = {
  salesProductName: { qty: 'salesQuantity', amount: 'salesAmount' },
  salesProduct: { qty: 'salesQuantity', amount: 'salesAmount' },
  editAdminSalesProduct: { qty: 'editAdminSalesQuantity', amount: 'editAdminSalesAmount' },
  editSalesProduct: { qty: 'editSalesQuantity', amount: 'editSalesAmount' },
  managerSalesProduct: { qty: 'managerSalesQuantity', amount: 'managerSalesAmount' },
  managerEditSalesProduct: { qty: 'managerEditSalesQuantity', amount: 'managerEditSalesAmount' }
};

function setSalesAmountLocked(amountEl, locked) {
  amountEl.readOnly = locked;
  amountEl.style.backgroundColor = locked ? '#f3f4f6' : '';
  amountEl.style.cursor = locked ? 'not-allowed' : '';
}

function applySalesAutoAmount(selectId) {
  const fields = SALES_AMOUNT_FIELDS[selectId];
  const select = document.getElementById(selectId);
  const amountEl = fields ? document.getElementById(fields.amount) : null;
  if (!fields || !select || !amountEl) return;
  // Older record that is not linked to an inventory item: keep its amount editable, as before
  if (select.value === '__keep__') { setSalesAmountLocked(amountEl, false); return; }
  setSalesAmountLocked(amountEl, true);
  const item = (salesInventoryItems[selectId] || {})[select.value];
  if (!item) { amountEl.value = ''; return; }
  updateSalesStockHint(selectId); // refresh the stock hint, then add the price note below
  const hint = document.getElementById(selectId + 'Hint');
  const addHint = (text) => { if (hint) hint.textContent = (hint.textContent ? hint.textContent + ' · ' : '') + text; };
  const price = getInventoryUnitPrice(item);
  if (!price) {
    amountEl.value = '';
    addHint('No price set for this item. Ask the Admin or Manager to add it in Inventory.');
    return;
  }
  const qty = Number(document.getElementById(fields.qty).value);
  amountEl.value = Number.isInteger(qty) && qty >= 1 ? (price * qty).toFixed(2) : '';
  addHint(`Price: ${formatCurrency(price)} each`);
}

const salesInventoryItems = {};

 // selectId -> { inventoryId: item } (used for the stock hint)
const saleRequestIds = {};

      // 'admin' | 'staff' -> id that stops duplicate submissions
const saleSubmitting = {};

      // formId -> true while a request is in flight

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
export async function loadSalesProductOptions(selectId, opts = {}) {
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
  const amountFields = SALES_AMOUNT_FIELDS[selectId];
  if (amountFields && !select.dataset.amountBound) {
    const qtyInput = document.getElementById(amountFields.qty);
    select.addEventListener('change', () => applySalesAutoAmount(selectId));
    if (qtyInput) qtyInput.addEventListener('input', () => applySalesAutoAmount(selectId));
    select.dataset.amountBound = '1';
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
    applySalesAutoAmount(selectId);
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

export function openAddSalesModal() {
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
  const chosenItem = (salesInventoryItems[cfg.productId] || {})[inventoryId];
  if (!getInventoryUnitPrice(chosenItem)) { showToast('This item has no price yet. Ask the Admin or Manager to set its price in Inventory.', 'warning'); return; }
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

export function handleSalesSubmit(event) {
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

export function handleStaffSalesSubmit(event) {
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
    if (!result.success) { showToast('❌ ' + (result.message || 'Failed to load sales record'), 'error'); return; }
    const record = result.data.find(item => item.id === id);
    if (!record) { showToast('Sales record not found', 'error'); return; }
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

export async function submitSalesEdit(cfg) {
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
    if (!getInventoryUnitPrice((salesInventoryItems[cfg.productId] || {})[inventoryId])) { showToast('This item has no price yet. Ask the Admin or Manager to set its price in Inventory.', 'warning'); return; }
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

// Manager "add sale": same inventory dropdown + atomic stock deduction as Admin and Staff
export function handleManagerSalesSubmit(event) {
  event.preventDefault();
  return submitNewSale({
    key: 'manager',
    formId: 'managerSalesForm',
    customerId: 'managerSalesCustomer',
    productId: 'managerSalesProduct',
    quantityId: 'managerSalesQuantity',
    amountId: 'managerSalesAmount',
    dateId: 'managerSalesDate',
    onSuccess: async () => {
      document.getElementById('managerSalesForm').reset();
      await Promise.all([loadSalesProductOptions('managerSalesProduct'), loadManagerSalesList(), loadManagerSalesAnalytics(), loadManagerInventoryList()]);
    }
  });
}

export async function deleteSales(id) {
  if (!(await kdConfirm('Are you sure you want to delete this sales record?', { title: 'Delete Sales Record' }))) return;
  try {
    const result = await API.deleteSales(id);
    if (result.success) { showToast('✅ ' + result.message, 'success'); loadSalesList(); loadSalesAnalytics(); loadInventoryList(); }
    else showToast('❌ ' + result.message, 'error');
  } catch (error) { showToast('❌ Failed to delete sales record', 'error'); }
}

export async function editAdminSalesRecord(id) {
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


// ---- loading / duplicate-click protection (helpers live in ui.js; each function is wrapped once, here, where it is defined) ----
const saleButton = (cfg) => { const f = document.getElementById(cfg.formId); return f ? f.querySelector('button[type="submit"]') : null; };
submitNewSale = kdGuard(submitNewSale, { key: (cfg) => 'sale:' + cfg.formId, button: saleButton, loadingText: 'Saving...', progress: 'Saving sales record...' });
submitSalesEdit = kdGuard(submitSalesEdit, { key: (cfg) => 'saleEdit:' + cfg.formId, button: saleButton, loadingText: 'Saving...', progress: 'Saving changes...' });
deleteSales = kdGuard(deleteSales, del('sales'));
openSalesEditForm = kdGuard(openSalesEditForm, open('sales'));
loadSalesList = kdWrapLoader(loadSalesList, { target: 'adminSalesList', loading: 'Loading sales records...', empty: 'No sales records found', error: 'Unable to load sales records.' });
loadStaffSalesList = kdWrapLoader(loadStaffSalesList, { target: 'staffSalesList', loading: 'Loading sales records...', empty: 'No sales records found', error: 'Unable to load sales records.' });
loadManagerSalesList = kdWrapLoader(loadManagerSalesList, { target: 'managerSalesList', loading: 'Loading sales records...', empty: 'No sales records found', error: 'Unable to load sales records.' });
loadSalesAnalytics = kdWrapBusy(loadSalesAnalytics, '#totalSales, #totalRecords, #averageSale, #revenueBarChart, #salesLineChart');
loadStaffSalesAnalytics = kdWrapBusy(loadStaffSalesAnalytics, '#staffTotalSales, #staffTotalRecords, #staffAverageSale');
loadManagerSalesAnalytics = kdWrapBusy(loadManagerSalesAnalytics, '#managerTotalSales, #managerTotalRecords, #managerAverageSale');