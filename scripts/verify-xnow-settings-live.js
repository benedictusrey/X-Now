#!/usr/bin/env node
// Live Settings suite for X-Now. It drives the real app over the Chrome DevTools
// Protocol with real mouse and keyboard input. It checks every Settings control,
// the two rail buttons, Quiet hours enforcement, the saved-media list,
// persistence, and the layout at several zoom levels.
//
// The run seeds one saved-media row, and backs up settings.json and the mute flag
// from %APPDATA%\com.xnow.desktop. It closes the app before restoring both, so the
// user's data is left as it was found. Any running X-Now is closed first.
//
//   node scripts/verify-xnow-settings-live.js [--exe <X-Now.exe>] [--out <folder>]
'use strict';

const fs = require('fs');
const os = require('os');
const path = require('path');
const { spawn, spawnSync } = require('child_process');
const { chromium } = require('playwright-core');

const ROOT = path.join(__dirname, '..');
const DATA = path.join(process.env.APPDATA || '', 'com.xnow.desktop');
const SETTINGS = path.join(DATA, 'settings.json');
const FLAG = path.join(DATA, 'audio-muted.flag');
const PORT = 9336;
const ZOOM_STEPS = [125, 150, 200, 300, 75, 50, 100];

const arg = name => {
  const i = process.argv.indexOf(`--${name}`);
  return i >= 0 ? process.argv[i + 1] : null;
};
const sleep = ms => new Promise(resolve => setTimeout(resolve, ms));
const readSettings = () => JSON.parse(fs.readFileSync(SETTINGS, 'utf8'));

async function waitFor(test, ms = 4000) {
  const until = Date.now() + ms;
  while (Date.now() < until) {
    try {
      if (await test()) return true;
    } catch (_) { /* keep polling */ }
    await sleep(60);
  }
  return false;
}

async function waitForCdp(ms) {
  const until = Date.now() + ms;
  while (Date.now() < until) {
    try {
      const res = await fetch(`http://127.0.0.1:${PORT}/json/version`);
      if (res.ok) return;
    } catch (_) { /* not up yet */ }
    await sleep(500);
  }
  throw new Error('CDP did not come up');
}

function killApp() {
  spawnSync('taskkill', ['/IM', 'X-Now.exe', '/F']);
  spawnSync('taskkill', ['/IM', 'X-Now_v2.5.0.exe', '/F']);
}

