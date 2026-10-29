// =============================================================================
// K-DESK · ai-visualization.js
// ai-visualization
// Cut from the original main.js (lines 3745-4358 region). Code is unchanged except where a comment says otherwise.
// Enhanced: predefined placement prompts, furniture-only instructions, and multiple furniture items per generation.
// =============================================================================

import { API, API_URL, escapeHtmlText, formatCurrency, getDiscountInfo, renderPriceHTML } from './core.js';
import { showToast } from './ui.js';
import { resolveFurnitureDimensions } from './dimensions.js';

// =============================================================================
// AI VISUALIZATION PAGE
// =============================================================================

// Maximum furniture items in one generation. Keep in sync with MAX_VISUALIZE_ITEMS in server.js (the server enforces it).
const VIZ_MAX_ITEMS = 3;

// Predefined placement prompts. Only the id is sent; the server owns the exact instruction text for each id
// (VISUALIZE_PROMPT_PRESETS in server.js), so these labels are for display only. Keep the ids in sync.
const VIZ_PROMPT_PRESETS = [
  { id: 'natural', label: 'Place the selected furniture naturally in my room' },
  { id: 'near_wall', label: 'Position the furniture near a wall' },
  { id: 'center', label: 'Place the furniture in the center of the room' },
  { id: 'beside_window', label: 'Position the furniture beside a window' },
  { id: 'arrange_layout', label: 'Arrange the selected furniture with the existing room layout' },
  { id: 'realistic', label: 'Maintain realistic proportions, lighting, perspective, and shadows' }
];

// Client-side furniture-only guard (mirrored on the backend in server.js so bypassing the UI is also blocked).
const VIZ_OFF_TOPIC_PATTERNS = [
  /\b(generate|create|draw|make|render|paint|design)\s+(me\s+)?(an?\s+|the\s+|some\s+)?(new\s+)?(image|picture|photo|drawing|painting|illustration|artwork|wallpaper|poster)s?\b/i,
  /\bturn\s+(the|this|my)\s+(room|photo|image|picture)\s+into\b/i,
  /\b(add|insert|draw|put|place|include|show|generate|create)\s+(an?\s+|some\s+|the\s+|my\s+|two\s+|three\s+)?(person|people|man|men|woman|women|child|children|kid|kids|baby|girl|boy|human|family|dog|cat|pet|animal|bird|horse|car|tree|plant)s?\b/i,
  /\b(anime|cartoon|celebrity|selfie|portrait|landscape|scenery|nude|naked|nsfw|weapon|gun|rifle|knife|blood|dragon|monster|zombie|superhero|logo|watermark|meme)s?\b/i,
  /\b(repaint|paint|recolou?r|change|remove|delete|demolish|replace|move)\s+(the\s+|my\s+|all\s+|every\s+)?(walls?|floor|flooring|ceiling|windows?|doors?|existing\s+furniture)\b/i
];
const VIZ_OFF_TOPIC_MESSAGE = 'This feature is only for visualizing the selected furniture in your room photo. Please describe where to place the furniture (for example "beside the window" or "against the left wall").';

function isOffTopicInstruction(text) {
  return VIZ_OFF_TOPIC_PATTERNS.some(re => re.test(text));
}

let selectedItems = [];

   // furniture records chosen in Step 1 (from GET /products), in selection order

let roomImageBase64 = null;

let selectedStyle = 'Modern';

let selectedPreset = '';

   // id from VIZ_PROMPT_PRESETS, or '' when only custom instructions are used

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

  initVizPresets();
  initVizWizard();
}

// Selection persistence: 'vizSelectedFurniture' holds the list; 'selectedFurniture' (set by the
// "Visualize in My Room" button on the furniture detail page) is kept equal to the first item, so the original
// single-furniture workflow keeps working and a fresh click on that button is always added to the selection.
function loadSelectedFurniture() {
  let list = null;
  let single = null;
  try { list = JSON.parse(sessionStorage.getItem('vizSelectedFurniture') || 'null'); } catch (e) { list = null; }
  try { single = JSON.parse(sessionStorage.getItem('selectedFurniture') || 'null'); } catch (e) { single = null; }
  selectedItems = Array.isArray(list) ? list.filter(p => p && typeof p === 'object' && p.id !== undefined).slice(0, VIZ_MAX_ITEMS) : [];
  if (single && typeof single === 'object' && single.id !== undefined && !selectedItems.some(p => String(p.id) === String(single.id))) {
    selectedItems.unshift(single);
    selectedItems = selectedItems.slice(0, VIZ_MAX_ITEMS);
  }
  if (selectedItems.length) {
    persistSelection();
    if (single) {
      const backBtn = document.getElementById('backBtnContainer');
      if (backBtn) backBtn.style.display = 'block';
    }
  }
  showFurnitureOnVizPage();
  activateStepBadge();
  updateGenerateButton();
}

