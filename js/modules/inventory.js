// =============================================================================
// K-DESK · inventory.js
// inventory
// Cut from the original main.js (lines 1796-3386 region). Code is unchanged except where a comment says otherwise.
// =============================================================================

import { API, fileToBase64, formatCurrency, formatDateTime } from './core.js';
import { hideModal, kdArchiveOptions as archiveOpt, kdConfirm, kdDeleteOptions as del, kdFormOptions as submit, kdGuard, kdOpenOptions as open, kdRestoreOptions as restoreOpt, kdWrapLoader, showModal, showToast } from './ui.js';
import { loadFurnitureList } from './furniture.js';

// =============================================================================
// ADMIN MODULE - INVENTORY MANAGEMENT
// =============================================================================
let editingInventoryId = null;

let currentStockImage = null;

// Pagination configuration (10 records per page across all dashboards)
export const INVENTORY_PAGE_SIZE = 10;

let adminActiveInventoryPage = 1;
let adminArchivedInventoryPage = 1;
let managerActiveInventoryPage = 1;
let managerArchivedInventoryPage = 1;
let staffActiveInventoryPage = 1;
let staffArchivedInventoryPage = 1;

let adminActiveSearchLast = '';
let adminActiveCategoryLast = 'all';
let adminActiveStatusLast = 'all';

let adminArchivedSearchLast = '';
let adminArchivedCategoryLast = 'all';

let managerActiveSearchLast = '';
let managerActiveCategoryLast = 'all';
let managerActiveStatusLast = 'all';

let managerArchivedSearchLast = '';
let managerArchivedCategoryLast = 'all';

let staffActiveSearchLast = '';
let staffActiveCategoryLast = 'all';
let staffActiveStatusLast = 'all';

let staffArchivedSearchLast = '';
let staffArchivedCategoryLast = 'all';

/**
 * Reusable inventory pagination controls renderer
 * Handles info range, active page highlight, prev/next disable, page buttons, and callbacks.
 * Does not display unnecessary pagination controls when there is only one page.
 */
export function renderInventoryPagination({ containerId, totalItems, currentPage, pageSize = INVENTORY_PAGE_SIZE, onPageChange }) {
  const container = document.getElementById(containerId);
  if (!container) return;

  if (!totalItems || totalItems <= 0) {
    container.innerHTML = '';
    container.style.display = 'none';
    return;
  }

  const totalPages = Math.max(1, Math.ceil(totalItems / pageSize));
  const validPage = Math.min(Math.max(1, currentPage || 1), totalPages);

  const startRecord = (validPage - 1) * pageSize + 1;
  const endRecord = Math.min(validPage * pageSize, totalItems);
  const rangeInfo = totalItems === 1
    ? 'Showing 1 of 1 record'
    : `Showing ${startRecord}–${endRecord} of ${totalItems} records`;

  container.style.display = 'flex';

  // Do not display unnecessary pagination controls when there is only one page.
  if (totalPages <= 1) {
    container.innerHTML = `<div class="kd-pagination-info">${rangeInfo}</div>`;
    return;
  }

  // Generate pagination buttons for multi-page lists
  let pageButtonsHtml = '';
  if (totalPages <= 7) {
    for (let p = 1; p <= totalPages; p++) {
      const isActive = p === validPage;
      pageButtonsHtml += `<button type="button" class="kd-page-btn kd-page-num ${isActive ? 'active' : ''}" data-page="${p}" ${isActive ? 'aria-current="page"' : ''} aria-label="Page ${p}">${p}</button>`;
    }
  } else {
    // Windowed pages
    let pageNumbers = [];
    if (validPage <= 4) {
      pageNumbers = [1, 2, 3, 4, 5, '...', totalPages];
    } else if (validPage >= totalPages - 3) {
      pageNumbers = [1, '...', totalPages - 4, totalPages - 3, totalPages - 2, totalPages - 1, totalPages];
    } else {
      pageNumbers = [1, '...', validPage - 1, validPage, validPage + 1, '...', totalPages];
    }

    pageNumbers.forEach(p => {
      if (p === '...') {
        pageButtonsHtml += `<span class="kd-page-ellipsis" aria-hidden="true">…</span>`;
      } else {
        const isActive = p === validPage;
        pageButtonsHtml += `<button type="button" class="kd-page-btn kd-page-num ${isActive ? 'active' : ''}" data-page="${p}" ${isActive ? 'aria-current="page"' : ''} aria-label="Page ${p}">${p}</button>`;
      }
    });
  }

  const prevDisabled = validPage === 1 ? 'disabled' : '';
  const nextDisabled = validPage === totalPages ? 'disabled' : '';

  container.innerHTML = `
    <div class="kd-pagination-info">${rangeInfo} (Page ${validPage} of ${totalPages})</div>
    <div class="kd-pagination-controls" role="navigation" aria-label="Inventory Pagination">
      <button type="button" class="kd-page-btn kd-page-prev" ${prevDisabled} aria-label="Previous Page">Previous</button>
      ${pageButtonsHtml}
      <button type="button" class="kd-page-btn kd-page-next" ${nextDisabled} aria-label="Next Page">Next</button>
    </div>
  `;

  container.onclick = (e) => {
    const btn = e.target.closest('.kd-page-btn');
    if (!btn || btn.disabled) return;
    if (btn.classList.contains('kd-page-prev')) {
      if (validPage > 1 && typeof onPageChange === 'function') onPageChange(validPage - 1);
    } else if (btn.classList.contains('kd-page-next')) {
      if (validPage < totalPages && typeof onPageChange === 'function') onPageChange(validPage + 1);
    } else if (btn.dataset.page) {
      const targetPage = parseInt(btn.dataset.page, 10);
      if (!isNaN(targetPage) && targetPage !== validPage && typeof onPageChange === 'function') {
        onPageChange(targetPage);
      }
    }
  };
}

// Admin inventory search / filter (same pattern as Furniture Management: keep the last loaded list and filter it in the browser)
let adminInventoryItems = [];

// Same rule the table already uses for the Status column
function inventoryStockStatus(item) {
  return item.quantity > 10 ? 'in-stock' : 'low-stock';
}

export async function loadInventoryList() {
  try {
    const result = await API.getInventory();
    if (result.success) {
      const tbody = document.getElementById('adminInventoryList');
      if (!tbody) return;
      adminInventoryItems = result.data || [];
      refreshInventoryCategoryOptions(adminInventoryItems);
      filterAdminInventoryList(); // re-applies the active search / filters after every load or refresh
    }
  } catch (error) { showToast('❌ Failed to load inventory', 'error'); }
}

