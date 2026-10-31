// =============================================================================
// K-DESK · main.js  (entry point, loaded with <script type="module">)
// Stage E: modules extracted so far: core, ui, auth, dimensions, furniture, inventory, sales, delivery, business-info, staff-accounts, chatbot, ai-visualization. The rest of the original code is still below, unchanged,
// and moves out stage by stage.
// =============================================================================
import { API, API_URL } from './modules/core.js';
import { hideModal, initDashboardTabs, initModalCloseButtons, kdEventButton, kdRun, showToast } from './modules/ui.js';
import { handleLogin, handleLogout, handleSignup, initDashboardSession, initMfaUi } from './modules/auth.js';
import { editFurniture, handleFurnitureSubmit, initAdminFurnitureSearch, initFurnitureListFilters, loadFurnitureDetail, loadFurnitureList, loadPublicFurnitureList, loadSpecialOffers } from './modules/furniture.js';
import { adjustAdminInventoryQuantity, adjustManagerInventoryQuantity, archiveInventory, currentManagerStockImage, deleteInventory, editInventory, handleInventorySubmit, handleManagerAddInventorySubmit, handleManagerAddStockImageUpload, handleManagerEditStockImageUpload, handleStockImageUpload, initAdminInventorySearch, initManagerInventorySearch, initStaffInventorySearch, loadArchivedInventoryList, loadInventoryList, loadManagerArchivedInventoryList, loadManagerInventoryList, loadStaffArchivedInventoryList, loadStaffInventoryList, openAddInventoryModal, openAddManagerInventoryModal, openManagerEditInventoryModal, restoreInventory, setAdminInventoryQuantity, setManagerInventoryQuantity, switchAdminInventorySubtab, switchManagerInventorySubtab, switchStaffInventorySubtab, updateManagerStockPreview } from './modules/inventory.js';
import { archiveSales, deleteSales, editAdminSalesRecord, editManagerSalesRecord, editStaffSalesRecord, handleManagerSalesSubmit, handleSalesSubmit, handleStaffSalesSubmit, initAdminSalesControls, initManagerSalesControls, initStaffSalesControls, loadArchivedSalesList, loadManagerArchivedSalesList, loadManagerSalesAnalytics, loadManagerSalesList, loadSalesAnalytics, loadSalesList, loadSalesProductOptions, loadStaffArchivedSalesList, loadStaffSalesAnalytics, loadStaffSalesList, openAddSalesModal, restoreSales, submitSalesEdit, switchAdminSalesSubtab, switchManagerSalesSubtab, switchStaffSalesSubtab, syncDeliveredSalesRecords } from './modules/sales.js';
import { archiveDelivery, confirmSendSms, deleteDelivery, editDelivery, handleDeliverySubmit, handlePublicTrackDelivery, handleStaffDeliverySubmit, initAdminDeliveryControls, initDriverDeliveryControls, initManagerDeliveryControls, loadArchivedDeliveryList, loadDeliveryList, loadDeliveryStats, loadDriverDeliveryList, loadManagerArchivedDeliveryList, loadManagerDeliveryList, loadStaffArchivedDeliveryList, loadStaffDeliveryList, markDeliveryAsDelivered, openAddDeliveryModal, openSmsModal, openStaffAddDeliveryModal, restoreDelivery, switchAdminDeliverySubtab, switchManagerDeliverySubtab, switchStaffDeliverySubtab, toggleDeliverySelection, updateDeliveryStatus } from './modules/delivery.js';
import { handleContactFormSubmit, loadAboutPageContent, loadBusinessInfo, loadContactPageContent } from './modules/business-info.js';
import { activateStaffAccount, closeEditStaffModal, closeMyAccountModal, deactivateStaffAccount, loadStaffAccountsList, openAddStaffModal, openEditStaffModal, openMyAccountModal } from './modules/staff-accounts.js';
import { deleteAdminFeedback, deleteAdminInquiry, deleteChatbotItem, editChatbotQA, handleChatbotSubmit, initChatbot, initCustomerSupportPage, loadAdminFeedback, loadAdminInquiries, loadChatbotList, openAddChatbotModal } from './modules/chatbot.js';
import { initVisualizationPage } from './modules/ai-visualization.js';

