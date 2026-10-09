'use strict';

// Runs before CSS to apply the saved appearance without a light-mode flash.
(() => {
  const key = 'safetap-theme';
  const system = window.matchMedia?.('(prefers-color-scheme: dark)');
  let preference;
  try { preference = localStorage.getItem(key); } catch {}
  if (!['light', 'dark'].includes(preference)) preference = null;
  let current;
  function apply(theme) {
    current = theme;
    document.documentElement.dataset.theme = theme;
    document.documentElement.style.colorScheme = theme;
    const meta = document.querySelector('meta[name="theme-color"]');
    if (meta) meta.content = theme === 'dark' ? '#101923' : '#183451';
    document.dispatchEvent(new Event('safetap:theme'));
  }
  window.SafeTapTheme = {
    get current() { return current; },
    toggle() {
      preference = current === 'dark' ? 'light' : 'dark';
      try { localStorage.setItem(key, preference); } catch {}
      apply(preference);
    }
  };
  apply(preference || (system?.matches ? 'dark' : 'light'));
  system?.addEventListener?.('change', event => {
    if (!preference) apply(event.matches ? 'dark' : 'light');
  });
})();
