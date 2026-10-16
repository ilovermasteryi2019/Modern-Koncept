/* =============================================================================
 * K-Desk | js/core/utils.js
 * Small shared helpers
 * -----------------------------------------------------------------------------
 * WHAT IT DOES : Formatting helpers (currency, dates), discount/price helpers for customer product cards, modal open/close
 * and file-to-base64 conversion for image uploads.
 * DEPENDS ON   : Used by all feature files.
 * LOAD ORDER   : file 6 of 19 (see scripts-block.html). These are plain scripts that share one
 *                global scope, so inline onclick="..." handlers in the HTML keep working.
 * CONTENTS     :
 * formatCurrency, getDiscountInfo, getEffectivePrice, renderPriceHTML, formatDate, formatDateTime,
 * showModal, hideModal, fileToBase64
 * ============================================================================= */

// =============================================================================
// UTILITY FUNCTIONS
// =============================================================================
function formatCurrency(amount) {
  const num = parseFloat(amount);
  if (isNaN(num)) return '₱0.00';
  return '₱' + num.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

// Discount helpers: a product is discounted only when discounted_price is not null AND lower than price.
function getDiscountInfo(product) {
  const regular = parseFloat(product && product.price);
  const rawDiscount = product ? product.discounted_price : null;
  if (rawDiscount === null || rawDiscount === undefined || rawDiscount === '') return { isDiscounted: false, regular, final: regular, percent: 0 };
  const discounted = parseFloat(rawDiscount);
  if (isNaN(regular) || isNaN(discounted) || discounted <= 0 || discounted >= regular) return { isDiscounted: false, regular, final: regular, percent: 0 };
  return { isDiscounted: true, regular, final: discounted, percent: Math.round(((regular - discounted) / regular) * 100) };
}

// The price a customer actually pays: the discounted price when valid, otherwise the regular price.
function getEffectivePrice(product) {
  return getDiscountInfo(product).final;
}

// Price block used by customer-facing cards (furniture list + homepage Special Offers).
function renderPriceHTML(product) {
  const info = getDiscountInfo(product);
  if (!info.isDiscounted) {
    return `<span style="font-size:1.25rem;font-weight:700;color:#DC143C;">${formatCurrency(info.regular)}</span>`;
  }
  return `
    <div style="display:flex;flex-direction:column;gap:0.15rem;">
      <span style="font-size:0.9rem;color:#9ca3af;text-decoration:line-through;">${formatCurrency(info.regular)}</span>
      <span style="font-size:1.25rem;font-weight:700;color:#DC143C;">${formatCurrency(info.final)}</span>
    </div>
    <span style="background:#DC143C;color:#fff;font-size:0.75rem;font-weight:700;padding:0.25rem 0.6rem;border-radius:9999px;white-space:nowrap;">${info.percent}% OFF</span>`;
}

// Formats a date value as a readable date for tables and pages.
function formatDate(dateStr) {
  if (!dateStr) return 'N/A';
  return new Date(dateStr).toLocaleDateString('en-US', { year: 'numeric', month: 'short', day: 'numeric' });
}

// Formats a date value as a readable date and time.
function formatDateTime(dateStr) {
  if (!dateStr) return 'N/A';
  return new Date(dateStr).toLocaleString('en-US', { year: 'numeric', month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit', timeZone: 'Asia/Manila' });
}

// Opens a modal by adding the "active" class to the element with this id.
function showModal(modalId) {
  const modal = document.getElementById(modalId);
  if (modal) modal.classList.add('active');
}

// Closes a modal by removing the "active" class from the element with this id.
function hideModal(modalId) {
  const modal = document.getElementById(modalId);
  if (modal) modal.classList.remove('active');
}

// Reads a File and resolves to a base64 data URL (used for image uploads).
function fileToBase64(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.readAsDataURL(file);
    reader.onload = () => resolve(reader.result);
    reader.onerror = error => reject(error);
  });
}
