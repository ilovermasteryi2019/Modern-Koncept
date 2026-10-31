// =============================================================================
// K-DESK · ui.js
// Shared interface: toasts, loading toast / button / table / page loaders, in-progress guard (kdRun, kdGuard), modal helpers, dashboard tab switching, modal close buttons, mobile menu + page transitions, injected CSS.
// Cut from the original main.js (lines 300-3429 region). Code is unchanged except where a comment says otherwise.
// =============================================================================



// PAGE TRANSITION EFFECT FOR SMOOTH NAVIGATION
// =============================================================================
document.addEventListener('DOMContentLoaded', () => {
  // ── Mobile hamburger menu ──
  const hamburgerBtn = document.getElementById('hamburgerBtn');
  const mobileNavMenu = document.getElementById('mobileNavMenu');
  if (hamburgerBtn && mobileNavMenu) {
    hamburgerBtn.addEventListener('click', () => {
      hamburgerBtn.classList.toggle('open');
      mobileNavMenu.classList.toggle('open');
    });
    mobileNavMenu.querySelectorAll('.mobile-nav-link').forEach(link => {
      link.addEventListener('click', () => {
        hamburgerBtn.classList.remove('open');
        mobileNavMenu.classList.remove('open');
      });
    });
  }

  document.querySelectorAll('a.nav-btn').forEach(link => {
    const href = link.getAttribute('href');
    if (!href || href.startsWith('http') || href.startsWith('mailto') || href.startsWith('tel')) return;
    if (href.startsWith('#')) return;
    link.addEventListener('click', (e) => {
      e.preventDefault();
      document.body.classList.add('page-transition-out');
      setTimeout(() => { window.location.href = href; }, 300);
    });
  });
});

// =============================================================================
// TOAST NOTIFICATION SYSTEM
// =============================================================================
// =============================================================================
// K-DESK LOADING, PROCESSING & ACTION FEEDBACK (shared by every page)
//   showToast / showLoadingToast ..... notifications (success, error, warning, info, loading)
//   kdSetButtonLoading ............... spinner + disabled button while a request runs
//   kdRun / kdGuard .................. in-progress guard: the same action can never run twice at once,
//                                      plus button feedback and a "taking longer than expected" notice
//   kdWrapLoader ..................... "Loading..." / empty / error state for tables and lists
//   showPageLoader ................... full-page indicator (blocking operations only)
//   kdCreateOnce / kdRequestId ....... idempotency key sent with create requests (backend: withIdempotency)
// The CSS is injected from here, so no HTML or stylesheet needs to change.
// =============================================================================
(function kdInjectStyles() {
  if (document.getElementById('kd-feedback-styles')) return;
  const style = document.createElement('style');
  style.id = 'kd-feedback-styles';
  style.textContent = `
    @keyframes kd-spin { to { transform: rotate(360deg); } }
    .kd-spinner { display:inline-block; width:1em; height:1em; border:2px solid currentColor; border-right-color:transparent; border-radius:50%; animation:kd-spin .7s linear infinite; vertical-align:-0.15em; margin-right:.5em; flex-shrink:0; box-sizing:border-box; }
    .kd-spinner.kd-spinner-lg { width:2.5rem; height:2.5rem; border-width:3px; margin:0; color:#DC143C; }
    .kd-loading { cursor:progress !important; opacity:.85; }
    .toast.loading { background:linear-gradient(135deg,#3b82f6 0%,#2563eb 100%); color:#fff; }
    .toast.loading .kd-spinner { margin-right:0; }
    .kd-state td, .kd-state-box { text-align:center; padding:2rem 1rem; color:#6b7280; }
    .kd-state-error td, .kd-state-error.kd-state-box { color:#dc2626; }
    .kd-retry { margin-left:.5rem; padding:0; border:0; background:none; color:#2563eb; text-decoration:underline; cursor:pointer; font:inherit; }
    .kd-refreshing { opacity:.55; transition:opacity .15s; }
    .kd-busy-stat { opacity:.45; transition:opacity .15s; }
    .kd-page-loader { position:fixed; top:0; right:0; bottom:0; left:0; z-index:9990; display:flex; flex-direction:column; align-items:center; justify-content:center; gap:1rem; background:rgba(255,255,255,.9); color:#374151; font-weight:500; text-align:center; padding:1rem; }
    @media (prefers-reduced-motion: reduce) { .kd-spinner { animation-duration:1.8s; } }
  `;
  (document.head || document.documentElement).appendChild(style);
})();

