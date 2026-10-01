// ==UserScript==
// @name         US Sign Full UI Theme
// @namespace    us-sign-full-modules
// @version      2.2.10
// @description  SquareCoil Full UI Theme with dashboard refresh plus global topbar and collapsed-brand shell fixes.
// @match        https://ussignandmill.squarecoil.net/*
// @run-at       document-start
// @grant        GM_addStyle
// @grant        GM_xmlhttpRequest
// @connect      www.bing.com
// @noframes
// @require      https://raw.githubusercontent.com/Wakeup-gif/test_repo/a340786458402732f0f78d48face95c940adabf3/tampermonkey/US-Sign-Full-UI-Theme-v2.2.6.user.js
// @require      https://raw.githubusercontent.com/Wakeup-gif/test_repo/b0a89382eabdbcb873b3f8d20bcacb05ada7b63c/tampermonkey/US-Sign-Full-UI-Theme-v2.2.7.user.js
// @require      https://raw.githubusercontent.com/Wakeup-gif/test_repo/5df70b02d5097b53d3326f78cccc5332221ee136/tampermonkey/US-Sign-Full-UI-Theme.user.js
// @updateURL    https://raw.githubusercontent.com/Wakeup-gif/test_repo/main/tampermonkey/US-Sign-Full-UI-Theme.user.js
// @downloadURL  https://raw.githubusercontent.com/Wakeup-gif/test_repo/main/tampermonkey/US-Sign-Full-UI-Theme.user.js
// ==/UserScript==

(function () {
  "use strict";

  if (window.__usSignFullUIThemeV2210) return;
  window.__usSignFullUIThemeV2210 = true;

  const root = document.documentElement;
  if (!root) return;

  root.dataset.usSignThemeVersion = "2.2.10";
  root.dataset.usSignShellFixes = "quick-clock-align+collapsed-brand";

  GM_addStyle(String.raw`
    /* Topbar utility buttons should share one optical center line. */
    #us-sign-quick-clock-open {
      display: inline-flex !important;
      align-items: center !important;
      justify-content: center !important;
      align-self: center !important;
      vertical-align: middle !important;
      height: 36px !important;
      min-height: 36px !important;
      margin-top: 0 !important;
      margin-bottom: 0 !important;
      position: relative !important;
      top: 0 !important;
      line-height: 1 !important;
    }

    /* Hide only the SquareCoil wordmark when the left rail is compact. */
    html.us-sign-sidebar-compact-brand .us-sign-squarecoil-wordmark {
      display: none !important;
    }
  `);

  function markSquareCoilWordmark() {
    const branding = document.querySelector(
      ".navbar-branding .navbar-brand, .navbar-branding > a, .navbar-brand"
    );

    if (!branding) return;

    for (const node of Array.from(branding.childNodes)) {
      if (node.nodeType !== Node.TEXT_NODE) continue;
      const text = String(node.nodeValue || "").trim();
      if (!/^SquareCoil\.?$/i.test(text)) continue;

      const span = document.createElement("span");
      span.className = "us-sign-squarecoil-wordmark";
      span.textContent = node.nodeValue;
      node.replaceWith(span);
    }

    for (const el of branding.querySelectorAll("span,strong,b,em")) {
      if (el.classList.contains("us-sign-squarecoil-wordmark")) continue;
      if (el.children.length) continue;
      if (/^SquareCoil\.?$/i.test(String(el.textContent || "").trim())) {
        el.classList.add("us-sign-squarecoil-wordmark");
      }
    }
  }

  function updateSidebarBrandState() {
    const sidebar = document.querySelector("#sidebar_left");
    const bodyCollapsed = Boolean(
      document.body?.classList.contains("sb-l-m") ||
      document.body?.classList.contains("sidebar-collapsed") ||
      document.body?.classList.contains("sidebar-minimized")
    );

    const width = sidebar?.getBoundingClientRect().width || 0;
    const widthCollapsed = width > 0 && width < 100;

    root.classList.toggle(
      "us-sign-sidebar-compact-brand",
      bodyCollapsed || widthCollapsed
    );
  }

  function bindShellFixes() {
    markSquareCoilWordmark();
    updateSidebarBrandState();

    const sidebar = document.querySelector("#sidebar_left");
    if (sidebar && typeof ResizeObserver === "function") {
      const resizeObserver = new ResizeObserver(updateSidebarBrandState);
      resizeObserver.observe(sidebar);
    }

    if (document.body && typeof MutationObserver === "function") {
      const bodyObserver = new MutationObserver(() => {
        markSquareCoilWordmark();
        updateSidebarBrandState();
      });

      bodyObserver.observe(document.body, {
        attributes: true,
        attributeFilter: ["class"],
        childList: true,
        subtree: true
      });
    }

    window.addEventListener("resize", updateSidebarBrandState, { passive: true });
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", bindShellFixes, { once: true });
  } else {
    bindShellFixes();
  }
})();
