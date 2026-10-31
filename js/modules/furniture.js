// =============================================================================
// K-DESK · furniture.js
// furniture
// Cut from the original main.js (lines 1382-5317 region). Code is unchanged except where a comment says otherwise.
// =============================================================================

import { API, API_URL, formatCurrency, getDiscountInfo, getEffectivePrice, renderPriceHTML } from './core.js';
import { hideModal, kdConfirm, kdFormOptions as submit, kdGuard, kdOpenOptions as open, kdWrapLoader, kdWrapPage, renderPagination, showModal, showToast } from './ui.js';
import { KDeskDimensions, adminDimensionCell, fillFurnitureDimensionInputs, readFurnitureDimensionInputs, renderFurnitureDimensions } from './dimensions.js';

// =============================================================================
// ADMIN MODULE - FURNITURE MANAGEMENT
// =============================================================================
let editingFurnitureId = null;

let allFurnitureProducts = [];

let adminFurnitureItems = [];
export const FURNITURE_PAGE_SIZE = 10;
let adminFurniturePage = 1;
let adminFurnitureSearchLast = '';
let adminFurnitureCategoryLast = 'all';

export function getAdminFurnitureState() {
  return {
    items: [...adminFurnitureItems],
    page: adminFurniturePage,
    pageSize: FURNITURE_PAGE_SIZE
  };
}

export function setAdminFurnitureItemsForTest(items) {
  adminFurnitureItems = Array.isArray(items) ? [...items] : [];
}

export async function loadFurnitureList() {
  try {
    const result = await API.getFurniture();
    if (result && result.success) {
      adminFurnitureItems = result.data || [];
      filterAdminFurnitureList();
    }
  } catch (error) {
    showToast('❌ Failed to load furniture list', 'error');
  }
}

export function renderAdminFurnitureTable(items, totalFilteredCount = (items ? items.length : 0)) {
  const tbody = document.getElementById('furnitureList');
  if (!tbody) return;
  tbody.innerHTML = '';
  if (!adminFurnitureItems || adminFurnitureItems.length === 0) {
    tbody.innerHTML = '<tr class="no-data-row"><td colspan="7" style="text-align:center;color:#9ca3af;padding:2rem;">No furniture items found.</td></tr>';
    return;
  }
  if (totalFilteredCount === 0 || !items || items.length === 0) {
    tbody.innerHTML = '<tr class="no-data-row"><td colspan="7" style="text-align:center;color:#9ca3af;padding:2rem;">No furniture items match your search or filters.</td></tr>';
    return;
  }
  items.forEach(item => {
    tbody.innerHTML += `
      <tr>
        <td>${item.image ? `<img src="${item.image}" alt="${item.name}" style="width:50px;height:50px;object-fit:cover;border-radius:0.375rem;">` : '<span style="color:#9ca3af;">No image</span>'}</td>
        <td>${item.name}</td>
        <td>${item.category}</td>
        <td>${item.material || 'N/A'}</td>
        <td>${adminDimensionCell(item)}</td>
        <td>${(() => { const d = getDiscountInfo(item); return d.isDiscounted ? `<span style="text-decoration:line-through;color:#9ca3af;font-size:0.85rem;">${formatCurrency(d.regular)}</span><br><strong style="color:#DC143C;">${formatCurrency(d.final)}</strong> <span style="font-size:0.75rem;color:#DC143C;">(${d.percent}% OFF)</span>` : formatCurrency(item.price); })()}</td>
        <td>
          <button class="action-btn edit" onclick="editFurniture(${item.id})" title="Edit"><svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"></path><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"></path></svg></button>
        </td>
      </tr>`;
  });
}

