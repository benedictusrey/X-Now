'use strict';
/*
 * X-Now screencast flash test v2 — captures EVERY composited frame (CDP
 * Page.startScreencast) while real wheel scrolling runs, then hunts flashes
 * with detectors screenshots cannot provide:
 *
 *  1. VOID TILES (masked): 10x10px grid over each frame; tiles whose
 *     luminance contradicts the page theme (dark void on light theme / white
 *     void on dark theme) are counted OUTSIDE media rects (video players and
 *     large images are masked, so X's own black video letterboxing and dark
 *     photos cannot false-positive).
 *  2. FRAME-DIFF FLIPS: consecutive frames compared on the same grid
 *     (media-masked): the % of tiles that flip light<->dark class between
 *     two adjacent frames. A big flip = a "shocking" whole-region transition.
 *  3. VIDEO CORRELATION: 50ms in-page sampling of video count/playing/
 *     readyState plus media rects used for masking; phase B (videos live)
 *     vs phase C (playback neutralized, posters remain) attributes flashes
 *     to the video compositing path vs the static-content raster path.
 *
 * Usage:
 *   node xnow-screencast-flash-test.js [--exe <path>] [--out <dir>]
 *        [--label=name] [--extra-args="--disable-partial-raster"]
 */

const fs = require('fs');
const path = require('path');
const { spawn } = require('child_process');
const { chromium } = require('playwright-core');

function argVal(name, fallback) {
  const eq = process.argv.find(a => a.startsWith(`--${name}=`));
  if (eq) return eq.slice(name.length + 3);
  const i = process.argv.indexOf(`--${name}`);
  if (i >= 0 && process.argv[i + 1] && !process.argv[i + 1].startsWith('--')) return process.argv[i + 1];
  return fallback;
}

const REPO = path.resolve(__dirname, '..');
const EXE = argVal('exe', path.join(REPO, 'src-tauri', 'target', 'release', 'X-Now.exe'));
const OUT = argVal('out', path.join(REPO, 'src-tauri', 'target', 'flash-smoke'));
const LABEL = argVal('label', 'screencast');
const EXTRA = argVal('extra-args', '');
// extra argv handed to X-Now.exe itself (its own --webview-args/--no-* switches)
const EXE_ARGS = argVal('exe-args', '');
const PORT = 9333;
const PHASE_MS = 8000;
const WHEEL_INTERVAL = 150;
const GRID = 10;          // px per analysis tile
const FLASH_VOID_PCT = 0.10;  // >=10% contradicts-theme void tiles = flash frame
const FLIP_PCT = 0.20;    // >=20% of tiles flipping class between frames = flash transition

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

/* ── Analyzer page: PNG decode + grid analysis in-browser ────────────────── */

