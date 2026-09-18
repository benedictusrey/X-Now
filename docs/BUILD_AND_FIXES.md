# X-Now — Build & Rendering-Fix Guide (v2.1.0)

> **Read this file before touching `src-tauri/src/lib.rs`, `src-tauri/src/tray.rs`, `frontend/x-tools.js`, or building any installer.**
> It documents the v2.1.0 rendering pipeline fixes (bleached screen, black flash bands, scroll flashing), exactly how each fix works, how to build, and how to verify nothing regressed.
> Audience: future AI coding agents and human developers. Written 2026-09-13 after the v2.1.0 rendering-fix pass.

---

## 0. The five rules (violating these caused every regression we fixed)

1. **Sync icons before ANY build**: `src-tauri/icons/` must be byte-identical to root `icons/`. The release workflow does this every build; local builds must too (see §4). Skipping this shipped stale icons once already.
2. **Never bypass `build.rs`**: it (a) watches the bundle icons so icon changes recompile the Windows resource, and (b) registers the app commands in the ACL manifest — without the manifest, Tauri silently rejects every `invoke` from `https://x.com` and ALL media saving dies.
3. **Run the full verification chain** (§5) after every change: `cargo test --lib`, `node --check frontend/x-tools.js`, `scripts/verify-xnow-helpers.js` (88 assertions). All must be green before bundling.
4. **Never hardcode the webview background color again**: it must stay theme-adaptive (`XNOWBG` protocol, §3.2). A pinned color is what turned the old white flash into a black flash.
5. **Keep the launch-arg toggles orthogonal and order-independent** (`--no-occlusion-fix`, `--no-gpu-video-overlays-fix`, `--webview-default`, `--webview-args`, `--webview-diagnostics`). They are the supported way to bisect rendering regressions — do not remove or reorder their resolution logic in `resolve_launch_config()`.

---

## 1. Architecture map

```
X-Now/                          ← repository root (main checkout)
├── frontend/x-tools.js         ← THE page-side engine, embedded via include_str! into the
│                                  binary (NOT served from disk — editing it REQUIRES a rebuild)
│                                  Pause/resume engine, per-video targeting, idle-aware route poll,
│                                  media saving bridge, theme reporter (XNOWBG), toasts, About overlay
├── src-tauri/
│   ├── build.rs                ← icon rerun-if-changed + ACL command manifest (rule 2)
│   ├── tauri.conf.json         ← productName "X-Now", version "2.1.0", bundle config
│   ├── Cargo.toml              ← version "2.1.0" (release pipeline asserts both match)
│   ├── icons/                  ← BUNDLE icon set — must mirror root icons/ (rule 1)
│   └── src/
│       ├── lib.rs              ← app core: LaunchConfig resolution, window builder, XNOWBG
│       │                          handler, event-driven playback watchdog, media-saving
│       │                          commands, diagnostics, 22 unit tests (#[cfg(test)])
│       └── tray.rs             ← native tray menu, native set_zoom (100–300%), show/hide logic
├── scripts/
│   ├── verify-xnow-helpers.js  ← jsdom harness: 88 assertions over x-tools.js contracts
│   └── xnow-flash-smoke-test.js← Playwright/CDP scroll-flash measurement on the REAL exe
├── docs/BUILD_AND_FIXES.md     ← this file
├── icons/                      ← SOURCE OF TRUTH icon set (HD)
├── X-Now_v2.1.0.exe            ← published standalone exe (must match a verified build)
├── CHANGELOG.md / README.md / RELEASE_NOTES.md / SECURITY.md / CONTRIBUTING.md
└── docs/RELEASE_PIPELINE.md    ← GitHub Actions release build guide
```

Key implementation facts agents must know:

- **`frontend/x-tools.js` is `include_str!`-embedded** (`lib.rs` line ~23, `X_HELPER_SCRIPT`). There is no such thing as "just reloading the frontend" — every JS change needs `cargo build` + reinstall.
- The **webview is remote content** (`https://x.com`). All `invoke` calls from the page go through the ACL — see rule 2.
- The **window-event → page bridge**: Rust evaluates `__onWindowHidden` / `__resumeIfNeeded` inside the page (idempotent page helpers). The page's own `visibilitychange` listener only mirrors the watchdog.
- **Watchdog is event-driven**: window events call `wake_watchdog()` (condvar); the watchdog thread wakes instantly, re-checks real state, then falls back to a 5 s poll while hidden (`HIDDEN_POLL`). Do not reintroduce fixed fast polling — it cost battery (fixed in v2.1.0).
- **Zoom is native** (`WebviewWindow::set_zoom`, level tracked in Rust in `tray.rs`, 1000 = 100%). The old `document.body.style.zoom` CSS hack is banned: it misplaces fixed overlays and composited video layers.

