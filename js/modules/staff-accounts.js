// =============================================================================
// K-DESK · staff-accounts.js
// staff-accounts (Active & Deactivated Tabs, Filters, Pagination, and Security)
// =============================================================================

import { API, escapeHtmlText, formatDate, formatDateTime, formatPhoneForDisplay, kdCreateOnce, normalizePhPhoneClient, validatePhPhoneClient } from './core.js';
import { hideModal, kdConfirm, kdFormOptions as submit, kdGuard, kdWrapLoader, renderPagination, showToast } from './ui.js';
import { isDriverRole, normalizeRole } from './auth.js';

let staffAccountsCache = {};
let activeStaffAccounts = [];
let deactivatedStaffAccounts = [];
let currentStaffSubtab = 'active';

// Active tab pagination & search
let activeSearchQuery = '';
let activeRoleFilter = 'all';
let activeStaffPage = 1;

// Deactivated tab pagination & search
let deactivatedSearchQuery = '';
let deactivatedRoleFilter = 'all';
let deactivatedStaffPage = 1;

const STAFF_PAGE_SIZE = 10;
let staffControlsInitialized = false;
let staffEditSubmitting = false;

function renderStaffRoleBadge(role) {
  const norm = normalizeRole(role);
  let cls = 'kd-role-staff';
  let label = 'Staff';
  if (norm === 'manager') {
    cls = 'kd-role-manager';
    label = 'Manager';
  } else if (norm === 'delivery_driver' || isDriverRole(role)) {
    cls = 'kd-role-driver';
    label = 'Delivery Driver';
  } else if (norm === 'admin') {
    cls = 'kd-role-admin';
    label = 'Admin';
  }
  return `<span class="kd-role-pill ${cls}">${label}</span>`;
}

function renderStaffStatusBadge(isActive) {
  if (isActive) {
    return `<span class="kd-status-pill kd-status-active"><span class="kd-chip-dot"></span>Active</span>`;
  }
  return `<span class="kd-status-pill kd-status-deactivated"><span class="kd-chip-dot"></span>Deactivated</span>`;
}

export function filterActiveStaffAccounts(page = 1) {
  activeStaffPage = page;
  const tbody = document.getElementById('staffAccountsList');
  if (!tbody) return;
  tbody.innerHTML = '';

  let filtered = [...activeStaffAccounts];
  if (activeRoleFilter && activeRoleFilter !== 'all') {
    filtered = filtered.filter(item => normalizeRole(item.role) === activeRoleFilter);
  }
  if (activeSearchQuery) {
    const q = activeSearchQuery.toLowerCase();
    filtered = filtered.filter(item => {
      const name = String(item.name || '').toLowerCase();
      const email = String(item.email || '').toLowerCase();
      const phone = String(item.phone || '').toLowerCase();
      return name.includes(q) || email.includes(q) || phone.includes(q);
    });
  }

  const totalItems = filtered.length;
  const totalPages = Math.max(1, Math.ceil(totalItems / STAFF_PAGE_SIZE));
  if (activeStaffPage > totalPages) activeStaffPage = totalPages;

  const startIdx = (activeStaffPage - 1) * STAFF_PAGE_SIZE;
  const pagedItems = filtered.slice(startIdx, startIdx + STAFF_PAGE_SIZE);

  const summaryEl = document.getElementById('adminActiveStaffSummary');
  if (summaryEl) {
    if (totalItems === 0) {
      summaryEl.textContent = '0 accounts';
    } else {
      const endIdx = Math.min(startIdx + STAFF_PAGE_SIZE, totalItems);
      summaryEl.textContent = `Showing ${startIdx + 1}–${endIdx} of ${totalItems} active accounts`;
    }
  }

  if (pagedItems.length === 0) {
    const msg = activeStaffAccounts.length === 0
      ? 'No active staff accounts found'
      : 'No active accounts match your search or filter.';
    tbody.innerHTML = `<tr><td colspan="7" style="text-align:center;color:#9ca3af;padding:2rem;">${msg}</td></tr>`;
    renderPagination({
      containerId: 'adminActiveStaffPagination',
      totalItems: 0,
      currentPage: 1,
      pageSize: STAFF_PAGE_SIZE,
      onPageChange: () => {},
      ariaLabel: 'Active Staff Pagination'
    });
    return;
  }

  pagedItems.forEach(item => {
    const role = normalizeRole(item.role);
    const canEdit = ['staff', 'manager', 'delivery_driver'].includes(role);
    const editBtn = canEdit
      ? `<button class="kd-icon-btn edit" onclick="openEditStaffModal(${item.id})" title="Edit Account" style="margin-right:0.35rem;"><svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"></path><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"></path></svg></button>`
      : '';
    const deactivateBtn = `<button class="kd-btn-deactivate" onclick="deactivateStaffAccount(${item.id})" title="Deactivate Account"><svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="10"></circle><line x1="4.93" y1="4.93" x2="19.07" y2="19.07"></line></svg><span>Deactivate</span></button>`;

    tbody.innerHTML += `
      <tr>
        <td><span style="font-weight:600;color:#111827;">${escapeHtmlText(item.name || '')}</span></td>
        <td><span style="color:#4b5563;font-size:0.875rem;">${escapeHtmlText(item.email || '')}</span></td>
        <td>${renderStaffRoleBadge(item.role)}</td>
        <td>${item.phone ? `<span style="color:#4b5563;font-variant-numeric:tabular-nums;">${escapeHtmlText(formatPhoneForDisplay(item.phone))}</span>` : '<span style="color:#9ca3af;font-size:0.8125rem;">Not set</span>'}</td>
        <td>${renderStaffStatusBadge(true)}</td>
        <td><span style="color:#64748b;font-size:0.8125rem;">${formatDate(item.created_at)}</span></td>
        <td style="text-align:center;">
          <div style="display:inline-flex;align-items:center;justify-content:center;">
            ${editBtn}${deactivateBtn}
          </div>
        </td>
      </tr>`;
  });

  renderPagination({
    containerId: 'adminActiveStaffPagination',
    totalItems,
    currentPage: activeStaffPage,
    pageSize: STAFF_PAGE_SIZE,
    onPageChange: (newPage) => filterActiveStaffAccounts(newPage),
    ariaLabel: 'Active Staff Pagination'
  });
}