// -----------------------------------------------------------------------------
// Notifications
// -----------------------------------------------------------------------------
function kdRemoveToast(toast) {
  if (!toast || !toast.parentElement || toast.classList.contains('removing')) return;
  clearTimeout(toast._kdTimer);
  toast.classList.add('removing');
  setTimeout(() => { if (toast.parentElement) toast.remove(); }, 300);
}

// duration 0 = stays until it is dismissed (used by loading notifications).
// Returns the toast element. An identical message already on screen is refreshed instead of stacked.
export function showToast(message, type = 'info', duration = 4000) {
  let container = document.getElementById('toastContainer');
  if (!container) {
    container = document.createElement('div');
    container.id = 'toastContainer';
    container.className = 'toast-container';
    document.body.appendChild(container);
  }
  const key = type + '|' + message;
  if (type !== 'loading') {
    const same = Array.from(container.querySelectorAll('.toast')).find(t => t.dataset.kdKey === key && !t.classList.contains('removing'));
    if (same) {
      clearTimeout(same._kdTimer);
      if (duration > 0) same._kdTimer = setTimeout(() => kdRemoveToast(same), duration);
      return same;
    }
  }
  const icons = { success: '✓', error: '✕', warning: '⚠', info: 'ℹ', loading: '<span class="kd-spinner" aria-hidden="true"></span>' };
  const toast = document.createElement('div');
  toast.className = `toast ${type}`;
  toast.dataset.kdKey = key;
  if (type === 'loading') toast.setAttribute('role', 'status');
  toast.innerHTML = `
    <div class="toast-icon">${icons[type] || icons.info}</div>
    <div class="toast-message">${message}</div>
    <button class="toast-close" onclick="this.parentElement.remove()">×</button>
  `;
  container.appendChild(toast);
  if (duration > 0) toast._kdTimer = setTimeout(() => kdRemoveToast(toast), duration);
  return toast;
}

// A notification that stays up while work is in progress. { update(text), dismiss() }
function showLoadingToast(message) {
  const toast = showToast(message, 'loading', 0);
  return {
    update(text) { const el = toast.querySelector('.toast-message'); if (el && toast.parentElement) el.textContent = text; },
    dismiss() { kdRemoveToast(toast); }
  };
}

// Shows a loading notification only if the work is still running after `delay` ms (quick actions show no flicker),
// then switches to "taking longer than expected" while the SAME request keeps running (it is never re-sent).
let kdActiveProgress = null;

export function kdStartProgress(message, delay = 700) {
  let handle = null;
  let slowTimer = null;
  let showTimer = null;
  let stopped = false;
  function schedule() {
    if (stopped) return;
    clearTimeout(showTimer);
    clearTimeout(slowTimer);
    showTimer = setTimeout(() => {
      if (stopped) return;
      handle = showLoadingToast(message);
      slowTimer = setTimeout(() => { if (handle) handle.update('This is taking longer than expected...'); }, 8000);
    }, delay);
  }
  schedule();
  const ctrl = {
    pause() { clearTimeout(showTimer); clearTimeout(slowTimer); if (handle) { handle.dismiss(); handle = null; } },
    resume() { schedule(); },
    stop() { stopped = true; clearTimeout(showTimer); clearTimeout(slowTimer); if (handle) handle.dismiss(); if (kdActiveProgress === ctrl) kdActiveProgress = null; }
  };
  kdActiveProgress = ctrl;
  return ctrl;
}