function renderAdminInventoryTable(items, totalFilteredCount = items.length) {
  const tbody = document.getElementById('adminInventoryList');
  if (!tbody) return;
  tbody.innerHTML = '';
  if (adminInventoryItems.length === 0) {
    tbody.innerHTML = '<tr><td colspan="9" style="text-align:center;color:#9ca3af;padding:2rem;">No inventory items found</td></tr>';
    return;
  }
  if (totalFilteredCount === 0 || items.length === 0) {
    tbody.innerHTML = '<tr class="no-data-row"><td colspan="9" style="text-align:center;color:#9ca3af;padding:2rem;">No inventory items match your search or filters.</td></tr>';
    return;
  }
  items.forEach(item => {
    const status = inventoryStockStatus(item);
    const statusText = status === 'in-stock' ? 'In Stock' : 'Low Stock';
    const safeName = (item.name || '').replace(/"/g, '&quot;');
    const qtyVal = Number(item.quantity) || 0;
    const isZero = qtyVal <= 0;
    tbody.innerHTML += `
      <tr>
        <td>${item.image ? `<img src="${item.image}" alt="${safeName}" style="width:50px;height:50px;object-fit:cover;border-radius:0.375rem;">` : '<span style="color:#9ca3af;font-size:0.75rem;">No image</span>'}</td>
        <td>${item.name}</td>
        <td style="font-family:monospace;font-size:0.8rem;">${item.item_code || '<span style="color:#9ca3af;">N/A</span>'}</td>
        <td>${item.category}</td>
        <td>${item.price !== null && item.price !== undefined && item.price !== '' ? '₱' + Number(item.price).toLocaleString('en-PH', { minimumFractionDigits: 2, maximumFractionDigits: 2 }) : '<span style="color:#9ca3af;">Not set</span>'}</td>
        <td>
          <div class="kd-qty-control" id="kdQtyCtrl_${item.id}" data-item-id="${item.id}">
            <button type="button" class="kd-qty-btn kd-qty-dec" onclick="adjustAdminInventoryQuantity(${item.id}, -1)" title="Decrease Quantity by 1" aria-label="Decrease quantity for ${safeName}" ${isZero ? 'disabled' : ''}>
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><line x1="5" y1="12" x2="19" y2="12"></line></svg>
            </button>
            <input type="number" min="0" step="1" class="kd-qty-input" id="kdQtyInput_${item.id}" value="${qtyVal}" data-item-id="${item.id}" data-previous-value="${qtyVal}" onchange="setAdminInventoryQuantity(${item.id}, this.value)" onkeydown="if(event.key==='Enter'){this.blur();}" aria-label="Current quantity for ${safeName}" />
            <button type="button" class="kd-qty-btn kd-qty-inc" onclick="adjustAdminInventoryQuantity(${item.id}, 1)" title="Increase Quantity by 1" aria-label="Increase quantity for ${safeName}">
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><line x1="12" y1="5" x2="12" y2="19"></line><line x1="5" y1="12" x2="19" y2="12"></line></svg>
            </button>
          </div>
        </td>
        <td id="kdStockStatus_${item.id}"><span class="stock-status ${status}">${statusText}</span></td>
        <td id="kdLastUpdated_${item.id}">${formatDateTime(item.last_updated)}</td>
        <td>
          <button class="action-btn edit" onclick="editInventory(${item.id})" title="Edit"><svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"></path><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"></path></svg></button>
          <button class="action-btn archive" onclick="archiveInventory(${item.id})" title="Archive Item"><svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="21 8 21 21 3 21 3 8"></polyline><rect x="1" y="3" width="22" height="5"></rect><line x1="10" y1="12" x2="14" y2="12"></line></svg></button>
        </td>
      </tr>`;
  });
}

// Category options come from the loaded inventory records (not hardcoded). The current choice is kept even if no item uses it any more.
function refreshInventoryCategoryOptions(items) {
  const select = document.getElementById('adminInventoryCategoryFilter');
  if (!select) return;
  const selected = select.value || 'all';
  const categories = new Set(items.map(item => item.category).filter(Boolean));
  if (selected !== 'all') categories.add(selected);
  select.replaceChildren(new Option('All Categories', 'all'));
  Array.from(categories).sort((a, b) => a.localeCompare(b)).forEach(cat => select.appendChild(new Option(cat, cat)));
  select.value = selected;
}

function filterAdminInventoryList(targetPage) {
  const searchInput = document.getElementById('adminInventorySearch');
  const categoryFilter = document.getElementById('adminInventoryCategoryFilter');
  const statusFilter = document.getElementById('adminInventoryStatusFilter');

  const currentSearch = (searchInput && searchInput.value.trim().toLowerCase()) || '';
  const currentCategory = (categoryFilter && categoryFilter.value) || 'all';
  const currentStatus = (statusFilter && statusFilter.value) || 'all';

  if (typeof targetPage === 'number') {
    adminActiveInventoryPage = targetPage;
  } else if (currentSearch !== adminActiveSearchLast || currentCategory !== adminActiveCategoryLast || currentStatus !== adminActiveStatusLast) {
    adminActiveInventoryPage = 1;
  }
  adminActiveSearchLast = currentSearch;
  adminActiveCategoryLast = currentCategory;
  adminActiveStatusLast = currentStatus;

  let filtered = [...adminInventoryItems];
  if (currentSearch) {
    filtered = filtered.filter(item =>
      (item.name && item.name.toLowerCase().includes(currentSearch)) ||
      (item.item_code && String(item.item_code).toLowerCase().includes(currentSearch)) ||
      (item.category && item.category.toLowerCase().includes(currentSearch)));
  }
  if (currentCategory !== 'all') filtered = filtered.filter(item => item.category === currentCategory);
  if (currentStatus !== 'all') filtered = filtered.filter(item => inventoryStockStatus(item) === currentStatus);

  const totalItems = filtered.length;
  const totalPages = Math.max(1, Math.ceil(totalItems / INVENTORY_PAGE_SIZE));
  if (adminActiveInventoryPage > totalPages) {
    adminActiveInventoryPage = totalPages;
  }
  if (adminActiveInventoryPage < 1) {
    adminActiveInventoryPage = 1;
  }

  const startIndex = (adminActiveInventoryPage - 1) * INVENTORY_PAGE_SIZE;
  const pagedItems = filtered.slice(startIndex, startIndex + INVENTORY_PAGE_SIZE);

  renderAdminInventoryTable(pagedItems, totalItems);
  renderInventoryPagination({
    containerId: 'adminInventoryPagination',
    totalItems,
    currentPage: adminActiveInventoryPage,
    pageSize: INVENTORY_PAGE_SIZE,
    onPageChange: (newPage) => filterAdminInventoryList(newPage)
  });
}

function resetAdminInventoryFilters() {
  const searchInput = document.getElementById('adminInventorySearch');
  const categoryFilter = document.getElementById('adminInventoryCategoryFilter');
  const statusFilter = document.getElementById('adminInventoryStatusFilter');
  if (searchInput) searchInput.value = '';
  if (categoryFilter) categoryFilter.value = 'all';
  if (statusFilter) statusFilter.value = 'all';
  adminActiveInventoryPage = 1;
  filterAdminInventoryList();
}

// Called once from main.js on the Admin page (the dataset flag prevents duplicate listeners)
export function initAdminInventorySearch() {
  const searchInput = document.getElementById('adminInventorySearch');
  if (searchInput && searchInput.dataset.kdBound !== '1') {
    searchInput.dataset.kdBound = '1';
    const categoryFilter = document.getElementById('adminInventoryCategoryFilter');
    const statusFilter = document.getElementById('adminInventoryStatusFilter');
    const resetBtn = document.getElementById('adminInventoryResetFilters');
    searchInput.addEventListener('input', () => {
      adminActiveInventoryPage = 1;
      filterAdminInventoryList();
    });
    if (categoryFilter) categoryFilter.addEventListener('change', () => {
      adminActiveInventoryPage = 1;
      filterAdminInventoryList();
    });
    if (statusFilter) statusFilter.addEventListener('change', () => {
      adminActiveInventoryPage = 1;
      filterAdminInventoryList();
    });
    if (resetBtn) resetBtn.addEventListener('click', resetAdminInventoryFilters);
  }

  const archSearch = document.getElementById('adminArchivedInventorySearch');
  if (archSearch && archSearch.dataset.kdBound !== '1') {
    archSearch.dataset.kdBound = '1';
    const archCat = document.getElementById('adminArchivedInventoryCategoryFilter');
    const archReset = document.getElementById('adminArchivedInventoryResetFilters');
    archSearch.addEventListener('input', () => {
      adminArchivedInventoryPage = 1;
      filterArchivedInventoryList();
    });
    if (archCat) archCat.addEventListener('change', () => {
      adminArchivedInventoryPage = 1;
      filterArchivedInventoryList();
    });
    if (archReset) archReset.addEventListener('click', () => {
      archSearch.value = '';
      if (archCat) archCat.value = 'all';
      adminArchivedInventoryPage = 1;
      filterArchivedInventoryList();
    });
  }
}

// In-flight locking to prevent duplicate simultaneous quantity requests
const inFlightQuantityUpdates = new Set();

export async function adjustAdminInventoryQuantity(id, delta) {
  const item = adminInventoryItems.find(inv => inv.id === id);
  if (!item) return;
  const current = Number(item.quantity) || 0;
  const target = current + delta;
  if (target < 0) {
    showToast('Quantity cannot be negative', 'warning');
    return;
  }
  return commitAdminInventoryQuantity(id, target);
}

export async function setAdminInventoryQuantity(id, rawValue) {
  const item = adminInventoryItems.find(inv => inv.id === id);
  if (!item) return;
  const inputEl = document.getElementById(`kdQtyInput_${id}`);
  const prevVal = Number(inputEl && inputEl.dataset.previousValue !== undefined ? inputEl.dataset.previousValue : item.quantity) || 0;

  const parsed = Number(rawValue);
  if (!Number.isInteger(parsed) || parsed < 0) {
    showToast('Please enter a valid non-negative whole number', 'warning');
    if (inputEl) inputEl.value = prevVal;
    return;
  }
  if (parsed === Number(item.quantity)) {
    return;
  }
  return commitAdminInventoryQuantity(id, parsed);
}

async function commitAdminInventoryQuantity(id, newQty) {
  if (inFlightQuantityUpdates.has(id)) {
    return; // Prevent duplicate rapid requests
  }
  const item = adminInventoryItems.find(inv => inv.id === id);
  if (!item) return;

  const oldQty = Number(item.quantity) || 0;
  const ctrl = document.getElementById(`kdQtyCtrl_${id}`);
  const inputEl = document.getElementById(`kdQtyInput_${id}`);
  const decBtn = ctrl ? ctrl.querySelector('.kd-qty-dec') : null;
  const incBtn = ctrl ? ctrl.querySelector('.kd-qty-inc') : null;

  inFlightQuantityUpdates.add(id);
  if (ctrl) ctrl.classList.add('is-loading');
  if (inputEl) inputEl.disabled = true;
  if (decBtn) decBtn.disabled = true;
  if (incBtn) incBtn.disabled = true;

  try {
    const result = await API.updateInventoryQuantity(id, newQty);
    if (result && result.success) {
      item.quantity = newQty;
      const nowIso = new Date().toISOString();
      item.last_updated = nowIso;

      if (inputEl) {
        inputEl.value = newQty;
        inputEl.dataset.previousValue = newQty;
      }
      if (decBtn) decBtn.disabled = (newQty <= 0);

      const statusCell = document.getElementById(`kdStockStatus_${id}`);
      if (statusCell) {
        const newStatus = inventoryStockStatus(item);
        const newStatusText = newStatus === 'in-stock' ? 'In Stock' : 'Low Stock';
        statusCell.innerHTML = `<span class="stock-status ${newStatus}">${newStatusText}</span>`;
      }

      const lastUpdatedCell = document.getElementById(`kdLastUpdated_${id}`);
      if (lastUpdatedCell) {
        lastUpdatedCell.textContent = formatDateTime(nowIso);
      }

      showToast(result.message || `Quantity updated to ${newQty}`, 'success');

      if (document.getElementById('furnitureList') && typeof loadFurnitureList === 'function') {
        loadFurnitureList();
      }
      return result;
    } else {
      if (inputEl) inputEl.value = oldQty;
      showToast((result && result.message) ? result.message : 'Failed to update quantity', 'error');
      return result;
    }
  } catch (error) {
    if (inputEl) inputEl.value = oldQty;
    showToast('❌ Failed to update quantity', 'error');
    throw error;
  } finally {
    inFlightQuantityUpdates.delete(id);
    if (ctrl) ctrl.classList.remove('is-loading');
    if (inputEl) inputEl.disabled = false;
    if (decBtn) decBtn.disabled = ((Number(item.quantity) || 0) <= 0);
    if (incBtn) incBtn.disabled = false;
  }
}

if (typeof window !== 'undefined') {
  window.adjustAdminInventoryQuantity = adjustAdminInventoryQuantity;
  window.setAdminInventoryQuantity = setAdminInventoryQuantity;
}

// In-flight locking for Manager quantity adjustments
const inFlightManagerQuantityUpdates = new Set();

export async function adjustManagerInventoryQuantity(id, delta) {
  const item = managerInventoryItems.find(inv => inv.id === id);
  if (!item) return;
  const current = Number(item.quantity) || 0;
  const target = current + delta;
  if (target < 0) {
    showToast('Quantity cannot be negative', 'warning');
    return;
  }
  return commitManagerInventoryQuantity(id, target);
}

export async function setManagerInventoryQuantity(id, rawValue) {
  const item = managerInventoryItems.find(inv => inv.id === id);
  if (!item) return;
  const inputEl = document.getElementById(`managerKdQtyInput_${id}`);
  const prevVal = Number(inputEl && inputEl.dataset.previousValue !== undefined ? inputEl.dataset.previousValue : item.quantity) || 0;

  const parsed = Number(rawValue);
  if (!Number.isInteger(parsed) || parsed < 0) {
    showToast('Please enter a valid non-negative whole number', 'warning');
    if (inputEl) inputEl.value = prevVal;
    return;
  }
  if (parsed === Number(item.quantity)) {
    return;
  }
  return commitManagerInventoryQuantity(id, parsed);
}

async function commitManagerInventoryQuantity(id, newQty) {
  if (inFlightManagerQuantityUpdates.has(id)) {
    return;
  }
  const item = managerInventoryItems.find(inv => inv.id === id);
  if (!item) return;

  const oldQty = Number(item.quantity) || 0;
  const ctrl = document.getElementById(`managerKdQtyCtrl_${id}`);
  const inputEl = document.getElementById(`managerKdQtyInput_${id}`);
  const decBtn = ctrl ? ctrl.querySelector('.kd-qty-dec') : null;
  const incBtn = ctrl ? ctrl.querySelector('.kd-qty-inc') : null;

  inFlightManagerQuantityUpdates.add(id);
  if (ctrl) ctrl.classList.add('is-loading');
  if (inputEl) inputEl.disabled = true;
  if (decBtn) decBtn.disabled = true;
  if (incBtn) incBtn.disabled = true;

  try {
    const result = await API.updateInventoryQuantity(id, newQty);
    if (result && result.success) {
      item.quantity = newQty;
      const nowIso = new Date().toISOString();
      item.last_updated = nowIso;

      if (inputEl) {
        inputEl.value = newQty;
        inputEl.dataset.previousValue = newQty;
      }
      if (decBtn) decBtn.disabled = (newQty <= 0);

      const statusCell = document.getElementById(`managerKdStockStatus_${id}`);
      if (statusCell) {
        const newStatus = inventoryStockStatus(item);
        const newStatusText = newStatus === 'in-stock' ? 'In Stock' : 'Low Stock';
        statusCell.innerHTML = `<span class="stock-status ${newStatus}">${newStatusText}</span>`;
      }

      const lastUpdatedCell = document.getElementById(`managerKdLastUpdated_${id}`);
      if (lastUpdatedCell) {
        lastUpdatedCell.textContent = formatDateTime(nowIso);
      }

      showToast(result.message || `Quantity updated to ${newQty}`, 'success');
      return result;
    } else {
      if (inputEl) inputEl.value = oldQty;
      showToast((result && result.message) ? result.message : 'Failed to update quantity', 'error');
      return result;
    }
  } catch (error) {
    if (inputEl) inputEl.value = oldQty;
    showToast('❌ Failed to update quantity', 'error');
    throw error;
  } finally {
    inFlightManagerQuantityUpdates.delete(id);
    if (ctrl) ctrl.classList.remove('is-loading');
    if (inputEl) inputEl.disabled = false;
    if (decBtn) decBtn.disabled = ((Number(item.quantity) || 0) <= 0);
    if (incBtn) incBtn.disabled = false;
  }
}

if (typeof window !== 'undefined') {
  window.adjustManagerInventoryQuantity = adjustManagerInventoryQuantity;
  window.setManagerInventoryQuantity = setManagerInventoryQuantity;
}

export function openAddInventoryModal() {
  editingInventoryId = null;
  currentStockImage = null;
  document.getElementById('stockModalTitle').textContent = 'Add New Stock Item';
  document.getElementById('stockForm').reset();
  const qtyGroup = document.getElementById('stockQuantityGroup');
  const qtyInput = document.getElementById('stockQuantity');
  if (qtyGroup) qtyGroup.style.display = '';
  if (qtyInput) {
    qtyInput.required = true;
    qtyInput.disabled = false;
    qtyInput.value = '';
  }
  const preview = document.getElementById('stockImagePreview');
  if (preview) preview.style.display = 'none';
  showModal('stockModal');
}

export function handleStockImageUpload(event) {
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

export async function handleInventorySubmit(event) {
  event.preventDefault();
  const itemCode = document.getElementById('stockItemCode').value.trim();
  if (!itemCode) { showToast('Please enter an item code', 'warning'); return; }
  const price = parseFloat(document.getElementById('stockPrice').value);
  if (!Number.isFinite(price) || price <= 0) { showToast('Please enter a valid price greater than 0', 'warning'); return; }

  const data = {
    name: document.getElementById('stockName').value.trim(),
    item_code: itemCode,
    category: document.getElementById('stockCategory').value,
    price,
    image: currentStockImage || ''
  };

  // Only Add New Stock Item sends and validates quantity.
  // Edit Stock Item omits quantity so existing stock quantity is never overwritten or reset.
  if (!editingInventoryId) {
    const qtyInput = document.getElementById('stockQuantity');
    const qtyVal = parseInt(qtyInput ? qtyInput.value : '', 10);
    if (!Number.isInteger(qtyVal) || qtyVal < 0) {
      showToast('Please enter a valid initial quantity (0 or greater)', 'warning');
      return;
    }
    data.quantity = qtyVal;
  }

  try {
    const result = editingInventoryId ? await API.updateInventory(editingInventoryId, data) : await API.createInventory(data);
    if (result.success) {
      showToast(result.message, 'success');
      hideModal('stockModal');
      loadInventoryList();
      if (document.getElementById('furnitureList')) loadFurnitureList(); // the trigger created/updated the linked furniture record
      if (window.location.pathname.includes('manager')) loadManagerInventoryList();
    } else showToast('❌ ' + result.message, 'error');
  } catch (error) { showToast('❌ Failed to save inventory', 'error'); }
}

export async function editInventory(id) {
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

      // Quantity is managed inline on the Inventory table, so remove it from the Edit Stock Item modal
      const qtyGroup = document.getElementById('stockQuantityGroup');
      const qtyInput = document.getElementById('stockQuantity');
      if (qtyGroup) qtyGroup.style.display = 'none';
      if (qtyInput) {
        qtyInput.required = false;
        qtyInput.disabled = true;
        qtyInput.value = '';
      }

      document.getElementById('stockPrice').value = item.price !== null && item.price !== undefined ? item.price : '';
      const preview = document.getElementById('stockImagePreview');
      const previewImg = document.getElementById('stockImagePreviewImg');
      if (item.image && preview && previewImg) { previewImg.src = item.image; preview.style.display = 'block'; }
      else if (preview) { preview.style.display = 'none'; }
      showModal('stockModal');
    } else {
      showToast('❌ ' + (result.message || 'Failed to load inventory details'), 'error');
    }
  } catch (error) { showToast('❌ Failed to load inventory details', 'error'); }
}