export function filterDeactivatedStaffAccounts(page = 1) {
  deactivatedStaffPage = page;
  const tbody = document.getElementById('deactivatedStaffAccountsList');
  if (!tbody) return;
  tbody.innerHTML = '';

  let filtered = [...deactivatedStaffAccounts];
  if (deactivatedRoleFilter && deactivatedRoleFilter !== 'all') {
    filtered = filtered.filter(item => normalizeRole(item.role) === deactivatedRoleFilter);
  }
  if (deactivatedSearchQuery) {
    const q = deactivatedSearchQuery.toLowerCase();
    filtered = filtered.filter(item => {
      const name = String(item.name || '').toLowerCase();
      const email = String(item.email || '').toLowerCase();
      const phone = String(item.phone || '').toLowerCase();
      return name.includes(q) || email.includes(q) || phone.includes(q);
    });
  }

  const totalItems = filtered.length;
  const totalPages = Math.max(1, Math.ceil(totalItems / STAFF_PAGE_SIZE));
  if (deactivatedStaffPage > totalPages) deactivatedStaffPage = totalPages;

  const startIdx = (deactivatedStaffPage - 1) * STAFF_PAGE_SIZE;
  const pagedItems = filtered.slice(startIdx, startIdx + STAFF_PAGE_SIZE);

  const summaryEl = document.getElementById('adminDeactivatedStaffSummary');
  if (summaryEl) {
    if (totalItems === 0) {
      summaryEl.textContent = '0 accounts';
    } else {
      const endIdx = Math.min(startIdx + STAFF_PAGE_SIZE, totalItems);
      summaryEl.textContent = `Showing ${startIdx + 1}–${endIdx} of ${totalItems} deactivated accounts`;
    }
  }

  if (pagedItems.length === 0) {
    const msg = deactivatedStaffAccounts.length === 0
      ? 'No deactivated accounts found'
      : 'No deactivated accounts match your search or filter.';
    tbody.innerHTML = `<tr><td colspan="7" style="text-align:center;color:#9ca3af;padding:2rem;">${msg}</td></tr>`;
    renderPagination({
      containerId: 'adminDeactivatedStaffPagination',
      totalItems: 0,
      currentPage: 1,
      pageSize: STAFF_PAGE_SIZE,
      onPageChange: () => {},
      ariaLabel: 'Deactivated Staff Pagination'
    });
    return;
  }

  pagedItems.forEach(item => {
    const reactivateBtn = `<button class="kd-btn-reactivate" onclick="activateStaffAccount(${item.id})" title="Reactivate Account"><svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"></path><polyline points="22 4 12 14.01 9 11.01"></polyline></svg><span>Reactivate</span></button>`;
    const deactDate = item.deactivated_at
      ? formatDate(item.deactivated_at)
      : (item.created_at ? formatDate(item.created_at) : '<span style="color:#9ca3af;font-size:0.8125rem;">Deactivated</span>');

    tbody.innerHTML += `
      <tr>
        <td><span style="font-weight:600;color:#111827;">${escapeHtmlText(item.name || '')}</span></td>
        <td><span style="color:#4b5563;font-size:0.875rem;">${escapeHtmlText(item.email || '')}</span></td>
        <td>${renderStaffRoleBadge(item.role)}</td>
        <td>${item.phone ? `<span style="color:#4b5563;font-variant-numeric:tabular-nums;">${escapeHtmlText(formatPhoneForDisplay(item.phone))}</span>` : '<span style="color:#9ca3af;font-size:0.8125rem;">Not set</span>'}</td>
        <td>${renderStaffStatusBadge(false)}</td>
        <td><span style="color:#64748b;font-size:0.8125rem;">${deactDate}</span></td>
        <td style="text-align:center;">
          <div style="display:inline-flex;align-items:center;justify-content:center;">
            ${reactivateBtn}
          </div>
        </td>
      </tr>`;
  });

  renderPagination({
    containerId: 'adminDeactivatedStaffPagination',
    totalItems,
    currentPage: deactivatedStaffPage,
    pageSize: STAFF_PAGE_SIZE,
    onPageChange: (newPage) => filterDeactivatedStaffAccounts(newPage),
    ariaLabel: 'Deactivated Staff Pagination'
  });
}

