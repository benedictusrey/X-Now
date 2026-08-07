# 🚀 Release Notes — X-Now 2.0.0

<p align="center">
  <img src="icons/icon.png" width="96" height="96" alt="X-Now Icon"><br>
  <strong>X-Now v2.0.0 — The Desktop-First Milestone</strong><br>
  <em>Everything since v1.1.0, wrapped into the X desktop experience it should have been.</em>
</p>

---

🎉 **X-Now 2.0.0** turns the app from *a window around X* into a true desktop citizen: close it and it keeps living in your tray; minimize it and the audio stops — guaranteed; launch it with Windows/macOS/Linux and it's ready hidden in the background. Same official X, dramatically better wrapping.

---

## ✨ What's New in 2.0.0

### 🖱️ Tray, minimize & audio — the desktop superpowers
- **Close-to-tray.** The ✕ button no longer kills the app — the window hides to the system tray and **media pauses instantly**. The app keeps running, your session stays signed in, and one tray click brings it back.
- **True pause on minimize.** Video audio stops the moment the window hides, through a **three-layer guarantee**: page-side pause, a Windows **OS-level audio-session mute** (even if the page misbehaves), and a watchdog that re-checks the real window state every 800 ms. Restore resumes exactly where you left off — at the same 50% volume — following X's own rules (only on-screen media is resumed, never stale off-screen elements).
- **Show / Hide tray toggle.** The tray icon and the new **"Show / Hide X-Now"** menu item restore the app whenever it is minimized, hidden, or unfocused — and hide it (pausing first) only when it's visible and focused.
- **🚀 Launch on Startup.** New tray toggle. When started by the OS it launches **hidden to the tray** — no window popping over your work.
- **Stale-silence fix.** Windows can persist an old audio-session mute across restarts; a startup watchdog clears it automatically, so a fresh launch is never mysteriously silent (verified with an OS audio peak meter).

### 💾 One-click media saving
- Right-click any **image** and save it straight to `Downloads\X-Now` — the best direct URL is resolved automatically (element source → loaded CDN resources → the post page's own `og:image`).
- Right-click any **video** — X-Now tries a direct MP4 save from X's own CDN first; when X only exposes a streamed `blob:` URL, it falls back to the proven IG-Now hand-off: post link copied, `Downloads\X-Now` pre-created, and [Cobalt](https://cobalt.tools/) opened with the link pre-filled. The same hand-off is one tray click away (**Open Cobalt video downloader**).

### 🔗 Links go where they belong
- **Click any external link** (outside x.com, including `t.co` redirects) — X-Now hands it to your default browser, which opens it automatically as the system handler. X's own posts, profiles and notifications stay in-app.

### 🎨 Seamless in-app About
- Tray → **About X-Now** now opens a polished overlay **inside the X window** — the real X-Now app icon, live version, and a **"Built with ❤️ by @benedictusrey"** credit — no separate window hop.

### 🔐 Seamless in-app login
- Google & Apple sign-in popups are managed **inside the app** (dark-styled OAuth windows that auto-close the moment the token relays back to x.com) — the `postMessage` login flow never breaks, unlike a browser hand-off.

### 🖥️ Titlebar with your handle
- Once you sign in, the native titlebar reads **X-Now (@yourhandle)** — detected from X's own profile tab, no account data stored.

### 📦 Platform coverage
- Release pipeline builds installers for **Windows (.exe/.msi), macOS (.dmg, Intel + Apple Silicon)** and **Linux (.AppImage/.deb/.rpm)** — each platform gets its own native installer, built in its own CI job (no universal installer).

---

## 🛤️ Everything Changed Since v1.1.0

| Area | v1.1.0 (baseline) | v2.0.0 |
|---|---|---|
| Close button | Closed the window (app kept running only in tray) | **Closes to tray** with instant media pause |
| Minimize | Audio could keep playing in the background | **Guaranteed pause** (page + OS audio-session mute + watchdog) |
| Tray icon click | Only opened/launched X | **Smart toggle** — restore when hidden/minimized, hide when focused |
| Tray menu | No Show/Hide, no autostart | **Show / Hide X-Now** + **🚀 Launch on Startup** |
| Startup | Always opened a window | Optional **hidden-to-tray** launch via autostart |
| About | Separate small window | **In-page overlay** with X branding |
| Media | Browser right-click only | **Right-click save** to `Downloads\X-Now` — images direct, videos direct MP4 or Cobalt hand-off |
| Audio reliability | Relied on page behavior | **OS-level session mute** + stale-mute cleanup + on-screen resume rules |
| Source layout | `src-tauri` not in the repo (builds broke on fresh clones) | **Full Rust backend committed** — anyone can build; CI is green |
| Docs | README only | README + Release Notes + Changelog + Security + Contributing, with per-platform guides |

---

## 🖥️ Platform Notes

### Windows 10 / 11
- Installers: `X-Now_2.0.0_x64-setup.exe` (NSIS) or `X-Now_2.0.0_x64_en-US.msi` (WiX).
- Requires the [Microsoft Edge WebView2 Runtime](https://developer.microsoft.com/en-us/microsoft-edge/webview2/) (preinstalled on Windows 11).
- Close-to-tray, OS-level audio muting, and Launch-on-Startup are all fully supported.

### macOS (Apple Silicon + Intel)
- Installers: `X-Now_2.0.0_aarch64.dmg` and `X-Now_2.0.0_x64.dmg`.
- Requires macOS 10.15 or newer.
- First launch of an unsigned build: **right-click the app → Open** (Gatekeeper bypass), then confirm in System Settings → Privacy & Security.
- Close-to-tray, tray menu, and Launch-on-Startup (LaunchAgent) are fully supported.

### Linux (x64)
- Packages: `X-Now_2.0.0_amd64.AppImage` (self-contained), plus `.deb` and `.rpm` variants.
- The AppImage needs no installation: `chmod +x X-Now_2.0.0_amd64.AppImage && ./X-Now_2.0.0_amd64.AppImage`.
- For `.deb`/`.rpm`: install `libwebkit2gtk-4.1` first (`sudo apt install libwebkit2gtk-4.1-dev` on Debian/Ubuntu).
- Tray integration requires a system tray/appindicator extension on GNOME.

---

## ⚔️ Why Desktop, Not a Tab?

See the full [X-Now v2.0.0 vs X Web comparison](README.md#-xnow-v200-vs-x-web) — tray presence, guaranteed silence on minimize, one-click media saving, always-on-top, a titlebar that knows your handle, and a ~7 MB binary instead of a full browser.

---

*Authored and maintained with ❤️ by [@benedictusrey](https://github.com/benedictusrey)*
