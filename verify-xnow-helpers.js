// jsdom regression harness for X-Now's frontend/x-tools.js
// Assertions on the pause/resume/mute helpers + toast + media menu contract.
// Usage: node verify-xnow-helpers.js <path-to-x-tools.js>
'use strict';

const fs = require('fs');
const path = require('path');
const { JSDOM } = require('jsdom');

const TOOLS = process.argv[2] || path.join(__dirname, '..', '..', 'Desktop', 'X-Now', 'frontend', 'x-tools.js');
const SCRIPT = fs.readFileSync(TOOLS, 'utf8');

let passed = 0;
let failed = 0;
function assert(cond, label) {
  if (cond) { passed++; }
  else { failed++; console.error(`  ✗ FAIL: ${label}`); }
}

// jsdom's `paused` is a getter-only; shadow it with a writable property so
// play()/pause() stubs and state assertions can drive it.
function makePausable(video, paused) {
  Object.defineProperty(video, 'paused', { value: paused, writable: true, configurable: true });
  return video;
}

function makeDom() {
  const dom = new JSDOM('<!DOCTYPE html><html><head></head><body></body></html>', {
    runScripts: 'dangerously',
    url: 'https://x.com/home',
    pretendToBeVisual: true
  });
  const { window } = dom;
  // jsdom lacks IntersectionObserver — the tools script needs it at load time.
  window.IntersectionObserver = class {
    constructor(cb) { this.cb = cb; this.els = new Set(); }
    observe(el) { this.els.add(el); }
    unobserve(el) { this.els.delete(el); }
    disconnect() { this.els.clear(); }
    trigger(el, ratio) {
      this.cb([{ target: el, isIntersecting: ratio >= 0.5, intersectionRatio: ratio }], this);
    }
  };
  // jsdom returns zero rects; the post-media heuristics need plausible sizes.
  const realRect = window.Element.prototype.getBoundingClientRect;
  window.Element.prototype.getBoundingClientRect = function () {
    if (this.dataset && this.dataset.testRect) {
      const [w, h, x = 0, y = 0] = this.dataset.testRect.split(',').map(Number);
      return { width: w, height: h, top: y, left: x, right: x + w, bottom: y + h,
               x, y, toJSON() {} };
    }
    return realRect.call(this);
  };
  // HTMLMediaElement stubs behave enough like a player for state assertions.
  window.HTMLMediaElement.prototype.play = function () { this.paused = false; return Promise.resolve(); };
  window.HTMLMediaElement.prototype.pause = function () { this.paused = true; };
  const scriptEl = window.document.createElement('script');
  scriptEl.textContent = SCRIPT;
  window.document.body.appendChild(scriptEl);
  return dom;
}

function makeVideo(dom, { playing = false, muted = false, volume = 0.5, onScreen = true } = {}) {
  const { window } = dom;
  const article = window.document.createElement('article');
  article.setAttribute('data-testid', 'tweet');
  const video = window.document.createElement('video');
  video.dataset.testRect = onScreen ? '300,300,0,0' : '300,300,0,4000';
  video.muted = muted;
  video.volume = volume;
  makePausable(video, !playing);
  article.appendChild(video);
  window.document.body.appendChild(article);
  return video;
}

console.log('Loading tools script...');
const dom = makeDom();
const { window } = dom;
const doc = window.document;

// ── Install guard ────────────────────────────────────────────────────────────
const secondScript = doc.createElement('script');
secondScript.textContent = SCRIPT;
doc.body.appendChild(secondScript);
assert(window.__xnowMediaToolsInstalled === true, 'install guard set');
assert(doc.querySelectorAll('style').length === 1, 'style injected exactly once (guard works)');

// ── Toast contract (used by the tray autostart toggle) ───────────────────────
assert(typeof window.showToast === 'function', 'showToast exposed on window');
window.showToast('hello');
let toast = doc.querySelector('.xnow-toast');
assert(!!toast && toast.querySelector('.xnow-toast-title')?.textContent === 'hello',
  'showToast creates .xnow-toast with the message');