// Styled K-Desk confirmation modal that replaces native browser confirm() dialogs.
// Returns Promise<boolean>. Pauses any active kdStartProgress timer while waiting for the user's choice.
export function kdConfirm(message, opts = {}) {
  const pausedProgress = kdActiveProgress;
  if (pausedProgress) pausedProgress.pause();
  return new Promise((resolve) => {
    const existing = document.getElementById('kdConfirmModal');
    if (existing) existing.remove();

    const title = opts.title || 'Confirm Action';
    const confirmText = opts.confirmText || 'Delete';
    const cancelText = opts.cancelText || 'Cancel';

    const modal = document.createElement('div');
    modal.id = 'kdConfirmModal';
    modal.className = 'modal active';
    modal.setAttribute('role', 'dialog');
    modal.setAttribute('aria-modal', 'true');
    modal.innerHTML = `
      <div class="modal-content" style="max-width:440px;">
        <div class="modal-header">
          <h3 class="modal-title"></h3>
          <button type="button" class="modal-close" data-kd-confirm-cancel aria-label="Close">×</button>
        </div>
        <div class="modal-body">
          <p class="kd-confirm-message" style="color:#374151;line-height:1.6;margin-bottom:1.5rem;white-space:pre-line;"></p>
          <div style="display:flex;gap:0.75rem;justify-content:flex-end;">
            <button type="button" class="btn btn-secondary" data-kd-confirm-cancel style="flex:1;"></button>
            <button type="button" class="btn btn-accent" data-kd-confirm-ok style="flex:1;"></button>
          </div>
        </div>
      </div>
    `;
    modal.querySelector('.modal-title').textContent = title;
    modal.querySelector('.kd-confirm-message').textContent = message;
    const cancelBtns = modal.querySelectorAll('[data-kd-confirm-cancel]');
    cancelBtns[1].textContent = cancelText;
    const okBtn = modal.querySelector('[data-kd-confirm-ok]');
    okBtn.textContent = confirmText;

    let settled = false;
    function finish(confirmed) {
      if (settled) return;
      settled = true;
      document.removeEventListener('keydown', onKeyDown);
      modal.classList.remove('active');
      modal.remove();
      if (confirmed && pausedProgress) pausedProgress.resume();
      resolve(confirmed);
    }
    function onKeyDown(e) {
      if (e.key === 'Escape') finish(false);
    }
    cancelBtns.forEach(btn => btn.addEventListener('click', () => finish(false)));
    okBtn.addEventListener('click', () => finish(true));
    modal.addEventListener('click', (e) => { if (e.target === modal) finish(false); });
    document.addEventListener('keydown', onKeyDown);

    (document.body || document.documentElement).appendChild(modal);
    okBtn.focus();
  });
}

// -----------------------------------------------------------------------------
// Button state
// -----------------------------------------------------------------------------
// Returns a restore() function, or null when the button is missing or already busy.
function kdSetButtonLoading(btn, text) {
  if (!btn || btn.dataset.kdLoading === '1') return null;
  const original = { html: btn.innerHTML, disabled: btn.disabled };
  btn.dataset.kdLoading = '1';
  btn.disabled = true;
  btn.classList.add('kd-loading');
  btn.setAttribute('aria-busy', 'true');
  if (text) {
    btn.textContent = '';
    const spin = document.createElement('span');
    spin.className = 'kd-spinner';
    spin.setAttribute('aria-hidden', 'true');
    btn.appendChild(spin);
    btn.appendChild(document.createTextNode(text));
  }
  return function restore() {
    delete btn.dataset.kdLoading;
    btn.classList.remove('kd-loading');
    btn.removeAttribute('aria-busy');
    if (text) btn.innerHTML = original.html;
    btn.disabled = original.disabled;
  };
}

