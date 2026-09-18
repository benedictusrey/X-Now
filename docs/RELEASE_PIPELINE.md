# X-Now v2.1.0 Release Pipeline: GitHub Actions Guide

This repository uses GitHub Actions (`.github/workflows/release.yml`) for automated, cross-platform release builds. The workflow builds native packages across Windows, macOS, and Linux in parallel, verifies integrity with SHA-256 manifests, and publishes a draft GitHub Release.

## Build Matrix

| Job | Runner | Output Package | Notes |
|---|---|---|---|
| `build-windows` | `windows-latest` | NSIS `.exe`, WiX `.msi`, Portable `.exe` | Windows 10/11 x64, requires WebView2 |
| `build-macos` | `macos-14` | Universal `.dmg` (`arm64` + `x86_64`) | Single universal installer for Apple Silicon and Intel |
| `build-linux` | `ubuntu-22.04` | `.AppImage`, `.deb`, `.rpm` | Linux x64, requires WebKitGTK 4.1 |
| `publish` | `ubuntu-22.04` | Draft GitHub Release + `SHA256SUMS.txt` | Downloads, verifies, and packages all release assets |

### Efficient Universal Packaging
Building macOS as a **single universal `.dmg`** on `macos-14` builds both Apple Silicon (`arm64`) and Intel (`x86_64`) slices and bundles them into one DMG using `lipo`. This cuts expensive macOS GitHub Actions runner minutes in half while guaranteeing zero compromise on speed or compatibility for any Mac user.

## Local Verification Before Releasing

Before triggering a release workflow, always verify locally:

1. **Rust unit tests**:
   ```bash
   cd src-tauri && cargo test --lib
   ```
   All 22 unit tests must pass.
2. **JavaScript contract harness**:
   ```bash
   npm test
   ```
   All 88 assertions in `scripts/verify-xnow-helpers.js` must pass.
3. **Icon synchronization**:
   Verify `icons/` and `src-tauri/icons/` match byte-for-byte.
4. **Version alignment**:
   Verify version `2.1.0` is consistent across `src-tauri/Cargo.toml`, `src-tauri/Cargo.lock`, `src-tauri/tauri.conf.json`, and `package.json`.

## Triggering the Release

### Option A: Via Git Tag (Recommended)
Push a semantic version tag:
```bash
git tag v2.1.0
git push origin v2.1.0
```
GitHub Actions will detect the `v*` tag and trigger the complete release workflow.

### Option B: Via GitHub Actions UI (`workflow_dispatch`)
1. Open your repository on GitHub: `https://github.com/benedictusrey/X-Now`.
2. Navigate to **Actions** → **Release**.
3. Click **Run workflow**.
4. Specify:
   - **Application version**: `2.1.0`
   - **GitHub Release tag**: `v2.1.0`
   - **Create draft GitHub Release**: `true`
5. Click **Run workflow**.

## Release Artifacts

When all build jobs succeed, the `publish` job assembles the draft release with the following assets:

```text
├── X-Now_2.1.0_windows_x64-setup.exe   # Windows NSIS installer
├── X-Now_2.1.0_windows_x64_en-US.msi   # Windows WiX MSI installer
├── X-Now_2.1.0_windows_x64-portable.exe# Windows portable standalone binary
├── X-Now_2.1.0_universal.dmg           # macOS universal DMG (arm64 + x86_64)
├── X-Now_2.1.0_amd64.AppImage          # Linux standalone AppImage
├── X-Now_2.1.0_amd64.deb               # Debian / Ubuntu package
├── X-Now_2.1.0_x86_64.rpm              # Fedora / RHEL / openSUSE package
├── SHA256SUMS.txt                      # Flat SHA-256 manifest
└── checksums.sha256                    # Checksum verification file
```

## Verifying Downloaded Packages

### Windows (PowerShell)
```powershell
Get-FileHash .\X-Now_2.1.0_windows_x64-setup.exe -Algorithm SHA256
```

### Linux / macOS (Terminal)
```bash
sha256sum -c SHA256SUMS.txt
# Or on macOS:
shasum -a 256 -c SHA256SUMS.txt
```

---

Authored and maintained by [@benedictusrey](https://github.com/benedictusrey).
