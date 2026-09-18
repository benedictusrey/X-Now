## 📝 Description

<!-- Provide a brief, clear summary of what this Pull Request changes and the problem it resolves. -->

## 🎯 Type of Change

- [ ] 🐛 **Bug fix** (non-breaking change resolving a reported issue or rendering glitch)
- [ ] ✨ **New feature** (non-breaking change adding desktop functionality or tray shortcut)
- [ ] 🎨 **UI / Styling refinement** (improving typography, contrast, or tray menu layout)
- [ ] ⚡ **Performance / Memory optimization** (reducing CPU wakeups, memory compaction, or watchdog tuning)
- [ ] 🐧 **Platform compatibility** (improving Linux distribution support or macOS window behavior)
- [ ] 📖 **Documentation update** (clarifying guides, fixing typos, or adding platform notes)
- [ ] 🔧 **CI / Build tooling** (workflow improvements, dependency updates, or test harnesses)

## 💻 Platforms Tested

- [ ] Windows 10 / 11 (x64)
- [ ] macOS Apple Silicon (`arm64`)
- [ ] macOS Intel (`x86_64`)
- [ ] Linux (Ubuntu / Debian `.deb` / AppImage)
- [ ] Linux (Fedora / RHEL `.rpm` / Arch)

## ✅ Quality & Verification Checklist

Before submitting your Pull Request, please confirm the following:

- [ ] Code strictly follows existing project architectural rules (`CONTRIBUTING.md` & `docs/BUILD_AND_FIXES.md`).
- [ ] `cd src-tauri && cargo test --lib` passes with all 22 tests green.
- [ ] `node scripts/verify-xnow-helpers.js` passes with all 88 assertions green.
- [ ] `cd src-tauri && cargo fmt --all -- --check` passes cleanly.
- [ ] `cd src-tauri && cargo check` reports no new warnings or errors.
- [ ] Windows audio dependencies remain target-gated under `[target.'cfg(windows)'.dependencies]`.
- [ ] Any changed icons were synchronized between `icons/` and `src-tauri/icons/`.
- [ ] No private session data, authentication cookies, API keys, or personal media are included.

## 📸 Screenshots or Screen Recordings (If Applicable)

<!-- If this PR modifies visual styling, tray menus, or rendering behavior, please attach before/after screenshots or clips. Ensure any account handles or personal content are redacted. -->

---

X-Now is authored and maintained solely by [@benedictusrey](https://github.com/benedictusrey). Accepted contributions are credited through Git commit history while project stewardship remains with the maintainer.
