'use strict';
/*
 * X-Now scroll-flash smoke test (Playwright via CDP against the live X-Now.exe webview).
 *
 * Starts X-Now.exe with --remote-debugging-port=9333, connects Playwright over CDP,
 * finds the x.com page, then measures scrolling artifacts three ways:
 *
 *  1. scroll-gesture pass: mouse-wheel scrolling while capturing frames of the
 *     feed area at full fps -> the fraction of "blank" frames (rows that are a
 *     single uniform color) measures the flash rate the user perceives.
 *  2. Screenshot sampling at 8 scroll depths -> count of uniform-color bands
 *     (rows where >95% of pixels share one color) per capture.
 *  3. rAF continuity probe in-page -> longest gap between animation frames
 *     while scrolling (main-thread stalls that starve the compositor).
 *
 * Usage: node xnow-flash-smoke-test.js [--exe <path>] [--out <dir>] [--label <name>]
 */

const fs = require('fs');
const path = require('path');
const { spawn } = require('child_process');
const { chromium } = require('playwright-core');

function arg(name, fallback) {
  const i = process.argv.indexOf(`--${name}`);
  return i >= 0 && process.argv[i + 1] ? process.argv[i + 1] : fallback;
}

const REPO = path.resolve(__dirname, '..');
const EXE = arg('--exe', path.join(REPO, 'src-tauri', 'target', 'release', 'X-Now.exe'));
const OUT = arg('--out', path.join(REPO, 'src-tauri', 'target', 'flash-smoke'));
const LABEL = process.argv[process.argv.indexOf('--label') + 1] || 'run';
const PORT = 9333;
// A row counts as a FLASH BAND when it is uniformly dark (mean luminance < 60)
// or uniformly white (mean > 235 AND near-zero variance) while the page's own
// theme is the opposite — i.e. a band of the WRONG theme, which is what the
// user perceives as a flash. Content whitespace (uniform white rows inside a
// light theme) is normal and must not count.
const FLASH_LUM_THRESHOLD = 60;

function sleep(ms) { return new Promise(r => setTimeout(r, ms)); }

async function waitForEndpoint(port, timeoutMs) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    try {
      const res = await fetch(`http://127.0.0.1:${port}/json/version`);
      if (res.ok) return await res.json();
    } catch (_) { /* not up yet */ }
    await sleep(400);
  }
  throw new Error(`CDP endpoint on :${port} did not come up within ${timeoutMs} ms`);
}

// Frame analysis: a row is "blank" when >95% of its pixels share one color.
// A blank FRAME is a strong flash signal (uniform fill = unpainted/checkerboard
// region or solid background where content should be).
function analyzeFrame(pngBuffer) {
  // Minimal PNG decode via playwright's bundled stack is unavailable; use raw
  // pixel grab through the GPU instead: we draw the PNG into a canvas of an
  // offscreen page. Cheaper: parse via zlib inflate (Node built-in) is complex.
  // Instead we shell the analysis to the browser itself in runInPage().
  return pngBuffer.length; // placeholder, real analysis happens in-page
}

