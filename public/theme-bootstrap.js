/*
 * Pre-paint theme bootstrap (v2.3.0 #3).
 *
 * Reads `<html data-theme-pref="system|dark|light">` set server-side from
 * app_state.theme. For explicit choices the server already wrote the
 * matching class; for "system" we resolve prefers-color-scheme here so
 * the right palette is on screen before React hydrates — no flash.
 *
 * Loaded as a static file (not inline) so the recon-deck ESLint guard
 * against `dangerouslySetInnerHTML` (SEC-03) stays clean.
 */
(function () {
  try {
    var html = document.documentElement;
    var pref = html.getAttribute("data-theme-pref") || "system";
    if (pref === "system") {
      var mql = window.matchMedia("(prefers-color-scheme: light)");
      html.classList.add(mql.matches ? "light" : "dark");
    }
  } catch (e) {
    /* fall through — server class wins */
  }
})();