export function switchAdminStaffSubtab(tab) {
  currentStaffSubtab = tab;
  const activeBtn = document.getElementById('adminStaffTabActive');
  const deactBtn = document.getElementById('adminStaffTabDeactivated');
  const activeView = document.getElementById('adminStaffActiveView');
  const deactView = document.getElementById('adminStaffDeactivatedView');

  if (tab === 'deactivated') {
    if (activeBtn) activeBtn.classList.remove('active');
    if (deactBtn) deactBtn.classList.add('active');
    if (activeView) activeView.style.display = 'none';
    if (deactView) deactView.style.display = 'block';
    filterDeactivatedStaffAccounts(deactivatedStaffPage);
  } else {
    if (deactBtn) deactBtn.classList.remove('active');
    if (activeBtn) activeBtn.classList.add('active');
    if (deactView) deactView.style.display = 'none';
    if (activeView) activeView.style.display = 'block';
    filterActiveStaffAccounts(activeStaffPage);
  }
}

export function initAdminStaffControls() {
  if (staffControlsInitialized) return;
  staffControlsInitialized = true;

  // Active accounts search & filter
  const activeSearch = document.getElementById('adminActiveStaffSearch');
  if (activeSearch) {
    activeSearch.addEventListener('input', (e) => {
      activeSearchQuery = e.target.value.trim();
      filterActiveStaffAccounts(1);
    });
  }
  const activeRole = document.getElementById('adminActiveStaffRoleFilter');
  if (activeRole) {
    activeRole.addEventListener('change', (e) => {
      activeRoleFilter = e.target.value;
      filterActiveStaffAccounts(1);
    });
  }
  const activeReset = document.getElementById('adminActiveStaffResetFilters');
  if (activeReset) {
    activeReset.addEventListener('click', () => {
      if (activeSearch) activeSearch.value = '';
      if (activeRole) activeRole.value = 'all';
      activeSearchQuery = '';
      activeRoleFilter = 'all';
      filterActiveStaffAccounts(1);
    });
  }

  // Deactivated accounts search & filter
  const deactSearch = document.getElementById('adminDeactivatedStaffSearch');
  if (deactSearch) {
    deactSearch.addEventListener('input', (e) => {
      deactivatedSearchQuery = e.target.value.trim();
      filterDeactivatedStaffAccounts(1);
    });
  }
  const deactRole = document.getElementById('adminDeactivatedStaffRoleFilter');
  if (deactRole) {
    deactRole.addEventListener('change', (e) => {
      deactivatedRoleFilter = e.target.value;
      filterDeactivatedStaffAccounts(1);
    });
  }
  const deactReset = document.getElementById('adminDeactivatedStaffResetFilters');
  if (deactReset) {
    deactReset.addEventListener('click', () => {
      if (deactSearch) deactSearch.value = '';
      if (deactRole) deactRole.value = 'all';
      deactivatedSearchQuery = '';
      deactivatedRoleFilter = 'all';
      filterDeactivatedStaffAccounts(1);
    });
  }
}