export function filterAdminFurnitureList(targetPage) {
  const searchInput = document.getElementById('adminFurnitureSearch');
  const categoryFilter = document.getElementById('adminCategoryFilter');

  const currentSearch = (searchInput && searchInput.value ? searchInput.value.trim().toLowerCase() : '');
  const currentCategory = (categoryFilter && categoryFilter.value ? categoryFilter.value : 'all');

  if (typeof targetPage === 'number') {
    adminFurniturePage = targetPage;
  } else if (currentSearch !== adminFurnitureSearchLast || currentCategory !== adminFurnitureCategoryLast) {
    adminFurniturePage = 1;
  }
  adminFurnitureSearchLast = currentSearch;
  adminFurnitureCategoryLast = currentCategory;

  let filtered = [...adminFurnitureItems];
  if (currentSearch) {
    filtered = filtered.filter(item =>
      (item.name && item.name.toLowerCase().includes(currentSearch)) ||
      (item.category && item.category.toLowerCase().includes(currentSearch)) ||
      (item.material && item.material.toLowerCase().includes(currentSearch))
    );
  }
  if (currentCategory !== 'all') {
    filtered = filtered.filter(item => item.category === currentCategory);
  }

  const totalItems = filtered.length;
  const totalPages = Math.max(1, Math.ceil(totalItems / FURNITURE_PAGE_SIZE));
  if (adminFurniturePage > totalPages) {
    adminFurniturePage = totalPages;
  }
  if (adminFurniturePage < 1) {
    adminFurniturePage = 1;
  }

  const startIndex = (adminFurniturePage - 1) * FURNITURE_PAGE_SIZE;
  const pagedItems = filtered.slice(startIndex, startIndex + FURNITURE_PAGE_SIZE);

  renderAdminFurnitureTable(pagedItems, totalItems);
  renderPagination({
    containerId: 'adminFurniturePagination',
    totalItems,
    currentPage: adminFurniturePage,
    pageSize: FURNITURE_PAGE_SIZE,
    onPageChange: (newPage) => filterAdminFurnitureList(newPage),
    ariaLabel: 'Furniture Pagination'
  });
}

export function initAdminFurnitureSearch() {
  const searchInput = document.getElementById('adminFurnitureSearch');
  if (searchInput && searchInput.dataset.kdBound !== '1') {
    searchInput.dataset.kdBound = '1';
    searchInput.addEventListener('input', () => {
      adminFurniturePage = 1;
      filterAdminFurnitureList();
    });
  }
  const categoryFilter = document.getElementById('adminCategoryFilter');
  if (categoryFilter && categoryFilter.dataset.kdBound !== '1') {
    categoryFilter.dataset.kdBound = '1';
    categoryFilter.addEventListener('change', () => {
      adminFurniturePage = 1;
      filterAdminFurnitureList();
    });
  }
}

