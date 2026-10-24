// =============================================================================
// K-DESK · ai-visualization.js
// ai-visualization
// Cut from the original main.js (lines 3745-4358 region). Code is unchanged except where a comment says otherwise.
// =============================================================================

import { API, API_URL, escapeHtmlText, formatCurrency, getDiscountInfo, renderPriceHTML } from './core.js';
import { showToast } from './ui.js';
import { resolveFurnitureDimensions } from './dimensions.js';

// =============================================================================
// AI VISUALIZATION PAGE
// =============================================================================

let selectedFurniture = null;

let roomImageBase64 = null;

let selectedStyle = 'Modern';

let lastGeneratedResult = null;

let lastResultSig = null;

   // fingerprint of the inputs that produced lastGeneratedResult
let vizCurrentStep = 1;

     // 1 = Pick Furniture, 2 = Upload Room Photo, 3 = Generate & Download
let vizCatalog = [];

        // furniture shown in Step 1 (from the same API as the furniture list)


export function initVisualizationPage() {
  loadSelectedFurniture();

  // Style option buttons
  document.querySelectorAll('.style-option').forEach(btn => {
    btn.addEventListener('click', () => {
      document.querySelectorAll('.style-option').forEach(b => b.classList.remove('selected'));
      btn.classList.add('selected');
      selectedStyle = btn.getAttribute('data-style');
    });
  });

  // Room image upload
  const roomInput = document.getElementById('roomImageInput');
  const uploadArea = document.getElementById('uploadArea');

  if (roomInput) roomInput.addEventListener('change', (e) => {
    const file = e.target.files[0];
    if (file) processRoomFile(file);
  });

  if (uploadArea) {
    uploadArea.addEventListener('dragover', (e) => {
      e.preventDefault();
      uploadArea.classList.add('dragover');
    });
    uploadArea.addEventListener('dragleave', () => uploadArea.classList.remove('dragover'));
    uploadArea.addEventListener('drop', (e) => {
      e.preventDefault();
      uploadArea.classList.remove('dragover');
      const file = e.dataTransfer.files[0];
      if (file && file.type.startsWith('image/')) processRoomFile(file);
    });
  }

  // Generate button
  const generateBtn = document.getElementById('generateBtn');
  if (generateBtn) generateBtn.addEventListener('click', generateVisualization);

  // Try again / retry / start over
  const tryAgainBtn = document.getElementById('tryAgainBtn');
  if (tryAgainBtn) tryAgainBtn.addEventListener('click', generateVisualization);

  const retryBtn = document.getElementById('retryBtn');
if (retryBtn) retryBtn.addEventListener('click', generateVisualization);

  const startOverBtn = document.getElementById('startOverBtn');
  if (startOverBtn) startOverBtn.addEventListener('click', startOverVisualization);

  // Download button
  const downloadBtn = document.getElementById('downloadBtn');
  if (downloadBtn) downloadBtn.addEventListener('click', downloadResult);

  initVizWizard();
}

function loadSelectedFurniture() {
  let stored = null;
  try { stored = JSON.parse(sessionStorage.getItem('selectedFurniture') || 'null'); } catch (e) { stored = null; }
  if (stored && typeof stored === 'object') {
    selectedFurniture = stored;
    showFurnitureOnVizPage();
    const backBtn = document.getElementById('backBtnContainer');
    if (backBtn) backBtn.style.display = 'block';
    activateStepBadge('stepBadge2', 'stepLabel2');
  }
  updateGenerateButton();
}

function showFurnitureOnVizPage() {
  const noState = document.getElementById('noFurnitureState');
  const selectedState = document.getElementById('furnitureSelectedState');
  if (noState) noState.style.display = 'none';
  if (selectedState) selectedState.style.display = 'block';

  const imgEl = document.getElementById('vizFurnitureImg');
  const nameEl = document.getElementById('vizFurnitureName');
  const catEl = document.getElementById('vizFurnitureCategory');
  const priceEl = document.getElementById('vizFurniturePrice');
  const sizeEl = document.getElementById('vizFurnitureSize');

  if (imgEl) imgEl.src = selectedFurniture.image || 'placeholder-furniture.jpg';
  if (nameEl) nameEl.textContent = selectedFurniture.name || '';
  if (catEl) catEl.textContent = selectedFurniture.category || '';
  if (sizeEl) sizeEl.textContent = resolveFurnitureDimensions(selectedFurniture).text;   // same validated value the server sends to the AI
  if (priceEl) {
    const info = getDiscountInfo(selectedFurniture);
    if (info.isDiscounted) {
      priceEl.innerHTML = `<span style="font-size:0.85rem;color:#9ca3af;text-decoration:line-through;font-weight:500;margin-right:0.4rem;">${formatCurrency(info.regular)}</span>${formatCurrency(info.final)} <span style="background:#DC143C;color:#fff;font-size:0.7rem;font-weight:700;padding:0.15rem 0.5rem;border-radius:9999px;vertical-align:middle;">${info.percent}% OFF</span>`;
    } else {
      priceEl.textContent = formatCurrency(selectedFurniture.price);
    }
  }
}