// The button that triggered a submit/click event
export function kdEventButton(event) {
  const t = event && (event.submitter || event.currentTarget || event.target);
  if (!t) return null;
  if (t.tagName === 'BUTTON') return t;
  const form = t.tagName === 'FORM' ? t : (t.closest ? t.closest('form') : null);
  return form ? form.querySelector('button[type="submit"], button:not([type])') : null;
}

// -----------------------------------------------------------------------------
// In-progress guard
// -----------------------------------------------------------------------------
const kdInFlight = new Set();

// Runs task() unless the same key is already running (a repeat click / Enter press is simply ignored).
// Always restores the interface afterwards, whether the task succeeded, failed or threw.
export async function kdRun(key, task, opts = {}) {
  if (kdInFlight.has(key)) return undefined;
  kdInFlight.add(key);
  const restoreButton = opts.button ? kdSetButtonLoading(opts.button, opts.loadingText) : null;
  const locked = (opts.disable || []).filter(Boolean);
  const wasDisabled = locked.map(el => el.disabled);
  locked.forEach(el => { el.disabled = true; });
  const progress = opts.progress ? kdStartProgress(opts.progress) : null;
  try {
    return await task();
  } finally {
    if (progress) progress.stop();
    locked.forEach((el, i) => { el.disabled = wasDisabled[i]; });
    if (restoreButton) restoreButton();
    kdInFlight.delete(key);
  }
}

// Returns `original` wrapped with kdRun (assign the result back to the function's own binding, so every caller - including other modules - gets the guarded version).
// cfg: key, button ('event' | selector | fn), loadingText, progress, disable (fn).
export function kdGuard(original, cfg = {}) {
  if (typeof original !== 'function' || original.kdGuarded) return original;
  const wrapped = function (...args) {
    const first = args[0];
    if (first && first.type === 'submit' && typeof first.preventDefault === 'function') first.preventDefault(); // never let a skipped duplicate reload the page
    const key = typeof cfg.key === 'function' ? cfg.key(...args) : (cfg.key || original.name);
    let button = null;
    let disable = [];
    try {
      if (cfg.button === 'event') button = kdEventButton(first);
      else if (typeof cfg.button === 'function') button = cfg.button(...args);
      else if (typeof cfg.button === 'string') button = document.querySelector(cfg.button);
      if (typeof cfg.disable === 'function') disable = [].concat(cfg.disable(...args) || []);
    } catch (e) { /* feedback must never break the action itself */ }
    const loadingText = typeof cfg.loadingText === 'function' ? cfg.loadingText(...args) : cfg.loadingText;
    const progress = typeof cfg.progress === 'function' ? cfg.progress(...args) : cfg.progress;
    return kdRun(key, () => original.apply(this, args), { button, loadingText, progress, disable });
  };
  wrapped.kdGuarded = true;
  return wrapped;
}

// -----------------------------------------------------------------------------
// Table / list loading states
// -----------------------------------------------------------------------------
function kdColumnCount(target, cfg) {
  const table = target.closest ? target.closest('table') : null;
  const headers = table ? table.querySelectorAll('thead th').length : 0;
  return headers || cfg.cols || 1;
}

function kdStatePlaceholder(target, cfg, kind, html) {
  const isTbody = target.tagName === 'TBODY';
  const el = document.createElement(isTbody ? 'tr' : 'div');
  el.className = `kd-state kd-state-${kind}` + (isTbody ? '' : ' kd-state-box');
  if (isTbody) {
    const td = document.createElement('td');
    td.colSpan = kdColumnCount(target, cfg);
    td.innerHTML = html;
    el.appendChild(td);
  } else {
    el.innerHTML = html;
  }
  return el;
}