document.addEventListener('DOMContentLoaded', () => {
  console.log('🚀 Furniture Management System Initialized');
  initDashboardTabs(onDashboardTabOpened);
  initModalCloseButtons();
  initDashboardSession();

  // ---- ADMIN PAGE ----
  if (window.location.pathname.includes('admin')) {
    const user = JSON.parse(sessionStorage.getItem('currentUser') || '{}');
    const adminNameEl = document.getElementById('adminName');
    if (adminNameEl && user.name) adminNameEl.textContent = user.name;

    loadFurnitureList();
    initAdminFurnitureSearch();
    initAdminInventorySearch();
    initAdminSalesControls();
    initAdminDeliveryControls();

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

    initStaffSalesControls();
    initStaffInventorySearch();

    // Sales Records is now the default Staff tab, so load it on page open
    loadStaffSalesList();
    loadStaffArchivedSalesList();
    loadStaffSalesAnalytics();
    loadSalesProductOptions('salesProduct');
    document.addEventListener('visibilitychange', () => {
      const salesModule = document.getElementById('salesModule');
      if (!document.hidden && salesModule && salesModule.classList.contains('active')) loadSalesProductOptions('salesProduct');
    });

    const bind = (id, handler) => { const el = document.getElementById(id); if (el) el.addEventListener('submit', handler); };
    bind('deliveryForm', handleDeliverySubmit);
    bind('staffDeliveryForm', handleStaffDeliverySubmit);
    const staffAddDeliveryBtn = document.getElementById('staffAddDeliveryBtn');
    if (staffAddDeliveryBtn) staffAddDeliveryBtn.addEventListener('click', openAddDeliveryModal);
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
    loadManagerArchivedDeliveryList();
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
        const price = parseFloat(document.getElementById('managerEditInventoryPrice').value);
        if (!itemCode || !category) { showToast('Please fill all fields correctly', 'error'); return; }
        if (!Number.isFinite(price) || price <= 0) { showToast('Please enter a valid price greater than 0', 'error'); return; }
        const data = { name, item_code: itemCode, category, price };
        if (currentManagerStockImage) data.image = currentManagerStockImage; // only send image if a new one was picked, so the existing one is preserved otherwise
        try {
          const result = await API.updateInventory(id, data);
          if (result.success) { showToast('Inventory updated successfully', 'success'); hideModal('managerEditInventoryModal'); loadManagerInventoryList(); }
          else showToast(result.message || 'Failed to update inventory', 'error');
        } catch (error) { showToast('Failed to update inventory', 'error'); }
      }, { button: kdEventButton(e), loadingText: 'Saving...', progress: 'Saving changes...' }));
    }

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

    // Manager delivery controls (search, status/date-range filters, sorting, bulk status update)
    initManagerDeliveryControls();

    // Manager sales controls (search, category filter, date range, sort, chart interval/comparison)
    initManagerSalesControls();

    // Manager inventory controls (search, category filter, stock status filter, reset)
    initManagerInventorySearch();
  }

  // ---- DRIVER PAGE ----
  if (window.location.pathname.includes('driver')) {
    const user = JSON.parse(sessionStorage.getItem('currentUser') || '{}');
    const driverNameEl = document.getElementById('driverName');
    if (driverNameEl && user.name) driverNameEl.textContent = user.name;

    loadDriverDeliveryList();
    initDriverDeliveryControls();

    const logoutBtn = document.getElementById('logoutBtn');
    if (logoutBtn) logoutBtn.addEventListener('click', handleLogout);
  }

  // ---- LOGIN PAGE ----
  if (window.location.pathname.includes('login')) {
    const reasons = {
      expired: 'Your session has expired. Please log in again.',
      idle: 'You were logged out because of inactivity.',
      required: 'Please log in to continue.',
      deactivated: 'This account is deactivated. Please contact your administrator.'
    };
    const reason = new URLSearchParams(window.location.search).get('reason');
    if (reason && reasons[reason]) {
      showToast(reasons[reason], reason === 'deactivated' ? 'error' : 'info', 6000);
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
  if (window.location.pathname === '/' || window.location.pathname.endsWith('/index.html') || window.location.pathname.endsWith('/index')) {
    loadSpecialOffers();
  }
  if (window.location.pathname.includes('furniture-list')) { loadPublicFurnitureList(); initFurnitureListFilters(); }
  if (window.location.pathname.includes('furniture-detail')) {
    loadFurnitureDetail();

    const visualizeBtn = document.getElementById('visualizeBtn');
    if (visualizeBtn) {
      visualizeBtn.addEventListener('click', () => {
        const productId = new URLSearchParams(window.location.search).get('id') || sessionStorage.getItem('selectedFurnitureId');

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

// Loads the data for the dashboard tab that was just opened. Moved here from initDashboardTabs() (ui.js), which now
// receives it as a callback, so that ui.js does not have to import every feature module. Body unchanged.
function onDashboardTabOpened(targetTab, { isAdmin, isStaff, isManager }) {
        if (targetTab === 'furniture') loadFurnitureList();
        else if (targetTab === 'business') loadBusinessInfo();
        else if (targetTab === 'inventory' && isAdmin) { loadInventoryList(); loadArchivedInventoryList(); }
        else if (targetTab === 'inventory' && isManager) { loadManagerInventoryList(); loadManagerArchivedInventoryList(); }
        else if (targetTab === 'inventory' && isStaff) { loadStaffInventoryList(); loadStaffArchivedInventoryList(); }
        else if (targetTab === 'delivery' && isAdmin) { loadDeliveryList(); loadArchivedDeliveryList(); loadDeliveryStats(); }
        else if (targetTab === 'delivery' && isManager) { loadManagerDeliveryList(); loadManagerArchivedDeliveryList(); loadDeliveryStats(); }
        else if (targetTab === 'delivery' && isStaff) { loadStaffDeliveryList(); loadStaffArchivedDeliveryList(); loadDeliveryStats(); }
        else if (targetTab === 'sales' && isAdmin) { loadSalesList(); loadArchivedSalesList(); loadSalesAnalytics(); }
        else if (targetTab === 'sales' && isStaff) { loadStaffSalesList(); loadStaffArchivedSalesList(); loadStaffSalesAnalytics(); loadSalesProductOptions('salesProduct'); }
        else if (targetTab === 'sales' && isManager) { loadManagerSalesList(); loadManagerArchivedSalesList(); loadManagerSalesAnalytics(); loadSalesProductOptions('managerSalesProduct'); }
        else if (targetTab === 'staff') loadStaffAccountsList();
         else if (targetTab === 'chatbot') loadChatbotList();
        else if (targetTab === 'feedback') { loadAdminInquiries(); loadAdminFeedback(); }
}


// =============================================================================
// INLINE-HANDLER COMPATIBILITY LAYER (the only place functions are exposed globally)
// Generated HTML (e.g. onclick="deleteInventory(3)") calls these functions by name. ES modules are not global,
// so exactly these names are exposed here, each pointing at the module's (already wrapped) implementation.
// To retire this layer later, convert those handlers to addEventListener, then delete this block.
// =============================================================================
Object.assign(window, {
  activateStaffAccount,
  adjustAdminInventoryQuantity,
  adjustManagerInventoryQuantity,
  archiveDelivery,
  archiveInventory,
  archiveSales,
  closeEditStaffModal,
  closeMyAccountModal,
  deactivateStaffAccount,
  deleteAdminFeedback,
  deleteAdminInquiry,
  deleteChatbotItem,
  deleteDelivery,
  deleteInventory,
  deleteSales,
  editAdminSalesRecord,
  editChatbotQA,
  editDelivery,
  editFurniture,
  editInventory,
  editManagerSalesRecord,
  editStaffSalesRecord,
  hideModal,
  loadArchivedDeliveryList,
  loadArchivedInventoryList,
  loadArchivedSalesList,
  loadDriverDeliveryList,
  markDeliveryAsDelivered,
  openAddStaffModal,
  openEditStaffModal,
  openManagerEditInventoryModal,
  openMyAccountModal,
  openSmsModal,
  restoreDelivery,
  restoreInventory,
  restoreSales,
  setAdminInventoryQuantity,
  setManagerInventoryQuantity,
  switchAdminDeliverySubtab,
  switchAdminInventorySubtab,
  switchAdminSalesSubtab,
  switchManagerDeliverySubtab,
  switchManagerInventorySubtab,
  switchManagerSalesSubtab,
  switchStaffDeliverySubtab,
  switchStaffInventorySubtab,
  switchStaffSalesSubtab,
  toggleDeliverySelection,
  updateDeliveryStatus,
  syncDeliveredSalesRecords,
});