const ALLOWED_ROOM_TYPES = ['image/jpeg', 'image/png', 'image/webp'];

const MAX_ROOM_DIMENSION = 1600;

 // longest side in pixels, keeps uploads small and cheaper for the AI

// Shrinks the room photo in the browser and returns a JPEG data-URL
function downscaleRoomImage(dataUrl) {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => {
      const scale = Math.min(1, MAX_ROOM_DIMENSION / Math.max(img.width, img.height));
      const w = Math.round(img.width * scale);
      const h = Math.round(img.height * scale);
      const canvas = document.createElement('canvas');
      canvas.width = w;
      canvas.height = h;
      const ctx = canvas.getContext('2d');
      ctx.fillStyle = '#ffffff';
      ctx.fillRect(0, 0, w, h);
      ctx.drawImage(img, 0, 0, w, h);
      resolve(canvas.toDataURL('image/jpeg', 0.85));
    };
    img.onerror = () => reject(new Error('decode failed'));
    img.src = dataUrl;
  });
}

function processRoomFile(file) {
  const roomInput = document.getElementById('roomImageInput');

  if (!ALLOWED_ROOM_TYPES.includes(file.type)) {
    showToast('Please upload a JPG, PNG or WEBP photo.', 'warning');
    if (roomInput) roomInput.value = '';
    return;
  }
  if (file.size > 10 * 1024 * 1024) {
    showToast('File too large. Max 10MB.', 'warning');
    if (roomInput) roomInput.value = '';
    return;
  }
  const reader = new FileReader();
  reader.onerror = () => showToast('We could not read that file. Please try another photo.', 'error');
  reader.onload = (e) => {
    downscaleRoomImage(e.target.result).then((resizedDataUrl) => {
      roomImageBase64 = resizedDataUrl;

      const preview = document.getElementById('roomPreviewImg');
      if (preview) { preview.src = roomImageBase64; preview.style.display = 'block'; }

      const info = document.getElementById('roomUploadedInfo');
      if (info) { info.style.display = 'flex'; }

      const fileName = document.getElementById('roomFileName');
      if (fileName) fileName.textContent = file.name + ' — Ready';

      activateStepBadge('stepBadge2', 'stepLabel2');
      activateStepBadge('step2BadgeRight', null);
      setVizFieldError('roomPhotoError', '');
      updateGenerateButton();
    }).catch(() => {
      showToast('We could not open that image. Please try a different photo.', 'error');
      if (roomInput) roomInput.value = '';
    });
  };
  reader.readAsDataURL(file);
}

// Kept so every existing caller still works: the step circles are drawn by renderVizStepper()
function activateStepBadge() {
  if (typeof renderVizStepper === 'function') renderVizStepper();
}

function updateGenerateButton() {
  const btn = document.getElementById('generateBtn');
  const hint = document.getElementById('generateHint');
  if (!btn) return;

  if (selectedFurniture && roomImageBase64) {
    btn.disabled = false;
    if (hint) hint.textContent = `Ready! Click to visualize "${selectedFurniture.name}" in your room.`;
    activateStepBadge('stepBadge3', 'stepLabel3');
    activateStepBadge('step3BadgeRight', null);
  } else if (!selectedFurniture) {
    btn.disabled = true;
    if (hint) hint.textContent = 'Please select a furniture first from the furniture list.';
  } else {
    btn.disabled = true;
    if (hint) hint.textContent = 'Please upload a photo of your room to continue.';
  }
}

let isGenerating = false;