// Wraps a list loader (e.g. loadInventoryList). While it runs: an empty table shows "Loading ..." and a table that
// already has rows is dimmed (old rows stay visible). If the loader renders nothing (it failed), an error row with
// a Retry link is shown; if it leaves the table empty, an empty-state row is shown.
export function kdWrapLoader(original, cfg) {
  if (typeof original !== 'function' || original.kdGuarded) return original;
  const wrapped = async function (...args) {
    const target = document.getElementById(cfg.target);
    if (!target) return original.apply(this, args);
    const hasRows = Array.from(target.children).some(c => !c.classList.contains('kd-state'));
    let placeholder = null;
    if (hasRows) {
      target.classList.add('kd-refreshing');
      target.setAttribute('aria-busy', 'true');
    } else {
      placeholder = kdStatePlaceholder(target, cfg, 'loading', `<span class="kd-spinner" aria-hidden="true"></span>${cfg.loading}`);
      target.replaceChildren(placeholder);
    }
    try {
      return await original.apply(this, args);
    } finally {
      target.classList.remove('kd-refreshing');
      target.removeAttribute('aria-busy');
      if (placeholder && placeholder.parentNode === target) {
        // the loader did not replace the loading row: the request failed
        const retry = document.createElement('button');
        retry.type = 'button';
        retry.className = 'kd-retry';
        retry.textContent = 'Try again';
        retry.addEventListener('click', () => wrapped());
        const failed = kdStatePlaceholder(target, cfg, 'error', `${cfg.error || 'Unable to load the records.'}`);
        const holder = failed.tagName === 'TR' ? failed.firstChild : failed;
        holder.appendChild(retry);
        target.replaceChildren(failed);
      } else if (target.children.length === 0) {
        target.replaceChildren(kdStatePlaceholder(target, cfg, 'empty', cfg.empty || 'No records found'));
      }
    }
  };
  wrapped.kdGuarded = true;
  return wrapped;
}

// Dims dashboard statistic numbers / charts while their data is loading
export function kdWrapBusy(original, selector) {
  if (typeof original !== 'function' || original.kdGuarded) return original;
  const wrapped = async function (...args) {
    const els = Array.from(document.querySelectorAll(selector));
    els.forEach(el => el.classList.add('kd-busy-stat'));
    try { return await original.apply(this, args); }
    finally { els.forEach(el => el.classList.remove('kd-busy-stat')); }
  };
  wrapped.kdGuarded = true;
  return wrapped;
}

// -----------------------------------------------------------------------------
// Full-page loader (only for operations that leave the page unusable)
// Returns done(). The overlay appears after `delay` ms (no flash for fast responses)
// and removes itself after `maxMs` so a slow server can never trap the user behind it.
// -----------------------------------------------------------------------------
let kdPageLoaderEl = null;

let kdPageLoaderUsers = 0;

export function showPageLoader(message, opts = {}) {
  const delay = opts.delay === undefined ? 300 : opts.delay;
  const maxMs = opts.maxMs || 15000;
  let finished = false;
  let shown = false;
  let slowTimer = null;
  const showTimer = setTimeout(() => {
    if (finished) return;
    shown = true;
    kdPageLoaderUsers++;
    if (!kdPageLoaderEl) {
      kdPageLoaderEl = document.createElement('div');
      kdPageLoaderEl.className = 'kd-page-loader';
      kdPageLoaderEl.setAttribute('role', 'status');
      kdPageLoaderEl.setAttribute('aria-live', 'polite');
      kdPageLoaderEl.innerHTML = '<span class="kd-spinner kd-spinner-lg" aria-hidden="true"></span><div class="kd-page-loader-msg"></div>';
      (document.body || document.documentElement).appendChild(kdPageLoaderEl);
    }
    const msg = kdPageLoaderEl.querySelector('.kd-page-loader-msg');
    msg.textContent = message || 'Loading...';
    slowTimer = setTimeout(() => { msg.textContent = 'Still working... this is taking longer than expected.'; }, 6000);
  }, delay);
  const capTimer = setTimeout(() => done(), maxMs);
  function done() {
    if (finished) return;
    finished = true;
    clearTimeout(showTimer);
    clearTimeout(slowTimer);
    clearTimeout(capTimer);
    if (!shown) return;
    kdPageLoaderUsers = Math.max(0, kdPageLoaderUsers - 1);
    if (kdPageLoaderUsers === 0 && kdPageLoaderEl) { kdPageLoaderEl.remove(); kdPageLoaderEl = null; }
  }
  return done;
}

