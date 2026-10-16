/* =============================================================================
 * K-Desk | js/modules/inventory.js
 * Inventory (Admin)
 * -----------------------------------------------------------------------------
 * WHAT IT DOES : Admin Inventory Management: list, add, edit (with image upload) and delete stock items.
 * DEPENDS ON   : API, utils.js, fileToBase64. Also reloads the furniture list because both share data.
 * LOAD ORDER   : file 10 of 19 (see scripts-block.html). These are plain scripts that share one
 *                global scope, so inline onclick="..." handlers in the HTML keep working.
 * CONTENTS     :
 * editingInventoryId, currentStockImage, loadInventoryList, openAddInventoryModal,
 * handleStockImageUpload, handleInventorySubmit, editInventory, deleteInventory
 * ============================================================================= */

// =============================================================================
// ADMIN MODULE - INVENTORY MANAGEMENT
// =============================================================================
let editingInventoryId = null;
let currentStockImage = null;

// Admin: loads the inventory and fills the Inventory table.
async function loadInventoryList() {
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

// Admin: opens the empty Add Stock Item modal.
function openAddInventoryModal() {
  editingInventoryId = null;
  currentStockImage = null;
  document.getElementById('stockModalTitle').textContent = 'Add New Stock Item';
  document.getElementById('stockForm').reset();
  const preview = document.getElementById('stockImagePreview');
  if (preview) preview.style.display = 'none';
  showModal('stockModal');
}

// Admin: checks the chosen stock image (image type, max 5 MB), converts it to base64 and shows a preview.
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

// Admin: creates or updates an inventory item (the linked furniture record is kept in sync).
async function handleInventorySubmit(event) {
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

// Admin: opens the Edit Stock Item modal filled with the selected item.
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
      document.getElementById('stockPrice').value = item.price !== null && item.price !== undefined ? item.price : '';
      const preview = document.getElementById('stockImagePreview');
      const previewImg = document.getElementById('stockImagePreviewImg');
      if (item.image && preview && previewImg) { previewImg.src = item.image; preview.style.display = 'block'; }
      else if (preview) { preview.style.display = 'none'; }
      showModal('stockModal');
    }
  } catch (error) { showToast('❌ Failed to load inventory details', 'error'); }
}

// Admin: deletes an inventory item (its linked furniture record is removed too).
async function deleteInventory(id) {
  if (!confirm('Are you sure you want to delete this inventory item?\n\nIt will also be removed from Furniture Management and the customer furniture list.')) return;
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