async function makeAnalyzer(context) {
  const ap = await context.newPage();
  await ap.setContent(`<canvas></canvas><script>
  window.loadImg = (b64) => new Promise((res, rej) => {
    const img = new Image();
    img.onload = () => res(img);
    img.onerror = () => rej(new Error('png decode failed'));
    img.src = 'data:image/png;base64,' + b64;
  });
  window.pixels = (img) => {
    const c = document.querySelector('canvas');
    c.width = img.width; c.height = img.height;
    const ctx = c.getContext('2d', { willReadFrequently: true });
    ctx.drawImage(img, 0, 0);
    return ctx.getImageData(0, 0, c.width, c.height);
  };
  window.gridStats = (img, rects, G) => {
    const { data, width: W, height: H } = window.pixels(img);
    const masked = (x, y) => rects.some(r =>
      x + G > r.x && x < r.x + r.w && y + G > r.y && y < r.y + r.h);
    let dark = 0, light = 0, mid = 0, cells = 0;
    const darkColors = new Map();
    const darkMap = [];
    for (let y = 0; y + G <= H; y += G) {
      for (let x = 0; x + G <= W; x += G) {
        if (masked(x, y)) continue;
        let sum = 0, n = 0;
        for (let yy = y; yy < y + G; yy += 2) {
          for (let xx = x; xx < x + G; xx += 2) {
            const i = (yy * W + xx) * 4;
            sum += 0.299*data[i] + 0.587*data[i+1] + 0.114*data[i+2];
            n++;
          }
        }
        const lum = sum / n;
        cells++;
        if (lum <= 40) {
          dark++;
          // exact mean color of this tile (unquantized) for void attribution
          let r8 = 0, g8 = 0, b8 = 0;
          for (let yy = y; yy < y + G; yy += 2) {
            for (let xx = x; xx < x + G; xx += 2) {
              const i = (yy * W + xx) * 4;
              r8 += data[i]; g8 += data[i+1]; b8 += data[i+2];
            }
          }
          const key = Math.round(r8/n/8)+','+Math.round(g8/n/8)+','+Math.round(b8/n/8);
          darkColors.set(key, (darkColors.get(key)||0)+1);
          darkMap.push([x, y]);
        }
        else if (lum >= 205) light++;
        else mid++;
      }
    }
    const dom = [...darkColors.entries()].sort((a,b)=>b[1]-a[1])[0];
    // coarse spatial map (20px cells) of where dark void tiles sit
    let mapStr = '';
    if (darkMap.length) {
      const cols = Math.ceil(W / (G*4));
      const set = new Set(darkMap.map(([x,y]) => Math.floor(y/(G*2))*cols + Math.floor(x/(G*2))));
      mapStr = [...set].join(',');
    }
    return { W, H, cells, dark, light, mid,
      voidColor: dom ? dom[0] : null, voidColorCount: dom ? dom[1] : 0,
      voidMap: mapStr };
  };
  // dark-tile stats INSIDE media rects only (the detector the outside-void
  // metric cannot provide: player-internal black flashes are masked there)
  window.insideStats = (img, rects, G) => {
    if (!rects || !rects.length) return { cells: 0, dark: 0, darkPct: 0, bbox: null };
    const { data, width: W, height: H } = window.pixels(img);
    let cells = 0, dark = 0;
    let minX = 1e9, minY = 1e9, maxX = -1, maxY = -1;
    const inAnyRect = (x, y) => rects.some(r =>
      x + G > r.x && x < r.x + r.w && y + G > r.y && y < r.y + r.h);
    const seen = new Set();
    for (const r of rects) {
      for (let y = Math.max(0, Math.floor(r.y / G) * G); y + G <= Math.min(H, r.y + r.h); y += G) {
        for (let x = Math.max(0, Math.floor(r.x / G) * G); x + G <= Math.min(W, r.x + r.w); x += G) {
          const k = x + ',' + y;
          if (seen.has(k)) continue;
          seen.add(k);
          let sum = 0, n = 0;
          for (let yy = y; yy < y + G; yy += 2) {
            for (let xx = x; xx < x + G; xx += 2) {
              const i = (yy * W + xx) * 4;
              sum += 0.299*data[i] + 0.587*data[i+1] + 0.114*data[i+2];
              n++;
            }
          }
          cells++;
          if (sum / n <= 40) {
            dark++;
            minX = Math.min(minX, x); minY = Math.min(minY, y);
            maxX = Math.max(maxX, x + G); maxY = Math.max(maxY, y + G);
          }
        }
      }
    }
    return { cells, dark, darkPct: cells ? dark / cells : 0,
      bbox: dark ? { x: minX, y: minY, w: maxX - minX, h: maxY - minY } : null };
  };
  window.gridDiff = (imgA, imgB, rectsA, rectsB, G) => {
    const A = window.pixels(imgA), B = window.pixels(imgB);
    const W = Math.min(A.width, B.width), H = Math.min(A.height, B.height);
    const masked = (x, y) => rectsA.some(r =>
      x + G > r.x && x < r.x + r.w && y + G > r.y && y < r.y + r.h) ||
      rectsB.some(r => x + G > r.x && x < r.x + r.w && y + G > r.y && y < r.y + r.h);
    const cls = (px, x, y, w) => {
      let sum = 0, n = 0;
      for (let yy = y; yy < y + G; yy += 2) {
        for (let xx = x; xx < x + G; xx += 2) {
          const i = (yy * w + xx) * 4;
          sum += 0.299*px.data[i] + 0.587*px.data[i+1] + 0.114*px.data[i+2];
          n++;
        }
      }
      const lum = sum / n;
      return lum <= 40 ? 'dark' : lum >= 205 ? 'light' : 'mid';
    };
    let cells = 0, flips = 0, toDark = 0, toLight = 0;
    for (let y = 0; y + G <= H; y += G) {
      for (let x = 0; x + G <= W; x += G) {
        if (masked(x, y)) continue;
        cells++;
        const ca = cls(A, x, y, A.width), cb = cls(B, x, y, B.width);
        if (ca !== cb && ca !== 'mid' && cb !== 'mid') {
          flips++;
          if (cb === 'dark') toDark++; else toLight++;
        }
      }
    }
    return { cells, flips, toDark, toLight, flipPct: cells ? flips / cells : 0 };
  };
  </script>`);
  return {
    analyze: async (buf, rects) => {
      const b64 = buf.toString('base64');
      return ap.evaluate(async ([b64, rects, G]) => {
        const img = await window.loadImg(b64);
        return window.gridStats(img, rects, G);
      }, [b64, rects, GRID]);
    },
    analyzeInside: async (buf, rects) => {
      const b64 = buf.toString('base64');
      return ap.evaluate(async ([b64, rects, G]) => {
        const img = await window.loadImg(b64);
        return window.insideStats(img, rects, G);
      }, [b64, rects, GRID]);
    },
    diff: async (bufA, bufB, rectsA, rectsB) => {
      return ap.evaluate(async ([a, b, ra, rb, G]) => {
        const [imgA, imgB] = await Promise.all([window.loadImg(a), window.loadImg(b)]);
        return window.gridDiff(imgA, imgB, ra, rb, G);
      }, [bufA.toString('base64'), bufB.toString('base64'), rectsA, rectsB, GRID]);
    },
    close: () => ap.close(),
  };
}