export async function loadPublicFurnitureList() {
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
    card.addEventListener('click', () => {
      try { sessionStorage.setItem('selectedFurnitureId', String(product.id)); } catch (e) { /* ignore */ }
      window.location.href = `furniture-detail.html?id=${product.id}`;
    });
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
export async function loadSpecialOffers() {
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
          <a href="furniture-detail.html?id=${product.id}" class="btn btn-accent" style="display:block;text-align:center;margin-top:1rem;text-decoration:none;" onclick="event.stopPropagation(); try { sessionStorage.setItem('selectedFurnitureId', '${product.id}'); } catch (e) {}">View Furniture</a>
        </div>`;
      card.addEventListener('click', () => {
      try { sessionStorage.setItem('selectedFurnitureId', String(product.id)); } catch (e) { /* ignore */ }
      window.location.href = `furniture-detail.html?id=${product.id}`;
    });
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

export function initFurnitureListFilters() {
  ['searchInput', 'categoryFilter', 'priceFilter', 'discountFilter', 'sortFilter'].forEach(id => {
    const el = document.getElementById(id);
    if (el) el.addEventListener(id === 'searchInput' ? 'input' : 'change', filterAndSortProducts);
  });
}

function getProductIdFromURL() {
  const urlId = new URLSearchParams(window.location.search).get('id');
  if (urlId) {
    try { sessionStorage.setItem('selectedFurnitureId', String(urlId)); } catch (e) { /* ignore */ }
    return urlId;
  }
  let storedId = null;
  try { storedId = sessionStorage.getItem('selectedFurnitureId'); } catch (e) { storedId = null; }
  if (storedId) {
    try { window.history.replaceState({}, '', `${window.location.pathname}?id=${encodeURIComponent(storedId)}`); } catch (e) { /* ignore */ }
  }
  return storedId;
}

export async function loadFurnitureDetail() {
  const productId = getProductIdFromURL();
  if (!productId) { window.location.href = 'furniture-list.html'; return; }
  try {
    const response = await fetch(`${API_URL}/products/${encodeURIComponent(productId)}`);
    const result = await response.json();
    if (result.success && result.data) {
      displayFurnitureDetail(result.data);
    } else {
      try { sessionStorage.removeItem('selectedFurnitureId'); } catch (e) { /* ignore */ }
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
  renderFurnitureDimensions(product);
  setEl('productDescription', product.description || 'No description available.');
  document.title = `${product.name} - ECL FURNITURE MART`;
}

// Furniture Management only edits furniture-specific details. Name, category, original price and image are
// controlled by Inventory Management, so they are shown read-only here and are never sent to the server.
let editingFurniturePrice = null;

export async function handleFurnitureSubmit(event) {
  event.preventDefault();
  if (!editingFurnitureId) { showToast('Please choose a furniture item to edit', 'warning'); return; }
  const dimInput = readFurnitureDimensionInputs();
  if (!dimInput.ok) { showToast(dimInput.message, 'warning'); return; }
  const dimensionsText = `${dimInput.cm.furnitureLength}cm x ${dimInput.cm.furnitureWidth}cm x ${dimInput.cm.furnitureHeight}cm`;
  // Sanity check by furniture type: asks for confirmation, never blocks or changes the numbers
  if (typeof KDeskDimensions !== 'undefined' && editingFurnitureMeta) {
    const check = KDeskDimensions.resolve({ ...editingFurnitureMeta, dimensions: dimensionsText });
    if (check.status === 'review' && !(await kdConfirm(`${check.message}\n\nThese sizes look unusual for this furniture type. Save them anyway?`, { title: 'Confirm Unusual Dimensions', confirmText: 'Save Anyway' }))) return;
  }
  const discountRaw = (document.getElementById('furnitureDiscountedPrice') || { value: '' }).value.trim();
  let discountedPrice = null;
  if (discountRaw !== '') {
    discountedPrice = Number(discountRaw);
    if (!Number.isFinite(discountedPrice)) { showToast('Discounted price must be a valid number', 'warning'); return; }
    if (discountedPrice <= 0) { showToast('Discounted price must be greater than 0', 'warning'); return; }
    if (Number.isFinite(editingFurniturePrice) && discountedPrice >= editingFurniturePrice) { showToast('Discounted price must be lower than the regular price', 'warning'); return; }
  }
  const data = {
    discounted_price: discountedPrice,
    material: document.getElementById('furnitureMaterial').value,
    dimensions: dimensionsText,
    description: document.getElementById('furnitureDescription').value
  };
  try {
    const result = await API.updateFurniture(editingFurnitureId, data);
    if (result.success) { showToast(result.message, 'success'); hideModal('furnitureModal'); loadFurnitureList(); }
    else showToast('❌ ' + result.message, 'error');
  } catch (error) { showToast('❌ Failed to save furniture', 'error'); }
}

export async function editFurniture(id) {
  try {
    const result = await API.getFurniture();
    if (result.success) {
      const item = result.data.find(f => f.id === id);
      if (!item) { showToast('Furniture not found', 'error'); return; }
      editingFurnitureId = id;
      editingFurniturePrice = parseFloat(item.price);
      document.getElementById('furnitureForm').reset();
      document.getElementById('furnitureModalTitle').textContent = 'Edit Furniture Details';
      const sourceInfo = document.getElementById('furnitureSourceInfo');
      if (sourceInfo) sourceInfo.textContent = `${item.name} · ${item.category} · ${formatCurrency(item.price)}`;
      const discountInput = document.getElementById('furnitureDiscountedPrice');
      if (discountInput) discountInput.value = (item.discounted_price !== null && item.discounted_price !== undefined) ? item.discounted_price : '';
      document.getElementById('furnitureMaterial').value = item.material || '';
      editingFurnitureMeta = { name: item.name, category: item.category };
      // Load the stored cm values into the inch fields (clears first, so nothing from a previous item carries over)
      const dimsRead = fillFurnitureDimensionInputs(item.dimensions);
      if (item.dimensions && !dimsRead) showToast('The saved dimensions could not be read. Please enter them again.', 'info');
      document.getElementById('furnitureDescription').value = item.description || '';
      showModal('furnitureModal');
    } else {
      showToast('❌ ' + (result.message || 'Failed to load furniture details'), 'error');
    }
  } catch (error) { showToast('❌ Failed to load furniture details', 'error'); }
}

          // fieldId -> { cm: number|null, untouched: boolean }
let editingFurnitureMeta = null;


// ---- loading / duplicate-click protection (helpers live in ui.js; each function is wrapped once, here, where it is defined) ----
handleFurnitureSubmit = kdGuard(handleFurnitureSubmit, submit('Saving...', 'Saving changes...'));
editFurniture = kdGuard(editFurniture, open('furniture'));
loadFurnitureList = kdWrapLoader(loadFurnitureList, { target: 'furnitureList', loading: 'Loading furniture...', empty: 'No furniture found', error: 'Unable to load furniture.' });
loadFurnitureDetail = kdWrapPage(loadFurnitureDetail, 'Loading furniture details...');