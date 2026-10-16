/* =============================================================================
 * K-Desk | js/modules/auth.js
 * Authentication
 * -----------------------------------------------------------------------------
 * WHAT IT DOES : Customer signup, login with SMS verification (MFA), and logout. The session is created ONLY after the
 * server verifies the SMS code; the challenge id lives in a JavaScript variable and the code is never stored.
 * DEPENDS ON   : API (api.js), showToast / kd* helpers (ui-feedback.js), session helpers (session.js).
 * LOAD ORDER   : file 7 of 19 (see scripts-block.html). These are plain scripts that share one
 *                global scope, so inline onclick="..." handlers in the HTML keep working.
 * CONTENTS     :
 * handleSignup, completeLogin, MFA_OTP_LENGTH, MFA_DEFAULT_COOLDOWN_SECONDS,
 * MFA_ALLOW_DIRECT_LOGIN, mfaState, mfaTimer, mfaChallengeTimer, loginInFlight, mfaEl, mfaRequest,
 * mfaDisplayPhone, mfaSetStep, mfaError, mfaClearError, mfaClearTimers, mfaRemainingCooldown,
 * mfaRefreshButtons, mfaStartCooldown, mfaReset, mfaStart, mfaShowCodeStep, mfaHandleError,
 * mfaSendCode, mfaVerifyCode, mfaCancel, initMfaUi, handleLogin, handleLogout
 * ============================================================================= */

// =============================================================================
// AUTHENTICATION
// =============================================================================
async function handleSignup(event) {
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

let mfaState = null; // { challengeId, working, codeSent, cooldownEndsAt, codeExpiresAt }
let mfaTimer = null;
let mfaChallengeTimer = null;
let loginInFlight = false;

const mfaEl = (id) => document.getElementById(id);

// POST helper for the SMS-verification routes. Always returns an object: { success:false, code:"MFA_UNAVAILABLE" }
// when the answer is not JSON.
async function mfaRequest(path, body) {
  const response = await fetch(`${API_URL}${path}`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
  let data = null;
  try { data = await response.json(); } catch (error) { /* not JSON, e.g. the route does not exist yet */ }
  if (!data || typeof data !== 'object') return { success: false, code: 'MFA_UNAVAILABLE' };
  return data;
}

// Only the last two digits of the number are ever shown, even if the server sent more than it should
function mfaDisplayPhone(value) {
  const digits = String(value || '').replace(/\D/g, '');
  return digits.length >= 2 ? `+63 XXX XXX XX${digits.slice(-2)}` : 'your registered mobile number';
}

// Shows one of the three login screens: "credentials", "send" (press Send SMS) or "code" (type the code).
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

// Shows an error message in the verification panel.
function mfaError(message) {
  mfaEl('mfaErrorMsg').textContent = message;
  mfaEl('mfaError').hidden = false;
}

// Hides the error message in the verification panel.
function mfaClearError() {
  mfaEl('mfaError').hidden = true;
}

// Stops the resend-cooldown timer and the verification-session expiry timer.
function mfaClearTimers() {
  clearInterval(mfaTimer); mfaTimer = null;
  clearTimeout(mfaChallengeTimer); mfaChallengeTimer = null;
}

// Seconds left before another SMS may be requested (0 means it is allowed).
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

// Starts the "Resend SMS in m:ss" countdown (server value, or the default of 60 seconds).
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

// Called after the password is accepted: stores the challenge id, shows the "Send SMS" step and starts the
// expiry timer. NO session exists yet at this point.
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

// Switches to the "enter your code" screen and remembers when the code expires.
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

// Turns a server error code (expired, too many attempts, cooldown, wrong code, SMS failure...) into the right
// screen or message.
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

// Asks the server to send (or resend) the SMS code. Only one request runs at a time.
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

// Submits the 6-digit code. Only a successful verification returns the token and completes the login.
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

// Cancels the pending verification and goes back to the first login screen.
function mfaCancel() {
  const id = mfaState && mfaState.challengeId;
  if (id) { API.mfaCancel(id).catch(() => {}); } // best effort
  mfaReset();
}

// Connects the verification screen's buttons and code input (login page only).
function initMfaUi() {
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

// Login form submit: the server checks email + password, then the SMS verification step starts.
async function handleLogin(event) {
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

// Ends the session on the server (waits at most 2 seconds), clears the local data and returns to login.html.
async function handleLogout() {
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
