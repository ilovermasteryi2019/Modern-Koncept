// =============================================================================
// K-DESK · inventory.js
// inventory
// Cut from the original main.js (lines 1796-3386 region). Code is unchanged except where a comment says otherwise.
// =============================================================================

import { API, fileToBase64, formatCurrency, formatDateTime } from './core.js';
import { hideModal, kdConfirm, kdDeleteOptions as del, kdFormOptions as submit, kdGuard, kdOpenOptions as open, kdWrapLoader, showModal, showToast } from './ui.js';
import { loadFurnitureList } from './furniture.js';

// =============================================================================
// ADMIN MODULE - INVENTORY MANAGEMENT
// =============================================================================
let editingInventoryId = null;

let currentStockImage = null;

export async function loadInventoryList() {
  try {
    const result = await API.getInventory();
    if (result.success) {
      const tbody = document.getElementById('adminInventoryList');
      if (!tbody) return;
      tbody.innerHTML = '';
      if (result.data.length === 0) { tbody.innerHTML = '<tr><td colspan="9" style="text-align:center;color:#9ca3af;">No inventory items found</td></tr>'; return; }
      result.data.forEach(item => {
        const status = item.quantity > 10 ? 'in-stock' : 'low-stock';
        const statusText = item.quantity > 10 ? 'In Stock' : 'Low Stock';
        tbody.innerHTML += `
          <tr>
            <td>${item.image ? `<img src="${item.image}" alt="${item.name}" style="width:50px;height:50px;object-fit:cover;border-radius:0.375rem;">` : '<span style="color:#9ca3af;font-size:0.75rem;">No image</span>'}</td>
            <td>${item.name}</td>
            <td style="font-family:monospace;font-size:0.8rem;">${item.item_code || '<span style="color:#9ca3af;">N/A</span>'}</td>
            <td>${item.category}</td>
            <td>${item.price !== null && item.price !== undefined && item.price !== '' ? '₱' + Number(item.price).toLocaleString('en-PH', { minimumFractionDigits: 2, maximumFractionDigits: 2 }) : '<span style="color:#9ca3af;">Not set</span>'}</td>
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

export function openAddInventoryModal() {
  editingInventoryId = null;
  currentStockImage = null;
  document.getElementById('stockModalTitle').textContent = 'Add New Stock Item';
  document.getElementById('stockForm').reset();
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
    name: document.getElementById('stockName').value,
    item_code: itemCode,
    category: document.getElementById('stockCategory').value,
    quantity: parseInt(document.getElementById('stockQuantity').value),
    price,
    image: currentStockImage || ''
  };
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
      document.getElementById('stockQuantity').value = item.quantity;
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
  if (!(await kdConfirm('Are you sure you want to delete this inventory item?\n\nIt will also be removed from Furniture Management and the customer furniture list.', { title: 'Delete Inventory Item' }))) return;
  try {
    const result = await API.deleteInventory(id);
    if (result.success) {
      showToast('✅ ' + result.message, 'success');
      loadInventoryList();
      if (document.getElementById('furnitureList')) loadFurnitureList(); // the linked furniture record was removed with it
    }
    else showToast('❌ ' + result.message, 'error');
  } catch (error) { showToast('❌ Failed to delete inventory', 'error'); }
}

// Unit price of an inventory item, or null when no valid price has been set yet
export function getInventoryUnitPrice(item) {
  const price = Number(item && item.price);
  return Number.isFinite(price) && price > 0 ? price : null;
}

// =============================================================================
// =============================================================================
// STAFF MODULE - INVENTORY (read-only)
// =============================================================================
export async function loadStaffInventoryList() {
  try {
    const result = await API.getInventory();
    const tbody = document.getElementById('staffInventoryList');
    if (!tbody) return;
    tbody.innerHTML = '';
    if (!result.success || result.data.length === 0) {
      tbody.innerHTML = '<tr><td colspan="7" style="text-align:center;color:#9ca3af;padding:2rem;">No inventory items found</td></tr>';
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
          <td>${getInventoryUnitPrice(item) ? formatCurrency(getInventoryUnitPrice(item)) : '<span style="color:#9ca3af;">Not set</span>'}</td>
          <td><strong>${item.quantity}</strong></td>
          <td><span class="stock-status ${status}">${statusText}</span></td>
        </tr>`;
    });
  } catch (error) { showToast('❌ Failed to load inventory', 'error'); }
}

// MANAGER MODULE - INVENTORY (shared inventory data, different container)
// =============================================================================
export async function loadManagerInventoryList() {
  try {
    const result = await API.getInventory();
    if (result.success) {
      const container = document.getElementById('managerInventoryList');
      if (!container) return;
      container.innerHTML = '';
      if (result.data.length === 0) { container.innerHTML = '<p style="text-align:center;color:#9ca3af;padding:2rem;">No inventory items found</p>'; return; }
      let tableHTML = `<div class="table-container"><table><thead><tr><th>Image</th><th>Item Name</th><th>Item Code</th><th>Category</th><th>Price</th><th>Quantity</th><th>Stock Status</th><th>Last Updated</th><th>Actions</th></tr></thead><tbody>`;
      result.data.forEach(item => {
        const status = item.quantity > 10 ? 'in-stock' : 'low-stock';
        const statusText = item.quantity > 10 ? 'In Stock' : 'Low Stock';
        tableHTML += `
          <tr>
            <td>${item.image ? `<img src="${item.image}" alt="${item.name}" style="width:50px;height:50px;object-fit:cover;border-radius:0.375rem;">` : '<span style="color:#9ca3af;font-size:0.75rem;">No image</span>'}</td>
            <td>${item.name}</td>
            <td style="font-family:monospace;font-size:0.8rem;">${item.item_code || '<span style="color:#9ca3af;">N/A</span>'}</td>
            <td>${item.category}</td>
            <td>${getInventoryUnitPrice(item) ? formatCurrency(getInventoryUnitPrice(item)) : '<span style="color:#9ca3af;">Not set</span>'}</td>
            <td><strong>${item.quantity}</strong></td>
            <td><span class="stock-status ${status}">${statusText}</span></td>
            <td>${formatDateTime(item.last_updated)}</td>
            <td><button class="action-btn edit" onclick="openManagerEditInventoryModal(${item.id})"><svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"></path><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"></path></svg> Edit</button></td>
          </tr>`;
      });
      tableHTML += `</tbody></table></div>`;
      container.innerHTML = tableHTML;
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
    document.getElementById('managerEditInventoryQuantity').value = item.quantity;
    document.getElementById('managerEditInventoryPrice').value = item.price !== null && item.price !== undefined ? item.price : '';
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


// ---- loading / duplicate-click protection (helpers live in ui.js; each function is wrapped once, here, where it is defined) ----
handleInventorySubmit = kdGuard(handleInventorySubmit, { button: 'event', progress: 'Saving inventory item...', loadingText: () => (editingInventoryId ? 'Saving...' : 'Adding Item...') });
handleManagerAddInventorySubmit = kdGuard(handleManagerAddInventorySubmit, submit('Adding Item...', 'Saving inventory item...'));
deleteInventory = kdGuard(deleteInventory, del('inventory'));
editInventory = kdGuard(editInventory, open('inventory'));
openManagerEditInventoryModal = kdGuard(openManagerEditInventoryModal, open('managerInventory'));
loadInventoryList = kdWrapLoader(loadInventoryList, { target: 'adminInventoryList', loading: 'Loading inventory records...', empty: 'No inventory items found', error: 'Unable to load inventory records.' });
loadStaffInventoryList = kdWrapLoader(loadStaffInventoryList, { target: 'staffInventoryList', loading: 'Loading inventory records...', empty: 'No inventory items found', error: 'Unable to load inventory records.' });
loadManagerInventoryList = kdWrapLoader(loadManagerInventoryList, { target: 'managerInventoryList', loading: 'Loading inventory records...', empty: 'No inventory items found', error: 'Unable to load inventory records.' });