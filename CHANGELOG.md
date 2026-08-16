# 📜 Changelog

All notable changes to **X-Now** are documented here. The format follows [Keep a Changelog](https://keepachangelog.com/en/1.1.0/) conventions, and versioning follows [Semantic Versioning](https://semver.org/).

---

## [2.1.0] — 2026-08-15

### 🎨 Changed
- **Readable composer & sidebar text**: the post/reply composer ("What's happening?") now types at **15px** instead of X's ~19px default, and the left sidebar menu (Home, Explore, …) reads at **17px** — including the **"More" button, its flyout and X's dropdown menus** — injected page CSS, no X settings touched.
- **Structured native tray menu**: the tray **right-click** now opens a clean native context menu with **Show/Hide, Navigate, Window, View, Tools, How to, About, and Quit**. Native hover flyouts organize the actions on **Windows, Linux, and macOS**. Every clickable item carries a **16×16 white glyph**, and checkmarks stay in sync with Always-on-top and Launch-on-Startup.
- **New X-Now branding**: the refreshed icon set in `icons/` is applied across the **window, taskbar, tray icon, About card, application launcher, and Windows installers**, replacing the old bird mark. The bundle uses the repository's `icons/icon.ico` for the Windows installer and uninstaller.
- **Redesigned About X-Now**: a sleeker, more compact card showing the **new brand icon**, current version, author credit, and a feature grid for Save media, Tray controls, Quiet minimize, and Links open out.

- **Windows installers with the X-Now branding**: `tauri build` now produces the NSIS `.exe` and WiX `.msi` installers with `icons/icon.ico` configured for the NSIS installer and uninstaller. The Windows bundle uses the same brand icon in its package metadata.

### 📦 Release engineering
- The manual `azure-pipelines.yml` build validates the v2.1.0 version in `tauri.conf.json`, `Cargo.toml`, and `Cargo.lock`, syncs the root icon assets into the Tauri bundle, builds Windows x64, Linux x64, and one macOS universal installer, checks the expected package types, and publishes SHA-256 manifests for both Azure download and GitHub upload.


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
