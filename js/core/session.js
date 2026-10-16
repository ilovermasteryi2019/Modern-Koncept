/* =============================================================================
 * K-Desk | js/core/session.js
 * Login session (dashboards)
 * -----------------------------------------------------------------------------
 * WHAT IT DOES : Keeps the Admin / Manager / Staff dashboards protected: checks login + role, warns before the 30-minute
 * inactivity logout, keeps the server session alive, and wraps fetch() so that an expired token (HTTP 401)
 * sends the user back to the login page and an identical write request is never sent twice at the same time.
 * DEPENDS ON   : API_URL (config.js), authHeaders (api.js), showToast (ui-feedback.js), handleLogout (auth.js).
 * LOAD ORDER   : file 4 of 19 (see scripts-block.html). These are plain scripts that share one
 *                global scope, so inline onclick="..." handlers in the HTML keep working.
 * CONTENTS     :
 * IDLE_LIMIT_MS, IDLE_WARNING_MS, KEEPALIVE_MS, sessionEnding, DASHBOARD_ROLE, readLocalSession,
 * clearLocalSession, dashboardPageFor, goToLogin, handleSessionExpired, nativeFetch,
 * kdFetchWithSessionCheck, kdPendingWrites, kdWriteKey, startSessionManager, initDashboardSession
 * ============================================================================= */

// =============================================================================
// SESSION MANAGEMENT
// - Dashboard pages (admin / manager / staff) need a login and the matching role
// - Automatic logout after inactivity (with a 60-second warning) + keep-alive while the user is active
// - Expired / revoked sessions send the user back to the login page with a clear message
// - Logout also ends the session on the server
// =============================================================================
const IDLE_LIMIT_MS = 30 * 60 * 1000;   // log out after 30 minutes without activity
const IDLE_WARNING_MS = 60 * 1000;      // warn 60 seconds before that
const KEEPALIVE_MS = 4 * 60 * 1000;     // tell the server the user is still active (only while active)
let sessionEnding = false;

const DASHBOARD_ROLE = (() => {
  const page = (window.location.pathname.split('/').pop() || '').toLowerCase().replace(/\.html$/, '');
  return ['admin', 'manager', 'staff'].includes(page) ? page : null;
})();

// Reads the logged-in user and token from sessionStorage. Returns null when there is no valid session.
function readLocalSession() {
  try {
    const token = sessionStorage.getItem('authToken');
    const user = JSON.parse(sessionStorage.getItem('currentUser') || 'null');
    if (!token || !user || typeof user !== 'object') return null;
    return { token, user: { ...user, role: user.role || 'staff' } };
  } catch (e) { return null; }
}

// Removes the saved user and token from sessionStorage (local logout).
function clearLocalSession() {
  sessionStorage.removeItem('currentUser');
  sessionStorage.removeItem('authToken');
}

// Returns the dashboard page that belongs to a role (admin.html, manager.html or staff.html).
function dashboardPageFor(role) {
  return role === 'admin' ? 'admin.html' : (role === 'manager' ? 'manager.html' : 'staff.html');
}

// Sends the user to login.html (optionally with a reason shown there) and hides the page so no dashboard
// content stays on screen.
function goToLogin(reason) {
  document.documentElement.style.visibility = 'hidden'; // never leave a dashboard on screen while leaving
  window.location.replace('login.html' + (reason ? `?reason=${reason}` : ''));
}

// Ends the session after an expired / revoked token: clears the local data and returns to the login page.
function handleSessionExpired(reason) {
  if (sessionEnding) return;
  sessionEnding = true;
  clearLocalSession();
  if (DASHBOARD_ROLE) goToLogin(reason || 'expired');
}

// Any API answer of 401 to a request that carried our login token means the session is over
const nativeFetch = window.fetch.bind(window);

// Replacement for fetch(): an HTTP 401 answer to a request that carried our token means the session is over.
async function kdFetchWithSessionCheck(input, init) {
  const response = await nativeFetch(input, init);
  try {
    const url = typeof input === 'string' ? input : ((input && input.url) || '');
    const sentToken = !!(init && init.headers && init.headers.Authorization);
    if (response.status === 401 && sentToken && url.startsWith(API_URL)) handleSessionExpired('expired');
  } catch (e) { /* never break a request because of this check */ }
  return response;
}

// Safety net against duplicate records: while a write request (POST/PUT/PATCH/DELETE) is still running, an
// IDENTICAL one (same method, address, login and body) is not sent again - the second caller simply receives the
// answer of the first. Once the first request has finished, a new identical request is sent normally.
const kdPendingWrites = new Map();

// Builds a key (method + address + login + body) for write requests, so an identical request that is still
// running can be detected and not sent a second time.
function kdWriteKey(input, init) {
  try {
    const url = typeof input === 'string' ? input : ((input && input.url) || '');
    if (!url.startsWith(API_URL)) return null;
    const method = String((init && init.method) || (input && input.method) || 'GET').toUpperCase();
    if (method === 'GET' || method === 'HEAD' || method === 'OPTIONS') return null;
    if (init && (init.keepalive || init.signal)) return null; // logout beacons and abortable requests keep their own behaviour
    const body = init && init.body;
    if (body !== undefined && typeof body !== 'string') return null;
    const auth = (init && init.headers && init.headers.Authorization) || '';
    return `${method} ${url} ${auth} ${body || ''}`;
  } catch (e) { return null; }
}

