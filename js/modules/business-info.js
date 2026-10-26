// =============================================================================
// K-DESK · business-info.js
// business-info
// Cut from the original main.js (lines 1698-1791 region). Code is unchanged except where a comment says otherwise.
// =============================================================================

import { API } from './core.js';
import { kdFormOptions as submit, kdGuard, showToast } from './ui.js';

// =============================================================================
// ADMIN MODULE - BUSINESS INFORMATION
// =============================================================================
export async function handleContactFormSubmit(event) {
  event.preventDefault();
  try {
    const result = await API.saveContactInfo({
      phone: document.getElementById('contactPhone').value,
      email: document.getElementById('contactEmail').value,
      business_hours: `Mon-Sat: ${document.getElementById('contactWeekday').value}\nSunday: ${document.getElementById('contactSunday').value}`,
      address: document.getElementById('contactAddress').value
    });
    if (result.success) showToast('Contact information saved!', 'success');
    else showToast('❌ Failed to save: ' + result.message, 'error');
  } catch (error) { showToast('❌ Failed to save contact information', 'error'); }
}

export async function loadBusinessInfo() {
  try {
    const contactResult = await API.getContactInfo();
    if (contactResult.success && contactResult.data) {
      const d = contactResult.data;
      const setVal = (id, val) => { const el = document.getElementById(id); if (el) el.value = val || ''; };
      setVal('contactPhone', d.phone);
      setVal('contactEmail', d.email);
      setVal('contactAddress', d.address);
      if (d.business_hours) {
        const hours = d.business_hours.split('\n');
        const weekdayField = document.getElementById('contactWeekday');
        const sundayField = document.getElementById('contactSunday');
        if (weekdayField && hours[0]) weekdayField.value = hours[0].replace('Mon-Sat: ', '');
        if (sundayField && hours[1]) sundayField.value = hours[1].replace('Sunday: ', '');
      }
    }
  } catch (error) {
    console.error('Load business info error:', error);
    showToast('❌ Failed to load business information', 'error');
  }
}

export async function loadAboutPageContent() {
  try {
    const result = await API.getBusinessInfo();
    if (result.success && result.data) {
      const d = result.data;
      const heroDesc = document.getElementById('heroDescription');
      if (heroDesc && d.hero_description) heroDesc.textContent = d.hero_description;
      const storyContent = document.getElementById('storyContent');
      if (storyContent && d.story) storyContent.innerHTML = `<p style="color:#4b5563;line-height:1.8;">${d.story}</p>`;
      const missionText = document.getElementById('missionText');
      if (missionText && d.mission) missionText.textContent = d.mission;
      const policiesGrid = document.getElementById('policiesGrid');
      if (policiesGrid && d.return_policy) policiesGrid.innerHTML = `<p style="color:#4b5563;line-height:1.8;grid-column:1 / -1;text-align:center;">${d.return_policy}</p>`;
    }
  } catch (error) { console.error('Load about page error:', error); }
}

export async function loadContactPageContent() {
  try {
    const result = await API.getContactInfo();
    if (result.success && result.data) {
      const d = result.data;
      const phoneEl = document.getElementById('customerServicePhone');
      if (phoneEl && d.phone) phoneEl.textContent = d.phone;
      const emailEl = document.getElementById('generalEmail');
      if (emailEl && d.email) emailEl.textContent = d.email;
      if (d.business_hours) {
        const hours = d.business_hours.split('\n');
        const weekdayEl = document.getElementById('weekdayHours');
        if (weekdayEl && hours[0]) weekdayEl.textContent = hours[0].replace('Mon-Sat: ', '');
        const sundayEl = document.getElementById('sundayHours');
        if (sundayEl && hours[1]) sundayEl.textContent = hours[1].replace('Sunday: ', '');
      }
    }
  } catch (error) { console.error('Load contact page error:', error); }
}


// ---- loading / duplicate-click protection (helpers live in ui.js; each function is wrapped once, here, where it is defined) ----
handleContactFormSubmit = kdGuard(handleContactFormSubmit, submit('Saving...', 'Saving changes...'));
