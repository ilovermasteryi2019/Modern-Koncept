// =============================================================================
// K-DESK · auth.js
// Session / idle manager, dashboard access check, role detection, login + SMS verification (MFA), signup, logout, back/forward-cache re-check.
// Cut from the original main.js (lines 706-1377 region). Code is unchanged except where a comment says otherwise.
// =============================================================================

import { API, API_URL, authHeaders, setUnauthorizedHandler } from './core.js';
import { kdFormOptions as submit, kdGuard, kdStartProgress, showPageLoader, showToast } from './ui.js';

// =============================================================================
// SESSION MANAGEMENT
// - Dashboard pages (admin / manager / staff) need a login and the matching role
// - Automatic logout after inactivity (with a 60-second warning) + keep-alive while the user is active
// - Expired / revoked sessions send the user back to the login page with a clear message
// - Logout also ends the session on the server
// =============================================================================
const IDLE_LIMIT_MS = 30 * 60 * 1000;

   // log out after 30 minutes without activity
const IDLE_WARNING_MS = 60 * 1000;

      // warn 60 seconds before that
const KEEPALIVE_MS = 4 * 60 * 1000;

     // tell the server the user is still active (only while active)
let sessionEnding = false;

const DASHBOARD_ROLE = (() => {
  const page = (window.location.pathname.split('/').pop() || '').toLowerCase().replace(/\.html$/, '');
  return ['admin', 'manager', 'staff'].includes(page) ? page : null;
})();

function readLocalSession() {
  try {
    const token = sessionStorage.getItem('authToken');
    const user = JSON.parse(sessionStorage.getItem('currentUser') || 'null');
    if (!token || !user || typeof user !== 'object') return null;
    return { token, user: { ...user, role: user.role || 'staff' } };
  } catch (e) { return null; }
}

function clearLocalSession() {
  sessionStorage.removeItem('currentUser');
  sessionStorage.removeItem('authToken');
}

function dashboardPageFor(role) {
  return role === 'admin' ? 'admin.html' : (role === 'manager' ? 'manager.html' : 'staff.html');
}

function goToLogin(reason) {
  document.documentElement.style.visibility = 'hidden'; // never leave a dashboard on screen while leaving
  window.location.replace('login.html' + (reason ? `?reason=${reason}` : ''));
}