async function generateVisualization() {
  if (isGenerating) return; // ignore double-clicks while a request is running

  if (!selectedFurniture) { showToast('Please select a furniture first.', 'warning'); return; }
  if (!roomImageBase64) { showToast('Please upload a photo of your room first.', 'warning'); return; }

  const placement = (document.getElementById('placementInstructions')?.value || '').trim();
  if (!placement) { showToast('Please describe where to place the furniture.', 'warning'); return; }

  isGenerating = true;

  const generateBtn = document.getElementById('generateBtn');
  const generateBtnText = document.getElementById('generateBtnText');
  const originalBtnText = generateBtnText ? generateBtnText.textContent : '';

  document.getElementById('loadingSection').style.display = 'block';
  document.getElementById('resultSection').style.display = 'none';
  document.getElementById('errorSection').style.display = 'none';
  generateBtn.disabled = true;
  if (generateBtnText) generateBtnText.textContent = 'Generating Visualization...';
  setVizNavLocked(true);
  syncVizStep3();
  renderVizStepper();

  let progress = 0;
  const loadingMessages = [
    'Sending room photo to AI server...',
    'AI is analyzing your room layout...',
    'Placing furniture into your room...',
    'Almost done! Finalizing the result...'
  ];
  let msgIndex = 0;
  const progressInterval = setInterval(() => {
    progress = Math.min(progress + Math.random() * 4, 90);
    const bar = document.getElementById('progressBar');
    const text = document.getElementById('progressText');
    const msg = document.getElementById('loadingMessage');
    if (bar) bar.style.width = progress + '%';
    if (text) text.textContent = Math.round(progress) + '%';
    if (msg && Math.floor(progress / 25) !== msgIndex) {
      msgIndex = Math.floor(progress / 25);
      msg.textContent = loadingMessages[msgIndex] || loadingMessages[loadingMessages.length - 1];
    }
  }, 800);

  // Stop waiting after 150 seconds (the server may be waking up or the AI may be slow)
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), 150000);

  try {
    const response = await fetch(`${API_URL}/api/visualize`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      signal: controller.signal,
      body: JSON.stringify({
        furnitureId: selectedFurniture.id,
        style: selectedStyle,
        roomImage: roomImageBase64,
        placementInstructions: placement,
        referenceSize: document.getElementById('referenceSize')?.value || ''
      })
    });

    // If the server answered with something that is not JSON (e.g. a proxy error page), show a friendly message
    const result = await response.json().catch(() => null);
    if (!result) {
      throw new Error(response.status === 413
        ? 'Your room photo is too large. Please upload a smaller photo.'
        : 'The server sent an unexpected response. Please try again in a moment.');
    }
    if (!result.success || !result.image) throw new Error(result.message || 'Something went wrong. Please try again.');

    lastGeneratedResult = result.image;
    lastResultSig = vizInputSignature();

    const bar = document.getElementById('progressBar');
    const text = document.getElementById('progressText');
    if (bar) bar.style.width = '100%';
    if (text) text.textContent = '100%';

    document.getElementById('loadingSection').style.display = 'none';
    document.getElementById('beforeImage').src = roomImageBase64;
    document.getElementById('afterImage').src = result.image;
    document.getElementById('resultFurnitureName').textContent = selectedFurniture.name;
    document.getElementById('resultSection').style.display = 'block';
    showToast('Visualization complete!', 'success');
    if (result.sizeVerified === false) showToast('This item has no verified dimensions, so its size in the picture is only approximate.', 'warning', 6000);
    syncVizStep3();

  } catch (error) {
    console.error('🤖 [AI] Error:', error);
    document.getElementById('loadingSection').style.display = 'none';

    let friendlyMessage = error.message || 'Something went wrong. Please try again.';
    if (error.name === 'AbortError') {
      friendlyMessage = 'The visualization took too long. Please try again in a moment.';
    } else if (error instanceof TypeError) {
      friendlyMessage = 'We could not reach the server. Please check your internet connection and try again. If the server was asleep, wait a few seconds first.';
    }

    const errMsgEl = document.getElementById('errorMessage');
    if (errMsgEl) errMsgEl.textContent = friendlyMessage;
    document.getElementById('errorSection').style.display = 'block';
    showToast(friendlyMessage, 'error', 5000);
    syncVizStep3();
  } finally {
    clearTimeout(timeoutId);
    clearInterval(progressInterval);
    isGenerating = false;
    generateBtn.disabled = false;
    if (generateBtnText) generateBtnText.textContent = originalBtnText;
    setVizNavLocked(false);
    renderVizStepper();
  }
}

