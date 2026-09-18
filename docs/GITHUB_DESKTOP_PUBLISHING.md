# Publishing X-Now v2.1.0 — Complete GitHub Desktop Guide

X-Now is authored and maintained solely by [@benedictusrey](https://github.com/benedictusrey).

This is the definitive, step-by-step guide for publishing the complete, verified release of **X-Now v2.1.0** to [`https://github.com/benedictusrey/X-Now`](https://github.com/benedictusrey/X-Now) using **GitHub Desktop**.

---

## 0. Quick Metadata Reference

Use these exact strings when updating your GitHub repository settings and commit messages:

| Field | Recommended Value |
| :--- | :--- |
| **Repository Name** | `X-Now` |
| **Description** | `A high-performance, lightweight cross-platform desktop client for X (Twitter) built with Tauri v2 and Rust. Features a structured native tray, media saving, theme-adaptive background, and zero Electron bloat.` |
| **Website URL** | `https://github.com/benedictusrey/X-Now` |
| **Topics / Tags** | `tauri`, `tauri-v2`, `rust`, `x`, `twitter`, `desktop-app`, `webview2`, `webkit`, `cross-platform`, `windows`, `macos`, `linux`, `performance` |
| **Release Tag** | `v2.1.0` |
| **Release Title** | `X-Now v2.1.0 — Readable Typography, Structured Native Tray, & Rendering Stability` |
| **Local Folder** | `C:\Users\Benedictus\Desktop\X-Now` |
| **Default Branch** | `main` |

---

## 1. Setting Up the Repository Details on GitHub

Before pushing your commit, configure your repository's public profile on GitHub:

1. Open your browser and navigate to [https://github.com/benedictusrey/X-Now](https://github.com/benedictusrey/X-Now).
2. In the right-hand sidebar under the **About** section, click the gear icon (⚙️) next to "About".
3. **Description:** Copy and paste:
   ```text
   A high-performance, lightweight cross-platform desktop client for X (Twitter) built with Tauri v2 and Rust. Features a structured native tray, media saving, theme-adaptive background, and zero Electron bloat.
   ```
4. **Website:** Set to:
   ```text
   https://github.com/benedictusrey/X-Now
   ```
5. **Topics:** Add the following tags for discovery:
   `tauri`, `tauri-v2`, `rust`, `x`, `twitter`, `desktop-app`, `webview2`, `webkit`, `cross-platform`, `windows`, `macos`, `linux`, `performance`
6. Check **Releases** and **Packages** under "Include in the home page".
7. Click **Save changes**.

---

## 2. Publishing via GitHub Desktop (Step-by-Step)

### Step 1: Open X-Now in GitHub Desktop

1. Launch **GitHub Desktop** (installed on your system).
2. Click **Current Repository** in the top-left toolbar.
3. Select **X-Now** from your list of repositories.
   - *If X-Now is not in the list*: Click **File** → **Add Local Repository...** (or press `Ctrl + O`), browse to `C:\Users\Benedictus\Desktop\X-Now`, and click **Add repository**.
4. Confirm that the **Current Branch** indicates `main`.

---

### Step 2: Review Changes in the Left Panel

In the left-hand **Changes** tab, you will see the updated and new files ready to commit:

- `.github/workflows/release.yml` (The new automated cross-platform release pipeline for Linux, macOS universal, and Windows)
- `.github/PULL_REQUEST_TEMPLATE.md` (Welcoming, structured template for community contributions)
- `README.md` (Refined documentation with the full v2.1.0 vs v2.0.0 comparison matrix and quick start)
- `CONTRIBUTING.md` (Comprehensive, welcoming guide for open-source contributors)
- `RELEASE_NOTES.md` & `CHANGELOG.md` (Updated release notes reflecting GitHub Releases)
- `docs/RELEASE_PIPELINE.md` & `docs/BUILD_AND_FIXES.md` (Complete engineering references)
- `docs/GITHUB_DESKTOP_PUBLISHING.md` (This guide)
- `icons/icon.icns` & `src-tauri/icons/icon.icns` (Regenerated high-definition multi-resolution macOS ICNS)
- `src-tauri/` (All verified rendering fixes: video mount guard, XNOWBG theme-sync, DirectComposition decoupling, native zoom)

> 🔒 **Privacy Confirmation:** Notice that `backup/` (including `backup/0_Personal/`), `.freebuff/`, and `src-tauri/target/` do **not** appear in GitHub Desktop. They are strictly ignored by `.gitignore` and safely kept on your local machine.

---

### Step 3: Enter the Commit Message

At the bottom of the left-hand panel in GitHub Desktop, enter the following commit message:

#### Summary (Title):
```text
X-Now v2.1.0 — Public Release: Rendering Stability, Native Tray, Typography & Cross-Platform Pipeline
```

#### Description:
```text
- Video mount guard: eliminates black player gaps during feed scrolling
- Theme-adaptive native background (XNOWBG): synchronizes WebView2 background to page theme
- DirectComposition overlays decoupled & occlusion tracking suppressed: fixes detached black bands and bleached screens
- Event-driven watchdog condvar wakeups & idle route polling: cuts idle wakeups by ~6x
- Curated typography: 15px composer text and 17px sidebar/flyouts
- Structured native tray menu with 16x16 icon glyphs and native set_zoom (100%-300%)
- Full HD branding suite across tray (32px), window (48px), installers, and multi-res macOS ICNS
- Unified GitHub Actions release workflow (.github/workflows/release.yml) building Windows (NSIS/MSI/portable), Linux (AppImage/DEB/RPM), and macOS universal DMG
- Welcoming community contribution guide and PR template
- Personal development logs and agent databases archived safely in backup/0_Personal/
```

---

### Step 4: Commit and Push to GitHub

1. Click the blue **Commit to main** button.
2. In the top toolbar, click **Push origin** (or press `Ctrl + P`).
3. GitHub Desktop will transfer your commit to `https://github.com/benedictusrey/X-Now`.

---

## 3. Triggering the Automated Release Build

Once your commit is pushed to GitHub, you can publish the official **v2.1.0** release using GitHub Actions.

### Option A: Push the Semantic Release Tag (Recommended)

In any terminal (PowerShell, Command Prompt, or Git Bash) inside `C:\Users\Benedictus\Desktop\X-Now`:

```bash
git tag v2.1.0
git push origin v2.1.0
```

GitHub Actions will immediately detect the `v2.1.0` tag and start:
- **`build-linux`**: Compiling the `.AppImage`, `.deb`, and `.rpm` packages on Ubuntu 22.04.
- **`build-macos`**: Compiling the universal `.dmg` (Apple Silicon + Intel) on macOS 14.
- **`build-windows`**: Compiling the NSIS installer, WiX MSI, and portable executable on Windows.
- **`publish`**: Packaging all assets, computing `SHA256SUMS.txt`, and publishing a draft release at `https://github.com/benedictusrey/X-Now/releases`.

### Option B: Trigger via GitHub Actions UI (`workflow_dispatch`)

1. Go to [https://github.com/benedictusrey/X-Now/actions](https://github.com/benedictusrey/X-Now/actions).
2. Click **Release** in the left workflow list.
3. Click the **Run workflow** dropdown on the right:
   - **Application version**: `2.1.0`
   - **GitHub Release tag**: `v2.1.0`
   - **Create draft GitHub Release**: Checked (`true`)
4. Click **Run workflow**.

---

## 4. Reviewing and Publishing the Release

1. Once the workflow turns green, navigate to [https://github.com/benedictusrey/X-Now/releases](https://github.com/benedictusrey/X-Now/releases).
2. You will see a newly drafted release titled **X-Now 2.1.0** with all platform packages and `SHA256SUMS.txt` attached.
3. Review the description and release notes.
4. Click **Edit** → **Publish release** to make it live to the world! 🚀

---

Authored and maintained by [@benedictusrey](https://github.com/benedictusrey).
