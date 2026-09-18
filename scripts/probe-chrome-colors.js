'use strict';
/*
 * Live DOM probe: which X surfaces are natively #0f1419-dark?
 * Attaches to a running X-Now (already spawned with CDP), scrolls a bit,
 * and reports computed colors of player containers, media wrappers, and
 * skeleton placeholders + rects — to attribute the dark mosaic voidColor
 * rgb(2,2,2)/rgb(16,20,25) to X's own media chrome (mask gap) vs native void.
 */
const { chromium } = require('playwright-core');
const { spawn } = require('child_process');
const path = require('path');

const REPO = path.resolve(__dirname, '..');
const EXE = path.join(REPO, 'src-tauri', 'target', 'release', 'X-Now.exe');
const PORT = 9333;
const sleep = (ms) => new Promise(r => setTimeout(r, ms));

(async () => {
  const kill = spawn('taskkill', ['/IM', 'X-Now.exe', '/F'], { stdio: 'pipe' });
  await new Promise(r => kill.on('exit', r));
  await sleep(800);
  const { spawn: sp } = require('child_process');
  const proc = sp(EXE, [], { env: { ...process.env, WEBVIEW2_ADDITIONAL_BROWSER_ARGUMENTS: `--remote-debugging-port=${PORT}` }, stdio: 'ignore', detached: true });
  proc.unref();
  await sleep(4000);

  const browser = await chromium.connectOverCDP(`http://127.0.0.1:${PORT}`);
  const context = browser.contexts()[0];
  const page = context.pages().find(p => p.url().includes('x.com')) || context.pages()[0];
  await page.bringToFront();
  await sleep(2500);

  const report = await page.evaluate(async () => {
    const summarize = (el) => {
      const cs = getComputedStyle(el);
      let bg = cs.backgroundColor;
      // resolve upward for transparent elements
      let node = el, resolved = bg, alpha = 1;
      const alphaOf = (s) => {
        const m = s && s.match(/rgba\([^)]*,\s*([\d.]+)\)$/);
        return m ? parseFloat(m[1]) : 1;
      };
      while (node && node !== document.documentElement && alphaOf(resolved) < 1) {
        node = node.parentElement;
 resolved = getComputedStyle(node).backgroundColor;
      }
      return {
        testid: el.getAttribute('data-testid') || el.getAttribute('aria-label') || el.tagName,
        bg: resolved,
        rect: (() => { const r = el.getBoundingClientRect(); return { x: Math.round(r.left), y: Math.round(r.top), w: Math.round(r.width), h: Math.round(r.height) }; })(),
      };
    };
    const out = { player: [], skeleton: [], misc: [] };
    document.querySelectorAll('[data-testid="videoPlayer"], [data-testid="videoComponent"], video').forEach(el => out.player.push(summarize(el)));
    document.querySelectorAll('[aria-busy="true"], [data-testid="primaryColumn"] [aria-busy]').forEach(el => out.skeleton.push(summarize(el)));
    // skeleton containers often carry inline background var colors; sample them
    const rootStyle = getComputedStyle(document.documentElement);
    out.misc.push({ testid: ':root --theme-bg', bg: rootStyle.getPropertyValue('--theme-bg') || 'n/a' });
    return out;
  });

  console.log(JSON.stringify(report, null, 2));
  await browser.close();
  try { process.kill(-proc.pid); } catch (_) { try { proc.kill(); } catch (_) {} }
  process.exit(0);
})().catch(e => { console.error('FAILED:', e.message); process.exit(1); });
