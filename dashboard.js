// =============================================================================
// K-DESK DASHBOARD SIDEBAR (Admin / Manager / Staff)
// Only controls showing and hiding the sidebar on mobile. The dashboard tabs
// themselves are still handled by initDashboardTabs() in main.js, and logout by
// handleLogout() bound to #logoutBtn - nothing here replaces or intercepts them.
// =============================================================================
(function () {
  const sidebar = document.getElementById('dashSidebar');
  const toggle = document.getElementById('sidebarToggle');
  const backdrop = document.getElementById('sidebarBackdrop');
  if (!sidebar || !toggle || !backdrop) return;

  const mobileQuery = window.matchMedia('(max-width: 767.98px)');

  function setOpen(open) {
    sidebar.classList.toggle('is-open', open);
    backdrop.classList.toggle('show', open);
    document.body.classList.toggle('sidebar-open', open);
    toggle.setAttribute('aria-expanded', String(open));
    toggle.setAttribute('aria-label', open ? 'Close menu' : 'Open menu');
  }

  toggle.addEventListener('click', () => setOpen(!sidebar.classList.contains('is-open')));
  backdrop.addEventListener('click', () => setOpen(false));

  document.addEventListener('keydown', (event) => {
    if (event.key === 'Escape' && sidebar.classList.contains('is-open')) {
      setOpen(false);
      toggle.focus();
    }
  });

  // After choosing a module on mobile: close the menu and start at the top of the new content.
  // (This runs in addition to main.js's own tab click handler.)
  sidebar.addEventListener('click', (event) => {
    if (mobileQuery.matches && event.target.closest('.dashboard-tab')) {
      setOpen(false);
      window.scrollTo({ top: 0 });
    }
  });

  // Rotating or resizing into a larger layout: reset the mobile state
  const onBreakpointChange = () => setOpen(false);
  if (mobileQuery.addEventListener) mobileQuery.addEventListener('change', onBreakpointChange);
  else if (mobileQuery.addListener) mobileQuery.addListener(onBreakpointChange);
})();