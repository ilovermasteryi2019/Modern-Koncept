/* =============================================================================
 * K-Desk | js/core/page-effects.js
 * Page effects (public pages)
 * -----------------------------------------------------------------------------
 * WHAT IT DOES : Mobile hamburger menu and the smooth fade-out when a navigation link is clicked.
 * DEPENDS ON   : Nothing. Runs on every page that has a hamburger button / nav links.
 * LOAD ORDER   : file 1 of 19 (see scripts-block.html). These are plain scripts that share one
 *                global scope, so inline onclick="..." handlers in the HTML keep working.
 * CONTENTS     :
 *
 * ============================================================================= */

// PAGE TRANSITION EFFECT FOR SMOOTH NAVIGATION
// =============================================================================
document.addEventListener('DOMContentLoaded', () => {
  // ── Mobile hamburger menu ──
  const hamburgerBtn = document.getElementById('hamburgerBtn');
  const mobileNavMenu = document.getElementById('mobileNavMenu');
  if (hamburgerBtn && mobileNavMenu) {
    hamburgerBtn.addEventListener('click', () => {
      hamburgerBtn.classList.toggle('open');
      mobileNavMenu.classList.toggle('open');
    });
    mobileNavMenu.querySelectorAll('.mobile-nav-link').forEach(link => {
      link.addEventListener('click', () => {
        hamburgerBtn.classList.remove('open');
        mobileNavMenu.classList.remove('open');
      });
    });
  }

  document.querySelectorAll('a.nav-btn').forEach(link => {
    const href = link.getAttribute('href');
    if (!href || href.startsWith('http') || href.startsWith('mailto') || href.startsWith('tel')) return;
    if (href.startsWith('#')) return;
    link.addEventListener('click', (e) => {
      e.preventDefault();
      document.body.classList.add('page-transition-out');
      setTimeout(() => { window.location.href = href; }, 300);
    });
  });
});