/* ── In-page samplers ────────────────────────────────────────────────────── */

async function startSamplers(page) {
  await page.evaluate(() => {
    window.__xnowS = { samples: [], events: [] };
    // video lifecycle events: loadstart/emptied = src swap or mount start;
    // loadeddata = first frame decoded (the moment a black player can repaint)
    const vidEvents = ['loadstart', 'emptied', 'loadeddata', 'playing', 'pause'];
    window.__xnowVidEventHandler = (ev) => {
      if (window.__xnowS.events.length < 500) {
        window.__xnowS.events.push({
          t: Date.now(), type: ev.type,
          rs: ev.target.readyState, paused: ev.target.paused,
          hasPoster: Boolean(ev.target.poster),
          w: ev.target.videoWidth, h: ev.target.videoHeight,
        });
      }
    };
    vidEvents.forEach(t => document.addEventListener(t, window.__xnowVidEventHandler, true));
    const mediaRects = () => {
      const rects = [];
      const vw = window.innerWidth, vh = window.innerHeight;
      // video players (element OR container) AND poster/placeholder containers:
      // X keeps the player chrome dark even in light theme, so these areas are
      // dark content that must be excluded from "void" detection but INCLUDED
      // in the separate inside-rect flash detector.
      const sel = 'video, [data-testid="videoPlayer"], [data-testid="videoComponent"],' +
        ' [data-testid="videoGif"], video[data-testid], div[aria-label="Play"], img[src*="video_thumb"]';
      document.querySelectorAll(sel).forEach(el => {
        const r = el.getBoundingClientRect();
        if (r.width > 40 && r.height > 40) {
          rects.push({ x: Math.max(0, r.left - 6), y: Math.max(0, r.top - 6),
                       w: Math.min(vw - Math.max(0, r.left - 6), r.width + 12),
                       h: Math.min(vh - Math.max(0, r.top - 6), r.height + 12) });
        }
      });
      document.querySelectorAll('article img').forEach(el => {
        const r = el.getBoundingClientRect();
        if (r.width >= 120 && r.height >= 80) {
          rects.push({ x: Math.max(0, r.left), y: Math.max(0, r.top), w: r.width, h: r.height });
        }
      });
      return rects;
    };
    window.__xnowSampler = setInterval(() => {
      const vs = Array.from(document.querySelectorAll('video'));
      window.__xnowS.samples.push({
        t: Date.now(),
        vw: window.innerWidth, vh: window.innerHeight,
        total: vs.length,
        playing: vs.filter(v => !v.paused).length,
        notReady: vs.filter(v => v.readyState < 2).length,
        playingNoFrame: vs.filter(v => !v.paused && v.readyState < 2).length,
        rects: mediaRects(),
      });
    }, 50);
  });
}

