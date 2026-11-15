# X-Now Release Pipeline (GitHub Actions)

This is the current release process. It builds one universal installer per platform, verifies every file, and creates a **draft** GitHub Release for you to review and publish.

The workflow is [`.github/workflows/release.yml`](../.github/workflows/release.yml).

## When it runs

**Manual only.** Start it from **Actions → Release → Run workflow**. A tag push does not start a build. This keeps the macOS runner (billed at 10× Linux minutes) from running by accident.

## Inputs

| Input | Example | Meaning |
|---|---|---|
| `release_tag` | `v2.5.0` | The release tag. It must equal the version in every manifest (see below). |
| `publish_release` | `true` | `true` creates a **draft** GitHub Release with the verified assets. `false` only builds and keeps the artifacts. |

Run it on the branch that holds the release commit (normally `main`, or the release branch before it is merged).

## Jobs

| Job | Runner | Output | Notes |
|---|---|---|---|
| `version` | `ubuntu-22.04` | none (outputs the version and the notes path) | Stops the run early if anything disagrees. |
| `build-windows` | `windows-latest` | NSIS setup `.exe`, WiX `.msi`, portable `.exe` | Windows 10/11 x64. Requires WebView2. |
| `build-macos` | `macos-14` | Universal `.dmg` (`arm64` + `x86_64`) | One DMG for Apple Silicon and Intel. `lipo` checks both slices. |
| `build-linux` | `ubuntu-22.04` | `.AppImage`, `.deb`, `.rpm` | x64. The AppImage runs on most distributions without installing. |
| `publish` | `ubuntu-22.04` | Draft GitHub Release and `SHA256SUMS.txt` | Runs only when `publish_release` is `true`. |

The three build jobs run in parallel after `version` passes.

## What `version` checks

The run stops before any build unless all of these match `release_tag` (without the `v`):

- `src-tauri/tauri.conf.json` → `version`
- `package.json` → `version`
- `src-tauri/Cargo.toml` → `version`
- `src-tauri/Cargo.lock` → the `x-now` package `version`

It also requires:

- `release_tag` to look like `vX.Y.Z`.
- The release notes file `docs/releases/X-Now_vX.Y.Z.md` to exist. It becomes the body of the GitHub Release.

## Pinned tooling

- Tauri CLI: `TAURI_CLI_VERSION` in the workflow (`2.11.5`), matching the `tauri` crate in `Cargo.lock`. Change both together.
- Rust: stable toolchain, with `swatinem/rust-cache`.
- Node.js 22 (only to install the Tauri CLI).

## Before you start a release

Run these locally and fix anything that fails:

```bash
cd src-tauri && cargo fmt --all -- --check && cargo check && cargo test --lib
cd .. && npm run test:js && npm run test:ui
```

Also confirm that `icons/` and `src-tauri/icons/` are identical. Every build job checks this byte for byte and fails if they differ.

Commit the release (notes, manifests, icons, `checksums.txt`), push it, and then start the workflow. Do not tag before the draft release is verified (see the last section).

## Release assets

When every job succeeds, `publish` attaches these files to the draft release. Names use the version from `release_tag`, shown here for `2.5.0`:

```text
X-Now_2.5.0_windows_x64-setup.exe       Windows NSIS installer
X-Now_2.5.0_windows_x64_en-US.msi       Windows MSI installer
X-Now_2.5.0_windows_x64-portable.exe    Windows standalone program, no install
X-Now_2.5.0_universal.dmg               macOS universal DMG (arm64 + x86_64)
X-Now_2.5.0_amd64.AppImage              Linux AppImage (most distributions)
X-Now_2.5.0_amd64.deb                   Debian and Ubuntu package
X-Now_2.5.0_x86_64.rpm                  Fedora, RHEL and openSUSE package
SHA256SUMS.txt                          SHA-256 for all seven files above
```

`SHA256SUMS.txt` is written and checked with `sha256sum -c` before the release is created. The job stops if any expected file is missing.

## Verifying a download

Windows (PowerShell):

```powershell
Get-FileHash .\X-Now_2.5.0_windows_x64-setup.exe -Algorithm SHA256
```

Linux and macOS (terminal):

```bash
sha256sum -c SHA256SUMS.txt
# macOS:
shasum -a 256 -c SHA256SUMS.txt
```

Compare the printed hash with `SHA256SUMS.txt`, or let the checker print `OK` for each file.

## After the run

1. Open **Releases** on the repository. The draft **X-Now 2.5.0** has the assets and the notes from `docs/releases/X-Now_v2.5.0.md`.
2. Check the notes and the asset list.
3. Publish the release yourself. Publishing is a manual step.
4. Only after that, create the tag if the release needs one. Pushing a `v*` tag does **not** start this workflow.

## Costs

macOS runner minutes are billed at 10× Linux minutes. One full run uses one macOS job. Keep `publish_release` as `true` only when the run is meant to create the draft.

## Not included

- Windows ARM64 builds.
- Code signing and notarization. Packages are unsigned, so Windows SmartScreen and macOS Gatekeeper can warn.

---

Authored and maintained by [@benedictusrey](https://github.com/benedictusrey).