function resetVisualization() {
  document.getElementById('resultSection').style.display = 'none';
  document.getElementById('errorSection').style.display = 'none';
  roomImageBase64 = null;
  lastGeneratedResult = null;
  lastResultSig = null;

  const preview = document.getElementById('roomPreviewImg');
  if (preview) preview.style.display = 'none';

  const info = document.getElementById('roomUploadedInfo');
  if (info) info.style.display = 'none';

  const input = document.getElementById('roomImageInput');
  if (input) input.value = '';

  updateGenerateButton();
  syncVizStep3();
  renderVizStepper();
}

// "Start Over": clear the photo, instructions and result, and go back to Step 1 (the furniture stays selected)
function startOverVisualization() {
  resetVisualization();
  const note = document.getElementById('placementInstructions');
  if (note) note.value = '';
  setVizFieldError('roomPhotoError', '');
  setVizFieldError('placementError', '');
  showVizStep(1);
}

function downloadResult() {
  if (!lastGeneratedResult) return;
  const link = document.createElement('a');
  link.href = lastGeneratedResult;
  link.download = `ecl-visualization-${selectedFurniture ? selectedFurniture.name.replace(/\s+/g, '-') : 'result'}.png`;
  link.click();
}

// -----------------------------------------------------------------------------
// THREE-STEP FLOW: Pick Furniture -> Upload Room Photo -> Generate & Download
// Only the active step's panel is visible. Selections, the room photo (kept in memory as roomImageBase64) and the
// placement text are never reset by moving between steps, so nothing is re-uploaded when you go back and forth.
// -----------------------------------------------------------------------------
const VIZ_STEP_COUNT = 3;

const VIZ_STEP_NAMES = ['Pick Furniture', 'Upload Room Photo', 'Generate & Download'];

const VIZ_CHECK_SVG = '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><polyline points="20 6 9 17 4 12"></polyline></svg>';

function vizPlacementText() {
  const el = document.getElementById('placementInstructions');
  return el ? el.value.trim() : '';
}

// Identifies the inputs a result was generated from, so a result is never shown for different inputs
function vizInputSignature() {
  if (!selectedFurniture || !roomImageBase64) return null;
  return JSON.stringify([selectedFurniture.id, selectedStyle, vizPlacementText(), roomImageBase64.length, roomImageBase64.slice(-64)]);
}

// Is the requirement of this step satisfied? (Step 3 = a result exists for the current inputs)
function vizStepComplete(n) {
  if (n === 1) return !!selectedFurniture;
  if (n === 2) return !!roomImageBase64 && vizPlacementText().length > 0;
  if (n === 3) {
    const sig = vizInputSignature();
    return !!lastGeneratedResult && !!sig && sig === lastResultSig;
  }
  return false;
}

// Active step = accent colour, completed = green check, others = grey
function renderVizStepper() {
  for (let i = 1; i <= VIZ_STEP_COUNT; i++) {
    const btn = document.getElementById('vizStepBtn' + i);
    const circle = document.getElementById('stepBadge' + i);
    if (!btn || !circle) continue;
    const active = i === vizCurrentStep;
    const done = vizStepComplete(i);
    btn.classList.toggle('active', active);
    btn.classList.toggle('completed', done);
    if (active) btn.setAttribute('aria-current', 'step'); else btn.removeAttribute('aria-current');
    btn.setAttribute('aria-label', `Step ${i}: ${VIZ_STEP_NAMES[i - 1]}${done ? ' (completed)' : ''}`);
    circle.innerHTML = (done && !active) ? VIZ_CHECK_SVG : String(i);
    const line = document.getElementById('vizLine' + i);
    if (line) line.classList.toggle('done', done);
  }
}

function setVizFieldError(id, message) {
  const el = document.getElementById(id);
  if (!el) return;
  el.textContent = message || '';
  el.classList.toggle('show', !!message);
  if (message) el.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
}

// Tells the user exactly what is missing for a step
function showVizValidation(step) {
  if (step === 1) {
    setVizFieldError('vizStep1Error', 'Please select a furniture to continue.');
    showToast('Please select a furniture first.', 'warning');
  } else if (step === 2) {
    const noPhoto = !roomImageBase64;
    const noNote = !vizPlacementText();
    setVizFieldError('roomPhotoError', noPhoto ? 'Please upload a photo of your room.' : '');
    setVizFieldError('placementError', noNote ? 'Please describe where to place the furniture.' : '');
    showToast(noPhoto ? 'Please upload a photo of your room first.' : 'Please describe where to place the furniture.', 'warning');
    if (!noPhoto && noNote) { const t = document.getElementById('placementInstructions'); if (t) t.focus(); }
  }
}