async function stopSamplers(page) {
  return page.evaluate(() => {
    clearInterval(window.__xnowSampler);
    document.removeEventListener('loadstart', window.__xnowVidEventHandler, true);
    document.removeEventListener('emptied', window.__xnowVidEventHandler, true);
    document.removeEventListener('loadeddata', window.__xnowVidEventHandler, true);
    document.removeEventListener('playing', window.__xnowVidEventHandler, true);
    document.removeEventListener('pause', window.__xnowVidEventHandler, true);
    return { samples: window.__xnowS ? window.__xnowS.samples : [], events: window.__xnowS ? window.__xnowS.events : [] };
  });
}

async function blockVideoPlayback(page) {
  await page.evaluate(() => {
    if (window.__xnowVideosBlocked) return;
    window.__xnowVideosBlocked = true;
    window.__xnowBlockedCount = 0;
    const strip = (v) => {
      try { v.pause(); v.removeAttribute('src'); try { v.load(); } catch (_) {} window.__xnowBlockedCount++; } catch (_) {}
    };
    document.querySelectorAll('video').forEach(strip);
    const mo = new MutationObserver((muts) => {
      for (const m of muts) {
        if (m.type === 'attributes' && m.target && m.target.tagName === 'VIDEO') strip(m.target);
        if (m.addedNodes) m.addedNodes.forEach(n => { if (n.tagName === 'VIDEO') strip(n); });
      }
    });
    mo.observe(document.documentElement, {
      childList: true, subtree: true, attributes: true, attributeFilter: ['src'],
    });
    window.__xnowBlockMO = mo;
  });
}

async function backToTop(page) {
  await page.evaluate(() => {
    window.scrollTo(0, 0);
    document.scrollingElement.scrollTop = 0;
  });
  await sleep(1500);
}

/* ── Main ────────────────────────────────────────────────────────────────── */

