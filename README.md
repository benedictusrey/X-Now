<p align="center">
  <img src="icons/icon.png" alt="X-Now" width="120" height="120"/>
</p>

<h1 align="center">X-Now</h1>

<p align="center">
  <strong>A native desktop client for <a href="https://x.com">X (formerly Twitter)</a></strong><br/>
  Built with <a href="https://tauri.app">Tauri v2</a> + Rust · WebView2 (Windows) · WebKit (macOS, Linux)
</p>

<p align="center">
  <strong>Latest: v2.5.0</strong><br/>
  <em>Settings panel · Quiet hours · unmuted videos while X-Now is active · Refresh beside the logo · sign-in windows that close themselves</em>
</p>

<p align="center">
  <img alt="Windows 10 and 11" src="https://img.shields.io/badge/platform-Windows%2010%20%7C%2011-4285f4?style=flat-square&logo=windows&logoColor=white">
  <img alt="macOS" src="https://img.shields.io/badge/platform-macOS-lightgrey?style=flat-square&logo=apple&logoColor=black">
  <img alt="Linux" src="https://img.shields.io/badge/platform-Linux-FCC624?style=flat-square&logo=linux&logoColor=black">
  <img alt="Rust and Tauri 2" src="https://img.shields.io/badge/built%20with-Rust%20%2B%20Tauri%202-24C8DB?style=flat-square&logo=tauri&logoColor=white">
  <img alt="WebView2" src="https://img.shields.io/badge/rendering-WebView2%20%2F%20WebKit-0078D4?style=flat-square&logo=microsoftedge&logoColor=white">
  <img alt="Version 2.5.0" src="https://img.shields.io/badge/version-2.5.0-1D9BF0?style=flat-square">
  <a href="https://github.com/benedictusrey"><img src="https://img.shields.io/badge/author-%40benedictusrey-black?style=flat-square&logo=github"/></a>
</p>

---

X-Now puts X in its own window. It closes to the tray, pauses video and mutes sound while hidden, saves full-resolution media, and opens outside links in your default browser.

<p align="center">
  <img src="docs/assets/xnow-performance.png" alt="X-Now performance" width="32%"/>
  <img src="docs/assets/xnow-autoplay.png" alt="X-Now video autoplay" width="32%"/>
  <img src="docs/assets/xnow-tray.png" alt="X-Now tray menu" width="32%"/>
</p>

> X-Now is not affiliated with, sponsored by, or maintained by X Corp. or Twitter, Inc. Use X and any downloader service according to their terms, local law, and the rights attached to the media.

---

## Download v2.5.0