function setVizNavLocked(locked) {
  const back = document.getElementById('vizBack3');
  if (back) back.disabled = !!locked;
  const stepper = document.getElementById('vizStepper');
  if (stepper) stepper.classList.toggle('locked', !!locked);
}

// Shows the "Generate" card only when nothing else (processing / result / error) is on screen in Step 3
function syncVizStep3() {
  const shown = (id) => { const el = document.getElementById(id); return !!el && el.style.display !== 'none'; };
  const busy = shown('loadingSection') || shown('resultSection') || shown('errorSection');
  const card = document.getElementById('vizGenerateCard');
  if (card) card.style.display = busy ? 'none' : '';
}

function renderVizSummary() {
  const el = document.getElementById('vizSummary');
  if (!el) return;
  if (!selectedFurniture) { el.innerHTML = ''; return; }
  const chip = (label, value) => `<span class="viz-chip"><strong>${label}</strong> ${escapeHtmlText(value)}</span>`;
  const note = vizPlacementText();
  el.innerHTML =
    chip('Furniture:', selectedFurniture.name || '') +
    chip('Style:', selectedStyle) +
    (roomImageBase64 ? chip('Room photo:', 'Attached') : '') +
    (note ? chip('Placement:', note.length > 70 ? note.slice(0, 70) + '…' : note) : '');
}

function prepareVizStep3() {
  renderVizSummary();
  if (!isGenerating) {
    const loading = document.getElementById('loadingSection');
    const error = document.getElementById('errorSection');
    const result = document.getElementById('resultSection');
    if (loading) loading.style.display = 'none';
    if (error) error.style.display = 'none';
    // A previous result is shown again only while it still matches the current inputs
    if (result) result.style.display = vizStepComplete(3) ? 'block' : 'none';
  }
  updateGenerateButton();
  syncVizStep3();
}

function showVizStep(n, opts = {}) {
  vizCurrentStep = n;
  for (let i = 1; i <= VIZ_STEP_COUNT; i++) {
    const panel = document.getElementById('vizPanel' + i);
    if (panel) panel.hidden = i !== n;
  }
  if (n === 2) {
    const sub = document.getElementById('vizPanel2Sub');
    if (sub && selectedFurniture) sub.textContent = `Placing: ${selectedFurniture.name}. Add a clear photo of your room and tell the AI where it should go.`;
  }
  if (n === 3) prepareVizStep3();
  renderVizStepper();
  if (!opts.noFocus) {
    const stepper = document.getElementById('vizStepper');
    if (stepper) {
      const top = stepper.getBoundingClientRect().top;
      if (top < 0 || top > window.innerHeight * 0.6) stepper.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }
    const heading = document.getElementById('vizHeading' + n);
    if (heading) heading.focus({ preventScroll: true });
  }
}

// Moving forward needs every earlier step to be complete; going back is always allowed
function goToVizStep(target) {
  target = Number(target);
  if (!(target >= 1 && target <= VIZ_STEP_COUNT)) return false;
  if (target === vizCurrentStep) return true;
  if (isGenerating) { showToast('Please wait until the visualization finishes.', 'info'); return false; }
  for (let i = 1; i < target; i++) {
    if (!vizStepComplete(i)) {
      if (i !== vizCurrentStep) showVizStep(i);
      showVizValidation(i);
      return false;
    }
  }
  showVizStep(target);
  return true;
}

// ---- Step 1: furniture catalog (same data source as the furniture list: API.getFurniture -> GET /products) ----
async function loadVizCatalog() {
  const grid = document.getElementById('vizProductGrid');
  const status = document.getElementById('vizCatalogStatus');
  if (!grid) return;
  if (status) status.innerHTML = '<span class="kd-spinner" aria-hidden="true"></span>Loading furniture...';
  try {
    const result = await API.getFurniture();
    if (!result || !result.success) throw new Error('catalog failed');
    vizCatalog = Array.isArray(result.data) ? result.data : [];

    const select = document.getElementById('vizCategory');
    if (select) {
      const categories = [...new Set(vizCatalog.map(p => p.category).filter(Boolean))].sort();
      select.innerHTML = '<option value="">All categories</option>' +
        categories.map(c => `<option value="${escapeHtmlText(c)}">${escapeHtmlText(c)}</option>`).join('');
    }
    renderVizCatalog();
  } catch (e) {
    grid.innerHTML = '';
    if (status) {
      status.innerHTML = 'We could not load the furniture list. The server may still be waking up. <button type="button" class="viz-link-btn" id="vizCatalogRetry">Try again</button>';
      const retry = document.getElementById('vizCatalogRetry');
      if (retry) retry.addEventListener('click', loadVizCatalog);
    }
  }
}