export async function loadStaffAccountsList() {
  initAdminStaffControls();
  const activeTbody = document.getElementById('staffAccountsList');
  const deactTbody = document.getElementById('deactivatedStaffAccountsList');
  if (activeTbody && activeStaffAccounts.length === 0) {
    activeTbody.innerHTML = '<tr><td colspan="7" style="text-align:center;color:#6b7280;padding:2rem;"><span class="kd-spinner" aria-hidden="true"></span>Loading active accounts...</td></tr>';
  }
  if (deactTbody && deactivatedStaffAccounts.length === 0) {
    deactTbody.innerHTML = '<tr><td colspan="7" style="text-align:center;color:#6b7280;padding:2rem;"><span class="kd-spinner" aria-hidden="true"></span>Loading deactivated accounts...</td></tr>';
  }

  try {
    const result = await API.getStaff();
    if (result.success) {
      staffAccountsCache = {};
      activeStaffAccounts = [];
      deactivatedStaffAccounts = [];

      (result.data || []).forEach(item => {
        const isActive = item.is_active !== false && String(item.status || '').toLowerCase() !== 'deactivated';
        const record = { ...item, is_active: isActive };
        staffAccountsCache[item.id] = record;
        if (isActive) {
          activeStaffAccounts.push(record);
        } else {
          deactivatedStaffAccounts.push(record);
        }
      });

      // Update tab badges
      const activeBadge = document.getElementById('adminStaffActiveBadge');
      if (activeBadge) {
        activeBadge.textContent = activeStaffAccounts.length;
        activeBadge.style.display = activeStaffAccounts.length > 0 ? 'inline-block' : 'none';
      }
      const deactBadge = document.getElementById('adminStaffDeactivatedBadge');
      if (deactBadge) {
        deactBadge.textContent = deactivatedStaffAccounts.length;
        deactBadge.style.display = deactivatedStaffAccounts.length > 0 ? 'inline-block' : 'none';
      }

      filterActiveStaffAccounts(activeStaffPage);
      filterDeactivatedStaffAccounts(deactivatedStaffPage);
    } else {
      showToast('❌ ' + (result.message || 'Failed to load accounts'), 'error');
    }
  } catch (error) {
    showToast('❌ Failed to load accounts', 'error');
  }
}

export function openAddStaffModal() {
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
              <label class="form-label">Phone Number</label>
              <input type="tel" id="staffAccountPhone" class="form-input" inputmode="tel" autocomplete="off" maxlength="20" placeholder="e.g. 09171234567" required>
              <small style="color:#6b7280;font-size:0.75rem;">Philippine mobile number. The SMS verification code is sent here at login.</small>
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
                <option value="delivery_driver">Delivery Driver</option>
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
    phone: document.getElementById('staffAccountPhone').value.trim(),
    password: document.getElementById('staffAccountPassword').value,
    role: document.getElementById('staffAccountRole').value
  };
  const phoneProblem = validatePhPhoneClient(data.phone);
  if (phoneProblem) { showToast(phoneProblem, 'warning'); return; }
  try {
    const result = await kdCreateOnce('staff-create', data, API.createStaff);
    if (result.success) {
      showToast(result.message, 'success');
      hideModal('staffAccountModal');
      document.getElementById('staffAccountModal').remove();
      loadStaffAccountsList();
    } else showToast('❌ ' + result.message, 'error');
  } catch (error) { showToast('❌ Failed to create account', 'error'); }
}

export async function deactivateStaffAccount(id) {
  const account = staffAccountsCache[id];
  const currentUser = JSON.parse(sessionStorage.getItem('currentUser') || '{}');
  if (currentUser && currentUser.id && String(currentUser.id) === String(id)) {
    showToast('You cannot deactivate your own account.', 'warning');
    return;
  }
  const label = account && account.name ? `${account.name} (${account.email})` : 'this account';
  const confirmed = await kdConfirm(
    `Are you sure you want to deactivate ${label}?\n\nThis account will lose access to the system and will not be able to log in until reactivated by an administrator.`,
    { title: 'Deactivate Account', confirmText: 'Deactivate Account' }
  );
  if (!confirmed) return;

  try {
    const result = await API.deactivateStaff(id);
    if (result && result.success) {
      showToast(result.message || 'Account deactivated successfully.', 'success');
      await loadStaffAccountsList();
    } else {
      showToast('❌ ' + ((result && result.message) || 'Failed to deactivate account'), 'error');
    }
  } catch (error) {
    showToast('❌ Failed to deactivate account', 'error');
  }
}

export async function activateStaffAccount(id) {
  const account = staffAccountsCache[id];
  const label = account && account.name ? `${account.name} (${account.email})` : 'this account';
  const confirmed = await kdConfirm(
    `Are you sure you want to reactivate ${label}?\n\nThis account will regain access to the system with its existing role and account information.`,
    { title: 'Reactivate Account', confirmText: 'Reactivate Account' }
  );
  if (!confirmed) return;

  try {
    const result = await API.activateStaff(id);
    if (result && result.success) {
      showToast(result.message || 'Account reactivated successfully.', 'success');
      await loadStaffAccountsList();
    } else {
      showToast('❌ ' + ((result && result.message) || 'Failed to reactivate account'), 'error');
    }
  } catch (error) {
    showToast('❌ Failed to reactivate account', 'error');
  }
}