window.showToast('second');
assert(doc.querySelectorAll('.xnow-toast').length === 1, 'showToast replaces the previous toast');

// ── Active video contract (used by Rust REPORT_JS) ───────────────────────────
assert(typeof window.__xnowActiveVideo === 'function', '__xnowActiveVideo exposed');
assert(window.__xnowActiveVideo() === null, 'no videos -> active video null');
const v1 = makeVideo(dom, { playing: true, muted: false, volume: 0.5 });
assert(window.__xnowActiveVideo() === v1, 'playing video is the active video');
const v0 = makeVideo(dom, { playing: false });
assert(window.__xnowActiveVideo() === v1, 'paused video never beats the playing one');

// ── Pause report contract ────────────────────────────────────────────────────
assert(typeof window.__xnowPauseReport === 'function', '__xnowPauseReport exposed');
let report = JSON.parse(window.__xnowPauseReport());
assert(report.playing === 1 && report.total === 2, 'report counts playing/total videos');
assert(report.activePaused === false && report.muted === false && report.volume === 0.5,
  'report reflects the active video state');
assert(report.resumeFlag === false, 'report starts with resumeFlag false');

// ── Pause-on-hide (Rust watchdog + Resized fast-path + visibilitychange) ─────
assert(typeof window.__onWindowHidden === 'function', '__onWindowHidden exposed');
const first = window.__onWindowHidden();
assert(first === 'paused', '__onWindowHidden returns "paused"');
assert(v1.paused === true && v0.paused === true, 'all videos paused on hide');
assert(v1.muted === true, 'playing video force-muted on hide');
report = JSON.parse(window.__xnowPauseReport());
assert(report.paused === true && report.playing === 0, 'report shows everything paused');
assert(report.resumeFlag === true, 'resume intent captured');

// ── Idempotency: the fast-path + watchdog double-fire must not lose intent ───
window.__onWindowHidden();
report = JSON.parse(window.__xnowPauseReport());
assert(report.resumeFlag === true, 'second __onWindowHidden keeps resume intent (idempotent)');
assert(v1.muted === true, 'second hide keeps the mute');

// ── Resume-on-restore ─────────────────────────────────────────────────────────
assert(typeof window.__resumeIfNeeded === 'function', '__resumeIfNeeded exposed');
// The user interacted with the video (unmuted it via X's controls) — simulate
// the pointerdown gesture so the session is audio-unlocked, then a hide cycle.
const gestureOnFeed = new window.PointerEvent('pointerdown', { button: 0, bubbles: true });
v1.dispatchEvent(gestureOnFeed);
window.__onWindowHidden();
// Video is still on screen -> resumed.
v1.muted = false; // simulate what X's player would do meanwhile
const resumed = window.__resumeIfNeeded();
assert(resumed === 'resumed', 'on-screen video resumes');
assert(v1.paused === false, 'video playing again after resume');
assert(v1.muted === false, 'original mute state restored after resume (unlocked session)');
report = JSON.parse(window.__xnowPauseReport());
assert(report.resumeFlag === false, 'resume intent cleared after resume');

// ── No-resume when nothing was playing ────────────────────────────────────────
v1.pause();
const noResume = window.__resumeIfNeeded();
assert(noResume === 'no-resume', 'nothing was captured -> no-resume');
assert(v1.paused === true, 'video stays paused on no-resume');

// ── Off-screen media is NOT resumed (X autoplay rules) ───────────────────────
// Remove ALL on-screen videos so the only candidate is off-screen.
v0.remove();
v1.remove();
const offScreen = makeVideo(dom, { playing: true, muted: false, onScreen: false });
window.__onWindowHidden();
assert(offScreen.paused === true, 'off-screen video paused on hide');
const offResume = window.__resumeIfNeeded();
assert(offResume === 'no-video', 'off-screen-only resume returns no-video');
assert(offScreen.paused === true, 'off-screen video NOT replayed after restore');

