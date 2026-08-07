<p align="center">
  <img src="icons/icon.png" alt="X-Now" width="120" height="120"/>
</p>

<h1 align="center">X-Now</h1>

<p align="center">
  <strong>A high-performance, cross-platform desktop client for <a href="https://x.com">X (Twitter)</a></strong><br/>
  Built with <a href="https://tauri.app">Tauri v2</a> + Rust · WebView2 · WebKit
</p>

<p align="center">
  <strong>🎉 X-NOW RELEASE: v2.0.0 IS NOW LIVE! 🎉</strong><br/>
  <em>After meticulous development, the latest official build of X-Now is ready for deployment.</em>
</p>

<p align="center">
  <strong>What's new in v2.0.0</strong><br/>
  <em>Close-to-tray &amp; pause-on-minimize · true Show/Hide tray toggle · launch-on-startup (hidden to tray) · Windows audio-session mute guarantee</em>
</p>

<p align="center">
  <img alt="Windows 10 and 11" src="https://img.shields.io/badge/platform-Windows%2010%20%7C%2011-4285f4?style=flat-square&logo=windows&logoColor=white">
  <img alt="macOS" src="https://img.shields.io/badge/platform-macOS-lightgrey?style=flat-square&logo=apple&logoColor=black">
  <img alt="Linux" src="https://img.shields.io/badge/platform-Linux-FCC624?style=flat-square&logo=linux&logoColor=black">
  <img alt="Rust and Tauri 2" src="https://img.shields.io/badge/built%20with-Rust%20%2B%20Tauri%202-24C8DB?style=flat-square&logo=tauri&logoColor=white">
  <img alt="WebView2" src="https://img.shields.io/badge/rendering-WebView2%20%2F%20WebKit-0078D4?style=flat-square&logo=microsoftedge&logoColor=white">
  <img alt="Version 2.0.0" src="https://img.shields.io/badge/version-2.0.0-1D9BF0?style=flat-square">
  <a href="https://github.com/benedictusrey"><img src="https://img.shields.io/badge/author-%40benedictusrey-black?style=flat-square&logo=github"/></a>
</p>

---

## 🚀 Welcome to the Future of X on Desktop

**X-Now** isn't just a wrapper — it's a meticulously engineered native desktop client that supercharges your X experience. Designed for speed, aesthetics, and power users, X-Now seamlessly bridges the gap between the X web and your operating system.

> X-Now is not affiliated with, sponsored by, or maintained by X Corp. or Twitter, Inc. Use X and any downloader service according to their terms, local law, and the rights attached to the media.

### ✨ At a glance

| | |
|---|---|
| 🪟 **Close-to-tray** | The ✕ button hides the app to the tray — media pauses instantly, one click brings it back |
| 🔇 **Guaranteed pause on minimize** | Page pause + OS-level audio-session mute + a Rust watchdog: no background audio, ever |
| 🖱️ **Tray command center** | Feed shortcuts, zoom, always-on-top, memory compaction, launch-on-startup |
| 💾 **One-click media saving** | Right-click images (full resolution) and videos — straight to `Downloads\X-Now` |
| 🔗 **Links go where they belong** | One click on any outside link → your default browser opens it |
| 🔐 **Seamless in-app login** | Google & Apple sign-in popups handled inside the app, auto-closed after login |
| ⚡ **Feather-light** | A single ≈7 MB binary — no Electron, no Node, no bloat |

### 🌟 Why Choose X-Now?

#### 1. Unrivaled Performance & Efficiency
Say goodbye to the heavy memory usage of standard web browsers. Built entirely on Rust and Tauri v2, X-Now is designed to be incredibly lightweight. It actively manages background resources, meaning your computer stays blazing fast and responsive — even during endless scrolling sessions. Your X feed, delivered at native speed.

<p align="center">
  <img src="docs/assets/xnow-performance.jpg" alt="Performance capabilities of X-Now" width="100%"/>
</p>

#### 2. Immersive & Distraction-Free Aesthetics
X-Now strips away the browser clutter to give you a pure, edge-to-edge experience with native styling. Videos are optimized to play smoothly as you scroll — pausing instantly when out of view to protect your RAM. The result: a cinematic, browser-free timeline session.

<p align="center">
  <img src="docs/assets/xnow-autoplay.jpg" alt="X-Now immersive video autoplay" width="100%"/>
</p>

#### 3. Deep Operating System Integration
Why open a browser tab when you can command everything from your taskbar? X-Now lives in your OS like a true native application. Close it and it keeps living in your system tray; minimize it and the audio stops — guaranteed. Right-click images and videos to save them natively to `Downloads\X-Now`, or pin the window above everything with one tray toggle.

<p align="center">
  <img src="docs/assets/xnow-tray.jpg" alt="X-Now system tray integration" width="100%"/>
</p>

---

