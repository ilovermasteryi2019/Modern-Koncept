// =============================================================================
// K-DESK · chatbot.js
// chatbot
// Cut from the original main.js (lines 4369-5146 region). Code is unchanged except where a comment says otherwise.
// =============================================================================

import { API, API_URL, escapeHtmlText, formatDate, kdCreateOnce } from './core.js';
import { hideModal, kdConfirm, kdDeleteOptions as del, kdGuard, kdOpenOptions as open, kdWrapLoader, showModal, showToast } from './ui.js';

// =============================================================================
// CHATBOT
// =============================================================================

// =============================================================================
// CHATBOT  — Database-driven (fetches from /chatbot API)
// =============================================================================

// Stores Q&A loaded from the database. Populated by loadChatbotQA().
let dbChatbotQA = [];

/**
 * Fetches all Q&A entries from the MySQL database via the Node.js API.
 * Called once when the Customer Support page loads.
 */
async function loadChatbotQA() {
  console.log('🤖 [Chatbot] Loading Q&A from database...');
  try {
    const response = await fetch(`${API_URL}/chatbot`);

    if (!response.ok) {
      console.error(`❌ [Chatbot] Server returned status ${response.status}`);
      return false; // a failed refresh keeps the Q&A that was already loaded
    }

    const result = await response.json();

    if (result.success && Array.isArray(result.data)) {
      dbChatbotQA = result.data.filter(qa => qa && typeof qa.question === 'string' && typeof qa.answer === 'string');
      console.log(`✅ [Chatbot] Loaded ${dbChatbotQA.length} Q&A entries from database.`);
      return true;
    }
    console.warn('⚠️ [Chatbot] API returned no Q&A data:', result);
  } catch (error) {
    console.error('❌ [Chatbot] Failed to load Q&A from database:', error.message);
  }
  return false;
}

/**
 * Searches the database Q&A for the best matching response.
 * Uses keyword scoring — no hardcoded answers.
 */
function getBotResponse(message) {
  const lower = message.toLowerCase().trim();

  if (dbChatbotQA.length === 0) {
    console.warn('⚠️ [Chatbot] dbChatbotQA is empty. Is the server running and the chatbot_qa table populated?');
    return "Our support assistant is loading. Please try again in a moment, or contact us directly at (044) 796-1234. 😊";
  }

  let bestMatch = null;
  let bestScore = 0;

  for (const qa of dbChatbotQA) {
    const questionLower = qa.question.toLowerCase();

    // Score 1: full question phrase is found in message
    let score = 0;
    if (lower.includes(questionLower)) {
      score += 10;
    }

    // Score 2: individual keywords from the question that appear in message
    const keywords = questionLower
      .split(/[\s\W]+/)
      .filter(word => word.length >= 3); // only meaningful words

    for (const keyword of keywords) {
      if (lower.includes(keyword)) {
        score += 1;
      }
    }

    if (score > bestScore) {
      bestScore = score;
      bestMatch = qa;
    }
  }

  if (bestMatch && bestScore > 0) {
    console.log(`✅ [Chatbot] Matched Q: "${bestMatch.question}" (score: ${bestScore})`);
    return chatbotTextToHtml(bestMatch.answer); // stored text is escaped, line breaks are kept
  }

  console.log(`ℹ️ [Chatbot] No match found for: "${message}"`);
  return "I'm not sure about that. You can ask me about our furniture, delivery, prices, returns, warranty, or store hours. You can also reach us at (044) 796-1234 or info@eclfurniture.com. 😊";
}

function addChatMessage(message, sender = 'bot') {
  const messagesEl = document.getElementById('chatbotMessages');
  if (!messagesEl) return;

  const msgDiv = document.createElement('div');
  msgDiv.className = `chat-msg ${sender}`;

  if (sender === 'bot') {
    msgDiv.innerHTML = `
      <div class="chat-bot-icon">
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="white" stroke-width="2">
          <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"></path>
        </svg>
      </div>
      <div class="chat-bubble">${message}</div>`;
  } else {
    msgDiv.innerHTML = `<div class="chat-bubble">${escapeHtmlText(message)}</div>`;
  }

  messagesEl.appendChild(msgDiv);
  messagesEl.scrollTop = messagesEl.scrollHeight;
  return msgDiv.querySelector('.chat-bubble');
}