---

## 2. The rendering fixes (what broke, why, what fixed it)

All five shipped in the v2.1.0 fix pass. Each lists the bisect switch so any future regression can be isolated in one launch.

### 2.1 Bleached/white screen over the window

- **Symptom**: window turns fully white/bleached over the X content, especially around video-heavy feeds; white-flash over time.
- **Root cause**: Chromium's native-window occlusion tracker (`CalculateNativeWinOcclusion`) misclassifies the window as occluded during heavy video churn (occlusion is computed natively while WebView2's content wants to keep presenting). The compositor stops painting the "occluded" window → bleached surface.
- **Fix**: `--disable-features=…,CalculateNativeWinOcclusion` in `DEFAULT_WEBVIEW_BROWSER_ARGS` (`lib.rs` line ~46), plus wry's UI-suppression defaults (`msWebOOUI,msPdfOOUI,msSmartScreenProtection`) which are ALWAYS re-injected even when the user overrides args.
- **Bisect**: `--no-occlusion-fix` (drops only this) — if bleaching returns, the tracker is still the culprit on that machine.

### 2.2 Black flash bands while scrolling / jaggy black flashing (two stacked causes)

**Cause A — DirectComposition video overlay planes.**
WebView2 renders `<video>` into separate DComposition overlay planes that detach/re-attach on every window geometry change and lag the compositor during fast scroll → one-frame black rectangles / jaggy bands around video. Known WebView2 artifact class (MicrosoftEdge/WebView2Feedback #5574, chromium 40281472).
**Fix**: `--disable-direct-composition-video-overlays` in `DEFAULT_WEBVIEW_BROWSER_ARGS` — video composites into the normal surface and follows every frame atomically.
**Bisect**: `--no-gpu-video-overlays-fix`.

**Cause B — unpainted-surface color contrast (the subtle one).**
The compositor always has gaps: raster tiles not yet painted while scrolling, restore frames, video layer updates. Whatever color the WebView2 background is pinned to fills those gaps. This app originally pinned **dark `#0f1419`** (to kill the launch white-flash); X's actual theme resolves **asynchronously** and can be **light**. Result: every gap flashed as a **dark band on light content** — maximally visible while scrolling. Measured with the CDP smoke test: up to 37% dark rows at scroll depths before the fix; page frame timing was healthy (avg ~6.5 ms) proving it was never a performance problem.
**Fix — the XNOWBG protocol** (do not break this chain):
1. Page (`x-tools.js`, "Theme background reporter" section): reads X's **computed** body background (handles `rgb()` and hex, samples a few times because X applies the theme seconds after load, then a `MutationObserver` on `<html>`'s `data-theme` + `class`), and reports it by setting `document.title = "XNOWBG:r,g,b"` (title is the only always-available page→native channel).
2. Native (`lib.rs`, `on_document_title_changed` handler): `strip_prefix("XNOWBG:")` → `parse_css_color_to_native()` → `apply_theme_background()` → `window.set_background_color(Some(color))` **at runtime** → immediately restores the real title (`X-Now (@handle)` from `username_cache`), so the ping never lingers in the titlebar.
3. Launch log confirms: `[X-Now] Native background synced to page theme: #ffffff`.
**Bisect**: the launch line prints `dark_background=true/false`; `--webview-default` shows the stock (white) behavior for comparison.

> ⚠️ If X-Now ever ships its own theme switch, it must go through this protocol — never `set_background_color` with a constant.

### 2.3 Restore-time pause race (video paused right after un-minimizing) — see also §2.5

- **Root cause**: the old minimize fast-path probed `is_minimized()` on every `Resized` event; tao also emits **interim-size `Resized` events during RESTORE**, where the probe intermittently still returned true → the app paused media immediately after resuming it, forcing the video layer to re-attach mid-geometry-change (compounded 2.2-A).
- **Fix**: `Resized` no longer probes/pauses; it only calls `wake_watchdog()`. The watchdog thread wakes instantly, re-checks the REAL window state, and pauses/resumes exactly once per true transition.
- **Bisect**: `--webview-diagnostics` logs a `hidden/visible` webview line on every transition — a pause/resume storm shows up as alternating lines.

### 2.4 Zoom glitch (misplaced UI after View ▸ Zoom)

- **Root cause**: `document.body.style.zoom` CSS scaling desynced fixed-position overlays and composited video layers from the layout.
- **Fix**: native `set_zoom` engine zoom in `tray.rs` (`ZOOM_LEVEL_X10`, 100–300%, reset at 100%), buttons rendered as native `IconMenuItem`s.

