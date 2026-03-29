(function () {
  var KEY = 'akarabook_theme';

  try {
    if (localStorage.getItem('akarabook_reduced_motion') === '1') {
      document.documentElement.setAttribute('data-reduced-motion', 'on');
    }
  } catch (e) {}

  function stored() {
    try {
      var s = localStorage.getItem(KEY);
      if (s === 'light' || s === 'dark') return s;
    } catch (e) {}
    return 'dark';
  }

  function apply(theme) {
    document.documentElement.setAttribute('data-theme', theme);
    try {
      localStorage.setItem(KEY, theme);
    } catch (e) {}
    window.dispatchEvent(new CustomEvent('akarabook-theme-change', { detail: { theme: theme } }));
    document.querySelectorAll('[data-theme-toggle]').forEach(function (btn) {
      btn.setAttribute('aria-pressed', theme === 'light' ? 'true' : 'false');
      btn.setAttribute('aria-label', theme === 'light' ? 'Switch to cozy dark mode' : 'Switch to soft light mode');
    });
  }

  apply(stored());

  document.addEventListener('DOMContentLoaded', function () {
    document.querySelectorAll('[data-theme-toggle]').forEach(function (btn) {
      btn.addEventListener('click', function () {
        var cur = document.documentElement.getAttribute('data-theme') || 'dark';
        apply(cur === 'dark' ? 'light' : 'dark');
      });
    });
  });
})();