// ── Audio defaults + gesture + context menu + handle — fresh session ────────
// A second, clean DOM: the first session's pointerdown already unlocked audio.
const dom2 = makeDom();
const { window: win2 } = dom2;
const doc2 = win2.document;

// Feed videos start muted (X autoplay rule) once the scan tick applies defaults.
const feedVideo = makeVideo(dom2, { playing: true });
win2.setTimeout(() => {
  assert(feedVideo.muted === true, 'feed video starts muted (X autoplay rule)');

  // Lightbox video: user gesture -> unmuted at 50%.
  const dialog = doc2.createElement('div');
  dialog.setAttribute('role', 'dialog');
  doc2.body.appendChild(dialog);
  const lightboxVideo = makePausable(doc2.createElement('video'), true);
  lightboxVideo.dataset.testRect = '300,300,0,0';
  lightboxVideo.muted = true;
  dialog.appendChild(lightboxVideo);
  const gesture = new win2.PointerEvent('pointerdown', { button: 0, bubbles: true });
  lightboxVideo.dispatchEvent(gesture);
  assert(lightboxVideo.muted === false, 'standalone (lightbox) video unmuted after user gesture');
  assert(Math.abs(lightboxVideo.volume - 0.5) < 0.01, 'standalone video volume is 0.5 after gesture');

  // ── Context menu: right-click on a post image opens the X-Now menu ───────────
  const img = doc2.createElement('img');
  img.dataset.testRect = '300,300,0,0';
  img.src = 'https://pbs.twimg.com/media/abc.jpg';
  doc2.querySelector('article').appendChild(img);
  const ctx = new win2.MouseEvent('contextmenu', { bubbles: true, cancelable: true, clientX: 40, clientY: 40 });
  const ctxDefaultPrevented = !img.dispatchEvent(ctx);
  assert(ctxDefaultPrevented, 'contextmenu on post image is intercepted');
  const menu = doc2.querySelector('.xnow-media-menu');
  assert(!!menu, 'media menu created on right-click');
  const labels = Array.from(menu.querySelectorAll('button')).map(b => b.textContent);
  assert(labels.some(l => l.includes('Save image to Downloads\\X-Now')), 'menu offers Save image');
  assert(labels.some(l => l.includes('Open post in default browser')), 'menu offers Open post in browser');

  // ── Handle detection for the native titlebar ─────────────────────────────────
  const profileLink = doc2.createElement('a');
  profileLink.setAttribute('data-testid', 'AppTabBar_Profile_Link');
  profileLink.setAttribute('href', '/benedictusrey');
  doc2.body.appendChild(profileLink);
  doc2.title = 'Home / X';

  // ── External link handoff: plain clicks leave X via the default browser ────
  const opened = [];
  win2.open = (url) => { opened.push(url); return null; };
  const externalLink = doc2.createElement('a');
  externalLink.href = 'https://example.com/article';
  externalLink.textContent = 'external';
  doc2.body.appendChild(externalLink);
  const externalClick = new win2.MouseEvent('click', { bubbles: true, cancelable: true, button: 0 });
  const externalPrevented = !externalLink.dispatchEvent(externalClick);
  assert(externalPrevented, 'external link click is intercepted');
  assert(opened.includes('https://example.com/article'), 'external link handed to the default browser');

  const tcoLink = doc2.createElement('a');
  tcoLink.href = 'https://t.co/abc123';
  tcoLink.textContent = 'tco';
  doc2.body.appendChild(tcoLink);
  const tcoPrevented = !tcoLink.dispatchEvent(new win2.MouseEvent('click', { bubbles: true, cancelable: true, button: 0 }));
  assert(tcoPrevented && opened.includes('https://t.co/abc123'), 't.co redirect link handed to the browser');

  const internalLink = doc2.createElement('a');
  internalLink.href = 'https://x.com/home';
  internalLink.textContent = 'home';
  doc2.body.appendChild(internalLink);
  const internalPrevented = !internalLink.dispatchEvent(new win2.MouseEvent('click', { bubbles: true, cancelable: true, button: 0 }));
  assert(internalPrevented === false, 'internal x.com link stays in-app (not intercepted)');
  assert(!opened.includes('https://x.com/home'), 'internal link never handed to the browser');

  const ctrlClick = new win2.MouseEvent('click', { bubbles: true, cancelable: true, button: 0, ctrlKey: true });
  const ctrlPrevented = !externalLink.dispatchEvent(ctrlClick);
  assert(ctrlPrevented === false, 'modifier-click on external link not intercepted (Rust router handles it)');
  assert(opened.filter(u => u === 'https://example.com/article').length === 1, 'modifier-click did not double-open');

  win2.setTimeout(async () => {
    assert(doc2.title === 'XNOW:benedictusrey', 'signed-in handle sets XNOW:<handle> title');

    // ── Media-save pipeline: lazy bridge, CORS-safe fetch, variants, filters ──
    // The tools script loaded WITHOUT __TAURI__ — the bridge is installed NOW,
    // proving lazy resolution (the fix for saves silently degrading when the
    // bridge is captured too early at load time).
    const invoked = [];
    const fetchCalls = [];
    let failAllDownloads = false;
    win2.__TAURI__ = { core: { invoke: async (cmd, args) => {
      invoked.push({ cmd, ...args });
      if (cmd === 'download_media') {
        if (failAllDownloads || /name=small/.test(args.url)) throw new Error('HTTP 403');
        return 'C:\\Users\\x\\Downloads\\X-Now\\' + (args.mediaType === 'video' ? 'v.mp4' : 'img.jpg');
      }
      if (cmd === 'save_media_bytes') return 'C:\\Users\\x\\Downloads\\X-Now\\fetched.jpg';
      if (cmd === 'prepare_download_folder') return 'C:\\Users\\x\\Downloads\\X-Now';
      throw new Error('unexpected ' + cmd);
    } } };
    win2.fetch = async (url, opts) => {
      fetchCalls.push({ url, creds: opts && opts.credentials });
      return { ok: true, headers: { get: () => 'image/jpeg' }, arrayBuffer: async () => new ArrayBuffer(16) };
    };
    win2.navigator.clipboard = { writeText: async () => {} };
    win2.performance.getEntriesByType = () => [];

    function postWithImg(win, src) {
      const article = win.document.createElement('article');
      article.setAttribute('data-testid', 'tweet');
      const link = win.document.createElement('a');
      link.href = 'https://x.com/someone/status/1234567890123';
      const img = win.document.createElement('img');
      img.dataset.testRect = '300,300,0,0';
      if (src) img.src = src;
      link.appendChild(img);
      article.appendChild(link);
      win.document.body.appendChild(article);
      return img;
    }
    async function saveImageViaMenu(win, img) {
      img.dispatchEvent(new win.MouseEvent('contextmenu', { bubbles: true, cancelable: true, clientX: 40, clientY: 40 }));
      const menu = win.document.querySelector('.xnow-media-menu');
      const btn = Array.from(menu.querySelectorAll('button')).find(b => b.textContent.includes('Save image'));
      btn.click();
      await new Promise(r => setTimeout(r, 150));
    }

    // A: lazy bridge + full-resolution FIRST (orig before the small thumbnail)
    const imgA = postWithImg(win2, 'https://pbs.twimg.com/media/AAA?format=jpg&name=small');
    await saveImageViaMenu(win2, imgA);
    const dlA = invoked.filter(c => c.cmd === 'download_media');
    assert(dlA.length >= 1, 'download_media attempted');
    assert(dlA[0] && dlA[0].url.includes('name=orig'), 'orig resolution variant tried FIRST (full quality)');
    const toastA = win2.document.querySelector('.xnow-toast');
    assert(toastA && toastA.textContent.includes('Saved image'), 'image saved at full resolution (toast)');

    // B: extensionless twimg resource URL used when the element has no src
    win2.performance.getEntriesByType = () => [{ name: 'https://pbs.twimg.com/media/BBB?format=jpg&name=240x240', initiatorType: 'img' }];
    const imgB = postWithImg(win2, null);
    await saveImageViaMenu(win2, imgB);
    const dlB = invoked.filter(c => c.cmd === 'download_media').pop();
    assert(dlB && dlB.url === 'https://pbs.twimg.com/media/BBB?format=jpg&name=240x240', 'extensionless twimg URL resolved from resources');

    // C: all native downloads fail -> fetch fallback with credentials OMIT
    failAllDownloads = true;
    const imgC = postWithImg(win2, 'https://pbs.twimg.com/media/CCC?format=jpg&name=medium');
    await saveImageViaMenu(win2, imgC);
    const mediaFetch = fetchCalls.find(f => /twimg\.com/.test(f.url));
    assert(mediaFetch && mediaFetch.creds === 'omit', 'cross-origin media fetch uses credentials omit (CORS-safe)');
    assert(invoked.some(c => c.cmd === 'save_media_bytes'), 'fallback saved bytes via save_media_bytes');

    // D: blob-only VIDEO must download the CLICKED post's video (og:video from
    // its post page), NEVER the first post's mp4 from page-wide resources —
    // the 'always downloaded the first post' regression.
    win2.fetch = async (url, opts) => {
      fetchCalls.push({ url, creds: opts && opts.credentials });
      if (/\/status\//.test(url)) {
        return {
          ok: true,
          headers: { get: () => 'text/html' },
          text: async () => '<html><head><meta property="og:video" content="https://video.twimg.com/ext_tw_video/987654/pu/vid/avc1/720x720/SECOND.mp4?format=mp4"/></head></html>'
        };
      }
      return { ok: true, headers: { get: () => 'image/jpeg' }, arrayBuffer: async () => new ArrayBuffer(16) };
    };
    win2.performance.getEntriesByType = () => [
      { name: 'https://video.twimg.com/ext_tw_video/111111/pu/vid/avc1/720x720/FIRST.mp4', initiatorType: 'video' },
      { name: 'https://video.twimg.com/ext_tw_video/222222/pu/vid/avc1/720x720/OTHER.mp4', initiatorType: 'video' },
      { name: 'https://video.twimg.com/ext_tw_video/987654/pl/PLAYLIST.m3u8?tag=14', initiatorType: 'video' }
    ];
    const articleD = win2.document.createElement('article');
    articleD.setAttribute('data-testid', 'tweet');
    const linkD = win2.document.createElement('a');
    linkD.href = 'https://x.com/someone/status/1234567890123';
    const videoD = win2.document.createElement('video');
    videoD.dataset.testRect = '300,300,0,0';
    videoD.src = 'blob:https://x.com/vid-clicked';
    articleD.appendChild(linkD);
    articleD.appendChild(videoD);
    win2.document.body.appendChild(articleD);
    videoD.dispatchEvent(new win2.MouseEvent('contextmenu', { bubbles: true, cancelable: true, clientX: 60, clientY: 60 }));
    const menuD = win2.document.querySelector('.xnow-media-menu');
    const btnD = Array.from(menuD.querySelectorAll('button')).find(b => b.textContent.includes('Save video'));
    btnD.click();
    await new Promise(r => setTimeout(r, 200));
    const dlD = invoked.filter(c => c.cmd === 'download_media' && /SECOND|FIRST|OTHER/.test(c.url));
    assert(dlD.length >= 1 && dlD[0].url.includes('SECOND.mp4'),
      'blob video resolves to the CLICKED post og:video (post page wins over page-wide resources)');
    assert(!invoked.some(c => c.cmd === 'download_media' && c.url.includes('FIRST.mp4')),
      'first post mp4 from resources never tried for the clicked video');
    assert(!invoked.some(c => c.cmd === 'download_media' && /\.m3u8/.test(c.url)),
      'HLS playlist URLs are excluded from candidates');
    const toastD = win2.document.querySelector('.xnow-toast');
    assert(toastD && toastD.textContent.includes('Saved video'), 'video success toast shown');

    // E: poster-ID scoping — even when the post page fetch FAILS, resources
    // are pinned to the clicked video via its poster's media ID.
    failAllDownloads = false;
    win2.fetch = async (url, opts) => {
      fetchCalls.push({ url, creds: opts && opts.credentials });
      if (/\/status\//.test(url)) return { ok: false, status: 500 };
      return { ok: true, headers: { get: () => 'image/jpeg' }, arrayBuffer: async () => new ArrayBuffer(16) };
    };
    win2.performance.getEntriesByType = () => [
      { name: 'https://video.twimg.com/ext_tw_video/111111/pu/vid/avc1/720x720/FIRST.mp4', initiatorType: 'video' },
      { name: 'https://video.twimg.com/ext_tw_video/777888/pu/vid/avc1/720x720/TARGET.mp4?tag=14', initiatorType: 'video' }
    ];
    const articleE = win2.document.createElement('article');
    articleE.setAttribute('data-testid', 'tweet');
    const linkE = win2.document.createElement('a');
    linkE.href = 'https://x.com/someone/status/9999999999';
    const videoE = win2.document.createElement('video');
    videoE.dataset.testRect = '300,300,0,0';
    videoE.src = 'blob:https://x.com/vid-e';
    videoE.poster = 'https://pbs.twimg.com/ext_tw_video_thumb/777888/pu/img/thumb.jpg';
    articleE.appendChild(linkE);
    articleE.appendChild(videoE);
    win2.document.body.appendChild(articleE);
    videoE.dispatchEvent(new win2.MouseEvent('contextmenu', { bubbles: true, cancelable: true, clientX: 80, clientY: 80 }));
    const menuE = win2.document.querySelector('.xnow-media-menu');
    const btnE = Array.from(menuE.querySelectorAll('button')).find(b => b.textContent.includes('Save video'));
    btnE.click();
    await new Promise(r => setTimeout(r, 200));
    const dlE = invoked.filter(c => c.cmd === 'download_media' && /FIRST|TARGET/.test(c.url));
    assert(dlE.length >= 1 && dlE[0].url.includes('777888'),
      'poster-ID scoping: clicked video resource (777888) wins over first page video (111111) even when the post fetch fails');

    // G: clicks on media elements are never handed off (ad click-through guard)
    const opened = [];
    const realOpen = win2.open;
    win2.open = (url) => { opened.push(url); return null; };
    const anchorG = win2.document.createElement('a');
    anchorG.href = 'https://t.co/ADCLICK';
    const videoG = win2.document.createElement('video');
    videoG.dataset.testRect = '300,300,0,0';
    anchorG.appendChild(videoG);
    win2.document.body.appendChild(anchorG);
    const clickOnVideo = new win2.MouseEvent('click', { bubbles: true, cancelable: true, button: 0 });
    videoG.dispatchEvent(clickOnVideo);
    await new Promise(r => setTimeout(r, 60));
    assert(clickOnVideo.defaultPrevented === false, 'click on a video inside an external (ad) link is NOT intercepted');
    assert(opened.length === 0, 'no browser hand-off when clicking the video itself');
    const spanG = win2.document.createElement('span');
    anchorG.appendChild(spanG);
    const clickOnSpan = new win2.MouseEvent('click', { bubbles: true, cancelable: true, button: 0 });
    spanG.dispatchEvent(clickOnSpan);
    await new Promise(r => setTimeout(r, 60));
    assert(clickOnSpan.defaultPrevented === true && opened.length === 1,
      'click on the non-media part of an external link IS handed off');
    win2.open = realOpen;

    // ── Cleanup sanity: single style element across the whole session ──────────
    assert(doc.querySelectorAll('style').length === 1, 'no style duplication after route polls');

    console.log(`\n${passed} passed, ${failed} failed`);
    process.exit(failed === 0 ? 0 : 1);
  }, 1100);
}, 150);