### 2.5 Residual "shocking" flashes while scrolling: the mount-time black player gap (2026-09-14)

After 2.2/2.3/2.5 the user STILL saw occasional shocking flashes while scrolling. Screenshots could never catch it (they sample the last completed frame); the proof required capturing **every compositor frame** via CDP `Page.startScreencast` (`scripts/xnow-screencast-flash-test.js`).

- **Root cause**: at every static↔video post transition, X **mounts the player chrome black** (the "Embedded video" wrapper computes to `rgb(0,0,0)` even in the light theme) for the first ~3 compositor frames before ANY content — poster image OR first video frame — paints. Pixel-verified: a coherent ~500x240+ region flips light→black→light (100% of flipped tiles inside one bbox) in lockstep with the video element's `loadstart`/`loadeddata` events. GPU-side paths were ruled out experimentally (`--disable-gpu-compositing` and re-enabling DirectComposition overlays changed nothing).
- **Why earlier fixes missed it**: it is a page-level rendering gap INSIDE the media rect, invisible to theme-background sync (the fill color is irrelevant — the player surface itself is unpainted black) and masked out of void detection (media rects are excluded from tile analysis).
- **Fix — the video mount guard** (`x-tools.js`, "Video mount guard" section, `window.__xnowVideoMountGuard`): a freshly mounted or src-swapped `<video>` with no decodable frame gets `data-xnow-mount-wait` → `visibility: hidden` on itself AND its nearest dark-surfaced player wrapper, until `loadeddata`/`canplay`/`playing` or a 1.5 s timeout. The white card shows through instead of black chrome; layout/geometry/autoplay are untouched.
- **Critical implementation facts** (each cost a debugging session):
  1. X's feed videos ALWAYS carry a `poster` ATTRIBUTE — but the poster is not yet PAINTED at mount, so the attribute must NOT exempt them from the guard.
  2. X's virtualized feed REUSES the same `<video>` DOM node across posts — scroll transitions are src swaps (`loadstart`/`emptied` events), not DOM insertions; a MutationObserver alone sees nothing.
  3. At `loadstart`, Chromium may still report the PREVIOUS stream's `readyState >= 2` — re-arms must FORCE the mark past the `readyState >= 2` gate, or the black gap survives on recycled players.
- **Analysis tooling** (all in `scripts/`): `xnow-screencast-flash-test.js` (per-frame capture + masked tile-grid void detector + inside-rect flash detector + video-event correlation), `tile-flip-diff.js` (two-frame class-flip coherence), `region-white-scan.js` (region white/dark/mean across numbered evidence frames), `analyze-void-evidence.js` (region-over-time truth), `probe-guard-state.js` / `probe-chrome-colors.js` (live DOM probes).
- **Interpreting residual detector hits**: X's designed poster/pause states also produce dark-dominant regions; they are STATIC (zero tile flips during the dwell) and revert by content, not by repaint. Only coherent light→black flips at `loadstart`/`loadeddata` boundaries are the defect class.

### 2.6 Stale icons in the exe/installers (resource staleness)

- **Root cause chain**: (a) `src-tauri/icons/` held outdated low-res copies while the HD set lives in root `icons/`; the release pipeline syncs root → bundle each build, local builds didn't. (b) Worse: `tauri-build` compiles the icon into the Windows `.res` but emits `rerun-if-changed` only for config/capabilities/frontend — so after ANY such directive exists, cargo's default rebuild-on-change is off and **replacing the icon file never recompiles the resource**; rebuilds relinked the stale `.res` into a fresh exe (new code, old icon). Verified by extracting `RT_ICON` frames from the built exe and byte-comparing them.
- **Fix**: `src-tauri/build.rs` emits `cargo:rerun-if-changed` for every bundle icon (§1), and rule 1 keeps the sets identical. **Verification is mandatory after icon changes**: extract the exe's icon frames and byte-compare against `icons/icon.ico` (the frame test caught what timestamps and hashes of the .ico alone did not).

---

## 3. Building

### 3.1 Prerequisites (Windows)

- Rust (MSVC toolchain), Node.js ≥ 18 (for the JS harnesses only — there is no JS build step)
- Tauri v2 system deps for bundling: NSIS + WiX are auto-fetched by `tauri build`
- WebView2 Runtime (present on Win 11 by default)

### 3.2 Standard build sequence (exact commands, Git Bash)

