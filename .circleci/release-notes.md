## 🐦 X-Now — v2.1.0

X, elevated. A lightweight **Rust + Tauri v2** desktop client — the official x.com, now with real OS superpowers. ~7 MB binary, no Electron.

### ✨ What's new in v2.1.0

- ✍️ **Composer & sidebar typography** — the "What's happening?" composer now types at **15px** and the sidebar menu (Home, Explore, …) reads at **17px** — including the "More" button and its flyout (page-level CSS overrides, no X settings touched).
- 🖱️ **Structured native tray menu with icons** — the tray right-click menu is grouped into **Show/Hide · Navigate ▸ · Window ▸ · View ▸ · Tools ▸ · How to ▸ · About · Quit** with native hover flyouts, and every clickable item carries a **16×16 icon glyph** — the same icon treatment as the classic v2.0.0 tray menu, in a compact layout.
- 🎨 **Redesigned About X-Now** — a sleeker card with the new brand icon, a feature grid (Save media / Tray controls / Quiet minimize / Links open out), and readable font sizes.
- 💠 **New X-Now branding everywhere** — the new icon set is applied on **all layers**: window/taskbar/task-manager icon, tray icon, the .exe launcher, and both installers.
- ⚔️ Full comparison vs X Web in the [README](https://github.com/benedictusrey/X-Now/blob/main/README.md).

### 📦 Downloads

| Platform | File |
|---|---|
| Windows 10 / 11 | `X-Now_*_x64-setup.exe` or `X-Now_*_x64_en-US.msi` |
| macOS (Apple Silicon) | `X-Now_*_aarch64.dmg` |
| macOS (Intel) | `X-Now_*_x64.dmg` |
| Linux (AppImage) | `X-Now_*_amd64.AppImage` |
| Linux (Debian/Ubuntu) | `X-Now_*_amd64.deb` |
| Linux (RPM) | `X-Now_*_x86_64.rpm` |

### 🚀 Getting started

> **Windows:** install [Edge WebView2](https://developer.microsoft.com/en-us/microsoft-edge/webview2/) if not already present (preinstalled on Windows 11), then run the installer.
>
> **macOS:** on first launch, right-click the app → **Open** to allow an unsigned build, then confirm in System Settings → Privacy & Security.
>
> **Linux:** the AppImage is self-contained — `chmod +x X-Now_*_amd64.AppImage && ./X-Now_*_amd64.AppImage`. For `.deb`/`.rpm`, install `libwebkit2gtk-4.1` first (`sudo apt install libwebkit2gtk-4.1-dev`); tray support on GNOME needs an appindicator extension.

### ✨ Highlights

- 🖥️ Native window + system tray with feed shortcuts (Home, Explore, Notifications, Messages, Bookmarks, Profile)
- 💾 Right-click images/videos → saved to `Downloads\X-Now` (full-resolution images; videos always from the clicked post, with bottom-right progress toasts); right-click links → opened in your default browser
- 📌 Always-on-top · 🔍 Zoom controls · 🧹 memory compaction · 🔎 dev tools · URL copy/open · 🚀 Launch on Startup
- 🔐 Signed-in session stays local — no analytics, no account database

*Authored and maintained with ❤️ by [@benedictusrey](https://github.com/benedictusrey)*
