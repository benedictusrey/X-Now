// Copyright (c) 2026 Benedictus Reynaldo Hartanto (@benedictusrey). All rights reserved.
// X-Now — High-performance desktop client for X (https://github.com/benedictusrey/X-Now)
// Licensed under the MIT License.

(function () {
  if (window.__xnowMediaToolsInstalled) return;
  window.__xnowMediaToolsInstalled = true;

  // The native bridge is resolved LAZILY at call time — the Tauri runtime
  // injects `window.__TAURI__` via its own document-start script, whose exact
  // ordering vs. this init script is not guaranteed. A load-time capture can
  // therefore be `undefined` even though the bridge is live (the visible
  // symptom: media saves silently degrade and every path "fails").
  function hasNativeBridge() {
    return typeof window.__TAURI__?.core?.invoke === "function";
  }

  function nativeInvoke(command, args) {
    const inv = window.__TAURI__?.core?.invoke;
    if (typeof inv !== "function") {
      return Promise.reject(new Error("X-Now native bridge is unavailable."));
    }
    return inv(command, args);
  }

  const state = {
    menu: null,
    toast: null,
    progress: null,
    activeVideo: null,
    viewer: null,
    videoAudioUnlocked: false,
    tweetCache: new Map()
  };

  const style = document.createElement("style");
  style.textContent = `
    /* ── X-Now overlay tokens. The page theme sets data-xnow-theme on <html>
       (see applyPageTheme); the values are X's own palette per theme. ── */
    :root {
      --xnow-bg: #000000;
      --xnow-raised: #16181c;
      --xnow-border: #2f3336;
      --xnow-text: #e7e9ea;
      --xnow-muted: #8b98a5;
      --xnow-accent: #1d9bf0;
      --xnow-accent-ink: #ffffff;
      --xnow-knob: #ffffff;
      --xnow-danger: #f4212e;
      --xnow-success: #00ba7c;
      --xnow-hover: rgba(231, 233, 234, 0.1);
      --xnow-accent-soft: rgba(29, 155, 240, 0.16);
      --xnow-sub: #8b98a5;
      --xnow-track: #71767b;
      --xnow-radius-sm: 8px;
      --xnow-radius-md: 12px;
      --xnow-radius-lg: 16px;
      --xnow-ease: cubic-bezier(0.2, 0, 0, 1);
      --xnow-shadow: 0 16px 40px rgba(0, 0, 0, 0.45);
    }
    :root[data-xnow-theme="dim"] {
      --xnow-bg: #15202b;
      --xnow-raised: #192734;
      --xnow-border: #38444d;
    }
    :root[data-xnow-theme="light"] {
      --xnow-bg: #ffffff;
      --xnow-raised: #f7f9f9;
      --xnow-sub: #536471;
      --xnow-track: #536471;
      --xnow-accent: #1a8cd8;
      --xnow-danger: #d7192a;
      --xnow-success: #00875a;
      --xnow-border: #cfd9de;
      --xnow-text: #0f1419;
      --xnow-muted: #536471;
      --xnow-hover: rgba(15, 20, 25, 0.08);
      --xnow-accent-soft: rgba(26, 140, 216, 0.12);
      --xnow-shadow: 0 12px 32px rgba(15, 20, 25, 0.18);
    }

    /* Every X-Now overlay control gets the same keyboard ring. */
    .xnow-ui :focus-visible {
      outline: 2px solid var(--xnow-accent);
      outline-offset: 2px;
    }

    .xnow-media-viewer {
      position: fixed;
      inset: 0;
      z-index: 2147483646;
      display: flex;
      align-items: center;
      justify-content: center;
      padding: 20px;
      background: rgba(0, 0, 0, 0.88);
      font: 13px -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
    }

    .xnow-media-viewer__panel {
      position: relative;
      display: flex;
      flex-direction: column;
      width: min(96vw, 1180px);
      height: min(94vh, 920px);
      overflow: hidden;
      border: 1px solid var(--xnow-border);
      border-radius: var(--xnow-radius-lg);
      background: var(--xnow-bg);
      color: var(--xnow-text);
      box-shadow: var(--xnow-shadow);
      animation: xnow-pop 140ms var(--xnow-ease);
    }

    .xnow-media-viewer__toolbar {
      display: flex;
      align-items: center;
      flex-wrap: wrap;
      gap: 8px;
      min-height: 52px;
      padding: 8px 12px;
      border-bottom: 1px solid var(--xnow-border);
      background: var(--xnow-raised);
      color: var(--xnow-text);
    }

    .xnow-media-viewer__toolbar button,
    .xnow-media-viewer__toolbar input {
      accent-color: var(--xnow-accent);
    }

    .xnow-media-viewer__toolbar button {
      min-width: 32px;
      height: 32px;
      padding: 0 10px;
      border: 1px solid var(--xnow-border);
      border-radius: var(--xnow-radius-sm);
      background: transparent;
      color: var(--xnow-text);
      font: 500 12.5px/1 -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
      cursor: pointer;
      transition: background-color 120ms var(--xnow-ease);
    }

    .xnow-media-viewer__toolbar button:hover {
      background: var(--xnow-accent-soft);
    }

    .xnow-media-viewer__toolbar button.is-primary {
      background: var(--xnow-accent);
      border-color: var(--xnow-accent);
      color: var(--xnow-accent-ink);
      font-weight: 600;
    }

    .xnow-media-viewer__toolbar .xnow-media-viewer__close {
      margin-left: auto;
      font-size: 18px;
      padding: 0 10px;
    }

    .xnow-media-viewer__zoom {
      width: 170px;
      cursor: pointer;
    }

    .xnow-media-viewer__zoom-label {
      min-width: 44px;
      color: var(--xnow-sub);
      text-align: right;
      font-size: 12px;
      font-weight: 600;
      font-variant-numeric: tabular-nums;
    }

    .xnow-media-viewer__hint {
      color: var(--xnow-muted);
      font-size: 11.5px;
      white-space: nowrap;
    }

    .xnow-media-viewer__viewport {
      position: relative;
      flex: 1;
      min-height: 0;
      overflow: hidden;
      cursor: grab;
      touch-action: none;
      user-select: none;
      background: var(--xnow-bg);
    }

    .xnow-media-viewer__viewport:active {
      cursor: grabbing;
    }

    .xnow-media-viewer__image {
      position: absolute;
      top: 50%;
      left: 50%;
      max-width: none;
      max-height: none;
      transform-origin: center center;
      user-select: none;
      pointer-events: none;
    }

    .xnow-media-menu {
      position: fixed;
      z-index: 2147483647;
      min-width: 230px;
      padding: 6px;
      border: 1px solid var(--xnow-border);
      border-radius: var(--xnow-radius-md);
      background: var(--xnow-raised);
      color: var(--xnow-text);
      box-shadow: var(--xnow-shadow);
      font: 13px -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
      transform-origin: top left;
      animation: xnow-pop 120ms var(--xnow-ease);
    }

    .xnow-media-menu button {
      display: block;
      width: 100%;
      padding: 9px 11px;
      border: 0;
      border-radius: var(--xnow-radius-sm);
      background: transparent;
      color: var(--xnow-text);
      text-align: left;
      cursor: pointer;
      transition: background-color 120ms var(--xnow-ease);
    }

    .xnow-media-menu button:hover,
    .xnow-media-menu button:focus-visible {
      background: var(--xnow-accent-soft);
    }

    @keyframes xnow-pop {
      from { opacity: 0; transform: scale(0.97); }
      to { opacity: 1; transform: none; }
    }

    /* Bottom-centre: X floats its Grok and compose buttons at the bottom-right. */
    .xnow-toast {
      position: fixed;
      left: 0;
      right: 0;
      margin: 0 auto;
      width: fit-content;
      bottom: 20px;
      z-index: 2147483647;
      display: flex;
      align-items: center;
      gap: 11px;
      max-width: 380px;
      padding: 12px 16px;
      border: 1px solid var(--xnow-border);
      border-radius: var(--xnow-radius-md);
      background: var(--xnow-raised);
      box-shadow: var(--xnow-shadow);
      font: 13px -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
      color: var(--xnow-text);
      animation: xnow-toast-in 220ms var(--xnow-ease);
      pointer-events: auto;
    }

    .xnow-toast.is-leaving {
      animation: xnow-toast-out 160ms var(--xnow-ease) forwards;
      pointer-events: none;
    }

    @keyframes xnow-toast-in {
      from { opacity: 0; transform: translateY(12px); }
      to { opacity: 1; transform: translateY(0); }
    }

    @keyframes xnow-toast-out {
      from { opacity: 1; transform: translateY(0); }
      to { opacity: 0; transform: translateY(8px); }
    }

    .xnow-toast-icon {
      flex: 0 0 22px;
      width: 22px;
      height: 22px;
      border-radius: 50%;
      display: flex;
      align-items: center;
      justify-content: center;
      font-size: 12px;
      font-weight: 700;
    }

    .xnow-toast-icon.success { background: rgba(0, 186, 124, 0.2); color: var(--xnow-success); }
    .xnow-toast-icon.error { background: rgba(244, 33, 46, 0.2); color: var(--xnow-danger); }
    .xnow-toast-icon.info { background: rgba(29, 155, 240, 0.2); color: var(--xnow-accent); }

    .xnow-toast-spinner {
      width: 14px;
      height: 14px;
      border: 2px solid rgba(29, 155, 240, 0.3);
      border-top-color: var(--xnow-accent);
      border-radius: 50%;
      animation: xnow-toast-spin 0.8s linear infinite;
    }

    @keyframes xnow-toast-spin {
      to { transform: rotate(360deg); }
    }

    /* Reduce motion: the OS preference, or the Settings "Motion" choice.
       "full" opts back in to animation even when the OS asks for less. */
    html[data-xnow-motion="reduce"] .xnow-toast,
    html[data-xnow-motion="reduce"] .xnow-media-menu,
    html[data-xnow-motion="reduce"] .xnow-media-viewer__panel {
      animation: none !important;
      transition: none !important;
    }
    html[data-xnow-motion="reduce"] .xnow-toast-spinner {
      animation-duration: 2.4s !important;
    }
    @media (prefers-reduced-motion: reduce) {
      html:not([data-xnow-motion="full"]) .xnow-toast,
      html:not([data-xnow-motion="full"]) .xnow-media-menu {
        animation: none;
      }
      html:not([data-xnow-motion="full"]) .xnow-toast-spinner {
        animation-duration: 2.4s;
      }
    }

    .xnow-toast-title {
      font-weight: 600;
      line-height: 1.35;
      white-space: normal;
    }

    .xnow-toast-sub {
      margin-top: 2px;
      font-size: 12px;
      line-height: 1.3;
      color: var(--xnow-muted);
      word-break: break-all;
    }

    /* ── X-Now UI polish: denser composer + readable sidebar ──────────── */
    /* Composer ("What's happening?") and reply boxes: 15px text for a
       more native typing experience (X defaults to ~19px). */
    div[data-testid^="tweetTextarea"],
    div[data-testid^="tweetTextarea"] .DraftEditor-root,
    div[data-testid^="tweetTextarea"] .public-DraftEditor-content {
      font-size: 15px !important;
      line-height: 21px !important;
    }

    /* Left sidebar menu (Home, Explore, ..., incl. the "More" button):
       17px for readability. The label spans are forced directly because
       X puts its own font-size utility classes on them. Unread-count
       badges (aria-label="N unread items") are excluded. */
    nav[aria-label="Primary"] a,
    nav[aria-label="Primary"] button,
    nav[aria-label="Primary"] [role="button"],
    nav[aria-label="Primary"] [role="tab"],
    nav[aria-label="Primary"] [data-testid^="AppTabBar_"] {
      font-size: 17px !important;
    }
    nav[aria-label="Primary"] [dir="ltr"] > span:not([aria-label]),
    nav[aria-label="Primary"] [dir="ltr"] > span:not([aria-label]) *,
    nav[aria-label="Primary"] a span:not([aria-label]),
    nav[aria-label="Primary"] a span:not([aria-label]) *,
    nav[aria-label="Primary"] button span:not([aria-label]),
    nav[aria-label="Primary"] button span:not([aria-label]) * {
      font-size: 17px !important;
    }

    /* The "More" flyout and X's dropdown menus: 17px. X puts its own
       font-size utility classes directly on the LABEL SPANS inside menu
       items (Lists, Communities, Business, Ads, Create your Space,
       Settings and privacy, ...), so force the spans too — the container
       rule alone is not enough. */
    [role="menuitem"],
    [role="menu"] a,
    [role="menu"] button,
    [role="menu"] span,
    [role="menu"] span * {
      font-size: 17px !important;
    }

    /* Video mount guard (see __xnowVideoMountGuard below): a freshly mounted
       feed video with no poster frame stays unrendered until its first frame
       decodes, so the white card shows through instead of the player's black
       chrome. visibility (not display) keeps X's layout metrics untouched. */
    [data-xnow-mount-wait] {
      visibility: hidden !important;
    }

  `;

  function appendStyle() {
    if (document.documentElement) document.documentElement.appendChild(style);
    else document.addEventListener("DOMContentLoaded", appendStyle, { once: true });
  }

  appendStyle();

  function elementFromTarget(target) {
    if (target instanceof Element) return target;
    return target?.parentElement instanceof Element ? target.parentElement : null;
  }

  function isVisible(element) {
    if (!(element instanceof Element)) return false;
    const rect = element.getBoundingClientRect();
    return rect.width > 0 && rect.height > 0 && getComputedStyle(element).visibility !== "hidden";
  }

  // X renders posts as <article data-testid="tweet"> and opens media in
  // [role=dialog] lightboxes; player containers carry data-testid="videoPlayer".
  function isPostImage(image) {
    if (!(image instanceof HTMLImageElement)) return false;
    const rect = image.getBoundingClientRect();
    const hasPostContext = Boolean(image.closest("article, [role=dialog]"));
    return (hasPostContext || (rect.width >= 260 && rect.height >= 260))
      && rect.width >= 120
      && rect.height >= 120
      && !image.closest("header, nav, aside, .xnow-media-viewer");
  }

  function isPostVideo(video) {
    if (!(video instanceof HTMLVideoElement)) return false;
    const rect = video.getBoundingClientRect();
    const hasPostContext = Boolean(video.closest("article, [role=dialog]"));
    return (hasPostContext || (rect.width >= 260 && rect.height >= 260))
      && rect.width >= 120
      && rect.height >= 120
      && !video.closest("header, nav, aside, .xnow-media-viewer");
  }

  function mediaFromTarget(target) {
    const element = elementFromTarget(target);
    const media = element?.closest?.("img, video");
    if (media instanceof HTMLImageElement && isPostImage(media)) return media;
    if (media instanceof HTMLVideoElement && isPostVideo(media)) return media;
    return null;
  }

  function mediaAtPoint(x, y) {
    const elements = document.elementsFromPoint?.(x, y) || [];
    for (const element of elements) {
      const media = mediaFromTarget(element);
      if (media) return media;
    }

    const article = elements.find(element => element.closest?.("article"))?.closest?.("article");
    if (!article) return null;
    const candidates = article.querySelectorAll("img, video");
    for (const media of candidates) {
      const rect = media.getBoundingClientRect();
      if (x >= rect.left && x <= rect.right && y >= rect.top && y <= rect.bottom) {
        if (media instanceof HTMLImageElement && isPostImage(media)) return media;
        if (media instanceof HTMLVideoElement && isPostVideo(media)) return media;
      }
    }
    return null;
  }

  function isStandaloneVideo(video) {
    return Boolean(video?.closest?.("[role=dialog]"))
      || /^\/(?:i\/video\/|[^/]+\/status\/\d+\/video\/)/i.test(window.location.pathname);
  }

  // Volumes come from Settings (x-settings.js). Until those load, the shipped
  // defaults apply.
  function defaultVolumeForVideo(video) {
    const s = window.__xnowSettings;
    return isStandaloneVideo(video)
      ? (s?.standaloneVolume ?? 50) / 100
      : (s?.feedVolume ?? 20) / 100;
  }

  // Overlay palette follows the page: black, dim or light, by background luminance.
  function applyPageTheme(r, g, b) {
    const luminance = (0.2126 * r + 0.7152 * g + 0.0722 * b) / 255;
    document.documentElement.dataset.xnowTheme =
      luminance < 0.03 ? "black" : luminance < 0.5 ? "dim" : "light";
  }

  function applyDefaultVideoAudio(video) {
    if (!(video instanceof HTMLVideoElement)) return;
    const standalone = isStandaloneVideo(video);
    const volume = defaultVolumeForVideo(video);
    // The profile includes the volume, so a changed Settings value reaches videos already on the page.
    const open = standalone || state.videoAudioUnlocked || window.__xnowSettings?.unmuteWhenActive === true;
    const profile = `${standalone ? "standalone" : "feed"}:${volume}:${open ? "open" : "locked"}`;
    if (video.dataset.xnowAudioProfile === profile) return;
    try {
      video.volume = volume;
      // Feed videos follow X's own muted-autoplay rule until the user has interacted
      // with any media, or the active-window setting is on. After that, X's mute state is the authority.
      if (!open) video.muted = true;
      video.dataset.xnowAudioProfile = profile;
    } catch (error) {
      console.warn("X-Now could not apply the video audio default:", error);
    }
  }

  function activateVideoAudio(video) {
    if (!(video instanceof HTMLVideoElement)) return;
    try {
      state.videoAudioUnlocked = true;
      video.volume = defaultVolumeForVideo(video);
      video.muted = false;
      video.dataset.xnowAudioUserActivated = "1";
    } catch (error) {
      console.warn("X-Now could not enable video audio after the user gesture:", error);
    }
  }

  // The user's own gesture on a video (play/unmute click) marks the session
  // as audio-unlocked — without ever blocking X's native player controls (no
  // stopImmediatePropagation here). From the first media interaction on, X's
  // own mute state is the authority and X-Now only nudges volume for
  // standalone (lightbox) playback. X-Now does NOT pause the other videos on
  // the gesture: X's player owns that policy while the window is visible, and
  // a second enforcer here produced glitchy play/pause tug-of-war around
  // media transitions (see the IntersectionObserver note below).
  window.addEventListener("pointerdown", event => {
    if (event.button !== 0) return;
    const media = mediaFromTarget(event.target) || mediaAtPoint(event.clientX, event.clientY);
    if (!(media instanceof HTMLVideoElement)) return;
    state.activeVideo = media;
    state.videoAudioUnlocked = true;
    if (isStandaloneVideo(media)) activateVideoAudio(media);
  }, true);

  // "Unmute videos when X-Now is active" (Settings). Unmutes each source once, and only
  // while X-Now is the focused, visible window, so a mute set afterwards stays until the source changes.
  function unmuteForActiveWindow(video) {
    if (!(video instanceof HTMLVideoElement)) return;
    if (window.__xnowSettings?.unmuteWhenActive !== true) return;
    if (document.visibilityState !== "visible" || !document.hasFocus()) return;
    if (video.dataset.xnowFgSrc === video.currentSrc) return;
    try {
      video.volume = defaultVolumeForVideo(video);
      video.muted = false;
      video.dataset.xnowFgSrc = video.currentSrc;
    } catch (error) {
      console.warn("X-Now could not unmute the video in the foreground:", error);
    }
  }
  document.addEventListener("play", event => unmuteForActiveWindow(event.target), true);
  window.addEventListener("focus", () => {
    if (state.activeVideo && !state.activeVideo.paused) unmuteForActiveWindow(state.activeVideo);
  });

  function isVideoOnScreen(video) {
    const rect = video.getBoundingClientRect();
    return rect.bottom > 0
      && rect.right > 0
      && rect.top < window.innerHeight
      && rect.left < window.innerWidth;
  }

  function visibleVideos() {
    return Array.from(document.querySelectorAll("video"))
      .filter(video => isVisible(video) && isVideoOnScreen(video) && isPostVideo(video));
  }

  // ── IntersectionObserver: track the in-view video (NO forced playback) ────
  // X's own player engine already autoplays in-view videos and pauses the rest
  // as the feed scrolls between static text/image posts and video posts. This
  // observer used to ALSO force play() and pause the neighbors at every 50%
  // visibility crossing — a second autoplay engine racing X's: both issued
  // competing play/pause commands around every static↔video transition, which
  // surfaced as stutter/glitching exactly when video posts started and stopped.
  // X-Now now only REMEMBERS the in-view video (state.activeVideo — used by the
  // hide/resume helpers and diagnostics) and applies audio defaults; playback
  // itself stays 100% X's decision.
  const observer = new IntersectionObserver(entries => {
    entries.forEach(entry => {
      const video = entry.target;
      if (!(video instanceof HTMLVideoElement)) return;
      if (entry.isIntersecting && entry.intersectionRatio >= 0.5) {
        state.activeVideo = video;
        applyDefaultVideoAudio(video);
      }
    });
  }, { threshold: [0.5] });

  // ── Video mount guard: no black gap between card and first frame ────────
  // Evidence (screencast harness, scripts/xnow-screencast-flash-test.js,
  // tile-flip-diff.js): when a feed video player mounts or swaps sources, X
  // paints its embedded-player chrome BLACK for the first ~3 compositor
  // frames before any content — poster image OR first video frame — paints:
  // a coherent ~500x240 region observed flipping light→dark→light in
  // lockstep with loadstart/loadeddata events at every static↔video post
  // transition. Users see this as the jaggy black flash while scrolling.
  // Fix: a freshly mounted (or src-swapped) <video> with no decodable frame
  // stays unrendered — along with its nearest dark-surfaced player wrapper,
  // which is the actual black rectangle (X's "Embedded video" chrome
  // computes to rgb(0,0,0) even in the light theme) — until real content is
  // ready (loadeddata/canplay/playing). NOTE: X's feed videos always carry a
  // poster ATTRIBUTE, but the poster is not yet PAINTED at mount, so the
  // attribute is no reason to exempt them (live probe: guard never engaged
  // with the poster exemption; every sampled video had poster set).
  // Layout, geometry and X's own autoplay engine are untouched; a 1.5 s
  // timeout guarantees nothing can stay hidden if a stream stalls (prefer a
  // visible player over a missing one).
  const MOUNT_GUARD_ATTR = "data-xnow-mount-wait";
  const MOUNT_GUARD_TIMEOUT_MS = 1500;
  const mountGuardStats = { marked: 0, released: 0 };

  function isDarkSurface(color) {
    // rgb(r, g, b) with full alpha and low luminance = X's black player chrome
    const m = color && color.match(/^rgb\((\d+), (\d+), (\d+)\)$/);
    if (!m) return false;
    return (0.299 * m[1] + 0.587 * m[2] + 0.114 * m[3]) <= 40;
  }

  function mountGuardRelease(el) {
    if (el && el.getAttribute && el.getAttribute(MOUNT_GUARD_ATTR) !== null) {
      el.removeAttribute(MOUNT_GUARD_ATTR);
      mountGuardStats.released++;
    }
  }

  function mountGuardCleanup(video) {
    if (!video) return;
    if (video.__xnowGuardTimer) {
      window.clearTimeout(video.__xnowGuardTimer);
      video.__xnowGuardTimer = 0;
    }
    if (video.__xnowGuardAbort) {
      video.__xnowGuardAbort.abort();
      video.__xnowGuardAbort = null;
    }
  }

  function mountGuardReleaseTree(video) {
    mountGuardCleanup(video);
    mountGuardRelease(video);
    const host = video && video.__xnowGuardHost;
    if (host) {
      mountGuardRelease(host);
      video.__xnowGuardHost = null;
    }
  }

  function mountGuardMark(video, { force = false } = {}) {
    if (!(video instanceof HTMLVideoElement)) return;
    // The readyState gate only applies to fresh mounts: on loadstart/emptied
    // re-arms (force), Chromium can still report the PREVIOUS stream's
    // readyState (>=2) even though the element is about to tear down to
    // frameless and paint black — skipping the mark there left a residual
    // black-gap at recycled-player swaps (live A/B, confirm-run1 frames
    // 268-270). Forced marks bypass the stale-frame check.
    if (!force && video.readyState >= 2) return; // a frame is already decodable
    if (video.getAttribute(MOUNT_GUARD_ATTR) !== null && !force) return;
    // Cancel any prior arm's timeout/listeners so an old timer from a previous
    // post cannot prematurely unhide this recycled element mid-load.
    mountGuardCleanup(video);
    const gen = (video.__xnowGuardGen || 0) + 1;
    video.__xnowGuardGen = gen;
    if (video.getAttribute(MOUNT_GUARD_ATTR) === null) {
      video.setAttribute(MOUNT_GUARD_ATTR, "1");
      mountGuardStats.marked++;
    }
    // The video element is often transparent; the black rectangle users see
    // is the player wrapper behind it. Hide the nearest ancestor whose own
    // computed background is a solid dark surface (transparent ancestors are
    // skipped — in dark theme the card is dark anyway and hiding is a no-op).
    if (!video.__xnowGuardHost) {
      try {
        let node = video.parentElement;
        for (let depth = 0; node && depth < 4; depth++, node = node.parentElement) {
          const bg = getComputedStyle(node).backgroundColor;
          if (isDarkSurface(bg)) {
            node.setAttribute(MOUNT_GUARD_ATTR, "1");
            video.__xnowGuardHost = node;
            break;
          }
        }
      } catch (_) { /* getComputedStyle unavailable — element-level guard still on */ }
    }
    const release = () => {
      if (video.__xnowGuardGen !== gen) return;
      mountGuardReleaseTree(video);
    };
    const ac = typeof AbortController === "function" ? new AbortController() : null;
    video.__xnowGuardAbort = ac;
    const opts = ac ? { once: true, signal: ac.signal } : { once: true };
    video.addEventListener("loadeddata", release, opts);
    video.addEventListener("canplay", release, opts);
    video.addEventListener("playing", release, opts);
    video.__xnowGuardTimer = window.setTimeout(release, MOUNT_GUARD_TIMEOUT_MS);
  }

  function mountGuardSweep(root) {
    (root || document).querySelectorAll("video").forEach(mountGuardMark);
  }

  // Source swaps on recycled players are caught by loadstart/emptied; fresh
  // mounts are handled in the unified MutationObserver in observeVideoChanges.
  ["loadstart", "emptied"].forEach((type) => {
    document.addEventListener(type, (ev) => {
      if (ev.target instanceof HTMLVideoElement) mountGuardMark(ev.target, { force: true });
    }, true);
  });

  // Test/diagnostic surface (harness pattern: window.__xnow*)
  window.__xnowVideoMountGuard = {
    mark: mountGuardMark,
    release: mountGuardReleaseTree,
    sweep: mountGuardSweep,
    stats: mountGuardStats,
    ATTR: MOUNT_GUARD_ATTR,
    TIMEOUT_MS: MOUNT_GUARD_TIMEOUT_MS,
  };

  function linkFromTarget(target) {
    const element = elementFromTarget(target);
    const link = element?.closest?.("a[href]");
    return link && /^https?:\/\//i.test(link.href) ? link : null;
  }

  function linkAtPoint(x, y) {
    const element = document.elementsFromPoint?.(x, y)?.find(item => item.closest?.("a[href]"));
    return linkFromTarget(element);
  }

  function sourceUrl(media) {
    const candidates = [
      media.currentSrc,
      media.src,
      media.getAttribute("src"),
      ...["data-src", "data-video-url", "data-media-url", "data-original"]
        .map(attribute => media.getAttribute(attribute)),
      ...Array.from(media.querySelectorAll?.("source[src]") || []).map(source => source.src)
    ];
    if (media instanceof HTMLImageElement) candidates.push(media.poster);
    return candidates.find(url => /^(https?:\/\/|blob:)/i.test(url || "")) || "";
  }

  // X post URL: https://x.com/<handle>/status/<id> — the anchor is the
  // tweet's own link; the canonical <link> is the fallback.
  function normalizeXPostUrl(href) {
    if (!href) return "";
    try {
      const url = new URL(href, window.location.href);
      if (url.origin !== window.location.origin) return "";
      if (!/^\/[^/]+\/status\/\d+/i.test(url.pathname)) return "";
      // X suffixes post links (/status/123/photo/1, /video/1, /analytics) —
      // those routes serve NO video content, so always resolve to the clean
      // status page, which carries the post's media URLs.
      url.pathname = url.pathname.replace(/(\/status\/\d+)\/.*$/i, "$1");
      return url.href;
    } catch (error) {
      return "";
    }
  }

  function postUrlForMedia(media) {
    for (let current = media; current instanceof Element; current = current.parentElement) {
      if (!current.matches("a[href]")) continue;
      const url = normalizeXPostUrl(current.href);
      if (url) return url;
    }
    const container = media.closest("article, [role=dialog]");
    if (container) {
      const links = Array.from(container.querySelectorAll("a[href*='/status/']"));
      // Prefer the status link that actually wraps the media (dialog views can
      // contain several posts), then the container's first status link.
      const link = links.find(candidate => candidate.contains(media)) || links[0];
      if (link) {
        const url = normalizeXPostUrl(link.href);
        if (url) return url;
      }
    }
    const canonicalUrl = document.querySelector("link[rel='canonical']")?.href
      || document.querySelector("meta[property='og:url']")?.content;
    return normalizeXPostUrl(canonicalUrl);
  }

  function mediaUrlsFromResources(media) {
    const isVideo = media instanceof HTMLVideoElement;
    const entries = (typeof window.performance?.getEntriesByType === "function"
      ? window.performance.getEntriesByType("resource")
      : []) || [];
    const resources = entries
      .filter(entry => /^https?:\/\//i.test(entry.name || ""))
      .filter(entry => {
        const url = entry.name || "";
        // X UI assets (the login-card animation, icons, etc.) are loaded as
        // videos/images but are NEVER post media — never save them.
        if (/twimg\.com\/static\//i.test(url) || /abs\.twimg\.com\//i.test(url)) return false;
        const initiatorType = String(entry.initiatorType || "").toLowerCase();
        if (isVideo && initiatorType === "video") return true;
        // Note: modern X image URLs carry NO file extension — the format lives
        // in the query (?format=jpg&name=240x240) — so match by twimg host.
        return isVideo
          ? /video\.twimg\.com\//i.test(url) || /\.mp4(?:[?#]|$)/i.test(url)
          : /(?:pbs|video)\.twimg\.com\//i.test(url);
      })
      .map(entry => entry.name);
    return Array.from(new Set(resources.reverse()));
  }

  // X's video elements carry a poster thumbnail whose URL shares the video's
  // numeric ID (ext_tw_video_thumb/<ID> or amplify_video_thumb/<ID>). The
  // video's stream URL (video.twimg.com/ext_tw_video/<ID> or
  // /amplify_video/<ID>) carries the same ID — a strong scoping signal that
  // pins page-wide resource entries to the CLICKED video.
  function videoIdFromPoster(media) {
    const poster = media?.poster || media?.getAttribute?.("poster") || "";
    const match = String(poster).match(/(?:ext_tw_video|amplify_video)_thumb\/(\d+)/);
    return match ? match[1] : "";
  }

  function scopedVideoResources(media) {
    const id = videoIdFromPoster(media);
    if (!id) return []; // never page-wide for videos — attribution impossible
    const needle = `/${id}/`;
    const all = mediaUrlsFromResources(media);
    const scoped = all.filter(url => url.includes(needle));
    return scoped.length ? scoped : [];
  }

  // Only URLs we can actually save: no HLS playlists (m3u8 / /pl/ paths),
  // and no X UI assets (login-card animation, icons) — they are loaded as
  // videos/images but are NEVER post media.
  function isUsableMediaUrl(url) {
    return /^https?:\/\//i.test(url)
      && !/\.m3u8(?:[?#]|$)/i.test(url)
      && !/\/pl\//i.test(url)
      && !/twimg\.com\/static\//i.test(url)
      && !/abs\.twimg\.com\//i.test(url);
  }

  // X serves every image in resolution variants of the same media ID
  // (?name=small|medium|large|orig). The feed element usually exposes a small
  // thumbnail — offer the full-resolution variants as candidates so saving
  // gets the ORIGINAL, not the thumbnail.
  function resolutionVariants(url) {
    try {
      const parsed = new URL(url);
      if (!/(?:pbs|video)\.twimg\.com\//i.test(parsed.hostname + parsed.pathname)) return [];
      const base = `${parsed.origin}${parsed.pathname}`;
      const rawFmt = (parsed.searchParams.get("format") || "jpg").toLowerCase();
      // Prefer JPG over WebP for universal image viewer/editor compatibility,
      // while preserving lossless PNG when X serves PNG.
      const compatFmt = rawFmt === "webp" || rawFmt === "jpeg" ? "jpg" : rawFmt;
      const variants = [
        `${base}?format=${compatFmt}&name=orig`,
        `${base}?format=${compatFmt}&name=large`
      ];
      return variants.filter(variant => variant !== url);
    } catch (error) {
      return [];
    }
  }

  // X embeds JSON-escaped and HTML-escaped URLs in its pages — unescape them
  // so candidate URLs are actually fetchable (ported from the IG-Now tools).
  function normalizeMediaUrl(url) {
    return String(url || "")
      .replaceAll("\\u0026", "&")
      .replaceAll("\\u003A", ":")
      .replaceAll("\\u002F", "/")
      .replaceAll("\\u003F", "?")
      .replaceAll("\\u003D", "=")
      .replaceAll("\\/", "/")
      .replaceAll("&amp;", "&");
  }

  // The IG-Now method: probe the post's own page for its canonical media —
  // og:video / og:image metas plus any video.twimg / pbs.twimg URLs embedded
  // in the HTML. Covers the cases where the <video> only exposes a blob: URL
  // (MSE streaming) and resource entries are missing.
  async function mediaUrlsFromPost(postUrl) {
    if (!postUrl) return [];
    try {
      const response = await fetch(postUrl, { credentials: "include" });
      if (!response.ok) return [];
      const html = await response.text();
      const fragment = new DOMParser().parseFromString(html, "text/html");
      const metaUrls = Array.from(fragment.querySelectorAll(
        "meta[property='og:video'], meta[property='og:video:secure_url'], " +
        "meta[property='og:video:url'], meta[property='og:image'], " +
        "meta[property='og:image:secure_url'], meta[property='twitter:player:stream'], " +
        "meta[property='twitter:player:stream:content_type']"
      )).map(meta => normalizeMediaUrl(meta.content));
      const textUrls = normalizeMediaUrl(html).match(/https?:\/\/[^"'\s]+/g) || [];
      const candidates = [...metaUrls, ...textUrls].filter(url =>
        isUsableMediaUrl(url)
        && (/video\.twimg\.com\//i.test(url)
          || (/pbs\.twimg\.com\//i.test(url) && (/\.(?:jpe?g|png|webp|avif)(?:[?#]|$)/i.test(url) || /\/media\//i.test(url)))
          || /\.mp4(?:[?#]|$)/i.test(url)));
      return Array.from(new Set(candidates));
    } catch (error) {
      console.warn("X-Now could not inspect the post page for media URLs:", error);
      return [];
    }
  }

  async function mediaUrlCandidates(media, { includePostFetch = true } = {}) {
    const directUrl = sourceUrl(media);
    const candidates = [];
    const addCandidate = url => {
      if (!url || candidates.includes(url)) return;
      candidates.push(url);
    };
    const directIsUsable = isUsableMediaUrl(directUrl);
    // Order: element/variant URLs, then POST-SCOPED candidates (the clicked
    // post page's video/image URLs — never a neighbour), then for videos only
    // the resources scoped to the clicked element via its poster's media ID.
    // Skip fetching the full post HTML when the element already exposes a
    // direct https:// media URL (fallback fetches it only if direct saves fail).
    if (media instanceof HTMLImageElement) {
      resolutionVariants(directUrl).forEach(addCandidate);
      addCandidate(directUrl);
      if (includePostFetch && !directIsUsable) {
        (await mediaUrlsFromPost(postUrlForMedia(media))).forEach(addCandidate);
      }
      mediaUrlsFromResources(media).forEach(addCandidate);
    } else {
      addCandidate(directUrl);
      resolutionVariants(directUrl).forEach(addCandidate);
      if (includePostFetch && !directIsUsable) {
        (await mediaUrlsFromPost(postUrlForMedia(media))).forEach(addCandidate);
      }
      scopedVideoResources(media).forEach(addCandidate);
    }
    return candidates.filter(isUsableMediaUrl);
  }

  function openDefaultBrowser(url) {
    if (!/^https?:\/\//i.test(url || "")) return;
    if (hasNativeBridge()) {
      nativeInvoke("open_external_url", { url }).catch(() => {
        window.open(url, "_blank", "noopener,noreferrer");
      });
      return;
    }
    window.open(url, "_blank", "noopener,noreferrer");
  }

  // Fade the card out, then remove it. The timer guarantees removal even when
  // animations are disabled.
  function leaveToast(el) {
    if (!el || el.classList.contains("is-leaving")) return;
    el.classList.add("is-leaving");
    window.setTimeout(() => el.remove(), 170);
  }

  // Bottom-right notification card: icon + title + optional sub-line.
  // kind: "spinner" (sticky, no auto-dismiss) | "success" | "error" | "info".
  function renderToast({ title, sub = "", kind = "success", sticky = false }) {
    // A progress card is replaced only by another progress card, or dismissed
    // when its save ends, so an unrelated toast cannot hide it mid-download.
    if (sticky) state.progress?.remove();
    else leaveToast(state.toast);
    const toast = document.createElement("div");
    toast.className = "xnow-toast xnow-ui";
    // Errors interrupt assistive tech; other states are polite status updates.
    toast.setAttribute("role", kind === "error" ? "alert" : "status");

    const icon = document.createElement("div");
    icon.className = `xnow-toast-icon ${kind}`;
    if (kind === "spinner") {
      const ring = document.createElement("span");
      ring.className = "xnow-toast-spinner";
      icon.appendChild(ring);
    } else {
      icon.textContent = kind === "error" ? "✕" : kind === "info" ? "ℹ" : "✓";
    }

    const body = document.createElement("div");
    body.className = "xnow-toast-body";
    const titleEl = document.createElement("div");
    titleEl.className = "xnow-toast-title";
    titleEl.textContent = title;
    body.appendChild(titleEl);
    if (sub) {
      const subEl = document.createElement("div");
      subEl.className = "xnow-toast-sub";
      subEl.textContent = sub;
      body.appendChild(subEl);
    }

    toast.append(icon, body);
    document.body.appendChild(toast);
    if (sticky) {
      state.progress = toast;
      return toast;
    }
    state.toast = toast;
    window.setTimeout(() => {
      if (state.toast === toast) {
        state.toast = null;
        leaveToast(toast);
      }
    }, 4500);
    return toast;
  }

  // Backward-compatible surface (also used by Rust-side tray evals).
  function showToast(message, kind = "success") {
    renderToast({ title: message, kind });
  }
  window.showToast = showToast;

  // Success card: "Saved video/image" + the download folder as the sub-line.
  function showSavedToast(kind, savedPath) {
    const folder = String(savedPath || "").replace(/[\\/][^\\/]+$/, "");
    renderToast({
      title: `Saved ${kind} ✓`,
      sub: folder || "the X-Now folder in Downloads",
      kind: "success"
    });
  }

  async function saveBytesInApp(buffer, kind) {
    if (!hasNativeBridge()) throw new Error("X-Now native bridge is unavailable.");
    const bytes = Array.from(new Uint8Array(buffer));
    return nativeInvoke("save_media_bytes", { data: bytes, mediaType: kind });
  }

  async function downloadFromSignedInPage(url, kind) {
    // Cross-origin media fetch: twimg serves `access-control-allow-origin: *`,
    // which the browser REJECTS when credentials are included — omit them so
    // the CORS check passes for public media (session-protected media falls
    // back to the native curl path with the post referer).
    const response = await fetch(url, {
      credentials: "omit",
      cache: "no-store"
    });
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    const contentType = response.headers.get("content-type") || "";
    if (/text\/html|application\/json/i.test(contentType)) {
      throw new Error(`X returned ${contentType} instead of media.`);
    }
    const buffer = await response.arrayBuffer();
    if (!buffer.byteLength) throw new Error("X returned an empty media response.");
    return saveBytesInApp(buffer, kind);
  }

  // IG-Now's video hand-off: copy the exact post link, prepare the download
  // folder, and open cobalt.tools with the link pre-filled — the user picks
  // the format there and saves into the prepared folder.
  async function openCobaltForVideo(media) {
    const postUrl = postUrlForMedia(media);
    if (!postUrl) {
      showToast("X did not expose a post link. Use More > Copy link, then open cobalt.tools.");
      return;
    }
    try {
      await navigator.clipboard?.writeText(postUrl);
    } catch (error) {
      console.warn("X-Now could not copy the post link:", error);
    }

    let downloadFolder = "the X-Now folder in Downloads";
    if (hasNativeBridge()) {
      try {
        downloadFolder = await nativeInvoke("prepare_download_folder");
      } catch (error) {
        console.warn("X-Now could not prepare the download folder:", error);
      }
    }

    const cobaltUrl = `https://cobalt.tools/?u=${encodeURIComponent(postUrl)}`;
    openDefaultBrowser(cobaltUrl);
    showToast(`Copied the post link and opened Cobalt. Choose Save and use ${downloadFolder}.`, "info");
  }

  // Success-side diagnostics: mirror the chosen source + candidates into the
  // page title so the Rust side logs them (XNOWLOG: branch). The app log then
  // shows exactly what was resolved for every save.
  function logSaveDiagnostics(kind, source, sources, postUrl) {
    try {
      const summary = {
        kind,
        source: String(source || "").slice(0, 200),
        postUrl: String(postUrl || "").slice(0, 150),
        candidates: (sources || []).slice(0, 5).map(u => String(u).slice(0, 150))
      };
      document.title = `XNOWLOG:${JSON.stringify(summary)}`.slice(0, 900);
    } catch (error) {
      console.warn("X-Now could not set the diagnostic title:", error);
    }
  }

  // The progress card is dismissed however the save ends.
  async function saveMedia(media) {
    try {
      await saveMediaInner(media);
    } finally {
      dismissProgress();
    }
  }

  function dismissProgress() {
    state.progress?.remove();
    state.progress = null;
  }

  // The Cobalt hand-off is the video fallback. The Settings switch can turn it off.
  async function handOffVideo(media) {
    if (window.__xnowSettings?.cobaltFallback === false) {
      showToast("X did not expose a direct video URL. Open the post in your browser to save it.", "info");
      return;
    }
    await openCobaltForVideo(media);
  }

  async function saveMediaInner(media) {
    const kind = media instanceof HTMLVideoElement ? "video" : "image";
    const postUrl = postUrlForMedia(media);
    const referer = postUrl || "https://x.com/";

    // "Downloading…" card (bottom-right, spinner, stays until done).
    renderToast({ title: `Downloading ${kind}…`, sub: "Please wait", kind: "spinner", sticky: true });

    let sources = await mediaUrlCandidates(media);
    // If direct/variant URLs fail, fetch the post page as a second pass.
    const trySources = async list => {
      let lastErr = "";
      for (const source of list) {
        if (hasNativeBridge()) {
          try {
            const savedPath = await nativeInvoke("download_media", {
              url: source,
              mediaType: kind,
              referer
            });
            logSaveDiagnostics(kind, source, list, postUrl);
            showSavedToast(kind, savedPath);
            return { ok: true, error: "" };
          } catch (error) {
            lastErr = String(error?.message || error);
            console.warn("X-Now native URL media download failed; trying the next source:", error);
          }
        }
        try {
          const savedPath = await downloadFromSignedInPage(source, kind);
          logSaveDiagnostics(kind, source, list, postUrl);
          showSavedToast(kind, savedPath);
          return { ok: true, error: "" };
        } catch (error) {
          lastErr = String(error?.message || error);
          console.warn("X-Now signed-in media save failed; trying the next source:", error);
        }
      }
      return { ok: false, error: lastErr };
    };

    console.warn("[X-Now] saveMedia candidates:", sources);
    let outcome = sources.length ? await trySources(sources) : { ok: false, error: "" };
    if (outcome.ok) return;

    if (isUsableMediaUrl(sourceUrl(media))) {
      const postFallback = (await mediaUrlsFromPost(postUrl)).filter(
        u => isUsableMediaUrl(u) && !sources.includes(u)
      );
      if (postFallback.length) {
        sources = [...sources, ...postFallback];
        outcome = await trySources(postFallback);
        if (outcome.ok) return;
      }
    }

    if (!sources.length) {
      // No direct URL at all (e.g. blob-only MSE streams) — hand off to Downloader or Cobalt.
      if (kind === "video") {
        await handOffVideo(media);
        return;
      }
      showToast("X did not expose a direct image URL; try opening the post in your browser.", "info");
      return;
    }

    // Every direct path failed — hand the video off to Cobalt (IG-Now method).
    if (kind === "video") {
      await handOffVideo(media);
      return;
    }
    const reason = outcome.error || "all methods failed";
    // Diagnostic channel: mirror the reason into the page title so the Rust
    // side logs it (XNOWERR: branch) — plus the user-visible toast.
    try {
      document.title = `XNOWERR:image:${String(reason).slice(0, 300)}`;
    } catch (error) {
      console.warn("X-Now could not set the diagnostic title:", error);
    }
    showToast(`X blocked this image download (${reason}). ` +
      "Open the post in your browser and try again.", "error");
  }

  async function openMediaInBrowser(media) {
    const postUrl = postUrlForMedia(media);
    if (postUrl) {
      openDefaultBrowser(postUrl);
      return;
    }
    const canonicalUrl = document.querySelector("link[rel='canonical']")?.href
      || document.querySelector("meta[property='og:url']")?.content;
    const normalized = normalizeXPostUrl(canonicalUrl);
    if (normalized) {
      openDefaultBrowser(normalized);
      return;
    }
    const mediaUrl = (await mediaUrlCandidates(media))[0];
    if (mediaUrl) {
      openDefaultBrowser(mediaUrl);
      return;
    }
    showToast("X-Now could not resolve the exact post link.");
  }

  function closeMenu() {
    state.menu?.remove();
    state.menu = null;
  }

  function showMenu(items, x, y) {
    closeMenu();
    const menu = document.createElement("div");
    menu.className = "xnow-media-menu xnow-ui";
    menu.setAttribute("role", "menu");
    items.forEach(({ label, action }) => {
      const button = document.createElement("button");
      button.type = "button";
      button.setAttribute("role", "menuitem");
      button.textContent = label;
      button.addEventListener("click", async event => {
        event.preventDefault();
        event.stopPropagation();
        closeMenu();
        await action();
      });
      menu.appendChild(button);
    });
    menu.style.left = `${Math.max(8, x)}px`;
    menu.style.top = `${Math.max(8, y)}px`;
    document.body.appendChild(menu);
    const bounds = menu.getBoundingClientRect();
    menu.style.left = `${Math.max(8, Math.min(x, window.innerWidth - bounds.width - 8))}px`;
    menu.style.top = `${Math.max(8, Math.min(y, window.innerHeight - bounds.height - 8))}px`;
    // Arrow keys, Home and End move between items; the first item takes focus.
    menu.addEventListener("keydown", event => {
      const buttons = Array.from(menu.querySelectorAll("button"));
      const index = buttons.indexOf(document.activeElement);
      const target = { ArrowDown: index + 1, ArrowUp: index - 1, Home: 0, End: buttons.length - 1 }[event.key];
      if (target === undefined) return;
      event.preventDefault();
      buttons[(target + buttons.length) % buttons.length].focus();
    });
    menu.querySelector("button")?.focus({ preventScroll: true });
    state.menu = menu;
  }

  document.addEventListener("click", event => {
    if (elementFromTarget(event.target)?.closest?.(".xnow-media-menu")) return;
    closeMenu();
  }, true);

  // A fixed-position menu must not float away from its target: close it on
  // scroll, resize and Escape.
  window.addEventListener("scroll", closeMenu, { capture: true, passive: true });
  window.addEventListener("resize", closeMenu, { passive: true });
  // ── Built-in Image Viewer (Ctrl/Cmd+click or Context Menu) ───────────────
  function updateViewerTransform() {
    if (!state.viewer) return;
    const { image, scale, offsetX, offsetY, zoomInput, zoomLabel } = state.viewer;
    image.style.transform = `translate(calc(-50% + ${offsetX}px), calc(-50% + ${offsetY}px)) scale(${scale})`;
    const pct = Math.round(scale * 100);
    zoomInput.value = String(Math.max(10, Math.min(400, pct)));
    zoomLabel.textContent = `${pct}%`;
  }

  function setViewerScale(nextScale) {
    if (!state.viewer) return;
    state.viewer.scale = Math.max(0.1, Math.min(4, Math.round(nextScale * 100) / 100));
    updateViewerTransform();
  }

  function fitViewer() {
    if (!state.viewer) return;
    const { viewport, image } = state.viewer;
    const vw = viewport.clientWidth || 0;
    const vh = viewport.clientHeight || 0;
    const nw = image.naturalWidth || 0;
    const nh = image.naturalHeight || 0;
    const fitScale = (vw > 24 && vh > 24 && nw > 0 && nh > 0)
      ? Math.max(0.1, Math.min(1, (vw - 24) / nw, (vh - 24) / nh))
      : 1;
    state.viewer.fitScale = fitScale;
    state.viewer.scale = fitScale;
    state.viewer.offsetX = 0;
    state.viewer.offsetY = 0;
    updateViewerTransform();
  }

  function closeImageViewer() {
    if (!state.viewer) return;
    if (state.viewer.cleanup) state.viewer.cleanup();
    state.viewer.overlay.remove();
    state.viewer = null;
  }

  function showImageViewer(image) {
    if (!(image instanceof HTMLImageElement)) return;
    closeMenu();
    closeImageViewer();

    const overlay = document.createElement("div");
    overlay.className = "xnow-media-viewer xnow-ui";
    overlay.setAttribute("role", "dialog");
    overlay.setAttribute("aria-modal", "true");
    overlay.setAttribute("aria-label", "X-Now image viewer");

    const panel = document.createElement("section");
    panel.className = "xnow-media-viewer__panel";
    const toolbar = document.createElement("div");
    toolbar.className = "xnow-media-viewer__toolbar";

    const saveButton = document.createElement("button");
    saveButton.type = "button";
    saveButton.className = "is-primary";
    saveButton.textContent = "Save";
    saveButton.addEventListener("click", () => saveMedia(image));

    const dlButton = document.createElement("button");
    dlButton.type = "button";
    dlButton.textContent = "Downloader";
    dlButton.addEventListener("click", () => {
      closeImageViewer();
      openNativeDownloader(postUrlForMedia(image), image);
    });

    const zoomOut = document.createElement("button");
    zoomOut.type = "button";
    zoomOut.textContent = "-";
    zoomOut.setAttribute("aria-label", "Zoom out");
    zoomOut.addEventListener("click", () => setViewerScale((state.viewer?.scale || 1) - 0.15));

    const zoomInput = document.createElement("input");
    zoomInput.className = "xnow-media-viewer__zoom";
    zoomInput.type = "range";
    zoomInput.min = "10";
    zoomInput.max = "400";
    zoomInput.step = "5";
    zoomInput.value = "100";
    zoomInput.setAttribute("aria-label", "Image zoom");
    zoomInput.addEventListener("input", () => setViewerScale(Number(zoomInput.value) / 100));

    const zoomLabel = document.createElement("span");
    zoomLabel.className = "xnow-media-viewer__zoom-label";
    zoomLabel.textContent = "100%";

    const zoomIn = document.createElement("button");
    zoomIn.type = "button";
    zoomIn.textContent = "+";
    zoomIn.setAttribute("aria-label", "Zoom in");
    zoomIn.addEventListener("click", () => setViewerScale((state.viewer?.scale || 1) + 0.15));

    const actualSize = document.createElement("button");
    actualSize.type = "button";
    actualSize.textContent = "1:1";
    actualSize.title = "Actual size (1)";
    actualSize.addEventListener("click", () => {
      if (!state.viewer) return;
      state.viewer.offsetX = 0;
      state.viewer.offsetY = 0;
      setViewerScale(1);
    });

    const reset = document.createElement("button");
    reset.type = "button";
    reset.textContent = "Fit";
    reset.title = "Fit to window (0 or F)";
    reset.addEventListener("click", fitViewer);

    const hint = document.createElement("span");
    hint.className = "xnow-media-viewer__hint";
    hint.textContent = "+/− zoom · 0 fit · 1 100% · Esc close";

    const close = document.createElement("button");
    close.className = "xnow-media-viewer__close";
    close.type = "button";
    close.textContent = "\u00D7";
    close.setAttribute("aria-label", "Close image viewer");
    close.addEventListener("click", closeImageViewer);

    toolbar.append(
      saveButton, dlButton, zoomOut, zoomInput, zoomLabel, zoomIn, actualSize, reset, hint, close
    );

    const viewport = document.createElement("div");
    viewport.className = "xnow-media-viewer__viewport";
    const enlarged = document.createElement("img");
    enlarged.className = "xnow-media-viewer__image";
    const rawSrc = sourceUrl(image);
    const highResSrc = resolutionVariants(rawSrc)[0] || rawSrc;
    enlarged.src = highResSrc;
    enlarged.alt = image.alt || "X post image";
    enlarged.draggable = false;
    if (highResSrc !== rawSrc && rawSrc) {
      enlarged.addEventListener("error", () => {
        if (enlarged.src !== rawSrc) enlarged.src = rawSrc;
      }, { once: true });
    }
    viewport.appendChild(enlarged);
    panel.append(toolbar, viewport);
    overlay.appendChild(panel);
    document.body.appendChild(overlay);

    state.viewer = {
      overlay,
      viewport,
      image: enlarged,
      sourceImage: image,
      zoomInput,
      zoomLabel,
      scale: 1,
      fitScale: 1,
      offsetX: 0,
      offsetY: 0
    };
    updateViewerTransform();
    enlarged.addEventListener("load", fitViewer, { once: true });
    if (enlarged.complete && enlarged.naturalWidth > 0) fitViewer();

    overlay.addEventListener("click", event => {
      if (event.target === overlay) closeImageViewer();
    });
    viewport.addEventListener("wheel", event => {
      event.preventDefault();
      setViewerScale((state.viewer?.scale || 1) + (event.deltaY < 0 ? 0.15 : -0.15));
    }, { passive: false });
    viewport.addEventListener("dblclick", () => {
      if (!state.viewer) return;
      if (Math.abs(state.viewer.scale - state.viewer.fitScale) < 0.05) {
        setViewerScale(Math.min(2, state.viewer.fitScale * 2));
      } else {
        fitViewer();
      }
    });

    let dragging = false;
    let startX = 0;
    let startY = 0;
    const endDrag = pointerId => {
      if (!dragging) return;
      dragging = false;
      if (pointerId !== undefined) viewport.releasePointerCapture?.(pointerId);
    };
    viewport.addEventListener("pointerdown", event => {
      if (event.button !== 0 || !state.viewer) return;
      dragging = true;
      startX = event.clientX - state.viewer.offsetX;
      startY = event.clientY - state.viewer.offsetY;
      viewport.setPointerCapture?.(event.pointerId);
    });
    viewport.addEventListener("pointermove", event => {
      if (!dragging || !state.viewer) return;
      state.viewer.offsetX = event.clientX - startX;
      state.viewer.offsetY = event.clientY - startY;
      updateViewerTransform();
    });
    viewport.addEventListener("pointerup", event => endDrag(event.pointerId));
    viewport.addEventListener("pointercancel", event => endDrag(event.pointerId));
    viewport.addEventListener("lostpointercapture", () => endDrag());
    const onWindowBlur = () => endDrag();
    window.addEventListener("blur", onWindowBlur);
    state.viewer.cleanup = () => window.removeEventListener("blur", onWindowBlur);
    close.focus({ preventScroll: true });
  }

  document.addEventListener("keydown", event => {
    if (state.viewer) {
      if (event.key === "Escape") {
        event.preventDefault();
        event.stopImmediatePropagation();
        closeImageViewer();
        return;
      }
      const tag = document.activeElement?.tagName;
      const inRange = tag === "INPUT" && document.activeElement?.type === "range";
      if (tag !== "TEXTAREA" && tag !== "SELECT" && (tag !== "INPUT" || inRange)) {
        if (event.key === "+" || event.key === "=" || event.code === "NumpadAdd") {
          event.preventDefault();
          event.stopImmediatePropagation();
          setViewerScale((state.viewer.scale || 1) + 0.15);
          return;
        }
        if (event.key === "-" || event.key === "_" || event.code === "NumpadSubtract") {
          event.preventDefault();
          event.stopImmediatePropagation();
          setViewerScale((state.viewer.scale || 1) - 0.15);
          return;
        }
        if (event.key === "0" || event.key === "f" || event.key === "F") {
          event.preventDefault();
          event.stopImmediatePropagation();
          fitViewer();
          return;
        }
        if (event.key === "1") {
          event.preventDefault();
          event.stopImmediatePropagation();
          state.viewer.offsetX = 0;
          state.viewer.offsetY = 0;
          setViewerScale(1);
          return;
        }
        if (event.key === "s" || event.key === "S") {
          event.preventDefault();
          event.stopImmediatePropagation();
          saveMedia(state.viewer.sourceImage);
          return;
        }
        const step = 48;
        if (!inRange && ["ArrowLeft", "ArrowRight", "ArrowUp", "ArrowDown"].includes(event.key)) {
          event.preventDefault();
          event.stopImmediatePropagation();
          if (event.key === "ArrowLeft") state.viewer.offsetX += step;
          if (event.key === "ArrowRight") state.viewer.offsetX -= step;
          if (event.key === "ArrowUp") state.viewer.offsetY += step;
          if (event.key === "ArrowDown") state.viewer.offsetY -= step;
          updateViewerTransform();
          return;
        }
      }
    }
    if ((event.ctrlKey || event.metaKey) && event.shiftKey && event.key.toLowerCase() === "d") {
      event.preventDefault();
      event.stopImmediatePropagation();
      openNativeDownloader();
      return;
    }
    if (event.key === "Escape") closeMenu();
  }, true);

  // ── External link handoff ─────────────────────────────────────────────────
  // A plain left-click on any link that leaves X (external site, t.co
  // redirect, mailto:) is intercepted in the CAPTURE phase and handed to the
  // OS default browser via the native bridge — the browser loads it
  // automatically as the system's handler. X's own links (x.com / twitter.com
  // posts, profiles, notifications…) stay in-app, and modifier-click /
  // middle-click behaviour is untouched (those still go through the Rust
  // new-window router to the browser).
  function isExternalLink(href) {
    if (!href) return false;
    try {
      const url = new URL(href, window.location.href);
      if (url.protocol !== "http:" && url.protocol !== "https:") return true;
      const host = url.hostname.toLowerCase();
      return !(host === "x.com" || host.endsWith(".x.com")
        || host === "twitter.com" || host.endsWith(".twitter.com"));
    } catch (error) {
      return false;
    }
  }

  document.addEventListener("click", event => {
    const targetEl = elementFromTarget(event.target);
    if (targetEl?.closest?.(".xnow-media-viewer, .xnow-media-menu")) return;
    if ((event.ctrlKey || event.metaKey) && !event.shiftKey && !event.altKey) {
      const media = mediaFromTarget(event.target) || mediaAtPoint(event.clientX, event.clientY);
      if (media instanceof HTMLImageElement) {
        event.preventDefault();
        event.stopImmediatePropagation();
        showImageViewer(media);
        return;
      }
    }
    if (event.button !== 0) return;
    if (event.ctrlKey || event.metaKey || event.shiftKey || event.altKey) return;
    // Clicks on media elements belong to X's own player (play/pause, open the
    // post in-app) — never hand them off, even when an ad wraps the video in
    // an external click-through link.
    if (elementFromTarget(event.target)?.closest?.("video, audio")) return;
    const link = linkFromTarget(event.target);
    if (!link || !isExternalLink(link.href)) return;
    event.preventDefault();
    event.stopImmediatePropagation();
    openDefaultBrowser(link.href);
  }, true);

  // ── X-Now Downloader integration (adapted from IG-Now) ───────────────────
  function tweetIdFromUrl(url) {
    const match = String(url || "").match(/\/status\/(\d{5,24})/i);
    return match ? match[1] : "";
  }

  function syndicationToken(id) {
    const num = Number(id);
    if (!Number.isFinite(num) || num <= 0) return "0";
    return ((num / 1e15) * Math.PI).toString(36).replace(/(0+|\.)/g, "") || "0";
  }

  function cacheTweetPayload(tweetId, payloadJson) {
    if (!tweetId || !payloadJson) return;
    if (state.tweetCache.has(tweetId)) state.tweetCache.delete(tweetId);
    state.tweetCache.set(tweetId, payloadJson);
    if (state.tweetCache.size > 40) {
      const oldest = state.tweetCache.keys().next().value;
      if (oldest !== undefined) state.tweetCache.delete(oldest);
    }
  }

  function pickActiveFeedMedia() {
    if (state.activeVideo && state.activeVideo.isConnected && isVisible(state.activeVideo)) {
      const vr = state.activeVideo.getBoundingClientRect();
      if (vr.bottom > 40 && vr.top < window.innerHeight - 40) return state.activeVideo;
    }
    const candidates = Array.from(document.querySelectorAll("video, img")).filter(el => (
      el instanceof HTMLVideoElement ? isPostVideo(el) : isPostImage(el)
    ));
    if (!candidates.length) return null;
    const viewMid = window.innerHeight / 2;
    let best = candidates[0];
    let bestScore = -Infinity;
    for (const el of candidates) {
      const r = el.getBoundingClientRect();
      const visibleH = Math.max(0, Math.min(r.bottom, window.innerHeight) - Math.max(r.top, 0));
      const dist = Math.abs((r.top + r.height / 2) - viewMid);
      const score = (visibleH > 40 ? 100000 : 0) + visibleH - dist;
      if (score > bestScore) {
        bestScore = score;
        best = el;
      }
    }
    return best;
  }

  function pickActiveTweetArticle(targetMedia) {
    const fromMedia = targetMedia?.closest?.("article, [role=dialog]");
    if (fromMedia) return fromMedia;
    const routeId = tweetIdFromUrl(window.location.href);
    const articles = Array.from(document.querySelectorAll('article[data-testid="tweet"], article'));
    if (routeId) {
      const exact = articles.find(art =>
        Array.from(art.querySelectorAll("a[href*='/status/']")).some(a => tweetIdFromUrl(a.href) === routeId)
      );
      if (exact) return exact;
    }
    const viewMid = window.innerHeight / 2;
    let best = null;
    let bestScore = -Infinity;
    for (const art of articles) {
      const r = art.getBoundingClientRect();
      if (r.width <= 0 || r.height <= 0) continue;
      const visibleH = Math.max(0, Math.min(r.bottom, window.innerHeight) - Math.max(r.top, 0));
      if (visibleH <= 0) continue;
      const dist = Math.abs((r.top + r.height / 2) - viewMid);
      const score = visibleH - dist;
      if (score > bestScore) {
        bestScore = score;
        best = art;
      }
    }
    return best;
  }

  function extractTweetFromReactFiber(anchorEl, targetTweetId) {
    if (!(anchorEl instanceof Element)) return null;
    const seen = new Set();
    const looksLikeTweet = obj => {
      if (!obj || typeof obj !== "object") return false;
      const legacy = obj.legacy || obj;
      const id = String(obj.rest_id || legacy.id_str || obj.id_str || "");
      if (!/^\d{5,24}$/.test(id)) return false;
      if (targetTweetId && id !== targetTweetId) return false;
      return Boolean(
        legacy.extended_entities?.media?.length
        || legacy.entities?.media?.length
        || obj.mediaDetails?.length
        || typeof legacy.full_text === "string"
        || typeof obj.text === "string"
      );
    };
    const searchObj = (root, maxNodes = 80) => {
      const queue = [{ val: root, depth: 0 }];
      let visited = 0;
      while (queue.length && visited < maxNodes) {
        const { val, depth } = queue.shift();
        if (!val || typeof val !== "object" || val === window || seen.has(val) || depth > 7) continue;
        try {
          if (val.window === val) continue;
        } catch (_) {
          continue;
        }
        seen.add(val);
        visited += 1;
        if (looksLikeTweet(val)) return val;
        if (Array.isArray(val)) {
          for (let i = 0; i < Math.min(val.length, 16); i++) queue.push({ val: val[i], depth: depth + 1 });
        } else {
          let keys;
          try {
            keys = Object.keys(val);
          } catch (_) {
            continue;
          }
          for (let i = 0; i < Math.min(keys.length, 28); i++) {
            const k = keys[i];
            if (k === "return" || k === "child" || k === "sibling" || k === "_owner" || k === "stateNode") continue;
            try { queue.push({ val: val[k], depth: depth + 1 }); } catch (_) {}
          }
        }
      }
      return null;
    };

    try {
      for (let el = anchorEl, hops = 0; el && hops < 12; el = el.parentElement, hops++) {
        const fiberKey = Object.keys(el).find(k => k.startsWith("__reactFiber$") || k.startsWith("__reactProps$"));
        if (!fiberKey) continue;
        let cur = el[fiberKey];
        for (let depth = 0; cur && depth < 24; depth++) {
          const candidate = cur.memoizedProps || cur.pendingProps || cur;
          const hit = searchObj(candidate, 45);
          if (hit) {
            try { return JSON.stringify(hit); } catch (_) { return null; }
          }
          cur = cur.return;
        }
      }
    } catch (_) {}
    return null;
  }

  function extractTweetSeedFromDom(article, fallbackUrl) {
    if (!article) return "";
    const statusLinks = Array.from(article.querySelectorAll("a[href*='/status/']"));
    const statusHref = normalizeXPostUrl(statusLinks[0]?.href || fallbackUrl || window.location.href);
    const id = tweetIdFromUrl(statusHref || fallbackUrl || window.location.href);
    let username = "";
    if (statusHref) {
      const m = statusHref.match(/x\.com\/([^/]+)\/status\//i);
      if (m && m[1] !== "i") username = m[1];
    }
    const text = article.querySelector('[data-testid="tweetText"]')?.innerText?.trim() || "";
    const createdAt = article.querySelector("time")?.getAttribute("datetime") || "";
    const items = [];
    const seenUrls = new Set();

    article.querySelectorAll("img").forEach(img => {
      if (!isPostImage(img)) return;
      const src = sourceUrl(img);
      if (!isUsableMediaUrl(src)) return;
      const variants = [...resolutionVariants(src), src].filter(isUsableMediaUrl);
      const best = variants[0] || src;
      if (seenUrls.has(best)) return;
      seenUrls.add(best);
      items.push({ kind: "image", thumbnailUrl: src, urls: variants });
    });

    article.querySelectorAll("video").forEach(video => {
      if (!isPostVideo(video)) return;
      const poster = video.poster || video.getAttribute("poster") || "";
      const direct = sourceUrl(video);
      const scoped = scopedVideoResources(video);
      const urls = [direct, ...scoped].filter(u => isUsableMediaUrl(u));
      items.push({
        kind: "video",
        thumbnailUrl: isUsableMediaUrl(poster) ? poster : "",
        urls
      });
    });

    if (!items.length && !text) return "";
    return JSON.stringify({
      xnowSeed: true,
      tweetId: id,
      username,
      postUrl: statusHref || fallbackUrl || "",
      createdAt,
      text,
      items
    });
  }

  function findArticleForTweetId(tweetId) {
    if (!tweetId) return null;
    return Array.from(document.querySelectorAll('article[data-testid="tweet"], article')).find(art =>
      Array.from(art.querySelectorAll("a[href*='/status/']")).some(a => tweetIdFromUrl(a.href) === tweetId)
    ) || null;
  }

  async function openNativeDownloader(initialUrl = "", targetMedia = null) {
    closeMenu();
    const article = pickActiveTweetArticle(targetMedia);
    let detectedUrl = normalizeXPostUrl(initialUrl)
      || (targetMedia ? postUrlForMedia(targetMedia) : "")
      || (article ? normalizeXPostUrl(article.querySelector("a[href*='/status/']")?.href || "") : "")
      || normalizeXPostUrl(window.location.href)
      || "";
    const tweetId = tweetIdFromUrl(detectedUrl);
    let payloadJson = (tweetId && state.tweetCache.get(tweetId)) || "";
    if (!payloadJson && (targetMedia || article)) {
      payloadJson = extractTweetFromReactFiber(targetMedia || article, tweetId)
        || extractTweetSeedFromDom(article, detectedUrl)
        || "";
      if (tweetId && payloadJson) cacheTweetPayload(tweetId, payloadJson);
    }

    let itemIndex = null;
    const rawHintSrc = targetMedia ? sourceUrl(targetMedia) : "";
    const itemHint = rawHintSrc && !rawHintSrc.startsWith("blob:")
      ? rawHintSrc
      : (targetMedia?.poster || "");
    if (targetMedia && article) {
      const mediaNodes = Array.from(article.querySelectorAll("img, video"))
        .filter(el => el instanceof HTMLVideoElement ? isPostVideo(el) : isPostImage(el));
      const idx = mediaNodes.indexOf(targetMedia);
      if (idx >= 0) itemIndex = idx;
    }

    if (!hasNativeBridge()) {
      showToast("X-Now Downloader native bridge is unavailable.", "error");
      return false;
    }
    try {
      await nativeInvoke("open_downloader_window", {
        url: detectedUrl || null,
        payloadJson: payloadJson || null,
        itemIndex,
        itemHint: itemHint || null,
        theme: document.documentElement.dataset.xnowTheme || "black"
      });
      return true;
    } catch (error) {
      console.warn("X-Now could not open Downloader window:", error);
      showToast("Could not open X-Now Downloader window.", "error");
      return false;
    }
  }

  async function probePostForDownloader(requestId, targetUrl) {
    if (!requestId || !hasNativeBridge()) return false;
    let payloadJson = "";
    const tweetId = tweetIdFromUrl(targetUrl);
    if (tweetId && state.tweetCache.has(tweetId)) {
      payloadJson = state.tweetCache.get(tweetId) || "";
    }
    if (!payloadJson && tweetId) {
      const art = findArticleForTweetId(tweetId);
      if (art) {
        payloadJson = extractTweetFromReactFiber(art, tweetId) || extractTweetSeedFromDom(art, targetUrl) || "";
      }
    }
    if (!payloadJson && tweetId && typeof fetch === "function") {
      try {
        const synUrl = `https://cdn.syndication.twimg.com/tweet-result?id=${tweetId}&token=${syndicationToken(tweetId)}`;
        const res = await fetch(synUrl, { credentials: "omit" });
        if (res.ok) payloadJson = await res.text();
      } catch (_) {}
    }
    if (!payloadJson && /^https?:\/\//i.test(targetUrl || "") && typeof fetch === "function") {
      try {
        const pageRes = await fetch(targetUrl, { credentials: "include" });
        if (pageRes.ok) payloadJson = await pageRes.text();
      } catch (_) {}
    }
    if (tweetId && payloadJson) cacheTweetPayload(tweetId, payloadJson);
    try {
      await nativeInvoke("submit_downloader_probe", {
        requestId,
        payloadJson: payloadJson || ""
      });
      return true;
    } catch (_) {
      return false;
    }
  }

  window.__xnowTools = {
    openDownloader: openNativeDownloader,
    probePostForDownloader,
    pickActiveFeedMedia,
    openImageViewer: showImageViewer,
    closeImageViewer
  };

  document.addEventListener("contextmenu", event => {
    const media = mediaFromTarget(event.target) || mediaAtPoint(event.clientX, event.clientY);
    const link = media ? null : (linkFromTarget(event.target) || linkAtPoint(event.clientX, event.clientY));
    if (!media && !link) {
      closeMenu(); // a right-click elsewhere must not leave the old menu open
      return;
    }

    event.preventDefault();
    event.stopImmediatePropagation();
    if (media) {
      const kind = media instanceof HTMLVideoElement ? "video" : "image";
      showMenu([
        {
          label: `Save ${kind} to the X-Now folder`,
          action: () => saveMedia(media)
        },
        ...(kind === "image" ? [{
          label: "View / Zoom image",
          action: () => showImageViewer(media)
        }] : []),
        {
          label: "Open in X-Now Downloader",
          action: () => openNativeDownloader(postUrlForMedia(media), media)
        },
        {
          label: kind === "video" ? "Open video post in default browser" : "Open post in default browser",
          action: () => openMediaInBrowser(media)
        }
      ], event.clientX, event.clientY);
    } else {
      showMenu([
        { label: "Open link in default browser", action: () => openDefaultBrowser(link.href) }
      ], event.clientX, event.clientY);
    }
  }, true);

  // ── Signed-in handle → native titlebar ("X-Now (@handle)") ──────────────
  // X's sidebar profile tab is an <a data-testid="AppTabBar_Profile_Link">
  // whose href is "/<handle>". The Rust side watches document.title for the
  // "XNOW:" prefix and rewrites the native title.
  // The link is absent for a moment while X re-renders; only a longer absence
  // is a sign-out. Rust closes the sign-in popups when a sign-in follows one.
  const SIGNED_OUT_AFTER_MS = 5000;
  let lastHandle = null;
  let absentSince = 0;
  let reportedOut = false;
  function refreshHandle() {
    try {
      const link = document.querySelector('a[data-testid="AppTabBar_Profile_Link"]');
      const handle = link?.getAttribute?.("href")?.replace(/^\//, "").replace(/\/$/, "") || "";
      if (handle) {
        absentSince = 0;
        reportedOut = false;
        if (handle === lastHandle) return;
        lastHandle = handle;
        document.title = `XNOW:${handle}`;
        return;
      }
      if (!absentSince) absentSince = Date.now();
      if (reportedOut || Date.now() - absentSince < SIGNED_OUT_AFTER_MS) return;
      reportedOut = true;
      lastHandle = null;
      document.title = "XNOWOUT:";
    } catch (error) {
      console.warn("X-Now handle refresh failed:", error);
    }
  }

  // ── Pause-on-minimize / resume-on-restore helpers ────────────────────────
  // Driven by the Rust playback watchdog: it evals `__onWindowHidden` on every
  // hidden/visible transition of the host window (minimize, close-to-tray,
  // autostart-hidden) and `__resumeIfNeeded` on restore. Idempotent — the
  // visibilitychange handler below just mirrors the watchdog for pages where
  // the event DOES fire. The OS-level audio-session mute in Rust is the real
  // guarantee; these helpers give instant response and keep the site's own
  // player state in sync.
  var _xnowResumeOnVisible = false;
  var _xnowPlayingVideo = null;
  var _xnowPlayingAudio = null;
  var _xnowMutedVideo = null;
  var _xnowMutedByHide = false;
  var _xnowLastRoute = "";

  window.__xnowActiveVideo = function () {
    if (state.activeVideo && state.activeVideo.isConnected) return state.activeVideo;
    const playing = Array.from(document.querySelectorAll("video")).find(v => !v.paused);
    return playing || document.querySelector("video") || null;
  };

  window.__onWindowHidden = function () {
    try {
      // Pause and mute follow Settings, whichever path hid the window (tray, close or minimize).
      const settings = window.__xnowSettings || {};
      if (settings.pauseOnMinimize === false) return "skipped";
      const mute = settings.muteOnMinimize !== false;
      const videos = Array.from(document.querySelectorAll("video"));
      const audios = Array.from(document.querySelectorAll("audio"));
      const newlyPlaying = videos.find(v => !v.paused) || null;
      const newlyPlayingAudio = audios.find(a => !a.paused) || null;
      // Idempotent: the Resized fast-path AND the watchdog both call this on
      // one minimize — a second call must NEVER clear the first capture, or
      // restore would lose the resume intent (observed in E2E).
      if (newlyPlaying) _xnowPlayingVideo = newlyPlaying;
      if (newlyPlayingAudio) _xnowPlayingAudio = newlyPlayingAudio;
      _xnowResumeOnVisible = _xnowResumeOnVisible
        || Boolean(_xnowPlayingVideo)
        || Boolean(_xnowPlayingAudio);
      // Mute-backup applies ONLY to the video that was actually playing —
      // never to a paused element (a stale mute would silence a later
      // autoplay after restore). The OS session mute covers everything else.
      if (mute && _xnowPlayingVideo && !_xnowMutedVideo) {
        _xnowMutedByHide = _xnowPlayingVideo.muted;
        _xnowMutedVideo = _xnowPlayingVideo;
        _xnowMutedVideo.muted = true; // instant silence; the OS session mute is the guarantee
      }
      videos.forEach(v => { if (!v.paused) v.pause(); });
      audios.forEach(a => { if (!a.paused) a.pause(); });
      return "paused";
    } catch (error) {
      console.warn("X-Now pause-on-hide failed:", error);
      return "error";
    }
  };

  window.__resumeIfNeeded = function () {
    try {
      // 1. Always restore our own mute-backup on the exact element we muted —
      // independent of any resume decision below. Restores the ORIGINAL mute
      // state (we forced it to true at hide; undo that even if it was false).
      if (_xnowMutedVideo && _xnowMutedVideo.isConnected) {
        _xnowMutedVideo.muted = _xnowMutedByHide;
      }
      _xnowMutedVideo = null;
      _xnowMutedByHide = false;
      if (!_xnowResumeOnVisible) return "no-resume";
      _xnowResumeOnVisible = false;

      // 2. Resume following X's own rules: only media that is still ON SCREEN
      // may play. Prefer the exact element that was playing; if it is gone or
      // scrolled away, hand control to the current in-view video (X's engine
      // autoplays in-view media — we only nudge it, and never fight it by
      // replaying off-screen elements).
      const wasPlaying = _xnowPlayingVideo && _xnowPlayingVideo.isConnected
        ? _xnowPlayingVideo
        : null;
      _xnowPlayingVideo = null;
      const target = (wasPlaying && isVisible(wasPlaying) && isVideoOnScreen(wasPlaying))
        ? wasPlaying
        : (visibleVideos()[0] || null);
      if (!target) {
        if (_xnowPlayingAudio && _xnowPlayingAudio.isConnected) {
          _xnowPlayingAudio.play().catch(() => {});
          _xnowPlayingAudio = null;
          return "resumed-audio";
        }
        _xnowPlayingAudio = null;
        return "no-video";
      }
      _xnowPlayingAudio = null;
      applyDefaultVideoAudio(target);
      if (isStandaloneVideo(target)) activateVideoAudio(target);
      target.play().catch(() => {});
      return "resumed";
    } catch (error) {
      console.warn("X-Now resume-on-restore failed:", error);
      return "error";
    }
  };

  window.__xnowPauseReport = function () {
    try {
      const videos = Array.from(document.querySelectorAll("video"));
      const playing = videos.filter(v => !v.paused);
      const active = window.__xnowActiveVideo();
      return JSON.stringify({
        paused: videos.length > 0 && playing.length === 0,
        playing: playing.length,
        total: videos.length,
        activePaused: active ? active.paused : null,
        muted: active ? active.muted : null,
        volume: active ? active.volume : null,
        resumeFlag: _xnowResumeOnVisible
      });
    } catch (error) {
      return JSON.stringify({ error: String(error) });
    }
  };

  document.addEventListener("visibilitychange", () => {
    try {
      if (document.hidden) window.__onWindowHidden();
      else {
        window.__resumeIfNeeded();
        reportThemeBackground();
      }
      // Hidden pages poll at the slow cadence; visibility flips re-arm it.
      syncPollTick();
    } catch (error) {
      console.warn("X-Now visibility handler failed:", error);
    }
  });

  // ── Theme background reporter (XNOWBG:r,g,b) ──────────────────────────
  // The native window background is the color WebView2 paints for every frame
  // the compositor has not rasterized yet (scroll tiles, restore frames). If
  // it differs from X's REAL theme background, every raster gap flashes as a
  // contrasting band — dark-on-light is maximally visible while scrolling.
  // X resolves its theme asynchronously (server-driven), so we report the
  // computed body background once it is a concrete color, and again whenever
  // it changes. The native side re-syncs via set_background_color.
  var _xnowLastThemeKey = null;
  function reportThemeBackground(force) {
    try {
      if (!force && document.hidden) return;
      var body = document.body;
      if (!body) return;
      var bg = getComputedStyle(body).backgroundColor;
      if (!bg) return;
      // A transparent body (rgba alpha < 1) means the theme is not resolved
      // yet — reporting it would paint the native background black mid-light-
      // theme (the exact flash class this reporter exists to prevent).
      var alpha = bg.match(/^rgba\([^)]*,\s*([\d.]+)\)$/);
      if (alpha && parseFloat(alpha[1]) < 1) return;
      var m = bg.match(/rgba?\((\d+)[,\s]+(\d+)[,\s]+(\d+)/);
      if (!m) return; // still transparent/undecided — keep the launch default
      var key = m[1] + "," + m[2] + "," + m[3];
      if (key === _xnowLastThemeKey) return;
      _xnowLastThemeKey = key;
      applyPageTheme(+m[1], +m[2], +m[3]);
      document.title = "XNOWBG:" + key;
    } catch (error) {
      console.warn("X-Now theme report failed:", error);
    }
  }
  // X applies the theme some seconds after load; sample a few times, then on
  // every visible slow tick (skipped when hidden to save wakeups).
  [400, 1500, 4000, 8000].forEach(delay => setTimeout(() => reportThemeBackground(false), delay));
  setInterval(() => reportThemeBackground(false), 5000);
  // Manual trigger for the regression harness (same pattern as the other
  // __-prefixed page APIs the native side and tests drive directly).
  window.__xnowReportThemeBackground = () => reportThemeBackground(true);

  // In-page route change for the tray and the page scripts. X's router renders the
  // new path, and the document is not reloaded.
  window.__xnowNavigate = function (path) {
    if (location.pathname === path) return;
    history.pushState({}, "", path);
    window.dispatchEvent(new PopStateEvent("popstate", { state: history.state }));
  };

  function scanVideos() {
    document.querySelectorAll("video").forEach(video => {
      if (video.dataset.xnowObserved === "1") return;
      video.dataset.xnowObserved = "1";
      observer.observe(video);
      applyDefaultVideoAudio(video);
      // Track X's own autoplay choice only. Do NOT pause the other videos
      // here: a second enforcer raced X's player and glitched the feed at
      // every static↔video transition (see the IntersectionObserver note).
      video.addEventListener("play", () => {
        state.activeVideo = video;
      });
    });
  }

  // ── Idle-aware route/handle polling ────────────────────────────────────
  // SPA route changes re-render the DOM (and log the user in/out): a poll
  // keeps handle detection and video scanning fresh. The old fixed 1 s
  // setInterval fired a DOM query even while the user was idle or the window
  // was hidden — pure battery/CPU waste. This adaptive tick runs at 1 s while
  // the user is active, backs off to 5 s after 15 idle seconds, to 15 s after
  // a minute idle, and to 30 s while the page is hidden; any input or a
  // visible page re-arms the fast cadence instantly.
  const POLL_ACTIVE_MS = 1000;
  const POLL_IDLE_MS = 5000;
  const POLL_DEEP_IDLE_MS = 15000;
  const POLL_HIDDEN_MS = 30000;
  const USER_IDLE_AFTER_MS = 15000;
  const USER_DEEP_IDLE_AFTER_MS = 60000;
  let _xnowLastActivity = Date.now();
  let _xnowPollTimer = null;
  let _xnowPollRunning = false;

  function markUserActive() {
    _xnowLastActivity = Date.now();
    syncPollTick();
  }

  function pollIntervalMs() {
    if (document.hidden) return POLL_HIDDEN_MS;
    const idleFor = Date.now() - _xnowLastActivity;
    if (idleFor >= USER_DEEP_IDLE_AFTER_MS) return POLL_DEEP_IDLE_MS;
    if (idleFor >= USER_IDLE_AFTER_MS) return POLL_IDLE_MS;
    return POLL_ACTIVE_MS;
  }

  function pollTick() {
    _xnowPollTimer = null;
    if (_xnowPollRunning) return; // a tick overran; the next arm re-checks
    _xnowPollRunning = true;
    try {
      refreshHandle();
      const currentRoute = window.location.href;
      const lastRoute = _xnowLastRoute;
      _xnowLastRoute = currentRoute;
      if (currentRoute !== lastRoute) scheduleScan();
    } catch (error) {
      console.warn("X-Now route poll failed:", error);
    } finally {
      _xnowPollRunning = false;
    }
    armPollTick();
  }

  function armPollTick() {
    if (_xnowPollTimer !== null) return;
    _xnowPollTimer = window.setTimeout(pollTick, pollIntervalMs());
  }

  // Re-arm to the CURRENT cadence when activity or visibility changes: drop
  // the pending slow tick so the next poll happens at the fast interval.
  function syncPollTick() {
    if (_xnowPollTimer === null) return;
    window.clearTimeout(_xnowPollTimer);
    _xnowPollTimer = null;
    armPollTick();
  }

  window.addEventListener("pointerdown", markUserActive, { capture: true, passive: true });
  window.addEventListener("keydown", markUserActive, { capture: true, passive: true });
  window.addEventListener("wheel", markUserActive, { capture: true, passive: true });

  // Debounced video rescan, shared by the MutationObserver, the route poll and
  // (hoisted here) the adaptive tick above.
  let scanTimer = null;
  const scheduleScan = () => {
    if (scanTimer !== null) return;
    scanTimer = window.setTimeout(() => {
      scanTimer = null;
      scanVideos();
    }, 120);
  };

  function observeVideoChanges() {
    if (!document.documentElement) return;
    mountGuardSweep(document);
    scanVideos();

    // The feed recycles and removes <video> nodes constantly. Stop observing a
    // removed one and drop every reference to it, or the feed's whole history
    // of video elements stays alive in the intersection observer.
    const forgetVideo = video => {
      if (video.isConnected) return;
      mountGuardCleanup(video);
      observer.unobserve(video);
      delete video.dataset.xnowObserved;
      if (state.activeVideo === video) state.activeVideo = null;
      if (_xnowPlayingVideo === video) _xnowPlayingVideo = null;
      if (_xnowMutedVideo === video) {
        _xnowMutedVideo = null;
        _xnowMutedByHide = false;
      }
    };

    // Single unified observer for both mount-guard and video audio/observer
    // lifecycle (avoids duplicate full-subtree walks on every feed mutation).
    new MutationObserver(mutations => {
      let videoWasAdded = false;
      for (let i = 0; i < mutations.length; i++) {
        const mutation = mutations[i];
        if (mutation.type !== "childList") continue;
        const removed = mutation.removedNodes;
        for (let j = 0; j < removed.length; j++) {
          const node = removed[j];
          if (node.nodeType !== 1) continue;
          if (node instanceof HTMLVideoElement) forgetVideo(node);
          else if (node instanceof Element) node.querySelectorAll("video").forEach(forgetVideo);
        }
        const added = mutation.addedNodes;
        for (let j = 0; j < added.length; j++) {
          const node = added[j];
          if (node.nodeType !== 1) continue;
          if (node instanceof HTMLVideoElement) {
            mountGuardMark(node);
            videoWasAdded = true;
          } else if (node instanceof Element) {
            if (node.tagName === "VIDEO") {
              mountGuardMark(node);
              videoWasAdded = true;
            } else if (!node.classList?.contains("xnow-ui")) {
              const vids = node.querySelectorAll?.("video");
              if (vids && vids.length) {
                vids.forEach(mountGuardMark);
                videoWasAdded = true;
              }
            }
          }
        }
      }
      if (videoWasAdded) scheduleScan();
    }).observe(document.documentElement, {
      childList: true,
      subtree: true
    });

    // Adaptive cadence instead of the old fixed 1 s setInterval (see the
    // idle-aware polling block above).
    _xnowLastRoute = window.location.href;
    armPollTick();
  }

  if (document.documentElement) {
    observeVideoChanges();
    refreshHandle();
  } else {
    document.addEventListener("DOMContentLoaded", () => {
      observeVideoChanges();
      refreshHandle();
    }, { once: true });
  }

})();