```bash
cd src-tauri

# 0) unit tests FIRST — 22 must pass
cargo test --lib

# 1) sync icons root → bundle (rule 1) and verify byte-for-byte
for f in icon.ico icon.png icon.icns 32x32.png 128x128.png 128x128@2x.png; do
  cp "../icons/$f" "icons/$f"
done
sha256sum ../icons/* icons/* | sort   # eyeball: each pair identical

# 2) release build (exe at target/release/X-Now.exe)
cargo build --release

# 3) bundle installers (NSIS + MSI under target/release/bundle/)
npx --yes @tauri-apps/cli@2 build --bundles nsis,msi
#    (the CLI build re-runs cargo; do NOT skip step 2 if you only want the exe)

# 4) verify the ICON actually got into the exe (rule from §2.5):
#    extract RT_ICON frames and byte-compare against icons/icon.ico —
#    do not trust timestamps; the .res was stale once while everything else was fresh
```

After any `frontend/x-tools.js` change, repeat from step 0 — remember the file is **embedded in the exe**.

### 3.3 Where the artifacts land

| Artifact | Path |
|---|---|
| Standalone exe | `src-tauri/target/release/X-Now.exe` |
| NSIS installer | `src-tauri/target/release/bundle/nsis/X-Now_2.1.0_x64-setup.exe` |
| MSI installer | `src-tauri/target/release/bundle/msi/X-Now_2.1.0_x64_en-US.msi` |

The published repo-root `X-Now_v2.1.0.exe` **must be replaced** with the newly verified `target/release/X-Now.exe` (this was missed once — the root exe went stale while the sources were fixed).

---

## 4. Verification & testing

### 4.1 Rust unit tests (22)

```bash
cd src-tauri && cargo test --lib
```
Covers `resolve_launch_config` (every flag + precedence + combination), `remove_feature`, `parse_css_color_to_native` (rgb/hex/bare `r,g,b`), and regression cases. `cargo check` must also be clean.

### 4.2 JS contract harness (88 assertions, jsdom)

```bash
npm install          # one-time; installs the pinned devDependencies (jsdom 30, playwright-core)
npm run test:js      # 88 assertions
```
(The harness requires jsdom ≥ 25: it dispatches `PointerEvent`, which jsdom 24 lacks.)
Asserts the page-side contracts Rust relies on: `__onWindowHidden` / `__resumeIfNeeded` idempotency, pause/resume/mute behavior, theme reporter payload format (`XNOWBG:r,g,b`), saving bridges. **If you change `x-tools.js` and these fail, Rust behavior will break too** — the two sides are coupled by string contracts.

### 4.3 Scroll-flash smoke test (Playwright over CDP, the real exe)

```bash
NODE_PATH="$(cygpath -w "$TEMP/xnow-verify/node_modules")" \
  node scripts/xnow-flash-smoke-test.js "src-tauri/target/release/X-Now.exe" "after-fix"
```
- Launches the real exe with `WEBVIEW2_ADDITIONAL_BROWSER_ARGUMENTS=--remote-debugging-port=9333` (the port flag must go through this env var — exe args are NOT forwarded to WebView2), attaches Playwright over CDP, wheel-scrolls the feed, captures 40 burst frames + 8 scroll-depth screenshots, and counts flash-band frames (rows of uniform contrasting color).
- Skips gracefully if another X-Now instance holds the profile lock.
- v2.1.0 baseline: **0 flash frames, 0 dark bands, theme sync line present in the app's stderr**.
- Honest caveat: single-frame transients can escape screenshot sampling; steady-state metrics + the confirmed `Native background synced` log line are the strongest evidence.
- Close the app when done (it uses your real X session).

### 4.4 Runtime diagnostics (for support/bisecting)

```bash
src-tauri/target/release/X-Now.exe --webview-diagnostics 2> xnow.log
```
Launch-config line at startup + webview state (visibility, open/playing videos, h264 decode health) on every hide/show transition. OS audio-session report complements it. **Log lines are the acceptance test** for the fixes:

| Log line | Meaning |
|---|---|
| `[X-Now] Launch config: webview_args="…" dark_background=… diagnostics=…` | effective workaround set (always printed) |
| `[X-Now] Native background synced to page theme: #……` | XNOWBG chain fired (theme-adaptive fix alive) |
| `[X-Now] Webview diagnostics (visible/hidden): …` | transition reports (only with the flag) |
| `[X-Now] Watchdog: window hidden/visible` | true hide/show transitions |

### 4.5 Launch-flag reference (bisect matrix)

