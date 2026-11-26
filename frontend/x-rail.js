// Copyright (c) 2026 Benedictus Reynaldo Hartanto (@benedictusrey). All rights reserved.
// X-Now — High-performance desktop client for X (https://github.com/benedictusrey/X-Now)
// Licensed under the MIT License.

// X-Now rail controls: the X-Now button (opens Settings) and the Refresh button,
// pinned to the right end of X's left panel and centred on X's logo. Both use the
// overlay tokens from x-tools.js, so they follow the page theme.
//
// Placement is anchored to X's primary nav, so it holds in both the left-aligned
// and the centred layouts. Nothing is shown before that nav exists, so the buttons
// appear as X's shell does, not during X's splash.
//
// Built with DOM calls only. No innerHTML anywhere in this file.
(function () {
  if (window.__xnowRailInstalled) return;
  window.__xnowRailInstalled = true;

  // Replaced by the native side with a data URI of the 128px brand icon.
  const BRAND_ICON = "__XNOW_BRAND_ICON__";
  const LOAD_WAIT_MS = 2500;
  const POLL_MS = 200;
  const EDGE_GAP = 8;     // from X's nav to the panel's border
  const SAFETY_MS = 4000; // if X's nav never appears, show the buttons anyway
  const SETTLE_STABLE_FRAMES = 6; // frames the nav must hold still before a settle ends
  const SETTLE_MAX_FRAMES = 90;   // about 1.5 s at 60 fps, a cap if X keeps moving
  const SVG_NS = "http://www.w3.org/2000/svg";
  const PAIR_SIZE = 36;               // button size beside the logo
  const PAIR_GAP = 4;                 // gap between rail buttons
  const RAIL_COUNT = 3;               // Settings, Downloader, Refresh
  const PAIR_WIDTH = PAIR_SIZE * RAIL_COUNT + PAIR_GAP * (RAIL_COUNT - 1);
  const MIN_SIZE = 18;                // smallest button that is still easy to hit

  const style = document.createElement("style");
  style.textContent = `
    .xnow-rail-tools {
      position: fixed;
      top: 40px;
      left: 200px;
      /* Top layer: X's opaque columns use high z-index values. The Settings
         scrim (2147483000) still sits above the rail. */
      z-index: 2147482900;
      display: inline-flex;
      align-items: center;
      gap: var(--rail-gap, 4px);
      opacity: 0;
      pointer-events: none;
      transition: opacity 180ms var(--xnow-ease);
    }
    .xnow-rail-tools.is-placed { opacity: 1; pointer-events: auto; }
    .xnow-rail-btn {
      display: inline-flex;
      align-items: center;
      justify-content: center;
      width: var(--rail-size, 36px);
      height: var(--rail-size, 36px);
      padding: 0;
      border: 0;
      border-radius: 9999px;
      background: transparent;
      color: var(--xnow-text, #e7e9ea);
      cursor: pointer;
      transition: background-color 120ms var(--xnow-ease), transform 120ms var(--xnow-ease);
    }
    .xnow-rail-btn:hover { background: var(--xnow-hover, rgba(231, 233, 234, 0.1)); }
    .xnow-rail-btn:active { transform: scale(0.94); }
    .xnow-rail-btn:focus-visible { outline: 2px solid var(--xnow-accent); outline-offset: 2px; }
    .xnow-rail-btn:disabled { cursor: progress; }
    .xnow-rail-btn[aria-expanded="true"] { background: var(--xnow-accent-soft); }
    .xnow-rail-btn svg { width: calc(var(--rail-size, 36px) * 0.55); height: calc(var(--rail-size, 36px) * 0.55); }
    .xnow-rail-brand {
      width: calc(var(--rail-size, 36px) * 0.72);
      height: calc(var(--rail-size, 36px) * 0.72);
      border-radius: 7px;
      display: block;
      pointer-events: none;
    }
    .xnow-refresh.is-busy svg {
      animation: xnow-rail-spin 700ms linear infinite;
    }
    .xnow-refresh.is-spin-once svg {
      animation: xnow-rail-spin 480ms var(--xnow-ease) 1;
    }
    @keyframes xnow-rail-spin {
      to { transform: rotate(360deg); }
    }
    html[data-xnow-motion="reduce"] .xnow-refresh svg { animation: none !important; }
    html[data-xnow-motion="reduce"] .xnow-rail-tools { transition: none; }
  `;

  let toolsEl = null;
  let brandEl = null;
  let downloadEl = null;
  let refreshEl = null;
  let busy = false;
  let logoEl = null;
  let lastNav = null;

  // One listener for the whole page, not one per mount.
  window.addEventListener("xnow:settings-open", event => {
    brandEl?.setAttribute("aria-expanded", event.detail?.open ? "true" : "false");
  });

  function brandButton() {
    const button = document.createElement("button");
    button.type = "button";
    button.className = "xnow-rail-btn xnow-rail-brand-btn xnow-ui";
    button.setAttribute("aria-label", "X-Now settings");
    button.setAttribute("aria-haspopup", "dialog");
    button.setAttribute("aria-expanded", "false");
    button.title = "X-Now settings";
    const img = document.createElement("img");
    img.className = "xnow-rail-brand";
    img.src = BRAND_ICON;
    img.alt = "";
    img.draggable = false;
    button.appendChild(img);
    button.addEventListener("click", () => window.__xnowToggleSettings?.());
    return button;
  }

  // Downloader icon (placed directly on the left of Refresh feed).
  function downloadIcon() {
    const svg = document.createElementNS(SVG_NS, "svg");
    svg.setAttribute("viewBox", "0 0 24 24");
    svg.setAttribute("aria-hidden", "true");
    svg.setAttribute("fill", "none");
    svg.setAttribute("stroke", "currentColor");
    svg.setAttribute("stroke-width", "2");
    svg.setAttribute("stroke-linecap", "round");
    svg.setAttribute("stroke-linejoin", "round");
    for (const d of ["M12 3v12", "m7 10 5 5 5-5", "M5 20h14"]) {
      const path = document.createElementNS(SVG_NS, "path");
      path.setAttribute("d", d);
      svg.appendChild(path);
    }
    return svg;
  }

  function downloadControl() {
    const button = document.createElement("button");
    button.type = "button";
    button.className = "xnow-rail-btn xnow-rail-download xnow-ui";
    button.setAttribute("aria-label", "X-Now Downloader");
    button.title = "X-Now Downloader";
    button.appendChild(downloadIcon());
    button.addEventListener("click", () => {
      window.__xnowTools?.openDownloader?.("", window.__xnowTools?.pickActiveFeedMedia?.() || null);
    });
    return button;
  }

  // The refresh arrows, built with DOM calls (no innerHTML).
  function refreshIcon() {
    const svg = document.createElementNS(SVG_NS, "svg");
    svg.setAttribute("viewBox", "0 0 24 24");
    svg.setAttribute("aria-hidden", "true");
    svg.setAttribute("fill", "none");
    svg.setAttribute("stroke", "currentColor");
    svg.setAttribute("stroke-width", "2");
    svg.setAttribute("stroke-linecap", "round");
    svg.setAttribute("stroke-linejoin", "round");
    for (const d of ["M21 12a9 9 0 1 1-2.64-6.36", "M21 4v5h-5"]) {
      const path = document.createElementNS(SVG_NS, "path");
      path.setAttribute("d", d);
      svg.appendChild(path);
    }
    return svg;
  }

  function refreshControl() {
    const button = document.createElement("button");
    button.type = "button";
    button.className = "xnow-rail-btn xnow-refresh xnow-ui";
    button.setAttribute("aria-label", "Refresh feed");
    button.title = "Refresh feed";
    button.appendChild(refreshIcon());
    button.addEventListener("click", () => refreshFeed());
    return button;
  }

  function setBusy(on) {
    busy = on;
    refreshEl.disabled = on;
    refreshEl.classList.toggle("is-busy", on);
    refreshEl.setAttribute("aria-busy", on ? "true" : "false");
  }

  // ── Soft refresh ─────────────────────────────────────────────────────────
  // X's own Home tab refreshes the timeline in place, and playing media and the
  // scroll position survive. A full reload is only the fallback for when X's
  // Home link is missing.

  function homeLink() {
    return document.querySelector('nav[aria-label="Primary"] a[href="/home"]') ||
      document.querySelector('a[data-testid="AppTabBar_Home_Link"]');
  }

  function newPostsPill() {
    return Array.from(document.querySelectorAll('button, div[role="button"]'))
      .find(el => /^Show \d+ posts?$/i.test(el.textContent.trim())) || null;
  }

  function wait(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
  }

  async function waitFor(check, limitMs) {
    const until = performance.now() + limitMs;
    while (performance.now() < until) {
      const found = check();
      if (found) return found;
      await wait(POLL_MS);
    }
    return null;
  }

  async function refreshFeed() {
    if (busy) return;
    const link = homeLink();
    if (!link) {
      location.reload();
      return;
    }
    setBusy(true);
    try {
      if (location.pathname !== "/home") {
        link.click();
        const onHome = await waitFor(() => location.pathname === "/home", LOAD_WAIT_MS);
        if (!onHome) {
          location.reload();
          return;
        }
      }
      // The "Show N posts" pill is X's own "load new posts": take it first.
      let pill = newPostsPill();
      if (!pill) {
        window.scrollTo({
          top: 0,
          behavior: document.documentElement.dataset.xnowMotion === "reduce" ? "auto" : "smooth"
        });
        link.click();
        pill = await waitFor(newPostsPill, LOAD_WAIT_MS);
      }
      if (pill) {
        const count = Number((pill.textContent.match(/\d+/) || [0])[0]);
        pill.click();
        window.showToast?.(count === 1 ? "Loaded 1 new post" : `Loaded ${count} new posts`, "success");
      } else {
        window.showToast?.("Your feed is up to date", "info");
      }
    } finally {
      // Keep the rotation visible for a beat, so a fast refresh still reads as one.
      await wait(480);
      setBusy(false);
      refreshEl.classList.add("is-spin-once");
      setTimeout(() => refreshEl?.classList.remove("is-spin-once"), 500);
    }
  }
  window.__xnowRefreshFeed = refreshFeed;

  // ── Placement ────────────────────────────────────────────────────────────
  // X's primary nav is the left panel's content. Its right edge, plus a gap, is
  // the panel's edge. The Settings sheet opens from the same edge.
  function primaryNav() {
    return document.querySelector('nav[aria-label="Primary"]');
  }

  function panelEdge() {
    const nav = primaryNav();
    return nav ? nav.getBoundingClientRect().right + EDGE_GAP : null;
  }
  window.__xnowRailEdge = () => panelEdge() ?? 288;

  // The logo: a link holding only an SVG, sitting above the nav and inside its
  // horizontal span. Scoped to nav's container first to avoid full-document reflows.
  function findLogo(nav) {
    const n = nav.getBoundingClientRect();
    const match = el => {
      if (!el.querySelector("svg") || el.textContent.trim()) return false;
      const r = el.getBoundingClientRect();
      return r.bottom <= n.top + 4 && r.left >= n.left - 40 && r.right <= n.right + 40 &&
        r.width >= 16 && r.width <= 96 && r.height >= 16 && r.height <= 96;
    };
    const scope = nav.parentElement || document;
    const local = Array.from(scope.querySelectorAll('a, [role="link"]')).find(match);
    if (local) return local;
    return Array.from(document.querySelectorAll('a, [role="link"]')).find(match) || null;
  }

  // Pins the buttons to the panel's right end, centred on the logo (or just above
  // the nav when no logo is found). Does nothing while X's nav is absent, so the
  // safety-net position stays in place until the nav shows.
  // Places the pair at a button size, then shows it.
  function show(size, left, top, gap = PAIR_GAP) {
    toolsEl.style.setProperty("--rail-size", `${Math.round(size)}px`);
    toolsEl.style.setProperty("--rail-gap", `${gap}px`);
    toolsEl.style.top = `${Math.round(top)}px`;
    toolsEl.style.left = `${Math.round(left)}px`;
    toolsEl.classList.add("is-placed");
  }

  function place() {
    if (!toolsEl?.isConnected) return;
    const nav = primaryNav();
    if (!nav) return;
    const edge = panelEdge();
    // The Settings sheet opens from this edge through the same variable, so it follows X's panel.
    document.documentElement.style.setProperty("--xnow-sheet-left", `${Math.round(edge)}px`);
    if (!logoEl?.isConnected) logoEl = findLogo(nav);
    const logo = logoEl?.getBoundingClientRect();
    const navRect = nav.getBoundingClientRect();
    const beside = edge - 16 - PAIR_WIDTH;
    // Beside the logo: the pair starts right of the logo and stays inside the nav's span.
    const clear = Math.max(navRect.left, logo && logo.height > 0 ? logo.right + 8 : navRect.left);
    if (beside >= Math.max(8, clear)) {
      const top = logo && logo.height > 0
        ? logo.top + (logo.height - PAIR_SIZE) / 2
        : navRect.top - 46;
      show(PAIR_SIZE, beside, top);
      return;
    }
    // Icon-only sidebar: X centres the logo above the icons, so there is no room beside
    // it. The pair goes in the gap between the logo and the first icon, at the largest
    // size that fits. A gap too small for MIN_SIZE hides the pair rather than cover X.
    const logoGlyph = logoEl?.querySelector("svg")?.getBoundingClientRect();
    const firstGlyph = nav.querySelector("a svg")?.getBoundingClientRect();
    const gap = logoGlyph && firstGlyph && logoGlyph.height > 0 && firstGlyph.height > 0
      ? firstGlyph.top - logoGlyph.bottom
      : 0;
    const iconGap = 2;
    const maxWidthPerBtn = Math.floor((navRect.width - iconGap * (RAIL_COUNT - 1)) / RAIL_COUNT);
    const size = Math.min(PAIR_SIZE, Math.floor(gap) - 4, maxWidthPerBtn);
    const width = size * RAIL_COUNT + iconGap * (RAIL_COUNT - 1);
    if (size < MIN_SIZE) {
      toolsEl.classList.remove("is-placed");
      return;
    }
    const centred = (navRect.left + navRect.right) / 2 - width / 2;
    const pairLeft = Math.max(navRect.left, Math.min(centred, navRect.right - width));
    show(size, pairLeft, logoGlyph.bottom + (gap - size) / 2, iconGap);
  }

  // Builds the buttons once; X can remove them on re-render, and they come back here.
  function build() {
    toolsEl = document.createElement("div");
    toolsEl.className = "xnow-rail-tools xnow-ui";
    brandEl = brandButton();
    downloadEl = downloadControl();
    refreshEl = refreshControl();
    toolsEl.append(brandEl, downloadEl, refreshEl);
    document.body.appendChild(toolsEl);
  }

  function reveal() {
    toolsEl?.classList.add("is-placed");
  }

  // Shows the buttons as soon as X's nav exists. Safe to call often.
  function sync() {
    if (!primaryNav()) return false;
    if (!toolsEl?.isConnected) build();
    place();
    return true;
  }

  // Safety net: X changed its markup and no nav ever appeared. Show the buttons
  // at the spot X's logo usually occupies, so they stay usable.
  function safetyNet() {
    if (sync()) return;
    if (!toolsEl?.isConnected) build();
    toolsEl.style.top = "14px";
    toolsEl.style.left = "72px";
    reveal();
  }

  // X re-lays out its columns after a resize, such as a zoom change. The move does
  // not always change the nav's size, so no observer reports it. Each resize
  // therefore places the buttons every frame until the nav stops moving.
  let settling = false;
  function settle() {
    if (settling) return;
    settling = true;
    let previous = "";
    let stableFrames = 0;
    let frames = 0;
    const step = () => {
      place();
      const box = primaryNav()?.getBoundingClientRect();
      const key = box ? `${box.left},${box.top},${box.right},${box.bottom}` : "";
      stableFrames = key === previous ? stableFrames + 1 : 0;
      previous = key;
      frames += 1;
      if (stableFrames < SETTLE_STABLE_FRAMES && frames < SETTLE_MAX_FRAMES) requestAnimationFrame(step);
      else settling = false;
    };
    requestAnimationFrame(step);
  }
  const navSize = new ResizeObserver(() => settle());
  const viewportSize = new ResizeObserver(() => settle());

  // Follows X's DOM: shows the buttons when the nav first appears, re-observes
  // the nav if X replaces it, and brings the buttons back if X removes them.
  let scheduled = false;
  function scheduleSync() {
    if (scheduled) return;
    scheduled = true;
    requestAnimationFrame(() => {
      scheduled = false;
      const nav = primaryNav();
      const changed = nav !== lastNav;
      if (changed) {
        lastNav = nav;
        navSize.disconnect();
        if (nav) navSize.observe(nav);
      }
      if (!toolsEl?.isConnected || changed) sync();
    });
  }

  function start() {
    (document.head || document.documentElement).appendChild(style);
    lastNav = primaryNav();
    if (lastNav) navSize.observe(lastNav);
    sync();
    // Only schedule a DOM check when the rail or nav actually detached; skips
    // rAF + layout work during normal feed scrolling and tweet renders.
    new MutationObserver(() => {
      if (toolsEl?.isConnected && lastNav?.isConnected) return;
      scheduleSync();
    }).observe(document.body, { childList: true, subtree: true });
    viewportSize.observe(document.documentElement);
    window.addEventListener("resize", settle, { passive: true });
    setTimeout(safetyNet, SAFETY_MS);
  }

  // The page's <head> does not exist while this script runs from the init
  // script, so nothing touches the DOM until the document is ready. An error in
  // this file must not stop the other page scripts (they share one script).
  function safeStart() {
    try {
      start();
    } catch (error) {
      console.error("[X-Now] rail controls did not start:", error);
    }
  }
  if (document.body) safeStart();
  else document.addEventListener("DOMContentLoaded", safeStart, { once: true });
})();
