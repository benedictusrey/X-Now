# 🚀 X-Now Release Pipeline — Deploy Guide

X-Now ships installer packages for **Windows, macOS and Linux**. The workflow
is:

1. **GitHub Actions** builds **Windows** installers (`.exe` + `.msi`) and
   macOS + Linux installers automatically when a `v*` tag is pushed, creating
   a **draft GitHub release** (same procedure as v2.0.0).
2. **CircleCI** (optional) builds **Linux** (`.AppImage`/`.deb`/`.rpm`) and
   **macOS** (`.dmg` ×2) installers **for manual download** — you download the
   files and attach them to the GitHub release yourself.

---

## Part 1 — One-time CircleCI setup

1. Open <https://app.circleci.com> → **Sign Up** → **Continue with GitHub** →
   click the green **Authorize** button.
2. Left sidebar → **Projects** → find **X-Now** → **Set Up Project** → choose
   the **main** branch → **Set Up Project**.
3. Nothing else is required — this config does **not** need a GitHub token or
   any environment variables (it never touches GitHub; it only builds).

> **Note:** Linux builds run on CircleCI's free Docker plan. **macOS builds
> require a paid CircleCI plan** that includes macOS runners — if you're on
> the free plan, the `build-macos` job will fail. You don't need macOS from
> CircleCI though: **GitHub Actions already builds the `.dmg` files for free**,
> so the macOS installers come from the Actions run.

---

## Part 2 — Trigger the CircleCI build & download the installers

1. <https://app.circleci.com> → **Projects** → **X-Now** → **Trigger Pipeline**
   (blue button, top right).
2. **Branch:** `main`.
3. **Parameters → `release-tag`:** type `v2.1.0` (any non-empty value turns the
   build on; it is only a switch and is *not* pushed to GitHub).
4. **Trigger Pipeline** → the `release` workflow runs two jobs in parallel:
   `build-linux` and `build-macos`. First run takes ~10–20 min (Rust deps +
   Tauri CLI install).
5. When a job turns green, open it → **Artifacts** tab → download the files:
   - `build-linux` → `linux-appimage/*.AppImage`, `linux-deb/*.deb`,
     `linux-rpm/*.rpm`
   - `build-macos` → `macos-arm64-dmg/*.dmg`, `macos-x64-dmg/*.dmg`

---

## Part 3 — Publish on GitHub

1. The **GitHub Actions** run (triggered by the `v2.1.0` tag push) creates a
   **draft release** at <https://github.com/benedictusrey/X-Now/releases> with
   the Windows installers (and its own macOS/Linux copies) attached.
2. Open the draft **"X-Now v2.1.0"** → **Edit** → in **Assets**, click the
   **upload icon** (or drag & drop) and add the installers you downloaded from
   CircleCI (Linux `.AppImage`/`.deb`/`.rpm` and both `.dmg` files).
3. Double-check all 11 assets are listed, then **Publish release**.

---

## Future releases (v2.2.0 and beyond)

```bash
# 1. Bump the version in src-tauri/tauri.conf.json AND src-tauri/Cargo.toml
#    (keep both in sync) + update CHANGELOG.md / RELEASE_NOTES.md

# 2. Commit & push
git add -A
git commit -m "X-Now v2.2.0 — <what changed>"
git push origin main

# 3. Tag & push -> GitHub Actions builds everything and drafts the release
git tag -a v2.2.0 -m "X-Now v2.2.0"
git push origin v2.2.0

# 4. (optional) Rebuild Linux/macOS on CircleCI for manual download
#    -> Trigger Pipeline with release-tag: v2.2.0

# 5. Publish the draft release on GitHub (Part 3)
```

---

## Troubleshooting

| Symptom | Fix |
|---|---|
| `build-macos` fails with "no such resource class" | macOS runners need a paid CircleCI plan — use the `.dmg` files from the GitHub Actions run instead |
| `build-linux` fails on webkit2gtk | The job installs `libwebkit2gtk-4.1-dev`; check the apt step output for network errors |
| No jobs run after triggering | The `release-tag` parameter was left empty — type a value like `v2.1.0` |
| Pipeline says "success" but built nothing | Same cause: parameter empty → nothing runs (by design) |

*Maintained by [@benedictusrey](https://github.com/benedictusrey)*