export async function deleteInventory(id) {
  // Permanent delete is deprecated in favor of archive
  return archiveInventory(id);
}

export async function archiveInventory(id) {
  if (!(await kdConfirm('Are you sure you want to archive this inventory item?\n\nIt will be moved to the Archived Inventory tab and removed from the active inventory list.', { title: 'Archive Inventory Item', confirmText: 'Archive' }))) return;
  try {
    const result = await API.archiveInventory(id);
    if (result.success) {
      showToast(result.message || 'Inventory item archived successfully', 'success');
      await Promise.all([loadInventoryList(), loadArchivedInventoryList()]);
      if (document.getElementById('furnitureList')) loadFurnitureList();
    } else {
      showToast(result.message || 'Failed to archive inventory item', 'error');
    }
  } catch (error) {
    showToast('❌ Failed to archive inventory item', 'error');
  }
}

export async function restoreInventory(id) {
  if (!(await kdConfirm('Restore this inventory item to active inventory?', { title: 'Restore Inventory Item', confirmText: 'Restore' }))) return;
  try {
    const result = await API.restoreInventory(id);
    if (result.success) {
      showToast(result.message || 'Inventory item restored successfully', 'success');
      await Promise.all([loadInventoryList(), loadArchivedInventoryList()]);
      if (document.getElementById('furnitureList')) loadFurnitureList();
    } else {
      showToast(result.message || 'Failed to restore inventory item', 'error');
    }
  } catch (error) {
    showToast('❌ Failed to restore inventory item', 'error');
  }
}