function handleSessionExpired(reason) {
  if (sessionEnding) return;
  sessionEnding = true;
  clearLocalSession();
  if (DASHBOARD_ROLE) goToLogin(reason || 'expired');
}

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
export async function initDashboardSession() {
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

// =============================================================================
// AUTHENTICATION
// =============================================================================
export async function handleSignup(event) {
  event.preventDefault();
  const name = document.getElementById('signupName').value;
  const email = document.getElementById('signupEmail').value;
  const password = document.getElementById('signupPassword').value;
  try {
    const result = await API.signup(name, email, password);
    if (result.success) {
      showToast('Account created successfully! Please login.', 'success');
      document.getElementById('signupForm').reset();
    } else {
      showToast('❌ ' + result.message, 'error');
    }
  } catch (error) {
    showToast('❌ Failed to create account. Please check your connection.', 'error');
  }
}

// Handle Login - validates the email and password on the server, then opens the dashboard for the user's role.
function completeLogin(result) {
  sessionStorage.setItem('currentUser', JSON.stringify(result.user));
  sessionStorage.setItem('authToken', result.token || '');
  showToast('Login successful!', 'success');
  setTimeout(() => { window.location.href = dashboardPageFor(result.user.role); }, 1500);
}

// =============================================================================
// LOGIN WITH SMS VERIFICATION (MFA)
//
// How the login page is meant to work once the Semaphore MFA backend exists:
//   1. POST /login  { email, password }
//        correct password -> { success:true, mfaRequired:true, challengeId, maskedPhone, expiresInSeconds }   (NO token yet)
//        no usable number -> { success:false, code:'MFA_PHONE_MISSING' | 'MFA_PHONE_INVALID', message }
//   2. POST /login/mfa/send    { challengeId } -> { success:true, cooldownSeconds, expiresInSeconds }   (user pressed "Send SMS")
//   3. POST /login/mfa/resend  { challengeId } -> same answer as /send (the server enforces the cooldown)
//   4. POST /login/mfa/verify  { challengeId, code } -> { success:true, user, token }   (the only place a session is issued)
//   5. POST /login/mfa/cancel  { challengeId }   (optional, best effort)
// Error answers use { success:false, code, message } with these codes: MFA_COOLDOWN (+retryAfterSeconds), SMS_FAILED,
// INVALID_CODE (+attemptsRemaining), CODE_EXPIRED, CHALLENGE_EXPIRED, CHALLENGE_NOT_FOUND, TOO_MANY_ATTEMPTS.
// Routes 1-5 are implemented in server.js ("SMS OTP MFA (Semaphore)"). The server issues a token ONLY from route 4.
// The challengeId only lives in a JavaScript variable (never in sessionStorage / localStorage) and the OTP is never stored anywhere.
// =============================================================================
const MFA_OTP_LENGTH = 6;

const MFA_DEFAULT_COOLDOWN_SECONDS = 60;

// SMS verification is mandatory for every role: a token that arrives without it is refused by the page.
const MFA_ALLOW_DIRECT_LOGIN = false;

let mfaState = null;

 // { challengeId, working, codeSent, cooldownEndsAt, codeExpiresAt }
let mfaTimer = null;

let mfaChallengeTimer = null;

let loginInFlight = false;

const mfaEl = (id) => document.getElementById(id);

// Only the last two digits of the number are ever shown, even if the server sent more than it should
function mfaDisplayPhone(value) {
  const digits = String(value || '').replace(/\D/g, '');
  return digits.length >= 2 ? `+63 XXX XXX XX${digits.slice(-2)}` : 'your registered mobile number';
}

function mfaSetStep(step) { // 'credentials' | 'send' | 'code'
  const copy = {
    credentials: ['Welcome Back', 'Login to access your dashboard'],
    send: ['Verify your identity', 'For your security, confirm it is you before we open your dashboard.'],
    code: ['Verify your identity', 'Enter the code we sent to your phone.']
  }[step];
  mfaEl('loginTitle').textContent = copy[0];
  mfaEl('loginSubtitle').textContent = copy[1];
  mfaEl('loginForm').hidden = step !== 'credentials';
  mfaEl('mfaPanel').hidden = step === 'credentials';
  mfaEl('mfaStepSend').hidden = step !== 'send';
  mfaEl('mfaStepCode').hidden = step !== 'code';
  mfaEl('loginError').classList.add('hidden');
}

function mfaError(message) {
  mfaEl('mfaErrorMsg').textContent = message;
  mfaEl('mfaError').hidden = false;
}

function mfaClearError() {
  mfaEl('mfaError').hidden = true;
}

function mfaClearTimers() {
  clearInterval(mfaTimer); mfaTimer = null;
  clearTimeout(mfaChallengeTimer); mfaChallengeTimer = null;
}

function mfaRemainingCooldown() {
  return mfaState ? Math.max(0, Math.ceil((mfaState.cooldownEndsAt - Date.now()) / 1000)) : 0;
}

// Keeps buttons and labels in sync with the current state (busy / cooldown / code length)
function mfaRefreshButtons() {
  if (!mfaState) return;
  const working = mfaState.working;
  const sendBtn = mfaEl('mfaSendBtn'), verifyBtn = mfaEl('mfaVerifyBtn'), resendBtn = mfaEl('mfaResendBtn');
  const codeLength = mfaEl('mfaCode').value.replace(/\D/g, '').length;
  sendBtn.disabled = !!working;
  sendBtn.textContent = working === 'send' ? 'Sending…' : 'Send SMS';
  verifyBtn.disabled = !!working || codeLength !== MFA_OTP_LENGTH;
  verifyBtn.textContent = working === 'verify' ? 'Verifying…' : 'Verify Code';
  const wait = mfaRemainingCooldown();
  resendBtn.disabled = !!working || wait > 0;
  resendBtn.textContent = working === 'resend' ? 'Sending…' : (wait > 0 ? `Resend SMS in ${Math.floor(wait / 60)}:${String(wait % 60).padStart(2, '0')}` : 'Resend SMS');
  if (mfaState.codeExpiresAt && Date.now() >= mfaState.codeExpiresAt && !mfaState.expiredShown) {
    mfaState.expiredShown = true;
    mfaError('That code has expired. Request a new one.');
  }
}

function mfaStartCooldown(seconds) {
  const wait = Number(seconds) > 0 ? Math.ceil(Number(seconds)) : MFA_DEFAULT_COOLDOWN_SECONDS;
  mfaState.cooldownEndsAt = Date.now() + wait * 1000;
  clearInterval(mfaTimer);
  mfaTimer = setInterval(mfaRefreshButtons, 500);
  mfaRefreshButtons();
}

// Back to the first screen (optionally with a message); forgets the pending login completely
function mfaReset(message, type) {
  mfaClearTimers();
  mfaState = null;
  const codeInput = mfaEl('mfaCode');
  if (codeInput) codeInput.value = '';
  mfaClearError();
  mfaSetStep('credentials');
  mfaEl('loginPassword').focus();
  if (message) showToast(message, type || 'warning', 6000);
}

function mfaStart(result) {
  mfaClearTimers();
  const challengeId = typeof result.challengeId === 'string' ? result.challengeId : '';
  if (!challengeId) { showToast('Login could not continue. Please try again.', 'error'); return; }
  mfaState = { challengeId, working: null, codeSent: false, cooldownEndsAt: 0, codeExpiresAt: 0, expiredShown: false };
  mfaEl('loginPassword').value = ''; // the password is not needed in the page any more
  const masked = mfaDisplayPhone(result.maskedPhone);
  mfaEl('mfaMaskedPhone').textContent = masked;
  mfaEl('mfaMaskedPhoneSent').textContent = masked;
  mfaEl('mfaCode').value = '';
  mfaClearError();
  mfaSetStep('send');
  mfaRefreshButtons();
  const challengeSeconds = Number(result.expiresInSeconds);
  if (challengeSeconds > 0) {
    mfaChallengeTimer = setTimeout(() => mfaReset('Your verification session expired. Please log in again.'), challengeSeconds * 1000);
  }
  mfaEl('mfaSendBtn').focus();
}

function mfaShowCodeStep(codeExpiresInSeconds) {
  const seconds = Number(codeExpiresInSeconds);
  mfaState.codeExpiresAt = seconds > 0 ? Date.now() + seconds * 1000 : 0;
  mfaState.expiredShown = false;
  mfaEl('mfaExpiryNote').textContent = seconds > 0 ? `It expires in ${Math.max(1, Math.round(seconds / 60))} minute(s).` : '';
  mfaEl('mfaCode').value = '';
  mfaSetStep('code');
  mfaRefreshButtons();
  mfaEl('mfaCode').focus();
}

function mfaHandleError(result) {
  const code = result && result.code;
  if (code === 'CHALLENGE_EXPIRED' || code === 'CHALLENGE_NOT_FOUND') { mfaReset('Your verification session expired. Please log in again.'); return; }
  if (code === 'TOO_MANY_ATTEMPTS') { mfaReset('Too many incorrect codes. Please log in again.', 'error'); return; }
  if (code === 'MFA_COOLDOWN') {
    const wait = Number(result.retryAfterSeconds);
    mfaStartCooldown(wait > 0 ? wait : MFA_DEFAULT_COOLDOWN_SECONDS);
    mfaError(`Please wait ${mfaRemainingCooldown()} seconds before requesting another code.`);
    return;
  }
  if (code === 'SMS_FAILED') { mfaError('We could not send the SMS. Please try again in a moment.'); return; }
  if (code === 'INVALID_CODE') {
    const left = Number(result.attemptsRemaining);
    mfaError(left > 0 ? `That code is not correct. You have ${left} attempt${left === 1 ? '' : 's'} left.` : 'That code is not correct. Please try again.');
    mfaEl('mfaCode').value = '';
    mfaEl('mfaCode').focus();
    return;
  }
  if (code === 'CODE_EXPIRED') {
    mfaState.cooldownEndsAt = 0;
    mfaError('That code has expired. Request a new one.');
    mfaEl('mfaCode').value = '';
    return;
  }
  if (code === 'MFA_UNAVAILABLE') { mfaError('SMS verification is not available right now. Please try again later.'); return; }
  mfaError(typeof result.message === 'string' && result.message.length <= 200 ? result.message : 'Something went wrong. Please try again.');
}

async function mfaSendCode(isResend) {
  if (!mfaState || mfaState.working) return; // one request at a time
  if (isResend && mfaRemainingCooldown() > 0) return;
  mfaClearError();
  mfaState.working = isResend ? 'resend' : 'send';
  mfaRefreshButtons();
  const state = mfaState;
  try {
    const result = isResend ? await API.mfaResend(state.challengeId) : await API.mfaSend(state.challengeId);
    if (mfaState !== state) return; // cancelled while waiting
    if (result.success) {
      state.codeSent = true;
      mfaStartCooldown(result.cooldownSeconds);
      mfaShowCodeStep(result.expiresInSeconds);
      if (isResend) showToast('A new code was sent.', 'success');
    } else {
      mfaHandleError(result);
    }
  } catch (error) {
    if (mfaState === state) mfaError('We could not reach the server. Check your connection and try again.');
  } finally {
    if (mfaState === state) { state.working = null; mfaRefreshButtons(); }
  }
}

async function mfaVerifyCode(event) {
  event.preventDefault();
  if (!mfaState || mfaState.working) return;
  const code = mfaEl('mfaCode').value.replace(/\D/g, '');
  if (code.length !== MFA_OTP_LENGTH) { mfaError(`Enter the ${MFA_OTP_LENGTH}-digit code.`); return; }
  mfaClearError();
  mfaState.working = 'verify';
  mfaRefreshButtons();
  const state = mfaState;
  try {
    const result = await API.mfaVerify(state.challengeId, code);
    if (mfaState !== state) return;
    if (result.success && result.user && result.token) {
      // Verified by the server: this is the only place where a session is stored
      mfaClearTimers();
      mfaEl('mfaCode').value = '';
      mfaEl('mfaVerifyBtn').disabled = true;
      mfaEl('mfaSendBtn').disabled = true;
      mfaEl('mfaResendBtn').disabled = true;
      mfaEl('mfaCancelBtn').disabled = true;
      mfaState = null;
      completeLogin(result);
      return;
    }
    if (result.success) { mfaError('Verification could not be completed. Please try again.'); }
    else { mfaHandleError(result); }
  } catch (error) {
    if (mfaState === state) mfaError('We could not reach the server. Check your connection and try again.');
  } finally {
    if (mfaState === state) { state.working = null; mfaRefreshButtons(); }
  }
}

function mfaCancel() {
  const id = mfaState && mfaState.challengeId;
  if (id) { API.mfaCancel(id).catch(() => {}); } // best effort
  mfaReset();
}

export function initMfaUi() {
  if (!mfaEl('mfaPanel')) return; // this page has no verification screen
  const codeInput = mfaEl('mfaCode');
  codeInput.maxLength = MFA_OTP_LENGTH;
  codeInput.placeholder = `Enter the ${MFA_OTP_LENGTH}-digit code`;
  codeInput.addEventListener('input', () => {
    codeInput.value = codeInput.value.replace(/\D/g, '').slice(0, MFA_OTP_LENGTH);
    mfaRefreshButtons();
  });
  mfaEl('mfaSendBtn').addEventListener('click', () => mfaSendCode(false));
  mfaEl('mfaResendBtn').addEventListener('click', () => mfaSendCode(true));
  mfaEl('mfaVerifyForm').addEventListener('submit', mfaVerifyCode);
  mfaEl('mfaCancelBtn').addEventListener('click', mfaCancel);
}

export async function handleLogin(event) {
  event.preventDefault();
  if (loginInFlight) return; // a login request is already running
  const email = document.getElementById('loginEmail').value;
  const password = document.getElementById('loginPassword').value;
  const submitBtn = event.target && event.target.querySelector ? event.target.querySelector('button[type="submit"]') : null;
  const originalLabel = submitBtn ? submitBtn.innerHTML : '';
  loginInFlight = true;
  const loginProgress = kdStartProgress('Signing you in...');
  if (submitBtn) { submitBtn.disabled = true; submitBtn.textContent = 'Logging in…'; }
  let keepDisabled = false;
  try {
    const result = await API.login(email, password);
    if (result.success && result.mfaRequired) {
      mfaStart(result); // password accepted, but NO session yet: SMS verification comes next
    } else if (result.success && result.user) {
      if (MFA_ALLOW_DIRECT_LOGIN) { keepDisabled = true; completeLogin(result); }
      else showToast('Login could not continue: SMS verification was not started by the server.', 'error');
    } else {
      showToast(result.message || 'Login failed.', 'error');
    }
  } catch (error) {
    showToast('Failed to login. Please check your connection.', 'error');
  } finally {
    loginProgress.stop();
    loginInFlight = false;
    if (submitBtn && !keepDisabled) { submitBtn.disabled = false; submitBtn.innerHTML = originalLabel; }
  }
}

export async function handleLogout() {
  sessionEnding = true;
  const headers = authHeaders();
  try {
    // End the session on the server too (waits at most 2 seconds)
    await Promise.race([
      fetch(`${API_URL}/logout`, { method: 'POST', headers, keepalive: true }),
      new Promise(resolve => setTimeout(resolve, 2000))
    ]);
  } catch (error) { /* log out locally even if the server cannot be reached */ }
  clearLocalSession();
  window.location.replace('login.html');
}

// Tell core which function ends the session when the API answers 401 (core does not import auth).
setUnauthorizedHandler(handleSessionExpired);

// ---- loading / duplicate-click protection (helpers live in ui.js; each function is wrapped once, here, where it is defined) ----
handleSignup = kdGuard(handleSignup, submit('Creating Account...', 'Creating account...'));