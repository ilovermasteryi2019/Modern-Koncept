/* =============================================================================
 * K-Desk | js/modules/admin-support.js
 * Support management (Admin)
 * -----------------------------------------------------------------------------
 * WHAT IT DOES : Admin management of chatbot Q&A entries and viewing / updating / deleting customer inquiries and feedback.
 * DEPENDS ON   : API, showToast, showModal/hideModal.
 * LOAD ORDER   : file 18 of 19 (see scripts-block.html). These are plain scripts that share one
 *                global scope, so inline onclick="..." handlers in the HTML keep working.
 * CONTENTS     :
 * editingChatbotId, loadChatbotList, openAddChatbotModal, editChatbotQA, handleChatbotSubmit,
 * deleteChatbotItem, loadAdminInquiries, updateInquiryStatus, deleteAdminInquiry,
 * loadAdminFeedback, deleteAdminFeedback
 * ============================================================================= */

  // =============================================================================
// ADMIN — CHATBOT Q&A MANAGEMENT
// =============================================================================

let editingChatbotId = null;

// Admin: loads the chatbot Q&A table.
async function loadChatbotList() {
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
            <td><span style="padding:0.2rem 0.6rem;background:${categoryColor}15;color:${categoryColor};border-radius:9999px;font-size:0.75rem;font-weight:600;">${item.category}</span></td>
            <td style="max-width:200px;">${item.question}</td>
            <td style="max-width:250px;color:#6b7280;">${item.answer.substring(0, 80)}${item.answer.length > 80 ? '...' : ''}</td>
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

// Admin: opens the empty Add Q&A modal.
function openAddChatbotModal() {
  editingChatbotId = null;
  document.getElementById('chatbotModalTitle').textContent = 'Add New Q&A';
  document.getElementById('chatbotForm').reset();
  showModal('chatbotModal');
}

// Admin: opens the Edit Q&A modal filled with the selected entry.
async function editChatbotQA(id) {
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
    }
  } catch (error) { showToast('❌ Failed to load Q&A details', 'error'); }
}

// Admin: creates or updates a chatbot Q&A entry.
async function handleChatbotSubmit(event) {
  event.preventDefault();
  const data = {
    category: document.getElementById('chatbotCategory').value,
    question: document.getElementById('chatbotQuestion').value,
    answer: document.getElementById('chatbotAnswer').value
  };
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

// Admin: deletes a chatbot Q&A entry.
async function deleteChatbotItem(id) {
  if (!confirm('Are you sure you want to delete this Q&A entry?')) return;
  try {
    const result = await API.deleteChatbotQA(id);
    if (result.success) { showToast(result.message, 'success'); loadChatbotList(); }
    else showToast('❌ ' + result.message, 'error');
  } catch (error) { showToast('❌ Failed to delete Q&A', 'error'); }
}

// =============================================================================
// ADMIN — CUSTOMER INQUIRIES & FEEDBACK (VIEW)
// =============================================================================

async function loadAdminInquiries() {
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
        tbody.innerHTML = '<tr><td colspan="7" style="text-align:center;color:#9ca3af;padding:2rem;">No inquiries yet.</td></tr>';
        return;
      }
      result.data.forEach(item => {
        const statusColors = { new: '#DC143C', read: '#3b82f6', replied: '#10b981' };
        const statusBg = { new: '#fef2f2', read: '#dbeafe', replied: '#d1fae5' };
        const color = statusColors[item.status] || '#6b7280';
        const bg = statusBg[item.status] || '#f3f4f6';
        tbody.innerHTML += `
          <tr>
            <td><strong>${item.customer_name}</strong></td>
            <td>${item.email}</td>
            <td>${item.subject || 'General'}</td>
            <td style="max-width:200px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;" title="${item.message}">${item.message.substring(0, 60)}${item.message.length > 60 ? '...' : ''}</td>
            <td>
              <select onchange="updateInquiryStatus(${item.id}, this.value)"
                style="padding:0.25rem 0.5rem;border:1px solid ${color};border-radius:0.375rem;font-size:0.75rem;color:${color};background:${bg};cursor:pointer;font-weight:600;">
                <option value="new" ${item.status === 'new' ? 'selected' : ''}>New</option>
                <option value="read" ${item.status === 'read' ? 'selected' : ''}>Read</option>
                <option value="replied" ${item.status === 'replied' ? 'selected' : ''}>Responded</option>
              </select>
            </td>
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

// Admin: changes an inquiry's status (New / Read / Responded).
async function updateInquiryStatus(id, status) {
  try {
    const result = await API.updateInquiryStatus(id, status);
    if (result.success) { showToast('Status updated', 'success'); loadAdminInquiries(); }
    else showToast('❌ ' + result.message, 'error');
  } catch (error) { showToast('❌ Failed to update status', 'error'); }
}

// Admin: deletes a customer inquiry.
async function deleteAdminInquiry(id) {
  if (!confirm('Are you sure you want to delete this inquiry?')) return;
  try {
    const result = await API.deleteInquiry(id);
    if (result.success) { showToast(result.message, 'success'); loadAdminInquiries(); }
    else showToast('❌ ' + result.message, 'error');
  } catch (error) { showToast('❌ Failed to delete inquiry', 'error'); }
}

// Admin: loads the customer feedback table.
async function loadAdminFeedback() {
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

// Admin: deletes a customer feedback entry.
async function deleteAdminFeedback(id) {
  if (!confirm('Are you sure you want to delete this feedback?')) return;
  try {
    const result = await API.deleteFeedback(id);
    if (result.success) { showToast(result.message, 'success'); loadAdminFeedback(); }
    else showToast('❌ ' + result.message, 'error');
  } catch (error) { showToast('❌ Failed to delete feedback', 'error'); } 
}
