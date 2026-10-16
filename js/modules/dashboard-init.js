/* =============================================================================
 * K-Desk | js/modules/dashboard-init.js
 * Page initialization
 * -----------------------------------------------------------------------------
 * WHAT IT DOES : Starts each page when it opens: dashboard tabs, modal close buttons, and the DOMContentLoaded handler that
 * connects buttons/forms and loads the first data for the Admin, Staff, Manager, login and public pages.
 * It only CALLS functions from the other files, so it is loaded after all of them.
 * DEPENDS ON   : Almost every other file.
 * LOAD ORDER   : file 15 of 19 (see scripts-block.html). These are plain scripts that share one
 *                global scope, so inline onclick="..." handlers in the HTML keep working.
 * CONTENTS     :
 * initDashboardTabs, initModalCloseButtons
 * ============================================================================= */

// =============================================================================
// PAGE INITIALIZATION
// =============================================================================
function initDashboardTabs() {
  const tabs = document.querySelectorAll('.dashboard-tab');
  const modules = document.querySelectorAll('.dashboard-module');
  tabs.forEach(tab => {
    tab.addEventListener('click', () => {
      const targetTab = tab.getAttribute('data-tab');
      tabs.forEach(t => t.classList.remove('active'));
      tab.classList.add('active');
      modules.forEach(m => m.classList.remove('active'));
      const targetModule = document.getElementById(targetTab + 'Module');
      if (targetModule) {
        targetModule.classList.add('active');
        const isAdmin = window.location.pathname.includes('admin');
        const isStaff = window.location.pathname.includes('staff');
        const isManager = window.location.pathname.includes('manager');
        if (targetTab === 'furniture') loadFurnitureList();
        else if (targetTab === 'business') loadBusinessInfo();
        else if (targetTab === 'inventory' && isAdmin) loadInventoryList();
        else if (targetTab === 'inventory' && isManager) loadManagerInventoryList();
        else if (targetTab === 'inventory' && isStaff) loadStaffInventoryList();
        else if (targetTab === 'delivery' && isAdmin) { loadDeliveryList(); loadDeliveryStats(); }
        else if (targetTab === 'delivery' && isManager) { loadManagerDeliveryList(); loadDeliveryStats(); }
        else if (targetTab === 'delivery' && isStaff) { loadStaffDeliveryList(); loadDeliveryStats(); }
        else if (targetTab === 'sales' && isAdmin) { loadSalesList(); loadSalesAnalytics(); }
        else if (targetTab === 'sales' && isStaff) { loadStaffSalesList(); loadStaffSalesAnalytics(); loadSalesProductOptions('salesProduct'); }
        else if (targetTab === 'sales' && isManager) { loadManagerSalesList(); loadManagerSalesAnalytics(); loadSalesProductOptions('managerSalesProduct'); }
        else if (targetTab === 'staff') loadStaffAccountsList();
         else if (targetTab === 'chatbot') loadChatbotList();
        else if (targetTab === 'feedback') { loadAdminInquiries(); loadAdminFeedback(); }
      }
    });
  });
}

// Connects every [data-close-modal] button to close its modal.
function initModalCloseButtons() {
  document.querySelectorAll('[data-close-modal]').forEach(btn => {
    btn.addEventListener('click', () => { hideModal(btn.getAttribute('data-close-modal')); });
  });
}