function showTypingIndicator() {
  const messagesEl = document.getElementById('chatbotMessages');
  if (!messagesEl) return null;

  const typingDiv = document.createElement('div');
  typingDiv.className = 'chat-msg bot';
  typingDiv.id = 'typingIndicator';
  typingDiv.innerHTML = `
    <div class="chat-bot-icon">
      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="white" stroke-width="2">
        <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"></path>
      </svg>
    </div>
    <div class="chat-typing"><span></span><span></span><span></span></div>`;

  messagesEl.appendChild(typingDiv);
  messagesEl.scrollTop = messagesEl.scrollHeight;
  return typingDiv;
}

// Predefined quick-reply actions that must NOT go through the database
// Q&A matcher (getBotResponse). Each has its own fixed response + a
// clickable button that sends the customer to the relevant page.
const CHATBOT_QUICK_ACTIONS = {
  'track-delivery': {
    userLabel: 'Track delivery',
    response: 'You can track your delivery by entering your reference code on our Track Delivery page. Your reference code was provided after your order was confirmed.',
    buttonText: 'Track Delivery',
    buttonHref: 'track-delivery.html'
  },
  'view-furniture': {
    userLabel: 'View furniture',
    response: 'Here is how you can view our furniture. Just click the button below to browse our available furniture.',
    buttonText: 'View Furniture',
    buttonHref: 'furniture-list.html'
  }
};

function sendQuickAction(actionKey) {
  const action = CHATBOT_QUICK_ACTIONS[actionKey];
  if (!action) return;

  addChatMessage(action.userLabel, 'user');

  // Hide quick replies after first message
  const quickReplies = document.getElementById('chatbotQuickReplies');
  if (quickReplies) quickReplies.style.display = 'none';

  const typing = showTypingIndicator();
  setTimeout(() => {
    if (typing) typing.remove();
    const responseHtml = `${action.response}<br><a href="${action.buttonHref}" class="chat-action-btn">${action.buttonText}</a>`;
    addChatMessage(responseHtml, 'bot');
  }, 800 + Math.random() * 500);
}

function sendChatMessage(message) {
  if (!message.trim()) return;

  addChatMessage(message, 'user');

  const input = document.getElementById('chatbotInput');
  if (input) input.value = '';

  // Hide quick replies after first message
  const quickReplies = document.getElementById('chatbotQuickReplies');
  if (quickReplies) quickReplies.style.display = 'none';

  // Show typing indicator then respond
  const typing = showTypingIndicator();
  setTimeout(() => {
    if (typing) typing.remove();
    const response = getBotResponse(message);
    addChatMessage(response, 'bot');
  }, 800 + Math.random() * 500);
}

// =============================================================================
// CHATBOT CATEGORY WIDGETS
// The categories shown as clickable widgets are read from the Q&A saved by the Admin (GET /chatbot, the same data the
// chatbot already uses). Nothing is hardcoded: a new category appears as soon as the Admin saves a Q&A under it, and
// it disappears when its last Q&A is deleted. Each category appears once. All text from the database is shown as text.
// =============================================================================
let chatbotActiveCategory = null;

let chatbotBrowseBusy = false;

let chatbotRefreshPromise = null;

// Q&A text is plain text: escape it and keep line breaks (used where a message is built from an HTML string)
function chatbotTextToHtml(text) {
  return escapeHtmlText(text).replace(/\r?\n/g, '<br>');
}

const CHATBOT_CATEGORY_CSS = `
  .chatbot-categories { box-sizing: border-box; display: flex; flex-wrap: wrap; align-items: center; gap: 0.5rem; padding: 0.5rem 1rem; max-height: 5rem; overflow-y: auto; background: #f9fafb; border-top: 1px solid #f3f4f6; flex-shrink: 0; }
  .chatbot-categories[hidden] { display: none; }
  .chatbot-categories-label { font-size: 0.7rem; font-weight: 600; color: #6b7280; text-transform: uppercase; letter-spacing: 0.04em; }
  .category-widget { padding: 0.3rem 0.75rem; border: 1px solid #DC143C; color: #DC143C; background: white; border-radius: 9999px; font-size: 0.75rem; font-weight: 500; cursor: pointer; transition: all 0.2s; max-width: 100%; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
  .category-widget:hover, .category-widget.active { background: #DC143C; color: white; }
  .chat-question-list { display: flex; flex-direction: column; gap: 0.4rem; margin-top: 0.6rem; }
  .chat-question-btn { text-align: left; padding: 0.45rem 0.7rem; border: 1px solid #DC143C; border-radius: 0.75rem; background: white; color: #DC143C; font-size: 0.8rem; font-weight: 500; line-height: 1.35; cursor: pointer; transition: all 0.2s; overflow-wrap: anywhere; }
  .chat-question-btn:hover { background: #DC143C; color: white; }
  .chat-answer-text { white-space: pre-wrap; overflow-wrap: anywhere; }
`;

