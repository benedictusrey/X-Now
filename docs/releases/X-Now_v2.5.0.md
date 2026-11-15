# X-Now v2.5.0 — Release Notes and Implementation Record

**Released:** 2026-11-16 · **Compared with:** v2.1.0 (the last published tag)
**Author:** Benedictus Reynaldo Hartanto ([@benedictusrey](https://github.com/benedictusrey))

This file is the full record of v2.5.0: what changed, why, how each part is built, what was verified and what was not. The short user-facing summary is in [`RELEASE_NOTES.md`](../../RELEASE_NOTES.md); the version-by-version list is in [`CHANGELOG.md`](../../CHANGELOG.md).

---

## 1. Summary

v2.5.0 adds a Settings panel, two controls beside X's logo, and Quiet hours. It fixes three problems that were reported or found during this release cycle:

1. **Sign-in windows** for Google and Apple were closed by the app too early, or never opened. Google sign-in now works end to end (confirmed by the maintainer on Windows). Apple's sign-in window opens and closes correctly.
2. **Video sound was silent** while X-Now was in the foreground, because Windows kept X-Now's own audio session muted. The mute logic was rewritten.
3. **Black flashes and bleached windows** while scrolling and during video playback. These were fixed in the rendering pass (previously listed under "Unreleased").

The release also rewrites the release workflow so that one manual run produces one universal installer per platform.

---

## 2. What's new for users

- **Settings panel.** Opens from the **X-Now** button beside X's logo, or from the tray. A sheet slides out from the rail with these sections:
  - **Window:** hide to tray on close, keep on top.
  - **Minimized:** pause video, mute, sleep the page.
  - **Quiet hours:** Off, Nights (23:00–07:00), or a custom window.
  - **Media:** feed and opened-video volumes (defaults unchanged: 20% and 50%), saved-media history.
  - **Display:** zoom (stored, so it survives restarts), Motion (System, Reduce, Full), Focus layout, and the theme (Light or Dark, switched through X's own Display page without reloading X-Now).
  - Every value is saved to `settings.json` in the app data folder.
- **Refresh** beside the logo loads new posts in place, using X's own "Show N posts" pill and Home tab. Playing media and the scroll position survive. It falls back to a full reload only if X's Home link is missing.
- **Quiet hours.** While active, the page pauses and mutes video and blocks autoplay.
- **Saved media history.** The last 50 saves are listed, each with a **Show in folder** button.
- **Focus layout.** Hides trends and promo cards in X's right column, where the column matches X's current layout. If X changes that markup, the setting does nothing until it is updated.
- **Tray Settings submenu.** Every setting above with checkmarks kept in step with the panel, plus Quiet hours, Refresh feed and Open saved media folder. Tray menus were regrouped (Settings, Navigate, Tools, View, Help).
- **About card** is redesigned: live status tiles and a feature grid, with a focus trap and keyboard support.
- **Overlays use X's own palette** (black, dim or light, matched to the page theme).
- **Motion.** Toasts fade out, the context menu and About card animate in, and every overlay control has a keyboard focus ring. The Settings Motion choice and the Windows reduced-motion preference are both honored.

---

## 3. Sign-in (Google, Apple, X login)

### 3.1 What X's login page offers

Checked read-only on the live login page in the app (no clicks on the account pages, no credentials entered):

- **Continue with Google:** rendered by Google Identity Services in an iframe (`accounts.google.com/gsi/button`).
- **Continue with Apple:** a script button.
- **Phone and email/username** fields, and X's own password flow.
- **No Microsoft button** appears on X's login page, so Microsoft sign-in is not offered by X at this time.

### 3.2 How sign-in windows work now

The popup manager lives in [`src-tauri/src/lib.rs`](../../src-tauri/src/lib.rs). Every page that asks to open a new window goes through `classify_new_window(url)`, which returns one of four results:

| Result | When | What happens |
|---|---|---|
| `SignIn` | `about:blank`, or `https` on `accounts.google.com`, `appleid.apple.com`, `idmsa.apple.com`, `login.microsoftonline.com`, `login.live.com` | A managed popup labeled `popup-N` opens. It shares X's profile, so the token relay back to the opener works. |
| `MainWindow` | X's own `/i/flow/*`, `/login`, `/i/oauth*` pages on x.com or twitter.com | The page loads in the main window. As a popup, X's login closed itself on the x.com hop. |
| `External` | Any other site (including look-alikes such as `pineapple.com`, `accounts.google.com.example.net`, or `/author/` paths) | Opens in the OS default browser. Failures are logged. |
| `Allow` | Other X pages (for example `/intent/...`, `/home`) | WebView2 opens them as usual. |

Matching is on whole host names only. Earlier code matched substrings such as "apple", "google" or "auth" anywhere in the URL, which sent ordinary links into sign-in popups.

**Closing sign-in popups.** The popup closes when the sign-in completes, through one of two paths:

- The popup navigates to x.com after the provider redirects back. The navigation handler closes it and reloads the main window.
- The provider's script never navigates back (Google Identity Services can leave its window open). In that case the page reports the sign-in state through the window title, and Rust closes the popup.

The page reports:

- `XNOW:<handle>` when the signed-in profile link appears.
- `XNOWOUT:` when the link has been absent for 5 seconds (signed out).

Rust keeps a three-state session (`Unknown`, `Out`, `In`). Only a change from `Out` to `In` closes the sign-in popups. A reload while signed in, or a popup opened while signed in, leaves them open. `Unknown` means the first report after launch, so a popup opened during page load is never mistaken for a completed sign-in.

**Blank windows.** `window.open()` with no address opens as a sign-in popup, because sign-in scripts open a blank window first and then navigate it. A blank popup that nothing navigates closes itself after 15 seconds.

**Failures are logged.** A popup that fails to build, and an OS-browser open that fails, now write a line to the app log.

### 3.3 Verification status

| Method | Status | Evidence |
|---|---|---|
| **Google** | ✅ Works. Sign-in completes, the popup closes automatically, and the page lands on X. | Confirmed by the maintainer on Windows in the release build. |
| **Apple** | ✅ Sign-in window opens as a managed popup and stays open. | Automated click on the login page, final build. The redirect back to x.com (close and reload) is code-verified, not run end to end (no account used). |
| **X's login page in the main window** | ✅ Verified. Loads X's login flow in the main window. | Automated probe on the final build. |
| **Reload while a sign-in popup is open** | ✅ Popup stays open. | Automated probe, old build closed it, final build keeps it. |
| **Sign-out then sign-in via a popup** | ✅ Popup closes when the sign-in completes. | Automated probe: profile link hidden 9 s, popup opened, link restored, popup closed. |
| **Blank window** | ✅ Opens, closes after 15 s if nothing loads. | Automated probe. |
| **Password login** | ⬜ Not verified here. | Needs an account. Checklist in §9. |
| **Passkey / security key** | ⬜ Not verified here. | Needs an account and a physical key. Checklist in §9. |
| **Two-factor code screen** | ⬜ Not verified here. | Needs an account. Checklist in §9. |
| **Microsoft** | — Not offered on X's login page. | DOM read of the login page. |

---

## 4. Video sound (Windows audio session)

### 4.1 Root cause

Windows keeps a **per-application mute**. When X-Now muted its own audio session while hidden, that mute stayed with the app. The next session started muted, and the old visible-state logic treated it as "not ours" and left it muted. The Volume Mixer showed X-Now's session muted while the Edge WebView2 session stayed at 100.

### 4.2 Fix

[`src-tauri/src/audio.rs`](../../src-tauri/src/audio.rs) now uses one pure decision function, `decide(mode, transition, is_new, muted)`, with three modes:

- **Hidden:** mute the app's audio sessions and record which ones were muted.
- **Visible:** after a hidden-to-visible transition, clear every mute in the app's process tree. A session that appears muted while visible is unmuted. A mute set by the user while the window stays visible is respected.
- **Release (quit):** unmute only the sessions X-Now muted, and remove the marker file.

A marker file, `audio-muted.flag`, is written while sessions are muted. If the app crashes while hidden, the next launch treats the marker as a hidden state and clears the mute on the first visible sync.

The stale-window timer from the previous version was removed.

### 4.3 Verification

- Unit tests in `audio.rs` cover the decision table: hidden mutes audible sessions and keeps muted ones; the first visible sync after hiding clears every mute; a new muted session is cleared while visible; a mute set while visible is respected; release lifts only X-Now's mutes.
- Live test on Windows in an earlier round: the reproduced mute was cleared on restore, and the log line `Audio session found: muted=…` was checked at startup.
- Not changed: X's own video mute. Feed videos still start muted under X's autoplay rule; the user unmutes them with X's speaker icon.

---

## 5. Rendering fixes (the former "Unreleased" section)

These shipped in v2.5.0 because they are new since v2.1.0.

- **Black flashes while scrolling.** DirectComposition video overlay planes detached during scroll. Video overlays are disabled with `--disable-direct-composition-video-overlays` (bisect switch: `--no-gpu-video-overlays-fix`).
- **Theme-adaptive native background.** The page reports its real background as `XNOWBG:r,g,b`, and the native WebView2 background follows it at runtime. The launch background is dark, then theme-adaptive.
- **Bleached/white screen.** Chromium's native occlusion tracker is disabled for X-Now's webview (`CalculateNativeWinOcclusion`).
- **Video mount guard.** A freshly mounted or source-swapped `<video>` stays hidden until its first frame decodes, so the black player chrome never shows. Contract-tested through `window.__xnowVideoMountGuard`.
- **Zoom.** Uses the webview engine's native `set_zoom` (100–300%, tracked in Rust) instead of a CSS zoom hack.
- **Icons.** The bundle icons are byte-identical to the root `icons/` set, and `build.rs` watches them.
- **Idle-aware timers.** The page poll adapts (1 s active, 5 s idle, 15 s deep idle, 30 s hidden), and the Rust watchdog is event-driven, with a 5 s fallback poll while hidden.
- **Per-launch workaround toggles.** `--no-occlusion-fix`, `--no-gpu-video-overlays-fix`, `--webview-default` and `--webview-args "..."` (or `XNOW_WEBVIEW_ARGS`) change the rendering workarounds without rebuilding. `--webview-diagnostics` logs the webview runtime state.
- **Page sleep when hidden.** [`src-tauri/src/webview_sleep.rs`](../../src-tauri/src/webview_sleep.rs) (Windows) suspends the page and lowers the memory target while the window is minimized. It is best effort; a failure leaves the page running.

---

## 6. Audit fixes made during this release

- Pause and mute gating: both honor their settings.
- Feed volume and the Cobalt fallback toggle are respected.
- `XNOWBG` parsing no longer panics on a malformed color; non-ASCII input is rejected.
- Media downloads are limited to X's own hosts (`x.com`, `twitter.com`, `*.twimg.com`).
- Single-instance plugin: a second launch focuses the running app.
- `curl` is called from `%SystemRoot%\System32\curl.exe`.
- Blocking work runs on `spawn_blocking`.
- The unused `tokio` dependency was removed.
- `SECURITY.md`, `CONTRIBUTING.md` and `AGENTS.md` were updated, and the npm scripts were fixed.
- The CDP probe scripts take the shipped webview flags through `XNOW_WEBVIEW_ARGS`.

---

## 7. Implementation map (what changed, where)

| Area | File | Change |
|---|---|---|
| Sign-in popups, navigation, title channel | `src-tauri/src/lib.rs` | `classify_new_window`, `Session` state, `report_session`, `XNOWOUT:` handling, main-window routing, blank-window timer, logging, `is_x_host` helper, four new unit tests |
| Audio session mute | `src-tauri/src/audio.rs` | `decide()`, `Book.was_hidden`, marker file, five unit tests |
| Settings store | `src-tauri/src/settings.rs` | `settings.json` load and save, validated patches, saved-media history, unit tests |
| Page sleep on minimize | `src-tauri/src/webview_sleep.rs` | WebView2 suspend and memory target |
| Tray | `src-tauri/src/tray.rs` | Settings submenu, regrouped menus, About card from `frontend/x-about.js` |
| Page tools | `frontend/x-tools.js` | Refresh, `__xnowNavigate`, handle reporting (`XNOW:` / `XNOWOUT:`), media volumes, pause and mute gating, Cobalt gating |
| Settings panel | `frontend/x-settings.js` | Settings sheet, in-page theme switch via X's Display page (cookie `night_mode`), no full reload |
| Rail beside logo | `frontend/x-rail.js` | X-Now and Refresh buttons; placement beside the logo, icon-only fallback |
| About card | `frontend/x-about.js` | Status tiles, feature grid, focus trap |
| ACL | `src-tauri/capabilities/remote.json`, `src-tauri/build.rs` | Exactly seven commands for `https://x.com/*`: `download_media`, `save_media_bytes`, `open_external_url`, `prepare_download_folder`, `get_settings`, `update_settings`, `open_saved_folder` |
| Release workflow | `.github/workflows/release.yml` | Rewritten (see §8) |
| Tests | `scripts/verify-xnow-helpers.js`, `scripts/verify-xnow-ui.js`, `scripts/verify-xnow-settings-live.js` | Contract harness (88), UI harness (79), live settings suite |

---

## 8. Release process changes

- **One manual run builds one universal installer per platform.** The workflow runs on `workflow_dispatch` only. A tag push no longer starts the macOS build, because macOS minutes cost 10× Linux minutes.
- **Version check first.** `release_tag` must look like `vX.Y.Z`. `src-tauri/tauri.conf.json`, `package.json`, `src-tauri/Cargo.toml` and `src-tauri/Cargo.lock` must all match it. `docs/releases/X-Now_vX.Y.Z.md` must exist. The job stops before any build if one check fails.
- **Pinned Tauri CLI** (`TAURI_CLI_VERSION`, `2.11.5`, matching the `tauri` crate in `Cargo.lock`).
- **Icons are verified, not copied.** Each build job checks `src-tauri/icons/` against `icons/` byte for byte.
- **Asset set** (all in one draft GitHub Release):

  | Platform | File | Notes |
  |---|---|---|
  | Windows x64 | `X-Now_2.5.0_windows_x64-setup.exe` | NSIS installer |
  | Windows x64 | `X-Now_2.5.0_windows_x64_en-US.msi` | WiX MSI |
  | Windows x64 | `X-Now_2.5.0_windows_x64-portable.exe` | Standalone, no install |
  | macOS | `X-Now_2.5.0_universal.dmg` | One DMG, Apple Silicon and Intel; `lipo` verified |
  | Linux x64 | `X-Now_2.5.0_amd64.AppImage` | Runs on most distributions without install |
  | Linux x64 | `X-Now_2.5.0_amd64.deb` | Debian and Ubuntu |
  | Linux x64 | `X-Now_2.5.0_x86_64.rpm` | Fedora, RHEL, openSUSE |
  | All | `SHA256SUMS.txt` | Checksums for all seven files, verified before publishing |

- **Draft release.** The release is created as a draft with these notes as its body. Publishing is a manual step.
- **Not included:** Windows ARM64 and unsigned-package signing. Code signing and notarization are not configured.

---

## 9. Manual checklist (needs your account)

Do not type credentials into anything except X's own page inside X-Now.

1. **Password login:** Sign in on X's login page. Expect the home feed and `X-Now (@handle)` in the title bar.
2. **Passkey or security key:** Choose the passkey option. Expect the Windows prompt, then sign-in.
3. **Two-factor code:** Expect the home feed after the code.
4. **Apple:** Click *Continue with Apple*. Expect Apple's window. After sign-in, expect the window to close and X-Now to show you signed in.
5. **Google:** Confirmed working on Windows (see §3.3).

---

## 10. Verification record

| Check | Result |
|---|---|
| `cargo fmt --all -- --check` | Clean |
| `cargo check` / `cargo build --release` | Pass |
| `cargo test --lib` | 40 passed, 0 failed |
| `node scripts/verify-xnow-helpers.js` | 88 passed, 0 failed |
| `node scripts/verify-xnow-ui.js` | 79 passed, 0 failed |
| Icon byte-identity (`icons/` vs `src-tauri/icons/`) | Identical (6 of 6) |
| Version alignment (tauri.conf.json, package.json, Cargo.toml, Cargo.lock) | 2.5.0 |
| Live sign-in probes | Passed on the final build (§3.3) |
| Live settings suite (`scripts/verify-xnow-settings-live.js`) | Last full run: 163 checks, 0 failed, in an earlier round. Not re-run for this release. |
| `actionlint` on `release.yml` | Not run (tool not installed). Structure checked with a YAML parser. |
| Windows installers built with `tauri build` | Built locally; SHA-256 below |
| macOS DMG and Linux bundles | Built by the release workflow only; not run locally |

### Local Windows artifacts (SHA-256)

| File | SHA-256 |
|---|---|
| `X-Now_v2.5.0.exe` (standalone, repo root) | `9611d023415411fa78f6cabeb73a1d5bf1f402ba8930fcfd8e074a777a83a37b` |
| `installers/X-Now_2.5.0_x64-setup.exe` | `281198051ba8aeada89759afe10af54009ef45ae657890fdf3b81bc0e7a5b0fe` |
| `installers/X-Now_2.5.0_x64_en-US.msi` | `8d7f8edc2ae9f6cb6cd6ed5aa052b5169f88da2c45ff3c23e25433fce304724b` |

These are recorded in `checksums.txt`, which `sha256sum -c` verifies.

---

## 11. Known limits and open items

- **Google button in automated clicks.** Clicks made by automated tests did not reach Google's button. The maintainer confirmed it works when clicked by hand on Windows, so the automated result is not a product bug. The test method is the limit.
- **Provider pages opened by X in the main window.** If X navigates the main window itself to Google, Apple or Microsoft (a redirect, not a popup), the page opens in the browser instead. This is unchanged and needs a decision before it changes, because it would let provider pages run inside X-Now.
- **Nested popups** from a sign-in popup get the default WebView2 handling. Not reproduced.
- **Popup close timing.** The popup closes 50 ms before the main window reloads on the x.com hop. Not reproduced without an account.
- **`twitter.com` pages** have no native bridge (the ACL covers `x.com` only). X redirects `twitter.com` to `x.com`.
- **Deprecated `tauri_plugin_shell::Shell::open`** is used for opening links (five build warnings). Replacing it is a dependency change, left for a separate release.
- **Unsigned packages.** Windows SmartScreen and macOS Gatekeeper can warn. Verify the downloads against `SHA256SUMS.txt`.
- **Sign-in test coverage.** The jsdom harness does not cover the 5-second sign-out report; the live probe does.

---

## 12. Upgrade notes

- Settings are stored in `settings.json` in the app data folder. Existing values carry over.
- If a previous version left X-Now's audio session muted, the first visible sync after launch clears it (the marker file handles crashes).
- The standalone exe and the installers replace the v2.1.0 build; no manual steps are needed.