function persistSelection() {
  try {
    sessionStorage.setItem('vizSelectedFurniture', JSON.stringify(selectedItems));
    if (selectedItems.length) sessionStorage.setItem('selectedFurniture', JSON.stringify(selectedItems[0]));
    else sessionStorage.removeItem('selectedFurniture');
  } catch (e) { /* storage unavailable: the selection still works for this visit */ }
}

function selectedNames() {
  return selectedItems.map(p => p.name || 'Furniture');
}

// Readable list: "Sofa", "Sofa and Table", "Sofa, Table and Chair"
function joinNames(names) {
  if (names.length <= 1) return names[0] || '';
  return `${names.slice(0, -1).join(', ')} and ${names[names.length - 1]}`;
}

function itemPriceHTML(item) {
  const info = getDiscountInfo(item);
  if (info.isDiscounted) {
    return `<span style="font-size:0.8rem;color:#9ca3af;text-decoration:line-through;font-weight:500;margin-right:0.35rem;">${formatCurrency(info.regular)}</span>${formatCurrency(info.final)} <span style="background:#DC143C;color:#fff;font-size:0.65rem;font-weight:700;padding:0.1rem 0.45rem;border-radius:9999px;vertical-align:middle;">${info.percent}% OFF</span>`;
  }
  return escapeHtmlText(formatCurrency(item.price));
}

// Renders the "Selected Furniture" side panel (name, image, category, size, price and a Remove button per item)
function showFurnitureOnVizPage() {
  const noState = document.getElementById('noFurnitureState');
  const selectedState = document.getElementById('furnitureSelectedState');
  const has = selectedItems.length > 0;
  if (noState) noState.style.display = has ? 'none' : 'block';
  if (selectedState) selectedState.style.display = has ? 'block' : 'none';

  const countEl = document.getElementById('vizSelectedCount');
  if (countEl) countEl.textContent = `${selectedItems.length} of ${VIZ_MAX_ITEMS} selected`;

  const listEl = document.getElementById('vizSelectedList');
  if (!listEl) return;
  listEl.innerHTML = '';
  selectedItems.forEach(item => {
    const row = document.createElement('div');
    row.className = 'viz-selected-item';
    row.innerHTML = `
      <img src="${escapeHtmlText(item.image || 'placeholder-furniture.jpg')}" alt="${escapeHtmlText(item.name || 'Furniture')}" onerror="this.onerror=null;this.src='placeholder-furniture.jpg'">
      <div class="viz-selected-info">
        <p class="viz-selected-cat">${escapeHtmlText(item.category || '')}</p>
        <p class="viz-selected-name">${escapeHtmlText(item.name || '')}</p>
        <p class="viz-selected-size">${escapeHtmlText(resolveFurnitureDimensions(item).text)}</p>
        <p class="viz-selected-price">${itemPriceHTML(item)}</p>
      </div>
      <button type="button" class="viz-remove-btn" aria-label="Remove ${escapeHtmlText(item.name || 'item')}" title="Remove">×</button>`;
    row.querySelector('.viz-remove-btn').addEventListener('click', () => removeVizFurniture(item.id));
    listEl.appendChild(row);
  });
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

  if (selectedItems.length && roomImageBase64) {
    btn.disabled = false;
    if (hint) hint.textContent = `Ready! Click to visualize ${joinNames(selectedNames().map(n => `"${n}"`))} in your room.`;
    activateStepBadge('stepBadge3', 'stepLabel3');
    activateStepBadge('step3BadgeRight', null);
  } else if (!selectedItems.length) {
    btn.disabled = true;
    if (hint) hint.textContent = 'Please select at least one furniture item first.';
  } else {
    btn.disabled = true;
    if (hint) hint.textContent = 'Please upload a photo of your room to continue.';
  }
}

let isGenerating = false;