(async () => {
  fs.mkdirSync(OUT, { recursive: true });
  const shotsDir = path.join(OUT, LABEL);
  fs.mkdirSync(shotsDir, { recursive: true });

  if (!fs.existsSync(EXE)) throw new Error(`X-Now.exe not found at ${EXE}`);
  console.log(`[sc] label=${LABEL} exe=${EXE}${EXTRA ? ` extraArgs=${EXTRA}` : ''}${EXE_ARGS ? ` exeArgs=${EXE_ARGS}` : ''}`);

  // Free the WebView2 profile lock (a running instance holds it).
  const kill = spawn('taskkill', ['/IM', 'X-Now.exe', '/F'], { stdio: 'pipe' });
  await new Promise(r => kill.on('exit', r));
  await sleep(800);

  const logFd = fs.openSync(path.join(shotsDir, 'xnow-stderr.log'), 'a');
  const proc = spawn(EXE, EXE_ARGS ? [EXE_ARGS] : [], {
    stdio: ['ignore', logFd, logFd],
    env: {
      ...process.env,
      WEBVIEW2_ADDITIONAL_BROWSER_ARGUMENTS:
        `--remote-debugging-port=${PORT}${EXTRA ? ' ' + EXTRA : ''}`,
    },
  });
  proc.on('exit', (code) => console.log(`[sc] X-Now exited early code=${code}`));

  try {
    await waitForEndpoint(PORT, 30000);
    const browser = await chromium.connectOverCDP(`http://127.0.0.1:${PORT}`);
    const context = browser.contexts()[0];
    const page = context.pages().find(p => p.url().includes('x.com')) || context.pages()[0];
    console.log(`[sc] attached: ${page.url()}`);
    await page.bringToFront();
    await page.waitForLoadState('domcontentloaded').catch(() => {});
    await sleep(2500);

    const theme = await page.evaluate(() => {
      const bg = getComputedStyle(document.body).backgroundColor;
      const rgb = bg.match(/\d+/g) ? bg.match(/\d+/g).map(Number) : [255, 255, 255];
      const lum = (0.299 * rgb[0] + 0.587 * rgb[1] + 0.114 * rgb[2]) / 255;
      return {
        bg, theme: lum < 0.5 ? 'dark' : 'light',
        articles: document.querySelectorAll('article').length,
        videos: document.querySelectorAll('video').length,
      };
    });
    console.log(`[sc] theme=${theme.theme} bg=${theme.bg} articles=${theme.articles} videos=${theme.videos}`);

    const analyzer = await makeAnalyzer(context);
    const cdp = await context.newCDPSession(page);

    const frames = [];
    let frameSeq = 0;
    cdp.on('Page.screencastFrame', (ev) => {
      if (ev.data) frames.push({ seq: frameSeq++, ts: Date.now(), data: ev.data });
      cdp.send('Page.screencastFrameAck', { sessionId: ev.sessionId }).catch(() => {});
    });

    async function startScreencast() { frames.length = 0; frameSeq = 0; await cdp.send('Page.startScreencast', { format: 'png', everyNthFrame: 1 }); }
    async function stopScreencast() {
      await cdp.send('Page.stopScreencast').catch(() => {});
      await sleep(500);
      return frames.splice(0);
    }

    async function runPhase(name, { scroll, mode = 'wheel' }) {
      await startScreencast();
      await startSamplers(page);
      const t0 = Date.now();
      if (scroll && mode === 'wheel') {
        // real input-path wheel scrolling from the Node side
        const wheel = setInterval(() => page.mouse.wheel(0, 480).catch(() => {}), WHEEL_INTERVAL);
        await sleep(PHASE_MS);
        clearInterval(wheel);
      } else if (scroll && mode === 'step') {
        // discrete post-by-post steps with 350 ms settles: the "thumb through
        // the feed" pattern that makes X mount/dismount video players one
        // post at a time (the static<->video switching the user reported).
        const steps = Math.floor(PHASE_MS / 350);
        for (let i = 0; i < steps; i++) {
          await page.mouse.wheel(0, 520).catch(() => {});
          await sleep(350);
        }
      } else {
        await sleep(PHASE_MS);
      }
      const { samples, events } = await stopSamplers(page);
      const fr = await stopScreencast();
      console.log(`[sc] phase ${name}: ${fr.length} frames, ${samples.length} samples, ${events.length} video events, ${Math.round((Date.now() - t0) / 1000)}s`);
      return { name, frames: fr, samples, events };
    }

    const nearest = (samples, ts) => {
      let best = null, bestDt = Infinity;
      for (const s of samples) {
        const dt = Math.abs(s.t - ts);
        if (dt < bestDt) { bestDt = dt; best = s; }
      }
      return bestDt <= 120 ? best : null;
    };

    // ── Phase A: baseline (no scroll) ──────────────────────────────────────
    const phaseA = await runPhase('A-baseline', { scroll: false });

    // ── Phase B: real wheel scroll, videos live ────────────────────────────
    await backToTop(page);
    const phaseB = await runPhase('B-wheel-videos-live', { scroll: true });

    // ── Phase C: discrete post-by-post steps, videos live ──────────────────
    await backToTop(page);
    const phaseC = await runPhase('C-step-videos-live', { scroll: true, mode: 'step' });

    // ── Phase D: wheel scroll, video playback neutralized ──────────────────
    await backToTop(page);
    await blockVideoPlayback(page);
    await sleep(400);
    const phaseD = await runPhase('D-wheel-videos-blocked', { scroll: true });
    const ALL = [phaseA, phaseB, phaseC, phaseD];

    // ── Detectors ──────────────────────────────────────────────────────────
    const voidKind = theme.theme === 'light' ? 'dark' : 'light';
    for (const ph of ALL) {
      ph.voids = [];
      for (let i = 0; i < ph.frames.length; i++) {
        const s = nearest(ph.samples, ph.frames[i].ts);
        const rects = s ? s.rects : [];
        const g = await analyzer.analyze(Buffer.from(ph.frames[i].data, 'base64'), rects);
        const voidTiles = voidKind === 'dark' ? g.dark : g.light;
        const voidPct = g.cells ? voidTiles / g.cells : 0;
        ph.voids.push({
          seq: ph.frames[i].seq, ts: ph.frames[i].ts, cells: g.cells,
          voidTiles, voidPct,
          voidColor: g.voidColor, voidColorCount: g.voidColorCount,
          voidMap: g.voidMap,
          videosPlaying: s ? s.playing : null,
          videosTotal: s ? s.total : null,
        });
      }
      ph.flips = [];
      for (let i = 1; i < ph.frames.length; i++) {
        const sa = nearest(ph.samples, ph.frames[i - 1].ts);
        const sb = nearest(ph.samples, ph.frames[i].ts);
        const d = await analyzer.diff(
          Buffer.from(ph.frames[i - 1].data, 'base64'),
          Buffer.from(ph.frames[i].data, 'base64'),
          sa ? sa.rects : [], sb ? sb.rects : []);
        ph.flips.push({ seq: ph.frames[i].seq, ts: ph.frames[i].ts, ...d });
      }
      // inside-media dark spikes: a media rect whose dark-tile fraction
      // spikes and then reverts = player mounted black and repainted — the
      // "shocking flash" class that outside-void detection cannot see
      // because media rects are masked by design.
      ph.inside = [];
      for (let i = 0; i < ph.frames.length; i++) {
        const s = nearest(ph.samples, ph.frames[i].ts);
        const rects = s ? s.rects : [];
        if (!rects.length) {
          ph.inside.push({ seq: ph.frames[i].seq, ts: ph.frames[i].ts, cells: 0, darkPct: 0, bbox: null });
          continue;
        }
        const g = await analyzer.analyzeInside(Buffer.from(ph.frames[i].data, 'base64'), rects);
        ph.inside.push({ seq: ph.frames[i].seq, ts: ph.frames[i].ts, ...g });
      }
      ph.insideFlashes = [];
      for (let i = 0; i < ph.inside.length; i++) {
        const cur = ph.inside[i];
        if (!cur.cells || cur.darkPct < 0.5) continue;
        const span = ph.inside.slice(Math.max(0, i - 8), i + 9);
        const reverted = span.some(o => o !== cur && o.cells && o.darkPct <= cur.darkPct * 0.6);
        if (reverted) {
          const vidEvent = ph.events.find(e => Math.abs(e.t - cur.ts) <= 250);
          ph.insideFlashes.push({
            seq: cur.seq, ts: cur.ts, darkPct: +cur.darkPct.toFixed(3),
            bbox: cur.bbox, correlatedEvent: vidEvent ? vidEvent.type : null,
          });
        }
      }
    }

    const summarize = (ph) => {
      const flashFrames = ph.voids.filter(v => v.voidPct >= FLASH_VOID_PCT);
      const flipFrames = ph.flips.filter(f => f.flipPct >= FLIP_PCT);
      return {
        name: ph.name,
        frames: ph.frames.length,
        voidFlashFrames: flashFrames.length,
        worstVoidPct: Math.max(0, ...ph.voids.map(v => v.voidPct)),
        flipTransitions: flipFrames.length,
        worstFlipPct: Math.max(0, ...ph.flips.map(f => f.flipPct)),
        toDarkFlipMax: Math.max(0, ...ph.flips.map(f => f.toDark)),
        insideFlashCount: ph.insideFlashes.length,
        videosPlayingAvg: ph.samples.length
          ? +(ph.samples.reduce((a, s) => a + s.playing, 0) / ph.samples.length).toFixed(2)
          : 0,
        playingNoFrameMax: Math.max(0, ...ph.samples.map(s => s.playingNoFrame)),
        videoEventCount: ph.events.length,
        flashFrameDetails: flashFrames.map(v => ({
          seq: v.seq, voidPct: +v.voidPct.toFixed(3),
          voidColor: v.voidColor, voidTiles: v.voidTiles,
          videosPlaying: v.videosPlaying, videosTotal: v.videosTotal,
        })),
        insideFlashDetails: ph.insideFlashes.slice(0, 10),
      };
    };
    const sums = ALL.map(summarize);
    sums.forEach(s => console.log(
      `[sc] ${s.name}: frames=${s.frames} VOIDflash=${s.voidFlashFrames} worst=${(s.worstVoidPct * 100).toFixed(1)}%` +
      ` FLIPtransitions=${s.flipTransitions} INSIDEflash=${s.insideFlashCount}` +
      ` vidPlaying(avg)=${s.videosPlayingAvg} noFrame(max)=${s.playingNoFrameMax}`));

    // Evidence: save worst frames + neighbors
    const saveAround = async (ph, seqs, tag) => {
      for (const seq of seqs.slice(0, 8)) {
        for (const s of [seq - 1, seq, seq + 1]) {
          const idx = ph.frames.findIndex(f => f.seq === s);
          if (idx >= 0) {
            fs.writeFileSync(path.join(shotsDir, `${ph.name}-${tag}-f${String(s).padStart(4, '0')}.png`),
              Buffer.from(ph.frames[idx].data, 'base64'));
          }
        }
      }
      return seqs.length;
    };
    for (const ph of ALL) {
      const voidSeqs = ph.voids.filter(v => v.voidPct >= FLASH_VOID_PCT).map(v => v.seq);
      const flipSeqs = ph.flips.filter(f => f.flipPct >= FLIP_PCT).map(f => f.seq);
      const insideSeqs = ph.insideFlashes.map(f => f.seq);
      const n1 = await saveAround(ph, voidSeqs, 'void');
      const n2 = await saveAround(ph, flipSeqs, 'flip');
      const n3 = await saveAround(ph, insideSeqs, 'inside');
      if (n1 || n2 || n3) console.log(`[sc] evidence saved for ${ph.name}: ${n1} void, ${n2} flip, ${n3} inside`);
    }

    const summary = {
      label: LABEL, exe: EXE, extraArgs: EXTRA, theme,
      detectors: { grid: GRID, flashVoidPct: FLASH_VOID_PCT, flipPct: FLIP_PCT },
      phases: sums,
      worstFrames: Object.fromEntries(ALL.map(ph => [ph.name, {
        void: ph.voids.slice().sort((a, b) => b.voidPct - a.voidPct)[0],
        flip: ph.flips.slice().sort((a, b) => b.flipPct - a.flipPct)[0],
        insideMaxDarkPct: Math.max(0, ...ph.inside.map(o => o.darkPct || 0)),
      }])),
    };
    fs.writeFileSync(path.join(OUT, `${LABEL}-summary.json`), JSON.stringify(summary, null, 2));
    console.log(`[sc] RESULT ${LABEL}: ` + sums.map(s =>
      `${s.name} void=${s.voidFlashFrames} flip=${s.flipTransitions}`).join(' | '));

    await analyzer.close();
    await browser.close();
  } finally {
    console.log('[sc] terminating X-Now');
    try { process.kill(-proc.pid); } catch (_) { try { proc.kill(); } catch (_) {} }
  }
})().catch((e) => { console.error('[sc] FAILED:', e.message); process.exit(1); });