// Archived Inventory State and Methods
let adminArchivedInventoryItems = [];

export async function loadArchivedInventoryList() {
  try {
    const result = await API.getArchivedInventory();
    if (result.success) {
      adminArchivedInventoryItems = Array.isArray(result.data) ? result.data : [];
      const badge = document.getElementById('adminInventoryArchivedBadge');
      if (badge) {
        badge.textContent = adminArchivedInventoryItems.length;
        badge.style.display = adminArchivedInventoryItems.length > 0 ? 'inline-block' : 'none';
      }
      refreshArchivedInventoryCategoryOptions(adminArchivedInventoryItems);
      filterArchivedInventoryList();
    }
  } catch (err) {
    console.error('Failed to load archived inventory:', err);
  }
}

function renderArchivedInventoryTableRows(items, totalFilteredCount = items.length) {
  const tbody = document.getElementById('adminArchivedInventoryList');
  if (!tbody) return;
  tbody.innerHTML = '';
  if (adminArchivedInventoryItems.length === 0) {
    tbody.innerHTML = '<tr><td colspan="9" style="text-align:center;color:#9ca3af;padding:2rem;">No archived inventory items found</td></tr>';
    return;
  }
  if (totalFilteredCount === 0 || items.length === 0) {
    tbody.innerHTML = '<tr class="no-data-row"><td colspan="9" style="text-align:center;color:#9ca3af;padding:2rem;">No archived inventory items match your search or filters.</td></tr>';
    return;
  }
  items.forEach(item => {
    const status = inventoryStockStatus(item);
    const statusText = status === 'in-stock' ? 'In Stock' : 'Low Stock';
    tbody.innerHTML += `
      <tr>
        <td>${item.image ? `<img src="${item.image}" alt="${item.name}" style="width:50px;height:50px;object-fit:cover;border-radius:0.375rem;">` : '<span style="color:#9ca3af;font-size:0.75rem;">No image</span>'}</td>
        <td>${item.name}</td>
        <td style="font-family:monospace;font-size:0.8rem;">${item.item_code || '<span style="color:#9ca3af;">N/A</span>'}</td>
        <td>${item.category}</td>
        <td>${item.price !== null && item.price !== undefined && item.price !== '' ? '₱' + Number(item.price).toLocaleString('en-PH', { minimumFractionDigits: 2, maximumFractionDigits: 2 }) : '<span style="color:#9ca3af;">Not set</span>'}</td>
        <td>${item.quantity}</td>
        <td><span class="stock-status ${status}">${statusText}</span></td>
        <td>${formatDateTime(item.archived_at || item.last_updated)}</td>
        <td>
          <button class="action-btn restore" onclick="restoreInventory(${item.id})" title="Restore Item to Active Inventory" style="display:inline-flex;align-items:center;gap:0.3rem;font-size:0.8125rem;font-weight:600;padding:0.3rem 0.65rem;border-radius:0.375rem;border:1px solid #059669;color:#059669;background:transparent;cursor:pointer;">
            <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="1 4 1 10 7 10"></polyline><path d="M3.51 15a9 9 0 1 0 2.13-9.36L1 10"></path></svg>
            Restore
          </button>
        </td>
      </tr>`;
  });
}

function filterArchivedInventoryList(targetPage) {
  const searchInput = document.getElementById('adminArchivedInventorySearch');
  const categoryFilter = document.getElementById('adminArchivedInventoryCategoryFilter');

  const currentSearch = (searchInput && searchInput.value.trim().toLowerCase()) || '';
  const currentCategory = (categoryFilter && categoryFilter.value) || 'all';

  if (typeof targetPage === 'number') {
    adminArchivedInventoryPage = targetPage;
  } else if (currentSearch !== adminArchivedSearchLast || currentCategory !== adminArchivedCategoryLast) {
    adminArchivedInventoryPage = 1;
  }
  adminArchivedSearchLast = currentSearch;
  adminArchivedCategoryLast = currentCategory;

  let filtered = [...adminArchivedInventoryItems];
  if (currentSearch) {
    filtered = filtered.filter(item =>
      (item.name && item.name.toLowerCase().includes(currentSearch)) ||
      (item.item_code && item.item_code.toLowerCase().includes(currentSearch)) ||
      (item.category && item.category.toLowerCase().includes(currentSearch))
    );
  }
  if (currentCategory !== 'all') {
    filtered = filtered.filter(item => item.category === currentCategory);
  }
  const summaryEl = document.getElementById('adminArchivedInventoryFilterSummary');
  if (summaryEl) {
    const isFiltered = (searchInput && searchInput.value.trim()) || (categoryFilter && categoryFilter.value !== 'all');
    summaryEl.textContent = isFiltered ? `Showing ${filtered.length} of ${adminArchivedInventoryItems.length} archived items` : `${adminArchivedInventoryItems.length} archived item${adminArchivedInventoryItems.length === 1 ? '' : 's'}`;
  }

  const totalItems = filtered.length;
  const totalPages = Math.max(1, Math.ceil(totalItems / INVENTORY_PAGE_SIZE));
  if (adminArchivedInventoryPage > totalPages) {
    adminArchivedInventoryPage = totalPages;
  }
  if (adminArchivedInventoryPage < 1) {
    adminArchivedInventoryPage = 1;
  }

  const startIndex = (adminArchivedInventoryPage - 1) * INVENTORY_PAGE_SIZE;
  const pagedItems = filtered.slice(startIndex, startIndex + INVENTORY_PAGE_SIZE);

  renderArchivedInventoryTableRows(pagedItems, totalItems);
  renderInventoryPagination({
    containerId: 'adminArchivedInventoryPagination',
    totalItems,
    currentPage: adminArchivedInventoryPage,
    pageSize: INVENTORY_PAGE_SIZE,
    onPageChange: (newPage) => filterArchivedInventoryList(newPage)
  });
}

function refreshArchivedInventoryCategoryOptions(items) {
  const select = document.getElementById('adminArchivedInventoryCategoryFilter');
  if (!select) return;
  const selected = select.value || 'all';
  const categories = new Set(items.map(item => item.category).filter(Boolean));
  if (selected !== 'all') categories.add(selected);
  select.replaceChildren(new Option('All Categories', 'all'));
  Array.from(categories).sort((a, b) => a.localeCompare(b)).forEach(cat => select.appendChild(new Option(cat, cat)));
  select.value = selected;
}

export function switchAdminInventorySubtab(tab) {
  const activeBtn = document.getElementById('adminInventoryTabActive');
  const archivedBtn = document.getElementById('adminInventoryTabArchived');
  const activeView = document.getElementById('adminInventoryActiveView');
  const archivedView = document.getElementById('adminInventoryArchivedView');
  if (!activeBtn || !archivedBtn) return;
  if (tab === 'archived') {
    activeBtn.classList.remove('active');
    archivedBtn.classList.add('active');
    if (activeView) activeView.style.display = 'none';
    if (archivedView) archivedView.style.display = 'block';
    adminArchivedInventoryPage = 1;
    loadArchivedInventoryList();
  } else {
    archivedBtn.classList.remove('active');
    activeBtn.classList.add('active');
    if (archivedView) archivedView.style.display = 'none';
    if (activeView) activeView.style.display = 'block';
    adminActiveInventoryPage = 1;
    loadInventoryList();
  }
}

// Unit price of an inventory item, or null when no valid price has been set yet
export function getInventoryUnitPrice(item) {
  const price = Number(item && item.price);
  return Number.isFinite(price) && price > 0 ? price : null;
}

