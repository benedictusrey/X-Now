<h1 align="center">
  <img src="https://raw.githubusercontent.com/benedictusrey/X-Now/main/assets/readme_banner.png" alt="X-Now Banner" width="100%">
</h1>

<h4 align="center">A lightning-fast, aesthetically pleasing desktop experience for X (Twitter).</h4>

<p align="center">
  <a href="#features">Features</a> •
  <a href="#installation">Installation</a> •
  <a href="#building-from-source">Building</a> •
  <a href="#support--feedback">Support</a>
</p>

---

Welcome to **X-Now**, a highly optimized wrapper for X (formerly Twitter) built to provide a focused and highly performant desktop experience. Created solely by **@benedictusrey**, this app is designed to deliver all your feed updates and notifications directly to your desktop without any overhead.

> 🛠️ **Current Release**: v1.1.0
> 🚀 **Author**: [Benedictus Rey (@benedictusrey)](https://github.com/benedictusrey)

## ✨ Features

- **Blazing Fast Performance**: Built heavily on Tauri (Rust) to ensure minimal memory footprint and instant startup times.
- **Native OS Checkmarks**: Seamless integration with system-level UI components on your tray menu.
- **True Mute Functionality**: Injectable JavaScript explicitly hooks and blocks audio elements so you can mute in peace.
- **Dedicated Desktop Shortcuts**: Get to your home feed, direct messages, bookmarks, and notifications instantly via the system tray.
- **Stay on Top**: Keep the application hovering over your work with a seamless "Always on Top" toggle.
- **Auto Start**: Automatically launch X-Now when your computer turns on.
- **Compact Caching Engine**: An integrated Rust SQLite caching engine to clean up data traces on demand.

## 📦 Installation

To install X-Now on your Windows PC:

1. Head over to our [Releases](https://github.com/benedictusrey/X-Now/releases) page.
2. Download the latest `X-Now_v1.1.0.exe` or `X-Now_1.1.0_x64-setup.exe` (NSIS installer).
3. Run the installer or standalone executable. 
4. Sign in to your X account and start posting!

### macOS & Linux
See the Releases page for `.dmg`, `.app`, `.deb`, and AppImage files automatically built by our GitHub Actions pipeline.

## 🛠️ Building from source

If you want to compile X-Now yourself, you'll need the latest Rust toolchain and Node.js.

```bash
# 1. Clone the repository
git clone https://github.com/benedictusrey/X-Now.git
cd X-Now/src-tauri

# 2. Build the app
cargo tauri build
```

The resulting binaries will be placed in `src-tauri/target/release/`.

## 📜 License

MIT © 2026 [@benedictusrey](https://github.com/benedictusrey)

See [LICENSE](LICENSE) for details.

---

## 👤 Author

**[@benedictusrey](https://github.com/benedictusrey)** — Author & Sole Creator of X-Now

> X-Now is an independent project and is not affiliated with, endorsed by, or connected to X Corp. or Twitter, Inc.
