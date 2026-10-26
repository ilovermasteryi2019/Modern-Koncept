// =============================================================================
// K-DESK · staff-accounts.js
// staff-accounts
// Cut from the original main.js (lines 2893-3740 region). Code is unchanged except where a comment says otherwise.
// =============================================================================

import { API, escapeHtmlText, formatDate, formatPhoneForDisplay, kdCreateOnce, normalizePhPhoneClient, validatePhPhoneClient } from './core.js';
import { hideModal, kdConfirm, kdFormOptions as submit, kdGuard, kdWrapLoader, showToast } from './ui.js';

let staffAccountsCache = {};

 // id -> account row from the last GET /staff
let staffEditSubmitting = false;

export async function loadStaffAccountsList() {
  try {
    const result = await API.getStaff();
    if (result.success) {
      const tbody = document.getElementById('staffAccountsList');
      if (!tbody) return;
      tbody.innerHTML = '';
      staffAccountsCache = {};
      if (result.data.length === 0) { tbody.innerHTML = '<tr><td colspan="7" style="text-align:center;color:#9ca3af;">No accounts found</td></tr>'; return; }
      result.data.forEach(item => {
        const isActive = item.is_active !== false && String(item.status || '').toLowerCase() !== 'deactivated';
        staffAccountsCache[item.id] = { ...item, is_active: isActive };
        const editBtn = ['staff', 'manager'].includes(item.role || 'staff')
          ? `<button class="action-btn edit" onclick="openEditStaffModal(${item.id})" title="Edit"><svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"></path><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"></path></svg> Edit</button> `
          : '';
        const statusBtn = isActive
          ? `<button class="action-btn delete" onclick="deactivateStaffAccount(${item.id})" title="Deactivate Account"><svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="10"></circle><line x1="4.93" y1="4.93" x2="19.07" y2="19.07"></line></svg> Deactivate Account</button>`
          : `<button class="action-btn activate" onclick="activateStaffAccount(${item.id})" title="Activate Account"><svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"></path><polyline points="22 4 12 14.01 9 11.01"></polyline></svg> Activate Account</button>`;
        const roleColor = item.role === 'manager' ? '#8b5cf6' : '#065f46';
        const roleBg = item.role === 'manager' ? '#ede9fe' : '#d1fae5';
        const roleLabel = item.role === 'manager' ? 'Manager' : 'Staff';
        const statusColor = isActive ? '#065f46' : '#991b1b';
        const statusBg = isActive ? '#d1fae5' : '#fee2e2';
        const statusLabel = isActive ? 'Active' : 'Deactivated';
        tbody.innerHTML += `
          <tr>
            <td>${escapeHtmlText(item.name || '')}</td>
            <td>${escapeHtmlText(item.email || '')}</td>
            <td><span style="padding:0.25rem 0.75rem;background:${roleBg};color:${roleColor};border-radius:9999px;font-size:0.75rem;font-weight:600;">${roleLabel}</span></td>
            <td>${item.phone ? escapeHtmlText(formatPhoneForDisplay(item.phone)) : '<span style="color:#9ca3af;">Not set</span>'}</td>
            <td><span style="padding:0.25rem 0.75rem;background:${statusBg};color:${statusColor};border-radius:9999px;font-size:0.75rem;font-weight:600;">${statusLabel}</span></td>
            <td>${formatDate(item.created_at)}</td>
            <td>${editBtn}${statusBtn}</td>
          </tr>`;
      });
    } else {
      showToast('❌ ' + (result.message || 'Failed to load accounts'), 'error');
    }
  } catch (error) { showToast('❌ Failed to load accounts', 'error'); }
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
  const label = account && account.name ? `${account.name} (${account.email})` : 'this account';
  if (!(await kdConfirm(`Are you sure you want to deactivate ${label}?\n\nThis account will no longer be able to log in until reactivated by an administrator.`, { title: 'Deactivate Account', confirmText: 'Deactivate Account' }))) return;
  try {
    const result = await API.deactivateStaff(id);
    if (result && result.success) {
      showToast(result.message || 'Account deactivated successfully.', 'success');
      await loadStaffAccountsList();
    } else {
      showToast('❌ ' + ((result && result.message) || 'Failed to deactivate account'), 'error');
    }
  } catch (error) { showToast('❌ Failed to deactivate account', 'error'); }
}

