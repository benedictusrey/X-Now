# 📜 Changelog

All notable changes to **X-Now** are documented here. The format follows [Keep a Changelog](https://keepachangelog.com/en/1.1.0/) conventions, and versioning follows [Semantic Versioning](https://semver.org/).

---

## [2.0.0] — 2026-08-07

### 🚀 Added
- **Close-to-tray**: closing the X window hides it to the system tray instead of destroying it; media pauses instantly on close.
- **Pause-on-minimize**: a Rust playback watchdog (800 ms poll + resize fast-path) pauses all video/audio the moment the window hides and resumes on restore — with a **Windows OS-level audio-session mute** as a hard guarantee even if the page misbehaves.
- **Smart tray toggle**: tray-icon click and the new **"Show / Hide X-Now"** menu item restore the app whenever it is minimized/hidden/unfocused, and hide it (pausing first) only when visible and focused.
- **🚀 Launch on Startup** tray toggle — starts hidden to the tray (`--minimized`) so autostart never pops a window over your work.
- **Stale audio-session cleanup**: a startup watchdog clears any Windows-persisted session mute within seconds of launch, and reports OS session state (mute/volume/peak) for diagnostics.
- **One-click media saving**: right-click images/videos in the feed → saved directly to `Downloads\X-Now` via the native bridge (X's own CDN URLs, MP4-validated).
- **Seamless About overlay**: tray → About renders an in-app overlay inside the X window (X branding, version, author link) — no separate window.
- **Titlebar username**: the native title becomes `X-Now (@handle)` after sign-in, detected from X's own profile tab.
- **Seamless in-app login**: Google & Apple OAuth popups open as managed in-app windows (dark-styled, auto-closing on token relay) so the `postMessage` login flow works exactly like X's own web app.
- **Documentation suite**: `RELEASE_NOTES.md`, `CHANGELOG.md`, `SECURITY.md`, `CONTRIBUTING.md` with per-platform (Windows/macOS/Linux) guides.
- **Full Rust backend committed to the repo** (`src-tauri/`) — previously missing from version control, which broke fresh-clone builds and CI.

### 🎨 Changed
- **Window**: loads `https://x.com` directly at the default 1300×850 layout (min 900×600); the legacy prototype SPA (mock feed UI) was removed — it was never shipped in the binary.
- **Resume semantics follow X**: restore replays only the element that was playing *and is still on-screen*; off-screen media is handed back to X's own in-view autoplay engine.
- **Audio defaults**: feed videos follow X's muted-autoplay rule; lightbox/standalone videos play at 50% after your first interaction.

### 🔧 Fixed
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
