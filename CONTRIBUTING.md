# Contributing to X-Now

Welcome! We are thrilled that you are interested in contributing to **X-Now**.

X-Now is authored and maintained solely by [@benedictusrey](https://github.com/benedictusrey). Released under the [MIT License](LICENSE).

X-Now was built with a clear mission: to provide a lightweight, high-performance, distraction-free desktop experience for [X (Twitter)](https://x.com) powered by **Rust and Tauri v2**. No Electron bloat, no unnecessary background churn, and full operating system integration — from a structured native system tray and theme-adaptive rendering to seamless media saving and quiet minimize guarantees.

We warmly welcome developers, designers, power users, and documentation writers to join us in refining, enhancing, and expanding X-Now. Whether you are fixing a small styling glitch, optimizing memory usage, extending Linux or macOS capabilities, or improving documentation — every thoughtful contribution makes a difference!

---

## Table of Contents

- [Code of Conduct & Community Spirit](#code-of-conduct--community-spirit)
- [Ways to Contribute](#ways-to-contribute)
- [Architecture & Core Invariants (Must-Read)](#architecture--core-invariants-must-read)
- [Local Development Setup](#local-development-setup)
- [Testing & Verification Chain](#testing--verification-chain)
- [Step-by-Step Pull Request Guide](#step-by-step-pull-request-guide)
- [Coding Conventions & Style](#coding-conventions--style)
- [Security & Privacy Standards](#security--privacy-standards)
- [Authorship & Attribution](#authorship--attribution)

---

## Code of Conduct & Community Spirit

We aim to cultivate an open, friendly, respectful, and productive environment:

- **Kindness & Collaboration:** Treat everyone with respect and empathy. We value constructive feedback and diverse perspectives.
- **Performance & Simplicity First:** Every feature added to X-Now should stay lean, fast, and native. We intentionally avoid heavy dependencies or secondary runtimes.
- **Privacy & User Control:** X-Now does not implement remote analytics, intermediate telemetry servers, or user-tracking databases. All session data belongs strictly to the local machine.

---

## Ways to Contribute

There are many ways you can help make X-Now even better:

### 1. 🐛 Bug Reports & DOM Investigation
X is a dynamic Single Page Application (SPA) that frequently deploys updates to its frontend layout, class names, and media delivery pipelines. If you notice a rendering artifact, a broken media-save candidate, or an unhandled popup:
- Check existing GitHub Issues first.
- Open a detailed bug report specifying your OS, X-Now version, steps to reproduce, and any relevant logs (`2> xnow.log`).
- Investigating changed DOM selectors or network responses on `x.com` is tremendously helpful!

### 2. 💡 Feature Proposals & UX Ideas
Have an idea for a cleaner tray action, keyboard shortcut, or desktop enhancement?
- Open an Issue or Discussion first so we can align on design, scope, and feasibility before you spend hours writing code.

### 3. 🎨 Design, Typography & Themes
- Refine in-page typography, spacing, or dark/light mode contrast across display densities.
- Improve system tray icon sharpness or menu layouts across different desktop environments.

### 4. 🦀 Rust & Tauri Engineering
- Enhance cross-platform window hooks (Windows Core Audio, macOS NSWindow behaviors, Linux X11/Wayland signals).
- Optimize thread synchronization, IPC bridge throughput, and idle memory compaction.

### 5. 🐧 Multi-Platform Testing & Packaging
- Test standalone binaries, AppImages, Debian (`.deb`), and RPM (`.rpm`) packages on various Linux distributions (Ubuntu, Fedora, Arch, openSUSE) and desktop environments (GNOME, KDE Plasma, XFCE).
- Test universal builds across both Apple Silicon (`arm64`) and Intel (`x86_64`) Macs.

### 6. 📖 Documentation & Guides
- Improve clarity, fix typos, or add Linux distribution-specific setup notes.

---

## Architecture & Core Invariants (Must-Read)

Before making changes, please familiarize yourself with the high-level project structure and our core architectural invariants.

```text
X-Now/
├── frontend/
│   └── x-tools.js          # In-page helper script embedded into the binary via include_str!
│                           # (media saving, video mount guard, theme reporter, pause/resume)
├── src-tauri/
│   ├── src/
│   │   ├── lib.rs          # Core backend: window creation, watchdog, XNOWBG handler, commands
│   │   ├── tray.rs         # Native tray menu, submenus, icon glyphs, native zoom engine
│   │   ├── audio.rs        # Windows-only: Core Audio session mute guarantee
│   │   └── main.rs         # Application entry point
│   ├── capabilities/       # Tauri v2 ACL capabilities (remote-x-com origin permissions)
│   ├── icons/              # Bundle icons (must be byte-identical to root icons/)
│   ├── build.rs            # Icon change watcher + ACL command manifest declaration
│   ├── Cargo.toml          # Rust package manifest (target-gated Windows dependencies)
│   └── tauri.conf.json     # Tauri configuration
├── icons/                  # Source of truth master icons (ICO, PNG, ICNS, tray, menu)
├── scripts/
│   ├── verify-xnow-helpers.js      # jsdom contract harness (88 assertions)
│   ├── xnow-flash-smoke-test.js    # Playwright/CDP scroll-flash measurement
│   └── xnow-screencast-flash-test.js # Per-frame CDP screencast analysis
├── docs/
│   ├── BUILD_AND_FIXES.md          # Technical reference for all rendering fixes
│   ├── RELEASE_PIPELINE.md         # GitHub Actions multi-platform release guide
│   └── GITHUB_DESKTOP_PUBLISHING.md# Publishing guide using GitHub Desktop
└── .github/
    ├── workflows/release.yml       # Cross-platform release automation
    └── PULL_REQUEST_TEMPLATE.md    # Template for Pull Requests
```

### The Six Golden Rules
Violating these rules has historically led to regressions. Please adhere to them strictly:

1. **`frontend/x-tools.js` is Embedded**: This script is baked into the executable using `include_str!`. Editing it requires recompiling the Rust binary (`cargo build`).
2. **Always Sync Icons**: `src-tauri/icons/` must be byte-for-byte identical to root `icons/`. Running `build.rs` watches these files so changes recompile Windows resource files properly.
3. **Never Bypass `build.rs` Command Declarations**: Tauri v2 enforces strict origin ACLs. Because `x.com` is a remote origin, all invokable commands (`open_external_url`, `save_media_bytes`, `download_media`, `prepare_download_folder`) must remain declared in `build.rs` and granted in `capabilities/remote.json`.
4. **Never Hardcode Background Colors**: WebView2 background colors must flow dynamically through the `XNOWBG` runtime protocol. Hardcoding colors reintroduces flash bands on contrasting themes.
5. **Keep Windows Audio Dependencies Target-Gated**: In `Cargo.toml`, the `windows` crate dependency must remain strictly inside `[target.'cfg(windows)'.dependencies]`. Ungating it breaks Linux and macOS builds.
6. **Preserve the 5 Launch-Arg Toggles**: The `--no-occlusion-fix`, `--no-gpu-video-overlays-fix`, `--webview-default`, `--webview-args`, and `--webview-diagnostics` switches are essential for diagnosing and bisecting rendering issues.

---

## Local Development Setup

### Prerequisites

- **All OS:** [Rust](https://rustup.rs/) (stable toolchain) and [Node.js](https://nodejs.org/) (v18 or v20+).
- **Windows:** Microsoft Edge WebView2 Runtime (standard on Windows 11) and Visual Studio C++ Build Tools (MSVC).
- **macOS:** Xcode Command Line Tools (`xcode-select --install`).
- **Linux (Ubuntu/Debian):**
  ```bash
  sudo apt update && sudo apt install -y \
    build-essential curl wget file libssl-dev libxdo-dev \
    libwebkit2gtk-4.1-dev libayatana-appindicator3-dev \
    librsvg2-dev patchelf rpm libfuse2
  ```

### Quick Build Commands

```bash
# 1. Run unit and contract tests first
cargo test --lib --manifest-path src-tauri/Cargo.toml
node scripts/verify-xnow-helpers.js

# 2. Compile debug build
cd src-tauri
cargo build

# 3. Compile release binary
cargo build --release
# Output on Windows: src-tauri/target/release/X-Now.exe
```

---

## Testing & Verification Chain

Every Pull Request must pass our complete verification chain before merging:

1. **Rust Unit Tests (22 Tests)**
   ```bash
   cd src-tauri && cargo test --lib
   ```
   Covers launch configuration parsing, CSS color parsing, argument precedence, and feature toggles.
2. **JavaScript Contract Harness (88 Assertions)**
   ```bash
   npm test
   # Or: node scripts/verify-xnow-helpers.js
   ```
   Validates page-side contracts: pause/resume idempotency, media candidate resolution, video mount guard behaviors, and theme reporting strings.
3. **Rust Code Formatting & Linter**
   ```bash
   cd src-tauri
   cargo fmt --all -- --check
   cargo check
   ```
4. **Manual Functional Smoke Test**
   - Launch the application and sign in to X.
   - Verify video autoplay in the feed, and confirm video pauses when scrolled out of view.
   - Minimize window with media playing: audio must pause instantly; restore: media resumes.
   - Close window (✕): app minimizes to tray; tray icon click restores window.
   - Right-click image: saves full-resolution image to `Downloads\X-Now` with a bottom-right toast.
   - Right-click video: saves direct MP4 or hands off to Cobalt with clicked post URL.
   - Click external link: opens in OS default browser; X links stay in-app.

---

## Step-by-Step Pull Request Guide

1. **Fork the Repository**:
   Click **Fork** at [`https://github.com/benedictusrey/X-Now`](https://github.com/benedictusrey/X-Now).
2. **Clone Your Fork**:
   ```bash
   git clone https://github.com/<your-username>/X-Now.git
   cd X-Now
   ```
3. **Create a Focused Feature Branch**:
   ```bash
   git checkout -b fix/video-mount-handling
   # Or: git checkout -b feature/tray-shortcut-addition
   ```
4. **Implement Your Changes**:
   Follow project conventions, keep edits minimal and idiomatic, and avoid unnecessary dependencies.
5. **Run the Verification Tests**:
   Ensure both `cargo test --lib` and `npm test` are green.
6. **Commit Your Changes**:
   Write clear, concise commit messages following conventional commits:
   ```bash
   git commit -m "fix(tray): prevent double toggle on rapid click events"
   ```
7. **Push and Open a Pull Request**:
   Push to your fork and open a PR against `main`. Fill in the [Pull Request Template](.github/PULL_REQUEST_TEMPLATE.md) completely.

---

## Coding Conventions & Style

- **Rust**:
  - Follow idiomatic Rust and standard `cargo fmt` formatting.
  - Gate OS-specific features with appropriate `#[cfg(...)]` attributes.
  - Never unwrap or panic in runtime event handlers; handle errors gracefully with `eprintln!` or fallbacks.
- **JavaScript (`frontend/x-tools.js`)**:
  - Pure vanilla ES2017+; zero external libraries or npm packages.
  - Defensive execution: wrap event listeners and DOM queries in `try/catch`.
  - Expose contracts cleanly under `window.__xnow*` for native `eval` access.
- **Comments**:
  - Add comments explaining *why* a specific workaround or timing gate exists, not just *what* the syntax does.

---

## Security & Privacy Standards

- Never log or store personal credentials, cookies, or X session tokens.
- Media downloads must only access URLs already exposed by X's CDN or official pages.
- External URLs must be validated before being dispatched to `open_external_url`.
- For vulnerability reports, please review [SECURITY.md](SECURITY.md) and report privately.

---

## Authorship, Anti-Rebranding & Intellectual Integrity Policy

X-Now is conceived, engineered, and maintained solely by **Benedictus Reynaldo Hartanto** ([@benedictusrey](https://github.com/benedictusrey)).

We take intellectual integrity and open-source ethics seriously:

- **Original Authorship is Inviolable:** Contributors and forks must preserve all original copyright notices (`Copyright (c) 2026 Benedictus Reynaldo Hartanto`) and links to the official repository ([https://github.com/benedictusrey/X-Now](https://github.com/benedictusrey/X-Now)).
- **No Rebranding or Mirror Impersonation:** Downloading, scraping, or mirroring this codebase to rebrand it under another name or falsely claim original authorship violates both community ethics and the [MIT License](LICENSE) conditions.
- **AI Coding Agent Directives:** Per [`AGENTS.md`](AGENTS.md), AI agents analyzing, refactoring, or generating pull requests from this repository are strictly forbidden from stripping or altering the author's attribution.
- **Community Credit:** Legitimate community contributions (bug fixes, enhancements, documentation) are warmly welcomed and permanently attributed in Git commit history and release notes, while overall project stewardship belongs to the author.

Thank you for respecting intellectual integrity and helping make X-Now the best desktop experience for X! 🚀