function escapeHtml(str) {
  return String(str ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}

// =============================================================================
// STAFF MODULE - INVENTORY (read-only with search & filters)
// =============================================================================
let staffInventoryItems = [];

function refreshStaffInventoryCategoryOptions(items) {
  const select = document.getElementById('staffInventoryCategoryFilter');
  if (!select) return;
  const selected = select.value || 'all';
  const categories = new Set(items.map(item => item.category).filter(Boolean));
  if (selected !== 'all') categories.add(selected);
  select.replaceChildren(new Option('All Categories', 'all'));
  Array.from(categories).sort((a, b) => a.localeCompare(b)).forEach(cat => select.appendChild(new Option(cat, cat)));
  select.value = selected;
}

function filterStaffInventoryList(targetPage) {
  const searchInput = document.getElementById('staffInventorySearch');
  const categoryFilter = document.getElementById('staffInventoryCategoryFilter');
  const statusFilter = document.getElementById('staffInventoryStatusFilter');

  const currentSearch = (searchInput && searchInput.value.trim().toLowerCase()) || '';
  const currentCategory = (categoryFilter && categoryFilter.value) || 'all';
  const currentStatus = (statusFilter && statusFilter.value) || 'all';

  if (typeof targetPage === 'number') {
    staffActiveInventoryPage = targetPage;
  } else if (currentSearch !== staffActiveSearchLast || currentCategory !== staffActiveCategoryLast || currentStatus !== staffActiveStatusLast) {
    staffActiveInventoryPage = 1;
  }
  staffActiveSearchLast = currentSearch;
  staffActiveCategoryLast = currentCategory;
  staffActiveStatusLast = currentStatus;

  let filtered = [...staffInventoryItems];
  if (currentSearch) {
    filtered = filtered.filter(item =>
      (item.name && item.name.toLowerCase().includes(currentSearch)) ||
      (item.item_code && String(item.item_code).toLowerCase().includes(currentSearch)) ||
      (item.category && item.category.toLowerCase().includes(currentSearch)));
  }
  if (currentCategory !== 'all') filtered = filtered.filter(item => item.category === currentCategory);
  if (currentStatus !== 'all') filtered = filtered.filter(item => inventoryStockStatus(item) === currentStatus);

  const totalItems = filtered.length;
  const totalPages = Math.max(1, Math.ceil(totalItems / INVENTORY_PAGE_SIZE));
  if (staffActiveInventoryPage > totalPages) {
    staffActiveInventoryPage = totalPages;
  }
  if (staffActiveInventoryPage < 1) {
    staffActiveInventoryPage = 1;
  }

  const startIndex = (staffActiveInventoryPage - 1) * INVENTORY_PAGE_SIZE;
  const pagedItems = filtered.slice(startIndex, startIndex + INVENTORY_PAGE_SIZE);

  renderStaffInventoryTable(pagedItems, totalItems);
  renderInventoryPagination({
    containerId: 'staffInventoryPagination',
    totalItems,
    currentPage: staffActiveInventoryPage,
    pageSize: INVENTORY_PAGE_SIZE,
    onPageChange: (newPage) => filterStaffInventoryList(newPage)
  });
}

function resetStaffInventoryFilters() {
  const searchInput = document.getElementById('staffInventorySearch');
  const categoryFilter = document.getElementById('staffInventoryCategoryFilter');
  const statusFilter = document.getElementById('staffInventoryStatusFilter');
  if (searchInput) searchInput.value = '';
  if (categoryFilter) categoryFilter.value = 'all';
  if (statusFilter) statusFilter.value = 'all';
  staffActiveInventoryPage = 1;
  filterStaffInventoryList();
}

export function initStaffInventorySearch() {
  const searchInput = document.getElementById('staffInventorySearch');
  if (!searchInput || searchInput.dataset.kdBound === '1') return;
  searchInput.dataset.kdBound = '1';
  const categoryFilter = document.getElementById('staffInventoryCategoryFilter');
  const statusFilter = document.getElementById('staffInventoryStatusFilter');
  const resetBtn = document.getElementById('staffInventoryResetFilters');
  searchInput.addEventListener('input', () => {
    staffActiveInventoryPage = 1;
    filterStaffInventoryList();
  });
  if (categoryFilter) categoryFilter.addEventListener('change', () => {
    staffActiveInventoryPage = 1;
    filterStaffInventoryList();
  });
  if (statusFilter) statusFilter.addEventListener('change', () => {
    staffActiveInventoryPage = 1;
    filterStaffInventoryList();
  });
  if (resetBtn) resetBtn.addEventListener('click', resetStaffInventoryFilters);
}

function renderStaffInventoryTable(items, totalFilteredCount = items.length) {
  const tbody = document.getElementById('staffInventoryList');
  if (!tbody) return;
  tbody.innerHTML = '';
  if (staffInventoryItems.length === 0) {
    tbody.innerHTML = '<tr><td colspan="7" style="text-align:center;color:#9ca3af;padding:2rem;">No inventory items found</td></tr>';
    return;
  }
  if (totalFilteredCount === 0 || !items || items.length === 0) {
    tbody.innerHTML = '<tr class="no-data-row"><td colspan="7" style="text-align:center;color:#9ca3af;padding:2rem;">No inventory items match your search or filter criteria.</td></tr>';
    return;
  }
  items.forEach(item => {
    const status = item.quantity > 10 ? 'in-stock' : 'low-stock';
    const statusText = item.quantity > 10 ? 'In Stock' : 'Low Stock';
    tbody.innerHTML += `
      <tr>
        <td>${item.image ? `<img src="${item.image}" alt="${escapeHtml(item.name)}" style="width:50px;height:50px;object-fit:cover;border-radius:0.375rem;">` : '<span style="color:#9ca3af;font-size:0.75rem;">No image</span>'}</td>
        <td style="font-family:monospace;font-size:0.8rem;">${item.item_code ? escapeHtml(item.item_code) : '<span style="color:#9ca3af;">N/A</span>'}</td>
        <td>${escapeHtml(item.name)}</td>
        <td>${escapeHtml(item.category || '')}</td>
        <td>${getInventoryUnitPrice(item) ? formatCurrency(getInventoryUnitPrice(item)) : '<span style="color:#9ca3af;">Not set</span>'}</td>
        <td><strong>${item.quantity}</strong></td>
        <td><span class="stock-status ${status}">${statusText}</span></td>
      </tr>`;
  });
}

export async function loadStaffInventoryList() {
  try {
    initStaffInventorySearch();
    const result = await API.getInventory();
    if (result.success) {
      staffInventoryItems = Array.isArray(result.data) ? result.data : [];
      refreshStaffInventoryCategoryOptions(staffInventoryItems);
      filterStaffInventoryList();
    } else {
      showToast('❌ ' + (result.message || 'Failed to load inventory'), 'error');
    }
  } catch (error) {
    showToast('❌ Failed to load inventory', 'error');
  }
}

// MANAGER MODULE - INVENTORY (search, filter, stock management)
// =============================================================================
let managerInventoryItems = [];

function refreshManagerInventoryCategoryOptions(items) {
  const select = document.getElementById('managerInventoryCategoryFilter');
  if (!select) return;
  const selected = select.value || 'all';
  const categories = new Set(items.map(item => item.category).filter(Boolean));
  if (selected !== 'all') categories.add(selected);
  select.replaceChildren(new Option('All Categories', 'all'));
  Array.from(categories).sort((a, b) => a.localeCompare(b)).forEach(cat => select.appendChild(new Option(cat, cat)));
  select.value = selected;
}

function filterManagerInventoryList(targetPage) {
  const searchInput = document.getElementById('managerInventorySearch');
  const categoryFilter = document.getElementById('managerInventoryCategoryFilter');
  const statusFilter = document.getElementById('managerInventoryStatusFilter');

  const currentSearch = (searchInput && searchInput.value.trim().toLowerCase()) || '';
  const currentCategory = (categoryFilter && categoryFilter.value) || 'all';
  const currentStatus = (statusFilter && statusFilter.value) || 'all';

  if (typeof targetPage === 'number') {
    managerActiveInventoryPage = targetPage;
  } else if (currentSearch !== managerActiveSearchLast || currentCategory !== managerActiveCategoryLast || currentStatus !== managerActiveStatusLast) {
    managerActiveInventoryPage = 1;
  }
  managerActiveSearchLast = currentSearch;
  managerActiveCategoryLast = currentCategory;
  managerActiveStatusLast = currentStatus;

  let filtered = [...managerInventoryItems];
  if (currentSearch) {
    filtered = filtered.filter(item =>
      (item.name && item.name.toLowerCase().includes(currentSearch)) ||
      (item.item_code && String(item.item_code).toLowerCase().includes(currentSearch)) ||
      (item.category && item.category.toLowerCase().includes(currentSearch)));
  }
  if (currentCategory !== 'all') filtered = filtered.filter(item => item.category === currentCategory);
  if (currentStatus !== 'all') filtered = filtered.filter(item => inventoryStockStatus(item) === currentStatus);

  const totalItems = filtered.length;
  const totalPages = Math.max(1, Math.ceil(totalItems / INVENTORY_PAGE_SIZE));
  if (managerActiveInventoryPage > totalPages) {
    managerActiveInventoryPage = totalPages;
  }
  if (managerActiveInventoryPage < 1) {
    managerActiveInventoryPage = 1;
  }

  const startIndex = (managerActiveInventoryPage - 1) * INVENTORY_PAGE_SIZE;
  const pagedItems = filtered.slice(startIndex, startIndex + INVENTORY_PAGE_SIZE);

  renderManagerInventoryTable(pagedItems, totalItems);
  renderInventoryPagination({
    containerId: 'managerInventoryPagination',
    totalItems,
    currentPage: managerActiveInventoryPage,
    pageSize: INVENTORY_PAGE_SIZE,
    onPageChange: (newPage) => filterManagerInventoryList(newPage)
  });
}

function resetManagerInventoryFilters() {
  const searchInput = document.getElementById('managerInventorySearch');
  const categoryFilter = document.getElementById('managerInventoryCategoryFilter');
  const statusFilter = document.getElementById('managerInventoryStatusFilter');
  if (searchInput) searchInput.value = '';
  if (categoryFilter) categoryFilter.value = 'all';
  if (statusFilter) statusFilter.value = 'all';
  managerActiveInventoryPage = 1;
  filterManagerInventoryList();
}

export function initManagerInventorySearch() {
  const searchInput = document.getElementById('managerInventorySearch');
  if (!searchInput || searchInput.dataset.kdBound === '1') return;
  searchInput.dataset.kdBound = '1';
  const categoryFilter = document.getElementById('managerInventoryCategoryFilter');
  const statusFilter = document.getElementById('managerInventoryStatusFilter');
  const resetBtn = document.getElementById('managerInventoryResetFilters');
  searchInput.addEventListener('input', () => {
    managerActiveInventoryPage = 1;
    filterManagerInventoryList();
  });
  if (categoryFilter) categoryFilter.addEventListener('change', () => {
    managerActiveInventoryPage = 1;
    filterManagerInventoryList();
  });
  if (statusFilter) statusFilter.addEventListener('change', () => {
    managerActiveInventoryPage = 1;
    filterManagerInventoryList();
  });
  if (resetBtn) resetBtn.addEventListener('click', resetManagerInventoryFilters);
}

function renderManagerInventoryTable(items, totalFilteredCount = items.length) {
  const container = document.getElementById('managerInventoryList');
  if (!container) return;
  container.innerHTML = '';
  if (managerInventoryItems.length === 0) {
    container.innerHTML = '<p style="text-align:center;color:#9ca3af;padding:2rem;">No inventory items found</p>';
    return;
  }
  if (totalFilteredCount === 0 || !items || items.length === 0) {
    container.innerHTML = '<p style="text-align:center;color:#9ca3af;padding:2rem;">No inventory items match your search or filter criteria.</p>';
    return;
  }
  let tableHTML = `<div class="table-container"><table><thead><tr><th>Image</th><th>Item Name</th><th>Item Code</th><th>Category</th><th>Price</th><th>Quantity</th><th>Stock Status</th><th>Last Updated</th><th>Actions</th></tr></thead><tbody>`;
  items.forEach(item => {
    const status = item.quantity > 10 ? 'in-stock' : 'low-stock';
    const statusText = item.quantity > 10 ? 'In Stock' : 'Low Stock';
    const safeName = (item.name || '').replace(/"/g, '&quot;');
    const qtyVal = Number(item.quantity) || 0;
    const isZero = qtyVal <= 0;
    tableHTML += `
      <tr>
        <td>${item.image ? `<img src="${item.image}" alt="${escapeHtml(item.name)}" style="width:50px;height:50px;object-fit:cover;border-radius:0.375rem;">` : '<span style="color:#9ca3af;font-size:0.75rem;">No image</span>'}</td>
        <td>${escapeHtml(item.name)}</td>
        <td style="font-family:monospace;font-size:0.8rem;">${item.item_code ? escapeHtml(item.item_code) : '<span style="color:#9ca3af;">N/A</span>'}</td>
        <td>${escapeHtml(item.category || '')}</td>
        <td>${getInventoryUnitPrice(item) ? formatCurrency(getInventoryUnitPrice(item)) : '<span style="color:#9ca3af;">Not set</span>'}</td>
        <td>
          <div class="kd-qty-control" id="managerKdQtyCtrl_${item.id}" data-item-id="${item.id}">
            <button type="button" class="kd-qty-btn kd-qty-dec" onclick="adjustManagerInventoryQuantity(${item.id}, -1)" title="Decrease Quantity by 1" aria-label="Decrease quantity for ${safeName}" ${isZero ? 'disabled' : ''}>
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><line x1="5" y1="12" x2="19" y2="12"></line></svg>
            </button>
            <input type="number" min="0" step="1" class="kd-qty-input" id="managerKdQtyInput_${item.id}" value="${qtyVal}" data-item-id="${item.id}" data-previous-value="${qtyVal}" onchange="setManagerInventoryQuantity(${item.id}, this.value)" onkeydown="if(event.key==='Enter'){this.blur();}" aria-label="Current quantity for ${safeName}" />
            <button type="button" class="kd-qty-btn kd-qty-inc" onclick="adjustManagerInventoryQuantity(${item.id}, 1)" title="Increase Quantity by 1" aria-label="Increase quantity for ${safeName}">
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><line x1="12" y1="5" x2="12" y2="19"></line><line x1="5" y1="12" x2="19" y2="12"></line></svg>
            </button>
          </div>
        </td>
        <td id="managerKdStockStatus_${item.id}"><span class="stock-status ${status}">${statusText}</span></td>
        <td id="managerKdLastUpdated_${item.id}">${formatDateTime(item.last_updated)}</td>
        <td><button class="action-btn edit" onclick="openManagerEditInventoryModal(${item.id})"><svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"></path><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"></path></svg> Edit</button></td>
      </tr>`;
  });
  tableHTML += `</tbody></table></div>`;
  container.innerHTML = tableHTML;
}

export async function loadManagerInventoryList() {
  try {
    initManagerInventorySearch();
    const result = await API.getInventory();
    if (result.success) {
      managerInventoryItems = Array.isArray(result.data) ? result.data : [];
      refreshManagerInventoryCategoryOptions(managerInventoryItems);
      filterManagerInventoryList();
    } else {
      showToast('❌ ' + (result.message || 'Failed to load inventory'), 'error');
    }
  } catch (error) {
    showToast('❌ Failed to load inventory', 'error');
    const container = document.getElementById('managerInventoryList');
    if (container) container.innerHTML = '<p style="text-align:center;color:#ef4444;padding:2rem;">❌ Failed to load inventory</p>';
  }
}

export let currentManagerStockImage = null;

export function openAddManagerInventoryModal() {
  currentManagerStockImage = null;
  const form = document.getElementById('managerAddInventoryForm');
  if (form) form.reset();
  const preview = document.getElementById('managerStockImagePreview');
  if (preview) preview.style.display = 'none';
  showModal('managerAddInventoryModal');
}

export function handleManagerAddStockImageUpload(event) {
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

export async function handleManagerAddInventorySubmit(event) {
  event.preventDefault();
  const name = document.getElementById('managerStockName').value.trim();
  const itemCode = document.getElementById('managerStockItemCode').value.trim();
  const category = document.getElementById('managerStockCategory').value;
  const quantity = parseInt(document.getElementById('managerStockQuantity').value);
  const price = parseFloat(document.getElementById('managerStockPrice').value);
  if (!name || !itemCode || !category || isNaN(quantity) || quantity < 0) {
    showToast('Please fill all fields correctly', 'warning');
    return;
  }
  if (!Number.isFinite(price) || price <= 0) { showToast('Please enter a valid price greater than 0', 'warning'); return; }
  const data = { name, item_code: itemCode, category, quantity, price, image: currentManagerStockImage || '' };
  try {
    const result = await API.createInventory(data);
    if (result.success) { showToast(result.message || 'Inventory item added successfully', 'success'); hideModal('managerAddInventoryModal'); loadManagerInventoryList(); }
    else showToast('❌ ' + result.message, 'error');
  } catch (error) { showToast('❌ Failed to save inventory', 'error'); }
}

export async function openManagerEditInventoryModal(id) {
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
    document.getElementById('managerEditInventoryPrice').value = item.price !== null && item.price !== undefined ? item.price : '';
    const preview = document.getElementById('managerEditInventoryImagePreview');
    const previewImg = document.getElementById('managerEditInventoryImagePreviewImg');
    const imageInput = document.getElementById('managerEditInventoryImage');
    if (imageInput) imageInput.value = '';
    if (item.image && preview && previewImg) { previewImg.src = item.image; preview.style.display = 'block'; }
    else if (preview) { preview.style.display = 'none'; }
    showModal('managerEditInventoryModal');
  } catch (error) { showToast('❌ Failed to load inventory details', 'error'); }
}

export function handleManagerEditStockImageUpload(event) {
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

export function updateManagerStockPreview(quantity) {
  const preview = document.getElementById('managerStockPreview');
  if (!preview) return;
  const qty = parseInt(quantity) || 0;
  preview.textContent = qty <= 10 ? 'Low Stock' : 'In Stock';
  preview.style.color = qty <= 10 ? '#991b1b' : '#065f46';
}

// =============================================================================
// MANAGER ARCHIVED INVENTORY
// =============================================================================
let managerArchivedInventoryItems = [];

export function initManagerArchivedInventoryControls() {
  const searchInput = document.getElementById('managerArchivedInventorySearch');
  if (!searchInput || searchInput.dataset.kdBound === '1') return;
  searchInput.dataset.kdBound = '1';
  const categoryFilter = document.getElementById('managerArchivedInventoryCategoryFilter');
  const resetBtn = document.getElementById('managerArchivedInventoryResetFilters');
  searchInput.addEventListener('input', () => {
    managerArchivedInventoryPage = 1;
    filterManagerArchivedInventoryList();
  });
  if (categoryFilter) categoryFilter.addEventListener('change', () => {
    managerArchivedInventoryPage = 1;
    filterManagerArchivedInventoryList();
  });
  if (resetBtn) {
    resetBtn.addEventListener('click', () => {
      searchInput.value = '';
      if (categoryFilter) categoryFilter.value = 'all';
      managerArchivedInventoryPage = 1;
      filterManagerArchivedInventoryList();
    });
  }
}

export async function loadManagerArchivedInventoryList() {
  try {
    initManagerArchivedInventoryControls();
    const result = await API.getArchivedInventory();
    if (result.success) {
      managerArchivedInventoryItems = Array.isArray(result.data) ? result.data : [];
      const badge = document.getElementById('managerInventoryArchivedBadge');
      if (badge) {
        badge.textContent = managerArchivedInventoryItems.length;
        badge.style.display = managerArchivedInventoryItems.length > 0 ? 'inline-block' : 'none';
      }
      refreshManagerArchivedInventoryCategoryOptions(managerArchivedInventoryItems);
      filterManagerArchivedInventoryList();
    }
  } catch (err) {
    console.error('Failed to load manager archived inventory:', err);
  }
}

function renderManagerArchivedInventoryTableRows(items, totalFilteredCount = items.length) {
  const tbody = document.getElementById('managerArchivedInventoryList');
  if (!tbody) return;
  tbody.innerHTML = '';
  if (managerArchivedInventoryItems.length === 0) {
    tbody.innerHTML = '<tr><td colspan="9" style="text-align:center;color:#9ca3af;padding:2rem;">No archived inventory items found</td></tr>';
    return;
  }
  if (totalFilteredCount === 0 || !items || items.length === 0) {
    tbody.innerHTML = '<tr class="no-data-row"><td colspan="9" style="text-align:center;color:#9ca3af;padding:2rem;">No archived inventory items match your search or filters.</td></tr>';
    return;
  }
  items.forEach(item => {
    const status = inventoryStockStatus(item);
    const statusText = status === 'in-stock' ? 'In Stock' : 'Low Stock';
    tbody.innerHTML += `
      <tr>
        <td>${item.image ? `<img src="${item.image}" alt="${escapeHtml(item.name)}" style="width:50px;height:50px;object-fit:cover;border-radius:0.375rem;">` : '<span style="color:#9ca3af;font-size:0.75rem;">No image</span>'}</td>
        <td>${escapeHtml(item.name)}</td>
        <td style="font-family:monospace;font-size:0.8rem;">${item.item_code ? escapeHtml(item.item_code) : '<span style="color:#9ca3af;">N/A</span>'}</td>
        <td>${escapeHtml(item.category || '')}</td>
        <td>${item.price !== null && item.price !== undefined && item.price !== '' ? '₱' + Number(item.price).toLocaleString('en-PH', { minimumFractionDigits: 2, maximumFractionDigits: 2 }) : '<span style="color:#9ca3af;">Not set</span>'}</td>
        <td>${item.quantity}</td>
        <td><span class="stock-status ${status}">${statusText}</span></td>
        <td>${formatDateTime(item.archived_at || item.last_updated)}</td>
        <td>
          <span class="badge" style="background:#f3f4f6;color:#6b7280;font-weight:600;padding:0.25rem 0.6rem;border-radius:0.375rem;font-size:0.75rem;display:inline-block;">Archived</span>
        </td>
      </tr>`;
  });
}

function filterManagerArchivedInventoryList(targetPage) {
  const searchInput = document.getElementById('managerArchivedInventorySearch');
  const categoryFilter = document.getElementById('managerArchivedInventoryCategoryFilter');

  const currentSearch = (searchInput && searchInput.value.trim().toLowerCase()) || '';
  const currentCategory = (categoryFilter && categoryFilter.value) || 'all';

  if (typeof targetPage === 'number') {
    managerArchivedInventoryPage = targetPage;
  } else if (currentSearch !== managerArchivedSearchLast || currentCategory !== managerArchivedCategoryLast) {
    managerArchivedInventoryPage = 1;
  }
  managerArchivedSearchLast = currentSearch;
  managerArchivedCategoryLast = currentCategory;

  let filtered = [...managerArchivedInventoryItems];
  if (currentSearch) {
    filtered = filtered.filter(item =>
      (item.name && item.name.toLowerCase().includes(currentSearch)) ||
      (item.item_code && item.item_code.toLowerCase().includes(currentSearch)) ||
      (item.category && item.category.toLowerCase().includes(currentSearch))
    );
  }
  if (currentCategory !== 'all') {
    filtered = filtered.filter(item => item.category === currentCategory);
  }
  const summaryEl = document.getElementById('managerArchivedInventoryFilterSummary');
  if (summaryEl) {
    const isFiltered = (searchInput && searchInput.value.trim()) || (categoryFilter && categoryFilter.value !== 'all');
    summaryEl.textContent = isFiltered ? `Showing ${filtered.length} of ${managerArchivedInventoryItems.length} archived items` : `${managerArchivedInventoryItems.length} archived item${managerArchivedInventoryItems.length === 1 ? '' : 's'}`;
  }

  const totalItems = filtered.length;
  const totalPages = Math.max(1, Math.ceil(totalItems / INVENTORY_PAGE_SIZE));
  if (managerArchivedInventoryPage > totalPages) {
    managerArchivedInventoryPage = totalPages;
  }
  if (managerArchivedInventoryPage < 1) {
    managerArchivedInventoryPage = 1;
  }

  const startIndex = (managerArchivedInventoryPage - 1) * INVENTORY_PAGE_SIZE;
  const pagedItems = filtered.slice(startIndex, startIndex + INVENTORY_PAGE_SIZE);

  renderManagerArchivedInventoryTableRows(pagedItems, totalItems);
  renderInventoryPagination({
    containerId: 'managerArchivedInventoryPagination',
    totalItems,
    currentPage: managerArchivedInventoryPage,
    pageSize: INVENTORY_PAGE_SIZE,
    onPageChange: (newPage) => filterManagerArchivedInventoryList(newPage)
  });
}

function refreshManagerArchivedInventoryCategoryOptions(items) {
  const select = document.getElementById('managerArchivedInventoryCategoryFilter');
  if (!select) return;
  const selected = select.value || 'all';
  const categories = new Set(items.map(item => item.category).filter(Boolean));
  if (selected !== 'all') categories.add(selected);
  select.replaceChildren(new Option('All Categories', 'all'));
  Array.from(categories).sort((a, b) => a.localeCompare(b)).forEach(cat => select.appendChild(new Option(cat, cat)));
  select.value = selected;
}

export function switchManagerInventorySubtab(tab) {
  const activeBtn = document.getElementById('managerInventoryTabActive');
  const archivedBtn = document.getElementById('managerInventoryTabArchived');
  const activeView = document.getElementById('managerInventoryActiveView');
  const archivedView = document.getElementById('managerInventoryArchivedView');
  if (!activeBtn || !archivedBtn) return;
  if (tab === 'archived') {
    activeBtn.classList.remove('active');
    archivedBtn.classList.add('active');
    if (activeView) activeView.style.display = 'none';
    if (archivedView) archivedView.style.display = 'block';
    managerArchivedInventoryPage = 1;
    loadManagerArchivedInventoryList();
  } else {
    archivedBtn.classList.remove('active');
    activeBtn.classList.add('active');
    if (archivedView) archivedView.style.display = 'none';
    if (activeView) activeView.style.display = 'block';
    managerActiveInventoryPage = 1;
    loadManagerInventoryList();
  }
}

// =============================================================================
// STAFF ARCHIVED INVENTORY
// =============================================================================
let staffArchivedInventoryItems = [];

export function initStaffArchivedInventoryControls() {
  const searchInput = document.getElementById('staffArchivedInventorySearch');
  if (!searchInput || searchInput.dataset.kdBound === '1') return;
  searchInput.dataset.kdBound = '1';
  const categoryFilter = document.getElementById('staffArchivedInventoryCategoryFilter');
  const resetBtn = document.getElementById('staffArchivedInventoryResetFilters');
  searchInput.addEventListener('input', () => {
    staffArchivedInventoryPage = 1;
    filterStaffArchivedInventoryList();
  });
  if (categoryFilter) categoryFilter.addEventListener('change', () => {
    staffArchivedInventoryPage = 1;
    filterStaffArchivedInventoryList();
  });
  if (resetBtn) {
    resetBtn.addEventListener('click', () => {
      searchInput.value = '';
      if (categoryFilter) categoryFilter.value = 'all';
      staffArchivedInventoryPage = 1;
      filterStaffArchivedInventoryList();
    });
  }
}

export async function loadStaffArchivedInventoryList() {
  try {
    initStaffArchivedInventoryControls();
    const result = await API.getArchivedInventory();
    if (result.success) {
      staffArchivedInventoryItems = Array.isArray(result.data) ? result.data : [];
      const badge = document.getElementById('staffInventoryArchivedBadge');
      if (badge) {
        badge.textContent = staffArchivedInventoryItems.length;
        badge.style.display = staffArchivedInventoryItems.length > 0 ? 'inline-block' : 'none';
      }
      refreshStaffArchivedInventoryCategoryOptions(staffArchivedInventoryItems);
      filterStaffArchivedInventoryList();
    }
  } catch (err) {
    console.error('Failed to load staff archived inventory:', err);
  }
}

function renderStaffArchivedInventoryTableRows(items, totalFilteredCount = items.length) {
  const tbody = document.getElementById('staffArchivedInventoryList');
  if (!tbody) return;
  tbody.innerHTML = '';
  if (staffArchivedInventoryItems.length === 0) {
    tbody.innerHTML = '<tr><td colspan="9" style="text-align:center;color:#9ca3af;padding:2rem;">No archived inventory items found</td></tr>';
    return;
  }
  if (totalFilteredCount === 0 || !items || items.length === 0) {
    tbody.innerHTML = '<tr class="no-data-row"><td colspan="9" style="text-align:center;color:#9ca3af;padding:2rem;">No archived inventory items match your search or filters.</td></tr>';
    return;
  }
  items.forEach(item => {
    const status = inventoryStockStatus(item);
    const statusText = status === 'in-stock' ? 'In Stock' : 'Low Stock';
    tbody.innerHTML += `
      <tr>
        <td>${item.image ? `<img src="${item.image}" alt="${escapeHtml(item.name)}" style="width:50px;height:50px;object-fit:cover;border-radius:0.375rem;">` : '<span style="color:#9ca3af;font-size:0.75rem;">No image</span>'}</td>
        <td style="font-family:monospace;font-size:0.8rem;">${item.item_code ? escapeHtml(item.item_code) : '<span style="color:#9ca3af;">N/A</span>'}</td>
        <td>${escapeHtml(item.name)}</td>
        <td>${escapeHtml(item.category || '')}</td>
        <td>${item.price !== null && item.price !== undefined && item.price !== '' ? '₱' + Number(item.price).toLocaleString('en-PH', { minimumFractionDigits: 2, maximumFractionDigits: 2 }) : '<span style="color:#9ca3af;">Not set</span>'}</td>
        <td>${item.quantity}</td>
        <td><span class="stock-status ${status}">${statusText}</span></td>
        <td>${formatDateTime(item.archived_at || item.last_updated)}</td>
        <td>
          <span class="badge" style="background:#f3f4f6;color:#6b7280;font-weight:600;padding:0.25rem 0.6rem;border-radius:0.375rem;font-size:0.75rem;display:inline-block;">Archived</span>
        </td>
      </tr>`;
  });
}

function filterStaffArchivedInventoryList(targetPage) {
  const searchInput = document.getElementById('staffArchivedInventorySearch');
  const categoryFilter = document.getElementById('staffArchivedInventoryCategoryFilter');

  const currentSearch = (searchInput && searchInput.value.trim().toLowerCase()) || '';
  const currentCategory = (categoryFilter && categoryFilter.value) || 'all';

  if (typeof targetPage === 'number') {
    staffArchivedInventoryPage = targetPage;
  } else if (currentSearch !== staffArchivedSearchLast || currentCategory !== staffArchivedCategoryLast) {
    staffArchivedInventoryPage = 1;
  }
  staffArchivedSearchLast = currentSearch;
  staffArchivedCategoryLast = currentCategory;

  let filtered = [...staffArchivedInventoryItems];
  if (currentSearch) {
    filtered = filtered.filter(item =>
      (item.name && item.name.toLowerCase().includes(currentSearch)) ||
      (item.item_code && item.item_code.toLowerCase().includes(currentSearch)) ||
      (item.category && item.category.toLowerCase().includes(currentSearch))
    );
  }
  if (currentCategory !== 'all') {
    filtered = filtered.filter(item => item.category === currentCategory);
  }
  const summaryEl = document.getElementById('staffArchivedInventoryFilterSummary');
  if (summaryEl) {
    const isFiltered = (searchInput && searchInput.value.trim()) || (categoryFilter && categoryFilter.value !== 'all');
    summaryEl.textContent = isFiltered ? `Showing ${filtered.length} of ${staffArchivedInventoryItems.length} archived items` : `${staffArchivedInventoryItems.length} archived item${staffArchivedInventoryItems.length === 1 ? '' : 's'}`;
  }

  const totalItems = filtered.length;
  const totalPages = Math.max(1, Math.ceil(totalItems / INVENTORY_PAGE_SIZE));
  if (staffArchivedInventoryPage > totalPages) {
    staffArchivedInventoryPage = totalPages;
  }
  if (staffArchivedInventoryPage < 1) {
    staffArchivedInventoryPage = 1;
  }

  const startIndex = (staffArchivedInventoryPage - 1) * INVENTORY_PAGE_SIZE;
  const pagedItems = filtered.slice(startIndex, startIndex + INVENTORY_PAGE_SIZE);

  renderStaffArchivedInventoryTableRows(pagedItems, totalItems);
  renderInventoryPagination({
    containerId: 'staffArchivedInventoryPagination',
    totalItems,
    currentPage: staffArchivedInventoryPage,
    pageSize: INVENTORY_PAGE_SIZE,
    onPageChange: (newPage) => filterStaffArchivedInventoryList(newPage)
  });
}

function refreshStaffArchivedInventoryCategoryOptions(items) {
  const select = document.getElementById('staffArchivedInventoryCategoryFilter');
  if (!select) return;
  const selected = select.value || 'all';
  const categories = new Set(items.map(item => item.category).filter(Boolean));
  if (selected !== 'all') categories.add(selected);
  select.replaceChildren(new Option('All Categories', 'all'));
  Array.from(categories).sort((a, b) => a.localeCompare(b)).forEach(cat => select.appendChild(new Option(cat, cat)));
  select.value = selected;
}

export function switchStaffInventorySubtab(tab) {
  const activeBtn = document.getElementById('staffInventoryTabActive');
  const archivedBtn = document.getElementById('staffInventoryTabArchived');
  const activeView = document.getElementById('staffInventoryActiveView');
  const archivedView = document.getElementById('staffInventoryArchivedView');
  if (!activeBtn || !archivedBtn) return;
  if (tab === 'archived') {
    activeBtn.classList.remove('active');
    archivedBtn.classList.add('active');
    if (activeView) activeView.style.display = 'none';
    if (archivedView) archivedView.style.display = 'block';
    staffArchivedInventoryPage = 1;
    loadStaffArchivedInventoryList();
  } else {
    archivedBtn.classList.remove('active');
    activeBtn.classList.add('active');
    if (archivedView) archivedView.style.display = 'none';
    if (activeView) activeView.style.display = 'block';
    staffActiveInventoryPage = 1;
    loadStaffInventoryList();
  }
}

// ---- loading / duplicate-click protection (helpers live in ui.js; each function is wrapped once, here, where it is defined) ----
handleInventorySubmit = kdGuard(handleInventorySubmit, { button: 'event', progress: 'Saving inventory item...', loadingText: () => (editingInventoryId ? 'Saving...' : 'Adding Item...') });
handleManagerAddInventorySubmit = kdGuard(handleManagerAddInventorySubmit, submit('Adding Item...', 'Saving inventory item...'));
deleteInventory = kdGuard(deleteInventory, del('inventory'));
archiveInventory = kdGuard(archiveInventory, archiveOpt('inventory'));
restoreInventory = kdGuard(restoreInventory, restoreOpt('inventory'));
editInventory = kdGuard(editInventory, open('inventory'));
openManagerEditInventoryModal = kdGuard(openManagerEditInventoryModal, open('managerInventory'));
loadInventoryList = kdWrapLoader(loadInventoryList, { target: 'adminInventoryList', loading: 'Loading inventory records...', empty: 'No inventory items found', error: 'Unable to load inventory records.' });
loadArchivedInventoryList = kdWrapLoader(loadArchivedInventoryList, { target: 'adminArchivedInventoryList', loading: 'Loading archived items...', empty: 'No archived inventory items found', error: 'Unable to load archived inventory.' });
loadStaffInventoryList = kdWrapLoader(loadStaffInventoryList, { target: 'staffInventoryList', loading: 'Loading inventory records...', empty: 'No inventory items found', error: 'Unable to load inventory records.' });
loadStaffArchivedInventoryList = kdWrapLoader(loadStaffArchivedInventoryList, { target: 'staffArchivedInventoryList', loading: 'Loading archived items...', empty: 'No archived inventory items found', error: 'Unable to load archived inventory.' });
loadManagerInventoryList = kdWrapLoader(loadManagerInventoryList, { target: 'managerInventoryList', loading: 'Loading inventory records...', empty: 'No inventory items found', error: 'Unable to load inventory records.' });
loadManagerArchivedInventoryList = kdWrapLoader(loadManagerArchivedInventoryList, { target: 'managerArchivedInventoryList', loading: 'Loading archived items...', empty: 'No archived inventory items found', error: 'Unable to load archived inventory.' });
