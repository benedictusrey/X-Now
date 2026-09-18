'use strict';
/* Probe: does the video mount guard engage in the live app?
 * Scrolls the feed for a few seconds, then reports guard stats and
 * per-video poster/readyState/guarded state.
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
  const proc = spawn(EXE, [], {
    env: { ...process.env, WEBVIEW2_ADDITIONAL_BROWSER_ARGUMENTS: `--remote-debugging-port=${PORT}` },
    stdio: 'ignore',
  });
  await sleep(4500);
  const browser = await chromium.connectOverCDP(`http://127.0.0.1:${PORT}`);
  const page = browser.contexts()[0].pages().find(p => p.url().includes('x.com'));
  await page.bringToFront();
  await sleep(2000);

  // scroll through several posts to trigger mounts
  for (let i = 0; i < 14; i++) {
    await page.mouse.wheel(0, 520).catch(() => {});
    await sleep(320);
  }
  await sleep(500);

  const report = await page.evaluate(() => {
    const g = window.__xnowVideoMountGuard;
    const videos = Array.from(document.querySelectorAll('video')).map(v => ({
      poster: v.poster ? 'yes' : 'no',
      readyState: v.readyState,
      guarded: v.getAttribute(g.ATTR) !== null,
      hostGuarded: v.__xnowGuardHost ? v.__xnowGuardHost.getAttribute(g.ATTR) !== null : null,
      inView: (() => { const r = v.getBoundingClientRect(); return r.top < innerHeight && r.bottom > 0; })(),
    }));
    return { stats: g ? g.stats : null, videos };
  });
  console.log(JSON.stringify(report, null, 2));
  await browser.close();
  try { proc.kill(); } catch (_) {}
  process.exit(0);
})().catch(e => { console.error('FAILED:', e.message); process.exit(1); });
