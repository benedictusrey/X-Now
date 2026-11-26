# 📜 Changelog

All notable changes to **X-Now** are documented here. The format follows [Keep a Changelog](https://keepachangelog.com/en/1.1.0/) conventions, and versioning follows [Semantic Versioning](https://semver.org/).

---

## [2.6.0] — 2026-11-25

Download guide: [`docs/releases/X-Now_v2.6.0.md`](docs/releases/X-Now_v2.6.0.md)

### 🚀 Added
- **X-Now Downloader (`Ctrl/Cmd+Shift+D`, top-left rail button left of Refresh feed, context menu, and tray Tools)**: inspect any X/Twitter post URL or ID (`x.com`, `twitter.com`, `fxtwitter.com`, `vxtwitter.com`, `fixupx.com`, or numeric ID) with live page context probe + syndication API fallback, thumbnail strip for multi-media posts, item/format selector, filename stem preview, editable post text (`.txt`), single-file save, audio-only `.m4a` extraction via FFmpeg, HLS `.m3u8` / `.mp4` / `.gif` handling, and Full Post Bundle export (`post.txt` + `metadata.json` + all media).
- **Built-in Image Zoom Viewer & Preview Zoom Slider**: `Ctrl/Cmd+click` any post image (or choose *View / Zoom image* in its context menu) to inspect it with a `10%–400%` range slider, drag-to-pan, mouse-wheel zoom, and keyboard shortcuts (`+`/`−` zoom, `0`/`F` fit, `1` actual size, arrows pan, `S` save, `Esc` close). The Downloader window also provides a `100%–400%` image preview zoom slider with the same keyboard shortcuts.
- **High-compatibility media outputs**: defaults `pbs.twimg.com` WebP-encoded images to `JPG` (keeping `PNG` lossless when uploaded as PNG), remuxes HLS streams with `-bsf:a aac_adtstoasc` + `+faststart`, exports palette-dithered compact looped GIFs (`fps=15`, capped width `720px`), adds `avif`/`heic`/`bmp` magic-byte sniffing with collision-safe renames, and guards Windows reserved filenames across platforms.
- **Cross-platform window & Wayland helpers**: centered work-area window sizing helper, Wayland session detection, tray Wayland toast visibility fix, and explicit visible/minimized state evaluation (`is_window_hidden_state`).

### ⚡ Changed
- **Performance & memory footprint**:
  - Consolidated `frontend/x-tools.js` video mount guard and source tracking into a single filtered `MutationObserver` without `Array.from` allocations, skipping text nodes and `.xnow-ui` chrome.
  - Replaced regex allocations inside `scopedVideoResources`, skipped eager HTML fetches when a direct media URL works, and paused background theme sampling while hidden.
  - Scoped `frontend/x-rail.js` logo lookup, short-circuited rail mutations when already mounted, and accommodated 3 compact rail controls (`Settings`, `Downloader`, `Refresh`) on narrow sidebars.
  - Paused `frontend/x-settings.js` `enforceQuiet` polling when hidden or off, and serialized settings writes with a monotonic sequence counter to prevent out-of-order overwrites.
  - Replaced `O(N·D)` tree scans in `src-tauri/src/audio.rs` with linear `O(N)` BFS, reduced hidden/visible watchdog wakeups (`15s` visible / `5s` hidden), and gated startup DOM diagnostics behind `--webview-diagnostics`.
  - Synced Black (`#000000`), Dim (`#15202b`), and Light (`#ffffff`) surface tokens across the top-left UI and Downloader window with reduced-motion parity.

### 🔧 Fixed
- Fixed Wayland `is_visible()` reporting preventing pause-on-hide recovery, added Linux WebKitGTK runtime guards (`WEBKIT_DISABLE_DMABUF_RENDERER`, `WEBKIT_DISABLE_DMABUF_ATLAS`, `WEBKIT_GST_DMABUF_SINK_DISABLED`, `WEBKIT_GST_DISABLE_GL_SINK`, and `WEBKIT_DISABLE_COMPOSITING_MODE` on Wayland), fixed broken WebKitGTK OAuth popups (and denied sign-in popups on all platforms when already signed in), routed in-app popups on Linux to the main window, allowed internal/embedded OAuth frames in `on_navigation`, and enabled `bundleMediaFramework` for AppImage GStreamer plugins.
- Fixed Windows `CreateToolhelp32Snapshot` handle leak in `src-tauri/src/audio.rs`, cross-filesystem `EXDEV` temp rename failures during FFmpeg image conversion in `src-tauri/src/lib.rs`, `pbs.twimg.com` image URL extension stripping and `.fixvx.com` matching in `src-tauri/src/downloader.rs`, and silent GIF audio-extraction rejection.
- Fixed WCAG AA dark-surface contrast (`#8b98a5`), range/rail keyboard focus rings, touch/pointer-capture pan cleanup, native macOS/Linux UI fonts, Linux `backdrop-filter` compositor stalls, and cross-origin iframe fiber traversal guards across `frontend/downloader.html`, `frontend/downloader.js`, `frontend/x-tools.js`, and `frontend/x-rail.js`.
- Fixed `pause_media_for_hidden` race so JS pauses media before WebView2 `TrySuspend()` freezes script execution, with `PAUSE_RECHECK_IN_FLIGHT` deduplication.
- Fixed watchdog exit lifecycle so closing the main `"x"` window cleans up cleanly and resets `WATCHDOG_STARTED`.
- Fixed diagnostic title prefixes (`XNOWERR:` / `XNOWLOG:`) leaking into the native window titlebar and deduplicated `set_title` calls.
- Added parent-directory creation, atomic write cleanup, and direct write fallback in `src-tauri/src/settings.rs` when Windows file indexers/AV lock `.json.tmp` renames.

---

## [2.5.0] — 2026-11-16

Download guide: [`docs/releases/X-Now_v2.5.0.md`](docs/releases/X-Now_v2.5.0.md) · Full technical record: [`docs/releases/X-Now_v2.5.0-record.md`](docs/releases/X-Now_v2.5.0-record.md)

### 🚀 Added
- **Settings panel** beside X's logo and in the tray: window, minimize, media, Quiet hours, zoom, theme, motion, focus layout and saved media (last 50 saves).
- **Unmute videos when X-Now is active** (on by default).
- **Quiet hours**: Nights (23:00 to 07:00) or a custom window. Pauses and mutes video while active.
- **Refresh** beside the logo: loads new posts in place.
- **Tray Settings submenu** and an *Open saved media folder* action.
- **Scroll-flash tools** in `scripts/`: per-frame CDP harness and smoke test.

### ⚡ Changed
- Settings are saved to `settings.json` in the app data folder.
- The WebView allows autoplay with sound (`--autoplay-policy=no-user-gesture-required`) on every X-Now page.
- Release workflow: one manual run builds every platform's installers. A tag push no longer starts it.
- Repository layout: release files in `dist/`, probe scripts in `scripts/diagnostics/`.

### 🔧 Fixed
- Google and Apple sign-in windows close by themselves after sign-in.
- Video sound on Windows: X-Now no longer keeps its own audio session muted.
- Blank Task Manager icon.
- Black flashes and bleached windows while scrolling; video players stay hidden until their first frame.

### 📦 Release
- Seven installers and `SHA256SUMS.txt`. Packages are unsigned.

---

## [2.1.0] — 2026-08-15

### 🎨 Changed
- **Readable composer & sidebar text**: the post/reply composer ("What's happening?") now types at **15px** instead of X's ~19px default, and the left sidebar menu (Home, Explore, …) reads at **17px** — including the **"More" button, its flyout and X's dropdown menus** — injected page CSS, no X settings touched.
- **Structured native tray menu**: the tray **right-click** now opens a clean native context menu with **Show/Hide, Navigate, Window, View, Tools, How to, About, and Quit**. Native hover flyouts organize the actions on **Windows, Linux, and macOS**. Every clickable item carries a **16×16 white glyph**, and checkmarks stay in sync with Always-on-top and Launch-on-Startup.
- **New X-Now branding**: the refreshed icon set in `icons/` is applied across the **window, taskbar, tray icon, About card, application launcher, and Windows installers**, replacing the old bird mark. The bundle uses the repository's `icons/icon.ico` for the Windows installer and uninstaller.
- **Redesigned About X-Now**: a sleeker, more compact card showing the **new brand icon**, current version, author credit, and a feature grid for Save media, Tray controls, Quiet minimize, and Links open out.

- **Windows installers with the X-Now branding**: `tauri build` now produces the NSIS `.exe` and WiX `.msi` installers with `icons/icon.ico` configured for the NSIS installer and uninstaller. The Windows bundle uses the same brand icon in its package metadata.

### 📦 Release engineering
- Automated GitHub Actions release pipeline (`.github/workflows/release.yml`) builds Windows x64 (NSIS, MSI, portable), Linux x64 (AppImage, DEB, RPM), and macOS (universal DMG containing arm64 and x86_64 code), automatically validates package integrity, and produces draft GitHub Releases with SHA-256 manifests.


### 🔧 Fixed
- **Blurry icon on the title bar, taskbar and tray**: the window and tray icons now use purpose-made 32px renders from the icon kit instead of the .ico's 256px frame that Windows was downscaling (native size = crisp at every DPI).
- The "More" sidebar button kept X's large font: label spans are now forced to 17px directly (unread-count badges stay small).
- Restored the `base64` dependency for embedding the new brand icon in the About overlay.

---

## [2.0.0] — 2026-08-07

### 🚀 Added
- **Close-to-tray**: closing the X window hides it to the system tray instead of destroying it; media pauses instantly on close.
- **Pause-on-minimize**: a Rust playback watchdog (800 ms poll + resize fast-path) pauses all video/audio the moment the window hides and resumes on restore — with a **Windows OS-level audio-session mute** as a hard guarantee even if the page misbehaves.
- **Smart tray toggle**: tray-icon click and the new **"Show / Hide X-Now"** menu item restore the app whenever it is minimized/hidden/unfocused, and hide it (pausing first) only when visible and focused.
- **🚀 Launch on Startup** tray toggle — starts hidden to the tray (`--minimized`) so autostart never pops a window over your work.
- **Stale audio-session cleanup**: a startup watchdog clears any Windows-persisted session mute within seconds of launch, and reports OS session state (mute/volume/peak) for diagnostics.
- **One-click media saving**: right-click images → the **full-resolution original** is saved to `Downloads\X-Now` (lazy native-bridge calls, CORS-safe fetch fallback, `name=orig`/`large` variant resolution, MP4-validated); right-click videos → **always the clicked post's video** — direct MP4 from the post page when X exposes it, otherwise the IG-Now hand-off (post link copied + Cobalt opened with the folder pre-created). A bottom-right toast shows a spinner while downloading and **"Saved ✓"** with the folder when done. Tray shortcut: **Open Cobalt video downloader**.
- **Seamless About overlay**: tray → About renders an in-app overlay inside the X window — the real X-Now app icon (embedded data URI), version, and a **"Built with ❤️ by @benedictusrey"** credit — no separate window.
- **External link handoff**: a plain click on any link outside x.com (including `t.co` redirects) opens it in the OS default browser automatically; X's own links stay in-app.
- **Titlebar username**: the native title becomes `X-Now (@handle)` after sign-in, detected from X's own profile tab.
- **Seamless in-app login**: Google & Apple OAuth popups open as managed in-app windows (dark-styled, auto-closing on token relay) so the `postMessage` login flow works exactly like X's own web app.
- **Documentation suite**: `RELEASE_NOTES.md`, `CHANGELOG.md`, `SECURITY.md`, `CONTRIBUTING.md` with per-platform (Windows/macOS/Linux) guides.
- **Full Rust backend committed to the repo** (`src-tauri/`) — previously missing from version control, which broke fresh-clone builds and CI.

### 🎨 Changed
- **Window**: loads `https://x.com` directly at the default 1300×850 layout (min 900×600); the legacy prototype SPA (mock feed UI) was removed — it was never shipped in the binary.
- **Resume semantics follow X**: restore replays only the element that was playing *and is still on-screen*; off-screen media is handed back to X's own in-view autoplay engine.
- **Audio defaults**: feed videos follow X's muted-autoplay rule; lightbox/standalone videos play at 50% after your first interaction.

### 🔧 Fixed
- **Video saving grabbed the wrong video (first page video / X's UI animation)**: page-wide resource entries cannot be attributed to the clicked post, so they are now **never** used for videos. A video resolves only from: its own element URL → the **clicked post's page** (`og:video` / `twitter:player:stream` / embedded JSON — always the right post) → resources pinned to the clicked element via its poster's media ID. Post links with suffixes (`/status/123/photo/1`, `/video/1`, `/analytics`) are normalized to the clean status URL (those routes serve no video content), X's own UI assets (`pbs.twimg.com/static/*`, e.g. the login-card animation) and HLS playlists are excluded from every candidate path, and an unresolvable stream hands off to **Cobalt with the correct post link** instead of downloading a wrong video. Every save also logs its post URL and candidate list (`XNOWLOG:`) for instant diagnosis.
- **CMD window flashing during downloads**: `curl.exe` was spawned as a console process, popping a black window next to the app. It now runs with `CREATE_NO_WINDOW` on Windows — downloads are completely silent.
- **The root cause of "X blocked this image download"**: Tauri v2 rejects custom app commands invoked from **remote origins** (x.com) unless an explicit `remote` capability grants them — the app's ACL manifest was empty, so every native call (`download_media`, `save_media_bytes`, `open_external_url`, `prepare_download_folder`) was rejected with "Command … not allowed by ACL" and everything silently degraded to browser fallbacks. Fix: build.rs now declares the commands (auto-generating `allow-*` permissions) and a new `remote-x-com` capability grants exactly those four to `https://x.com/*` (least privilege — the page gets nothing else). Image saving and direct video saving now actually reach the native downloader.
- **Image saving reliability**: the native bridge is now resolved lazily at call time (a load-time capture could silently disable every native command), the cross-origin media fetch uses `credentials: "omit"` so twimg's `access-control-allow-origin: *` passes the CORS check, extensionless twimg URLs (`…-ZP?format=jpg&name=…`) are recognized, `performance` API access is defensive, the download folder falls back to Documents/Home when Downloads is unavailable, and failure toasts now include the actual reason.
- **OAuth popup windows now close automatically after login** — the main window's title signal (`XNOW:<handle>`, set once the token relay completes) triggers a sweeper that closes every remaining `popup-*` sign-in window, exactly like TikTok-Now's handler. This covers X's Google sign-in (GIS), whose popup can linger on accounts.google.com because it never navigates back to x.com. The signed-in handle is also cached and re-applied to the titlebar when X's SPA overwrites the page title.
- Double-pause race: both the resize fast-path and the watchdog firing on one minimize no longer wipe the resume intent (restore silently stayed paused before).
- Mute-backup restore now always restores the original mute state of the exact element that was muted.
- Fresh-clone compilation failure caused by the missing `tray.rs` (previously gitignored).

### 🧹 Removed
- Legacy prototype frontend (`frontend/index.html`, `frontend/css/`, `frontend/js/`) — a mock X UI that the shipped binary never loaded.
- `assets/` screenshots moved to `docs/assets/` (renamed `xnow-*.jpg`).
- Old `X-Now_v1.1.0.exe` release binary (replaced by the v2.0.0 build).

---

## [1.1.0] — 2026-08-01

### 🎨 Changed
- **1300×850 default layout** (1.53:1) that dynamically scales on 4K and 2K monitors without layout shifting.
- **Native checkmarks** in the tray menu (Always on Top state now shows a real OS checkmark).
- **True JS muting** — mute injects scripts that block all HTML5 `<audio>`/`<video>` playback without touching X account settings.
- **Advanced tray logic** — improved show/hide/restore behaviour and memory-compaction tools.

---

## [1.0.0] — 2026-08-01

### 🚀 Initial release
- **Tauri v2 + Rust** desktop wrapper around [X (Twitter)](https://x.com) with a persistent signed-in WebView2 profile.
- **Live X feed** — WebView2 renders `https://x.com` natively with full functionality.
- **Google & Apple OAuth login** — native popup window with WebView2 environment sharing so `postMessage()` OAuth token relay works seamlessly; popup auto-closes after login.
- **Smart video autoplay** — `IntersectionObserver`-based: videos autoplay when 50% visible, pause immediately when scrolled away; one video at a time.
- **Dynamic titlebar** — `X-Now (@username)` after login.
- **System tray command center** — Window (Show/Hide), Navigation (Home, Explore, Notifications, Messages, Bookmarks, Profile), Display (Refresh, Always on Top, Zoom In/Out/Reset, Dark/Light Mode, Mute Notifications), Power Tools (Compact Memory & Cache, Developer Tools, Copy Current URL), About & Quit.
- **Custom HD icon** — multi-resolution ICO embedded in the PE binary, tray, and taskbar.
- **Windows installers**: NSIS setup wizard + MSI package.

#### Technical Stack
- Tauri v2.11.5 (Rust backend) · WRY/WebView2 (Chromium rendering engine) · Rust 1.97 (stable)

---

*Authored and maintained with ❤️ by [@benedictusrey](https://github.com/benedictusrey)*
