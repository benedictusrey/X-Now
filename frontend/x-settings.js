// Copyright (c) 2026 Benedictus Reynaldo Hartanto (@benedictusrey). All rights reserved.
// X-Now — High-performance desktop client for X (https://github.com/benedictusrey/X-Now)
// Licensed under the MIT License.

// X-Now Settings panel: a sheet that slides out from X's left panel, grouped the
// way X groups its own settings. The native store (settings.json) is the source of
// truth. Changes show at once, then save in order; a rejected value reverts the
// screen and shows why.
(function () {
  if (window.__xnowSettingsInstalled) return;
  window.__xnowSettingsInstalled = true;

  // Replaced by the native side with the same brand data URI as x-rail.js.
  const BRAND_ICON = "__XNOW_BRAND_ICON__";
  const LOAD_RETRY_MS = 500;
  const LOAD_RETRIES = 10;
  const SVG_NS = "http://www.w3.org/2000/svg";

  const state = { view: null, open: false, lastFocus: null };
  const controls = [];
  const reducedMotion = window.matchMedia?.("(prefers-reduced-motion: reduce)");

  // One icon set, 24px grid, 1.6 stroke, drawn with currentColor. Generic UI
  // glyphs only; no logos are redrawn here.
  const ICONS = {
    close: [{ d: "M18 6 6 18" }, { d: "M6 6l12 12" }],
    window: [{ d: "M3 6.5A2.5 2.5 0 0 1 5.5 4h13A2.5 2.5 0 0 1 21 6.5v11a2.5 2.5 0 0 1-2.5 2.5h-13A2.5 2.5 0 0 1 3 17.5z" }, { d: "M3 9h18" }],
    minimize: [{ d: "M14 10 21 3" }, { d: "M15 3h6v6" }, { d: "M10 14 3 21" }, { d: "M9 21H3v-6" }],
    moon: [{ d: "M20.4 14.5A8.5 8.5 0 0 1 9.5 3.6a8.5 8.5 0 1 0 10.9 10.9z" }],
    speaker: [{ d: "M11 5 6 9H3v6h3l5 4z" }, { d: "M15.5 8.5a5 5 0 0 1 0 7" }, { d: "M18.5 5.5a9 9 0 0 1 0 13" }],
    folder: [{ d: "M3 7a2 2 0 0 1 2-2h4l2 2h8a2 2 0 0 1 2 2v8a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z" }],
    sun: [{ circle: [12, 12, 4] }, { d: "M12 2v2" }, { d: "M12 20v2" }, { d: "M4.9 4.9l1.4 1.4" }, { d: "M17.7 17.7l1.4 1.4" }, { d: "M2 12h2" }, { d: "M20 12h2" }, { d: "M4.9 19.1l1.4-1.4" }, { d: "M17.7 6.3l1.4-1.4" }],
  };

  function icon(name) {
    const svg = document.createElementNS(SVG_NS, "svg");
    svg.setAttribute("viewBox", "0 0 24 24");
    svg.setAttribute("aria-hidden", "true");
    svg.setAttribute("fill", "none");
    svg.setAttribute("stroke", "currentColor");
    svg.setAttribute("stroke-width", "1.6");
    svg.setAttribute("stroke-linecap", "round");
    svg.setAttribute("stroke-linejoin", "round");
    for (const part of ICONS[name] || []) {
      if (part.circle) {
        const [cx, cy, r] = part.circle;
        const node = document.createElementNS(SVG_NS, "circle");
        node.setAttribute("cx", String(cx));
        node.setAttribute("cy", String(cy));
        node.setAttribute("r", String(r));
        svg.appendChild(node);
      } else {
        const node = document.createElementNS(SVG_NS, "path");
        node.setAttribute("d", part.d);
        svg.appendChild(node);
      }
    }
    return svg;
  }

  function invoke(command, args) {
    const call = window.__TAURI__?.core?.invoke;
    if (typeof call !== "function") {
      return Promise.reject(new Error("X-Now native bridge is unavailable."));
    }
    return call(command, args);
  }

  // ── Quiet hours ──────────────────────────────────────────────────────────
  // Local time is only known to the page, so the schedule is evaluated here.
  // The native side stores the window and never needs to know it is active.
  function quietWindow(s) {
    if (!s || s.quietMode === "off") return null;
    if (s.quietMode === "nights") return [23 * 60, 7 * 60];
    return [s.quietStart, s.quietEnd];
  }

  function quietActive(s, date = new Date()) {
    const span = quietWindow(s);
    if (!span) return false;
    const [start, end] = span;
    if (start === end) return false;
    const now = date.getHours() * 60 + date.getMinutes();
    // A window that crosses midnight (e.g. 23:00 to 07:00) wraps around.
    return start < end ? now >= start && now < end : now >= start || now < end;
  }
  window.__xnowQuietActive = quietActive;

  function enforceQuiet() {
    if (!quietActive(window.__xnowSettings)) return;
    document.querySelectorAll("video, audio").forEach(media => {
      if (!media.paused) media.pause();
      media.muted = true;
    });
  }

  // Blocks autoplay while quiet hours are active. Capture phase, because
  // `play` does not bubble.
  document.addEventListener("play", event => {
    const media = event.target;
    if (!(media instanceof HTMLMediaElement) || !quietActive(window.__xnowSettings)) return;
    media.muted = true;
    media.pause();
  }, true);
  setInterval(() => {
    if (document.hidden || !window.__xnowSettings || window.__xnowSettings.quietMode === "off") return;
    enforceQuiet();
  }, 15000);

  // ── Applying settings to the page ────────────────────────────────────────
  // One attribute carries the motion choice. "System" follows the OS preference,
  // so the stylesheet needs a single rule for "reduce".
  function applyToPage(view) {
    const root = document.documentElement;
    const reduce = view.motion === "reduce" || (view.motion !== "full" && Boolean(reducedMotion?.matches));
    if (reduce) root.dataset.xnowMotion = "reduce";
    else if (view.motion === "full") root.dataset.xnowMotion = "full";
    else delete root.dataset.xnowMotion;
    root.classList.toggle("xnow-focus-layout", Boolean(view.focusLayout));
    enforceQuiet();
  }
  reducedMotion?.addEventListener?.("change", () => {
    if (state.view) applyToPage(state.view);
  });

  // Writes and native refreshes serialize on one queue; `writeSeq` prevents
  // an earlier get_settings reply from overwriting a newer optimistic write.
  let writes = Promise.resolve();
  let writeSeq = 0;

  async function loadSettings(retries = LOAD_RETRIES, seqAtStart = writeSeq) {
    try {
      const view = await invoke("get_settings");
      if (seqAtStart !== writeSeq) return;
      state.view = view;
      window.__xnowSettings = view;
      applyToPage(view);
      if (state.open) render();
    } catch (error) {
      // The bridge can arrive after this script runs; retry briefly.
      if (retries > 0) {
        setTimeout(() => loadSettings(retries - 1, seqAtStart), LOAD_RETRY_MS);
      } else {
        console.warn("X-Now could not load settings:", error);
      }
    }
  }

  function save(patch) {
    writeSeq += 1;
    if (state.view) {
      Object.assign(state.view, patch);
      applyToPage(state.view);
      render();
    }
    writes = writes.then(() => write(patch));
    return writes;
  }

  async function write(patch) {
    const seq = writeSeq;
    try {
      const view = await invoke("update_settings", { patch });
      if (seq !== writeSeq) return;
      state.view = view;
      window.__xnowSettings = view;
      applyToPage(view);
      render();
    } catch (error) {
      window.showToast?.(String(error?.message || error), "error");
      await loadSettings(0, writeSeq);
    }
  }

  // ── DOM helpers ──────────────────────────────────────────────────────────
  // X keeps its own Background in the night_mode cookie (0 = Default, 2 = Lights out)
  // and applies it when X loads. The Theme row writes that same cookie, then reloads
  // X. The panel reopens after the reload.
  function readXTheme() {
    const value = (document.cookie.match(/(?:^|;\s*)night_mode=(\d)/) || [])[1];
    return value === "0" ? "light" : value === "2" ? "dark" : null;
  }

  // Waits until test() returns a truthy value, or gives up after ms.
  async function until(test, ms) {
    const end = Date.now() + ms;
    while (Date.now() < end) {
      const value = test();
      if (value) return value;
      await new Promise(resolve => setTimeout(resolve, 60));
    }
    return null;
  }

  // X applies its Background from its Display page. X-Now opens that page inside the
  // same document, clicks the matching radio, and goes back, so nothing reloads. X
  // writes the cookie itself. A plain click() on the radio is ignored; the click has
  // to land on the element under the radio's centre.
  let themeBusy = false;
  async function writeXTheme(theme) {
    if (themeBusy) return;
    themeBusy = true;
    const home = location.pathname;
    const index = theme === "light" ? 0 : 1;
    const want = theme === "light" ? "rgb(255, 255, 255)" : "rgb(0, 0, 0)";
    const radioGroup = () => Array.from(document.querySelectorAll('[role="radiogroup"]'))
      .find(group => group.textContent.includes("Default") && group.textContent.includes("Lights out"));
    let applied = false;
    try {
      history.pushState({}, "", "/settings/display");
      window.dispatchEvent(new PopStateEvent("popstate", { state: history.state }));
      const radio = await until(() => radioGroup()?.querySelectorAll('[role="radio"]')[index], 4000);
      if (radio) {
        const box = radio.getBoundingClientRect();
        // Our own overlay sits over X's controls while the panel is open. Let the hit
        // test see through it, or the click would land on the scrim and close the panel.
        const overlays = [document.getElementById("xnow-settings-scrim"), document.getElementById("xnow-settings")].filter(Boolean);
        overlays.forEach(node => { node.style.pointerEvents = "none"; });
        const hit = document.elementFromPoint?.(box.left + box.width / 2, box.top + box.height / 2) || radio;
        overlays.forEach(node => { node.style.pointerEvents = ""; });
        hit.dispatchEvent(new MouseEvent("click", { bubbles: true, cancelable: true, view: window }));
        applied = Boolean(await until(() => getComputedStyle(document.body).backgroundColor === want, 3000));
      }
      history.back();
      await until(() => location.pathname === home, 4000);
    } finally {
      themeBusy = false;
      window.__xnowReportThemeBackground?.();
      render();
    }
    if (!applied) window.showToast?.("X did not change its Background. Try again.", "error");
  }

  function el(tag, className, text) {
    const node = document.createElement(tag);
    if (className) node.className = className;
    if (text !== undefined) node.textContent = text;
    return node;
  }

  function control(node) {
    controls.push(node);
    return node;
  }

  function switchControl(key, label) {
    const button = el("button", "xnow-switch");
    button.type = "button";
    button.setAttribute("role", "switch");
    button.setAttribute("aria-label", label);
    button.addEventListener("click", () => save({ [key]: !state.view?.[key] }));
    button.sync = () => button.setAttribute("aria-checked", String(Boolean(state.view?.[key])));
    return control(button);
  }

  // Shows the state but cannot change it from the page (system configuration).
  function readOnlySwitch(key, label) {
    const button = switchControl(key, label);
    button.disabled = true;
    return button;
  }

  function fillPercent(input) {
    const min = Number(input.min);
    const max = Number(input.max);
    return ((Number(input.value) - min) / (max - min)) * 100;
  }

  function rangeControl(key, min, max, label, suffix) {
    const wrap = el("div", "xnow-range");
    const input = el("input");
    input.type = "range";
    input.min = String(min);
    input.max = String(max);
    input.step = "1";
    input.setAttribute("aria-label", label);
    const out = el("output", "xnow-range-value");
    const paint = () => input.style.setProperty("--p", `${fillPercent(input)}%`);
    input.addEventListener("input", () => {
      out.textContent = `${input.value}${suffix}`;
      paint();
    });
    input.addEventListener("change", () => save({ [key]: Number(input.value) }));
    wrap.append(input, out);
    wrap.sync = () => {
      const value = state.view?.[key] ?? min;
      input.value = String(value);
      out.textContent = `${value}${suffix}`;
      paint();
    };
    return control(wrap);
  }

  // One tab stop per group (the selected option). Arrow keys move the selection,
  // as they do in every native radio group. A single pill slides under the
  // selected option.
  function segmented(key, options, label, link = {}) {
    const pick = link.write ?? (value => save({ [key]: value }));
    const current = link.read ?? (() => state.view?.[key]);
    const group = el("div", "xnow-seg");
    group.setAttribute("role", "radiogroup");
    group.setAttribute("aria-label", label);
    const pill = el("span", "xnow-seg-pill");
    group.append(pill);
    const buttons = options.map(([value, text]) => {
      const button = el("button", null, text);
      button.type = "button";
      button.setAttribute("role", "radio");
      button.addEventListener("click", () => pick(value));
      group.append(button);
      return [value, button];
    });
    group.addEventListener("keydown", event => {
      const step = { ArrowLeft: -1, ArrowUp: -1, ArrowRight: 1, ArrowDown: 1 }[event.key];
      if (!step) return;
      event.preventDefault();
      const at = buttons.findIndex(([, button]) => button === document.activeElement);
      const [value, next] = buttons[(at + step + buttons.length) % buttons.length];
      next.focus();
      pick(value);
    });
    group.sync = () => {
      const selected = current();
      buttons.forEach(([value, button]) => {
        const on = value === selected;
        button.setAttribute("aria-checked", String(on));
        button.tabIndex = on ? 0 : -1;
        if (on) {
          pill.style.width = `${button.offsetWidth}px`;
          pill.style.transform = `translateX(${button.offsetLeft}px)`;
        }
      });
    };
    return control(group);
  }

  function timeControl(key, label) {
    const input = el("input", "xnow-time");
    input.type = "time";
    input.setAttribute("aria-label", label);
    input.addEventListener("change", () => {
      const [hours, minutes] = input.value.split(":").map(Number);
      if (Number.isFinite(hours) && Number.isFinite(minutes)) {
        save({ [key]: hours * 60 + minutes });
      } else {
        render(); // a cleared field goes back to the saved time
      }
    });
    input.sync = () => {
      const minutes = state.view?.[key] ?? 0;
      const pad = n => String(n).padStart(2, "0");
      input.value = `${pad(Math.floor(minutes / 60))}:${pad(minutes % 60)}`;
    };
    return control(input);
  }

  // A row: label and description on the left, the control on the right. Wide
  // controls (segmented, sliders) stack under the label instead.
  function row(label, description, node, stacked = false) {
    const wrapper = el("div", stacked ? "xnow-row is-stacked" : "xnow-row");
    const text = el("div", "xnow-row-text");
    text.append(el("div", "xnow-row-label", label));
    if (description) text.append(el("div", "xnow-row-desc", description));
    wrapper.append(text, node);
    return wrapper;
  }

  // A section: an icon tile and a heading, then one inset surface holding the rows
  // (X's settings style).
  function section(title, iconName, nodes) {
    const wrapper = el("section", "xnow-set-section");
    const heading = el("div", "xnow-set-heading");
    const tile = el("span", "xnow-set-tile");
    tile.append(icon(iconName));
    heading.append(tile, el("h3", null, title));
    const group = el("div", "xnow-group");
    group.append(...nodes);
    wrapper.append(heading, group);
    return wrapper;
  }

  function agoText(savedAtSeconds) {
    const minutes = Math.round((Date.now() / 1000 - savedAtSeconds) / 60);
    if (minutes < 1) return "just now";
    if (minutes < 60) return `${minutes} min ago`;
    const hours = Math.round(minutes / 60);
    if (hours < 24) return `${hours} h ago`;
    return new Date(savedAtSeconds * 1000).toLocaleDateString();
  }

  // Rebuilt only when the history changes. Rebuilding on every save would drop
  // keyboard focus from the "Show in folder" button.
  function savedList() {
    const list = el("div", "xnow-saved");
    list.sync = () => {
      const items = state.view?.history ?? [];
      const key = items.map(item => `${item.path}@${item.savedAt}`).join("|");
      if (list.dataset.key === key) return;
      list.dataset.key = key;
      list.replaceChildren();
      if (!items.length) {
        list.append(el("p", "xnow-empty", "No saves yet. Open Downloader or right-click media to save it."));
        return;
      }
      items.forEach(item => {
        const line = el("div", "xnow-saved-item");
        const text = el("div", "xnow-row-text");
        const name = item.path.split(/[\\/]/).pop();
        text.append(
          el("div", "xnow-row-label xnow-ellipsis", name),
          el("div", "xnow-row-desc", `${item.kind === "video" ? "Video" : "Image"}, ${agoText(item.savedAt)}`)
        );
        const reveal = el("button", "xnow-pill", "Show in folder");
        reveal.type = "button";
        reveal.addEventListener("click", () => {
          invoke("open_saved_folder", { path: item.path }).catch(error => {
            window.showToast?.(String(error?.message || error), "error");
          });
        });
        line.append(text, reveal);
        list.append(line);
      });
    };
    return control(list);
  }

  // ── Sheet ────────────────────────────────────────────────────────────────
  const STYLE = `
    #xnow-settings-scrim {
      position: fixed;
      inset: 0;
      z-index: 2147483000;
      background: rgba(0, 0, 0, 0.38);
      opacity: 0;
      pointer-events: none;
      transition: opacity 160ms var(--xnow-ease);
    }
    #xnow-settings-scrim.is-open { opacity: 1; pointer-events: auto; }


    #xnow-settings {
      position: fixed;
      top: 0;
      bottom: 0;
      left: var(--xnow-sheet-left, 288px);
      width: min(400px, calc(100vw - var(--xnow-sheet-left, 288px) - 16px));
      z-index: 2147483001;
      display: flex;
      flex-direction: column;
      background: var(--xnow-bg);
      color: var(--xnow-text);
      border-right: 1px solid var(--xnow-border);
      border-radius: 0 var(--xnow-radius-lg) var(--xnow-radius-lg) 0;
      box-shadow: var(--xnow-shadow);
      font: 15px/1.35 "Segoe UI Variable Text", "Segoe UI", system-ui, sans-serif;
      transform: translateX(-12px);
      opacity: 0;
      visibility: hidden;
      transition: transform 140ms var(--xnow-ease), opacity 140ms var(--xnow-ease), visibility 0s linear 140ms;
    }
    #xnow-settings.is-open {
      transform: none;
      opacity: 1;
      visibility: visible;
      transition: transform 200ms var(--xnow-ease), opacity 200ms var(--xnow-ease), visibility 0s;
    }

    .xnow-set-head {
      display: grid;
      grid-template-columns: auto 1fr auto;
      column-gap: 12px;
      align-items: center;
      padding: 18px 20px 14px;
    }
    .xnow-set-brand { width: 28px; height: 28px; border-radius: 8px; }
    .xnow-set-title { margin: 0; font-size: 20px; font-weight: 700; line-height: 1.2; }
    .xnow-set-status { grid-column: 2 / 3; margin: 2px 0 0; font-size: 13px; color: var(--xnow-sub); }
    .xnow-set-close {
      display: grid;
      place-items: center;
      width: 34px;
      height: 34px;
      padding: 0;
      border: 0;
      border-radius: 9999px;
      background: transparent;
      color: var(--xnow-text);
      cursor: pointer;
      transition: background-color 120ms var(--xnow-ease), transform 120ms var(--xnow-ease);
    }
    .xnow-set-close:hover { background: var(--xnow-hover); }
    .xnow-set-close:active { transform: scale(0.94); }
    .xnow-set-close svg { width: 18px; height: 18px; }

    .xnow-set-body { flex: 1; overflow-y: auto; padding: 0 20px 8px; }
    .xnow-set-section { margin-top: 20px; }
    .xnow-set-heading { display: flex; align-items: center; gap: 10px; margin: 0 4px 10px; }
    .xnow-set-tile {
      display: grid;
      place-items: center;
      width: 28px;
      height: 28px;
      border-radius: var(--xnow-radius-sm);
      background: var(--xnow-hover);
      color: var(--xnow-text);
      flex: 0 0 auto;
    }
    .xnow-set-tile svg { width: 16px; height: 16px; }
    .xnow-set-heading h3 { margin: 0; font-size: 15px; font-weight: 600; }
    .xnow-group { background: var(--xnow-raised); border-radius: var(--xnow-radius-lg); }

    .xnow-row {
      display: flex;
      align-items: center;
      gap: 16px;
      min-height: 56px;
      padding: 12px 16px;
    }
    .xnow-row + .xnow-row,
    .xnow-saved-item + .xnow-saved-item { border-top: 1px solid var(--xnow-border); }
    .xnow-row-text { flex: 1; min-width: 0; }
    .xnow-row-label { font-size: 15px; line-height: 1.3; }
    .xnow-row-desc { margin-top: 2px; font-size: 13px; line-height: 1.35; color: var(--xnow-sub); }
    .xnow-row.is-stacked { flex-direction: column; align-items: stretch; gap: 12px; }
    .xnow-ellipsis { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }

    .xnow-switch {
      position: relative;
      flex: 0 0 auto;
      width: 44px;
      height: 24px;
      padding: 0;
      border: 0;
      border-radius: 9999px;
      background: var(--xnow-track);
      cursor: pointer;
      transition: background-color 150ms var(--xnow-ease), transform 120ms var(--xnow-ease);
    }
    .xnow-switch:active { transform: scale(0.96); }
    .xnow-switch::after {
      content: "";
      position: absolute;
      top: 3px;
      left: 3px;
      width: 18px;
      height: 18px;
      border-radius: 50%;
      background: var(--xnow-knob, #ffffff);
      box-shadow: 0 1px 2px rgba(0, 0, 0, 0.3);
      transition: transform 150ms var(--xnow-ease);
    }
    .xnow-switch[aria-checked="true"] { background: var(--xnow-accent); }
    .xnow-switch[aria-checked="true"]::after { transform: translateX(20px); }
    .xnow-switch:disabled { opacity: 0.5; cursor: default; }

    .xnow-seg {
      position: relative;
      display: inline-flex;
      flex: 0 0 auto;
      padding: 3px;
      border: 1px solid var(--xnow-border);
      border-radius: 9999px;
    }
    .xnow-seg-pill {
      position: absolute;
      top: 3px;
      bottom: 3px;
      left: 0;
      width: 0;
      border-radius: 9999px;
      background: var(--xnow-text);
      transition: transform 180ms var(--xnow-ease), width 180ms var(--xnow-ease);
    }
    .xnow-seg button {
      position: relative;
      z-index: 1;
      flex: 0 0 auto;
      padding: 6px 14px;
      border: 0;
      border-radius: 9999px;
      background: transparent;
      color: var(--xnow-sub);
      font: inherit;
      font-size: 13px;
      cursor: pointer;
      transition: color 120ms var(--xnow-ease);
    }
    .xnow-seg button[aria-checked="true"] { color: var(--xnow-bg); font-weight: 600; }
    .xnow-row.is-stacked .xnow-seg { display: flex; }
    .xnow-row.is-stacked .xnow-seg button { flex: 1 1 0; }

    .xnow-range { display: flex; align-items: center; gap: 12px; flex: 0 0 auto; }
    .xnow-range input[type="range"] {
      -webkit-appearance: none;
      appearance: none;
      width: 170px;
      height: 4px;
      border-radius: 2px;
      background: linear-gradient(to right, var(--xnow-accent) var(--p, 0%), var(--xnow-track) var(--p, 0%));
      outline: none;
      accent-color: var(--xnow-accent);
    }
    .xnow-range input[type="range"]::-webkit-slider-thumb {
      -webkit-appearance: none;
      width: 18px;
      height: 18px;
      border-radius: 50%;
      background: var(--xnow-knob, #ffffff);
      box-shadow: 0 1px 3px rgba(0, 0, 0, 0.4);
      transition: box-shadow 120ms var(--xnow-ease);
    }
    .xnow-range input[type="range"]:focus-visible::-webkit-slider-thumb {
      box-shadow: 0 0 0 4px var(--xnow-accent-soft), 0 1px 3px rgba(0, 0, 0, 0.4);
    }
    .xnow-row.is-stacked .xnow-range { width: 100%; }
    .xnow-row.is-stacked .xnow-range input[type="range"] { flex: 1 1 auto; width: auto; }
    .xnow-range-value {
      min-width: 48px;
      padding: 2px 8px;
      border-radius: 9999px;
      background: var(--xnow-hover);
      text-align: center;
      font-size: 13px;
      font-variant-numeric: tabular-nums;
      color: var(--xnow-text);
    }

    .xnow-time {
      flex: 0 0 auto;
      padding: 6px 10px;
      border: 1px solid var(--xnow-border);
      border-radius: var(--xnow-radius-sm);
      background: transparent;
      color: var(--xnow-text);
      font: inherit;
      color-scheme: inherit;
    }

    .xnow-pill {
      flex: 0 0 auto;
      padding: 5px 12px;
      border: 1px solid var(--xnow-border);
      border-radius: 9999px;
      background: transparent;
      color: var(--xnow-text);
      font: inherit;
      font-size: 13px;
      cursor: pointer;
      transition: background-color 120ms var(--xnow-ease), transform 120ms var(--xnow-ease);
    }
    .xnow-pill:hover { background: var(--xnow-hover); }
    .xnow-pill:active { transform: scale(0.96); }

    .xnow-saved { max-height: 240px; overflow-y: auto; }
    .xnow-saved-item {
      display: flex;
      align-items: center;
      gap: 12px;
      min-height: 56px;
      padding: 10px 16px;
    }
    .xnow-empty { margin: 0; padding: 14px 16px; font-size: 13px; color: var(--xnow-sub); }
    .xnow-set-foot {
      padding: 14px 20px 18px;
      border-top: 1px solid var(--xnow-border);
      font-size: 13px;
      color: var(--xnow-sub);
    }

    /* The sheet's own display rules would otherwise override the hidden attribute. */
    #xnow-settings [hidden] { display: none !important; }

    /* Focus layout: hides the trend and promo cards in the right column. The live
       probe found X's cards as <aside> (promos) and <section> (trends) inside
       the sidebar column. The search box is neither, so it stays. */
    html.xnow-focus-layout [data-testid="sidebarColumn"] :is(section, aside) { display: none !important; }

    /* One rule for reduced motion: the Settings choice, or the OS preference
       when the choice is System (applyToPage sets the attribute). */
    html[data-xnow-motion="reduce"] #xnow-settings,
    html[data-xnow-motion="reduce"] #xnow-settings-scrim,
    html[data-xnow-motion="reduce"] .xnow-switch,
    html[data-xnow-motion="reduce"] .xnow-switch::after,
    html[data-xnow-motion="reduce"] .xnow-seg-pill,
    html[data-xnow-motion="reduce"] .xnow-pill,
    html[data-xnow-motion="reduce"] .xnow-set-close {
      transition: none !important;
      transform: none !important;
    }
    @media (prefers-reduced-motion: reduce) {
      html:not([data-xnow-motion="full"]) #xnow-settings,
      html:not([data-xnow-motion="full"]) #xnow-settings-scrim,
      html:not([data-xnow-motion="full"]) .xnow-switch,
      html:not([data-xnow-motion="full"]) .xnow-switch::after,
      html:not([data-xnow-motion="full"]) .xnow-seg-pill,
      html:not([data-xnow-motion="full"]) .xnow-pill,
      html:not([data-xnow-motion="full"]) .xnow-set-close {
        transition: none;
      }
    }
  `;

  let scrim = null;
  let sheet = null;
  let body = null;
  let status = null;

  function statusLine(view) {
    const tray = view.closeToTray ? "Closing hides to tray." : "Closing quits X-Now.";
    let quiet;
    if (quietActive(view)) quiet = "Quiet hours are active now.";
    else if (view.quietMode === "off") quiet = "Quiet hours are off.";
    else {
      const [start] = quietWindow(view);
      const pad = n => String(n).padStart(2, "0");
      quiet = `Quiet hours start at ${pad(Math.floor(start / 60))}:${pad(start % 60)}.`;
    }
    return `${tray} ${quiet}`;
  }

  function render() {
    controls.forEach(node => node.sync?.());
    if (!state.view) return;
    const customRow = body?.querySelector("[data-quiet-custom]");
    if (customRow) customRow.hidden = state.view.quietMode !== "custom";
    const quietStatus = body?.querySelector("[data-quiet-status]");
    if (quietStatus) {
      quietStatus.textContent = quietActive(state.view)
        ? "Active now. Video is muted and paused."
        : state.view.quietMode === "off"
          ? "Off. Videos play as usual."
          : "Not active right now.";
    }
    if (status) status.textContent = statusLine(state.view);
  }

  function build() {
    const style = document.createElement("style");
    style.textContent = STYLE;
    (document.head || document.documentElement).appendChild(style);

    scrim = el("div");
    scrim.id = "xnow-settings-scrim";
    scrim.addEventListener("click", close);

    sheet = el("section");
    sheet.id = "xnow-settings";
    sheet.className = "xnow-ui";
    sheet.setAttribute("role", "dialog");
    sheet.setAttribute("aria-labelledby", "xnow-settings-title");

    const head = el("div", "xnow-set-head");
    const brand = el("img", "xnow-set-brand");
    brand.src = BRAND_ICON;
    brand.alt = "";
    const title = el("h2", "xnow-set-title", "Settings");
    title.id = "xnow-settings-title";
    status = el("p", "xnow-set-status");
    const closeButton = el("button", "xnow-set-close");
    closeButton.type = "button";
    closeButton.setAttribute("aria-label", "Close settings");
    closeButton.append(icon("close"));
    closeButton.addEventListener("click", close);
    head.append(brand, title, closeButton, status);

    body = el("div", "xnow-set-body");
    const customRow = el("div", "xnow-row is-stacked");
    customRow.setAttribute("data-quiet-custom", "");
    const times = el("div", "xnow-range");
    times.append(
      timeControl("quietStart", "Quiet hours start"),
      el("span", "xnow-range-value", "to"),
      timeControl("quietEnd", "Quiet hours end")
    );
    customRow.append(el("div", "xnow-row-text", "Start and end"), times);
    customRow.hidden = true;

    const quietStatus = el("p", "xnow-empty");
    quietStatus.setAttribute("data-quiet-status", "");

    body.append(
      section("Window", "window", [
        row("Hide to tray on close", "Keep running in the tray. Off means closing quits.", switchControl("closeToTray", "Hide to tray on close")),
        row("Keep on top", "Stay above other windows.", switchControl("alwaysOnTop", "Keep on top")),
        row("Start when you sign in", "Set this from the X-Now tray menu.", readOnlySwitch("launchAtLogin", "Start when you sign in")),
      ]),
      section("While minimized", "minimize", [
        row("Pause video", "Stop video while the window is hidden.", switchControl("pauseOnMinimize", "Pause video")),
        row("Mute sound", "Silence X-Now while hidden. Sound returns when you open it.", switchControl("muteOnMinimize", "Mute sound")),
        row("Sleep the page", "Frees most of the page's memory. The feed waits until you return.", switchControl("sleepOnMinimize", "Sleep the page")),
      ]),
      section("Quiet hours", "moon", [
        row("Schedule", "Mute and pause video during these hours.", segmented("quietMode", [["off", "Off"], ["nights", "Nights"], ["custom", "Custom"]], "Quiet hours"), true),
        customRow,
        quietStatus,
      ]),
      section("Media", "speaker", [
        row("Feed video volume", "For videos in your feed.", rangeControl("feedVolume", 0, 100, "Feed video volume", "%"), true),
        row("Opened video volume", "For a video opened on its own.", rangeControl("standaloneVolume", 0, 100, "Opened video volume", "%"), true),
        row("Unmute videos when X-Now is active", "Feed and opened videos play with sound while X-Now is in front.", switchControl("unmuteWhenActive", "Unmute videos when X-Now is active")),
        row("Open Cobalt when a video can't be saved", "Copies the post link and opens Cobalt to save it.", switchControl("cobaltFallback", "Open Cobalt when a video can't be saved")),
      ]),
      section("Saved media", "folder", [savedList()]),
      section("Display", "sun", [
        row("Zoom", "Page zoom for X.", rangeControl("zoomPercent", 50, 300, "Zoom", "%"), true),
        row("Theme", "Same as X's Display setting. Applies at once.",
          segmented("theme", [["light", "Light"], ["dark", "Dark"]], "Theme", { read: readXTheme, write: writeXTheme }), true),
        row("Motion", "Follow Windows, always reduce, or always animate.", segmented("motion", [["system", "System"], ["reduce", "Reduce"], ["full", "Full"]], "Motion"), true),
        row("Focus layout", "Hide trends and promo cards in the right column.", switchControl("focusLayout", "Focus layout")),
      ]),
    );
    const foot = el("div", "xnow-set-foot", "Changes save as you make them.");
    sheet.append(head, body, foot);
    document.body.append(scrim, sheet);
  }

  function open() {
    if (!sheet) build();
    if (state.open) return;
    state.lastFocus = document.activeElement;
    // x-rail.js keeps --xnow-sheet-left on X's panel edge, so the sheet tracks the panel.
    state.open = true;
    scrim.classList.add("is-open");
    sheet.classList.add("is-open");
    window.dispatchEvent(new CustomEvent("xnow:settings-open", { detail: { open: true } }));
    render();
    loadSettings(0);
    sheet.querySelector(".xnow-set-close")?.focus({ preventScroll: true });
  }

  function close() {
    if (!state.open) return;
    state.open = false;
    scrim.classList.remove("is-open");
    sheet.classList.remove("is-open");
    window.dispatchEvent(new CustomEvent("xnow:settings-open", { detail: { open: false } }));
    state.lastFocus?.focus?.({ preventScroll: true });
  }

  window.__xnowOpenSettings = open;
  window.__xnowCloseSettings = close;
  window.__xnowToggleSettings = () => (state.open ? close() : open());
  // Called by the native side when a tray change or another settings write lands.
  window.__xnowSettingsChanged = () => {
    writes = writes.then(() => loadSettings(0, writeSeq));
  };

  // Escape closes the sheet. Tab stays inside it while it is open.
  document.addEventListener("keydown", event => {
    if (!state.open) return;
    if (event.key === "Escape") {
      close();
      return;
    }
    if (event.key !== "Tab") return;
    const stops = Array.from(sheet.querySelectorAll("button, input"))
      .filter(node => !node.disabled && node.tabIndex >= 0 && node.offsetParent !== null);
    if (!stops.length) return;
    const first = stops[0];
    const last = stops[stops.length - 1];
    if (!sheet.contains(document.activeElement)) {
      event.preventDefault();
      first.focus();
    } else if (event.shiftKey && document.activeElement === first) {
      event.preventDefault();
      last.focus();
    } else if (!event.shiftKey && document.activeElement === last) {
      event.preventDefault();
      first.focus();
    }
  });

  function start() {
    build();
    loadSettings();
  }

  // Same rule as x-rail.js: a failure here must not stop the other page scripts.
  function safeStart() {
    try {
      start();
    } catch (error) {
      console.error("[X-Now] settings did not start:", error);
    }
  }
  if (document.body) safeStart();
  else document.addEventListener("DOMContentLoaded", safeStart, { once: true });
})();
