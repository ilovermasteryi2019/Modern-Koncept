/* =============================================================================
 * K-Desk | js/modules/customer-support.js
 * Customer support (public)
 * -----------------------------------------------------------------------------
 * WHAT IT DOES : The customer chatbot (answers come from the chatbot_qa table), quick actions, and the inquiry / feedback forms
 * on customer-support.html.
 * DEPENDS ON   : API_URL, showToast, contact loaders (business-info.js).
 * LOAD ORDER   : file 17 of 19 (see scripts-block.html). These are plain scripts that share one
 *                global scope, so inline onclick="..." handlers in the HTML keep working.
 * CONTENTS     :
 * dbChatbotQA, loadChatbotQA, getBotResponse, addChatMessage, showTypingIndicator,
 * CHATBOT_QUICK_ACTIONS, sendQuickAction, sendChatMessage, initChatbot, initCustomerSupportPage,
 * handleInquirySubmit, handleFeedbackSubmit, showSuccessState
 * ============================================================================= */

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
      dbChatbotQA = [];
      return;
    }

    const result = await response.json();

    if (result.success && Array.isArray(result.data)) {
      dbChatbotQA = result.data;
      console.log(`✅ [Chatbot] Loaded ${dbChatbotQA.length} Q&A entries from database.`);
      dbChatbotQA.forEach((qa, i) => {
        console.log(`   [${i + 1}] Q: "${qa.question}" → A: "${qa.answer.substring(0, 40)}..."`);
      });
    } else {
      console.warn('⚠️ [Chatbot] API returned no Q&A data:', result);
      dbChatbotQA = [];
    }
  } catch (error) {
    console.error('❌ [Chatbot] Failed to load Q&A from database:', error.message);
    dbChatbotQA = [];
  }
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
    return bestMatch.answer;
  }

  console.log(`ℹ️ [Chatbot] No match found for: "${message}"`);
  return "I'm not sure about that. You can ask me about our furniture, delivery, prices, returns, warranty, or store hours. You can also reach us at (044) 796-1234 or info@eclfurniture.com. 😊";
}

// Adds a chat bubble (bot or user) to the chat window and scrolls to it.
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
    msgDiv.innerHTML = `<div class="chat-bubble">${message}</div>`;
  }

  messagesEl.appendChild(msgDiv);
  messagesEl.scrollTop = messagesEl.scrollHeight;
}

// Shows the bot "typing..." bubble and returns it so it can be removed.
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

// Handles a quick-action button (for example Track delivery or View furniture).
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

// Shows the user's message, then the bot's answer found in the database Q&A.
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

// Connects the chatbot window: open / close, send button, Enter key and quick actions.
function initChatbot() {
  const toggle = document.getElementById('chatbotToggle');
  const panel = document.getElementById('chatbotPanel');
  const closeBtn = document.getElementById('chatbotClose');
  const sendBtn = document.getElementById('chatbotSendBtn');
  const input = document.getElementById('chatbotInput');
  const badge = document.getElementById('chatbotBadge');
  const openIcon = document.getElementById('chatIconOpen');
  const closeIcon = document.getElementById('chatIconClose');

  if (!toggle || !panel) return;

  // ✅ Load Q&A from the database when chatbot initializes
  loadChatbotQA();

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

function initCustomerSupportPage() {
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

// Customer: sends the Contact / Inquiry form to the backend.
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

// Customer: sends the star rating and feedback form to the backend.
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

// Hides the form and shows the thank-you message ("inquiry" or "feedback").
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
