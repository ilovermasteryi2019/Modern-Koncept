// =============================================================================
// K-DESK · sales.js
// sales
// Cut from the original main.js (lines 690-2863 region). Code is unchanged except where a comment says otherwise.
// =============================================================================

import { API, API_URL, formatCurrency, formatDate } from './core.js';
import { hideModal, kdConfirm, kdDeleteOptions as del, kdGuard, kdOpenOptions as open, kdWrapBusy, kdWrapLoader, showModal, showToast } from './ui.js';
import { getInventoryUnitPrice, loadInventoryList, loadManagerInventoryList, loadStaffInventoryList } from './inventory.js';

// Cached Admin sales & inventory category state for filtering, sorting, and chart reporting
let adminSalesCache = [];
let adminInventoryCategoriesLoaded = false;
const adminInventoryCategoryById = new Map();
const adminInventoryCategoryByName = new Map();
const adminKnownCategories = new Set(['Living Room', 'Bedroom', 'Dining', 'Office', 'Storage', 'Outdoor']);
let adminSalesControlsInitialized = false;

// Cached Manager sales state for filtering, sorting, and chart reporting
let managerSalesCache = [];
let managerInventoryCategoriesLoaded = false;
const managerInventoryCategoryById = new Map();
const managerInventoryCategoryByName = new Map();
let managerSalesControlsInitialized = false;

const MONTH_NAMES_SHORT = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

