# Contributing to X-Now

Thank you for your interest in X-Now! This document explains how to set up your development environment and contribute.

> **Author & Sole Creator**: [@benedictusrey](https://github.com/benedictusrey)

---

## 🏗 Development Setup

### 1. Prerequisites

| Tool | Version | Notes |
|---|---|---|
| **Rust** | ≥ 1.75 stable | Install via [rustup.rs](https://rustup.rs) |
| **Visual Studio Build Tools** | 2019+ | Required for MSVC on Windows |
| **WebView2 Runtime** | Latest | Pre-installed on Windows 11; download from Microsoft if needed |
| **Git** | Any | [git-scm.com](https://git-scm.com) |

### 2. Clone & Build

```bash
git clone https://github.com/benedictusrey/x-now.git
cd x-now/src-tauri

# Verify toolchain
rustup show
cargo --version

# Development build (fast, debug symbols included)
cargo tauri dev

# Production build (optimized, ~9 MB)
cargo tauri build
```

### 3. Project Structure

```
src-tauri/src/
├── lib.rs          ← Main app setup, window, OAuth, autoplay, titlebar
├── main.rs         ← Binary entry point
├── tray.rs         ← System tray menu (22 items)
├── commands/
│   ├── auth.rs     ← Authentication commands
│   ├── tweets.rs   ← Tweet commands
│   ├── users.rs    ← User commands
│   ├── search.rs   ← Search commands
│   └── notifications.rs
├── models/         ← Serde data models
├── state.rs        ← App state (SQLite + Moka cache)
├── db.rs           ← SQLite database helpers
└── error.rs        ← Custom error types
```

---

## 🐛 Bug Reports

Please open a GitHub Issue with:

1. **X-Now version** (see About dialog in tray)
2. **Windows version** (`winver` in Run dialog)
3. **Steps to reproduce**
4. **Expected behavior**
5. **Actual behavior** (include any error messages)
6. **Screenshots** if applicable

---

## 💡 Feature Requests

Open a GitHub Issue with the label `enhancement`. Describe:
- The use case / problem it solves
- The proposed solution
- Any alternatives considered

---

## 📐 Code Style

- Rust: follow `rustfmt` defaults (`cargo fmt`)
- Clippy: `cargo clippy -- -D warnings`
- Commits: use [Conventional Commits](https://www.conventionalcommits.org/) style

```
feat: add keyboard shortcut for compose
fix: popup not closing after Apple login
docs: update README with new tray options
chore: bump tauri to v2.12
```

---

## 🔒 Security Issues

Do **not** open public issues for security vulnerabilities. See [SECURITY.md](SECURITY.md) for responsible disclosure instructions.

---

## 📄 License

By contributing, you agree that your contributions will be licensed under the MIT License.