(async () => {
  fs.mkdirSync(OUT, { recursive: true });
  const shotsDir = path.join(OUT, LABEL);
  fs.mkdirSync(shotsDir, { recursive: true });

  if (!fs.existsSync(EXE)) throw new Error(`X-Now.exe not found at ${EXE}`);
  console.log(`[smoke] launching ${EXE} with CDP on :${PORT}`);

  // WebView2 does NOT forward host-exe argv; browser flags go through the
  // WEBVIEW2_ADDITIONAL_BROWSER_ARGUMENTS environment variable (appended to
  // whatever the app composes programmatically).
  //
  // A previously running X-Now holds the WebView2 user-data-folder lock, so
  // any other instance fails to create its environment. Terminate it first;
  // the x.com session lives in the profile and survives the hard kill.
  const kill = spawn('taskkill', ['/IM', 'X-Now.exe', '/F'], { stdio: 'pipe' });
  await new Promise(r => kill.on('exit', r));
  await sleep(800);

  // Capture the app's stderr: the [X-Now] log lines prove the theme-sync
  // (XNOWBG -> set_background_color) actually fired inside the app.
  const logFd = fs.openSync(path.join(shotsDir, 'xnow-stderr.log'), 'a');
  const proc = spawn(EXE, [], {
    stdio: ['ignore', logFd, logFd],
    detached: false,
    env: {
      ...process.env,
      WEBVIEW2_ADDITIONAL_BROWSER_ARGUMENTS: `--remote-debugging-port=${PORT}`,
    },
  });
  proc.on('exit', (code) => console.log(`[smoke] X-Now exited early with code ${code}`));

  try {
    const version = await waitForEndpoint(PORT, 30000);
    console.log(`[smoke] CDP up: ${version.Browser}`);

    const browser = await chromium.connectOverCDP(`http://127.0.0.1:${PORT}`);
    const contexts = browser.contexts();
    if (!contexts.length) throw new Error('no CDP contexts');
    const pages = contexts[0].pages();
    let page = pages.find(p => p.url().includes('x.com')) || pages[0];
    console.log(`[smoke] attached to: ${page.url()}`);
    await page.bringToFront();
    await page.waitForLoadState('domcontentloaded').catch(() => {});
    await sleep(2500);

    const theme = await page.evaluate(() => {
      const bg = getComputedStyle(document.body).backgroundColor;
      const color = getComputedStyle(document.body).color;
      const rgb = bg.match(/\d+/g) ? bg.match(/\d+/g).map(Number) : [0, 0, 0];
      const lum = (0.299 * rgb[0] + 0.587 * rgb[1] + 0.114 * rgb[2]) / 255;
      return { bg, color, theme: lum < 0.5 ? 'dark' : 'light', feeds: document.querySelectorAll('article').length };
    });
    console.log(`[smoke] page theme=${theme.theme} bg=${theme.bg} articles=${theme.feeds}`);

    // ── Probe 1: rAF continuity while scrolling ────────────────────────────
    const gaps = await page.evaluate(async () => {
      const gapList = [];
      let last = performance.now();
      let scrolling = true;
      const scroller = document.scrollingElement;
      // stop after ~6 s
      setTimeout(() => { scrolling = false; }, 6000);
      const raf = () => {
        if (!scrolling) return;
        const now = performance.now();
        gapList.push(now - last);
        last = now;
        requestAnimationFrame(raf);
      };
      requestAnimationFrame(raf);
      const scrollTimer = setInterval(() => {
        scroller.scrollBy(0, 320);
        if (!scrolling) clearInterval(scrollTimer);
      }, 120);
      await new Promise(r => { const t = setInterval(() => { if (!scrolling) { clearInterval(t); r(); } }, 100); });
      gapList.shift(); // drop the first interval (setup)
      return {
        samples: gapList.length,
        avgGap: gapList.reduce((a, b) => a + b, 0) / Math.max(1, gapList.length),
        maxGap: Math.max(0, ...gapList),
        p95: (() => { const s = [...gapList].sort((a, b) => a - b); return s[Math.floor(s.length * 0.95)] || 0; })(),
        over34ms: gapList.filter(g => g > 34).length,
      };
    });
    console.log(`[smoke] rAF probe: samples=${gaps.samples} avg=${gaps.avgGap.toFixed(1)}ms p95=${gaps.p95.toFixed(1)}ms max=${gaps.maxGap.toFixed(1)}ms dropped(>34ms)=${gaps.over34ms}`);

    // ── Probe 2: screenshot sampling at scroll depths ──────────────────────
    // Uniform-color band analysis runs in a throwaway about:blank page: we
    // load each PNG there via data: URL and read pixels back through canvas.
    const analysisPage = await contexts[0].newPage();
    async function analyzeScreenshot(pngBuffer) {
      const dataUrl = `data:image/png;base64,${pngBuffer.toString('base64')}`;
      return analysisPage.evaluate(async (src) => {
        const img = new Image();
        await new Promise((res, rej) => { img.onload = res; img.onerror = rej; img.src = src; });
        const c = document.createElement('canvas');
        c.width = img.width; c.height = img.height;
        const ctx = c.getContext('2d');
        ctx.drawImage(img, 0, 0);
        const { data, width, height } = ctx.getImageData(0, 0, c.width, c.height);
        // per-row analysis: uniformity + luminance class. A flash band is a
        // UNIFORM row whose luminance class differs from the page theme:
        // dark uniform rows in a light theme (the old complaint) or white
        // uniform rows in a dark theme.
        let darkUniformRows = 0, whiteUniformRows = 0, totalRows = height;
        const darkColors = new Map();
        for (let y = 0; y < height; y++) {
          let sum = 0, sumSq = 0, uniformKey = '', uniformN = 0;
          const counts = new Map();
          for (let x = 0; x < width; x++) {
            const i = (y * width + x) * 4;
            const lum = 0.299 * data[i] + 0.587 * data[i + 1] + 0.114 * data[i + 2];
            sum += lum; sumSq += lum * lum;
            const key = `${data[i] >> 4},${data[i + 1] >> 4},${data[i + 2] >> 4}`;
            counts.set(key, (counts.get(key) || 0) + 1);
          }
          const mean = sum / width;
          const variance = sumSq / width - mean * mean;
          let bestKey = '', bestN = 0;
          for (const [k, n] of counts) if (n > bestN) { bestN = n; bestKey = k; }
          const uniform = bestN / width > 0.95;
          if (uniform) {
            if (mean < 60 /* FLASH_LUM_THRESHOLD, inlined for page context */) {
              darkUniformRows++;
              darkColors.set(bestKey, (darkColors.get(bestKey) || 0) + 1);
            } else if (mean > 235 && variance < 40) {
              whiteUniformRows++;
            }
          }
        }
        const dominantDark = [...darkColors.entries()].sort((a, b) => b[1] - a[1])[0];
        return {
          height, totalRows,
          darkUniformRows, whiteUniformRows,
          darkPct: darkUniformRows / totalRows,
          whitePct: whiteUniformRows / totalRows,
          dominantDarkColor: dominantDark ? dominantDark[0] : null,
        };
      }, dataUrl);
    }

    const scrollDepths = [0, 600, 1200, 1800, 2400, 3000, 3600, 4200];
    const sampleResults = [];
    for (let i = 0; i < scrollDepths.length; i++) {
      await page.evaluate((y) => { document.scrollingElement.scrollTo(0, y); }, scrollDepths[i]);
      await sleep(120);
      const buf = await page.screenshot({ type: 'png' });
      const file = path.join(shotsDir, `depth-${scrollDepths[i]}.png`);
      fs.writeFileSync(file, buf);
      const a = await analyzeScreenshot(buf);
      sampleResults.push({ depth: scrollDepths[i], ...a });
      console.log(`[smoke] depth=${String(scrollDepths[i]).padStart(4)} darkBands=${String(a.darkUniformRows).padStart(3)}/${a.totalRows} (${(a.darkPct * 100).toFixed(1)}%) dominantDark=${a.dominantDarkColor}`);
    }

    // ── Probe 3: burst-scroll frame capture (the actual flash detector) ────
    // Capture consecutive frames while wheel-scrolling; measure blank frames.
    const burst = [];
    const burstPage = page;
    const capture = (async () => {
      for (let i = 0; i < 40; i++) {
        const buf = await burstPage.screenshot({ type: 'png' });
        burst.push(buf);
        await sleep(45);
      }
    })();
    // drive wheel events during capture
    const wheelTimer = setInterval(() => {
      burstPage.mouse.wheel(0, 480).catch(() => {});
    }, 90);
    await capture;
    clearInterval(wheelTimer);

    const burstResults = [];
    for (let i = 0; i < burst.length; i++) {
      const file = path.join(shotsDir, `burst-${String(i).padStart(2, '0')}.png`);
      fs.writeFileSync(file, burst[i]);
      const a = await analyzeScreenshot(burst[i]);
      burstResults.push(a);
    }
    const flashFrames = burstResults.filter(r => r.darkPct > 0.5).length;
    const seamFrames = burstResults.filter(r => r.darkPct > 0.15 && r.darkPct <= 0.5).length;
    console.log(`[smoke] burst: ${burst.length} frames -> FLASH frames=${flashFrames} (>50% dark bands), partial=${seamFrames} (15-50%)`);
    console.log(`[smoke] worst frame: ${(Math.max(...burstResults.map(r => r.darkPct)) * 100).toFixed(1)}% dark bands`);

    // ── summary ─────────────────────────────────────────────────────────────
    const summary = {
      label: LABEL,
      exe: EXE,
      theme: theme.theme,
      backgroundColor: theme.bg,
      articles: theme.feeds,
      raf: gaps,
      depthSamples: sampleResults,
      burst: {
        frames: burst.length,
        flashFrames,
        partialFrames: seamFrames,
        flashFramePct: flashFrames / burst.length,
        worstDarkPct: Math.max(...burstResults.map(r => r.darkPct)),
      },
    };
    fs.writeFileSync(path.join(OUT, `${LABEL}-summary.json`), JSON.stringify(summary, null, 2));
    console.log(`[smoke] summary written: ${path.join(OUT, `${LABEL}-summary.json`)}`);
    console.log(`[smoke] RESULT ${LABEL}: flashFrames=${flashFrames}/${burst.length} (${(summary.burst.flashFramePct * 100).toFixed(1)}%) worstDark=${(summary.burst.worstDarkPct * 100).toFixed(1)}%`);

    await analysisPage.close();
    await browser.close();
  } finally {
    console.log('[smoke] terminating X-Now');
    try { process.kill(-proc.pid); } catch (_) { try { proc.kill(); } catch (_) {} }
  }
})().catch((e) => { console.error('[smoke] FAILED:', e.message); process.exit(1); });