function chatbotCategoryOf(qa) {
  const name = typeof qa.category === 'string' ? qa.category.trim() : '';
  return name || 'General'; // same default the server uses
}

// Unique category names (case-insensitive), alphabetical
function getChatbotCategories() {
  const unique = new Map();
  dbChatbotQA.forEach(qa => {
    const name = chatbotCategoryOf(qa);
    if (!unique.has(name.toLowerCase())) unique.set(name.toLowerCase(), name);
  });
  return Array.from(unique.values()).sort((a, b) => a.localeCompare(b));
}

// Creates the widget row (and its styles) next to the quick actions, so every page with the chatbot gets it
function ensureChatbotCategoryUi() {
  const panel = document.getElementById('chatbotPanel');
  if (!panel) return null;
  if (!document.getElementById('kdChatbotCategoryStyles')) {
    const style = document.createElement('style');
    style.id = 'kdChatbotCategoryStyles';
    style.textContent = CHATBOT_CATEGORY_CSS;
    document.head.appendChild(style);
  }
  let box = document.getElementById('chatbotCategories');
  if (!box) {
    const anchor = document.getElementById('chatbotQuickReplies') || panel.querySelector('.chatbot-input-area');
    if (!anchor || !anchor.parentNode) return null;
    box = document.createElement('div');
    box.id = 'chatbotCategories';
    box.className = 'chatbot-categories';
    box.hidden = true;
    box.setAttribute('role', 'group');
    box.setAttribute('aria-label', 'Browse topics');
    anchor.parentNode.insertBefore(box, anchor.id === 'chatbotQuickReplies' ? anchor.nextSibling : anchor);
    box.addEventListener('click', (event) => {
      const button = event.target.closest ? event.target.closest('.category-widget') : null;
      if (button) showChatbotCategory(button.dataset.category);
    });
  }
  return box;
}

function renderChatbotCategories() {
  const box = ensureChatbotCategoryUi();
  if (!box) return;
  const categories = getChatbotCategories();
  const signature = categories.join('\u0001') + '\u0002' + (chatbotActiveCategory || '');
  if (box.dataset.signature === signature) return; // nothing changed
  box.dataset.signature = signature;
  box.textContent = '';
  if (categories.length === 0) { box.hidden = true; return; }
  const label = document.createElement('span');
  label.className = 'chatbot-categories-label';
  label.textContent = 'Topics';
  box.appendChild(label);
  categories.forEach(name => {
    const button = document.createElement('button');
    button.type = 'button';
    button.className = 'category-widget' + (chatbotActiveCategory && chatbotActiveCategory.toLowerCase() === name.toLowerCase() ? ' active' : '');
    button.dataset.category = name;
    button.textContent = name;
    box.appendChild(button);
  });
  box.hidden = false;
}

// Reloads the Q&A (one request at a time). A failed reload keeps what is already loaded.
function refreshChatbotQA() {
  if (!chatbotRefreshPromise) {
    chatbotRefreshPromise = loadChatbotQA().finally(() => { chatbotRefreshPromise = null; });
  }
  return chatbotRefreshPromise;
}

const chatbotPause = () => new Promise(resolve => setTimeout(resolve, 500 + Math.random() * 300));

function hideChatbotQuickReplies() {
  const quickReplies = document.getElementById('chatbotQuickReplies');
  if (quickReplies) quickReplies.style.display = 'none'; // same behaviour as after the first typed message
}