document.addEventListener('DOMContentLoaded', () => {
  console.log('🚀 Furniture Management System Initialized');
  initDashboardTabs();
  initModalCloseButtons();
  initDashboardSession();

  // ---- ADMIN PAGE ----
  if (window.location.pathname.includes('admin')) {
    const user = JSON.parse(sessionStorage.getItem('currentUser') || '{}');
    const adminNameEl = document.getElementById('adminName');
    if (adminNameEl && user.name) adminNameEl.textContent = user.name;

    loadFurnitureList();
    initAdminFurnitureSearch();

    // ── Click handlers ──
    const bind = (id, handler) => { const el = document.getElementById(id); if (el) el.addEventListener('click', handler); };
    bind('addStockBtn', openAddInventoryModal);
    bind('addDeliveryBtn', openAddDeliveryModal);
    bind('addSalesBtn', openAddSalesModal);
    bind('addChatbotBtn', openAddChatbotModal);
    bind('logoutBtn', handleLogout);
    bind('confirmSendSmsBtn', confirmSendSms);

    // ── Submit handlers ──
    const bindSubmit = (id, handler) => { const el = document.getElementById(id); if (el) el.addEventListener('submit', handler); };
    bindSubmit('furnitureForm', handleFurnitureSubmit);
    bindSubmit('aboutForm', handleAboutFormSubmit);
    bindSubmit('contactForm', handleContactFormSubmit);
    bindSubmit('stockForm', handleInventorySubmit);
    bindSubmit('deliveryForm', handleDeliverySubmit);
    bindSubmit('salesForm', handleSalesSubmit);
    bindSubmit('chatbotForm', handleChatbotSubmit);
    bindSubmit('editAdminSalesForm', (e) => {
      e.preventDefault();
      submitSalesEdit({
        formId: 'editAdminSalesForm',
        modalId: 'editAdminSalesModal',
        idField: 'editAdminSalesId',
        customerId: 'editAdminSalesCustomer',
        productId: 'editAdminSalesProduct',
        quantityId: 'editAdminSalesQuantity',
        amountId: 'editAdminSalesAmount',
        dateId: 'editAdminSalesDate',
        onSuccess: async () => { await Promise.all([loadSalesList(), loadSalesAnalytics(), loadInventoryList()]); },
        onStockChanged: () => { loadSalesProductOptions('editAdminSalesProduct'); loadInventoryList(); }
      });
    });

    const stockImage = document.getElementById('stockImage');
    if (stockImage) stockImage.addEventListener('change', handleStockImageUpload);

  }

  // ---- STAFF PAGE ----
  if (window.location.pathname.includes('staff')) {
    const user = JSON.parse(sessionStorage.getItem('currentUser') || '{}');
    const staffNameEl = document.getElementById('staffName');
    if (staffNameEl && user.name) staffNameEl.textContent = user.name;

    // Sales Records is now the default Staff tab, so load it on page open
    loadStaffSalesList();
    loadStaffSalesAnalytics();
    loadSalesProductOptions('salesProduct');
    document.addEventListener('visibilitychange', () => {
      const salesModule = document.getElementById('salesModule');
      if (!document.hidden && salesModule && salesModule.classList.contains('active')) loadSalesProductOptions('salesProduct');
    });

    const bind = (id, handler) => { const el = document.getElementById(id); if (el) el.addEventListener('submit', handler); };
    bind('staffDeliveryForm', handleStaffDeliverySubmit);
    const staffAddDeliveryBtn = document.getElementById('staffAddDeliveryBtn');
    if (staffAddDeliveryBtn) staffAddDeliveryBtn.addEventListener('click', openStaffAddDeliveryModal);
    bind('staffSalesForm', handleStaffSalesSubmit);
    bind('editStaffSalesForm', (e) => {
      e.preventDefault();
      submitSalesEdit({
        formId: 'editStaffSalesForm',
        modalId: 'editSalesModal',
        idField: 'editSalesId',
        customerId: 'editSalesCustomer',
        productId: 'editSalesProduct',
        quantityId: 'editSalesQuantity',
        amountId: 'editSalesAmount',
        dateId: 'editSalesDate',
        onSuccess: async () => { await Promise.all([loadStaffSalesList(), loadStaffSalesAnalytics(), loadStaffInventoryList(), loadSalesProductOptions('salesProduct')]); },
        onStockChanged: () => { loadSalesProductOptions('editSalesProduct'); loadSalesProductOptions('salesProduct'); loadStaffInventoryList(); }
      });
    });

    const logoutBtn = document.getElementById('logoutBtn');
    if (logoutBtn) logoutBtn.addEventListener('click', handleLogout);
  }

  // ---- MANAGER PAGE ----
  if (window.location.pathname.includes('manager')) {
    const user = JSON.parse(sessionStorage.getItem('currentUser') || '{}');
    const managerNameEl = document.getElementById('managerName');
    if (managerNameEl && user.name) managerNameEl.textContent = user.name;

    // Load first active tab (delivery)
    loadManagerDeliveryList();
    loadDeliveryStats();

    const logoutBtn = document.getElementById('logoutBtn');
    if (logoutBtn) logoutBtn.addEventListener('click', handleLogout);

    // Manager sales form
    const managerSalesForm = document.getElementById('managerSalesForm');
    if (managerSalesForm) managerSalesForm.addEventListener('submit', handleManagerSalesSubmit);

    // Manager edit sales form
    const managerEditSalesForm = document.getElementById('managerEditSalesForm');
    if (managerEditSalesForm) {
      managerEditSalesForm.addEventListener('submit', (e) => {
        e.preventDefault();
        submitSalesEdit({
          formId: 'managerEditSalesForm',
          modalId: 'managerEditSalesModal',
          idField: 'managerEditSalesId',
          customerId: 'managerEditSalesCustomer',
          productId: 'managerEditSalesProduct',
          quantityId: 'managerEditSalesQuantity',
          amountId: 'managerEditSalesAmount',
          dateId: 'managerEditSalesDate',
          onSuccess: async () => { await Promise.all([loadManagerSalesList(), loadManagerSalesAnalytics(), loadManagerInventoryList(), loadSalesProductOptions('managerSalesProduct')]); },
          onStockChanged: () => { loadSalesProductOptions('managerEditSalesProduct'); loadSalesProductOptions('managerSalesProduct'); loadManagerInventoryList(); }
        });
      });
    }

    // Manager edit inventory form
    const managerEditInventoryForm = document.getElementById('managerEditInventoryForm');
    if (managerEditInventoryForm) {
      managerEditInventoryForm.addEventListener('submit', (e) => e.preventDefault() || kdRun('managerEditInventory', async () => {
        e.preventDefault();
        const id = document.getElementById('managerEditInventoryId').value;
        const name = document.getElementById('managerEditInventoryName').value;
        const itemCode = document.getElementById('managerEditInventoryItemCode').value.trim();
        const category = document.getElementById('managerEditInventoryCategory').value;
        const quantity = parseInt(document.getElementById('managerEditInventoryQuantity').value);
        const price = parseFloat(document.getElementById('managerEditInventoryPrice').value);
        if (!itemCode || !category || quantity < 0) { showToast('Please fill all fields correctly', 'error'); return; }
        if (!Number.isFinite(price) || price <= 0) { showToast('Please enter a valid price greater than 0', 'error'); return; }
        const data = { name, item_code: itemCode, category, quantity, price };
        if (currentManagerStockImage) data.image = currentManagerStockImage; // only send image if a new one was picked, so the existing one is preserved otherwise
        try {
          const result = await API.updateInventory(id, data);
          if (result.success) { showToast('Inventory updated successfully', 'success'); hideModal('managerEditInventoryModal'); loadManagerInventoryList(); }
          else showToast(result.message || 'Failed to update inventory', 'error');
        } catch (error) { showToast('Failed to update inventory', 'error'); }
      }, { button: kdEventButton(e), loadingText: 'Saving...', progress: 'Saving changes...' }));
    }

    const managerQtyInput = document.getElementById('managerEditInventoryQuantity');
    if (managerQtyInput) managerQtyInput.addEventListener('input', (e) => updateManagerStockPreview(e.target.value));

    // Manager Add/Edit Inventory image + button wiring
    const addManagerStockBtn = document.getElementById('addManagerStockBtn');
    if (addManagerStockBtn) addManagerStockBtn.addEventListener('click', openAddManagerInventoryModal);

    const confirmSendSmsBtn = document.getElementById('confirmSendSmsBtn');
    if (confirmSendSmsBtn) confirmSendSmsBtn.addEventListener('click', confirmSendSms);

    const managerAddInventoryForm = document.getElementById('managerAddInventoryForm');
    if (managerAddInventoryForm) managerAddInventoryForm.addEventListener('submit', handleManagerAddInventorySubmit);

    const managerStockImage = document.getElementById('managerStockImage');
    if (managerStockImage) managerStockImage.addEventListener('change', handleManagerAddStockImageUpload);

    const managerEditInventoryImage = document.getElementById('managerEditInventoryImage');
    if (managerEditInventoryImage) managerEditInventoryImage.addEventListener('change', handleManagerEditStockImageUpload);

    // Manager Add Delivery (reuses the existing Add Delivery handlers; status updates use the table dropdown)
    const addManagerDeliveryBtn = document.getElementById('addManagerDeliveryBtn');
    if (addManagerDeliveryBtn) addManagerDeliveryBtn.addEventListener('click', openAddDeliveryModal);
    const managerDeliveryForm = document.getElementById('deliveryForm');
    if (managerDeliveryForm) managerDeliveryForm.addEventListener('submit', handleDeliverySubmit);

    // Manager delivery search
    const managerDeliverySearch = document.getElementById('managerDeliverySearch');
    if (managerDeliverySearch) managerDeliverySearch.addEventListener('input', loadManagerDeliveryList);
  }

  // ---- LOGIN PAGE ----
  if (window.location.pathname.includes('login')) {
    const reasons = {
      expired: 'Your session has expired. Please log in again.',
      idle: 'You were logged out because of inactivity.',
      required: 'Please log in to continue.'
    };
    const reason = new URLSearchParams(window.location.search).get('reason');
    if (reason && reasons[reason]) {
      showToast(reasons[reason], 'info', 6000);
      window.history.replaceState({}, '', window.location.pathname);
    }
    const loginForm = document.getElementById('loginForm');
    if (loginForm) loginForm.addEventListener('submit', handleLogin);
    initMfaUi();
    const signupForm = document.getElementById('signupForm');
    if (signupForm) signupForm.addEventListener('submit', handleSignup);
  }

  if (window.location.pathname.includes('about')) loadAboutPageContent();
  if (window.location.pathname.includes('contact')) loadContactPageContent();
  if (window.location.pathname === '/' || window.location.pathname.endsWith('/index.html')) {
    loadSpecialOffers();
  }
  if (window.location.pathname.includes('furniture-list')) { loadPublicFurnitureList(); initFurnitureListFilters(); }
  if (window.location.pathname.includes('furniture-detail')) {
    loadFurnitureDetail();

    const visualizeBtn = document.getElementById('visualizeBtn');
    if (visualizeBtn) {
      visualizeBtn.addEventListener('click', () => {
        const productId = new URLSearchParams(window.location.search).get('id');

        if (!productId) {
          showToast('Product not found. Please go back and select a furniture.', 'error');
          return;
        }

        visualizeBtn.disabled = true;
        visualizeBtn.innerHTML = `
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"
            style="animation:spin 0.8s linear infinite;">
            <polyline points="23 4 23 10 17 10"></polyline>
            <path d="M20.49 15a9 9 0 1 1-2.12-9.36L23 10"></path>
          </svg>
          Loading...`;

        fetch(`${API_URL}/products/${productId}`)
          .then(res => res.json())
          .then(result => {
            if (result.success && result.data) {
              sessionStorage.setItem('selectedFurniture', JSON.stringify(result.data));
              window.location.href = 'ai-visualization.html';
            } else {
              showToast('Failed to load furniture details. Please try again.', 'error');
              visualizeBtn.disabled = false;
              visualizeBtn.innerHTML = `<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2"></polygon></svg> Visualize in My Room`;
            }
          })
          .catch(() => {
            showToast('Connection error. Please check your server.', 'error');
            visualizeBtn.disabled = false;
            visualizeBtn.innerHTML = `<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2"></polygon></svg> Visualize in My Room`;
          });
      });
    }
  }
  if (window.location.pathname.includes('track-delivery')) {
    const publicTrackForm = document.getElementById('publicTrackForm');
    if (publicTrackForm) publicTrackForm.addEventListener('submit', handlePublicTrackDelivery);
  }
   
  // ---- AI VISUALIZATION PAGE ----
if (window.location.pathname.includes('ai-visualization')) {
    initVisualizationPage();
}

// ---- CUSTOMER SUPPORT PAGE ----
if (window.location.pathname.includes('customer-support')) {
    initCustomerSupportPage();
    initChatbot();  // ← Chatbot now lives here
    loadContactPageContent(); // ← sync phone/email from admin → Supabase → this page

    // "Chat with AI" cards and CTA button also open the chatbot
    const openChatBtn = document.getElementById('openChatBtn');
    if (openChatBtn) openChatBtn.addEventListener('click', () => {
        document.getElementById('chatbotPanel').classList.add('open');
        document.getElementById('chatIconOpen').style.display = 'none';
        document.getElementById('chatIconClose').style.display = 'block';
        document.getElementById('chatbotBadge').style.display = 'none';
    });

    const ctaChatBtn = document.getElementById('ctaChatBtn');
    if (ctaChatBtn) ctaChatBtn.addEventListener('click', () => {
        document.getElementById('chatbotPanel').classList.add('open');
        document.getElementById('chatIconOpen').style.display = 'none';
        document.getElementById('chatIconClose').style.display = 'block';
        document.getElementById('chatbotBadge').style.display = 'none';
        window.scrollTo({ top: 0, behavior: 'smooth' });
    });
}
});

// Add "Create Account" button to Staff Module (Admin)
if (window.location.pathname.includes('admin')) {
  setTimeout(() => {
    const staffModule = document.getElementById('staffModule');
    if (staffModule && !document.getElementById('addStaffAccountBtn')) {
      const card = staffModule.querySelector('.card');
      if (card) {
        const btnHTML = `
          <div style="margin-bottom:1.5rem;display:flex;gap:0.75rem;flex-wrap:wrap;">
            <button class="btn btn-accent" id="addStaffAccountBtn" onclick="openAddStaffModal()">
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><line x1="12" y1="5" x2="12" y2="19"></line><line x1="5" y1="12" x2="19" y2="12"></line></svg>
              Create New Account (Staff / Manager)
            </button>
            <button class="btn btn-secondary" id="editMyAccountBtn" onclick="openMyAccountModal()">
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"></path><circle cx="12" cy="7" r="4"></circle></svg>
              Edit My Account
            </button>
          </div>`;
        card.insertAdjacentHTML('beforebegin', btnHTML);
      }
    }
  }, 500);
}