## ⚔️ X-Now vs X Native Web

Same X, same account, same feed — but the *wrapper around it* is where the desktop magic lives. X-Now keeps the official X experience and adds the OS integration a browser tab can't offer:

| Capability | 🐦 X-Now v2.0.0 | 🌐 X Web (browser tab) |
|---|---|---|
| **Window & tray presence** | Dedicated native window + system-tray icon with feed shortcuts | One tab among dozens, no app identity |
| **Close button** | Closes to the tray — app keeps running, media pauses instantly | Closes the tab and the whole browser stays heavy |
| **Minimize** | Video audio stops the moment the window hides (page + OS audio-session mute, double-guaranteed) | Tab keeps playing audio in the background |
| **Launch on startup** | Optional — starts hidden to the tray, ready when you are | Must re-open the browser and the tab |
| **Saving images** | Right-click image → saved at **full resolution** to `Downloads\X-Now` in one action, with a bottom-right "Saved ✓" toast | Browser right-click menu — often blocked by the site |
| **Saving videos** | Right-click video → **the clicked post's video** downloads directly as MP4 when X exposes it; otherwise the post link is copied and [Cobalt](https://cobalt.tools/) opens with `Downloads\X-Now` pre-created — never a wrong video | Manual copy/paste between tabs |
| **External links** | One click on any outside link — your default browser opens it as the system handler | New tabs pile up |
| **Login** | Google & Apple sign-in popups open inside the app — the OAuth token relay stays intact, and the popup closes itself after login | Popup-blockers and tab juggling |
| **Titlebar** | Shows `X-Now (@yourhandle)` once signed in | Browser tab title only |
| **About & identity** | In-app About card with the X-Now icon and the author's credit — no window hop | No equivalent |
| **Always on top** | One tray toggle pins the window above everything | Not possible |
| **Memory footprint** | One lean WebView2 process (≈7 MB binary, no Electron) | A full browser engine + every extension |

> **Bottom line:** X-Now is not a different X — it is the *desktop experience* X should have had. Same content, same login, zero learning curve; every superpower lives outside the page, where the browser can't reach.

---

## Quick Start

### Use the Release Builds

