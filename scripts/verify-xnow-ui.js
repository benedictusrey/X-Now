// jsdom harness for the page surfaces: the rail controls, the Settings sheet,
// Quiet hours, Focus layout, Motion and soft refresh.
// It loads the three page scripts in the order the native side injects them
// (lib.rs helper_script), with a mocked native bridge. jsdom has no layout, so
// each test gives X's nav and logo the rectangles a real page would report.
// Live checks on the Windows build remain the source of truth for X's own DOM.
'use strict';

const fs = require('fs');
const path = require('path');
const { JSDOM } = require('jsdom');

const ROOT = path.join(__dirname, '..');
const BRAND = 'data:image/png;base64,AAAA';
const SCRIPT = ['x-tools.js', 'x-rail.js', 'x-settings.js']
  .map(name => fs.readFileSync(path.join(ROOT, 'frontend', name), 'utf8'))
  .join('\n')
  .replace('__XNOW_BRAND_ICON__', BRAND);

let passed = 0;
let failed = 0;
function assert(cond, label) {
  if (cond) passed++;
  else { failed++; console.error(`  ✗ FAIL: ${label}`); }
}
const tick = ms => new Promise(resolve => setTimeout(resolve, ms));

const DEFAULTS = {
  closeToTray: true, alwaysOnTop: false, pauseOnMinimize: true, muteOnMinimize: true,
  sleepOnMinimize: true, feedVolume: 20, standaloneVolume: 50, cobaltFallback: true,
  zoomPercent: 100, motion: 'system', quietMode: 'off', quietStart: 1380, quietEnd: 420,
  focusLayout: false, unmuteWhenActive: true, history: [], launchAtLogin: false, theme: 'match'
};

// X's left panel in the centred 1920 layout: the logo sits above the nav, and the
// nav spans x 330 to 580.
const NAV = { left: 330, top: 120, right: 580, bottom: 700 };
const LOGO = { left: 360, top: 60, right: 396, bottom: 96 };

function setRect(node, { left, top, right, bottom }) {
  node.getBoundingClientRect = () => ({
    left, top, right, bottom, x: left, y: top,
    width: right - left, height: bottom - top,
  });
}

function addNav(document, rect = NAV) {
  const nav = document.createElement('nav');
  nav.setAttribute('aria-label', 'Primary');
  const home = document.createElement('a');
  home.href = '/home';
  home.textContent = 'Home';
  nav.appendChild(home);
  setRect(nav, rect);
  document.querySelector('header').appendChild(nav);
  return nav;
}

function makeDom(url, { trustedTypes = false, withNav = true, setup } = {}) {
  const dom = new JSDOM(
    `<!DOCTYPE html><html><head></head><body>
       <header>${withNav ? '<a href="/home" id="logo"><svg></svg></a>' : ''}</header>
       <main></main>
     </body></html>`,
    { runScripts: 'dangerously', url, pretendToBeVisual: true }
  );
  const { window } = dom;
  const { document } = window;
  window.IntersectionObserver = class { observe() {} unobserve() {} disconnect() {} };
  // jsdom has no ResizeObserver; the rail uses one at load.
  window.ResizeObserver = class { observe() {} unobserve() {} disconnect() {} };
  window.matchMedia = () => ({ matches: false, addEventListener() {}, removeEventListener() {} });
  window.scrollTo = () => {};
  const calls = [];
  let settings = { ...DEFAULTS };
  window.__TAURI__ = {
    core: {
      invoke: async (command, args) => {
        calls.push({ command, args });
        if (command === 'get_settings') return { ...settings };
        if (command === 'update_settings') {
          settings = { ...settings, ...args.patch };
          return { ...settings };
        }
        if (command === 'open_saved_folder') return undefined;
        throw new Error(`unexpected command ${command}`);
      }
    }
  };
  // jsdom has no layout, so offsetParent is always null. Stub it the way a real
  // page reports it for visible elements (the focus trap relies on it).
  Object.defineProperty(window.HTMLElement.prototype, 'offsetParent', {
    configurable: true, get() { return this.parentElement; }
  });
  // Trusted Types: a page that rejects string-to-HTML assignments. X may enforce
  // this, so the page scripts must not depend on innerHTML at all.
  if (trustedTypes) {
    const reject = () => { throw new window.TypeError('This document requires TrustedHTML assignment.'); };
    Object.defineProperty(window.Element.prototype, 'innerHTML', { configurable: true, set: reject, get() { return ''; } });
    window.Element.prototype.insertAdjacentHTML = reject;
  }
  if (withNav) {
    addNav(document);
    setRect(document.getElementById('logo'), LOGO);
  }
  setup?.(document);
  window.eval(SCRIPT);
  return { window, document, calls };
}