function escapeHtml(str) {
  return String(str ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function toLocalDateKey(dateVal) {
  if (!dateVal) return '';
  if (typeof dateVal === 'string' && /^\d{4}-\d{2}-\d{2}/.test(dateVal)) {
    return dateVal.slice(0, 10);
  }
  const d = new Date(dateVal);
  if (Number.isNaN(d.getTime())) return '';
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

function parseLocalDateKey(dateKey) {
  if (!dateKey || !/^\d{4}-\d{2}-\d{2}$/.test(dateKey)) return null;
  const [y, m, d] = dateKey.split('-').map(Number);
  return new Date(y, m - 1, d);
}

function formatReadableDayKey(dateKey) {
  const d = parseLocalDateKey(dateKey);
  if (!d) return dateKey;
  return `${MONTH_NAMES_SHORT[d.getMonth()]} ${d.getDate()}, ${d.getFullYear()}`;
}

function getWeekStartKey(dateKey) {
  const d = parseLocalDateKey(dateKey);
  if (!d) return dateKey;
  const dayOfWeek = d.getDay(); // 0=Sun..6=Sat
  const diffToMonday = dayOfWeek === 0 ? -6 : 1 - dayOfWeek;
  d.setDate(d.getDate() + diffToMonday);
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

async function ensureAdminInventoryCategoryMap() {
  if (adminInventoryCategoriesLoaded) return;
  try {
    const invResult = await API.getInventory();
    if (invResult && invResult.success && Array.isArray(invResult.data)) {
      invResult.data.forEach(item => {
        const cat = typeof item.category === 'string' && item.category.trim() ? item.category.trim() : null;
        if (!cat) return;
        adminKnownCategories.add(cat);
        if (item.id != null) adminInventoryCategoryById.set(Number(item.id), cat);
        if (item.name) adminInventoryCategoryByName.set(String(item.name).trim().toLowerCase(), cat);
      });
      adminInventoryCategoriesLoaded = true;
    }
  } catch (_) {
    // Non-fatal: backend GET /sales already enriches category
  }
}

function resolveSaleCategory(item) {
  if (!item) return 'Uncategorized';
  if (typeof item.category === 'string' && item.category.trim() && item.category.trim() !== 'Uncategorized') {
    const cat = item.category.trim();
    adminKnownCategories.add(cat);
    return cat;
  }
  if (item.inventory_id != null && adminInventoryCategoryById.has(Number(item.inventory_id))) {
    return adminInventoryCategoryById.get(Number(item.inventory_id));
  }
  const prodName = typeof item.product_name === 'string' ? item.product_name.trim().toLowerCase() : '';
  if (prodName && adminInventoryCategoryByName.has(prodName)) {
    return adminInventoryCategoryByName.get(prodName);
  }
  if (typeof item.category === 'string' && item.category.trim()) {
    return item.category.trim();
  }
  return 'Uncategorized';
}

function populateAdminSalesCategoryDropdown(salesRows) {
  const select = document.getElementById('adminSalesCategoryFilter');
  if (!select) return;
  const previousValue = select.value || 'all';
  const categories = new Set(adminKnownCategories);
  let hasUncategorized = false;
  (salesRows || []).forEach(row => {
    const cat = resolveSaleCategory(row);
    if (cat === 'Uncategorized') hasUncategorized = true;
    else if (cat) categories.add(cat);
  });
  const sorted = Array.from(categories).sort((a, b) => a.localeCompare(b));
  if (hasUncategorized) sorted.push('Uncategorized');

  select.innerHTML = '<option value="all">All Categories</option>' +
    sorted.map(cat => `<option value="${escapeHtml(cat)}">${escapeHtml(cat)}</option>`).join('');

  if (previousValue === 'all' || sorted.includes(previousValue)) {
    select.value = previousValue;
  } else {
    select.value = 'all';
  }
}

function getAdminSalesFilterState() {
  const searchEl = document.getElementById('adminSalesSearch');
  const categoryEl = document.getElementById('adminSalesCategoryFilter');
  const dateFromEl = document.getElementById('adminSalesDateFrom');
  const dateToEl = document.getElementById('adminSalesDateTo');
  const sortEl = document.getElementById('adminSalesSort');
  const intervalEl = document.getElementById('salesChartInterval');
  const comparisonEl = document.getElementById('salesChartComparison');

  const search = searchEl ? searchEl.value.trim().toLowerCase() : '';
  const category = categoryEl ? categoryEl.value : 'all';
  const dateFrom = dateFromEl ? dateFromEl.value : '';
  const dateTo = dateToEl ? dateToEl.value : '';
  const sort = sortEl ? sortEl.value : 'date-desc';
  const interval = intervalEl ? intervalEl.value : 'auto';
  const comparison = comparisonEl ? comparisonEl.value : 'none';

  const hasActiveFilters = Boolean(search || (category && category !== 'all') || dateFrom || dateTo);
  return { search, category, dateFrom, dateTo, sort, interval, comparison, hasActiveFilters };
}

function filterAndSortAdminSales(salesRows, filterState) {
  const { search, category, dateFrom, dateTo, sort } = filterState;

  const filtered = (salesRows || []).filter(item => {
    const resolvedCategory = resolveSaleCategory(item);
    if (category && category !== 'all' && resolvedCategory.toLowerCase() !== category.toLowerCase()) {
      return false;
    }
    const dateKey = toLocalDateKey(item.sale_date);
    if (dateFrom && (!dateKey || dateKey < dateFrom)) return false;
    if (dateTo && (!dateKey || dateKey > dateTo)) return false;

    if (search) {
      const customer = String(item.customer_name || '').toLowerCase();
      const product = String(item.product_name || '').toLowerCase();
      const catLower = resolvedCategory.toLowerCase();
      if (!customer.includes(search) && !product.includes(search) && !catLower.includes(search)) {
        return false;
      }
    }
    return true;
  });

  const sorted = [...filtered].sort((a, b) => {
    if (sort === 'date-asc' || sort === 'date-desc') {
      const da = toLocalDateKey(a.sale_date);
      const db = toLocalDateKey(b.sale_date);
      if (da !== db) {
        return sort === 'date-asc' ? da.localeCompare(db) : db.localeCompare(da);
      }
      return sort === 'date-asc' ? (Number(a.id) - Number(b.id)) : (Number(b.id) - Number(a.id));
    }
    if (sort === 'amount-desc' || sort === 'amount-asc') {
      const aa = parseFloat(a.amount) || 0;
      const ab = parseFloat(b.amount) || 0;
      if (aa !== ab) return sort === 'amount-asc' ? aa - ab : ab - aa;
      return Number(b.id) - Number(a.id);
    }
    if (sort === 'product-asc' || sort === 'product-desc') {
      const pa = String(a.product_name || '');
      const pb = String(b.product_name || '');
      const cmp = pa.localeCompare(pb, undefined, { sensitivity: 'base' });
      return sort === 'product-asc' ? cmp : -cmp;
    }
    if (sort === 'customer-asc' || sort === 'customer-desc') {
      const ca = String(a.customer_name || '');
      const cb = String(b.customer_name || '');
      const cmp = ca.localeCompare(cb, undefined, { sensitivity: 'base' });
      return sort === 'customer-asc' ? cmp : -cmp;
    }
    return 0;
  });

  return sorted;
}

// Configurable performance thresholds for Admin Sales Summary Cards:
// - Low (Red / .summary-card--low): below mediumMin
// - Middle Range (Yellow / .summary-card--medium): mediumMin up to highMin - 0.01
// - High (Green / .summary-card--high): >= highMin
// When a date filter is applied (#adminSalesDateFrom / #adminSalesDateTo), Total Sales and Total Records
// thresholds scale proportionally to the selected period length (relative to a 30-day monthly baseline).
// Average Sale is a per-transaction metric and uses its per-sale furniture price thresholds regardless of period length.
export const SALES_PERFORMANCE_THRESHOLDS = {
  totalSalesMonthly: {
    mediumMin: 15000, // ₱15,000+ = Middle Range (Yellow)
    highMin: 50000    // ₱50,000+ = High (Green)
  },
  totalRecordsMonthly: {
    mediumMin: 5,     // 5+ sales = Middle Range (Yellow)
    highMin: 15       // 15+ sales = High (Green)
  },
  averageSale: {
    mediumMin: 3000,  // ₱3,000+ per sale = Middle Range (Yellow)
    highMin: 10000    // ₱10,000+ per sale = High (Green)
  }
};

function classifyPerformanceLevel(value, mediumMin, highMin) {
  const num = Number(value) || 0;
  if (num >= highMin) return { level: 'high', label: 'High Performance', cssClass: 'summary-card--high' };
  if (num >= mediumMin) return { level: 'medium', label: 'Middle Range', cssClass: 'summary-card--medium' };
  return { level: 'low', label: 'Low Performance', cssClass: 'summary-card--low' };
}

export function evaluateSalesSummaryPerformance(filteredSales, allSales, filterState = {}) {
  const { dateFrom, dateTo } = filterState;
  let periodDays = 30;
  let isDateScaled = false;

  if (dateFrom || dateTo) {
    const allDates = ((filteredSales && filteredSales.length ? filteredSales : allSales) || [])
      .map(s => toLocalDateKey(s.sale_date))
      .filter(Boolean)
      .sort();
    const startKey = dateFrom || (allDates.length ? allDates[0] : toLocalDateKey(new Date()));
    const endKey = dateTo || (allDates.length ? allDates[allDates.length - 1] : toLocalDateKey(new Date()));
    const startD = parseLocalDateKey(startKey);
    const endD = parseLocalDateKey(endKey);
    if (startD && endD && endD >= startD) {
      periodDays = Math.max(1, Math.round((endD - startD) / (1000 * 60 * 60 * 24)) + 1);
      isDateScaled = true;
    }
  }

  const scale = isDateScaled ? (periodDays / 30) : 1;
  const salesMedMin = isDateScaled
    ? Math.max(500, Math.round(SALES_PERFORMANCE_THRESHOLDS.totalSalesMonthly.mediumMin * scale))
    : SALES_PERFORMANCE_THRESHOLDS.totalSalesMonthly.mediumMin;
  const salesHighMin = isDateScaled
    ? Math.max(salesMedMin + 1000, Math.round(SALES_PERFORMANCE_THRESHOLDS.totalSalesMonthly.highMin * scale))
    : SALES_PERFORMANCE_THRESHOLDS.totalSalesMonthly.highMin;

  const recordsMedMin = isDateScaled
    ? Math.max(1, Math.round(SALES_PERFORMANCE_THRESHOLDS.totalRecordsMonthly.mediumMin * scale))
    : SALES_PERFORMANCE_THRESHOLDS.totalRecordsMonthly.mediumMin;
  const recordsHighMin = isDateScaled
    ? Math.max(recordsMedMin + 1, Math.round(SALES_PERFORMANCE_THRESHOLDS.totalRecordsMonthly.highMin * scale))
    : SALES_PERFORMANCE_THRESHOLDS.totalRecordsMonthly.highMin;

  const avgMedMin = SALES_PERFORMANCE_THRESHOLDS.averageSale.mediumMin;
  const avgHighMin = SALES_PERFORMANCE_THRESHOLDS.averageSale.highMin;

  const filteredCount = (filteredSales || []).length;
  const filteredTotal = (filteredSales || []).reduce((sum, s) => sum + (parseFloat(s.amount) || 0), 0);
  const filteredAvg = filteredCount > 0 ? filteredTotal / filteredCount : 0;

  return {
    periodDays,
    isDateScaled,
    totalSales: {
      value: filteredTotal,
      mediumMin: salesMedMin,
      highMin: salesHighMin,
      ...classifyPerformanceLevel(filteredTotal, salesMedMin, salesHighMin)
    },
    totalRecords: {
      value: filteredCount,
      mediumMin: recordsMedMin,
      highMin: recordsHighMin,
      ...classifyPerformanceLevel(filteredCount, recordsMedMin, recordsHighMin)
    },
    averageSale: {
      value: filteredAvg,
      mediumMin: avgMedMin,
      highMin: avgHighMin,
      ...classifyPerformanceLevel(filteredAvg, avgMedMin, avgHighMin)
    }
  };
}

function applySummaryCardState(valueElId, badgeElId, metricPerf) {
  const valueEl = document.getElementById(valueElId);
  const cardEl = valueEl ? valueEl.closest('.summary-card') : null;
  if (cardEl) {
    cardEl.classList.remove('summary-card--low', 'summary-card--medium', 'summary-card--high');
    cardEl.classList.add(metricPerf.cssClass);
    cardEl.setAttribute('data-performance-level', metricPerf.level);
  }
  const badgeEl = document.getElementById(badgeElId);
  if (badgeEl) {
    badgeEl.textContent = metricPerf.label;
    badgeEl.setAttribute('aria-label', `Performance level: ${metricPerf.label}`);
  }
}

function updateAdminSalesSummaryCards(filteredSales, allSales, filterState = {}) {
  const setEl = (id, val) => { const el = document.getElementById(id); if (el) el.textContent = val; };
  const hasActiveFilters = Boolean(filterState && filterState.hasActiveFilters);

  const allCount = (allSales || []).length;
  const allTotal = (allSales || []).reduce((sum, s) => sum + (parseFloat(s.amount) || 0), 0);
  const allAvg = allCount > 0 ? allTotal / allCount : 0;

  const perf = evaluateSalesSummaryPerformance(filteredSales, allSales, filterState);
  const filteredCount = perf.totalRecords.value;
  const filteredTotal = perf.totalSales.value;
  const filteredAvg = perf.averageSale.value;

  setEl('totalSales', formatCurrency(filteredTotal));
  setEl('totalRecords', String(filteredCount));
  setEl('averageSale', formatCurrency(filteredAvg));

  applySummaryCardState('totalSales', 'totalSalesPerfBadge', perf.totalSales);
  applySummaryCardState('totalRecords', 'totalRecordsPerfBadge', perf.totalRecords);
  applySummaryCardState('averageSale', 'averageSalePerfBadge', perf.averageSale);

  const periodBasisLabel = perf.isDateScaled ? `${perf.periodDays}-day range` : '30-day benchmark';
  const salesThresholdNote = `Mid ≥ ${formatCurrency(perf.totalSales.mediumMin)} · High ≥ ${formatCurrency(perf.totalSales.highMin)} (${periodBasisLabel})`;
  const recordsThresholdNote = `Mid ≥ ${perf.totalRecords.mediumMin} · High ≥ ${perf.totalRecords.highMin} records (${periodBasisLabel})`;
  const avgThresholdNote = `Mid ≥ ${formatCurrency(perf.averageSale.mediumMin)} · High ≥ ${formatCurrency(perf.averageSale.highMin)} per sale`;

  if (hasActiveFilters) {
    setEl('totalSalesScope', `Filtered (All-Time: ${formatCurrency(allTotal)}) · ${salesThresholdNote}`);
    setEl('totalRecordsScope', `Showing ${filteredCount} of ${allCount} records · ${recordsThresholdNote}`);
    setEl('averageSaleScope', `Filtered Avg (All-Time: ${formatCurrency(allAvg)}) · ${avgThresholdNote}`);
    setEl('adminSalesFilterSummary', `Showing ${filteredCount} of ${allCount} sales records (filtered)`);
  } else {
    setEl('totalSalesScope', `All-Time Total · ${salesThresholdNote}`);
    setEl('totalRecordsScope', `All Sales Records · ${recordsThresholdNote}`);
    setEl('averageSaleScope', `Per Transaction Average · ${avgThresholdNote}`);
    setEl('adminSalesFilterSummary', `Showing all ${allCount} sales record${allCount === 1 ? '' : 's'}`);
  }
}

function renderAdminSalesTableRows(filteredSales, allSalesCount) {
  const tbody = document.getElementById('adminSalesList');
  if (!tbody) return;
  tbody.innerHTML = '';

  if (!filteredSales || filteredSales.length === 0) {
    const emptyMsg = allSalesCount > 0
      ? 'No sales records match your selected filters.'
      : 'No sales records found';
    tbody.innerHTML = `<tr><td colspan="6" style="text-align:center;color:#9ca3af;padding:2rem;">${emptyMsg}</td></tr>`;
    return;
  }

  filteredSales.forEach(item => {
    const category = resolveSaleCategory(item);
    tbody.innerHTML += `
      <tr>
        <td>${formatDate(item.sale_date)}</td>
        <td>${escapeHtml(item.customer_name)}</td>
        <td>${formatSaleProduct(item)}</td>
        <td><span class="status-badge" style="background:#f3f4f6;color:#374151;font-weight:500;">${escapeHtml(category)}</span></td>
        <td>${formatCurrency(item.amount)}</td>
        <td>
          <button class="action-btn edit" onclick="editAdminSalesRecord(${item.id})" title="Edit"><svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"></path><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"></path></svg></button>
          <button class="action-btn delete" onclick="deleteSales(${item.id})" title="Delete"><svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="3 6 5 6 21 6"></polyline><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"></path></svg></button>
        </td>
      </tr>`;
  });
}

function chooseEffectiveSalesInterval(salesRows, requestedInterval) {
  if (requestedInterval && requestedInterval !== 'auto') return requestedInterval;
  const dateKeys = (salesRows || []).map(r => toLocalDateKey(r.sale_date)).filter(Boolean).sort();
  if (dateKeys.length <= 1) return 'day';
  const first = parseLocalDateKey(dateKeys[0]);
  const last = parseLocalDateKey(dateKeys[dateKeys.length - 1]);
  if (!first || !last) return 'day';
  const spanDays = Math.round((last - first) / (1000 * 60 * 60 * 24));
  if (spanDays <= 45) return 'day';
  if (spanDays <= 180) return 'week';
  return 'month';
}

function aggregateSalesChronologically(salesRows, interval) {
  const buckets = new Map();
  (salesRows || []).forEach(row => {
    const dateKey = toLocalDateKey(row.sale_date);
    if (!dateKey) return;
    let bucketKey = dateKey;
    let label = '';
    if (interval === 'month') {
      bucketKey = dateKey.slice(0, 7); // YYYY-MM
      const [y, m] = bucketKey.split('-').map(Number);
      label = `${MONTH_NAMES_SHORT[m - 1]} ${y}`;
    } else if (interval === 'week') {
      bucketKey = getWeekStartKey(dateKey);
      label = `Week of ${formatReadableDayKey(bucketKey)}`;
    } else {
      bucketKey = dateKey;
      label = formatReadableDayKey(dateKey);
    }

    if (!buckets.has(bucketKey)) {
      buckets.set(bucketKey, { key: bucketKey, label, total: 0, count: 0 });
    }
    const entry = buckets.get(bucketKey);
    entry.total += parseFloat(row.amount) || 0;
    entry.count += 1;
  });

  return Array.from(buckets.values()).sort((a, b) => a.key.localeCompare(b.key));
}

function buildComparisonSeries(allSales, filteredSales, filterState) {
  const { comparison, search, category, dateFrom, dateTo } = filterState;
  if (comparison === 'none') return null;

  // Apply only non-date filters (search & category) when looking up historical comparison window
  const baseRows = (allSales || []).filter(item => {
    const resolvedCategory = resolveSaleCategory(item);
    if (category && category !== 'all' && resolvedCategory.toLowerCase() !== category.toLowerCase()) return false;
    if (search) {
      const customer = String(item.customer_name || '').toLowerCase();
      const product = String(item.product_name || '').toLowerCase();
      const catLower = resolvedCategory.toLowerCase();
      if (!customer.includes(search) && !product.includes(search) && !catLower.includes(search)) return false;
    }
    return true;
  });

  if (comparison === 'month_over_month') {
    const allDates = (filteredSales.length ? filteredSales : baseRows)
      .map(r => toLocalDateKey(r.sale_date))
      .filter(Boolean)
      .sort();
    const anchorDate = allDates.length ? parseLocalDateKey(allDates[allDates.length - 1]) : new Date();
    const curYear = anchorDate.getFullYear();
    const curMonth = anchorDate.getMonth();
    const prevMonthDate = new Date(curYear, curMonth - 1, 1);
    const prevYear = prevMonthDate.getFullYear();
    const prevMonth = prevMonthDate.getMonth();

    const curPrefix = `${curYear}-${String(curMonth + 1).padStart(2, '0')}`;
    const prevPrefix = `${prevYear}-${String(prevMonth + 1).padStart(2, '0')}`;
    const curMonthLabel = `${MONTH_NAMES_SHORT[curMonth]} ${curYear}`;
    const prevMonthLabel = `${MONTH_NAMES_SHORT[prevMonth]} ${prevYear}`;

    const curMap = new Map();
    const prevMap = new Map();
    let curTotal = 0;
    let prevTotal = 0;
    let curCount = 0;
    let prevCount = 0;

    baseRows.forEach(row => {
      const dk = toLocalDateKey(row.sale_date);
      if (!dk) return;
      const dayNum = Number(dk.slice(8, 10));
      const amt = parseFloat(row.amount) || 0;
      if (dk.startsWith(curPrefix)) {
        curMap.set(dayNum, (curMap.get(dayNum) || 0) + amt);
        curTotal += amt;
        curCount += 1;
      } else if (dk.startsWith(prevPrefix)) {
        prevMap.set(dayNum, (prevMap.get(dayNum) || 0) + amt);
        prevTotal += amt;
        prevCount += 1;
      }
    });

    const activeDays = Array.from(new Set([...curMap.keys(), ...prevMap.keys()])).sort((a, b) => a - b);
    const labels = activeDays.map(d => `Day ${d}`);
    const curData = activeDays.map(d => curMap.get(d) || 0);
    const prevData = activeDays.map(d => prevMap.get(d) || 0);

    return {
      mode: 'month_over_month',
      labels,
      currentLabel: `${curMonthLabel} (₱)`,
      previousLabel: `${prevMonthLabel} (₱)`,
      currentData: curData,
      previousData: prevData,
      currentTotal: curTotal,
      previousTotal: prevTotal,
      currentCount: curCount,
      previousCount: prevCount,
      summaryTitle: `${curMonthLabel} vs. ${prevMonthLabel}`
    };
  }

  if (comparison === 'previous_period') {
    const validDates = (filteredSales.length ? filteredSales : baseRows)
      .map(r => toLocalDateKey(r.sale_date))
      .filter(Boolean)
      .sort();
    const startKey = dateFrom || (validDates.length ? validDates[0] : toLocalDateKey(new Date()));
    const endKey = dateTo || (validDates.length ? validDates[validDates.length - 1] : startKey);
    const startDate = parseLocalDateKey(startKey);
    const endDate = parseLocalDateKey(endKey);
    if (!startDate || !endDate || endDate < startDate) return null;

    const spanDays = Math.max(1, Math.round((endDate - startDate) / (1000 * 60 * 60 * 24)) + 1);
    const prevEndDate = new Date(startDate.getFullYear(), startDate.getMonth(), startDate.getDate() - 1);
    const prevStartDate = new Date(prevEndDate.getFullYear(), prevEndDate.getMonth(), prevEndDate.getDate() - (spanDays - 1));

    const prevStartKey = toLocalDateKey(prevStartDate);
    const prevEndKey = toLocalDateKey(prevEndDate);

    const curRows = baseRows.filter(r => {
      const dk = toLocalDateKey(r.sale_date);
      return dk >= startKey && dk <= endKey;
    });
    const prevRows = baseRows.filter(r => {
      const dk = toLocalDateKey(r.sale_date);
      return dk >= prevStartKey && dk <= prevEndKey;
    });

    const curAgg = aggregateSalesChronologically(curRows, 'day');
    const prevAgg = aggregateSalesChronologically(prevRows, 'day');

    const curTotal = curRows.reduce((s, r) => s + (parseFloat(r.amount) || 0), 0);
    const prevTotal = prevRows.reduce((s, r) => s + (parseFloat(r.amount) || 0), 0);

    const maxPoints = Math.max(curAgg.length, prevAgg.length, 1);
    const labels = [];
    const curData = [];
    const prevData = [];
    for (let i = 0; i < maxPoints; i++) {
      const cItem = curAgg[i];
      const pItem = prevAgg[i];
      if (cItem && pItem) labels.push(`${cItem.label} vs ${pItem.label}`);
      else if (cItem) labels.push(cItem.label);
      else if (pItem) labels.push(`Prior: ${pItem.label}`);
      else labels.push(`Period ${i + 1}`);
      curData.push(cItem ? cItem.total : 0);
      prevData.push(pItem ? pItem.total : 0);
    }

    return {
      mode: 'previous_period',
      labels,
      currentLabel: `Selected Period (${formatReadableDayKey(startKey)} – ${formatReadableDayKey(endKey)})`,
      previousLabel: `Prior Period (${formatReadableDayKey(prevStartKey)} – ${formatReadableDayKey(prevEndKey)})`,
      currentData: curData,
      previousData: prevData,
      currentTotal: curTotal,
      previousTotal: prevTotal,
      currentCount: curRows.length,
      previousCount: prevRows.length,
      summaryTitle: `${formatReadableDayKey(startKey)} – ${formatReadableDayKey(endKey)} vs. Prior ${spanDays} Day(s)`
    };
  }

  return null;
}

function renderAdminSalesLineChart(filteredSales, allSales, filterState) {
  const ctx = document.getElementById('salesLineChart');
  if (!ctx) return;

  const noticeEl = document.getElementById('salesChartNotice');
  const compSummaryEl = document.getElementById('salesComparisonSummary');
  const setNotice = (msg, isWarning = false) => {
    if (!noticeEl) return;
    if (!msg) {
      noticeEl.style.display = 'none';
      noticeEl.textContent = '';
      return;
    }
    noticeEl.style.display = 'block';
    noticeEl.style.background = isWarning ? '#fffbeb' : '#eff6ff';
    noticeEl.style.color = isWarning ? '#92400e' : '#1e40af';
    noticeEl.style.borderColor = isWarning ? '#fde68a' : '#bfdbfe';
    noticeEl.innerHTML = msg;
  };

  if (window.salesLineChartInstance) {
    window.salesLineChartInstance.destroy();
    window.salesLineChartInstance = null;
  }

  const compSeries = buildComparisonSeries(allSales, filteredSales, filterState);
  if (compSeries) {
    if (compSummaryEl) {
      const diff = compSeries.currentTotal - compSeries.previousTotal;
      const pctText = compSeries.previousTotal > 0
        ? `${diff >= 0 ? '+' : ''}${((diff / compSeries.previousTotal) * 100).toFixed(1)}%`
        : (compSeries.currentTotal > 0 ? 'No sales recorded in prior period' : '0.0%');
      compSummaryEl.style.display = 'block';
      compSummaryEl.innerHTML = `
        <strong>${escapeHtml(compSeries.summaryTitle)}:</strong>
        Current Period: <strong>${formatCurrency(compSeries.currentTotal)}</strong> (${compSeries.currentCount} sale${compSeries.currentCount === 1 ? '' : 's'})
        &nbsp;|&nbsp;
        Prior Period: <strong>${formatCurrency(compSeries.previousTotal)}</strong> (${compSeries.previousCount} sale${compSeries.previousCount === 1 ? '' : 's'})
        &nbsp;|&nbsp;
        Difference: <strong style="color:${diff >= 0 ? '#059669' : '#d97706'};">${diff >= 0 ? '+' : ''}${formatCurrency(diff)} (${escapeHtml(pctText)})</strong>
      `;
    }

    if (compSeries.previousCount === 0) {
      setNotice('Note: The database has no recorded sales in the preceding comparison period. Only real recorded transactions are plotted (no sample points are fabricated).');
    } else {
      setNotice('');
    }

    window.salesLineChartInstance = new Chart(ctx, {
      type: 'line',
      data: {
        labels: compSeries.labels.length ? compSeries.labels : ['No Data'],
        datasets: [
          {
            label: compSeries.currentLabel,
            data: compSeries.currentData.length ? compSeries.currentData : [0],
            borderColor: '#2563eb',
            backgroundColor: 'rgba(37, 99, 235, 0.12)',
            borderWidth: 3,
            fill: true,
            tension: 0.35,
            pointBackgroundColor: '#2563eb',
            pointBorderColor: '#ffffff',
            pointBorderWidth: 2,
            pointRadius: 5,
            pointHoverRadius: 7
          },
          {
            label: compSeries.previousLabel,
            data: compSeries.previousData.length ? compSeries.previousData : [0],
            borderColor: '#64748b',
            backgroundColor: 'rgba(100, 116, 139, 0.06)',
            borderWidth: 2,
            borderDash: [6, 4],
            fill: false,
            tension: 0.35,
            pointBackgroundColor: '#64748b',
            pointBorderColor: '#ffffff',
            pointBorderWidth: 2,
            pointRadius: 4,
            pointHoverRadius: 6
          }
        ]
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        interaction: { mode: 'index', intersect: false },
        plugins: {
          legend: { display: true, position: 'top' },
          tooltip: {
            callbacks: {
              label: context => `${context.dataset.label}: ${formatCurrency(context.parsed.y)}`
            }
          }
        },
        scales: {
          x: { title: { display: true, text: 'Comparison Period Timeline', color: '#4b5563', font: { weight: '600' } } },
          y: {
            beginAtZero: true,
            title: { display: true, text: 'Sales Revenue (₱)', color: '#4b5563', font: { weight: '600' } },
            ticks: { callback: val => '₱' + Number(val).toLocaleString('en-US') }
          }
        }
      }
    });
    return;
  }

  if (compSummaryEl) {
    compSummaryEl.style.display = 'none';
    compSummaryEl.innerHTML = '';
  }

  if (!filteredSales || filteredSales.length === 0) {
    setNotice('No sales records match the current selection. Adjust your filters or add sales records to view the revenue line graph.', true);
    window.salesLineChartInstance = new Chart(ctx, {
      type: 'line',
      data: { labels: ['No matching records'], datasets: [{ label: 'Sales Revenue (₱)', data: [0], borderColor: '#9ca3af', backgroundColor: 'rgba(156,163,175,0.1)', borderWidth: 2 }] },
      options: { responsive: true, maintainAspectRatio: false, scales: { y: { beginAtZero: true, ticks: { callback: val => '₱' + Number(val).toLocaleString('en-US') } } } }
    });
    return;
  }

  const effectiveInterval = chooseEffectiveSalesInterval(filteredSales, filterState.interval);
  const aggregated = aggregateSalesChronologically(filteredSales, effectiveInterval);
  const distinctDays = new Set(filteredSales.map(s => toLocalDateKey(s.sale_date)).filter(Boolean)).size;

  const intervalLabelMap = { day: 'Daily', week: 'Weekly', month: 'Monthly' };
  const intervalTitle = intervalLabelMap[effectiveInterval] || 'Chronological';

  if (aggregated.length === 1) {
    if (effectiveInterval === 'month' && distinctDays > 1) {
      setNotice(`All ${filteredSales.length} displayed sales records occurred within <strong>${escapeHtml(aggregated[0].label)}</strong> across ${distinctDays} dates. Switch <strong>Time Interval</strong> to <strong>Daily</strong> or <strong>Auto</strong> to inspect day-by-day revenue movement.`);
    } else {
      setNotice(`Showing actual recorded sales data for <strong>${escapeHtml(aggregated[0].label)}</strong> (${filteredSales.length} transaction${filteredSales.length === 1 ? '' : 's'}). A multi-point historical trend line requires sales records across multiple ${effectiveInterval === 'day' ? 'dates' : effectiveInterval + 's'}.`);
    }
  } else if (filterState.interval === 'auto') {
    setNotice(`Automatically grouped by <strong>${intervalTitle}</strong> interval (${aggregated.length} chronological data points across ${filteredSales.length} sales records).`);
  } else {
    setNotice('');
  }

  const labels = aggregated.map(b => b.label);
  const amounts = aggregated.map(b => Math.round(b.total * 100) / 100);
  const counts = aggregated.map(b => b.count);

  window.salesLineChartInstance = new Chart(ctx, {
    type: 'line',
    data: {
      labels,
      datasets: [
        {
          label: `${intervalTitle} Sales Revenue (₱)`,
          data: amounts,
          borderColor: '#2563eb',
          backgroundColor: 'rgba(37, 99, 235, 0.12)',
          borderWidth: 3,
          fill: true,
          tension: 0.35,
          pointBackgroundColor: '#2563eb',
          pointBorderColor: '#ffffff',
          pointBorderWidth: 2,
          pointRadius: 5,
          pointHoverRadius: 7
        }
      ]
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      interaction: { mode: 'index', intersect: false },
      plugins: {
        legend: { display: true, position: 'top' },
        tooltip: {
          callbacks: {
            label: context => {
              const idx = context.dataIndex;
              const txCount = counts[idx] || 0;
              return `Revenue: ${formatCurrency(context.parsed.y)} (${txCount} sale${txCount === 1 ? '' : 's'})`;
            }
          }
        }
      },
      scales: {
        x: {
          title: { display: true, text: `Timeline (${intervalTitle})`, color: '#4b5563', font: { weight: '600' } }
        },
        y: {
          beginAtZero: true,
          title: { display: true, text: 'Sales Revenue (₱)', color: '#4b5563', font: { weight: '600' } },
          ticks: { callback: val => '₱' + Number(val).toLocaleString('en-US') }
        }
      }
    }
  });
}

function applyAdminSalesView() {
  const filterState = getAdminSalesFilterState();
  const filteredSales = filterAndSortAdminSales(adminSalesCache, filterState);
  renderAdminSalesTableRows(filteredSales, adminSalesCache.length);
  updateAdminSalesSummaryCards(filteredSales, adminSalesCache, filterState);
  renderAdminSalesLineChart(filteredSales, adminSalesCache, filterState);
}

export function initAdminSalesControls() {
  if (adminSalesControlsInitialized) return;
  const searchEl = document.getElementById('adminSalesSearch');
  if (!searchEl) return;
  adminSalesControlsInitialized = true;

  const bindChange = (id, evt = 'change') => {
    const el = document.getElementById(id);
    if (el) el.addEventListener(evt, () => applyAdminSalesView());
  };

  bindChange('adminSalesSearch', 'input');
  bindChange('adminSalesCategoryFilter', 'change');
  bindChange('adminSalesDateFrom', 'change');
  bindChange('adminSalesDateTo', 'change');
  bindChange('adminSalesSort', 'change');
  bindChange('salesChartInterval', 'change');
  bindChange('salesChartComparison', 'change');

  const resetBtn = document.getElementById('adminSalesResetFilters');
  if (resetBtn) {
    resetBtn.addEventListener('click', () => {
      const s = document.getElementById('adminSalesSearch');
      const c = document.getElementById('adminSalesCategoryFilter');
      const df = document.getElementById('adminSalesDateFrom');
      const dt = document.getElementById('adminSalesDateTo');
      const sort = document.getElementById('adminSalesSort');
      const interval = document.getElementById('salesChartInterval');
      const comp = document.getElementById('salesChartComparison');
      if (s) s.value = '';
      if (c) c.value = 'all';
      if (df) df.value = '';
      if (dt) dt.value = '';
      if (sort) sort.value = 'date-desc';
      if (interval) interval.value = 'auto';
      if (comp) comp.value = 'none';
      applyAdminSalesView();
    });
  }
}

// =============================================================================
// MANAGER SALES — FILTER / CHART PIPELINE
// Mirrors the Admin pipeline but targets manager-specific element IDs.
// =============================================================================

async function ensureManagerInventoryCategoryMap() {
  if (managerInventoryCategoriesLoaded) return;
  try {
    const result = await API.getInventory();
    if (!result || !result.success || !Array.isArray(result.data)) return;
    result.data.forEach(item => {
      if (item.category) {
        const cat = String(item.category).trim();
        if (cat) {
          managerInventoryCategoryById.set(String(item.id), cat);
          managerInventoryCategoryByName.set(String(item.name || '').toLowerCase(), cat);
        }
      }
    });
    managerInventoryCategoriesLoaded = true;
  } catch { /* non-critical */ }
}

function populateManagerSalesCategoryDropdown(salesRows) {
  const select = document.getElementById('managerSalesCategoryFilter');
  if (!select) return;
  const cats = new Set();
  (salesRows || []).forEach(s => {
    const c = resolveSaleCategory(s);
    if (c && c !== 'Uncategorized') cats.add(c);
  });
  const current = select.value;
  select.innerHTML = '<option value="all">All Categories</option>';
  [...cats].sort().forEach(c => {
    const opt = document.createElement('option');
    opt.value = c;
    opt.textContent = c;
    if (c === current) opt.selected = true;
    select.appendChild(opt);
  });
  if (!cats.has(current) && current !== 'all') select.value = 'all';
}

function getManagerSalesFilterState() {
  const searchEl = document.getElementById('managerSalesSearch');
  const categoryEl = document.getElementById('managerSalesCategoryFilter');
  const dateFromEl = document.getElementById('managerSalesDateFrom');
  const dateToEl = document.getElementById('managerSalesDateTo');
  const sortEl = document.getElementById('managerSalesSort');
  const intervalEl = document.getElementById('managerSalesChartInterval');
  const comparisonEl = document.getElementById('managerSalesChartComparison');

  const search = searchEl ? searchEl.value.trim().toLowerCase() : '';
  const category = categoryEl ? categoryEl.value : 'all';
  const dateFrom = dateFromEl ? dateFromEl.value : '';
  const dateTo = dateToEl ? dateToEl.value : '';
  const sort = sortEl ? sortEl.value : 'date-desc';
  const interval = intervalEl ? intervalEl.value : 'auto';
  const comparison = comparisonEl ? comparisonEl.value : 'none';

  const hasActiveFilters = Boolean(search || (category && category !== 'all') || dateFrom || dateTo);
  return { search, category, dateFrom, dateTo, sort, interval, comparison, hasActiveFilters };
}

function filterAndSortManagerSales(salesRows, filterState) {
  const { search, category, dateFrom, dateTo, sort } = filterState;

  const filtered = (salesRows || []).filter(item => {
    const resolvedCategory = resolveSaleCategory(item);
    if (category && category !== 'all' && resolvedCategory.toLowerCase() !== category.toLowerCase()) return false;
    const dateKey = toLocalDateKey(item.sale_date);
    if (dateFrom && (!dateKey || dateKey < dateFrom)) return false;
    if (dateTo && (!dateKey || dateKey > dateTo)) return false;
    if (search) {
      const customer = String(item.customer_name || '').toLowerCase();
      const product = String(item.product_name || '').toLowerCase();
      const catLower = resolvedCategory.toLowerCase();
      if (!customer.includes(search) && !product.includes(search) && !catLower.includes(search)) return false;
    }
    return true;
  });

  return [...filtered].sort((a, b) => {
    if (sort === 'date-asc' || sort === 'date-desc') {
      const da = toLocalDateKey(a.sale_date);
      const db = toLocalDateKey(b.sale_date);
      if (da !== db) return sort === 'date-asc' ? da.localeCompare(db) : db.localeCompare(da);
      return sort === 'date-asc' ? (Number(a.id) - Number(b.id)) : (Number(b.id) - Number(a.id));
    }
    if (sort === 'amount-desc' || sort === 'amount-asc') {
      const aa = parseFloat(a.amount) || 0;
      const ab = parseFloat(b.amount) || 0;
      if (aa !== ab) return sort === 'amount-asc' ? aa - ab : ab - aa;
      return Number(b.id) - Number(a.id);
    }
    if (sort === 'product-asc' || sort === 'product-desc') {
      const pa = String(a.product_name || '');
      const pb = String(b.product_name || '');
      const cmp = pa.localeCompare(pb, undefined, { sensitivity: 'base' });
      return sort === 'product-asc' ? cmp : -cmp;
    }
    if (sort === 'customer-asc' || sort === 'customer-desc') {
      const ca = String(a.customer_name || '');
      const cb = String(b.customer_name || '');
      const cmp = ca.localeCompare(cb, undefined, { sensitivity: 'base' });
      return sort === 'customer-asc' ? cmp : -cmp;
    }
    // default: date desc
    const da2 = toLocalDateKey(a.sale_date);
    const db2 = toLocalDateKey(b.sale_date);
    return db2.localeCompare(da2);
  });
}

function renderManagerSalesTableRows(filteredSales, allSalesCount) {
  const tbody = document.getElementById('managerSalesList');
  if (!tbody) return;
  tbody.innerHTML = '';

  if (!filteredSales || filteredSales.length === 0) {
    const emptyMsg = allSalesCount > 0
      ? 'No sales records match your selected filters.'
      : 'No sales records found';
    tbody.innerHTML = `<tr><td colspan="6" style="text-align:center;color:#9ca3af;padding:2rem;">${emptyMsg}</td></tr>`;
    return;
  }

  filteredSales.forEach(item => {
    const category = resolveSaleCategory(item);
    tbody.innerHTML += `
      <tr>
        <td>${formatDate(item.sale_date)}</td>
        <td>${escapeHtml(item.customer_name)}</td>
        <td>${formatSaleProduct(item)}</td>
        <td><span class="status-badge" style="background:#f3f4f6;color:#374151;font-weight:500;">${escapeHtml(category)}</span></td>
        <td>${formatCurrency(item.amount)}</td>
        <td><button class="action-btn edit" onclick="editManagerSalesRecord(${item.id})" title="Edit"><svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"></path><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"></path></svg> Edit</button></td>
      </tr>`;
  });
}

function updateManagerSalesSummaryCards(filteredSales, allSales, filterState = {}) {
  const setEl = (id, val) => { const el = document.getElementById(id); if (el) el.textContent = val; };
  const hasActiveFilters = Boolean(filterState && filterState.hasActiveFilters);

  const allCount = (allSales || []).length;
  const allTotal = (allSales || []).reduce((sum, s) => sum + (parseFloat(s.amount) || 0), 0);
  const allAvg = allCount > 0 ? allTotal / allCount : 0;

  const filteredCount = (filteredSales || []).length;
  const filteredTotal = (filteredSales || []).reduce((sum, s) => sum + (parseFloat(s.amount) || 0), 0);
  const filteredAvg = filteredCount > 0 ? filteredTotal / filteredCount : 0;

  setEl('managerTotalSales', formatCurrency(filteredTotal));
  setEl('managerTotalRecords', String(filteredCount));
  setEl('managerAverageSale', formatCurrency(filteredAvg));

  if (hasActiveFilters) {
    setEl('managerSalesFilterSummary', `Showing ${filteredCount} of ${allCount} sales records (filtered)`);
  } else {
    setEl('managerSalesFilterSummary', `Showing all ${allCount} sales record${allCount === 1 ? '' : 's'}`);
  }
}

function renderManagerSalesLineChart(filteredSales, allSales, filterState) {
  const ctx = document.getElementById('managerSalesLineChart');
  if (!ctx) return;

  const noticeEl = document.getElementById('managerSalesChartNotice');
  const compSummaryEl = document.getElementById('managerSalesComparisonSummary');
  const setNotice = (msg, isWarning = false) => {
    if (!noticeEl) return;
    if (!msg) { noticeEl.style.display = 'none'; noticeEl.textContent = ''; return; }
    noticeEl.style.display = 'block';
    noticeEl.style.background = isWarning ? '#fffbeb' : '#eff6ff';
    noticeEl.style.color = isWarning ? '#92400e' : '#1e40af';
    noticeEl.style.borderColor = isWarning ? '#fde68a' : '#bfdbfe';
    noticeEl.innerHTML = msg;
  };

  if (window.managerSalesLineChartInstance) {
    window.managerSalesLineChartInstance.destroy();
    window.managerSalesLineChartInstance = null;
  }

  const compSeries = buildComparisonSeries(allSales, filteredSales, filterState);
  if (compSeries) {
    if (compSummaryEl) {
      const diff = compSeries.currentTotal - compSeries.previousTotal;
      const pctText = compSeries.previousTotal > 0
        ? `${diff >= 0 ? '+' : ''}${((diff / compSeries.previousTotal) * 100).toFixed(1)}%`
        : (compSeries.currentTotal > 0 ? 'No sales recorded in prior period' : '0.0%');
      compSummaryEl.style.display = 'block';
      compSummaryEl.innerHTML = `
        <strong>${escapeHtml(compSeries.summaryTitle)}:</strong>
        Current Period: <strong>${formatCurrency(compSeries.currentTotal)}</strong> (${compSeries.currentCount} sale${compSeries.currentCount === 1 ? '' : 's'})
        &nbsp;|&nbsp;
        Prior Period: <strong>${formatCurrency(compSeries.previousTotal)}</strong> (${compSeries.previousCount} sale${compSeries.previousCount === 1 ? '' : 's'})
        &nbsp;|&nbsp;
        Difference: <strong style="color:${diff >= 0 ? '#059669' : '#d97706'};">${diff >= 0 ? '+' : ''}${formatCurrency(diff)} (${escapeHtml(pctText)})</strong>
      `;
    }
    if (compSeries.previousCount === 0) {
      setNotice('Note: The database has no recorded sales in the preceding comparison period. Only real recorded transactions are plotted (no sample points are fabricated).');
    } else {
      setNotice('');
    }
    window.managerSalesLineChartInstance = new Chart(ctx, {
      type: 'line',
      data: {
        labels: compSeries.labels.length ? compSeries.labels : ['No Data'],
        datasets: [
          {
            label: compSeries.currentLabel,
            data: compSeries.currentData.length ? compSeries.currentData : [0],
            borderColor: '#7c3aed', backgroundColor: 'rgba(124,58,237,0.12)',
            borderWidth: 3, fill: true, tension: 0.35,
            pointBackgroundColor: '#7c3aed', pointBorderColor: '#ffffff',
            pointBorderWidth: 2, pointRadius: 5, pointHoverRadius: 7
          },
          {
            label: compSeries.previousLabel,
            data: compSeries.previousData.length ? compSeries.previousData : [0],
            borderColor: '#64748b', backgroundColor: 'rgba(100,116,139,0.06)',
            borderWidth: 2, borderDash: [6, 4], fill: false, tension: 0.35,
            pointBackgroundColor: '#64748b', pointBorderColor: '#ffffff',
            pointBorderWidth: 2, pointRadius: 4, pointHoverRadius: 6
          }
        ]
      },
      options: {
        responsive: true, maintainAspectRatio: false,
        interaction: { mode: 'index', intersect: false },
        plugins: {
          legend: { display: true, position: 'top' },
          tooltip: { callbacks: { label: ctx => `${ctx.dataset.label}: ${formatCurrency(ctx.parsed.y)}` } }
        },
        scales: {
          x: { title: { display: true, text: 'Comparison Period Timeline', color: '#4b5563', font: { weight: '600' } } },
          y: { beginAtZero: true, title: { display: true, text: 'Sales Revenue (₱)', color: '#4b5563', font: { weight: '600' } }, ticks: { callback: val => '₱' + Number(val).toLocaleString('en-US') } }
        }
      }
    });
    return;
  }

  if (compSummaryEl) { compSummaryEl.style.display = 'none'; compSummaryEl.innerHTML = ''; }

  if (!filteredSales || filteredSales.length === 0) {
    setNotice('No sales records match the current selection. Adjust your filters or add sales records to view the revenue line graph.', true);
    window.managerSalesLineChartInstance = new Chart(ctx, {
      type: 'line',
      data: { labels: ['No matching records'], datasets: [{ label: 'Sales Revenue (₱)', data: [0], borderColor: '#9ca3af', backgroundColor: 'rgba(156,163,175,0.1)', borderWidth: 2 }] },
      options: { responsive: true, maintainAspectRatio: false, scales: { y: { beginAtZero: true, ticks: { callback: val => '₱' + Number(val).toLocaleString('en-US') } } } }
    });
    return;
  }

  const effectiveInterval = chooseEffectiveSalesInterval(filteredSales, filterState.interval);
  const aggregated = aggregateSalesChronologically(filteredSales, effectiveInterval);
  const distinctDays = new Set(filteredSales.map(s => toLocalDateKey(s.sale_date)).filter(Boolean)).size;

  const intervalLabelMap = { day: 'Daily', week: 'Weekly', month: 'Monthly' };
  const intervalTitle = intervalLabelMap[effectiveInterval] || 'Chronological';

  if (aggregated.length === 1) {
    if (effectiveInterval === 'month' && distinctDays > 1) {
      setNotice(`All ${filteredSales.length} displayed sales records occurred within <strong>${escapeHtml(aggregated[0].label)}</strong> across ${distinctDays} dates. Switch <strong>Time Interval</strong> to <strong>Daily</strong> or <strong>Auto</strong> to inspect day-by-day revenue movement.`);
    } else {
      setNotice(`Showing actual recorded sales data for <strong>${escapeHtml(aggregated[0].label)}</strong> (${filteredSales.length} transaction${filteredSales.length === 1 ? '' : 's'}). A multi-point historical trend line requires sales records across multiple ${effectiveInterval === 'day' ? 'dates' : effectiveInterval + 's'}.`);
    }
  } else if (filterState.interval === 'auto') {
    setNotice(`Automatically grouped by <strong>${intervalTitle}</strong> interval (${aggregated.length} chronological data points across ${filteredSales.length} sales records).`);
  } else {
    setNotice('');
  }

  const labels = aggregated.map(b => b.label);
  const amounts = aggregated.map(b => Math.round(b.total * 100) / 100);
  const counts = aggregated.map(b => b.count);

  window.managerSalesLineChartInstance = new Chart(ctx, {
    type: 'line',
    data: {
      labels,
      datasets: [{
        label: `${intervalTitle} Sales Revenue (₱)`,
        data: amounts,
        borderColor: '#7c3aed', backgroundColor: 'rgba(124,58,237,0.12)',
        borderWidth: 3, fill: true, tension: 0.35,
        pointBackgroundColor: '#7c3aed', pointBorderColor: '#ffffff',
        pointBorderWidth: 2, pointRadius: 5, pointHoverRadius: 7
      }]
    },
    options: {
      responsive: true, maintainAspectRatio: false,
      interaction: { mode: 'index', intersect: false },
      plugins: {
        legend: { display: true, position: 'top' },
        tooltip: {
          callbacks: {
            label: context => {
              const idx = context.dataIndex;
              const txCount = counts[idx] || 0;
              return `Revenue: ${formatCurrency(context.parsed.y)} (${txCount} sale${txCount === 1 ? '' : 's'})`;
            }
          }
        }
      },
      scales: {
        x: { title: { display: true, text: `Timeline (${intervalTitle})`, color: '#4b5563', font: { weight: '600' } } },
        y: { beginAtZero: true, title: { display: true, text: 'Sales Revenue (₱)', color: '#4b5563', font: { weight: '600' } }, ticks: { callback: val => '₱' + Number(val).toLocaleString('en-US') } }
      }
    }
  });
}

function applyManagerSalesView() {
  const filterState = getManagerSalesFilterState();
  const filteredSales = filterAndSortManagerSales(managerSalesCache, filterState);
  renderManagerSalesTableRows(filteredSales, managerSalesCache.length);
  updateManagerSalesSummaryCards(filteredSales, managerSalesCache, filterState);
  renderManagerSalesLineChart(filteredSales, managerSalesCache, filterState);
}

export function initManagerSalesControls() {
  if (managerSalesControlsInitialized) return;
  const searchEl = document.getElementById('managerSalesSearch');
  if (!searchEl) return;
  managerSalesControlsInitialized = true;

  const bindChange = (id, evt = 'change') => {
    const el = document.getElementById(id);
    if (el) el.addEventListener(evt, () => applyManagerSalesView());
  };

  bindChange('managerSalesSearch', 'input');
  bindChange('managerSalesCategoryFilter', 'change');
  bindChange('managerSalesDateFrom', 'change');
  bindChange('managerSalesDateTo', 'change');
  bindChange('managerSalesSort', 'change');
  bindChange('managerSalesChartInterval', 'change');
  bindChange('managerSalesChartComparison', 'change');

  const resetBtn = document.getElementById('managerSalesResetFilters');
  if (resetBtn) {
    resetBtn.addEventListener('click', () => {
      const s = document.getElementById('managerSalesSearch');
      const c = document.getElementById('managerSalesCategoryFilter');
      const df = document.getElementById('managerSalesDateFrom');
      const dt = document.getElementById('managerSalesDateTo');
      const sort = document.getElementById('managerSalesSort');
      const interval = document.getElementById('managerSalesChartInterval');
      const comp = document.getElementById('managerSalesChartComparison');
      if (s) s.value = '';
      if (c) c.value = 'all';
      if (df) df.value = '';
      if (dt) dt.value = '';
      if (sort) sort.value = 'date-desc';
      if (interval) interval.value = 'auto';
      if (comp) comp.value = 'none';
      applyManagerSalesView();
    });
  }
}

// =============================================================================
// SALES RECORDS
// =============================================================================
export async function loadSalesList() {
  try {
    initAdminSalesControls();
    await ensureAdminInventoryCategoryMap();
    const result = await API.getSales();
    if (result.success) {
      adminSalesCache = Array.isArray(result.data) ? result.data : [];
      populateAdminSalesCategoryDropdown(adminSalesCache);
      applyAdminSalesView();
    }
  } catch (error) {
    showToast('❌ Failed to load sales records', 'error');
  }
}

export async function loadSalesAnalytics() {
  try {
    initAdminSalesControls();
    await ensureAdminInventoryCategoryMap();
    const result = await API.getSales();
    if (result.success) {
      adminSalesCache = Array.isArray(result.data) ? result.data : [];
      populateAdminSalesCategoryDropdown(adminSalesCache);
      applyAdminSalesView();
    }
  } catch (error) {
    console.error('Load sales analytics error:', error);
  }
}

export async function loadStaffSalesList() {
  try {
    const result = await API.getSales();
    if (result.success) {
      const tbody = document.getElementById('staffSalesList');
      if (!tbody) return;
      tbody.innerHTML = '';
      if (result.data.length === 0) { tbody.innerHTML = '<tr><td colspan="5" style="text-align:center;color:#9ca3af;">No sales records found</td></tr>'; return; }
      result.data.forEach(item => {
        tbody.innerHTML += `
          <tr>
            <td>${formatDate(item.sale_date)}</td>
            <td>${item.customer_name}</td>
            <td>${formatSaleProduct(item)}</td>
            <td>${formatCurrency(item.amount)}</td>
            <td><button class="action-btn edit" onclick="editStaffSalesRecord(${item.id})" title="Edit"><svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"></path><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"></path></svg> Edit</button></td>
          </tr>`;
      });
    }
  } catch (error) { showToast('❌ Failed to load sales records', 'error'); }
}

export async function loadManagerSalesList() {
  try {
    initManagerSalesControls();
    await ensureManagerInventoryCategoryMap();
    const result = await API.getSales();
    if (result.success) {
      managerSalesCache = Array.isArray(result.data) ? result.data : [];
      populateManagerSalesCategoryDropdown(managerSalesCache);
      applyManagerSalesView();
    }
  } catch (error) { showToast('❌ Failed to load sales records', 'error'); }
}

export async function editStaffSalesRecord(id) {
  await openSalesEditForm(id, {
    idField: 'editSalesId',
    customer: 'editSalesCustomer',
    product: 'editSalesProduct',
    quantity: 'editSalesQuantity',
    amount: 'editSalesAmount',
    date: 'editSalesDate',
    modal: 'editSalesModal'
  });
}

export async function editManagerSalesRecord(id) {
  await openSalesEditForm(id, {
    idField: 'managerEditSalesId',
    customer: 'managerEditSalesCustomer',
    product: 'managerEditSalesProduct',
    quantity: 'managerEditSalesQuantity',
    amount: 'managerEditSalesAmount',
    date: 'managerEditSalesDate',
    modal: 'managerEditSalesModal'
  });
}

export async function loadStaffSalesAnalytics() {
  try {
    const result = await API.getSales();
    if (result.success && result.data.length > 0) {
      const salesData = result.data;
      const totalRecords = salesData.length;
      const totalSales = salesData.reduce((sum, s) => sum + parseFloat(s.amount), 0);
      const averageSale = totalSales / totalRecords;
      const setEl = (id, val) => { const el = document.getElementById(id); if (el) el.textContent = val; };
      setEl('staffTotalSales', formatCurrency(totalSales));
      setEl('staffTotalRecords', totalRecords.toString());
      setEl('staffAverageSale', formatCurrency(averageSale));
      await loadStaffMonthlySalesCharts();
    }
  } catch (error) { console.error('Load staff sales analytics error:', error); }
}

export async function loadManagerSalesAnalytics() {
  try {
    initManagerSalesControls();
    await ensureManagerInventoryCategoryMap();
    const result = await API.getSales();
    if (result.success) {
      managerSalesCache = Array.isArray(result.data) ? result.data : [];
      populateManagerSalesCategoryDropdown(managerSalesCache);
      applyManagerSalesView();
    }
  } catch (error) { console.error('Load manager sales analytics error:', error); }
}

async function loadStaffMonthlySalesCharts() {
  try {
    const response = await fetch(`${API_URL}/sales/monthly`);
    const monthlyData = await response.json();
    if (monthlyData && monthlyData.length > 0) {
      const monthNames = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
      const labels = monthlyData.map(item => `${monthNames[item.month - 1]} ${item.year}`);
      const amounts = monthlyData.map(item => parseFloat(item.total));
      renderStaffRevenueBarChart(labels, amounts);
      renderStaffSalesLineChart(labels, amounts);
    }
  } catch (error) { console.error('Load staff monthly sales error:', error); }
}

async function loadManagerMonthlySalesCharts() {
  // This function is kept for compatibility but is no longer called.
  // The manager sales chart is now handled by renderManagerSalesLineChart via applyManagerSalesView().
}

function renderStaffRevenueBarChart(labels, data) {
  const ctx = document.getElementById('staffRevenueBarChart');
  if (!ctx) return;
  if (window.staffRevenueBarChartInstance) window.staffRevenueBarChartInstance.destroy();
  window.staffRevenueBarChartInstance = new Chart(ctx, {
    type: 'bar',
    data: { labels, datasets: [{ label: 'Monthly Revenue (₱)', data, backgroundColor: 'rgba(220,20,60,0.7)', borderColor: '#DC143C', borderWidth: 2, borderRadius: 6 }] },
    options: { responsive: true, maintainAspectRatio: true, plugins: { legend: { display: false } }, scales: { y: { beginAtZero: true, ticks: { callback: val => '₱' + val.toLocaleString('en-US') } } } }
  });
}

function renderStaffSalesLineChart(labels, data) {
  const ctx = document.getElementById('staffSalesLineChart');
  if (!ctx) return;
  if (window.staffSalesLineChartInstance) window.staffSalesLineChartInstance.destroy();
  window.staffSalesLineChartInstance = new Chart(ctx, {
    type: 'line',
    data: { labels, datasets: [{ label: 'Sales Trend (₱)', data, backgroundColor: 'rgba(220,20,60,0.1)', borderColor: '#DC143C', borderWidth: 3, fill: true, tension: 0.4, pointBackgroundColor: '#DC143C', pointBorderColor: '#fff', pointBorderWidth: 2, pointRadius: 5, pointHoverRadius: 7 }] },
    options: { responsive: true, maintainAspectRatio: true, plugins: { legend: { display: false } }, scales: { y: { beginAtZero: true, ticks: { callback: val => '₱' + val.toLocaleString('en-US') } } } }
  });
}

// =============================================================================
// SALES - INVENTORY PRODUCT DROPDOWN + STOCK DEDUCTION (Admin and Staff)
// Both dashboards read the SAME inventory table through GET /inventory, and the
// backend (Postgres functions) deducts / restores stock atomically.
// =============================================================================
const SALES_QTY_FIELD = {
  salesProductName: 'salesQuantity',
  salesProduct: 'salesQuantity',
  editAdminSalesProduct: 'editAdminSalesQuantity',
  editSalesProduct: 'editSalesQuantity',
  managerSalesProduct: 'managerSalesQuantity',
  managerEditSalesProduct: 'managerEditSalesQuantity'
};

// Product dropdown -> { quantity input, amount input }.
// Amount = the inventory item's price x quantity (Admin, Manager and Staff). The Amount field is
// read-only; the server recomputes the same value from the inventory price when the sale is saved.
const SALES_AMOUNT_FIELDS = {
  salesProductName: { qty: 'salesQuantity', amount: 'salesAmount' },
  salesProduct: { qty: 'salesQuantity', amount: 'salesAmount' },
  editAdminSalesProduct: { qty: 'editAdminSalesQuantity', amount: 'editAdminSalesAmount' },
  editSalesProduct: { qty: 'editSalesQuantity', amount: 'editSalesAmount' },
  managerSalesProduct: { qty: 'managerSalesQuantity', amount: 'managerSalesAmount' },
  managerEditSalesProduct: { qty: 'managerEditSalesQuantity', amount: 'managerEditSalesAmount' }
};

function setSalesAmountLocked(amountEl, locked) {
  amountEl.readOnly = locked;
  amountEl.style.backgroundColor = locked ? '#f3f4f6' : '';
  amountEl.style.cursor = locked ? 'not-allowed' : '';
}

function applySalesAutoAmount(selectId) {
  const fields = SALES_AMOUNT_FIELDS[selectId];
  const select = document.getElementById(selectId);
  const amountEl = fields ? document.getElementById(fields.amount) : null;
  if (!fields || !select || !amountEl) return;
  // Older record that is not linked to an inventory item: keep its amount editable, as before
  if (select.value === '__keep__') { setSalesAmountLocked(amountEl, false); return; }
  setSalesAmountLocked(amountEl, true);
  const item = (salesInventoryItems[selectId] || {})[select.value];
  if (!item) { amountEl.value = ''; return; }
  updateSalesStockHint(selectId); // refresh the stock hint, then add the price note below
  const hint = document.getElementById(selectId + 'Hint');
  const addHint = (text) => { if (hint) hint.textContent = (hint.textContent ? hint.textContent + ' · ' : '') + text; };
  const price = getInventoryUnitPrice(item);
  if (!price) {
    amountEl.value = '';
    addHint('No price set for this item. Ask the Admin or Manager to add it in Inventory.');
    return;
  }
  const qty = Number(document.getElementById(fields.qty).value);
  amountEl.value = Number.isInteger(qty) && qty >= 1 ? (price * qty).toFixed(2) : '';
  addHint(`Price: ${formatCurrency(price)} each`);
}

const salesInventoryItems = {};

 // selectId -> { inventoryId: item } (used for the stock hint)
const saleRequestIds = {};

      // 'admin' | 'staff' -> id that stops duplicate submissions
const saleSubmitting = {};

      // formId -> true while a request is in flight

function newSaleRequestId() {
  if (window.crypto && typeof window.crypto.randomUUID === 'function') return window.crypto.randomUUID();
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, c => {
    const r = Math.random() * 16 | 0;
    return (c === 'x' ? r : (r & 0x3 | 0x8)).toString(16);
  });
}

// Product cell for the All Sales Records table (adds "× qty" for sales that deducted stock)
function formatSaleProduct(item) {
  const qty = item.stock_deducted && item.quantity ? ` <span style="color:#6b7280;">× ${item.quantity}</span>` : '';
  return `${item.product_name}${qty}`;
}

function updateSalesStockHint(selectId) {
  const select = document.getElementById(selectId);
  if (!select) return;
  const hint = document.getElementById(selectId + 'Hint');
  const qtyInput = document.getElementById(SALES_QTY_FIELD[selectId]);
  const isKeep = select.value === '__keep__';
  if (qtyInput) qtyInput.disabled = isKeep;
  const item = (salesInventoryItems[selectId] || {})[select.value];
  if (!item) {
    if (hint) hint.textContent = isKeep ? 'Stock will not change for this older record.' : '';
    if (qtyInput) qtyInput.removeAttribute('max');
    return;
  }
  let available = parseInt(item.quantity, 10) || 0;
  if (select.dataset.extraId && String(select.dataset.extraId) === String(item.id)) {
    available += parseInt(select.dataset.extraQty, 10) || 0; // units this sale already holds
  }
  if (hint) hint.textContent = available > 0 ? `Available stock: ${available}` : 'Out of stock';
  if (qtyInput) qtyInput.max = String(Math.max(available, 1));
}

// Fills a <select> with the CURRENT inventory records (never a hardcoded list).
export async function loadSalesProductOptions(selectId, opts = {}) {
  const select = document.getElementById(selectId);
  if (!select) return false;
  const previous = select.value;
  select.disabled = true;
  select.innerHTML = '';
  const loading = document.createElement('option');
  loading.value = '';
  loading.textContent = 'Loading inventory...';
  select.appendChild(loading);
  select.dataset.extraId = opts.extraId != null ? String(opts.extraId) : '';
  select.dataset.extraQty = opts.extraQty != null ? String(opts.extraQty) : '0';
  if (!select.dataset.bound) {
    select.addEventListener('change', () => updateSalesStockHint(selectId));
    select.dataset.bound = '1';
  }
  const amountFields = SALES_AMOUNT_FIELDS[selectId];
  if (amountFields && !select.dataset.amountBound) {
    const qtyInput = document.getElementById(amountFields.qty);
    select.addEventListener('change', () => applySalesAutoAmount(selectId));
    if (qtyInput) qtyInput.addEventListener('input', () => applySalesAutoAmount(selectId));
    select.dataset.amountBound = '1';
  }
  try {
    const result = await API.getInventory();
    if (!result || !result.success || !Array.isArray(result.data)) throw new Error((result && result.message) || 'Invalid inventory response');
    const items = result.data.slice().sort((a, b) => String(a.name).localeCompare(String(b.name)));
    salesInventoryItems[selectId] = {};
    select.innerHTML = '';

    const placeholder = document.createElement('option');
    placeholder.value = '';
    placeholder.textContent = items.length ? 'Select an available inventory item' : 'No inventory items available';
    select.appendChild(placeholder);

    if (opts.keepName) {
      const keep = document.createElement('option');
      keep.value = '__keep__';
      keep.textContent = `Keep current: ${opts.keepName} (stock will not change)`;
      select.appendChild(keep);
      select.dataset.keepName = opts.keepName;
    }

    items.forEach(item => {
      salesInventoryItems[selectId][item.id] = item;
      const qty = parseInt(item.quantity, 10) || 0;
      const isCurrent = opts.extraId != null && String(opts.extraId) === String(item.id);
      const option = document.createElement('option');
      option.value = String(item.id);
      option.textContent = `${item.name}${item.item_code ? ' (' + item.item_code + ')' : ''} — ${qty > 0 ? qty + ' in stock' : 'Out of stock'}`;
      if (qty <= 0 && !isCurrent) option.disabled = true;
      select.appendChild(option);
    });

    const wanted = opts.selectedId != null ? String(opts.selectedId) : (opts.keepName ? '__keep__' : previous);
    select.value = Array.from(select.options).some(o => o.value === wanted && !o.disabled) ? wanted : '';
    select.disabled = false;
    updateSalesStockHint(selectId);
    applySalesAutoAmount(selectId);
    return true;
  } catch (error) {
    console.error('Load sales product options error:', error);
    select.innerHTML = '';
    const failed = document.createElement('option');
    failed.value = '';
    failed.textContent = 'Unable to load inventory items';
    select.appendChild(failed);
    select.disabled = false;
    showToast('❌ Unable to load inventory items. Please close and reopen this form to try again.', 'error');
    return false;
  }
}

export function openAddSalesModal() {
  document.getElementById('salesForm').reset();
  saleRequestIds.admin = newSaleRequestId();
  showModal('salesModal');
  loadSalesProductOptions('salesProductName');
}

// Shared "add sale" submit for the Admin modal and the Staff form.
async function submitNewSale(cfg) {
  if (saleSubmitting[cfg.formId]) return; // a request is already running
  const form = document.getElementById(cfg.formId);
  const btn = form ? form.querySelector('button[type="submit"]') : null;
  const select = document.getElementById(cfg.productId);
  const inventoryId = select ? parseInt(select.value, 10) : NaN;
  if (!inventoryId) { showToast('Please select a product from the inventory list', 'warning'); return; }
  const quantity = Number(document.getElementById(cfg.quantityId).value);
  if (!Number.isInteger(quantity) || quantity < 1) { showToast('Quantity must be a positive whole number', 'warning'); return; }
  const chosenItem = (salesInventoryItems[cfg.productId] || {})[inventoryId];
  if (!getInventoryUnitPrice(chosenItem)) { showToast('This item has no price yet. Ask the Admin or Manager to set its price in Inventory.', 'warning'); return; }
  const amount = parseFloat(document.getElementById(cfg.amountId).value);
  if (!(amount > 0)) { showToast('Please enter a valid amount', 'warning'); return; }
  const dateField = document.getElementById(cfg.dateId);
  if (!saleRequestIds[cfg.key]) saleRequestIds[cfg.key] = newSaleRequestId();

  const data = {
    customer_name: document.getElementById(cfg.customerId).value.trim(),
    inventory_id: inventoryId,
    quantity,
    amount,
    sale_date: dateField && dateField.value ? dateField.value : new Date().toISOString().split('T')[0],
    request_id: saleRequestIds[cfg.key]
  };

  saleSubmitting[cfg.formId] = true;
  if (btn) btn.disabled = true;
  try {
    const result = await API.createSales(data);
    if (result.success) {
      showToast(result.message || 'Sales record added successfully', 'success');
      saleRequestIds[cfg.key] = null;
      try { await cfg.onSuccess(); } catch (refreshError) { console.error('Refresh after sale failed:', refreshError); }
    } else {
      showToast('❌ ' + result.message, 'error');
      saleRequestIds[cfg.key] = null; // the server rejected it, so nothing was saved
      if (['INSUFFICIENT_STOCK', 'OUT_OF_STOCK', 'ITEM_NOT_FOUND'].includes(result.code)) loadSalesProductOptions(cfg.productId);
    }
  } catch (error) {
    // Outcome unknown (network error): keep the same request id so a retry cannot deduct twice
    showToast('❌ Failed to save sales record', 'error');
  } finally {
    saleSubmitting[cfg.formId] = false;
    if (btn) btn.disabled = false;
  }
}

export function handleSalesSubmit(event) {
  event.preventDefault();
  return submitNewSale({
    key: 'admin',
    formId: 'salesForm',
    customerId: 'salesCustomerName',
    productId: 'salesProductName',
    quantityId: 'salesQuantity',
    amountId: 'salesAmount',
    dateId: 'salesDateInput',
    onSuccess: async () => {
      hideModal('salesModal');
      await Promise.all([loadSalesList(), loadInventoryList()]);
    }
  });
}

export function handleStaffSalesSubmit(event) {
  event.preventDefault();
  return submitNewSale({
    key: 'staff',
    formId: 'staffSalesForm',
    customerId: 'salesCustomer',
    productId: 'salesProduct',
    quantityId: 'salesQuantity',
    amountId: 'salesAmount',
    dateId: 'salesDate',
    onSuccess: async () => {
      document.getElementById('staffSalesForm').reset();
      await Promise.all([loadSalesProductOptions('salesProduct'), loadStaffSalesList(), loadStaffSalesAnalytics(), loadStaffInventoryList()]);
    }
  });
}

// Shared "edit sale" opener / submit for Admin and Staff.
async function openSalesEditForm(id, f) {
  try {
    const result = await API.getSales();
    if (!result.success) { showToast('❌ ' + (result.message || 'Failed to load sales record'), 'error'); return; }
    const record = result.data.find(item => item.id === id);
    if (!record) { showToast('Sales record not found', 'error'); return; }
    document.getElementById(f.idField).value = record.id;
    document.getElementById(f.customer).value = record.customer_name;
    document.getElementById(f.amount).value = record.amount;
    document.getElementById(f.date).value = record.sale_date.split('T')[0];
    const tracked = !!(record.stock_deducted && record.inventory_id);
    document.getElementById(f.quantity).value = tracked ? record.quantity : 1;
    showModal(f.modal);
    await loadSalesProductOptions(f.product, tracked
      ? { selectedId: record.inventory_id, extraId: record.inventory_id, extraQty: record.quantity }
      : { keepName: record.product_name });
  } catch (error) { showToast('❌ Failed to load sales record', 'error'); }
}

export async function submitSalesEdit(cfg) {
  if (saleSubmitting[cfg.formId]) return;
  const form = document.getElementById(cfg.formId);
  const btn = form ? form.querySelector('button[type="submit"]') : null;
  const select = document.getElementById(cfg.productId);
  const productValue = select ? select.value : '';
  const data = {
    customer_name: document.getElementById(cfg.customerId).value.trim(),
    amount: parseFloat(document.getElementById(cfg.amountId).value),
    sale_date: document.getElementById(cfg.dateId).value
  };
  if (!(data.amount > 0)) { showToast('Please enter a valid amount', 'warning'); return; }
  if (productValue === '__keep__') {
    data.product_name = select.dataset.keepName || '';
  } else {
    const inventoryId = parseInt(productValue, 10);
    if (!inventoryId) { showToast('Please select a product from the inventory list', 'warning'); return; }
    const quantity = Number(document.getElementById(cfg.quantityId).value);
    if (!Number.isInteger(quantity) || quantity < 1) { showToast('Quantity must be a positive whole number', 'warning'); return; }
    if (!getInventoryUnitPrice((salesInventoryItems[cfg.productId] || {})[inventoryId])) { showToast('This item has no price yet. Ask the Admin or Manager to set its price in Inventory.', 'warning'); return; }
    data.inventory_id = inventoryId;
    data.quantity = quantity;
  }
  saleSubmitting[cfg.formId] = true;
  if (btn) btn.disabled = true;
  try {
    const result = await API.updateSales(document.getElementById(cfg.idField).value, data);
    if (result.success) {
      showToast('✅ Sales record updated', 'success');
      hideModal(cfg.modalId);
      try { await cfg.onSuccess(); } catch (refreshError) { console.error('Refresh after edit failed:', refreshError); }
    } else {
      showToast('❌ ' + result.message, 'error');
      if (['INSUFFICIENT_STOCK', 'OUT_OF_STOCK', 'ITEM_NOT_FOUND'].includes(result.code)) cfg.onStockChanged && cfg.onStockChanged();
    }
  } catch (err) { showToast('❌ Failed to update sales record', 'error'); }
  finally {
    saleSubmitting[cfg.formId] = false;
    if (btn) btn.disabled = false;
  }
}

// Manager "add sale": same inventory dropdown + atomic stock deduction as Admin and Staff
export function handleManagerSalesSubmit(event) {
  event.preventDefault();
  return submitNewSale({
    key: 'manager',
    formId: 'managerSalesForm',
    customerId: 'managerSalesCustomer',
    productId: 'managerSalesProduct',
    quantityId: 'managerSalesQuantity',
    amountId: 'managerSalesAmount',
    dateId: 'managerSalesDate',
    onSuccess: async () => {
      document.getElementById('managerSalesForm').reset();
      await Promise.all([loadSalesProductOptions('managerSalesProduct'), loadManagerSalesList(), loadManagerSalesAnalytics(), loadManagerInventoryList()]);
    }
  });
}

export async function deleteSales(id) {
  if (!(await kdConfirm('Are you sure you want to delete this sales record?', { title: 'Delete Sales Record' }))) return;
  try {
    const result = await API.deleteSales(id);
    if (result.success) { showToast('✅ ' + result.message, 'success'); loadSalesList(); loadSalesAnalytics(); loadInventoryList(); }
    else showToast('❌ ' + result.message, 'error');
  } catch (error) { showToast('❌ Failed to delete sales record', 'error'); }
}

export async function editAdminSalesRecord(id) {
  await openSalesEditForm(id, {
    idField: 'editAdminSalesId',
    customer: 'editAdminSalesCustomer',
    product: 'editAdminSalesProduct',
    quantity: 'editAdminSalesQuantity',
    amount: 'editAdminSalesAmount',
    date: 'editAdminSalesDate',
    modal: 'editAdminSalesModal'
  });
}


// ---- loading / duplicate-click protection (helpers live in ui.js; each function is wrapped once, here, where it is defined) ----
const saleButton = (cfg) => { const f = document.getElementById(cfg.formId); return f ? f.querySelector('button[type="submit"]') : null; };
submitNewSale = kdGuard(submitNewSale, { key: (cfg) => 'sale:' + cfg.formId, button: saleButton, loadingText: 'Saving...', progress: 'Saving sales record...' });
submitSalesEdit = kdGuard(submitSalesEdit, { key: (cfg) => 'saleEdit:' + cfg.formId, button: saleButton, loadingText: 'Saving...', progress: 'Saving changes...' });
deleteSales = kdGuard(deleteSales, del('sales'));
openSalesEditForm = kdGuard(openSalesEditForm, open('sales'));
loadSalesList = kdWrapLoader(loadSalesList, { target: 'adminSalesList', loading: 'Loading sales records...', empty: 'No sales records found', error: 'Unable to load sales records.' });
loadStaffSalesList = kdWrapLoader(loadStaffSalesList, { target: 'staffSalesList', loading: 'Loading sales records...', empty: 'No sales records found', error: 'Unable to load sales records.' });
loadManagerSalesList = kdWrapLoader(loadManagerSalesList, { target: 'managerSalesList', loading: 'Loading sales records...', empty: 'No sales records found', error: 'Unable to load sales records.' });
loadSalesAnalytics = kdWrapBusy(loadSalesAnalytics, '#totalSales, #totalRecords, #averageSale, #salesLineChart');
loadStaffSalesAnalytics = kdWrapBusy(loadStaffSalesAnalytics, '#staffTotalSales, #staffTotalRecords, #staffAverageSale');
loadManagerSalesAnalytics = kdWrapBusy(loadManagerSalesAnalytics, '#managerTotalSales, #managerTotalRecords, #managerAverageSale, #managerSalesLineChart');