export async function activateStaffAccount(id) {
  const account = staffAccountsCache[id];
  const label = account && account.name ? `${account.name} (${account.email})` : 'this account';
  if (!(await kdConfirm(`Are you sure you want to activate ${label}?\n\nThis account will be able to log in again.`, { title: 'Activate Account', confirmText: 'Activate Account' }))) return;
  try {
    const result = await API.activateStaff(id);
    if (result && result.success) {
      showToast(result.message || 'Account activated successfully.', 'success');
      await loadStaffAccountsList();
    } else {
      showToast('❌ ' + ((result && result.message) || 'Failed to activate account'), 'error');
    }
  } catch (error) { showToast('❌ Failed to activate account', 'error'); }
}

export function closeEditStaffModal() {
  const modal = document.getElementById('editStaffAccountModal');
  if (modal) modal.remove();
}

export function openEditStaffModal(id) {
  const account = staffAccountsCache[id];
  // Staff and Manager accounts are editable here (the backend enforces this again; Admin accounts are not)
  if (!account) { showToast('Account not found. Please refresh the list.', 'error'); return; }
  if (!['staff', 'manager'].includes(account.role || 'staff')) { showToast('Only Staff and Manager accounts can be edited here.', 'error'); return; }
  closeEditStaffModal();
  const modalHTML = `
    <div id="editStaffAccountModal" class="modal active">
      <div class="modal-content">
        <div class="modal-header">
          <h3 class="modal-title">${(account.role || 'staff') === 'manager' ? 'Edit Manager Account' : 'Edit Staff Account'}</h3>
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
  document.getElementById('editStaffAccountRole').value = account.role || 'staff';
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
  myAccountOriginal = { email: account.email || '', phone: normalizePhPhoneClient(account.phone) };
  const modalHTML = `
    <div id="myAccountModal" class="modal active">
      <div class="modal-content">
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
              <label class="form-label">Email</label>
              <input type="email" id="myAccountEmail" class="form-input" maxlength="254" autocomplete="username" required>
            </div>
            <div class="form-group">
              <label class="form-label">Phone Number</label>
              <input type="tel" id="myAccountPhone" class="form-input" inputmode="tel" autocomplete="off" maxlength="20" placeholder="e.g. 09171234567" required>
              <small style="color:#6b7280;font-size:0.75rem;">Philippine mobile number. Your SMS verification code is sent here at login.</small>
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
              <small style="color:#6b7280;font-size:0.75rem;">Required to change your email, phone number or password.</small>
            </div>
            <div style="display:flex;gap:0.75rem;">
              <button type="submit" class="btn btn-accent" style="flex:1;">Save Changes</button>
              <button type="button" class="btn btn-secondary" onclick="closeMyAccountModal()" style="flex:1;">Cancel</button>
            </div>
          </form>
        </div>
      </div>
    </div>`;
  document.body.insertAdjacentHTML('beforeend', modalHTML);
  // Values are set through the DOM so they can never break the markup
  document.getElementById('myAccountName').value = account.name || '';
  document.getElementById('myAccountEmail').value = account.email || '';
  document.getElementById('myAccountPhone').value = account.phone || '';
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
  const newPassword = document.getElementById('myAccountNewPassword').value;
  const confirmPassword = document.getElementById('myAccountConfirmPassword').value;
  const currentPassword = document.getElementById('myAccountCurrentPassword').value;

  if (!name) { showToast('Please enter your full name', 'warning'); return; }
  if (!email) { showToast('Please enter your email', 'warning'); return; }
  const phoneProblem = validatePhPhoneClient(phone);
  if (phoneProblem) { showToast(phoneProblem, 'warning'); return; }
  if (newPassword) {
    if (newPassword.length < 8) { showToast('The new password must be at least 8 characters', 'warning'); return; }
    if (newPassword !== confirmPassword) { showToast('The new passwords do not match', 'warning'); return; }
  }
  const sensitiveChange = email !== myAccountOriginal.email || normalizePhPhoneClient(phone) !== myAccountOriginal.phone || !!newPassword;
  if (sensitiveChange && !currentPassword) {
    showToast('Enter your current password to change your email, phone number or password', 'warning');
    document.getElementById('myAccountCurrentPassword').focus();
    return;
  }

  // Only these fields are sent: the account is identified by the login session, and the role is never part of the request
  const data = { name, email, phone };
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