// Wraps a loader that fills a whole page (e.g. the furniture detail page) with the full-page indicator
export function kdWrapPage(original, message) {
  if (typeof original !== 'function' || original.kdGuarded) return original;
  const wrapped = async function (...args) {
    const done = showPageLoader(message);
    try { return await original.apply(this, args); }
    finally { done(); }
  };
  wrapped.kdGuarded = true;
  return wrapped;
}

// Option builders for the wrapper declarations in every module (were local to the old install block; bodies unchanged)
export const kdFormOptions = (loadingText, progress) => ({ button: 'event', loadingText, progress });
export const kdDeleteOptions = (label) => ({ key: (id) => 'delete:' + label + ':' + id, progress: 'Deleting...' });
export const kdArchiveOptions = (label) => ({ key: (id) => 'archive:' + label + ':' + id, progress: 'Archiving...' });
export const kdRestoreOptions = (label) => ({ key: (id) => 'restore:' + label + ':' + id, progress: 'Restoring...' });
export const kdOpenOptions = (label, progress) => ({ key: (id) => 'open:' + label + ':' + id, progress: progress || 'Loading details...' });

export function showModal(modalId) {
  const modal = document.getElementById(modalId);
  if (modal) modal.classList.add('active');
}

export function hideModal(modalId) {
  const modal = document.getElementById(modalId);
  if (modal) modal.classList.remove('active');
}

// =============================================================================
// PAGE INITIALIZATION
// =============================================================================
export // onTabOpened(tabName, { isAdmin, isStaff, isManager }) is supplied by main.js: it loads the data for the tab that was opened.
function initDashboardTabs(onTabOpened) {
  const tabs = document.querySelectorAll('.dashboard-tab');
  const modules = document.querySelectorAll('.dashboard-module');
  tabs.forEach(tab => {
    tab.addEventListener('click', () => {
      const targetTab = tab.getAttribute('data-tab');
      tabs.forEach(t => t.classList.remove('active'));
      tab.classList.add('active');
      modules.forEach(m => m.classList.remove('active'));
      const targetModule = document.getElementById(targetTab + 'Module');
      if (targetModule) {
        targetModule.classList.add('active');
        const isAdmin = window.location.pathname.includes('admin');
        const isStaff = window.location.pathname.includes('staff');
        const isManager = window.location.pathname.includes('manager');
        if (typeof onTabOpened === 'function') onTabOpened(targetTab, { isAdmin, isStaff, isManager });
      }
    });
  });
}

export function initModalCloseButtons() {
  document.querySelectorAll('[data-close-modal]').forEach(btn => {
    btn.addEventListener('click', () => { hideModal(btn.getAttribute('data-close-modal')); });
  });
}


// =============================================================================
// REUSABLE PAGINATION CONTROLS
// =============================================================================
/**
 * Shared dashboard table pagination controls renderer (Inventory, Furniture, etc.)
 * Handles info range, active page highlight, prev/next disable, page buttons, and callbacks.
 * Does not display unnecessary pagination controls when there is only one page.
 */
export function renderPagination({ containerId, totalItems, currentPage, pageSize = 10, onPageChange, ariaLabel = 'Pagination Navigation' }) {
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
  const safeLabel = String(ariaLabel || 'Pagination Navigation').replace(/"/g, '&quot;');

  container.innerHTML = `
    <div class="kd-pagination-info">${rangeInfo} (Page ${validPage} of ${totalPages})</div>
    <div class="kd-pagination-controls" role="navigation" aria-label="${safeLabel}">
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