(async () => {
  const exe = arg('exe') || path.join(ROOT, 'src-tauri', 'target', 'release', 'X-Now.exe');
  const out = path.resolve(arg('out') || path.join(os.tmpdir(), 'xnow-settings-live'));
  fs.mkdirSync(out, { recursive: true });

  const originalSettings = fs.existsSync(SETTINGS) ? fs.readFileSync(SETTINGS, 'utf8') : null;
  const originalFlag = fs.existsSync(FLAG) ? fs.readFileSync(FLAG, 'utf8') : null;
  const results = [];
  const check = (group, name, ok, detail = null) => results.push({ group, name, ok: Boolean(ok), detail });
  const report = { exe, out, results, pageErrors: [], fatal: null };
  let proc = null;
  let browser = null;

  try {
    // Seed one saved-media row, so the history list has a row to test.
    const seedPath = path.join(out, 'seed-image.jpg');
    fs.writeFileSync(seedPath, 'seed');
    const seeded = originalSettings ? JSON.parse(originalSettings) : {};
    seeded.history = [{ kind: 'image', path: seedPath, savedAt: Math.floor(Date.now() / 1000) - 300 }];
    fs.mkdirSync(DATA, { recursive: true });
    fs.writeFileSync(SETTINGS, JSON.stringify(seeded, null, 2));

    killApp();
    await sleep(1200);
    const logFd = fs.openSync(path.join(out, 'app-stderr.log'), 'w');
    proc = spawn(exe, [], {
      stdio: ['ignore', logFd, logFd],
      env: { ...process.env, XNOW_WEBVIEW_ARGS: `--remote-debugging-port=${PORT}` },
    });
    await waitForCdp(60000);
    browser = await chromium.connectOverCDP(`http://127.0.0.1:${PORT}`);
    const page = browser.contexts()[0].pages().find(p => p.url().includes('x.com')) || browser.contexts()[0].pages()[0];
    page.on('pageerror', error => report.pageErrors.push(String(error).slice(0, 200)));
    await page.waitForFunction(
      () => document.querySelector('.xnow-rail-tools.is-placed') && window.__xnowOpenSettings,
      null,
      { timeout: 60000 }
    );

    // ── helpers ────────────────────────────────────────────────────────────
    const group = async (name, run) => {
      try {
        await run();
      } catch (error) {
        check(name, `${name} ran to the end without an exception`, false, String(error).slice(0, 300));
      }
    };
    const isOpen = () => page.evaluate(() => Boolean(document.getElementById('xnow-settings')?.classList.contains('is-open')));
    const railPlaced = () => page.evaluate(() => Boolean(document.querySelector('.xnow-rail-tools.is-placed')));
    async function openSettings() {
      if (await isOpen()) return;
      if (await railPlaced()) await page.locator('.xnow-rail-brand-btn').click();
      else await page.evaluate(() => window.__xnowOpenSettings());
      await waitFor(isOpen, 3000);
      await sleep(260);
    }
    async function closeWithEscape() {
      await page.keyboard.press('Escape');
      await waitFor(async () => !(await isOpen()), 3000);
      await sleep(200);
    }
    const switchBy = label => page.locator(`.xnow-switch[aria-label="${label}"]`);
    const segBy = (group, text) => page
      .locator(`[role="radiogroup"][aria-label="${group}"] [role="radio"]`)
      .filter({ hasText: new RegExp(`^${text}$`) });
    const sliderBy = label => page.locator(`input[type="range"][aria-label="${label}"]`);
    const timeBy = label => page.locator(`input[type="time"][aria-label="${label}"]`);
    const waitSetting = (key, value) => waitFor(() => readSettings()[key] === value);
    async function setSlider(label, value) {
      await page.evaluate(([label, value]) => {
        const input = document.querySelector(`input[type="range"][aria-label="${label}"]`);
        input.value = String(value);
        input.dispatchEvent(new Event('input', { bubbles: true }));
        input.dispatchEvent(new Event('change', { bubbles: true }));
      }, [label, value]);
    }
    const snapshot = () => page.evaluate(() => {
      const box = el => {
        if (!el) return null;
        const b = el.getBoundingClientRect();
        return { l: b.left, t: b.top, r: b.right, b: b.bottom, w: b.width, h: b.height };
      };
      const nav = document.querySelector('nav[aria-label="Primary"]');
      const rail = document.querySelector('.xnow-rail-tools');
      const sheet = document.getElementById('xnow-settings');
      // X's logo: the svg-only link above the nav. The first icon: an svg in a nav link.
      const logo = nav && Array.from(document.querySelectorAll('a, [role="link"]')).find(el => {
        if (!el.querySelector('svg') || el.textContent.trim()) return false;
        const r = el.getBoundingClientRect();
        return r.bottom <= nav.getBoundingClientRect().top + 4 && r.width >= 16 && r.width <= 96;
      });
      return {
        vw: window.innerWidth,
        vh: window.innerHeight,
        nav: box(nav),
        rail: box(rail),
        railPlaced: Boolean(rail && rail.classList.contains('is-placed')),
        logoGlyph: box(logo && logo.querySelector('svg')),
        firstGlyph: box(nav && nav.querySelector('a svg')),
        sheet: box(sheet),
        sheetOpen: Boolean(sheet && sheet.classList.contains('is-open')),
        edgeVar: document.documentElement.style.getPropertyValue('--xnow-sheet-left'),
      };
    });

    // ── media: volumes and hide behaviour follow their Settings ───────────
    await group('media', async () => {
      await openSettings();
      await setSlider('Feed video volume', 37);
      await waitSetting('feedVolume', 37);
      await setSlider('Opened video volume', 61);
      await waitSetting('standaloneVolume', 61);
      const volumes = await page.evaluate(async () => {
        const feedVideo = document.createElement('video');
        document.body.appendChild(feedVideo);
        const dialog = document.createElement('div');
        dialog.setAttribute('role', 'dialog');
        const openedVideo = document.createElement('video');
        dialog.appendChild(openedVideo);
        document.body.appendChild(dialog);
        await new Promise(resolve => setTimeout(resolve, 900));
        const result = { feed: feedVideo.volume, opened: openedVideo.volume };
        feedVideo.remove();
        dialog.remove();
        return result;
      });
      check('media', 'a feed video takes the Feed video volume setting (37%)', Math.abs(volumes.feed - 0.37) < 0.01, volumes);
      check('media', 'an opened video takes the Opened video volume setting (61%)', Math.abs(volumes.opened - 0.61) < 0.01, volumes);

      // Pause and mute follow their switches, whichever path hides the window.
      await switchBy('Pause video').click();
      await waitSetting('pauseOnMinimize', false);
      const skipped = await page.evaluate(() => window.__onWindowHidden());
      check('media', 'with Pause video off, hiding does not pause', skipped === 'skipped', skipped);
      await switchBy('Pause video').click();
      check('media', 'Pause video is back on', await waitSetting('pauseOnMinimize', true));

      await switchBy('Mute sound').click();
      await waitSetting('muteOnMinimize', false);
      const mute = await page.evaluate(() => {
        const video = document.createElement('video');
        document.body.appendChild(video);
        Object.defineProperty(video, 'paused', { configurable: true, get: () => false });
        video.pause = () => {};
        window.__onWindowHidden();
        const muted = video.muted;
        video.remove();
        return { muted };
      });
      check('media', 'with Mute sound off, hiding leaves the video unmuted', mute.muted === false, mute);
      await switchBy('Mute sound').click();
      check('media', 'Mute sound is back on', await waitSetting('muteOnMinimize', true));
      await setSlider('Feed video volume', 20);
      check('media', 'Feed video volume is back to 20%', await waitSetting('feedVolume', 20));
      await setSlider('Opened video volume', 50);
      check('media', 'Opened video volume is back to 50%', await waitSetting('standaloneVolume', 50));
      await closeWithEscape();
    });

    // WCAG contrast of the panel's text and controls, from computed styles.
    // Text needs 4.5:1; a control's on/off state needs 3:1.
    const contrastRowsInPage = () => {
      const rgb = s => (s.match(/[\d.]+/g) || []).slice(0, 3).map(Number);
      const alphaOf = s => { const m = s.match(/[\d.]+/g) || []; return m.length < 4 ? 1 : Number(m[3]); };
      const bgOf = el => {
        let n = el;
        while (n && n.nodeType === 1) {
          const c = getComputedStyle(n).backgroundColor;
          if (alphaOf(c) > 0) return rgb(c);
          n = n.parentElement;
        }
        return [255, 255, 255];
      };
      const lum = c => {
        const f = v => { v /= 255; return v <= 0.03928 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4); };
        return 0.2126 * f(c[0]) + 0.7152 * f(c[1]) + 0.0722 * f(c[2]);
      };
      const ratio = (a, b) => {
        const [hi, lo] = [lum(a), lum(b)].sort((x, y) => y - x);
        return Math.round(((hi + 0.05) / (lo + 0.05)) * 100) / 100;
      };
      const sheet = document.getElementById('xnow-settings');
      const pick = (selector, label, kind) => {
        const el = sheet.querySelector(selector);
        if (!el) return { label, missing: true };
        const fg = kind === 'text' ? rgb(getComputedStyle(el).color) : bgOf(el);
        const bg = kind === 'text' ? bgOf(el) : bgOf(el.parentElement);
        return { label, ratio: ratio(fg, bg), needs: kind === 'text' ? 4.5 : 3 };
      };
      return [
        pick('.xnow-row-label', 'row label', 'text'),
        pick('.xnow-row-desc', 'row description', 'text'),
        pick('.xnow-seg button[aria-checked="false"]', 'unselected option', 'text'),
        pick('.xnow-set-status', 'header status', 'text'),
        pick('.xnow-set-heading h3', 'section heading', 'text'),
        pick('.xnow-switch[aria-checked="false"]', 'off switch track', 'ui'),
        pick('.xnow-switch[aria-checked="true"]', 'on switch track', 'ui'),
      ];
    };

    // ── rail buttons ───────────────────────────────────────────────────────
    await group('rail', async () => {
      const start = await snapshot();
      check('rail', 'rail is revealed at launch', start.railPlaced, start.rail);
      check('rail', 'rail sits inside the left panel',
        start.nav && start.rail && start.rail.l >= start.nav.l - 1 && start.rail.r <= start.nav.r + 1 && start.rail.t < start.nav.t,
        { rail: start.rail, nav: start.nav });
      check('rail', 'brand button is labelled', (await page.locator('.xnow-rail-brand-btn[aria-label="X-Now settings"]').count()) === 1);
      check('rail', 'refresh button is labelled', (await page.locator('.xnow-refresh[aria-label="Refresh feed"]').count()) === 1);

      await page.locator('.xnow-rail-brand-btn').click();
      await waitFor(isOpen, 3000);
      check('rail', 'brand button opens Settings and reports it expanded',
        (await page.locator('.xnow-rail-brand-btn').getAttribute('aria-expanded')) === 'true');
      await closeWithEscape();
      check('rail', 'Escape closes Settings and collapses the brand button',
        !(await isOpen()) && (await page.locator('.xnow-rail-brand-btn').getAttribute('aria-expanded')) === 'false');
      check('rail', 'focus returns to the brand button',
        await page.evaluate(() => document.activeElement?.classList.contains('xnow-rail-brand-btn') === true));

      await page.locator('.xnow-refresh').click();
      const toast = await waitFor(() => page.evaluate(() => Boolean(document.querySelector('.xnow-toast .xnow-toast-title'))), 6000);
      const title = await page.evaluate(() => document.querySelector('.xnow-toast .xnow-toast-title')?.textContent || null);
      check('rail', 'refresh button shows a result toast', toast, title);
    });

    // ── sheet: close, scrim, focus trap ────────────────────────────────────
    await group('sheet', async () => {
      await openSettings();
      const s = await snapshot();
      check('sheet', 'sheet has six sections', (await page.locator('.xnow-set-section').count()) === 6);
      check('sheet', 'every section has an icon tile', (await page.locator('.xnow-set-tile svg').count()) === 6);
      check('sheet', 'sheet starts at the panel edge (nav right + 8)',
        s.nav && s.sheet && Math.abs(s.sheet.l - (s.nav.r + 8)) <= 1,
        { sheetLeft: s.sheet?.l, edge: s.nav && s.nav.r + 8, edgeVar: s.edgeVar });

      await page.locator('.xnow-set-close').click();
      await waitFor(async () => !(await isOpen()), 3000);
      check('sheet', 'the close button closes the sheet', !(await isOpen()));

      await openSettings();
      await page.mouse.click(Math.round(s.vw - 24), Math.round(s.vh / 2));
      await waitFor(async () => !(await isOpen()), 3000);
      check('sheet', 'a click outside the sheet closes it', !(await isOpen()));

      await openSettings();
      await page.evaluate(() => {
        window.__stops = Array.from(document.querySelectorAll('#xnow-settings button, #xnow-settings input'))
          .filter(n => !n.disabled && n.tabIndex >= 0 && n.offsetParent !== null);
        window.__stops[window.__stops.length - 1].focus();
      });
      await page.keyboard.press('Tab');
      check('sheet', 'Tab on the last control wraps to the first',
        await page.evaluate(() => document.activeElement === window.__stops[0]));
      await page.keyboard.press('Shift+Tab');
      check('sheet', 'Shift+Tab on the first control wraps to the last',
        await page.evaluate(() => document.activeElement === window.__stops[window.__stops.length - 1]));
      await closeWithEscape();
    });

    // ── switches: every toggle writes its own key and reflects it ──────────
    await group('switches', async () => {
      await openSettings();
      const SWITCHES = [
        ['closeToTray', 'Hide to tray on close'],
        ['alwaysOnTop', 'Keep on top'],
        ['pauseOnMinimize', 'Pause video'],
        ['muteOnMinimize', 'Mute sound'],
        ['sleepOnMinimize', 'Sleep the page'],
        ['cobaltFallback', "Open Cobalt when a video can't be saved"],
        ['focusLayout', 'Focus layout'],
      ];
      for (const [key, label] of SWITCHES) {
        const before = readSettings()[key];
        await switchBy(label).click();
        check('switches', `${label}: a click saves ${key}`, await waitSetting(key, !before), { before, after: readSettings()[key] });
        check('switches', `${label}: the switch shows the saved value`,
          (await switchBy(label).getAttribute('aria-checked')) === String(!before));
        if (key === 'focusLayout') {
          check('switches', 'Focus layout toggles the page class',
            await page.evaluate(v => document.documentElement.classList.contains('xnow-focus-layout') === v, !before));
        }
        if (key === 'closeToTray') {
          check('switches', 'the status line follows Hide to tray',
            (await page.locator('.xnow-set-status').textContent()).includes(before ? 'Closing quits X-Now.' : 'Closing hides to tray.'));
        }
        await switchBy(label).click();
        check('switches', `${label}: a second click restores ${key}`, await waitSetting(key, before));
      }
      const launch = switchBy('Start when you sign in');
      check('switches', '"Start when you sign in" is read-only', await launch.isDisabled());
      const launchBefore = await launch.getAttribute('aria-checked');
      await launch.click({ force: true }).catch(() => {});
      check('switches', 'a read-only switch does not change on click',
        (await launch.getAttribute('aria-checked')) === launchBefore);
      await closeWithEscape();
    });

    // ── segmented controls: click and arrow keys ───────────────────────────
    await group('segments', async () => {
      await openSettings();
      for (const [value, text] of [['nights', 'Nights'], ['custom', 'Custom'], ['off', 'Off']]) {
        await segBy('Quiet hours', text).click();
        check('segments', `Quiet hours: ${text} saves quietMode=${value}`, await waitSetting('quietMode', value));
        check('segments', `Quiet hours: ${text} marks its option selected`,
          (await segBy('Quiet hours', text).getAttribute('aria-checked')) === 'true');
        check('segments', `Quiet hours: ${text} moves the selection pill`,
          (await page.locator('[role="radiogroup"][aria-label="Quiet hours"] .xnow-seg-pill').evaluate(el => el.style.transform)) !== '');
        check('segments', `Quiet hours: ${text} shows the custom times only for Custom`,
          (await page.locator('[data-quiet-custom]').isVisible()) === (value === 'custom'));
      }
      for (const [value, text] of [['reduce', 'Reduce'], ['full', 'Full'], ['system', 'System']]) {
        await segBy('Motion', text).click();
        check('segments', `Motion: ${text} saves motion=${value}`, await waitSetting('motion', value));
        const attr = await page.evaluate(() => document.documentElement.dataset.xnowMotion || null);
        const systemReduces = await page.evaluate(() => matchMedia('(prefers-reduced-motion: reduce)').matches);
        const expected = value === 'reduce' ? 'reduce' : value === 'full' ? 'full' : systemReduces ? 'reduce' : null;
        check('segments', `Motion: ${text} sets the page motion attribute`, attr === expected, { attr, expected });
      }
      // Arrow keys move the selection and save, as in a native radio group.
      await segBy('Motion', 'System').focus();
      await page.keyboard.press('ArrowRight');
      check('segments', 'ArrowRight on Motion saves the next option (reduce)', await waitSetting('motion', 'reduce'));
      await page.keyboard.press('ArrowLeft');
      check('segments', 'ArrowLeft on Motion saves the previous option (system)', await waitSetting('motion', 'system'));
      await closeWithEscape();
    });

    // ── theme: X's own Background through the Theme row, then X-Now in each palette ──
    // The Theme row drives X's own Display setting in-page. Each choice is checked in
    // place, and six switches in a row must all keep the same document. The suite ends
    // on Dark, the user's own setting.
    const aboutSource = () => fs.readFileSync(path.join(ROOT, 'frontend', 'x-about.js'), 'utf8')
      .replace(/__ICON_DATA_URI__/g, 'data:image/png;base64,AAAA')
      .replace(/__VERSION__/g, '2.5.0');
    await group('theme', async () => {
      await openSettings();
      // A switch must happen in place: the document keeps the same marker, X's
      // background changes, and the panel stays open.
      const chooseTheme = async (label, body) => {
        await page.evaluate(() => { window.__noReload = window.__noReload || Math.random(); });
        const marker = await page.evaluate(() => window.__noReload);
        await segBy('Theme', label).click();
        await waitFor(() => page.evaluate(want => getComputedStyle(document.body).backgroundColor === want, body), 8000);
        await sleep(400);
        const same = await page.evaluate(m => window.__noReload === m, marker);
        check('theme', `${label}: X-Now switched without reloading the page`, same, { marker, same });
        check('theme', `${label}: the Settings panel stays open`, await isOpen(), null);
      };
      const themed = async (value, label, cookie, body, palette) => {
        await chooseTheme(label, body);
        const shown = await page.evaluate(() => {
          const sheet = document.getElementById('xnow-settings');
          const refresh = document.querySelector('.xnow-refresh svg');
          const rgb = s => (s.match(/[\d.]+/g) || []).slice(0, 3).map(Number);
          const lum = c => { const f = v => { v /= 255; return v <= 0.03928 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4); }; return 0.2126 * f(c[0]) + 0.7152 * f(c[1]) + 0.0722 * f(c[2]); };
          let n = refresh.parentElement; let backdrop = [255, 255, 255];
          while (n && n.nodeType === 1) { const c = getComputedStyle(n).backgroundColor; const m = c.match(/[\d.]+/g) || []; if (m.length < 4 || Number(m[3]) > 0) { backdrop = rgb(c); break; } n = n.parentElement; }
          const [hi, lo] = [lum(rgb(getComputedStyle(refresh).color)), lum(backdrop)].sort((a, b) => b - a);
          return {
            cookie: (document.cookie.match(/night_mode=(\d)/) || [])[1] || null,
            body: getComputedStyle(document.body).backgroundColor,
            palette: document.documentElement.dataset.xnowTheme || null,
            sheetBg: getComputedStyle(sheet).backgroundColor,
            sheetOpen: sheet.classList.contains('is-open'),
            railPlaced: Boolean(document.querySelector('.xnow-rail-tools.is-placed')),
            refreshContrast: Math.round(((hi + 0.05) / (lo + 0.05)) * 100) / 100,
          };
        });
        check('theme', `${label}: X saves its Background cookie (night_mode=${cookie})`, shown.cookie === cookie, shown.cookie);
        check('theme', `${label}: X shows its ${body} background`, shown.body === body, shown.body);
        check('theme', `${label}: X-Now uses the ${palette} palette`, shown.palette === palette, shown.palette);
        check('theme', `${label}: the panel background matches`, shown.sheetBg === body, shown.sheetBg);
        check('theme', `${label}: the Settings panel is still open`, shown.sheetOpen, shown.sheetOpen);
        check('theme', `${label}: the rail is still placed`, shown.railPlaced, shown.railPlaced);
        check('theme', `${label}: the rail icon contrast is at least 3:1`, shown.refreshContrast >= 3, `${shown.refreshContrast}:1`);
        for (const row of await page.evaluate(contrastRowsInPage)) {
          if (row.missing) continue;
          check('theme', `${label}: ${row.label} contrast`, row.ratio >= row.needs, `${row.ratio}:1 (needs ${row.needs})`);
        }
        await page.evaluate(aboutSource());
        const card = await page.evaluate(() => {
          const c = document.querySelector('#__xnow_about > div');
          return c ? getComputedStyle(c).backgroundColor : null;
        });
        const aboutWanted = palette === 'light' ? 'rgb(247, 249, 249)' : 'rgb(22, 24, 28)';
        check('theme', `${label}: the About card uses the ${palette} surface`, card === aboutWanted, { card, aboutWanted });
        await page.evaluate(() => { if (window.__xnowAboutClose) window.__xnowAboutClose(); });
      };
      await themed('light', 'Light', '0', 'rgb(255, 255, 255)', 'light');
      await themed('dark', 'Dark', '2', 'rgb(0, 0, 0)', 'black');
      for (const [label, body] of [['Light', 'rgb(255, 255, 255)'], ['Dark', 'rgb(0, 0, 0)'], ['Light', 'rgb(255, 255, 255)'],
        ['Dark', 'rgb(0, 0, 0)'], ['Light', 'rgb(255, 255, 255)'], ['Dark', 'rgb(0, 0, 0)']]) {
        await chooseTheme(label, body);
      }
    });

    // ── sliders: keyboard and readout ──────────────────────────────────────
    await group('sliders', async () => {
      await openSettings();
      for (const [key, label] of [['feedVolume', 'Feed video volume'], ['standaloneVolume', 'Opened video volume']]) {
        const before = readSettings()[key];
        await sliderBy(label).focus();
        await page.keyboard.press('ArrowRight');
        check('sliders', `${label}: ArrowRight saves +1`, await waitSetting(key, Math.min(100, before + 1)), readSettings()[key]);
        await page.keyboard.press('ArrowLeft');
        check('sliders', `${label}: ArrowLeft restores ${before}`, await waitSetting(key, before));
      }
      await setSlider('Feed video volume', 42);
      await waitSetting('feedVolume', 42);
      const readout = await page.locator('.xnow-range', { has: sliderBy('Feed video volume') }).locator('output').textContent();
      check('sliders', 'the readout shows the saved percentage', readout === '42%', readout);
      await setSlider('Feed video volume', 20);
      await waitSetting('feedVolume', 20);
      await closeWithEscape();
    });

    // ── Quiet hours: time fields, invalid input, enforcement ───────────────
    await group('quiet', async () => {
      await openSettings();
      await segBy('Quiet hours', 'Custom').click();
      await waitSetting('quietMode', 'custom');
      const start = timeBy('Quiet hours start');
      await start.fill('22:15');
      await start.press('Tab');
      check('quiet', 'start time saves minutes after midnight (22:15 = 1335)', await waitSetting('quietStart', 1335));
      const end = timeBy('Quiet hours end');
      await end.fill('06:30');
      await end.press('Tab');
      check('quiet', 'end time saves minutes after midnight (06:30 = 390)', await waitSetting('quietEnd', 390));

      await start.fill('');
      await start.press('Tab');
      await sleep(300);
      check('quiet', 'a cleared start time restores the saved value',
        (await start.inputValue()) === '22:15' && readSettings().quietStart === 1335, await start.inputValue());

      // Cover the whole day, then check status text and the media guard.
      await start.fill('00:00');
      await start.press('Tab');
      await end.fill('23:58');
      await end.press('Tab');
      await waitSetting('quietEnd', 1438);
      check('quiet', 'status says quiet hours are active now',
        (await page.locator('[data-quiet-status]').textContent()).includes('Active now'));
      const guard = await page.evaluate(() => {
        const video = document.createElement('video');
        document.body.appendChild(video);
        video.dispatchEvent(new Event('play'));
        const result = { muted: video.muted, paused: video.paused };
        video.remove();
        return result;
      });
      check('quiet', 'a video that starts during quiet hours is muted and paused', guard.muted === true && guard.paused === true, guard);

      await segBy('Quiet hours', 'Off').click();
      await waitSetting('quietMode', 'off');
      await closeWithEscape();
    });

    // ── saved media: the list, and Show in folder ──────────────────────────
    await group('history', async () => {
      await openSettings();
      const row = page.locator('.xnow-saved-item').first();
      check('history', 'the seeded saved item is listed', (await page.locator('.xnow-saved-item').count()) === 1);
      check('history', 'the row names the file', (await row.locator('.xnow-row-label').textContent()) === 'seed-image.jpg');
      // Record the native call instead of opening Explorer. The click runs only when
      // the stub is in place, so a failed stub cannot open a real Explorer window.
      // X-Now's Settings reads window.__TAURI__.core.invoke on each call, so swapping
      // the wrapper object is enough. core.invoke itself is not configurable.
      const stub = await page.evaluate(() => {
        const tauri = window.__TAURI__;
        if (!tauri || !tauri.core) return { ok: false, reason: 'window.__TAURI__.core is missing' };
        const original = tauri.core.invoke;
        window.__openCalls = [];
        const core = {
          ...tauri.core,
          invoke: (command, args) => {
            if (command === 'open_saved_folder') {
              window.__openCalls.push(args);
              return Promise.resolve();
            }
            return original(command, args);
          },
        };
        try {
          window.__TAURI__ = { ...tauri, core };
        } catch (error) {
          return { ok: false, reason: String(error) };
        }
        return { ok: window.__TAURI__.core.invoke !== original };
      });
      check('history', 'the Show in folder call can be recorded', stub.ok, stub);
      if (stub.ok) await row.locator('.xnow-pill').click();
      const calls = await page.evaluate(() => window.__openCalls || []);
      check('history', 'Show in folder sends the recorded path',
        stub.ok && calls.length === 1 && calls[0].path === seedPath, calls);
      await closeWithEscape();
    });

    // ── persistence: values survive a reload of the page ───────────────────
    await group('persistence', async () => {
      await openSettings();
      await setSlider('Opened video volume', 33);
      await waitSetting('standaloneVolume', 33);
      await page.reload({ waitUntil: 'domcontentloaded' });
      await page.waitForFunction(() => document.querySelector('.xnow-rail-tools.is-placed') && window.__xnowOpenSettings, null, { timeout: 60000 });
      await openSettings();
      const shown = await page.evaluate(() => document.querySelector('input[type="range"][aria-label="Opened video volume"]').value);
      check('persistence', 'a saved value is shown again after reload', shown === '33', shown);
      await setSlider('Opened video volume', 20);
      await waitSetting('standaloneVolume', 20);
      await closeWithEscape();
    });

    // ── zoom: the rail and sheet stay with X's panel at every zoom ─────────
    await group('zoom', async () => {
      for (const zoom of ZOOM_STEPS) {
        await openSettings();
        await setSlider('Zoom', zoom);
        await waitSetting('zoomPercent', zoom);
        await sleep(900);
        const s = await snapshot();
        await page.screenshot({ path: path.join(out, `zoom-${zoom}-open.png`) });
        const wide = Boolean(s.nav && s.nav.w >= 120);
        check('zoom', `${zoom}%: the sheet follows the panel edge while open`,
          s.nav && s.sheet && Math.abs(s.sheet.l - (s.nav.r + 8)) <= 1,
          { sheetLeft: s.sheet?.l, edge: s.nav && s.nav.r + 8, edgeVar: s.edgeVar, navWidth: s.nav?.w });
        check('zoom', `${zoom}%: the sheet fits the window`, s.sheet && s.sheet.r <= s.vw + 1, { right: s.sheet?.r, vw: s.vw });
        if (wide) {
          check('zoom', `${zoom}%: the rail is placed beside the logo`, s.railPlaced, s.rail);
          check('zoom', `${zoom}%: the rail stays inside the panel`,
            s.rail && s.nav && s.rail.l >= s.nav.l - 1 && s.rail.r <= s.nav.r + 1 && s.rail.t < s.nav.t,
            { rail: s.rail, nav: s.nav });
        } else {
          // Icon-only sidebar: the pair sits in the gap under the logo, or is hidden
          // only when that gap is too small for it (under 22px buttons plus 4px).
          const gap = s.logoGlyph && s.firstGlyph ? s.firstGlyph.t - s.logoGlyph.b : 0;
          if (s.railPlaced) {
            check('zoom', `${zoom}%: the icon-only pair sits in the gap under the logo`,
              s.logoGlyph && s.firstGlyph && s.rail.t >= s.logoGlyph.b - 0.5 && s.rail.b <= s.firstGlyph.t + 0.5 &&
                s.rail.l >= s.nav.l - 0.5 && s.rail.r <= s.nav.r + 0.5,
              { rail: s.rail, logoGlyph: s.logoGlyph, firstGlyph: s.firstGlyph, nav: s.nav });
          } else {
            check('zoom', `${zoom}%: the pair hides only when the gap is too small (gap ${gap}px)`, gap < 26, { gap });
          }
        }
        await closeWithEscape();
        const closed = await snapshot();
        check('zoom', `${zoom}%: the pair keeps its placement after Settings closes`,
          closed.railPlaced === s.railPlaced && Math.abs(closed.rail.l - s.rail.l) < 1 && Math.abs(closed.rail.t - s.rail.t) < 1,
          { openPlaced: s.railPlaced, closedPlaced: closed.railPlaced, open: s.rail, closed: closed.rail });
        await openSettings();
        const reopened = await snapshot();
        check('zoom', `${zoom}%: reopening puts the sheet at the panel edge`,
          reopened.nav && reopened.sheet && Math.abs(reopened.sheet.l - (reopened.nav.r + 8)) <= 1,
          { sheetLeft: reopened.sheet?.l, edge: reopened.nav && reopened.nav.r + 8 });
        await closeWithEscape();
      }
      await openSettings();
      await setSlider('Zoom', 100);
      await waitSetting('zoomPercent', 100);
      await closeWithEscape();
    });

    report.finalSettings = readSettings();
  } catch (error) {
    report.fatal = String(error).slice(0, 400);
  } finally {
    if (browser) await browser.close().catch(() => {});
    if (proc) proc.kill();
    killApp();
    await sleep(800);
    if (originalSettings !== null) fs.writeFileSync(SETTINGS, originalSettings);
    else if (fs.existsSync(SETTINGS)) fs.unlinkSync(SETTINGS);
    if (originalFlag !== null) fs.writeFileSync(FLAG, originalFlag);
    const failed = results.filter(r => !r.ok);
    report.summary = { total: results.length, failed: failed.length };
    fs.writeFileSync(path.join(out, 'report.json'), JSON.stringify(report, null, 2));
    console.log(`checks: ${results.length}, failed: ${failed.length}`);
    for (const r of failed) console.log(`FAIL [${r.group}] ${r.name} ${JSON.stringify(r.detail)}`);
    if (report.pageErrors.length) console.log('page errors:', JSON.stringify(report.pageErrors));
    if (report.fatal) console.log('FATAL', report.fatal);
    process.exit(failed.length || report.fatal ? 1 : 0);
  }
})();
