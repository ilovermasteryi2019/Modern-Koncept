/* =============================================================================
 * K-Desk | js/core/ui-feedback.js
 * Notifications and loading feedback
 * -----------------------------------------------------------------------------
 * WHAT IT DOES : Shared UI feedback used by every page: toast notifications, button spinners, "Loading..." table states,
 * the full-page loader, the in-progress guard (stops double clicks) and idempotency keys for create requests.
 * The CSS for these is injected from here, so no HTML or stylesheet needs to change.
 * DEPENDS ON   : API_URL is not needed here. Everything else in the project uses these helpers.
 * LOAD ORDER   : file 3 of 19 (see scripts-block.html). These are plain scripts that share one
 *                global scope, so inline onclick="..." handlers in the HTML keep working.
 * CONTENTS     :
 * kdRemoveToast, showToast, showLoadingToast, kdStartProgress, kdSetButtonLoading, kdEventButton,
 * kdInFlight, kdRun, kdGuard, kdColumnCount, kdStatePlaceholder, kdWrapLoader, kdWrapBusy,
 * kdPageLoaderEl, kdPageLoaderUsers, showPageLoader, kdWrapPage, kdRequestIds, kdNewId,
 * kdRequestId, kdCreateOnce
 * ============================================================================= */

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
function showToast(message, type = 'info', duration = 4000) {
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
function kdStartProgress(message, delay = 700) {
  let handle = null;
  let slowTimer = null;
  const showTimer = setTimeout(() => {
    handle = showLoadingToast(message);
    slowTimer = setTimeout(() => { if (handle) handle.update('This is taking longer than expected...'); }, 8000);
  }, delay);
  return { stop() { clearTimeout(showTimer); clearTimeout(slowTimer); if (handle) handle.dismiss(); } };
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
function kdEventButton(event) {
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
async function kdRun(key, task, opts = {}) {
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

// Wraps the global function `name` (called by its original name everywhere, including from event handlers)
// with kdRun. cfg: key, button ('event' | selector | fn), loadingText, progress, disable (fn).
function kdGuard(name, cfg = {}) {
  const original = window[name];
  if (typeof original !== 'function' || original.kdGuarded) return;
  const wrapped = function (...args) {
    const first = args[0];
    if (first && first.type === 'submit' && typeof first.preventDefault === 'function') first.preventDefault(); // never let a skipped duplicate reload the page
    const key = typeof cfg.key === 'function' ? cfg.key(...args) : (cfg.key || name);
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
  window[name] = wrapped;
}

// -----------------------------------------------------------------------------
// Table / list loading states
// -----------------------------------------------------------------------------
function kdColumnCount(target, cfg) {
  const table = target.closest ? target.closest('table') : null;
  const headers = table ? table.querySelectorAll('thead th').length : 0;
  return headers || cfg.cols || 1;
}

// Builds the placeholder shown in a table / list while loading, when empty, or on error
// (a <tr> for a table body, a <div> for any other container).
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
function kdWrapLoader(name, cfg) {
  const original = window[name];
  if (typeof original !== 'function' || original.kdGuarded) return;
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
        retry.addEventListener('click', () => window[name]());
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
  window[name] = wrapped;
}

// Dims dashboard statistic numbers / charts while their data is loading
function kdWrapBusy(name, selector) {
  const original = window[name];
  if (typeof original !== 'function' || original.kdGuarded) return;
  const wrapped = async function (...args) {
    const els = Array.from(document.querySelectorAll(selector));
    els.forEach(el => el.classList.add('kd-busy-stat'));
    try { return await original.apply(this, args); }
    finally { els.forEach(el => el.classList.remove('kd-busy-stat')); }
  };
  wrapped.kdGuarded = true;
  window[name] = wrapped;
}

// -----------------------------------------------------------------------------
// Full-page loader (only for operations that leave the page unusable)
// Returns done(). The overlay appears after `delay` ms (no flash for fast responses)
// and removes itself after `maxMs` so a slow server can never trap the user behind it.
// -----------------------------------------------------------------------------
let kdPageLoaderEl = null;
let kdPageLoaderUsers = 0;

// Full-page loading overlay for operations that leave the page unusable. It appears after a short delay
// (no flash on fast responses) and removes itself after a maximum time. Returns a done() function.
function showPageLoader(message, opts = {}) {
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
function kdWrapPage(name, message) {
  const original = window[name];
  if (typeof original !== 'function' || original.kdGuarded) return;
  const wrapped = async function (...args) {
    const done = showPageLoader(message);
    try { return await original.apply(this, args); }
    finally { done(); }
  };
  wrapped.kdGuarded = true;
  window[name] = wrapped;
}

// -----------------------------------------------------------------------------
// Idempotency keys for create requests
// The same key is reused only while the outcome of the previous attempt is unknown (network error / timeout),
// so a retry can never create a second record. Any answer from the server (saved or rejected) ends the attempt.
// -----------------------------------------------------------------------------
const kdRequestIds = {};

// Creates a unique id (crypto.randomUUID when the browser has it) used as an idempotency key.
function kdNewId() {
  if (window.crypto && typeof window.crypto.randomUUID === 'function') return window.crypto.randomUUID();
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, c => {
    const r = Math.random() * 16 | 0;
    return (c === 'x' ? r : (r & 0x3 | 0x8)).toString(16);
  });
}

// Returns the request id for a create action. The same id is reused while the data is unchanged and the
// earlier attempt has no answer yet, so a retry can never create a duplicate record.
function kdRequestId(scope, payload) {
  const fingerprint = JSON.stringify(payload || {});
  const saved = kdRequestIds[scope];
  if (saved && saved.fingerprint === fingerprint) return saved.id;
  const id = kdNewId();
  kdRequestIds[scope] = { id, fingerprint };
  return id;
}

// Sends a create request with a request_id attached. Once the server answers, the id is forgotten
// so the next create is treated as a new request.
async function kdCreateOnce(scope, data, createFn) {
  const payload = { ...data, request_id: kdRequestId(scope, data) };
  const result = await createFn(payload);
  if (result && typeof result === 'object') delete kdRequestIds[scope]; // the server answered: the next attempt is a new request
  return result;
}