async function generateVisualization() {
  if (isGenerating) return; // ignore double-clicks while a request is running

  if (!selectedItems.length) { showToast('Please select a furniture first.', 'warning'); return; }
  if (!roomImageBase64) { showToast('Please upload a photo of your room first.', 'warning'); return; }

  const placement = vizPlacementText();
  if (!placement && !selectedPreset) { showToast('Please choose a placement option or describe where to place the furniture.', 'warning'); return; }
  if (placement && isOffTopicInstruction(placement)) {
    setVizFieldError('placementError', VIZ_OFF_TOPIC_MESSAGE, { noScroll: true });
    showToast(VIZ_OFF_TOPIC_MESSAGE, 'warning', 5000);
    return;
  }

  isGenerating = true;

  // Snapshot of the inputs for this request (the selection cannot change while generating, but be safe)
  const items = selectedItems.slice();
  const names = items.map(p => p.name || 'Furniture');

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
    items.length > 1 ? `Placing ${items.length} furniture items into your room...` : 'Placing furniture into your room...',
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
        furnitureIds: items.map(p => p.id),
        furnitureId: items[0].id, // original single-item field, kept for compatibility
        style: selectedStyle,
        roomImage: roomImageBase64,
        promptPreset: selectedPreset || undefined,
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
    if (!result.success || !result.image) {
      const err = new Error(result.message || 'Something went wrong. Please try again.');
      err.code = result.code;
      throw err;
    }

    lastGeneratedResult = result.image;
    lastResultSig = vizInputSignature();

    const bar = document.getElementById('progressBar');
    const text = document.getElementById('progressText');
    if (bar) bar.style.width = '100%';
    if (text) text.textContent = '100%';

    document.getElementById('loadingSection').style.display = 'none';
    document.getElementById('beforeImage').src = roomImageBase64;
    document.getElementById('afterImage').src = result.image;
    document.getElementById('resultFurnitureName').textContent = joinNames(names);
    document.getElementById('resultSection').style.display = 'block';
    showToast('Visualization complete!', 'success');
    if (result.sizeVerified === false) {
      const unverified = Array.isArray(result.unverifiedItems) && result.unverifiedItems.length ? joinNames(result.unverifiedItems) : 'This item';
      showToast(`${unverified} ${Array.isArray(result.unverifiedItems) && result.unverifiedItems.length > 1 ? 'have' : 'has'} no verified dimensions, so the size in the picture is only approximate.`, 'warning', 6000);
    }
    if (Array.isArray(result.missingReferences) && result.missingReferences.length) {
      showToast(`No product photo could be used for ${joinNames(result.missingReferences)}, so its look is based on the description only.`, 'warning', 6000);
    }
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
    // Off-topic instructions: also flag the instructions field in Step 2 so the user knows what to change
    if (error.code === 'OFF_TOPIC_REQUEST') setVizFieldError('placementError', friendlyMessage, { noScroll: true });

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

// "Start Over": clear the photo, instructions, placement option and result, and go back to Step 1 (the furniture stays selected)
function startOverVisualization() {
  resetVisualization();
  const note = document.getElementById('placementInstructions');
  if (note) note.value = '';
  setVizPreset('');
  setVizFieldError('roomPhotoError', '');
  setVizFieldError('placementError', '');
  showVizStep(1);
}

function downloadResult() {
  if (!lastGeneratedResult) return;
  const link = document.createElement('a');
  link.href = lastGeneratedResult;
  const base = selectedItems.length ? selectedNames().join('-').replace(/[^\w-]+/g, '-').replace(/-+/g, '-').slice(0, 80) : 'result';
  link.download = `ecl-visualization-${base}.png`;
  link.click();
}

// -----------------------------------------------------------------------------
// PREDEFINED PLACEMENT PROMPTS (Step 2). One option can be selected; clicking it again clears it.
// It can be combined with the optional custom instructions in the textarea.
// -----------------------------------------------------------------------------
function initVizPresets() {
  const grid = document.getElementById('vizPresetGrid');
  if (!grid) return;
  grid.innerHTML = '';
  VIZ_PROMPT_PRESETS.forEach(preset => {
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'viz-preset';
    btn.dataset.preset = preset.id;
    btn.setAttribute('aria-pressed', 'false');
    btn.textContent = preset.label;
    btn.addEventListener('click', () => setVizPreset(selectedPreset === preset.id ? '' : preset.id));
    grid.appendChild(btn);
  });
}

function setVizPreset(id) {
  selectedPreset = VIZ_PROMPT_PRESETS.some(p => p.id === id) ? id : '';
  document.querySelectorAll('#vizPresetGrid .viz-preset').forEach(btn => {
    const on = btn.dataset.preset === selectedPreset;
    btn.classList.toggle('selected', on);
    btn.setAttribute('aria-pressed', on ? 'true' : 'false');
  });
  if (selectedPreset) setVizFieldError('placementError', '');
  renderVizStepper();
}

function vizPresetLabel() {
  const preset = VIZ_PROMPT_PRESETS.find(p => p.id === selectedPreset);
  return preset ? preset.label : '';
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
  if (!selectedItems.length || !roomImageBase64) return null;
  return JSON.stringify([selectedItems.map(p => p.id), selectedStyle, selectedPreset, vizPlacementText(), roomImageBase64.length, roomImageBase64.slice(-64)]);
}

// Is the requirement of this step satisfied? (Step 3 = a result exists for the current inputs)
function vizStepComplete(n) {
  if (n === 1) return selectedItems.length > 0;
  if (n === 2) {
    const note = vizPlacementText();
    return !!roomImageBase64 && (!!selectedPreset || note.length > 0) && (!note || !isOffTopicInstruction(note));
  }
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

function setVizFieldError(id, message, opts = {}) {
  const el = document.getElementById(id);
  if (!el) return;
  el.textContent = message || '';
  el.classList.toggle('show', !!message);
  if (message && !opts.noScroll) el.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
}

// Tells the user exactly what is missing for a step
function showVizValidation(step) {
  if (step === 1) {
    setVizFieldError('vizStep1Error', 'Please select at least one furniture item to continue.');
    showToast('Please select a furniture first.', 'warning');
  } else if (step === 2) {
    const noPhoto = !roomImageBase64;
    const note = vizPlacementText();
    const noNote = !note && !selectedPreset;
    const offTopic = !!note && isOffTopicInstruction(note);
    setVizFieldError('roomPhotoError', noPhoto ? 'Please upload a photo of your room.' : '');
    setVizFieldError('placementError', offTopic ? VIZ_OFF_TOPIC_MESSAGE : (noNote ? 'Please choose a placement option or describe where to place the furniture.' : ''));
    showToast(noPhoto ? 'Please upload a photo of your room first.' : (offTopic ? VIZ_OFF_TOPIC_MESSAGE : 'Please choose a placement option or describe where to place the furniture.'), 'warning');
    if (!noPhoto && (noNote || offTopic)) { const t = document.getElementById('placementInstructions'); if (t) t.focus(); }
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
  if (!selectedItems.length) { el.innerHTML = ''; return; }
  const chip = (label, value) => `<span class="viz-chip"><strong>${label}</strong> ${escapeHtmlText(value)}</span>`;
  const note = vizPlacementText();
  const preset = vizPresetLabel();
  el.innerHTML =
    chip(selectedItems.length > 1 ? `Furniture (${selectedItems.length}):` : 'Furniture:', selectedNames().join(', ')) +
    chip('Style:', selectedStyle) +
    (roomImageBase64 ? chip('Room photo:', 'Attached') : '') +
    (preset ? chip('Placement:', preset) : '') +
    (note ? chip(preset ? 'Notes:' : 'Placement:', note.length > 70 ? note.slice(0, 70) + '…' : note) : '');
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
    if (sub && selectedItems.length) sub.textContent = `Placing: ${joinNames(selectedNames())}. Add a clear photo of your room and choose where ${selectedItems.length > 1 ? 'they' : 'it'} should go.`;
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

    // Refresh stored selections with the current database records, and drop items that no longer exist
    if (selectedItems.length) {
      const before = selectedItems.length;
      selectedItems = selectedItems.map(sel => vizCatalog.find(p => String(p.id) === String(sel.id))).filter(Boolean);
      if (selectedItems.length !== before) showToast('Some previously selected furniture is no longer available and was removed.', 'info');
      persistSelection();
      showFurnitureOnVizPage();
      updateGenerateButton();
      renderVizStepper();
    }

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

function isVizSelected(id) {
  return selectedItems.some(p => String(p.id) === String(id));
}

function buildVizProductCard(p) {
  const card = document.createElement('div');
  card.className = 'viz-product';
  card.setAttribute('role', 'button');
  card.tabIndex = 0;
  card.dataset.id = p.id;
  const isSelected = isVizSelected(p.id);
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

function syncVizCatalogSelection() {
  document.querySelectorAll('#vizProductGrid .viz-product').forEach(card => {
    const on = isVizSelected(card.dataset.id);
    card.classList.toggle('selected', on);
    card.setAttribute('aria-pressed', on ? 'true' : 'false');
  });
}

function onVizSelectionChanged() {
  persistSelection();
  showFurnitureOnVizPage();
  syncVizCatalogSelection();
  if (selectedItems.length) setVizFieldError('vizStep1Error', '');
  updateGenerateButton();
  renderVizStepper();
}

// Clicking a product toggles it in the selection (up to VIZ_MAX_ITEMS). Same storage the "Visualize in My Room"
// button uses, so a page refresh keeps the selection.
function selectVizFurniture(product) {
  if (isGenerating) { showToast('Please wait until the visualization finishes.', 'info'); return; }
  if (isVizSelected(product.id)) {
    selectedItems = selectedItems.filter(p => String(p.id) !== String(product.id));
  } else {
    if (selectedItems.length >= VIZ_MAX_ITEMS) {
      showToast(`You can visualize up to ${VIZ_MAX_ITEMS} furniture items at a time. Remove one to add another.`, 'warning');
      return;
    }
    selectedItems = [...selectedItems, product];
  }
  onVizSelectionChanged();
}

function removeVizFurniture(id) {
  if (isGenerating) { showToast('Please wait until the visualization finishes.', 'info'); return; }
  selectedItems = selectedItems.filter(p => String(p.id) !== String(id));
  onVizSelectionChanged();
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