window.fetch = function (input, init) {
  const key = kdWriteKey(input, init);
  if (!key) return kdFetchWithSessionCheck(input, init);
  let pending = kdPendingWrites.get(key);
  if (!pending) {
    pending = kdFetchWithSessionCheck(input, init).finally(() => kdPendingWrites.delete(key));
    kdPendingWrites.set(key, pending);
  }
  return pending.then(response => response.clone());
};

// Dashboard access check that runs immediately: no login, or the wrong role for this page
if (DASHBOARD_ROLE) {
  const local = readLocalSession();
  if (!local) { sessionEnding = true; goToLogin('required'); }
  else if (local.user.role !== DASHBOARD_ROLE) { sessionEnding = true; document.documentElement.style.visibility = 'hidden'; window.location.replace(dashboardPageFor(local.user.role)); }
}

// Back/forward cache: a dashboard shown again after logout must re-check
window.addEventListener('pageshow', (event) => {
  if (event.persisted && DASHBOARD_ROLE && !readLocalSession()) goToLogin('required');
});

// Starts the inactivity timer (warning popup, then automatic logout) and the keep-alive ping while the user is active.
function startSessionManager() {
  let lastActivity = Date.now();
  let lastPing = Date.now();
  let warningEl = null;

  const markActivity = () => { if (!warningEl) lastActivity = Date.now(); };
  ['mousemove', 'mousedown', 'keydown', 'scroll', 'touchstart', 'click'].forEach(name => window.addEventListener(name, markActivity, { passive: true }));

  async function ping() {
    lastPing = Date.now();
    try { await fetch(`${API_URL}/session`, { headers: authHeaders() }); } catch (e) { /* offline: try again later */ }
  }

  function endForIdle() {
    if (sessionEnding) return;
    sessionEnding = true;
    const headers = authHeaders();
    try { fetch(`${API_URL}/logout`, { method: 'POST', headers, keepalive: true }); } catch (e) { /* ignore */ }
    clearLocalSession();
    goToLogin('idle');
  }

  function removeWarning() {
    if (warningEl) { warningEl.remove(); warningEl = null; }
  }

  function showWarning() {
    if (warningEl) return;
    warningEl = document.createElement('div');
    warningEl.className = 'modal active';
    warningEl.style.zIndex = '10000';
    warningEl.innerHTML = `
      <div class="modal-content">
        <div class="modal-header"><h3 class="modal-title">Are you still there?</h3></div>
        <div class="modal-body">
          <p style="margin-bottom:1rem;color:#4b5563;">You will be logged out in <strong id="idleCountdown">60</strong> seconds because of inactivity.</p>
          <div style="display:flex;gap:0.75rem;">
            <button type="button" class="btn btn-accent" id="idleStayBtn" style="flex:1;">Stay logged in</button>
            <button type="button" class="btn btn-secondary" id="idleLogoutBtn" style="flex:1;">Log out now</button>
          </div>
        </div>
      </div>`;
    document.body.appendChild(warningEl);
    document.getElementById('idleStayBtn').addEventListener('click', () => { removeWarning(); lastActivity = Date.now(); ping(); });
    document.getElementById('idleLogoutBtn').addEventListener('click', () => { removeWarning(); handleLogout(); });
  }

  setInterval(() => {
    if (sessionEnding) return;
    const idleFor = Date.now() - lastActivity;
    if (idleFor >= IDLE_LIMIT_MS) { endForIdle(); return; }
    if (idleFor >= IDLE_LIMIT_MS - IDLE_WARNING_MS) {
      showWarning();
      const countdown = document.getElementById('idleCountdown');
      if (countdown) countdown.textContent = String(Math.max(0, Math.ceil((IDLE_LIMIT_MS - idleFor) / 1000)));
    } else if (lastActivity > lastPing && Date.now() - lastPing >= KEEPALIVE_MS) {
      ping(); // the user is active, so keep the server session alive
    }
  }, 1000);
}

// Runs when a dashboard page opens: confirm the session (and role) with the server, then start the inactivity timer
async function initDashboardSession() {
  if (!DASHBOARD_ROLE || sessionEnding) return;
  startSessionManager();
  const hideLoader = showPageLoader('Loading dashboard...');
  try {
    const response = await fetch(`${API_URL}/session`, { headers: authHeaders() });
    if (response.status === 401) return; // handled by the fetch check above
    const result = await response.json();
    if (result && result.success && result.user) {
      const role = result.user.role || 'staff';
      sessionStorage.setItem('currentUser', JSON.stringify({ id: result.user.id, name: result.user.name, email: result.user.email, role }));
      if (role !== DASHBOARD_ROLE) {
        sessionEnding = true;
        document.documentElement.style.visibility = 'hidden';
        window.location.replace(dashboardPageFor(role));
      }
    }
  } catch (e) { /* server unreachable (e.g. waking up): keep the page, the next request will re-check */ }
  finally { hideLoader(); }
}
