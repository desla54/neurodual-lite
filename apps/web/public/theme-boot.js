/* Early theme bootstrap for installed PWA system bars.
 * Runs before React so Android can pick the correct theme-color immediately.
 */
(function bootThemeEarly() {
  var LIGHT_COLOR = '#F0EEE9';
  var DARK_COLOR = '#171512';
  var THEME_HINT_STORAGE_KEY = 'neurodual_theme_hint_v1';
  var COLOR_SCHEME_META_ID = 'color-scheme-meta';

  function setMetaTheme(id, color, media) {
    var el = document.getElementById(id);
    if (!el || el.tagName !== 'META') return;
    el.setAttribute('content', color);
    if (typeof media === 'string' && media.length > 0) {
      el.setAttribute('media', media);
    } else {
      el.removeAttribute('media');
    }
  }

  function setColorSchemeMeta(content) {
    var el = document.getElementById(COLOR_SCHEME_META_ID);
    if (!el || el.tagName !== 'META') return;
    el.setAttribute('content', content);
  }

  try {
    var storedTheme = null;
    try {
      storedTheme = window.localStorage ? window.localStorage.getItem(THEME_HINT_STORAGE_KEY) : null;
    } catch (_error) {
      storedTheme = null;
    }

    var prefersDark = false;
    try {
      prefersDark =
        !!window.matchMedia && !!window.matchMedia('(prefers-color-scheme: dark)').matches;
    } catch (_error) {
      prefersDark = false;
    }

    var isDark = storedTheme === 'dark' || (storedTheme !== 'light' && prefersDark);
    var root = document.documentElement;

    if (isDark) {
      root.classList.add('dark');
      root.style.colorScheme = 'dark';
      setColorSchemeMeta('dark light');
      setMetaTheme('theme-color-active', DARK_COLOR);
      setMetaTheme('theme-color-dark', DARK_COLOR, 'all');
      setMetaTheme('theme-color-light', LIGHT_COLOR, 'not all');
    } else {
      root.classList.remove('dark');
      root.style.colorScheme = 'light';
      setColorSchemeMeta('light dark');
      setMetaTheme('theme-color-active', LIGHT_COLOR);
      setMetaTheme('theme-color-light', LIGHT_COLOR, 'all');
      setMetaTheme('theme-color-dark', DARK_COLOR, 'not all');
    }
  } catch (_error) {
    // Silent by design: bootstrap must never block app startup.
  }
})();