// Customer clicked a category widget: list the saved questions of that category
async function showChatbotCategory(name, { echoUser = true } = {}) {
  if (chatbotBrowseBusy || !name) return; // ignore clicks while a previous one is still being answered
  chatbotBrowseBusy = true;
  chatbotActiveCategory = name;
  renderChatbotCategories();
  hideChatbotQuickReplies();
  let typing = null;
  try {
    if (echoUser) addChatMessage(name, 'user');
    typing = showTypingIndicator();
    await Promise.all([refreshChatbotQA(), chatbotPause()]); // pick up anything the Admin added, edited or deleted
    if (typing) { typing.remove(); typing = null; }
    renderChatbotCategories();
    const key = name.toLowerCase();
    const items = dbChatbotQA.filter(qa => chatbotCategoryOf(qa).toLowerCase() === key);
    const bubble = addChatMessage('', 'bot');
    if (!bubble) return;
    if (items.length === 0) {
      bubble.textContent = `There are no questions saved under ${name} right now. You can type your question below, or choose another topic.`;
      return;
    }
    const intro = document.createElement('div');
    intro.textContent = `Here are the questions I can help with under ${name}. Tap one to see the answer:`;
    const list = document.createElement('div');
    list.className = 'chat-question-list';
    items.forEach(qa => {
      const button = document.createElement('button');
      button.type = 'button';
      button.className = 'chat-question-btn';
      button.dataset.qaId = String(qa.id);
      button.dataset.category = name;
      button.textContent = qa.question;
      list.appendChild(button);
    });
    bubble.append(intro, list);
    const messagesEl = document.getElementById('chatbotMessages');
    if (messagesEl) messagesEl.scrollTop = messagesEl.scrollHeight;
  } finally {
    if (typing) typing.remove();
    chatbotBrowseBusy = false;
  }
}

// Customer clicked one of the listed questions: show its saved answer
async function showChatbotAnswer(qaId, categoryName) {
  if (chatbotBrowseBusy) return;
  chatbotBrowseBusy = true;
  let typing = null;
  try {
    const clicked = dbChatbotQA.find(qa => String(qa.id) === String(qaId));
    if (clicked) addChatMessage(clicked.question, 'user');
    typing = showTypingIndicator();
    await Promise.all([refreshChatbotQA(), chatbotPause()]);
    if (typing) { typing.remove(); typing = null; }
    renderChatbotCategories();
    const qa = dbChatbotQA.find(item => String(item.id) === String(qaId));
    const bubble = addChatMessage('', 'bot');
    if (!bubble) return;
    if (qa) {
      const text = document.createElement('div');
      text.className = 'chat-answer-text';
      text.textContent = qa.answer;
      bubble.appendChild(text);
    } else {
      bubble.textContent = 'Sorry, that question is no longer available. Please choose another one.';
    }
    if (categoryName) {
      const list = document.createElement('div');
      list.className = 'chat-question-list';
      const more = document.createElement('button');
      more.type = 'button';
      more.className = 'chat-question-btn chat-more-btn';
      more.dataset.category = categoryName;
      more.textContent = `More ${categoryName} questions`;
      list.appendChild(more);
      bubble.appendChild(list);
    }
    const messagesEl = document.getElementById('chatbotMessages');
    if (messagesEl) messagesEl.scrollTop = messagesEl.scrollHeight;
  } finally {
    if (typing) typing.remove();
    chatbotBrowseBusy = false;
  }
}