| Flag / env | Effect |
|---|---|
| *(none)* | Stock: theme-adaptive background + occlusion fix + video-overlay fix (**recommended**) |
| `--no-occlusion-fix` | Drops only `CalculateNativeWinOcclusion` |
| `--no-gpu-video-overlays-fix` | Drops only `--disable-direct-composition-video-overlays` |
| `--webview-default` | Full stock WebView2 (white background, no workarounds — escape hatch) |
| `--webview-args "…"` / `XNOW_WEBVIEW_ARGS` | Full custom arg list (wry UI defaults always kept; flag wins over env) |
| `--webview-diagnostics` | Transition + startup webview state logging |

Safety rails (in `resolve_launch_config`, covered by tests): user overrides never lose wry's UI-suppression defaults; empty overrides are ignored; flags are order-independent; `--webview-default` doesn't reset diagnostics.

---

## 5. Known gotchas (each one cost a debugging session)

| Gotcha | Consequence | Rule |
|---|---|---|
| `frontend/x-tools.js` is `include_str!`-embedded | "Fixed" JS never reaches users without a rebuild | Always rebuild + verify the string is in the exe (`grep -c XNOWBG target/release/X-Now.exe` must be ≥ 1) |
| Bundle icons not synced / `build.rs` not watching icons | Old icon in exe+installers despite new sources | §3.2 step 1 + RT_ICON frame verification |
| `--remote-debugging-port` as an exe arg | Silently ignored — WebView2 never opens the port | Use `WEBVIEW2_ADDITIONAL_BROWSER_ARGUMENTS` |
| Second instance while first runs | WebView2 profile lock → test instance can't start | Close the running app before CDP smoke tests |
| `[X-Now]` logs go to **stderr** | "No logs" in a normal double-click launch | Run from a terminal, `2> xnow.log` |
| Windows icon cache | Old icon shown for new binaries | `ie4uinit.exe -Show` or Explorer restart before declaring the icon broken |
| `icons/icon.icns` is a renamed 32×32 PNG (pre-existing) | macOS pipeline would embed a 32px icon | Harmless on Windows; regenerate a real multi-size .icns before any macOS release push |
| `set_background_color` with a constant | Reintroduces dark-on-light (or white-on-dark) flash | Theme must flow through XNOWBG only (§2.2-B) |
| ACL manifest missing in `build.rs` | All `invoke`s from x.com silently rejected | Never delete the `AppManifest::new().commands(&[…])` block |

---

## 6. v2.1.0 verified artifacts (2026-09-14, includes the §2.5 mount guard)

| Artifact | SHA-256 |
|---|---|
| `src-tauri/target/release/X-Now.exe` (= root `X-Now_v2.1.0.exe` = installed copy) | `70e47e0c4b9b762a7e8575c6926cc44e578b1984b611750597ce4ef7ea0cc208` |
| `bundle/nsis/X-Now_2.1.0_x64-setup.exe` (= `installers/` copy) | `952ca49731ce2161ed7eee7cf3d3590eef03c2e6cf29e1a9976b7ddc453a8b26` |
| `bundle/msi/X-Now_2.1.0_x64_en-US.msi` (= `installers/` copy) | `760ec436d7a73edce827b6d9a538b063b03741bdcf2e90fc9bd191ecb0b5d3f3` |

Verified at build time: 22 Rust tests, 88/88 JS harness assertions (incl. 15 video-mount-guard contracts), screencast A/B shows ZERO genuine black-gap frames (mount-guard engaged, released-on-first-frame), theme-sync line present, all guard/fix strings embedded in the exe.

> If you rebuild, these hashes change by design — regenerate this table and the tracked `checksums.txt` as part of the release checklist in `docs/RELEASE_PIPELINE.md`.

---

## 7. Release checklist (condensed; full guide in `docs/RELEASE_PIPELINE.md`)

> **Known-good snapshot:** a frozen, checksum-manifested copy of every file that constitutes this verified release lives in **`backup/v2.1.0/`** (see `backup/README.md`). If any change regresses the rendering fixes, restore the affected files from there and re-verify — never edit the snapshot in place.

1. §3.2 build sequence green (tests → icon sync → build → bundle → icon verification).
2. §4 verification chain green (unit + harness + smoke test + log lines).
3. Replace root `X-Now_v2.1.0.exe` with the verified exe; regenerate `checksums.txt`.
4. `CHANGELOG.md` / `RELEASE_NOTES.md` / `README.md` updated; version identical in `tauri.conf.json`, `Cargo.toml`, `Cargo.lock` (the release pipeline hard-asserts this).
5. Commit & push `main`; tag the release (`git tag v2.1.0 && git push origin v2.1.0`); verify GitHub Actions draft release at https://github.com/benedictusrey/X-Now.
