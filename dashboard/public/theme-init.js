// Resolves the theme before first paint, so dark mode never flashes light. Same rule as
// lib/theme.ts. A file rather than an inline script, so the Content-Security-Policy
// needs no 'unsafe-inline' for scripts.
(function () {
  var pref = 'light';
  try {
    pref = localStorage.getItem('truplexy.theme');
    if (!pref) {
      // New people start light. Someone already signed in from before light was the default keeps following the system.
      pref = 'light';
      for (var i = 0; i < localStorage.length; i++) {
        if (/^sb-.+-auth-token$/.test(localStorage.key(i) || '')) pref = 'system';
      }
      localStorage.setItem('truplexy.theme', pref);
    }
  } catch (e) {}
  var dark = pref === 'dark' || (pref === 'system' && window.matchMedia('(prefers-color-scheme: dark)').matches);
  document.documentElement.dataset.theme = dark ? 'dark' : 'light';
})();