export function initChatbot() {
  const toggle = document.getElementById('chatbotToggle');
  const panel = document.getElementById('chatbotPanel');
  const closeBtn = document.getElementById('chatbotClose');
  const sendBtn = document.getElementById('chatbotSendBtn');
  const input = document.getElementById('chatbotInput');
  const badge = document.getElementById('chatbotBadge');
  const openIcon = document.getElementById('chatIconOpen');
  const closeIcon = document.getElementById('chatIconClose');

  if (!toggle || !panel) return;

  // ✅ Load Q&A from the database when chatbot initializes, then build the category widgets from it
  ensureChatbotCategoryUi();
  loadChatbotQA().then(renderChatbotCategories);

  // Show notification badge after 3 seconds
  setTimeout(() => {
    if (badge && !panel.classList.contains('open')) {
      badge.style.display = 'flex';
    }
  }, 3000);

  // Toggle open/close
  toggle.addEventListener('click', () => {
    panel.classList.toggle('open');
    const isOpen = panel.classList.contains('open');
    if (openIcon) openIcon.style.display = isOpen ? 'none' : 'block';
    if (closeIcon) closeIcon.style.display = isOpen ? 'block' : 'none';
    if (badge) badge.style.display = 'none';

    if (isOpen) {
      const messagesEl = document.getElementById('chatbotMessages');
      if (messagesEl) messagesEl.scrollTop = messagesEl.scrollHeight;
      refreshChatbotQA().then(renderChatbotCategories); // pick up Q&A changes made by the Admin since the page loaded
      if (input) input.focus();
    }
  });

  // Close button
  if (closeBtn) {
    closeBtn.addEventListener('click', () => {
      panel.classList.remove('open');
      if (openIcon) openIcon.style.display = 'block';
      if (closeIcon) closeIcon.style.display = 'none';
    });
  }

  // Send button
  if (sendBtn) {
    sendBtn.addEventListener('click', () => {
      if (input) sendChatMessage(input.value);
    });
  }

  // Enter key to send
  if (input) {
    input.addEventListener('keydown', (e) => {
      if (e.key === 'Enter' && !e.shiftKey) {
        e.preventDefault();
        sendChatMessage(input.value);
      }
    });
  }

  // Question buttons inside the chat (listed after a category widget was clicked)
  const chatMessagesEl = document.getElementById('chatbotMessages');
  if (chatMessagesEl) {
    chatMessagesEl.addEventListener('click', (event) => {
      const button = event.target.closest ? event.target.closest('.chat-question-btn') : null;
      if (!button) return;
      if (button.classList.contains('chat-more-btn')) showChatbotCategory(button.dataset.category, { echoUser: false });
      else showChatbotAnswer(button.dataset.qaId, button.dataset.category);
    });
  }

  // Quick reply buttons
  document.querySelectorAll('.quick-reply-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      const action = btn.getAttribute('data-action');
      if (action) {
        sendQuickAction(action);
        return;
      }
      // Fallback for any legacy quick-reply buttons still using data-quick
      const msg = btn.getAttribute('data-quick');
      if (msg) sendChatMessage(msg);
    });
  });
}

// =============================================================================
// CUSTOMER SUPPORT PAGE
// =============================================================================

export function initCustomerSupportPage() {
  // Star rating label update
  document.querySelectorAll('input[name="rating"]').forEach(radio => {
    radio.addEventListener('change', () => {
      const labels = { 1: '1 star — Poor', 2: '2 stars — Fair', 3: '3 stars — Average', 4: '4 stars — Good', 5: '5 stars — Excellent' };
      const ratingLabel = document.getElementById('ratingLabel');
      if (ratingLabel) ratingLabel.textContent = labels[radio.value] || '';
    });
  });

  // Inquiry form
  const inquiryForm = document.getElementById('inquiryForm');
  if (inquiryForm) inquiryForm.addEventListener('submit', handleInquirySubmit);

  // Feedback form
  const feedbackForm = document.getElementById('feedbackForm');
  if (feedbackForm) feedbackForm.addEventListener('submit', handleFeedbackSubmit);

  // Reset buttons
  const sendAnotherInquiry = document.getElementById('sendAnotherInquiryBtn');
  if (sendAnotherInquiry) sendAnotherInquiry.addEventListener('click', () => {
    document.getElementById('inquiryForm').reset();
    document.getElementById('inquirySuccess').style.display = 'none';
    document.getElementById('inquiryFormSection').style.display = 'block';
  });

  const sendAnotherFeedback = document.getElementById('sendAnotherFeedbackBtn');
  if (sendAnotherFeedback) sendAnotherFeedback.addEventListener('click', () => {
    document.getElementById('feedbackForm').reset();
    const ratingLabel = document.getElementById('ratingLabel');
    if (ratingLabel) ratingLabel.textContent = '3 stars — Average';
    document.getElementById('feedbackSuccess').style.display = 'none';
    document.getElementById('feedbackFormSection').style.display = 'block';
  });

  // FAQ accordion
  document.querySelectorAll('[data-faq]').forEach(btn => {
    btn.addEventListener('click', () => {
      const item = btn.closest('.faq-item');
      const isOpen = item.classList.contains('open');
      document.querySelectorAll('.faq-item').forEach(i => i.classList.remove('open'));
      if (!isOpen) item.classList.add('open');
    });
  });
}

