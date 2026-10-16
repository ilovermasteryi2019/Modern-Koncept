/* =============================================================================
 * K-Desk | js/modules/ai-visualization.js
 * AI room visualization
 * -----------------------------------------------------------------------------
 * WHAT IT DOES : ai-visualization.js page: choose a furniture, upload a room photo (shrunk in the browser), describe the
 * placement and request the AI-generated picture from the backend.
 * DEPENDS ON   : API_URL, showToast, kd* helpers.
 * LOAD ORDER   : file 16 of 19 (see scripts-block.html). These are plain scripts that share one
 *                global scope, so inline onclick="..." handlers in the HTML keep working.
 * CONTENTS     :
 * selectedFurniture, roomImageBase64, selectedStyle, lastGeneratedResult, initVisualizationPage,
 * loadSelectedFurniture, showFurnitureOnVizPage, ALLOWED_ROOM_TYPES, MAX_ROOM_DIMENSION,
 * downscaleRoomImage, processRoomFile, activateStepBadge, updateGenerateButton, isGenerating,
 * generateVisualization, resetVisualization, downloadResult
 * ============================================================================= */

// =============================================================================
// AI VISUALIZATION PAGE
// =============================================================================

let selectedFurniture = null;
let roomImageBase64 = null;
let selectedStyle = 'Modern';
let lastGeneratedResult = null;


// Starts the AI visualization page: loads the chosen furniture and connects the style buttons, upload area and buttons.
function initVisualizationPage() {
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
  if (tryAgainBtn) tryAgainBtn.addEventListener('click', resetVisualization);

  const retryBtn = document.getElementById('retryBtn');
if (retryBtn) retryBtn.addEventListener('click', resetVisualization);

  const startOverBtn = document.getElementById('startOverBtn');
  if (startOverBtn) startOverBtn.addEventListener('click', resetVisualization);

  // Download button
  const downloadBtn = document.getElementById('downloadBtn');
  if (downloadBtn) downloadBtn.addEventListener('click', downloadResult);
}

// Reads the furniture chosen on the detail page (saved in sessionStorage) and shows it.
function loadSelectedFurniture() {
  const stored = sessionStorage.getItem('selectedFurniture');
  if (stored) {
    selectedFurniture = JSON.parse(stored);
    showFurnitureOnVizPage();
    const backBtn = document.getElementById('backBtnContainer');
    if (backBtn) backBtn.style.display = 'block';
    activateStepBadge('stepBadge2', 'stepLabel2');
  }
  updateGenerateButton();
}

// Shows the selected furniture's image and name on the visualization page.
function showFurnitureOnVizPage() {
  const noState = document.getElementById('noFurnitureState');
  const selectedState = document.getElementById('furnitureSelectedState');
  if (noState) noState.style.display = 'none';
  if (selectedState) selectedState.style.display = 'block';

  const imgEl = document.getElementById('vizFurnitureImg');
  const nameEl = document.getElementById('vizFurnitureName');
  const catEl = document.getElementById('vizFurnitureCategory');
  const priceEl = document.getElementById('vizFurniturePrice');

  if (imgEl) imgEl.src = selectedFurniture.image || 'placeholder-furniture.jpg';
  if (nameEl) nameEl.textContent = selectedFurniture.name || '';
  if (catEl) catEl.textContent = selectedFurniture.category || '';
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
const MAX_ROOM_DIMENSION = 1600; // longest side in pixels, keeps uploads small and cheaper for the AI

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

// Checks the room photo (JPG / PNG / WEBP), shrinks it in the browser and shows the preview.
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
      updateGenerateButton();
    }).catch(() => {
      showToast('We could not open that image. Please try a different photo.', 'error');
      if (roomInput) roomInput.value = '';
    });
  };
  reader.readAsDataURL(file);
}

// Marks a step number (1, 2, 3) on the page as active.
function activateStepBadge(badgeId, labelId) {
  const badge = document.getElementById(badgeId);
  if (badge) { badge.classList.remove('inactive'); }
  if (labelId) {
    const label = document.getElementById(labelId);
    if (label) label.style.color = '#111827';
  }
}

// Enables the Generate button only when a furniture and a room photo are both ready.
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

// Sends the room photo and placement text to the backend, shows progress, then the before / after result.
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
  } finally {
    clearTimeout(timeoutId);
    clearInterval(progressInterval);
    isGenerating = false;
    generateBtn.disabled = false;
    if (generateBtnText) generateBtnText.textContent = originalBtnText;
  }
}


// Clears the room photo and result so the user can start again.
function resetVisualization() {
  document.getElementById('resultSection').style.display = 'none';
  document.getElementById('errorSection').style.display = 'none';
  roomImageBase64 = null;

  const preview = document.getElementById('roomPreviewImg');
  if (preview) preview.style.display = 'none';

  const info = document.getElementById('roomUploadedInfo');
  if (info) info.style.display = 'none';

  const input = document.getElementById('roomImageInput');
  if (input) input.value = '';

  updateGenerateButton();
}

// Downloads the generated picture as a PNG file.
function downloadResult() {
  if (!lastGeneratedResult) return;
  const link = document.createElement('a');
  link.href = lastGeneratedResult;
  link.download = `ecl-visualization-${selectedFurniture ? selectedFurniture.name.replace(/\s+/g, '-') : 'result'}.png`;
  link.click();
}