export function closeEditStaffModal() {
  const modal = document.getElementById('editStaffAccountModal');
  if (modal) modal.remove();
}

export function openEditStaffModal(id) {
  const account = staffAccountsCache[id];
  // Staff, Manager, and Delivery Driver accounts are editable here (the backend enforces this again; Admin accounts are not)
  if (!account) { showToast('Account not found. Please refresh the list.', 'error'); return; }
  const currentRole = normalizeRole(account.role);
  if (!['staff', 'manager', 'delivery_driver'].includes(currentRole)) { showToast('Only Staff, Manager, and Delivery Driver accounts can be edited here.', 'error'); return; }
  closeEditStaffModal();
  const roleTitle = currentRole === 'manager' ? 'Edit Manager Account' : (currentRole === 'delivery_driver' ? 'Edit Delivery Driver Account' : 'Edit Staff Account');
  const modalHTML = `
    <div id="editStaffAccountModal" class="modal active">
      <div class="modal-content">
        <div class="modal-header">
          <h3 class="modal-title">${roleTitle}</h3>
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
              <label class="form-label">Phone Number</label>
              <input type="tel" id="editStaffAccountPhone" class="form-input" inputmode="tel" autocomplete="off" maxlength="20" placeholder="e.g. 09171234567" required>
              <small style="color:#6b7280;font-size:0.75rem;">Philippine mobile number. The SMS verification code is sent here at login.</small>
            </div>
            <div class="form-group">
              <label class="form-label">Role</label>
              <select id="editStaffAccountRole" class="form-input" required>
                <option value="staff">Staff</option>
                <option value="manager">Manager</option>
                <option value="delivery_driver">Delivery Driver</option>
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
  document.getElementById('editStaffAccountPhone').value = account.phone || '';
  document.getElementById('editStaffAccountRole').value = currentRole;
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
  const phone = document.getElementById('editStaffAccountPhone').value.trim();
  const phoneProblem = validatePhPhoneClient(phone);
  if (phoneProblem) { showToast(phoneProblem, 'warning'); return; }
  const data = { name, email, role, phone };
  if (password) data.password = password; // blank = keep the current password
  staffEditSubmitting = true;
  if (btn) btn.disabled = true;
  try {
    const result = await API.updateStaff(id, data);
    if (result.success) {
      showToast(result.message || 'Account updated successfully', 'success');
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
// ADMIN - EDIT MY ACCOUNT (name, email, phone number, password; the role cannot be changed)
// =============================================================================
let myAccountSubmitting = false;

let myAccountOriginal = { email: '', phone: '' };

export function closeMyAccountModal() {
  const modal = document.getElementById('myAccountModal');
  if (modal) modal.remove();
}

export async function openMyAccountModal() {
  closeMyAccountModal();
  let account;
  try {
    const result = await API.getMyAccount();
    if (!result.success) { showToast('❌ ' + (result.message || 'Failed to load your account'), 'error'); return; }
    account = result.data;
  } catch (error) { showToast('❌ Failed to load your account', 'error'); return; }
  myAccountOriginal = {
    email: account.email || '',
    phone: normalizePhPhoneClient(account.phone),
    recoveryEmail: (account.recovery_email || '').trim(),
    recoveryEmailVerified: Boolean(account.recovery_email_verified)
  };
  const modalHTML = `
    <div id="myAccountModal" class="modal active">
      <div class="modal-content" style="max-width: 520px;">
        <div class="modal-header">
          <h3 class="modal-title">Edit My Account</h3>
          <button class="modal-close" type="button" onclick="closeMyAccountModal()">×</button>
        </div>
        <div class="modal-body">
          <form id="myAccountForm">
            <div class="form-group">
              <label class="form-label">Full Name</label>
              <input type="text" id="myAccountName" class="form-input" maxlength="100" required>
            </div>
            <div class="form-group">
              <label class="form-label">Primary Login Email</label>
              <input type="email" id="myAccountEmail" class="form-input" maxlength="254" autocomplete="username" required>
            </div>
            <div class="form-group">
              <label class="form-label">Phone Number</label>
              <input type="tel" id="myAccountPhone" class="form-input" inputmode="tel" autocomplete="off" maxlength="20" placeholder="e.g. 09171234567" required>
              <small style="color:#6b7280;font-size:0.75rem;">Philippine mobile number. Your SMS verification code is sent here at login.</small>
            </div>

            <!-- Admin Recovery Email Configuration Section -->
            <div class="form-group" style="background:#f8fafc; border:1px solid #e2e8f0; border-radius:8px; padding:14px; margin-bottom:1.25rem;">
              <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:6px;">
                <label class="form-label" style="margin-bottom:0; font-weight:600; color:#1e293b;">Admin Recovery Email</label>
                <span id="recoveryEmailStatusBadge" style="font-size:0.75rem; padding:3px 8px; border-radius:12px; font-weight:600;"></span>
              </div>
              <p style="font-size:0.75rem; color:#64748b; margin-bottom:8px; line-height:1.4;">
                Dedicated recovery email used strictly to recover Admin access if you forget your password. Must be separate from your primary login email.
              </p>
              <div style="display:flex; gap:8px;">
                <input type="email" id="myAccountRecoveryEmail" class="form-input" maxlength="254" placeholder="e.g. recovery-admin@example.com" style="flex:1;">
                <button type="button" id="myAccountSendCodeBtn" class="btn btn-secondary" style="white-space:nowrap; font-size:0.8125rem; padding:6px 12px;">
                  Verify Email
                </button>
              </div>

              <!-- Inline Verification Code Box -->
              <div id="recoveryCodeBox" style="display:none; margin-top:10px; padding:10px; background:#ffffff; border:1px solid #cbd5e1; border-radius:6px;">
                <p style="font-size:0.75rem; color:#334155; margin-bottom:6px; font-weight:500;">
                  Enter the 6-digit confirmation code sent to your recovery email:
                </p>
                <div style="display:flex; gap:8px;">
                  <input type="text" id="myAccountRecoveryCode" class="form-input" maxlength="6" placeholder="6 digits" style="width:120px; letter-spacing:0.2em; font-family:monospace; text-align:center;">
                  <button type="button" id="myAccountVerifyCodeBtn" class="btn btn-accent" style="white-space:nowrap; font-size:0.8125rem; padding:6px 12px;">
                    Confirm Code
                  </button>
                </div>
              </div>
            </div>

            <div class="form-group">
              <label class="form-label">New Password</label>
              <input type="password" id="myAccountNewPassword" class="form-input" maxlength="128" autocomplete="new-password" placeholder="Leave blank to keep your current password">
              <small style="color:#6b7280;font-size:0.75rem;">At least 8 characters.</small>
            </div>
            <div class="form-group">
              <label class="form-label">Confirm New Password</label>
              <input type="password" id="myAccountConfirmPassword" class="form-input" maxlength="128" autocomplete="new-password">
            </div>
            <div class="form-group">
              <label class="form-label">Current Password</label>
              <input type="password" id="myAccountCurrentPassword" class="form-input" maxlength="128" autocomplete="current-password">
              <small style="color:#6b7280;font-size:0.75rem;">Required to change your email, recovery email, phone number or password.</small>
            </div>
            <div style="display:flex;gap:0.75rem;margin-top:1.5rem;">
              <button type="submit" class="btn btn-accent" style="flex:1;">Save Changes</button>
              <button type="button" class="btn btn-secondary" onclick="closeMyAccountModal()" style="flex:1;">Cancel</button>
            </div>
          </form>
        </div>
      </div>
    </div>`;
  document.body.insertAdjacentHTML('beforeend', modalHTML);

  // Set form values
  document.getElementById('myAccountName').value = account.name || '';
  document.getElementById('myAccountEmail').value = account.email || '';
  document.getElementById('myAccountPhone').value = account.phone || '';
  const recoveryEmailInput = document.getElementById('myAccountRecoveryEmail');
  recoveryEmailInput.value = account.recovery_email || '';

  // Update badge display function
  function updateBadge(isVerified, hasEmail, isPending) {
    const badge = document.getElementById('recoveryEmailStatusBadge');
    const sendBtn = document.getElementById('myAccountSendCodeBtn');
    if (!badge) return;
    if (isPending) {
      badge.textContent = 'Code Sent';
      badge.style.background = '#e0f2fe';
      badge.style.color = '#0369a1';
      badge.style.border = '1px solid #7dd3fc';
      if (sendBtn) sendBtn.textContent = 'Resend Code';
    } else if (hasEmail && isVerified) {
      badge.textContent = '✓ Verified';
      badge.style.background = '#dcfce7';
      badge.style.color = '#15803d';
      badge.style.border = '1px solid #86efac';
      if (sendBtn) sendBtn.textContent = 'Re-verify';
    } else if (hasEmail && !isVerified) {
      badge.textContent = '⚠️ Unverified';
      badge.style.background = '#fef9c3';
      badge.style.color = '#854d0e';
      badge.style.border = '1px solid #fde047';
      if (sendBtn) sendBtn.textContent = 'Verify Email';
    } else {
      badge.textContent = 'Not Configured';
      badge.style.background = '#f1f5f9';
      badge.style.color = '#64748b';
      badge.style.border = '1px solid #cbd5e1';
      if (sendBtn) sendBtn.textContent = 'Verify Email';
    }
  }

  updateBadge(Boolean(account.recovery_email_verified), Boolean(account.recovery_email), false);

  // Wire send verification code button
  document.getElementById('myAccountSendCodeBtn').addEventListener('click', async () => {
    const recEmail = document.getElementById('myAccountRecoveryEmail').value.trim();
    const primaryEmail = document.getElementById('myAccountEmail').value.trim();
    const currPass = document.getElementById('myAccountCurrentPassword').value;

    if (!recEmail) {
      showToast('Please enter a recovery email address first.', 'warning');
      document.getElementById('myAccountRecoveryEmail').focus();
      return;
    }
    if (recEmail.toLowerCase() === primaryEmail.toLowerCase()) {
      showToast('Recovery email must be different from your primary login email.', 'warning');
      document.getElementById('myAccountRecoveryEmail').focus();
      return;
    }
    if (!currPass) {
      showToast('Enter your current password below to authorize sending a verification code.', 'warning');
      document.getElementById('myAccountCurrentPassword').focus();
      return;
    }

    const sendBtn = document.getElementById('myAccountSendCodeBtn');
    sendBtn.disabled = true;
    sendBtn.textContent = 'Sending…';

    try {
      const res = await API.sendRecoveryEmailCode(recEmail, currPass);
      if (res.success) {
        showToast(res.message || 'Verification code sent to recovery email.', 'success');
        updateBadge(false, true, true);
        const codeBox = document.getElementById('recoveryCodeBox');
        if (codeBox) codeBox.style.display = 'block';
        const codeInput = document.getElementById('myAccountRecoveryCode');
        if (codeInput) {
          codeInput.value = '';
          codeInput.focus();
        }
      } else {
        showToast('❌ ' + (res.message || 'Failed to send verification code.'), 'error');
      }
    } catch (err) {
      showToast('❌ Failed to reach server. Check connection.', 'error');
    } finally {
      sendBtn.disabled = false;
      sendBtn.textContent = 'Verify Email';
    }
  });

  // Wire confirm verification code button
  document.getElementById('myAccountVerifyCodeBtn').addEventListener('click', async () => {
    const code = document.getElementById('myAccountRecoveryCode').value.trim();
    if (!code || !/^\d{6}$/.test(code)) {
      showToast('Please enter the 6-digit numeric verification code.', 'warning');
      document.getElementById('myAccountRecoveryCode').focus();
      return;
    }

    const verifyBtn = document.getElementById('myAccountVerifyCodeBtn');
    verifyBtn.disabled = true;
    verifyBtn.textContent = 'Verifying…';

    try {
      const res = await API.verifyRecoveryEmailCode(code);
      if (res.success) {
        showToast('✓ ' + (res.message || 'Recovery email verified successfully!'), 'success');
        updateBadge(true, true, false);
        const codeBox = document.getElementById('recoveryCodeBox');
        if (codeBox) codeBox.style.display = 'none';
        myAccountOriginal.recoveryEmail = document.getElementById('myAccountRecoveryEmail').value.trim();
        myAccountOriginal.recoveryEmailVerified = true;
      } else {
        showToast('❌ ' + (res.message || 'Invalid or expired verification code.'), 'error');
      }
    } catch (err) {
      showToast('❌ Failed to verify code.', 'error');
    } finally {
      verifyBtn.disabled = false;
      verifyBtn.textContent = 'Confirm Code';
    }
  });

  document.getElementById('myAccountForm').addEventListener('submit', handleMyAccountSubmit);
}

async function handleMyAccountSubmit(event) {
  event.preventDefault();
  if (myAccountSubmitting) return; // a save is already running
  const form = document.getElementById('myAccountForm');
  const btn = form ? form.querySelector('button[type="submit"]') : null;
  const name = document.getElementById('myAccountName').value.trim();
  const email = document.getElementById('myAccountEmail').value.trim();
  const phone = document.getElementById('myAccountPhone').value.trim();
  const recoveryEmail = document.getElementById('myAccountRecoveryEmail').value.trim();
  const newPassword = document.getElementById('myAccountNewPassword').value;
  const confirmPassword = document.getElementById('myAccountConfirmPassword').value;
  const currentPassword = document.getElementById('myAccountCurrentPassword').value;

  if (!name) { showToast('Please enter your full name', 'warning'); return; }
  if (!email) { showToast('Please enter your email', 'warning'); return; }
  const phoneProblem = validatePhPhoneClient(phone);
  if (phoneProblem) { showToast(phoneProblem, 'warning'); return; }
  if (recoveryEmail && recoveryEmail.toLowerCase() === email.toLowerCase()) {
    showToast('The recovery email must be different from your primary login email', 'warning');
    document.getElementById('myAccountRecoveryEmail').focus();
    return;
  }
  if (newPassword) {
    if (newPassword.length < 8) { showToast('The new password must be at least 8 characters', 'warning'); return; }
    if (newPassword !== confirmPassword) { showToast('The new passwords do not match', 'warning'); return; }
  }

  const recoveryEmailChanged = recoveryEmail !== (myAccountOriginal.recoveryEmail || '');
  const sensitiveChange = email !== myAccountOriginal.email || normalizePhPhoneClient(phone) !== myAccountOriginal.phone || !!newPassword || recoveryEmailChanged;

  if (sensitiveChange && !currentPassword) {
    showToast('Enter your current password to change sensitive account settings', 'warning');
    document.getElementById('myAccountCurrentPassword').focus();
    return;
  }

  // Only these fields are sent: the account is identified by the login session, and the role is never part of the request
  const data = { name, email, phone };
  if (recoveryEmailChanged) data.recoveryEmail = recoveryEmail;
  if (sensitiveChange) data.currentPassword = currentPassword;
  if (newPassword) data.newPassword = newPassword;

  myAccountSubmitting = true;
  if (btn) btn.disabled = true;
  try {
    const result = await API.updateMyAccount(data);
    if (result.success) {
      const user = result.data;
      sessionStorage.setItem('currentUser', JSON.stringify({ id: user.id, name: user.name, email: user.email, role: user.role }));
      if (result.token) sessionStorage.setItem('authToken', result.token); // fresh session after a sensitive change
      const adminNameEl = document.getElementById('adminName');
      if (adminNameEl) adminNameEl.textContent = user.name;
      showToast(result.message || 'Your account was updated successfully.', 'success');
      closeMyAccountModal();
    } else {
      showToast('❌ ' + result.message, 'error');
      const currentField = document.getElementById('myAccountCurrentPassword');
      if (currentField) { currentField.value = ''; }
    }
  } catch (error) {
    showToast('❌ Failed to update your account', 'error');
  } finally {
    myAccountSubmitting = false;
    if (btn) btn.disabled = false;
  }
}

// Add "Create Account" button to Staff Module (Admin)
if (window.location.pathname.includes('admin')) {
  setTimeout(() => {
    const staffModule = document.getElementById('staffModule');
    if (staffModule && !document.getElementById('addStaffAccountBtn')) {
      const card = staffModule.querySelector('.card');
      if (card) {
        const btnHTML = `
          <div style="margin-bottom:1.5rem;display:flex;gap:0.75rem;flex-wrap:wrap;">
            <button class="btn btn-accent" id="addStaffAccountBtn" onclick="openAddStaffModal()">
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><line x1="12" y1="5" x2="12" y2="19"></line><line x1="5" y1="12" x2="19" y2="12"></line></svg>
              Create New Account (Staff / Manager)
            </button>
            <button class="btn btn-secondary" id="editMyAccountBtn" onclick="openMyAccountModal()">
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"></path><circle cx="12" cy="7" r="4"></circle></svg>
              Edit My Account
            </button>
          </div>`;
        card.insertAdjacentHTML('beforebegin', btnHTML);
      }
    }
  }, 500);
}


// ---- loading / duplicate-click protection (helpers live in ui.js; each function is wrapped once, here, where it is defined) ----
handleStaffAccountSubmit = kdGuard(handleStaffAccountSubmit, { ...submit('Creating Account...', 'Creating account...'), key: 'staffAccountCreate' });
handleEditStaffSubmit = kdGuard(handleEditStaffSubmit, submit('Saving...', 'Saving changes...'));
handleMyAccountSubmit = kdGuard(handleMyAccountSubmit, submit('Saving...', 'Saving changes...'));
deactivateStaffAccount = kdGuard(deactivateStaffAccount, { key: (id) => 'deactivate:staff:' + id, progress: 'Deactivating account...' });
activateStaffAccount = kdGuard(activateStaffAccount, { key: (id) => 'activate:staff:' + id, progress: 'Activating account...' });
openMyAccountModal = kdGuard(openMyAccountModal, { key: 'openMyAccount', progress: 'Loading your account...' });
loadStaffAccountsList = kdWrapLoader(loadStaffAccountsList, { target: 'staffAccountsList', loading: 'Loading staff accounts...', empty: 'No accounts found', error: 'Unable to load staff accounts.' });