async function handleInquirySubmit(event) {
  event.preventDefault();

  const data = {
    customer_name: document.getElementById('inquiryName').value,
    email: document.getElementById('inquiryEmail').value,
    phone: document.getElementById('inquiryPhone').value,
    subject: document.getElementById('inquirySubject').value,
    message: document.getElementById('inquiryMessage').value
  };

  try {
    const result = await kdCreateOnce('inquiry-create', data, API.submitInquiry);
    if (result && result.success) {
      showSuccessState('inquiry');
      showToast('Your inquiry has been sent!', 'success');
    } else {
      // Not confirmed by the server: keep the form (and what the customer typed) so they can try again
      showToast('❌ ' + ((result && result.message) || 'Your inquiry could not be sent. Please try again.'), 'error');
    }
  } catch (error) {
    showToast('❌ We could not send your inquiry. Please check your connection and try again.', 'error');
  }
}

async function handleFeedbackSubmit(event) {
  event.preventDefault();

  const selectedRating = document.querySelector('input[name="rating"]:checked');
  if (!selectedRating) {
    showToast('Please select a rating.', 'warning');
    return;
  }

  const data = {
    customer_name: document.getElementById('feedbackName').value,
    email: document.getElementById('feedbackEmail').value,
    product_name: document.getElementById('feedbackProduct').value,
    rating: parseInt(selectedRating.value),
    feedback_text: document.getElementById('feedbackText').value
  };

  try {
    const result = await kdCreateOnce('feedback-create', data, API.submitFeedback);
    if (result && result.success) {
      showSuccessState('feedback');
      showToast('Thank you for your feedback!', 'success');
    } else {
      showToast('❌ ' + ((result && result.message) || 'Your feedback could not be sent. Please try again.'), 'error');
    }
  } catch (error) {
    showToast('❌ We could not send your feedback. Please check your connection and try again.', 'error');
  }
}

function showSuccessState(type) {
  if (type === 'inquiry') {
    const form = document.getElementById('inquiryFormSection');
    const success = document.getElementById('inquirySuccess');
    if (form) form.style.display = 'none';
    if (success) success.style.display = 'block';
  } else {
    const form = document.getElementById('feedbackFormSection');
    const success = document.getElementById('feedbackSuccess');
    if (form) form.style.display = 'none';
    if (success) success.style.display = 'block';
  }
}

  // =============================================================================
// ADMIN — CHATBOT Q&A MANAGEMENT
// =============================================================================

let editingChatbotId = null;

export async function loadChatbotList() {
  try {
    const result = await API.getChatbotQA();
    if (result.success) {
      const tbody = document.getElementById('chatbotList');
      if (!tbody) return;
      tbody.innerHTML = '';
      if (result.data.length === 0) {
        tbody.innerHTML = '<tr><td colspan="5" style="text-align:center;color:#9ca3af;padding:2rem;">No Q&A entries found. Click "Add New Q&A" to get started.</td></tr>';
        return;
      }
      result.data.forEach(item => {
        const categoryColor = {
          'Delivery': '#3b82f6', 'Products': '#10b981', 'Payment': '#f59e0b',
          'Returns': '#ef4444', 'Warranty': '#8b5cf6', 'Store Info': '#6b7280',
          'AI Visualizer': '#DC143C', 'General': '#374151'
        }[item.category] || '#374151';
        tbody.innerHTML += `
          <tr>
            <td><span style="padding:0.2rem 0.6rem;background:${categoryColor}15;color:${categoryColor};border-radius:9999px;font-size:0.75rem;font-weight:600;">${escapeHtmlText(item.category || 'General')}</span></td>
            <td style="max-width:200px;">${escapeHtmlText(item.question || '')}</td>
            <td style="max-width:250px;color:#6b7280;">${escapeHtmlText(String(item.answer || '').substring(0, 80))}${String(item.answer || '').length > 80 ? '...' : ''}</td>
            <td style="white-space:nowrap;">${formatDate(item.created_at)}</td>
            <td>
              <button class="action-btn edit" onclick="editChatbotQA(${item.id})" title="Edit">
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"></path><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"></path></svg>
              </button>
              <button class="action-btn delete" onclick="deleteChatbotItem(${item.id})" title="Delete">
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="3 6 5 6 21 6"></polyline><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"></path></svg>
              </button>
            </td>
          </tr>`;
      });
    }
  } catch (error) { showToast('❌ Failed to load chatbot Q&As', 'error'); }
}

