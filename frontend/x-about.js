// Copyright (c) 2026 Benedictus Reynaldo Hartanto (@benedictusrey). All rights reserved.
// X-Now — High-performance desktop client for X (https://github.com/benedictusrey/X-Now)
// Licensed under the MIT License.

// The About dialog: X-Now's identity, the live state of its settings, and the
// features. It is built with DOM calls and the shared --xnow-* tokens from
// x-tools.js, so it follows the page theme. The native side replaces __VERSION__ and
// __ICON_DATA_URI__, then runs it with window.eval. Running it again closes it.
(function () {
  if (window.__xnowAboutClose) {
    window.__xnowAboutClose();
    return;
  }

  var ID = "__xnow_about";
  var VERSION = "__VERSION__";
  var ICON = "__ICON_DATA_URI__";
  var REPO = "https://github.com/benedictusrey/X-Now";
  var AUTHOR = "https://github.com/benedictusrey";
  var SVG_NS = "http://www.w3.org/2000/svg";

  // Generic 24px line glyphs, drawn with currentColor (the same set as Settings).
  var ICONS = {
    save: ["M12 4v11", "M7 10l5 5 5-5", "M5 20h14"],
    tray: ["M3 6.5A2.5 2.5 0 0 1 5.5 4h13A2.5 2.5 0 0 1 21 6.5v11a2.5 2.5 0 0 1-2.5 2.5h-13A2.5 2.5 0 0 1 3 17.5z", "M3 9h18"],
    moon: ["M20.4 14.5A8.5 8.5 0 0 1 9.5 3.6a8.5 8.5 0 1 0 10.9 10.9z"],
    minimize: ["M14 10l7-7", "M15 3h6v6", "M10 14l-7 7", "M9 21H3v-6"],
    external: ["M14 4h6v6", "M20 4l-9 9", "M18 14v5a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1V7a1 1 0 0 1 1-1h5"],
    film: ["M4 5h16v14H4z", "M10 9l5 3-5 3z"],
    sun: ["M12 8a4 4 0 1 0 0 8 4 4 0 0 0 0-8z", "M12 2.5v2", "M12 19.5v2", "M4.6 4.6l1.4 1.4", "M18 18l1.4 1.4", "M2.5 12h2", "M19.5 12h2", "M4.6 19.4L6 18", "M18 6l1.4-1.4"],
    zoom: ["M11 4a7 7 0 1 0 0 14 7 7 0 0 0 0-14z", "M16.5 16.5L21 21", "M8 11h6"],
    focus: ["M3 5h18v14H3z", "M3 10h18", "M8 10v9"],
    close: ["M18 6L6 18", "M6 6l12 12"]
  };

  function icon(name, size) {
    var svg = document.createElementNS(SVG_NS, "svg");
    svg.setAttribute("viewBox", "0 0 24 24");
    svg.setAttribute("width", String(size));
    svg.setAttribute("height", String(size));
    svg.setAttribute("aria-hidden", "true");
    svg.setAttribute("fill", "none");
    svg.setAttribute("stroke", "currentColor");
    svg.setAttribute("stroke-width", "1.6");
    svg.setAttribute("stroke-linecap", "round");
    svg.setAttribute("stroke-linejoin", "round");
    ICONS[name].forEach(function (d) {
      var path = document.createElementNS(SVG_NS, "path");
      path.setAttribute("d", d);
      svg.appendChild(path);
    });
    return svg;
  }

  function el(tag, cls, text) {
    var node = document.createElement(tag);
    if (cls) node.className = cls;
    if (text !== undefined) node.textContent = text;
    return node;
  }

  function clock(minutes) {
    var pad = function (n) { return String(n).padStart(2, "0"); };
    return pad(Math.floor(minutes / 60)) + ":" + pad(minutes % 60);
  }

  // Live state, read from the same settings the Settings panel uses.
  function statusTiles() {
    var s = window.__xnowSettings;
    var page = document.documentElement.dataset.xnowTheme;
    var background = page === "light" ? "Light" : page === "dim" ? "Dim" : "Dark";
    var tiles = [["sun", "Background", background, "Set in X's Display settings"]];
    if (!s) {
      tiles.push(["moon", "Quiet hours", "Loading", "Reading your settings"]);
      tiles.push(["zoom", "Zoom", "Loading", "Reading your settings"]);
      tiles.push(["focus", "Focus layout", "Loading", "Reading your settings"]);
      return tiles;
    }
    if (s.quietMode === "off") {
      tiles.push(["moon", "Quiet hours", "Off", "Videos play as usual"]);
    } else {
      var active = window.__xnowQuietActive ? window.__xnowQuietActive(s) : false;
      var window_ = s.quietMode === "nights" ? "23:00 to 07:00" : clock(s.quietStart) + " to " + clock(s.quietEnd);
      tiles.push(["moon", "Quiet hours", active ? "Active now" : (s.quietMode === "nights" ? "Nights" : "Custom"), window_]);
    }
    tiles.push(["zoom", "Zoom", s.zoomPercent + "%", "Page zoom for X"]);
    tiles.push(["focus", "Focus layout", s.focusLayout ? "On" : "Off", "Hides trends and promos"]);
    return tiles;
  }

  var FEATURES = [
    ["save", "X-Now Downloader", "Save multi-image posts, HD videos, .m4a audio, and post text from the top-left rail."],
    ["tray", "Tray controls", "Show or hide X-Now, browse X, refresh and zoom from the tray."],
    ["moon", "Quiet hours", "Mute and pause video on a schedule, at night or in your own window."],
    ["minimize", "While minimized", "Pause video, mute sound and sleep the page while the window is hidden."],
    ["external", "Links open outside", "Links and the Cobalt guide open in your default browser."],
    ["film", "Media saving", "Right-click any photo or video to save it directly to Downloads, X-Now."]
  ];

  var returnFocus = document.activeElement;
  var overlay = el("div");
  overlay.id = ID;
  overlay.className = "xnow-ui";

  var card = el("div", "xnow-about-card");
  card.setAttribute("role", "dialog");
  card.setAttribute("aria-modal", "true");
  card.setAttribute("aria-labelledby", "xnow-about-title");

  function close() {
    document.removeEventListener("keydown", onKey, true);
    overlay.remove();
    window.__xnowAboutClose = null;
    if (returnFocus && returnFocus.focus) returnFocus.focus();
  }
  window.__xnowAboutClose = close;

  function onKey(event) {
    if (event.key === "Escape") {
      event.stopPropagation();
      close();
      return;
    }
    if (event.key !== "Tab") return;
    var stops = Array.prototype.slice.call(card.querySelectorAll("button, a[href]"));
    if (!stops.length) return;
    var first = stops[0];
    var last = stops[stops.length - 1];
    if (!card.contains(document.activeElement)) {
      event.preventDefault();
      first.focus();
    } else if (event.shiftKey && document.activeElement === first) {
      event.preventDefault();
      last.focus();
    } else if (!event.shiftKey && document.activeElement === last) {
      event.preventDefault();
      first.focus();
    }
  }

  function openExternal(url, event) {
    event.preventDefault();
    event.stopImmediatePropagation();
    var core = window.__TAURI__ && window.__TAURI__.core;
    if (core && core.invoke) {
      core.invoke("open_external_url", { url: url }).catch(function () { window.open(url, "_blank"); });
    } else {
      window.open(url, "_blank");
    }
  }

  function link(label, url) {
    var a = el("a", "xnow-about-link", label);
    a.href = url;
    a.addEventListener("click", function (event) { openExternal(url, event); });
    return a;
  }

  // Header: the app icon, the name and version, the tagline, and the close button.
  var head = el("div", "xnow-about-head");
  var brand = document.createElement("img");
  brand.className = "xnow-about-brand";
  brand.src = ICON;
  brand.alt = "";
  var titles = el("div", "xnow-about-titles");
  var title = el("h2", "xnow-about-title", "X-Now");
  title.id = "xnow-about-title";
  var version = el("span", "xnow-about-version", "v" + VERSION);
  title.appendChild(version);
  titles.append(title, el("p", "xnow-about-tagline", "The X you know, with desktop superpowers."));
  var closeButton = el("button", "xnow-about-close");
  closeButton.type = "button";
  closeButton.setAttribute("aria-label", "Close");
  closeButton.appendChild(icon("close", 18));
  closeButton.addEventListener("click", close);
  head.append(brand, titles, closeButton);

  // Right now: four live tiles.
  var nowHead = el("h3", "xnow-about-heading", "Right now");
  var grid = el("div", "xnow-about-tiles");
  statusTiles().forEach(function (tile) {
    var node = el("div", "xnow-about-tile");
    var top = el("div", "xnow-about-tile-top");
    top.append(icon(tile[0], 16), el("span", null, tile[1]));
    node.append(top, el("div", "xnow-about-tile-value", tile[2]), el("div", "xnow-about-tile-detail", tile[3]));
    grid.appendChild(node);
  });

  // What X-Now adds.
  var featHead = el("h3", "xnow-about-heading", "What X-Now adds");
  var features = el("div", "xnow-about-features");
  FEATURES.forEach(function (feature) {
    var item = el("div", "xnow-about-feature");
    var glyph = el("span", "xnow-about-glyph");
    glyph.appendChild(icon(feature[0], 18));
    var text = el("div");
    text.append(el("div", "xnow-about-feature-title", feature[1]), el("div", "xnow-about-feature-desc", feature[2]));
    item.append(glyph, text);
    features.appendChild(item);
  });

  // Footer: links, the credit and the licence, and the one action.
  var foot = el("div", "xnow-about-foot");
  var links = el("div", "xnow-about-links");
  links.append(link("Repository", REPO), link("Release notes", REPO + "/releases"));
  var credit = el("p", "xnow-about-credit", "Made by ");
  credit.appendChild(link("Benedictus RH (@benedictusrey)", AUTHOR));
  credit.appendChild(document.createTextNode(" · MIT licence"));
  var gotIt = el("button", "xnow-about-ok", "Got it");
  gotIt.type = "button";
  gotIt.addEventListener("click", close);
  var actions = el("div", "xnow-about-actions");
  actions.append(credit, gotIt);
  foot.append(links, actions);

  card.append(head, nowHead, grid, featHead, features, foot);

  var style = document.createElement("style");
  style.textContent = [
    "#" + ID + "{position:fixed;inset:0;z-index:2147483647;display:flex;align-items:center;justify-content:center;padding:16px;background:rgba(0,0,0,.6);-webkit-backdrop-filter:blur(10px);backdrop-filter:blur(10px);font:15px/1.4 'Segoe UI Variable Text','Segoe UI',system-ui,sans-serif;color:var(--xnow-text)}",
    "#" + ID + " *{box-sizing:border-box}",
    "#" + ID + " .xnow-about-card{width:min(520px,100%);max-height:88vh;overflow-y:auto;background:var(--xnow-raised);border:1px solid var(--xnow-border);border-radius:20px;box-shadow:var(--xnow-shadow);padding:22px 22px 18px}",
    "#" + ID + " .xnow-about-head{display:flex;align-items:center;gap:14px}",
    "#" + ID + " .xnow-about-brand{width:56px;height:56px;border-radius:14px;flex:0 0 auto}",
    "#" + ID + " .xnow-about-titles{flex:1;min-width:0}",
    "#" + ID + " .xnow-about-title{margin:0;font-size:22px;line-height:1.2;font-weight:700;display:flex;align-items:center;gap:8px;flex-wrap:wrap}",
    "#" + ID + " .xnow-about-version{font-size:12px;font-weight:600;line-height:1;padding:4px 8px;border-radius:999px;background:var(--xnow-hover);color:var(--xnow-sub)}",
    "#" + ID + " .xnow-about-tagline{margin:4px 0 0;font-size:14px;color:var(--xnow-sub)}",
    "#" + ID + " .xnow-about-close{display:grid;place-items:center;width:34px;height:34px;padding:0;border:0;border-radius:999px;background:transparent;color:var(--xnow-text);cursor:pointer;flex:0 0 auto}",
    "#" + ID + " .xnow-about-close:hover{background:var(--xnow-hover)}",
    "#" + ID + " .xnow-about-heading{margin:20px 0 10px;font-size:14px;font-weight:600;color:var(--xnow-text)}",
    "#" + ID + " .xnow-about-tiles{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:8px}",
    "#" + ID + " .xnow-about-tile{background:var(--xnow-hover);border-radius:14px;padding:12px 14px}",
    "#" + ID + " .xnow-about-tile-top{display:flex;align-items:center;gap:6px;font-size:12px;color:var(--xnow-muted)}",
    "#" + ID + " .xnow-about-tile-value{margin-top:6px;font-size:17px;font-weight:600;color:var(--xnow-text)}",
    "#" + ID + " .xnow-about-tile-detail{margin-top:2px;font-size:12px;color:var(--xnow-sub)}",
    "#" + ID + " .xnow-about-features{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:12px 16px}",
    "#" + ID + " .xnow-about-feature{display:flex;gap:12px}",
    "#" + ID + " .xnow-about-glyph{display:grid;place-items:center;width:34px;height:34px;border-radius:10px;background:var(--xnow-hover);color:var(--xnow-text);flex:0 0 auto}",
    "#" + ID + " .xnow-about-feature-title{font-size:14px;font-weight:600;color:var(--xnow-text)}",
    "#" + ID + " .xnow-about-feature-desc{margin-top:2px;font-size:13px;line-height:1.4;color:var(--xnow-sub)}",
    "#" + ID + " .xnow-about-foot{margin-top:20px;padding-top:16px;border-top:1px solid var(--xnow-border);display:flex;flex-direction:column;gap:12px}",
    "#" + ID + " .xnow-about-links{display:flex;gap:16px;font-size:13px}",
    "#" + ID + " .xnow-about-actions{display:flex;align-items:center;justify-content:space-between;gap:12px;flex-wrap:wrap}",
    "#" + ID + " .xnow-about-credit{margin:0;font-size:13px;color:var(--xnow-sub)}",
    "#" + ID + " .xnow-about-link{color:var(--xnow-accent);text-decoration:none;border-radius:4px}",
    "#" + ID + " .xnow-about-link:hover{text-decoration:underline}",
    "#" + ID + " .xnow-about-ok{padding:8px 18px;border:0;border-radius:999px;background:var(--xnow-accent);color:var(--xnow-accent-ink,#fff);font-size:14px;font-weight:600;line-height:1.2;cursor:pointer}",
    "#" + ID + " button:focus-visible,#" + ID + " a:focus-visible{outline:2px solid var(--xnow-accent);outline-offset:2px}",
    "@media (max-width:480px){#" + ID + " .xnow-about-tiles,#" + ID + " .xnow-about-features{grid-template-columns:1fr}}",
    "@keyframes xnow-about-in{from{opacity:0;transform:scale(.97)}to{opacity:1;transform:none}}",
    "#" + ID + " .xnow-about-card.is-animated{animation:xnow-about-in 180ms var(--xnow-ease)}",
    "@media (prefers-reduced-motion:reduce){#" + ID + " .xnow-about-card.is-animated{animation:none}}"
  ].join("\n");
  overlay.appendChild(style);

  var settings = window.__xnowSettings;
  var reduce = (settings && settings.motion === "reduce") ||
    ((!settings || settings.motion !== "full") && window.matchMedia && matchMedia("(prefers-reduced-motion: reduce)").matches);
  if (!reduce) card.classList.add("is-animated");

  overlay.appendChild(card);
  overlay.addEventListener("click", function (event) { if (event.target === overlay) close(); });
  document.body.appendChild(overlay);
  document.addEventListener("keydown", onKey, true);
  gotIt.focus();
})();