function renderVizCatalog() {
  const grid = document.getElementById('vizProductGrid');
  const status = document.getElementById('vizCatalogStatus');
  if (!grid) return;
  const q = (document.getElementById('vizSearch')?.value || '').trim().toLowerCase();
  const category = document.getElementById('vizCategory')?.value || '';
  const list = vizCatalog.filter(p =>
    (!category || p.category === category) &&
    (!q || `${p.name || ''} ${p.category || ''} ${p.material || ''}`.toLowerCase().includes(q)));

  grid.innerHTML = '';
  if (status) {
    status.textContent = list.length
      ? `Showing ${list.length} of ${vizCatalog.length} product${vizCatalog.length !== 1 ? 's' : ''}`
      : (vizCatalog.length ? 'No furniture matches your search.' : 'No furniture is available right now.');
  }
  list.forEach(p => grid.appendChild(buildVizProductCard(p)));
}

function buildVizProductCard(p) {
  const card = document.createElement('div');
  card.className = 'viz-product';
  card.setAttribute('role', 'button');
  card.tabIndex = 0;
  card.dataset.id = p.id;
  const isSelected = !!selectedFurniture && String(selectedFurniture.id) === String(p.id);
  card.classList.toggle('selected', isSelected);
  card.setAttribute('aria-pressed', isSelected ? 'true' : 'false');
  card.innerHTML = `
    <span class="viz-product-check" aria-hidden="true">${VIZ_CHECK_SVG}</span>
    <img src="${escapeHtmlText(p.image || 'placeholder-furniture.jpg')}" alt="${escapeHtmlText(p.name || 'Furniture')}" loading="lazy" onerror="this.onerror=null;this.src='placeholder-furniture.jpg'">
    <div class="viz-product-body">
      <p class="viz-product-cat">${escapeHtmlText(p.category || '')}</p>
      <h3 class="viz-product-name">${escapeHtmlText(p.name || '')}</h3>
      <div class="viz-product-price">${renderPriceHTML(p)}</div>
    </div>`;
  card.addEventListener('click', () => selectVizFurniture(p));
  card.addEventListener('keydown', (e) => {
    if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); selectVizFurniture(p); }
  });
  return card;
}

// Same storage the "Visualize in My Room" button uses, so a page refresh keeps the selection
function selectVizFurniture(product) {
  selectedFurniture = product;
  try { sessionStorage.setItem('selectedFurniture', JSON.stringify(product)); } catch (e) { /* storage unavailable: the selection still works for this visit */ }
  showFurnitureOnVizPage();
  document.querySelectorAll('#vizProductGrid .viz-product').forEach(card => {
    const on = String(card.dataset.id) === String(product.id);
    card.classList.toggle('selected', on);
    card.setAttribute('aria-pressed', on ? 'true' : 'false');
  });
  setVizFieldError('vizStep1Error', '');
  updateGenerateButton();
  renderVizStepper();
}

function initVizWizard() {
  document.querySelectorAll('.viz-step').forEach(btn => btn.addEventListener('click', () => goToVizStep(btn.dataset.step)));

  const on = (id, handler) => { const el = document.getElementById(id); if (el) el.addEventListener('click', handler); };
  on('vizNext1', () => goToVizStep(2));
  on('vizBack2', () => goToVizStep(1));
  on('vizNext2', () => goToVizStep(3));
  on('vizBack3', () => goToVizStep(2));
  on('changeRoomPhotoBtn', () => { const input = document.getElementById('roomImageInput'); if (input) input.click(); });

  const note = document.getElementById('placementInstructions');
  if (note) note.addEventListener('input', () => { setVizFieldError('placementError', ''); renderVizStepper(); });
  document.querySelectorAll('.style-option').forEach(btn => btn.addEventListener('click', renderVizStepper));

  const search = document.getElementById('vizSearch');
  if (search) search.addEventListener('input', renderVizCatalog);
  const category = document.getElementById('vizCategory');
  if (category) category.addEventListener('change', renderVizCatalog);

  showVizStep(1, { noFocus: true });
  loadVizCatalog();
}