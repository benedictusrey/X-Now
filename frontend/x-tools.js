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
    activeVideo: null,
    videoAudioUnlocked: false
  };

  const style = document.createElement("style");
  style.textContent = `
    .xnow-media-menu {
      position: fixed;
      z-index: 2147483647;
      min-width: 230px;
      padding: 6px;
      border: 1px solid rgba(255, 255, 255, 0.18);
      border-radius: 12px;
      background: rgba(15, 20, 25, 0.97);
      box-shadow: 0 16px 45px rgba(0, 0, 0, 0.35);
      font: 13px "Segoe UI", Arial, sans-serif;
    }

    .xnow-media-menu button {
      display: block;
      width: 100%;
      padding: 9px 11px;
      border: 0;
      border-radius: 8px;
      background: transparent;
      color: #fff;
      text-align: left;
      cursor: pointer;
    }

    .xnow-media-menu button:hover {
      background: rgba(29, 155, 240, 0.25);
    }

    .xnow-toast {
      position: fixed;
      right: 18px;
      bottom: 18px;
      z-index: 2147483647;
      max-width: min(460px, calc(100vw - 36px));
      padding: 11px 14px;
      border: 1px solid rgba(255, 255, 255, 0.16);
      border-radius: 10px;
      background: rgba(15, 20, 25, 0.96);
      color: #fff;
      box-shadow: 0 12px 32px rgba(0, 0, 0, 0.3);
      font: 13px "Segoe UI", Arial, sans-serif;
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
      && !image.closest("header, nav, aside");
  }

  function isPostVideo(video) {
    if (!(video instanceof HTMLVideoElement)) return false;
    const rect = video.getBoundingClientRect();
    const hasPostContext = Boolean(video.closest("article, [role=dialog]"));
    return (hasPostContext || (rect.width >= 260 && rect.height >= 260))
      && rect.width >= 120
      && rect.height >= 120
      && !video.closest("header, nav, aside");
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

  function defaultVolumeForVideo(video) {
    return isStandaloneVideo(video) ? 0.5 : 0.2;
  }

  function applyDefaultVideoAudio(video) {
    if (!(video instanceof HTMLVideoElement)) return;
    const profile = isStandaloneVideo(video)
      ? "standalone:0.5"
      : (state.videoAudioUnlocked ? "feed:unlocked" : "feed:locked");
    if (video.dataset.xnowAudioProfile === profile) return;
    try {
      if (isStandaloneVideo(video)) {
        // Lightbox / standalone video pages play at 50% volume.
        video.volume = defaultVolumeForVideo(video);
      } else if (!state.videoAudioUnlocked) {
        // Feed videos follow X's own muted-autoplay rule — until the user has
        // interacted with any media, after which X's own mute state is the
        // authority and we never fight it.
        video.muted = true;
      }
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

  function pauseOtherVideos(activeVideo) {
    document.querySelectorAll("video").forEach(video => {
      if (video !== activeVideo && !video.paused) video.pause();
    });
  }

  // The user's own gesture on a video (play/unmute click) marks the session
  // as audio-unlocked and keeps only this video playing — without ever
  // blocking X's native player controls (no stopImmediatePropagation here).
  // From the first media interaction on, X's own mute state is the authority
  // and X-Now only nudges volume for standalone (lightbox) playback.
  window.addEventListener("pointerdown", event => {
    if (event.button !== 0) return;
    const media = mediaFromTarget(event.target) || mediaAtPoint(event.clientX, event.clientY);
    if (!(media instanceof HTMLVideoElement)) return;
    state.activeVideo = media;
    state.videoAudioUnlocked = true;
    if (isStandaloneVideo(media)) activateVideoAudio(media);
    pauseOtherVideos(media);
  }, true);

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

  // ── IntersectionObserver: in-view autoplay + pause-out-of-view ──────────
  // Mirrors X's own autoplay intent without fighting it: the first video that
  // reaches 50% visibility becomes the active one, everything else pauses.
  const observer = new IntersectionObserver(entries => {
    entries.forEach(entry => {
      const video = entry.target;
      if (!(video instanceof HTMLVideoElement)) return;
      if (entry.isIntersecting && entry.intersectionRatio >= 0.5) {
        state.activeVideo = video;
        applyDefaultVideoAudio(video);
        pauseOtherVideos(video);
        video.play().catch(() => {});
      }
    });
  }, { threshold: [0.5] });

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
    const link = container?.querySelector?.("a[href*='/status/']");
    if (link) {
      const url = normalizeXPostUrl(link.href);
      if (url) return url;
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

  // X serves every image in resolution variants of the same media ID
  // (?name=small|medium|large|orig). The feed element usually exposes a small
  // thumbnail — offer the full-resolution variants as candidates so saving
  // gets the ORIGINAL, not the thumbnail.
  function resolutionVariants(url) {
    try {
      const parsed = new URL(url);
      if (!/(?:pbs|video)\.twimg\.com\//i.test(parsed.hostname + parsed.pathname)) return [];
      const base = `${parsed.origin}${parsed.pathname}`;
      const format = parsed.searchParams.get("format") || "jpg";
      const variants = [
        `${base}?format=${format}&name=orig`,
        `${base}?format=${format}&name=large`
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
        "meta[property='og:image:secure_url']"
      )).map(meta => normalizeMediaUrl(meta.content));
      const textUrls = normalizeMediaUrl(html).match(/https?:\/\/[^"'\s]+/g) || [];
      const candidates = [...metaUrls, ...textUrls].filter(url =>
        /^https?:\/\//i.test(url)
        && (/video\.twimg\.com\//i.test(url)
          || (/pbs\.twimg\.com\//i.test(url) && /\.(?:jpe?g|png|webp|avif)(?:[?#]|$)/i.test(url))
          || /\.mp4(?:[?#]|$)/i.test(url)));
      return Array.from(new Set(candidates));
    } catch (error) {
      console.warn("X-Now could not inspect the post page for media URLs:", error);
      return [];
    }
  }

  async function mediaUrlCandidates(media) {
    const directUrl = sourceUrl(media);
    const candidates = [];
    const addCandidate = url => {
      if (!url || candidates.includes(url)) return;
      candidates.push(url);
    };
    // Order: for IMAGES prefer the full-resolution variants first (orig/large —
    // the element usually only exposes a small thumbnail), with the element's
    // own URL as the freshest-signature fallback; for VIDEOS the live element
    // URL first (blob: URLs are filtered at the end), then variants/resources.
    if (media instanceof HTMLImageElement) {
      resolutionVariants(directUrl).forEach(addCandidate);
      addCandidate(directUrl);
    } else {
      addCandidate(directUrl);
      resolutionVariants(directUrl).forEach(addCandidate);
    }
    mediaUrlsFromResources(media).forEach(addCandidate);
    (await mediaUrlsFromPost(postUrlForMedia(media))).forEach(addCandidate);
    return candidates.filter(url => /^https?:\/\//i.test(url));
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

  function showToast(message) {
    state.toast?.remove();
    const toast = document.createElement("div");
    toast.className = "xnow-toast";
    toast.textContent = message;
    document.body.appendChild(toast);
    state.toast = toast;
    window.setTimeout(() => {
      if (state.toast === toast) {
        toast.remove();
        state.toast = null;
      }
    }, 5000);
  }
  // Exposed for Rust-side evals (tray menu feedback, watchdog reports).
  window.showToast = showToast;

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

    let downloadFolder = "Downloads\\X-Now";
    if (hasNativeBridge()) {
      try {
        downloadFolder = await nativeInvoke("prepare_download_folder");
      } catch (error) {
        console.warn("X-Now could not prepare the download folder:", error);
      }
    }

    const cobaltUrl = `https://cobalt.tools/?u=${encodeURIComponent(postUrl)}`;
    openDefaultBrowser(cobaltUrl);
    showToast(`Copied the post link and opened Cobalt. Choose Save and use ${downloadFolder}.`);
  }

  async function saveMedia(media) {
    const kind = media instanceof HTMLVideoElement ? "video" : "image";
    const postUrl = postUrlForMedia(media);
    const referer = postUrl || "https://x.com/";

    const sources = await mediaUrlCandidates(media);
    if (!sources.length) {
      // No direct URL at all (e.g. blob-only MSE streams) — the IG-Now method
      // still gets the video: copy the post link + open Cobalt.
      if (kind === "video") {
        await openCobaltForVideo(media);
        return;
      }
      showToast("X did not expose a direct image URL; try opening the post in your browser.");
      return;
    }

    let lastError = "";
    for (const source of sources) {
      if (hasNativeBridge()) {
        try {
          const savedPath = await nativeInvoke("download_media", {
            url: source,
            mediaType: kind,
            referer
          });
          showToast(`Saved ${kind} to ${savedPath}`);
          return;
        } catch (error) {
          lastError = String(error?.message || error);
          console.warn("X-Now native URL media download failed; trying the next source:", error);
        }
      }
      try {
        const savedPath = await downloadFromSignedInPage(source, kind);
        showToast(`Saved ${kind} to ${savedPath}`);
        return;
      } catch (error) {
        lastError = String(error?.message || error);
        console.warn("X-Now signed-in media save failed; trying the next source:", error);
      }
    }

    // Every direct path failed — hand the video off to Cobalt (IG-Now method).
    if (kind === "video") {
      await openCobaltForVideo(media);
      return;
    }
    showToast(`X blocked this image download (${lastError || "all methods failed"}). ` +
      "Open the post in your browser and try again.");
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
    menu.className = "xnow-media-menu";
    menu.setAttribute("role", "menu");
    items.forEach(({ label, action }) => {
      const button = document.createElement("button");
      button.type = "button";
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
    state.menu = menu;
  }

  document.addEventListener("click", event => {
    if (elementFromTarget(event.target)?.closest?.(".xnow-media-menu")) return;
    closeMenu();
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
    if (event.button !== 0) return;
    if (event.ctrlKey || event.metaKey || event.shiftKey || event.altKey) return;
    if (elementFromTarget(event.target)?.closest?.(".xnow-media-menu")) return;
    const link = linkFromTarget(event.target);
    if (!link || !isExternalLink(link.href)) return;
    event.preventDefault();
    event.stopImmediatePropagation();
    openDefaultBrowser(link.href);
  }, true);

  document.addEventListener("contextmenu", event => {
    const media = mediaFromTarget(event.target) || mediaAtPoint(event.clientX, event.clientY);
    const link = media ? null : (linkFromTarget(event.target) || linkAtPoint(event.clientX, event.clientY));
    if (!media && !link) return;

    event.preventDefault();
    event.stopImmediatePropagation();
    if (media) {
      const kind = media instanceof HTMLVideoElement ? "video" : "image";
      showMenu([
        {
          label: `Save ${kind} to Downloads\\X-Now`,
          action: () => saveMedia(media)
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
  let lastHandle = null;
  function refreshHandle() {
    try {
      const link = document.querySelector('a[data-testid="AppTabBar_Profile_Link"]');
      const handle = link?.getAttribute?.("href")?.replace(/^\//, "").replace(/\/$/, "") || "";
      if (!handle || handle === lastHandle) return;
      lastHandle = handle;
      document.title = `XNOW:${handle}`;
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

  window.__xnowActiveVideo = function () {
    if (state.activeVideo && state.activeVideo.isConnected) return state.activeVideo;
    const playing = Array.from(document.querySelectorAll("video")).find(v => !v.paused);
    return playing || document.querySelector("video") || null;
  };

  window.__onWindowHidden = function () {
    try {
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
      if (_xnowPlayingVideo && !_xnowMutedVideo) {
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
      else window.__resumeIfNeeded();
    } catch (error) {
      console.warn("X-Now visibility handler failed:", error);
    }
  });

  function scanVideos() {
    document.querySelectorAll("video").forEach(video => {
      if (video.dataset.xnowObserved === "1") return;
      video.dataset.xnowObserved = "1";
      observer.observe(video);
      applyDefaultVideoAudio(video);
      video.addEventListener("play", () => {
        state.activeVideo = video;
        pauseOtherVideos(video);
      });
    });
  }

  function observeVideoChanges() {
    if (!document.documentElement) return;
    scanVideos();

    let scanTimer = null;
    const scheduleScan = () => {
      if (scanTimer !== null) return;
      scanTimer = window.setTimeout(() => {
        scanTimer = null;
        scanVideos();
      }, 120);
    };
    const nodeContainsVideo = node => {
      if (!(node instanceof Element) && !(node instanceof DocumentFragment)) return false;
      return (node instanceof Element && node.matches("video"))
        || Boolean(node.querySelector("video"));
    };

    new MutationObserver(mutations => {
      const videoWasAdded = mutations.some(mutation => mutation.type === "childList"
        && Array.from(mutation.addedNodes).some(nodeContainsVideo));
      if (videoWasAdded) scheduleScan();
    }).observe(document.documentElement, {
      childList: true,
      subtree: true
    });

    // SPA route changes re-render the DOM (and log the user in/out): poll
    // cheaply so handle detection and video scanning stay fresh.
    let lastRoute = window.location.href;
    window.setInterval(() => {
      refreshHandle();
      const currentRoute = window.location.href;
      if (currentRoute === lastRoute) return;
      lastRoute = currentRoute;
      scheduleScan();
    }, 1000);
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