async function main() {
  // ── Rail placement: the right end of X's left panel, centred on the logo ──
  const { window, document, calls } = makeDom('https://x.com/home');
  await tick(20);
  const tools = document.querySelector('.xnow-rail-tools');
  assert(!!tools, 'rail tools mount once X\'s nav exists');
  assert(tools?.parentElement === document.body, 'rail tools are pinned to the body, not inside X\'s markup');
  // Nav right edge 580 + 8 gap - 16 inset - 76px for the two buttons = 496
  assert(tools?.style.left === '496px', `rail sits at the panel's right end (left ${tools?.style.left})`);
  // Logo top 60 + (36 - 36) / 2 = 60
  assert(tools?.style.top === '60px', `rail is centred on the logo (top ${tools?.style.top})`);
  assert(tools?.classList.contains('is-placed') === true, 'rail is revealed once placed');
  assert(window.__xnowRailEdge() === 588, 'rail edge comes from the nav (580 + 8)');
  assert(!!document.querySelector('[aria-label="X-Now settings"]'), 'brand button is labelled');
  assert(!!document.querySelector('[aria-label="Refresh feed"]'), 'refresh button is labelled');
  assert(document.querySelector('img.xnow-rail-brand')?.src === BRAND, 'brand icon is embedded, not a placeholder');

  // The rail follows the nav when the window changes size.
  setRect(document.querySelector('nav[aria-label="Primary"]'), { ...NAV, right: 640 });
  window.dispatchEvent(new window.Event('resize'));
  await tick(60);
  assert(tools.style.left === '556px', `rail follows the nav on resize (left ${tools.style.left})`);
  assert(document.documentElement.style.getPropertyValue('--xnow-sheet-left') === '648px',
    'the sheet edge variable follows the nav on resize');

  // After a zoom change X moves its columns for a few frames, then holds still.
  // The rail must end on the nav's final position, not the first one.
  const moving = document.querySelector('nav[aria-label="Primary"]');
  window.dispatchEvent(new window.Event('resize'));
  setTimeout(() => setRect(moving, { ...NAV, left: 340, right: 590 }), 30);
  setTimeout(() => setRect(moving, { ...NAV, left: 370, right: 620 }), 60);
  setTimeout(() => setRect(moving, { ...NAV, left: 380, right: 630 }), 90);
  await tick(300);
  assert(tools.style.left === '546px', `rail settles on the nav's final position (left ${tools.style.left})`);
  setRect(moving, { ...NAV, right: 640 });
  window.dispatchEvent(new window.Event('resize'));
  await tick(60);

  // An icon-only sidebar (72px wide) has no room beside the logo: the buttons stay
  // hidden there and come back when the panel widens.
  setRect(document.querySelector('nav[aria-label="Primary"]'), { left: 9, top: 58, right: 81, bottom: 611 });
  window.dispatchEvent(new window.Event('resize'));
  await tick(60);
  assert(tools.classList.contains('is-placed') === false, 'icon-only sidebar hides the rail instead of covering the logo');
  setRect(document.querySelector('nav[aria-label="Primary"]'), { ...NAV, right: 640 });
  window.dispatchEvent(new window.Event('resize'));
  await tick(60);
  assert(tools.classList.contains('is-placed') === true, 'rail comes back when the panel widens');

  // A narrow nav centred in the layout, with its logo centred too: the buttons would
  // cover the logo, so they must stay hidden.
  setRect(document.getElementById('logo'), { left: 410, top: 60, right: 446, bottom: 96 });
  setRect(document.querySelector('nav[aria-label="Primary"]'), { left: 400, top: 120, right: 470, bottom: 700 });
  window.dispatchEvent(new window.Event('resize'));
  await tick(60);
  assert(tools.classList.contains('is-placed') === false, 'a centred icon-only nav hides the rail instead of covering the logo');
  setRect(document.getElementById('logo'), LOGO);
  setRect(document.querySelector('nav[aria-label="Primary"]'), { ...NAV, right: 640 });
  window.dispatchEvent(new window.Event('resize'));
  await tick(60);

  // ── Quiet hours math (page clock) ─────────────────────────────────────────
  const at = (h, m) => new Date(2026, 0, 15, h, m);
  const nights = { quietMode: 'nights' };
  assert(window.__xnowQuietActive(nights, at(23, 30)) === true, 'nights: 23:30 is quiet');
  assert(window.__xnowQuietActive(nights, at(6, 59)) === true, 'nights: 06:59 is quiet');
  assert(window.__xnowQuietActive(nights, at(7, 0)) === false, 'nights: 07:00 ends quiet');
  assert(window.__xnowQuietActive(nights, at(12, 0)) === false, 'nights: midday is not quiet');
  const custom = { quietMode: 'custom', quietStart: 9 * 60, quietEnd: 17 * 60 };
  assert(window.__xnowQuietActive(custom, at(10, 0)) === true, 'custom same-day window is quiet');
  assert(window.__xnowQuietActive(custom, at(18, 0)) === false, 'custom same-day window ends');
  assert(window.__xnowQuietActive({ quietMode: 'off' }, at(23, 30)) === false, 'off is never quiet');
  assert(window.__xnowQuietActive({ quietMode: 'custom', quietStart: 600, quietEnd: 600 }, at(10, 0)) === false,
    'equal start and end means no window');

  // ── Settings sheet: opens from the panel edge, six sections, switch write-through ─
  await tick(20);
  window.__xnowOpenSettings();
  const sheet = document.getElementById('xnow-settings');
  assert(!!sheet && sheet.classList.contains('is-open'), 'settings sheet opens');
  assert(sheet.getAttribute('role') === 'dialog', 'sheet is a labelled dialog');
  assert(document.documentElement.style.getPropertyValue('--xnow-sheet-left') === '648px',
    'sheet opens from the panel edge (nav right 640 + 8)');
  assert(sheet.querySelectorAll('.xnow-set-section').length === 6, 'sheet has six sections');
  assert(sheet.querySelectorAll('.xnow-set-tile svg').length === 6, 'every section has an icon tile');
  assert(/Closing hides to tray/.test(sheet.querySelector('.xnow-set-status')?.textContent || ''),
    'status line describes the close behaviour');

  const hideToTray = document.querySelector('[aria-label="Hide to tray on close"]');
  assert(hideToTray?.getAttribute('aria-checked') === 'true', 'switch reflects the saved value');
  hideToTray.click();
  await tick(20);
  const saveCall = calls.find(c => c.command === 'update_settings');
  assert(JSON.stringify(saveCall?.args) === JSON.stringify({ patch: { closeToTray: false } }),
    'switch sends exactly its own key to update_settings');
  assert(hideToTray.getAttribute('aria-checked') === 'false', 'switch reflects the accepted value');

  document.dispatchEvent(new window.KeyboardEvent('keydown', { key: 'Escape' }));
  assert(!sheet.classList.contains('is-open'), 'Escape closes the sheet');

  // ── Motion and Focus layout reach the page ───────────────────────────────
  window.__xnowOpenSettings();
  const reduce = Array.from(document.querySelectorAll('[role="radio"]')).find(b => b.textContent === 'Reduce');
  reduce.click();
  await tick(20);
  assert(document.documentElement.dataset.xnowMotion === 'reduce', 'Motion: Reduce sets the page attribute');

  const focus = document.querySelector('[aria-label="Focus layout"]');
  focus.click();
  await tick(20);
  assert(document.documentElement.classList.contains('xnow-focus-layout'), 'Focus layout toggles the page class');
  const unmute = document.querySelector('[aria-label="Unmute videos when X-Now is active"]');
  assert(unmute && unmute.getAttribute('aria-checked') === 'true', 'Unmute videos when X-Now is active is on by default');
  window.__xnowCloseSettings();

  // ── Quiet hours: the custom window appears only for Custom, and saves times ─
  const customRow = document.querySelector('[data-quiet-custom]');
  assert(customRow?.hidden === true, 'custom window is hidden while Quiet hours are off');
  const scheduleGroup = document.querySelector('[role="radiogroup"][aria-label="Quiet hours"]');
  Array.from(scheduleGroup.querySelectorAll('[role="radio"]')).find(b => b.textContent === 'Custom').click();
  await tick(20);
  assert(customRow?.hidden === false, 'choosing Custom shows the start and end times');
  const startInput = document.querySelector('[aria-label="Quiet hours start"]');
  startInput.value = '22:30';
  startInput.dispatchEvent(new window.Event('change'));
  await tick(20);
  assert(calls.some(c => c.command === 'update_settings' && c.args.patch.quietStart === 1350),
    'quiet start saves minutes from midnight (22:30 = 1350)');

  // ── Soft refresh: X's own "Show N posts" pill is loaded in place ──────────
  const pill = document.createElement('button');
  pill.textContent = 'Show 3 posts';
  let pillClicked = false;
  pill.addEventListener('click', () => { pillClicked = true; });
  document.querySelector('main').appendChild(pill);
  document.querySelector('[aria-label="Refresh feed"]').click();
  await tick(800);
  assert(pillClicked, 'refresh loads X\'s new-posts pill in place');
  assert(document.querySelector('.xnow-toast-title')?.textContent === 'Loaded 3 new posts',
    'refresh reports the count');
  pill.remove();

  // ── Refresh with nothing new says so, without a page reload ──────────────
  document.querySelector('[aria-label="Refresh feed"]').click();
  await tick(3200);
  assert(document.querySelector('.xnow-toast:not(.is-leaving) .xnow-toast-title')?.textContent === 'Your feed is up to date',
    'refresh says the feed is up to date');

  // ── Quiet hours blocks autoplay ───────────────────────────────────────────
  const video = document.createElement('video');
  document.querySelector('main').appendChild(video);
  let pausedNow = false;
  video.pause = () => { pausedNow = true; };
  window.__xnowSettings = { ...window.__xnowSettings, quietMode: 'custom', quietStart: 0, quietEnd: 1439 };
  video.dispatchEvent(new window.Event('play'));
  assert(pausedNow === true, 'quiet hours pause a video that starts playing');

  // ── Trusted Types: a page that rejects string HTML still gets the rail ─────
  const tt = makeDom('https://x.com/home', { trustedTypes: true });
  await tick(50);
  assert(!!tt.document.querySelector('.xnow-rail-tools'), 'rail mounts on a page that rejects innerHTML');

  // ── Two quick toggles send two ordered writes and end where they started ──
  const dt = makeDom('https://x.com/home');
  await tick(20);
  const quick = dt.document.querySelector('[aria-label="Hide to tray on close"]');
  quick.click();
  quick.click();
  await tick(60);
  const sent = dt.calls.filter(c => c.command === 'update_settings').map(c => c.args.patch.closeToTray);
  assert(JSON.stringify(sent) === '[false,true]', 'two quick toggles send two ordered writes');
  assert(dt.window.__xnowSettings.closeToTray === true && quick.getAttribute('aria-checked') === 'true',
    'two quick toggles end where they started');

  // ── A logo-like link on the right of the page does not move the rail ──────
  // It is placed first in document order, so only the span check keeps it out.
  const decoy = makeDom('https://x.com/home', {
    setup(doc) {
      const link = doc.createElement('a');
      link.href = '/explore';
      link.appendChild(doc.createElementNS('http://www.w3.org/2000/svg', 'svg'));
      doc.body.prepend(link);
      setRect(link, { left: 1100, top: 20, right: 1136, bottom: 56 });
    }
  });
  await tick(20);
  assert(decoy.window.__xnowRailEdge() === 588, 'a link on the right does not set the rail edge');
  assert(decoy.document.querySelector('.xnow-rail-tools').style.top === '60px',
    'a link on the right does not set the rail height');

  // ── Focus trap: Tab on the last control wraps back into the sheet ─────────
  const trap = makeDom('https://x.com/home');
  await tick(20);
  trap.window.__xnowOpenSettings();
  await tick(20);
  const stops = Array.from(trap.document.querySelectorAll('#xnow-settings button, #xnow-settings input'))
    .filter(node => !node.disabled && node.tabIndex >= 0 && node.offsetParent !== null);
  stops[stops.length - 1].focus();
  trap.document.dispatchEvent(new trap.window.KeyboardEvent('keydown', { key: 'Tab', bubbles: true }));
  assert(trap.document.activeElement === stops[0], 'Tab on the last control wraps to the first');

  // ── Radio groups: the arrow keys move the selection and save ──────────────
  const radio = makeDom('https://x.com/home');
  await tick(20);
  radio.window.__xnowOpenSettings();
  await tick(20);
  const motion = radio.document.querySelector('[role="radiogroup"][aria-label="Motion"]');
  const system = Array.from(motion.querySelectorAll('[role="radio"]')).find(b => b.textContent === 'System');
  system.focus();
  motion.dispatchEvent(new radio.window.KeyboardEvent('keydown', { key: 'ArrowRight', bubbles: true }));
  await tick(60);
  assert(radio.calls.some(c => c.command === 'update_settings' && c.args.patch.motion === 'reduce'),
    'arrow key moves the radio selection and saves');

  // ── Theme: X-Now follows X's page palette; the Theme row is X's own Background,
  // stored in the night_mode cookie ─────────────────────────────────────────
  const themed = makeDom('https://x.com/home');
  await tick(30);
  const themeRadio = label => Array.from(themed.document.querySelectorAll('[role="radiogroup"][aria-label="Theme"] [role="radio"]'))
    .find(button => button.textContent === label);
  // X's page background drives the palette through the real reporter.
  const pageIs = bg => { themed.document.body.style.backgroundColor = bg; themed.window.__xnowReportThemeBackground(); };
  const palette = () => themed.document.documentElement.dataset.xnowTheme;
  pageIs('rgb(255, 255, 255)');
  assert(palette() === 'light', 'X-Now turns light with a light X');
  pageIs('rgb(21, 32, 43)');
  assert(palette() === 'dim', 'X-Now follows a dim X');
  pageIs('rgb(0, 0, 0)');
  assert(palette() === 'black', 'X-Now follows a black X');
  // The Theme row shows X's own Background: night_mode 0 is Light, 2 is Dark.
  themed.window.__xnowCloseSettings();
  themed.document.cookie = 'night_mode=0; path=/';
  themed.window.__xnowOpenSettings();
  await tick(20);
  assert(themeRadio('Light').getAttribute('aria-checked') === 'true', 'Theme row shows Light for night_mode=0');
  themed.window.__xnowCloseSettings();
  themed.document.cookie = 'night_mode=2; path=/';
  themed.window.__xnowOpenSettings();
  await tick(20);
  assert(themeRadio('Dark').getAttribute('aria-checked') === 'true', 'Theme row shows Dark for night_mode=2');
  // X's Display page, mocked: the Background radios (0 Default, 1 Lights out) set X's
  // background and cookie when clicked. X-Now drives them in-page and comes back to
  // the same route, without a reload (the marker survives).
  const xGroup = themed.document.createElement('div');
  xGroup.setAttribute('role', 'radiogroup');
  for (const label of ['Default', 'Lights out']) {
    const span = themed.document.createElement('span');
    span.textContent = label;
    xGroup.appendChild(span);
  }
  [0, 1].forEach(index => {
    const radio = themed.document.createElement('div');
    radio.setAttribute('role', 'radio');
    radio.addEventListener('click', () => {
      const dark = index === 1;
      themed.document.body.style.backgroundColor = dark ? 'rgb(0, 0, 0)' : 'rgb(255, 255, 255)';
      themed.document.cookie = `night_mode=${dark ? 2 : 0}; path=/`;
    });
    xGroup.appendChild(radio);
  });
  themed.document.querySelector('main').appendChild(xGroup);
  themed.document.elementFromPoint = () => null; // use the radio itself, as the fallback
  themed.window.__noReload = 'marker';
  themeRadio('Light').click();
  await tick(400);
  assert(themed.document.body.style.backgroundColor === 'rgb(255, 255, 255)' && themed.document.cookie.includes('night_mode=0'),
    'Light: X turns white and writes night_mode=0, driven in-page');
  assert(themed.window.location.pathname === '/home', 'Light: the page returns to its own route');
  assert(themed.window.__noReload === 'marker', 'Light: the document is not reloaded');
  assert(themeRadio('Light').getAttribute('aria-checked') === 'true', 'the Theme row shows Light after the switch');
  themeRadio('Dark').click();
  await tick(400);
  assert(themed.document.body.style.backgroundColor === 'rgb(0, 0, 0)' && themed.document.cookie.includes('night_mode=2'),
    'Dark: X turns black and writes night_mode=2, driven in-page');
  // If X does not respond, say so instead of failing silently.
  xGroup.remove();
  themeRadio('Light').click();
  await tick(4300);
  assert(Array.from(themed.document.querySelectorAll('.xnow-toast-title')).some(node => node.textContent.includes('did not change its Background')),
    'a switch X ignores shows an error toast');

  // ── Icon-only sidebar (measured live at 200%): the logo is centred above the
  // icons, so the pair goes in the gap between them, sized to fit that gap.
  const iconOnly = firstGlyphTop => ({
    setup(doc) {
      setRect(doc.querySelector('nav[aria-label="Primary"]'), { left: 8, top: 58, right: 73, bottom: 460 });
      setRect(doc.getElementById('logo'), { left: 14, top: 2, right: 66, bottom: 54 });
      setRect(doc.getElementById('logo').querySelector('svg'), { left: 15, top: 13, right: 65, bottom: 43 });
      const glyph = doc.createElementNS('http://www.w3.org/2000/svg', 'svg');
      doc.querySelector('nav[aria-label="Primary"] a').appendChild(glyph);
      setRect(glyph, { left: 27, top: firstGlyphTop, right: 53, bottom: firstGlyphTop + 26 });
    },
  });
  const roomy = makeDom('https://x.com/home', { setup: iconOnly(70).setup });
  const tight = makeDom('https://x.com/home', { setup: iconOnly(58).setup });
  const pair = roomy.document.querySelector('.xnow-rail-tools');
  assert(pair.classList.contains('is-placed') === true, 'icon-only sidebar keeps the pair, in the gap under the logo');
  // Gap 70 - 43 = 27px. Size 27 - 4 = 23px. Centred on the nav: 40.5 - 25 = 15.5, rounded to 16.
  assert(pair.style.left === '16px' && pair.style.top === '45px',
    `pair is centred in the gap (left ${pair.style.left}, top ${pair.style.top})`);
  assert(pair.style.getPropertyValue('--rail-size') === '23px',
    `pair is sized to the gap (${pair.style.getPropertyValue('--rail-size')})`);
  assert(tight.document.querySelector('.xnow-rail-tools').classList.contains('is-placed') === false,
    'a gap too small for the pair hides it instead of covering X');

  // ── Nothing shows before X's nav exists; the buttons follow X's nav ───────
  const late = makeDom('https://x.com/home', { withNav: false });
  await tick(30);
  assert(!late.document.querySelector('.xnow-rail-tools'), 'nothing is shown before X\'s nav exists');
  addNav(late.document);
  await tick(60);
  const lateTools = late.document.querySelector('.xnow-rail-tools');
  assert(lateTools?.classList.contains('is-placed') === true, 'buttons appear as soon as the nav appears');
  assert(lateTools?.style.left === '496px', 'and sit at the panel edge');
  // X re-renders its nav: the buttons move to the new one.
  late.document.querySelector('nav[aria-label="Primary"]').remove();
  addNav(late.document, { ...NAV, left: 30, right: 300 });
  await tick(60);
  assert(lateTools?.style.left === '216px', `buttons follow a re-rendered nav (left ${lateTools?.style.left})`);

  // ── Safety net: X's nav never appears, so the buttons show after 4 s ──────
  const safety = makeDom('https://x.com/home', { withNav: false });
  await tick(100);
  assert(!safety.document.querySelector('.xnow-rail-tools'), 'safety net waits before showing');
  await tick(4000);
  const fallback = safety.document.querySelector('.xnow-rail-tools');
  assert(fallback?.style.top === '14px' && fallback?.style.left === '72px', 'safety net uses the fixed spot');
  assert(fallback?.classList.contains('is-placed') === true, 'safety-net buttons are revealed');

  // ── About: a modal dialog with live status and the feature list; Escape closes it ──
  {
    const about = makeDom('https://x.com/home');
    await tick(20);
    const aboutJs = fs.readFileSync(path.join(ROOT, 'frontend', 'x-about.js'), 'utf8')
      .replace(/__VERSION__/g, '2.5.0')
      .replace(/__ICON_DATA_URI__/g, BRAND);
    about.window.__xnowSettings = { ...DEFAULTS, quietMode: 'nights', zoomPercent: 150, focusLayout: true };
    about.window.eval(aboutJs);
    const dialog = about.document.querySelector('#__xnow_about [role="dialog"]');
    assert(!!dialog && dialog.getAttribute('aria-modal') === 'true', 'About opens as a modal dialog');
    const values = Array.from(about.document.querySelectorAll('.xnow-about-tile-value')).map(node => node.textContent);
    assert(values.includes('150%') && values.includes('On'), `About shows live zoom and focus layout (${values.join(', ')})`);
    assert(about.document.querySelector('.xnow-about-version')?.textContent === 'v2.5.0', 'About shows the version');
    assert(about.document.querySelectorAll('.xnow-about-feature').length === 6, 'About lists the six features');
    about.document.dispatchEvent(new about.window.KeyboardEvent('keydown', { key: 'Escape' }));
    assert(!about.document.getElementById('__xnow_about'), 'Escape closes About');
  }

  // ── Init-script timing: scripts run before the document exists ───────────
  // X's init script runs before <head> and <body> exist. An unguarded top-level
  // DOM call threw there and silently stopped every page script after it (the
  // live probe found it). Simulate that timing: no head, no body, no root.
  {
    const dom = new JSDOM('<!DOCTYPE html><html><head></head><body><nav aria-label="Primary"></nav></body></html>', {
      runScripts: 'dangerously', url: 'https://x.com/home', pretendToBeVisual: true
    });
    const w = dom.window;
    const d = w.document;
    w.IntersectionObserver = class { observe() {} unobserve() {} disconnect() {} };
    w.ResizeObserver = class { observe() {} unobserve() {} disconnect() {} };
    w.matchMedia = () => ({ matches: false, addEventListener() {} });
    w.scrollTo = () => {};
    w.__TAURI__ = { core: { invoke: async () => ({ ...DEFAULTS }) } };
    const proto = w.Document.prototype;
    const saved = ['head', 'documentElement', 'body'].map(name => [name, Object.getOwnPropertyDescriptor(proto, name)]);
    for (const [name] of saved) Object.defineProperty(proto, name, { configurable: true, get: () => null });
    let threw = null;
    try { w.eval(SCRIPT); } catch (error) { threw = error; }
    for (const [name, desc] of saved) Object.defineProperty(proto, name, desc);
    assert(threw === null, `page scripts run before the document exists${threw ? ': ' + threw : ''}`);
    d.dispatchEvent(new w.Event('DOMContentLoaded'));
    await tick(30);
    assert(!!d.querySelector('.xnow-rail-tools'), 'rail mounts once the document is ready');
    assert(w.__xnowSettingsInstalled === true && !!d.getElementById('xnow-settings'),
      'settings sheet builds once the document is ready');
  }

  console.log(`\n${passed} passed, ${failed} failed`);
  // Exit directly: the quiet-hours interval would otherwise keep the process
  // alive, and closing the jsdom window first breaks timers that read location.
  process.exit(failed ? 1 : 0);
}

main().catch(error => {
  console.error(error);
  process.exit(1);
});
