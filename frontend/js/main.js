import { initRouter } from './router.js';

document.addEventListener('DOMContentLoaded', () => {
  initRouter();

  // Quick post handler from sidebar
  const quickPostBtn = document.getElementById('btn-quick-post');
  if (quickPostBtn) {
    quickPostBtn.onclick = () => {
      window.location.hash = '#/';
      setTimeout(() => {
        const composeInput = document.getElementById('compose-input');
        if (composeInput) composeInput.focus();
      }, 100);
    };
  }

  // Global search bar
  const globalSearchInput = document.getElementById('global-search-input');
  if (globalSearchInput) {
    globalSearchInput.onkeydown = (e) => {
      if (e.key === 'Enter' && globalSearchInput.value.trim()) {
        window.location.hash = `#/explore?q=${encodeURIComponent(globalSearchInput.value.trim())}`;
        globalSearchInput.value = '';
      }
    };
  }

  // Keyboard Shortcuts (N = New post, J/K = navigate feed, / = search)
  document.addEventListener('keydown', (e) => {
    if (['INPUT', 'TEXTAREA'].includes(document.activeElement?.tagName)) return;

    if (e.key === 'n' || e.key === 'N') {
      e.preventDefault();
      window.location.hash = '#/';
      setTimeout(() => {
        document.getElementById('compose-input')?.focus();
      }, 100);
    } else if (e.key === '/') {
      e.preventDefault();
      globalSearchInput?.focus();
    }
  });
});