We provide cross-platform builds for **Windows, macOS, and Linux** through GitHub Actions. Head to the [Releases](https://github.com/benedictusrey/X-Now/releases) page to download the latest version for your system.

| Platform | Installer | Notes |
|---|---|---|
| **Windows 10/11** | `.exe` (NSIS) or `.msi` (WiX) | Requires Edge WebView2 Runtime |
| **macOS** | `.dmg` (Apple Silicon + Intel) | Requires macOS 10.15+ |
| **Linux** | `.AppImage` / `.deb` / `.rpm` | Requires libwebkit2gtk-4.1 |

### Windows

1. Install the [Microsoft Edge WebView2 Runtime](https://developer.microsoft.com/en-us/microsoft-edge/webview2/) if not already present.
2. Run `X-Now_2.0.0_x64-setup.exe` (or the `.msi` variant).
3. Sign in through the official X page shown inside the app.
4. Reopen **X-Now** later to resume your existing session automatically.
5. Use the system-tray icon for navigation, media saving, and app controls.

The login session is stored by the WebView2 application data folder on the local machine. X-Now does not implement a secondary profile manager — X's own account-switching UI handles multiple signed-in accounts.

### macOS

1. Open the downloaded `.dmg` and drag **X-Now** to your Applications folder.
2. On first launch, right-click and choose **Open** to bypass Gatekeeper (unsigned build).
3. Sign in through the X page that appears inside the app.

### Linux

1. Make the AppImage executable: `chmod +x X-Now_2.0.0_amd64.AppImage`
2. Run it: `./X-Now_2.0.0_amd64.AppImage`
3. Sign in through the X page inside the app.

> **Tip:** On some Linux distributions you may need `libwebkit2gtk-4.1` installed: `sudo apt install libwebkit2gtk-4.1-dev`

---

## Media & Audio Behaviour

| Context | Default audio | Behaviour |
|---|---:|---|
| Feed videos (timeline, autoplaying) | Muted, following X's own rule | Autoplay when 50% visible; pause instantly when scrolled out of view — one video at a time |
| Lightbox / standalone video page | 50% after your first interaction | Unmuted once you click into the media; X's own mute and fullscreen controls stay the authority |
| Minimize / close-to-tray | — | Every video and audio element pauses instantly; Windows also mutes the app's OS audio sessions as a hard guarantee |
| Restore | — | Playback resumes only for media that is still on screen — exactly what X's engine would autoplay anyway |

X-Now never adds duplicate player chrome: play, mute, fullscreen, captions and quality stay X's own controls.

---

## Saving & Opening Media

Right-click any image or video and choose the save action. A notification card slides in at the **bottom-right corner**: a spinner while the download runs, then **"Saved ✓"** with the folder — or a red card with the reason if it fails. Downloads are completely silent (no console window, ever).

### Images

Right-click any image in your feed and choose **Save image**. X-Now resolves the best direct URL and saves the **full-resolution original** (the `name=orig` variant) to the folder below, creating it when needed:

```text
%USERPROFILE%\Downloads\X-Now
```

*(On macOS and Linux, the equivalent user Downloads folder is used.)*

Source resolution order: full-resolution variants → the element's own URL → the post page's `og:image` → loaded CDN resources — with both a native (curl) downloader and a CORS-safe in-page fetch as delivery paths.

### Videos

Right-click any video and choose **Save video**. X-Now always targets the **clicked post's video**:

1. **Direct MP4 save** — the video's own URL, or the post page's video URLs (`og:video` / `twitter:player:stream` / embedded JSON), or resources pinned to the video via its poster's media ID. Saved straight to `Downloads\X-Now`, no Cobalt round-trip.
2. **Cobalt hand-off** (only when X hides the direct URL behind a streamed `blob:`) — the post link is copied, `Downloads\X-Now` is pre-created, and [Cobalt](https://cobalt.tools/?u=<post-link>) opens in your default browser with the link pre-filled; choose the format there and save into the prepared folder.

The same hand-off is one tray click away: **Open Cobalt video downloader**.

> X-Now downloads X's own CDN URLs exactly as the page exposes them — it does not bypass X access controls, and media rights belong to the post's author.

### Default Browser

- **Click any external link** (a link pointing outside x.com, including `t.co` redirects) — X-Now hands it to your default browser, which opens it automatically as the system handler. X's own links (posts, profiles, notifications) stay in-app.
- Right-click a link and choose **Open link in default browser** for the same hand-off on demand.
- The native Tauri shell validates every destination as an HTTP(S) URL before opening.

---

## Requirements

- **Windows** 10/11 (64-bit) with [Edge WebView2 Runtime](https://developer.microsoft.com/en-us/microsoft-edge/webview2/), **macOS** 10.15+, or **Linux** (x64/arm64).
- Internet access to load X and any external link.
- A signed-in X session for account-specific content.

---

## Build from Source

Install [Node.js](https://nodejs.org/), [Rust](https://rustup.rs/), and the [Tauri 2 CLI](https://tauri.app/start/), then run the checks from the repository root:

```sh
node --check frontend/x-tools.js

cd src-tauri
cargo fmt --all -- --check
cargo check
cargo tauri build --ci
```

To keep build products outside the source tree on Windows:

```powershell
$env:CARGO_TARGET_DIR = 'C:\path\to\x-now-build-target'
cargo tauri build --ci --no-sign
```

---

## Privacy & Security Notes

X-Now does not add analytics or a remote account database. X page traffic is handled by X's service natively inside WebView2/WebKit. The local session data stays on the local computer. The native bridge exposes only the narrow actions required for: opening safe external URLs, saving media bytes, preparing the download folder, and downloading a media URL that X has already exposed.

Treat the following as private:

- WebView session data and your signed-in account state.
- Downloaded media in `Downloads\X-Now`.
- Any copied X post URL.

The README showcase images are synthetic mockups and contain no actual user account data.

---

## Verification Checklist (Release Review)

The repository checks validate JavaScript syntax, Rust formatting, Rust dependency compilation, and package generation. They do not replace a manual signed-in WebView check because X can update its DOM and media delivery at any time. For a release review, verify in this order:

1. Open Home, Explore, and a post's lightbox — confirm no blank or frozen views.
2. Play a video in the timeline, then scroll it out of view — it must pause.
3. Minimize the window with a video playing — audio must stop; restore — it must resume on screen.
4. Close (✕) — the app must stay in the tray; tray click must restore it.
5. Test right-click saving for an image and a video; confirm output in `Downloads\X-Now` (video may hand off to Cobalt when X exposes only a streamed URL).
6. Test external-link routing: click a `t.co` link in a post — it must open in the default browser; X's own links must stay in-app.

---

## 📚 Documentation

| Document | What you'll find |
|---|---|
| [RELEASE_NOTES.md](RELEASE_NOTES.md) | What's new in v2.0.0 — everything changed since v1.1.0, platform by platform |
| [CHANGELOG.md](CHANGELOG.md) | Full version history, one entry per release |
| [SECURITY.md](SECURITY.md) | Supported versions, security & privacy guarantees |
| [CONTRIBUTING.md](CONTRIBUTING.md) | Build from source on Windows, macOS & Linux; how to contribute |

---

## Author

X-Now is crafted and maintained by  
[@benedictusrey](https://github.com/benedictusrey)

The project is intentionally independent from X Corp. and Twitter, Inc. Contributions and reproducible bug reports are welcome — provided they do not include credentials, private session data, or private downloaded media.