export function openAddChatbotModal() {
  editingChatbotId = null;
  document.getElementById('chatbotModalTitle').textContent = 'Add New Q&A';
  document.getElementById('chatbotForm').reset();
  showModal('chatbotModal');
}

export async function editChatbotQA(id) {
  try {
    const result = await API.getChatbotQA();
    if (result.success) {
      const item = result.data.find(q => q.id === id);
      if (!item) { showToast('Q&A not found', 'error'); return; }
      editingChatbotId = id;
      document.getElementById('chatbotModalTitle').textContent = 'Edit Q&A';
      document.getElementById('chatbotCategory').value = item.category;
      document.getElementById('chatbotQuestion').value = item.question;
      document.getElementById('chatbotAnswer').value = item.answer;
      showModal('chatbotModal');
    } else {
      showToast('❌ ' + (result.message || 'Failed to load Q&A details'), 'error');
    }
  } catch (error) { showToast('❌ Failed to load Q&A details', 'error'); }
}

export async function handleChatbotSubmit(event) {
  event.preventDefault();
  const data = {
    category: document.getElementById('chatbotCategory').value,
    question: document.getElementById('chatbotQuestion').value.trim(),
    answer: document.getElementById('chatbotAnswer').value.trim()
  };
  if (!data.question) { showToast('Please enter the question', 'warning'); return; }
  if (!data.answer) { showToast('Please enter the answer', 'warning'); return; }
  try {
    const result = editingChatbotId
      ? await API.updateChatbotQA(editingChatbotId, data)
      : await kdCreateOnce('chatbot-create', data, API.createChatbotQA);
    if (result.success) {
      showToast(result.message, 'success');
      hideModal('chatbotModal');
      loadChatbotList();
    } else {
      showToast('❌ ' + result.message, 'error');
    }
  } catch (error) { showToast('❌ Failed to save Q&A', 'error'); }
}

export async function deleteChatbotItem(id) {
  if (!(await kdConfirm('Are you sure you want to delete this Q&A entry?', { title: 'Delete Q&A Entry' }))) return;
  try {
    const result = await API.deleteChatbotQA(id);
    if (result.success) { showToast(result.message, 'success'); loadChatbotList(); }
    else showToast('❌ ' + result.message, 'error');
  } catch (error) { showToast('❌ Failed to delete Q&A', 'error'); }
}

// =============================================================================
// ADMIN — CUSTOMER INQUIRIES & FEEDBACK (VIEW)
// =============================================================================

export async function loadAdminInquiries() {
  try {
    const result = await API.getInquiries();
    if (result.success) {
      const tbody = document.getElementById('adminInquiriesList');
      if (!tbody) return;
      tbody.innerHTML = '';

      // Show badge if there are new inquiries
      const newCount = result.data.filter(i => i.status === 'new').length;
      const badge = document.getElementById('inquiriesNewBadge');
      if (badge) badge.style.display = newCount > 0 ? 'inline' : 'none';

      if (result.data.length === 0) {
        tbody.innerHTML = '<tr><td colspan="6" style="text-align:center;color:#9ca3af;padding:2rem;">No inquiries yet.</td></tr>';
        return;
      }
      result.data.forEach(item => {
        tbody.innerHTML += `
          <tr>
            <td><strong>${item.customer_name}</strong></td>
            <td>${item.email}</td>
            <td>${item.subject || 'General'}</td>
            <td style="max-width:200px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;" title="${item.message}">${item.message.substring(0, 60)}${item.message.length > 60 ? '...' : ''}</td>
            <td style="white-space:nowrap;">${formatDate(item.created_at)}</td>
            <td>
              <button class="action-btn delete" onclick="deleteAdminInquiry(${item.id})" title="Delete">
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="3 6 5 6 21 6"></polyline><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"></path></svg>
              </button>
            </td>
          </tr>`;
      });
    }
  } catch (error) { showToast('❌ Failed to load inquiries', 'error'); }
}

