/* =============================================================================
 * K-Desk | js/core/feedback-install.js
 * Install loading feedback on existing functions
 * -----------------------------------------------------------------------------
 * WHAT IT DOES : Wraps the EXISTING functions by name (forms, deletes, loaders) with the helpers from ui-feedback.js, so every
 * caller and event listener gets the loading indicator and double-click protection.
 * It must load LAST because it wraps functions that are defined in all the other files.
 * DEPENDS ON   : Everything above.
 * LOAD ORDER   : file 19 of 19 (see scripts-block.html). These are plain scripts that share one
 *                global scope, so inline onclick="..." handlers in the HTML keep working.
 * CONTENTS     :
 *
 * ============================================================================= */

// =============================================================================
// LOADING / DUPLICATE-SUBMISSION FEEDBACK: installs the shared behaviour (see "K-DESK LOADING" near the top).
// Each entry wraps an EXISTING function by name, so every caller and event listener gets the same protection.
// Only real data actions are listed: navigation, tabs and "open empty modal" buttons are intentionally not touched.
// =============================================================================
(function kdInstallFeedback() {
  const submit = (loadingText, progress) => ({ button: 'event', loadingText, progress });
  const del = (label) => ({ key: (id) => 'delete:' + label + ':' + id, progress: 'Deleting...' });
  const open = (label, progress) => ({ key: (id) => 'open:' + label + ':' + id, progress: progress || 'Loading details...' });

  // ---- Forms (button -> "Saving...", in-progress guard, slow notice) ----
  kdGuard('handleSignup', submit('Creating Account...', 'Creating account...'));
  kdGuard('handleStaffAccountSubmit', { ...submit('Creating Account...', 'Creating account...'), key: 'staffAccountCreate' });
  kdGuard('handleEditStaffSubmit', submit('Saving...', 'Saving changes...'));
  kdGuard('handleMyAccountSubmit', submit('Saving...', 'Saving changes...'));
  kdGuard('handleFurnitureSubmit', submit('Saving...', 'Saving changes...'));
  kdGuard('handleAboutFormSubmit', submit('Saving...', 'Saving changes...'));
  kdGuard('handleContactFormSubmit', submit('Saving...', 'Saving changes...'));
  kdGuard('handleInventorySubmit', { button: 'event', progress: 'Saving inventory item...', loadingText: () => (editingInventoryId ? 'Saving...' : 'Adding Item...') });
  kdGuard('handleManagerAddInventorySubmit', submit('Adding Item...', 'Saving inventory item...'));
  kdGuard('handleStaffDeliverySubmit', submit('Adding Delivery...', 'Saving delivery...'));
  kdGuard('handleDeliverySubmit', { button: 'event', progress: 'Saving delivery...', loadingText: () => (editingDeliveryId ? 'Saving...' : 'Adding Delivery...') });
  kdGuard('handleChatbotSubmit', { button: 'event', progress: 'Saving Q&A...', loadingText: () => (editingChatbotId ? 'Saving...' : 'Adding Q&A...') });
  kdGuard('handleInquirySubmit', { button: '#inquirySubmitBtn', loadingText: 'Sending...', progress: 'Submitting your information...' });
  kdGuard('handleFeedbackSubmit', { button: '#feedbackSubmitBtn', loadingText: 'Submitting...', progress: 'Submitting your information...' });
  kdGuard('handlePublicTrackDelivery', { button: 'event', loadingText: 'Tracking...' });
  kdGuard('confirmSendSms', { key: () => 'sendSms:' + currentSmsDeliveryId, button: '#confirmSendSmsBtn', loadingText: 'Sending SMS...', progress: 'Sending SMS...' });

  // Sales forms are driven by a config object (Admin / Staff / Manager share these two functions)
  const saleButton = (cfg) => { const f = document.getElementById(cfg.formId); return f ? f.querySelector('button[type="submit"]') : null; };
  kdGuard('submitNewSale', { key: (cfg) => 'sale:' + cfg.formId, button: saleButton, loadingText: 'Saving...', progress: 'Saving sales record...' });
  kdGuard('submitSalesEdit', { key: (cfg) => 'saleEdit:' + cfg.formId, button: saleButton, loadingText: 'Saving...', progress: 'Saving changes...' });

  // ---- Deletes (the existing confirm() dialog still comes first) ----
  kdGuard('deleteInventory', del('inventory'));
  kdGuard('deleteDelivery', del('delivery'));
  kdGuard('deleteSales', del('sales'));
  kdGuard('deleteStaffAccount', del('staff'));
  kdGuard('deleteChatbotItem', del('chatbot'));
  kdGuard('deleteAdminInquiry', del('inquiry'));
  kdGuard('deleteAdminFeedback', del('feedback'));

  // ---- Status updates ----
  kdGuard('updateDeliveryStatus', {
    key: (id) => 'deliveryStatus:' + id,
    progress: 'Updating status...',
    disable: (id) => document.querySelector('.status-select[data-delivery-id="' + id + '"]')
  });
  kdGuard('updateInquiryStatus', { key: (id) => 'inquiryStatus:' + id, progress: 'Updating status...' });

  // ---- "Open for editing" actions that fetch data first ----
  kdGuard('editFurniture', open('furniture'));
  kdGuard('editInventory', open('inventory'));
  kdGuard('editDelivery', open('delivery'));
  kdGuard('editChatbotQA', open('chatbot'));
  kdGuard('openSalesEditForm', open('sales'));
  kdGuard('openManagerEditInventoryModal', open('managerInventory'));
  kdGuard('openMyAccountModal', { key: 'openMyAccount', progress: 'Loading your account...' });

  // ---- Tables and lists: Loading... / empty / error with "Try again" ----
  kdWrapLoader('loadFurnitureList', { target: 'furnitureList', loading: 'Loading furniture...', empty: 'No furniture found', error: 'Unable to load furniture.' });
  kdWrapLoader('loadInventoryList', { target: 'adminInventoryList', loading: 'Loading inventory records...', empty: 'No inventory items found', error: 'Unable to load inventory records.' });
  kdWrapLoader('loadDeliveryList', { target: 'adminDeliveryList', loading: 'Loading deliveries...', empty: 'No deliveries found', error: 'Unable to load deliveries.' });
  kdWrapLoader('loadStaffDeliveryList', { target: 'staffDeliveryList', loading: 'Loading deliveries...', empty: 'No deliveries found', error: 'Unable to load deliveries.' });
  kdWrapLoader('loadManagerDeliveryList', { target: 'managerDeliveryList', loading: 'Loading deliveries...', empty: 'No deliveries found', error: 'Unable to load deliveries.' });
  kdWrapLoader('loadSalesList', { target: 'adminSalesList', loading: 'Loading sales records...', empty: 'No sales records found', error: 'Unable to load sales records.' });
  kdWrapLoader('loadStaffSalesList', { target: 'staffSalesList', loading: 'Loading sales records...', empty: 'No sales records found', error: 'Unable to load sales records.' });
  kdWrapLoader('loadManagerSalesList', { target: 'managerSalesList', loading: 'Loading sales records...', empty: 'No sales records found', error: 'Unable to load sales records.' });
  kdWrapLoader('loadStaffAccountsList', { target: 'staffAccountsList', loading: 'Loading staff accounts...', empty: 'No accounts found', error: 'Unable to load staff accounts.' });
  kdWrapLoader('loadStaffInventoryList', { target: 'staffInventoryList', loading: 'Loading inventory records...', empty: 'No inventory items found', error: 'Unable to load inventory records.' });
  kdWrapLoader('loadManagerInventoryList', { target: 'managerInventoryList', loading: 'Loading inventory records...', empty: 'No inventory items found', error: 'Unable to load inventory records.' });
  kdWrapLoader('loadChatbotList', { target: 'chatbotList', loading: 'Loading chatbot Q&A...', empty: 'No Q&A entries found', error: 'Unable to load chatbot Q&A.' });
  kdWrapLoader('loadAdminInquiries', { target: 'adminInquiriesList', loading: 'Loading inquiries...', empty: 'No inquiries found', error: 'Unable to load inquiries.' });
  kdWrapLoader('loadAdminFeedback', { target: 'adminFeedbackList', loading: 'Loading feedback...', empty: 'No feedback submitted yet.', error: 'Unable to load feedback.' });

  // ---- Dashboard statistics and charts: dimmed while their data is being fetched ----
  kdWrapBusy('loadSalesAnalytics', '#totalSales, #totalRecords, #averageSale, #revenueBarChart, #salesLineChart');
  kdWrapBusy('loadStaffSalesAnalytics', '#staffTotalSales, #staffTotalRecords, #staffAverageSale');
  kdWrapBusy('loadManagerSalesAnalytics', '#managerTotalSales, #managerTotalRecords, #managerAverageSale');
  kdWrapBusy('loadDeliveryStats', '[id$="PendingCount"], [id$="ProcessingCount"], [id$="InTransitCount"], [id$="DeliveredCount"]');

  // ---- Pages that are empty until their data arrives ----
  kdWrapPage('loadFurnitureDetail', 'Loading furniture details...');
})();
