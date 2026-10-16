/* =============================================================================
 * K-Desk | js/modules/staff-manager-inventory.js
 * Inventory (Staff and Manager)
 * -----------------------------------------------------------------------------
 * WHAT IT DOES : Staff view-only inventory list, and the Manager inventory table with add / edit (price, stock, image).
 * DEPENDS ON   : API, utils.js, fileToBase64.
 * LOAD ORDER   : file 14 of 19 (see scripts-block.html). These are plain scripts that share one
 *                global scope, so inline onclick="..." handlers in the HTML keep working.
 * CONTENTS     :
 * loadStaffInventoryList, loadManagerInventoryList, currentManagerStockImage,
 * openAddManagerInventoryModal, handleManagerAddStockImageUpload, handleManagerAddInventorySubmit,
 * openManagerEditInventoryModal, handleManagerEditStockImageUpload, updateManagerStockPreview
 * ============================================================================= */

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

// =============================================================================
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
    }
  } catch (error) {
    const container = document.getElementById('managerInventoryList');
    if (container) container.innerHTML = '<p style="text-align:center;color:#ef4444;padding:2rem;">❌ Failed to load inventory</p>';
  }
}

let currentManagerStockImage = null;

// Manager: opens the empty Add Stock modal.
function openAddManagerInventoryModal() {
  currentManagerStockImage = null;
  const form = document.getElementById('managerAddInventoryForm');
  if (form) form.reset();
  const preview = document.getElementById('managerStockImagePreview');
  if (preview) preview.style.display = 'none';
  showModal('managerAddInventoryModal');
}

// Manager: checks the chosen image (type, max 5 MB), converts it to base64 and shows a preview.
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

// Manager: adds a new inventory item.
async function handleManagerAddInventorySubmit(event) {
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

// Manager: opens the Edit Stock modal filled with the selected item.
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

// Manager: checks the new image for the edit modal, converts it to base64 and shows a preview.
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

// Manager: shows "Low Stock" (10 or less) or "In Stock" while the quantity is typed.
function updateManagerStockPreview(quantity) {
  const preview = document.getElementById('managerStockPreview');
  if (!preview) return;
  const qty = parseInt(quantity) || 0;
  preview.textContent = qty <= 10 ? 'Low Stock' : 'In Stock';
  preview.style.color = qty <= 10 ? '#991b1b' : '#065f46';
}