Get the installer for your system from the **[v2.5.0 release page](https://github.com/benedictusrey/X-Now/releases/tag/v2.5.0)**. The file list and verification steps are in [docs/releases/X-Now_v2.5.0.md](docs/releases/X-Now_v2.5.0.md).

| System | File |
|---|---|
| **Windows 10/11, 64-bit** | `X-Now_2.5.0_windows_x64-setup.exe` (recommended) |
| Windows, no install | `X-Now_2.5.0_windows_x64-portable.exe` |
| Windows, MSI package | `X-Now_2.5.0_windows_x64_en-US.msi` |
| **macOS 11+** (Apple Silicon and Intel) | `X-Now_2.5.0_universal.dmg` |
| **Linux, most distributions** | `X-Now_2.5.0_amd64.AppImage` |
| Debian, Ubuntu | `X-Now_2.5.0_amd64.deb` |
| Fedora, RHEL, openSUSE | `X-Now_2.5.0_x86_64.rpm` |

Every release includes `SHA256SUMS.txt`. Check your download against it before you install. The packages are unsigned, so Windows SmartScreen and macOS Gatekeeper may show a warning.

---

## What changed: v2.5.0 vs v2.1.0

v2.1.0 is the last release before v2.5.0. The table compares the two.

| Area | v2.1.0 | v2.5.0 |
|---|---|---|
| **Settings** | Tray only: Always on top, Launch on Startup, zoom | A Settings sheet, opened from the X-Now button beside the logo or from the tray. Saved to `settings.json` |
| **Refresh** | Tray ▸ Window ▸ Refresh reloads the whole page: playing media stops and the scroll position is lost | Button beside the logo loads new posts in place. Playing media and scroll position stay |
| **Feed video sound** | Muted until you click a video, on every launch and reload | Unmuted while X-Now is focused (on by default). Turn it off to keep X's muted default |
| **Video volume** | Fixed: 20% for feed videos, 50% for opened videos | Same defaults, adjustable in Settings |
| **Quiet hours** | Not available | Off, Nights (23:00 to 07:00), or a custom window. Pauses and mutes video and blocks autoplay |
| **Saved media** | Saved to `Downloads\X-Now`, with no list | The last 50 saves are listed in Settings, each with *Show in folder* |
| **Google and Apple sign-in** | In-app popups. The app sometimes closed them too early, or never opened them | Popups are matched by exact host and close when sign-in completes. A blank popup closes after 15 s |
| **Minimize and hide** | Video pauses and the Windows audio session is muted | Same, and both are switchable (*Pause video*, *Mute sound*). X-Now's own audio session is no longer left muted in the foreground |
| **Scroll flashes and bleaching** | Video mount guard, theme-adaptive background, overlay and occlusion switches | Same switches. The mount guard also handles the stale frame of recycled video players, which closes the last known black-gap window |
| **Zoom** | Native zoom, reset on restart | Native zoom, saved and restored on launch |
| **Theme** | Background follows X's theme automatically | Also available in Settings › Display, which switches X's Background (Default or Lights out) |
| **Motion and layout** | Not available | Motion (System, Reduce, Full). Focus layout hides trends and promo cards in X's right column |
| **Tray** | Navigate, Window, View, Tools, How to | Adds a Settings submenu, Quiet hours, Refresh feed and Open saved media folder |
| **Autoplay** | WebView2 default policy | `--autoplay-policy=no-user-gesture-required` on every X-Now page, sign-in windows included. The unmute setting needs it |
| **Automated checks** | 22 Rust tests, 88 JavaScript assertions | 41 Rust tests, 94 + 80 JavaScript and UI assertions, and a 172-check live Settings suite on Windows |
| **Release build** | Starts on every `v*` tag push | Manual run only. A tag push does not start a build, because macOS minutes cost 10× Linux |
| **Packages** | Windows setup, MSI and portable; macOS universal DMG; Linux AppImage, deb and rpm | The same set, plus `SHA256SUMS.txt` |
| **Binary size** | 7.1 MB | 7.3 MB |

Also fixed in v2.5.0: the Task Manager icon was blank. The window now sets its large icon. Details are in the [v2.5.0 record](docs/releases/X-Now_v2.5.0-record.md).

**Known limits in v2.5.0:** packages are unsigned; the unmute setting relies on an autoplay switch that applies to every X-Now page; Focus layout depends on X's current page layout; there is no Windows ARM64 build.

---

## Features

- **Close to tray:** the ✕ button hides X-Now to the tray. Click the tray icon to bring it back.
- **Pause and mute when hidden:** video and audio pause, and sound mutes, when the window is minimized or hidden. Both are optional in Settings.
- **Tray menu:** Navigate, Window, View, Tools and How to submenus, zoom, always on top, launch on startup, and memory compaction.
- **Save media:** right-click an image or a video to save it to `Downloads\X-Now`.
- **External links:** clicking a link to another site opens it in your default browser.
- **Sign-in:** Google and Apple sign-in windows stay inside the app and close themselves after sign-in.
- **Settings:** see the table below.

---

## Settings

Open Settings with the X-Now button beside X's logo, or from the tray.

| Setting | Default | What it does |
|---|---|---|
| Hide to tray on close | On | ✕ hides the window to the tray |
| Keep on top | Off | Keeps the window above other windows |
| Start when you sign in | Off | Read-only in Settings. Change it from the tray menu |
| Pause video | On | Pauses video and audio while the window is hidden |
| Mute sound | On | Mutes sound while the window is hidden. On Windows, also mutes the app's audio session |
| Sleep the page | On | Lowers the page's memory use while hidden (Windows) |
| Schedule (Quiet hours) | Off | Off, Nights (23:00 to 07:00), or a custom window. Pauses and mutes video and blocks autoplay |
| Feed video volume | 20% | Volume for timeline videos |
| Opened video volume | 50% | Volume for opened videos |
| Unmute videos when X-Now is active | On | Unmutes feed and opened videos while X-Now is the focused window |
| Open Cobalt when a video can't be saved | On | Opens Cobalt when X exposes only a streamed video |
| Zoom | 100% | Page zoom from 50% to 300%. Kept after restart |
| Theme | Follows X | Switches X's Background between Default and Lights out |
| Motion | System | System, Reduce or Full |
| Focus layout | Off | Hides trends and promo cards in X's right column |
| Saved media | Last 50 | Lists recent saves, each with *Show in folder* |

---

## Quick Start

### Windows

1. Install the [Microsoft Edge WebView2 Runtime](https://developer.microsoft.com/en-us/microsoft-edge/webview2/) if it is missing.
2. Run the setup file, or run the portable file without installing.
3. Sign in on X's page inside the app. Your session stays on this computer, and you can reopen X-Now later without signing in again.

### macOS

1. Open the DMG and drag **X-Now** to Applications.
2. On first launch, right-click **X-Now** and choose **Open**. The build is unsigned.
3. Sign in on X's page inside the app.

### Linux

1. For the AppImage, run `chmod +x X-Now_2.5.0_amd64.AppImage`, then run it. For the `.deb` or `.rpm`, use your package installer.
2. You need the WebKitGTK 4.1 runtime. On Debian and Ubuntu, install `libwebkit2gtk-4.1-0`.
3. Sign in on X's page inside the app.

---

## Media and Audio

| Context | Sound | Notes |
|---|---|---|
| Feed videos | 20% volume. Unmuted while X-Now is focused, if *Unmute videos when X-Now is active* is on | Autoplays when visible; pauses when scrolled out of view. One video plays at a time |
| Opened videos | 50% volume | X's own mute and fullscreen controls stay in charge |
| Hidden or closed to tray | Video pauses and sound mutes, if the two switches are on | On Windows, the app's audio session is muted too |
| Restore | Resumes the video that was playing if it is still on screen. Otherwise the first video in view | Nothing plays off screen |

X-Now does not add its own player controls. Play, mute, fullscreen, captions and quality stay X's.

---

## Saving Media

- **Images:** right-click an image and choose **Save image**. X-Now saves the full-resolution original to `%USERPROFILE%\Downloads\X-Now`. On macOS and Linux, it uses the Downloads folder for your user.
- **Videos:** right-click a video and choose **Save video**. X-Now saves the clicked post's video as MP4 when X exposes it. When X exposes only a streamed link, X-Now copies the post link and opens [Cobalt](https://cobalt.tools/) in your browser, with `Downloads\X-Now` ready for the file.
- **Progress:** a card at the bottom-right shows the download, then **Saved ✓** with the folder, or the reason it failed.
- **History:** Settings lists the last 50 saves, each with *Show in folder*.

X-Now downloads only the media URLs that X's pages expose. It does not bypass X's access controls. Media rights belong to the author of the post.

---

## Privacy and Security

- No analytics, no telemetry and no account database. X-Now does not see your password.
- Your signed-in session stays in WebView2's profile on this computer.
- Settings and the saved-media list are stored in `%APPDATA%\com.xnow.desktop\settings.json`. Nothing is uploaded.
- X's page can call only a few native commands: open a link in the browser, save media bytes, prepare the download folder, download a media URL X already exposed, read and change Settings, and open the folder of a saved file. See [SECURITY.md](SECURITY.md).
- Keep these private: your WebView session data, the files in `Downloads\X-Now`, and any post URL you copy.

---

## Build and Test

Install [Node.js](https://nodejs.org/), [Rust](https://rustup.rs/), and run these from the repository root:

```sh
npm install                 # once: jsdom and playwright-core for the test harnesses
npm run test:all            # Rust tests, contract harness (94), UI harness (80)

cd src-tauri && cargo fmt --all -- --check && cargo check && cd ..
npx --yes @tauri-apps/cli@2.11.5 build --bundles nsis,msi   # add --no-bundle for the exe only
```

To keep build output outside the source tree on Windows, set `CARGO_TARGET_DIR` first:

```powershell
$env:CARGO_TARGET_DIR = 'C:\path\to\x-now-build-target'
npx --yes @tauri-apps/cli@2.11.5 build --bundles nsis,msi
```

The live Settings suite drives the built exe. It runs on Windows only with `npm run test:live`. It closes any running X-Now and restores `settings.json` at the end.

---

## Diagnostics

Each launch logs the WebView2 configuration:

```text
[X-Now] Launch config: webview_args="--disable-features=msWebOOUI,msPdfOOUI,msSmartScreenProtection,CalculateNativeWinOcclusion --disable-direct-composition-video-overlays --autoplay-policy=no-user-gesture-required" dark_background=true diagnostics=false
[X-Now] Native background synced to page theme: #ffffff
```

| Flag | Effect |
|---|---|
| *(none)* | Recommended. Background sync, occlusion fix, video-overlay fix and the autoplay switch |
| `--no-occlusion-fix` | Turns off only the occlusion fix |
| `--no-gpu-video-overlays-fix` | Turns off only the video-overlay fix. Use it if a black band appears |
| `--webview-default` | Stock WebView2 behavior, with no workarounds |
| `--webview-args "..."` | A full custom argument list. The WebView UI defaults are always kept |
| `--webview-diagnostics` | Logs WebView state at startup and on every hide and show |

`XNOW_WEBVIEW_ARGS` sets the same override for installed copies. The log goes to stderr, so run X-Now from a terminal to capture it, for example with `2> xnow.log`. A custom list replaces the defaults, so include the autoplay switch if you keep the unmute setting.

---

## Documentation

| Document | What you'll find |
|---|---|
| [docs/releases/X-Now_v2.5.0.md](docs/releases/X-Now_v2.5.0.md) | v2.5.0 downloads, what's new and known limits |
| [docs/releases/X-Now_v2.5.0-record.md](docs/releases/X-Now_v2.5.0-record.md) | Full v2.5.0 record: sign-in, audio, Settings, release workflow, verification |
| [RELEASE_NOTES.md](RELEASE_NOTES.md) | Short release notes for each version |
| [CHANGELOG.md](CHANGELOG.md) | Version history, one entry per release |
| [SECURITY.md](SECURITY.md) | Supported versions, security and privacy guarantees |
| [CONTRIBUTING.md](CONTRIBUTING.md) | Project layout, invariants, and the pull request steps |
| [docs/RELEASE_PIPELINE.md](docs/RELEASE_PIPELINE.md) | Release workflow, asset names and release steps |
| [docs/BUILD_AND_FIXES.md](docs/BUILD_AND_FIXES.md) | Rendering, window and audio fixes, with bisect flags. Read it before changing `lib.rs`, `tray.rs` or `frontend/x-tools.js` |
| [docs/GITHUB_DESKTOP_PUBLISHING.md](docs/GITHUB_DESKTOP_PUBLISHING.md) | Historical v2.1.0 publishing guide, kept for reference |
| [AGENTS.md](AGENTS.md) | Provenance, attribution rules and locked architectural pillars for AI agents |
| [AUTHORS.md](AUTHORS.md) | Authorship declaration and attribution policy |

---

## Author

X-Now is conceived, engineered, and maintained solely by  
**Benedictus Reynaldo Hartanto** ([@benedictusrey](https://github.com/benedictusrey))  
Repository: [https://github.com/benedictusrey/X-Now](https://github.com/benedictusrey/X-Now)

The project is independent of X Corp. and Twitter, Inc. Contributions and reproducible bug reports are welcome, as long as they do not include credentials, private session data or private downloaded media.
