# Release Notes: X-Now v2.1.0

<p align="center">
  <img src="icons/icon.png" width="96" height="96" alt="X-Now icon"><br>
  <strong>X-Now v2.1.0</strong><br>
  <em>Readable typography, a structured native tray, and a consistent desktop identity.</em>
</p>

X-Now v2.1.0 refines the native desktop layer around the official X website. The release keeps the v2.0.0 tray, media, audio, login, and external-link features while improving the parts you see and use every day.

## What's new

### Rendering stability: no more bleached windows, black flash bands, or scroll flashing

v2.1.0 also ships a set of WebView2 rendering fixes (documented in depth in `docs/BUILD_AND_FIXES.md`):

- The Chromium occlusion tracker is disabled for the app's webview, so video-heavy feeds can no longer leave the restored window bleached.
- DirectComposition video overlay planes are disabled, eliminating one-frame black bands around videos while scrolling or after restore/resize.
- The native background is now **theme-adaptive**: the page reports X's real theme color (`XNOWBG` protocol) and the app re-syncs the WebView2 background at runtime, so unpainted scroll/restore frames fill with the same color as the content instead of flashing as a contrasting band.
- A **video mount guard** eliminates the last "shocking" flash class: X's player chrome paints black for the first few frames at every static↔video post transition (before poster or first video frame is ready); the app now hides the fresh player until its first frame decodes, verified frame-by-frame with a CDP screencast harness. This includes recycled-player src swaps, which X's virtualized feed performs constantly while scrolling.
- The playback watchdog is event-driven (window events wake it instantly, 5 s fallback poll), fixing a restore-time pause race and cutting idle battery/CPU cost (~6× fewer OS wakeups while hidden in the tray).
- Every launch logs its effective WebView2 configuration, and per-launch toggles (`--no-occlusion-fix`, `--no-gpu-video-overlays-fix`, `--webview-default`, `--webview-args`, `--webview-diagnostics`) allow clean bisecting of any rendering regression.

### Readable typography inside X

- The post composer and reply boxes use **15px** text.
- The primary sidebar, the **More** button, its flyout, and X menu labels use **17px** text.
- The styles apply inside X-Now's window and do not change your X account settings.
- Unread-count badges keep their smaller size, so the larger navigation labels do not overwhelm status indicators.

### A clearer native tray menu

The tray menu now groups related actions into native submenus:

- **Navigate**: Home feed, Explore, Notifications, Messages, Bookmarks, and My profile.
- **Window**: Always on top, Launch on Startup, and Refresh.
- **View**: Zoom controls and Developer tools.
- **Tools**: Copy the current URL, open the current page in the default browser, compact memory and cache, and open the Cobalt downloader guide.
- **How to X-Now**: short usage reminders for media saving, links, the Escape key, and native playback controls.

The menu also provides **Show / Hide X-Now**, **About X-Now**, and **Quit X-Now**. Every actionable item has a purpose-made 16x16 icon. **Always on top** and **Launch on Startup** use native checkmarks that follow their current state.

### Consistent X-Now branding

The refreshed icon set in `icons/` now covers the application surfaces that users see:

- Window and taskbar identity.
- System tray identity with a purpose-made 32px render and a purpose-made 48px window render, keeping the brand sharp at common display scales.
- About card identity using the high-resolution `icon.png`.
- Application launcher and Windows executable identity.
- Windows NSIS installer and uninstaller identity through `icon.ico`.
- Native tray-menu glyphs for navigation and tools.

The repository includes the complete master icon kit (`icons/`) for reference and future packaging work.

### A more useful About card

**About X-Now** opens as an overlay inside the X window. It shows the X-Now icon, the current version, the Rust and Tauri foundation, the author credit, and a compact feature grid for:

- Media saving.
- Tray controls.
- Quiet minimize.
- External links in the default browser.

The overlay does not open a second application window and does not interrupt the signed-in page.

## What v2.1.0 includes from v2.0.0

X-Now v2.1.0 retains the desktop features introduced in v2.0.0:

- Close-to-tray behavior with instant media pause.
- Pause-on-minimize with page-side pausing, a Rust watchdog, and Windows audio-session mute protection.
- Smart tray Show / Hide behavior and optional hidden-to-tray startup.
- Full-resolution image saving and post-scoped video saving to `Downloads\X-Now`.
- Direct MP4 saving when X exposes a usable URL, with a Cobalt browser hand-off when X exposes only a streamed `blob:` URL.
- Bottom-right download status toasts and silent Windows downloads.
- External links opened by the operating system's default browser.
- In-app Google and Apple sign-in popups with automatic cleanup after login.
- A titlebar that shows the signed-in X handle.
- A persistent local WebView session with no X account database or analytics added by X-Now.

## Installer packages

The v2.1.0 GitHub Actions release pipeline builds native packages in parallel across Windows, macOS, and Linux:

| Platform | Package | Target and notes |
|---|---|---|
| Windows | `.exe` NSIS, `.msi` WiX, and `.exe` portable | x64; Windows 10/11; Edge WebView2 Runtime |
| macOS | One universal `.dmg` | arm64 plus x86_64; macOS 11 or newer |
| Linux | `.AppImage`, `.deb`, and `.rpm` | x64; WebKitGTK 4.1 runtime |

The pipeline validates the v2.1.0 version in `src-tauri/tauri.conf.json`, `src-tauri/Cargo.toml`, and `src-tauri/Cargo.lock`. It checks the expected package types, verifies both macOS slices with `lipo`, and publishes verified SHA-256 manifests.

## Installation

### Windows

1. Install the [Microsoft Edge WebView2 Runtime](https://developer.microsoft.com/en-us/microsoft-edge/webview2/) if Windows does not already provide it.
2. Run the downloaded NSIS `.exe` or WiX `.msi` installer.
3. Sign in through the official X page inside the app.
4. Use the tray icon for navigation, media saving, zoom, memory tools, and startup behavior.

### macOS

1. Open the universal `.dmg`.
2. Drag **X-Now** to Applications.
3. On first launch, right-click the app and choose **Open**. The current unsigned build can trigger a Gatekeeper warning.
4. Sign in through the X page inside the app.

### Linux

For the AppImage:

```bash
chmod +x *.AppImage
./*.AppImage
```

For `.deb` or `.rpm`, use your distribution's package installer. The runtime needs WebKitGTK 4.1. GNOME users may also need an AppIndicator extension for tray support.

## Important usage and trust notes

- X-Now is not affiliated with, sponsored by, or maintained by X Corp. or Twitter, Inc.
- X-Now handles X content inside WebView2 on Windows and WebKit on macOS and Linux.
- Media saving uses URLs that X exposes to the page. X-Now does not bypass X access controls.
- Downloaded media belongs to the post's author. Follow X's terms, local law, and the rights attached to the media.
- The current release packages are unsigned. Windows SmartScreen and macOS Gatekeeper may display trust warnings until code signing and notarization certificates are configured.
- Verify downloaded installers with the published `SHA256SUMS.txt` file before installing.

## Related documentation

- [README.md](README.md): product overview, feature guide, and user installation steps.
- [CHANGELOG.md](CHANGELOG.md): version-by-version technical history.
- [SECURITY.md](SECURITY.md): privacy model, Tauri capabilities, and vulnerability reporting.
- [docs/RELEASE_PIPELINE.md](docs/RELEASE_PIPELINE.md): GitHub Actions workflow guide, artifact verification, and release steps.

---

Authored and maintained by [@benedictusrey](https://github.com/benedictusrey).