export async function deleteAdminInquiry(id) {
  if (!(await kdConfirm('Are you sure you want to delete this inquiry?', { title: 'Delete Inquiry' }))) return;
  try {
    const result = await API.deleteInquiry(id);
    if (result.success) { showToast(result.message, 'success'); loadAdminInquiries(); }
    else showToast('❌ ' + result.message, 'error');
  } catch (error) { showToast('❌ Failed to delete inquiry', 'error'); }
}

export async function loadAdminFeedback() {
  try {
    const result = await API.getFeedback();
    if (result.success) {
      const tbody = document.getElementById('adminFeedbackList');
      if (!tbody) return;
      tbody.innerHTML = '';
      if (result.data.length === 0) {
        tbody.innerHTML = '<tr><td colspan="7" style="text-align:center;color:#9ca3af;padding:2rem;">No feedback submitted yet.</td></tr>';
        return;
      }
      result.data.forEach(item => {
        const stars = '★'.repeat(item.rating || 0) + '☆'.repeat(5 - (item.rating || 0));
        const starColor = item.rating >= 4 ? '#10b981' : item.rating >= 3 ? '#f59e0b' : '#DC143C';
        tbody.innerHTML += `
          <tr>
            <td><strong>${item.customer_name}</strong></td>
            <td>${item.email || 'N/A'}</td>
            <td>${item.product_name || 'General'}</td>
            <td><span style="color:${starColor};font-size:1rem;" title="${item.rating} out of 5">${stars}</span></td>
            <td style="max-width:200px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;" title="${item.feedback_text}">${item.feedback_text.substring(0, 60)}${item.feedback_text.length > 60 ? '...' : ''}</td>
            <td style="white-space:nowrap;">${formatDate(item.created_at)}</td>
            <td>
              <button class="action-btn delete" onclick="deleteAdminFeedback(${item.id})" title="Delete">
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="3 6 5 6 21 6"></polyline><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"></path></svg>
              </button>
            </td>
          </tr>`;
      });
    }
  } catch (error) { showToast('❌ Failed to load feedback', 'error'); }
}

export async function deleteAdminFeedback(id) {
  if (!(await kdConfirm('Are you sure you want to delete this feedback?', { title: 'Delete Feedback' }))) return;
  try {
    const result = await API.deleteFeedback(id);
    if (result.success) { showToast(result.message, 'success'); loadAdminFeedback(); }
    else showToast('❌ ' + result.message, 'error');
  } catch (error) { showToast('❌ Failed to delete feedback', 'error'); } 
}


// ---- loading / duplicate-click protection (helpers live in ui.js; each function is wrapped once, here, where it is defined) ----
handleChatbotSubmit = kdGuard(handleChatbotSubmit, { button: 'event', progress: 'Saving Q&A...', loadingText: () => (editingChatbotId ? 'Saving...' : 'Adding Q&A...') });
handleInquirySubmit = kdGuard(handleInquirySubmit, { button: '#inquirySubmitBtn', loadingText: 'Sending...', progress: 'Submitting your information...' });
handleFeedbackSubmit = kdGuard(handleFeedbackSubmit, { button: '#feedbackSubmitBtn', loadingText: 'Submitting...', progress: 'Submitting your information...' });
deleteChatbotItem = kdGuard(deleteChatbotItem, del('chatbot'));
deleteAdminInquiry = kdGuard(deleteAdminInquiry, del('inquiry'));
deleteAdminFeedback = kdGuard(deleteAdminFeedback, del('feedback'));
editChatbotQA = kdGuard(editChatbotQA, open('chatbot'));
loadChatbotList = kdWrapLoader(loadChatbotList, { target: 'chatbotList', loading: 'Loading chatbot Q&A...', empty: 'No Q&A entries found', error: 'Unable to load chatbot Q&A.' });
loadAdminInquiries = kdWrapLoader(loadAdminInquiries, { target: 'adminInquiriesList', loading: 'Loading inquiries...', empty: 'No inquiries found', error: 'Unable to load inquiries.' });
loadAdminFeedback = kdWrapLoader(loadAdminFeedback, { target: 'adminFeedbackList', loading: 'Loading feedback...', empty: 'No feedback submitted yet.', error: 'Unable to load feedback.' });