# Changelog

All notable changes to **X-Now** are documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

---

## [1.0.0] — 2026-08-01

### 🎉 Initial Release

**Author & Sole Creator: [@benedictusrey](https://github.com/benedictusrey)**

#### Added
- **Live X Feed** — WebView2 renders `https://x.com` natively with full functionality
- **Google & Apple OAuth Login** — Native popup window with WebView2 environment sharing so `postMessage()` OAuth token relay works seamlessly
- **Popup Auto-Close** — After OAuth completes and redirects back to `x.com`, the popup automatically closes after a 1.5 s grace period (for postMessage to complete), then focuses the main window
- **Smart Video Autoplay** — `IntersectionObserver`-based system: videos/GIFs autoplay when 50% visible in viewport, pause immediately when scrolled away. RAM-safe: only 1 video plays concurrently
- **Dynamic Titlebar** — Window title updates to `X-Now (@username)` after login by extracting handle from x.com's profile nav link
- **System Tray (22 items)** across 5 sections:
  - Window: Show · Hide
  - Navigation: Home · Explore · Notifications · Messages · Bookmarks · Profile
  - Display: Refresh · Always on Top · Zoom In/Out/Reset · Dark/Light Mode · Mute Notifications
  - Power Tools: Compact Memory & Cache · Developer Tools · Copy Current URL
  - About & Quit
- **Custom HD Icon** — Multi-resolution ICO (16px → 256px) embedded in the PE binary, tray, and taskbar
- **Version 1.0.0** binary published as `X-Now.exe`
- **Windows Installers**: NSIS setup wizard + MSI package

#### Technical Stack
- Tauri v2.11.5 (Rust backend)
- WRY v0.55.1 / WebView2 (Chromium rendering engine)
- Rust 1.97 (stable)
- SQLite via rusqlite (local state persistence)
- Moka cache (in-memory user data cache)

---

## [Unreleased]

### Planned
- macOS universal binary (arm64 + x86_64)
- Linux AppImage and .deb packages
- Customizable keyboard shortcuts
- Offline notification badge
- Multi-account switching via tray

---

> X-Now is an independent project. Not affiliated with X Corp. or Twitter, Inc.
