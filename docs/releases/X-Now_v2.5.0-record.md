# X-Now v2.5.0 — Full Implementation Record

**Release date:** 2026-11-16 · **Compared with:** v2.1.0 (the last published tag)
**Author:** Benedictus Reynaldo Hartanto ([@benedictusrey](https://github.com/benedictusrey))

This file is the full record of v2.5.0: what changed, why, how each part is built, what was verified and what was not. The download guide is [`X-Now_v2.5.0.md`](X-Now_v2.5.0.md); the short summary is in [`RELEASE_NOTES.md`](../../RELEASE_NOTES.md); the version-by-version list is in [`CHANGELOG.md`](../../CHANGELOG.md).

---

## 1. Summary

v2.5.0 adds a Settings panel, two controls beside X's logo, and Quiet hours. It fixes three problems that were reported or found during this release cycle:

1. **Sign-in windows** for Google and Apple were closed by the app too early, or never opened. Google sign-in now works end to end (confirmed by the maintainer on Windows). Apple's sign-in window opens and closes correctly.
2. **Video sound was silent** while X-Now was in the foreground, because Windows kept X-Now's own audio session muted. The mute logic was rewritten.
3. **Black flashes and bleached windows** while scrolling and during video playback. v2.5.0 refines the rendering layer that the v2.1.0 tag already shipped (see §5), and fixes the remaining black flashes on recycled video players.

The release also rewrites the release workflow so that one manual run produces one universal installer per platform.

---

## 2. What's new for users

- **Settings panel.** Opens from the **X-Now** button beside X's logo, or from the tray. A sheet slides out from the rail with these sections:
  - **Window:** hide to tray on close, keep on top.
  - **Minimized:** pause video, mute, sleep the page.
  - **Quiet hours:** Off, Nights (23:00–07:00), or a custom window.
  - **Media:** feed and opened-video volumes (defaults unchanged: 20% and 50%), "Unmute videos when X-Now is active" (on by default), saved-media history.
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

Checked on the live login page in the app. Clicks on the sign-in buttons opened only the provider's sign-in page; no credentials were entered:

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
- Feed videos still follow X's muted-autoplay rule until a click, unless the Settings option in 4.4 is on.

### 4.4 Unmute when X-Now is active (Settings)

- **Cause.** `frontend/x-tools.js` forced feed videos to `muted` until a click on a video. That "unlocked" state lived only in memory, so every launch, Refresh and reload started locked, and the first video stayed silent until its speaker was clicked.
- **Fix.** Settings › Media › "Unmute videos when X-Now is active", on by default. While X-Now is the focused, visible window, a feed or opened video that starts playing is unmuted once per source. A mute you set yourself stays until the source changes. Turn the setting off to keep X's muted default.
- **Autoplay switch.** Chromium blocks unmuted autoplay until a user gesture. X-Now's WebView2 now passes `--autoplay-policy=no-user-gesture-required`, so the option works right after launch. The switch applies to every page in X-Now's WebView, including the Google and Apple sign-in windows.
- **Live check (built exe, logged-in X feed, no clicks).** With the setting on, a feed video was playing with `muted=false` and the window focused, both right after launch and after a reload. With the setting off and a reload, the same video was `muted=true`, and no foreground unmute had run. At startup the app's own Windows audio session read `muted=no` while in front.

### 4.5 Window icon (Task Manager)

- **Cause.** Tao applies the window icon passed to `.icon(...)` to the small icon only. Live, `WM_GETICON` for the big icon returned 0, and the class icon was also 0. Task Manager's app row therefore had no icon and showed a blank tile.
- **Fix.** `set_big_window_icon` in `src-tauri/src/lib.rs` sends `WM_SETICON` with `ICON_BIG`, using the exe's own icon group (ID 32512, from `icons/icon.ico`).
- **Verification.** Live, the big icon went from 0 to a valid handle on the new build. The Task Manager row is still to be confirmed by eye on the maintainer's machine.

---

## 5. Rendering, window and sleep layer

Most of this layer was already in the v2.1.0 tag. Checked with `git show v2.1.0:<file>`: the video mount guard (`__xnowVideoMountGuard`, `data-xnow-mount-wait`), the theme-adaptive background (`XNOWBG`), the DirectComposition and occlusion switches, the idle-aware page poll (1 s to 30 s), the 5 s hidden watchdog poll, native zoom, and the per-launch toggles including `XNOW_WEBVIEW_ARGS`. v2.5.0 keeps all of them and adds these changes:

- **Mount guard for recycled players.** The guard re-arms on `loadstart` and `emptied`, and no longer trusts a stale `readyState >= 2` from the previous stream. This closes the last black-gap window found at source swaps (see `CHANGELOG.md`, 2.5.0).
- **Autoplay switch.** `--autoplay-policy=no-user-gesture-required` is in `DEFAULT_WEBVIEW_BROWSER_ARGS`. It is not in v2.1.0, and it applies to every WebView page, sign-in windows included.
- **Page sleep when hidden.** New module `src-tauri/src/webview_sleep.rs` (Windows). It suspends the page and lowers its memory target while the window is hidden. It is best effort: if it fails, the page keeps running.
- **Zoom saved.** The zoom level is stored in `settings.json` and restored on launch. It did not persist before.
- **Theme in Settings.** Settings › Display switches X's Background (Default or Lights out) through X's own Display page.

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
| Tests | `scripts/verify-xnow-helpers.js`, `scripts/verify-xnow-ui.js`, `scripts/verify-xnow-settings-live.js` | Contract harness (94), UI harness (80), live settings suite (172) |

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

- **Draft release.** The release is created as a draft with these notes as its body. Publishing is a manual step, and publishing creates the tag `v2.5.0` on the commit `main` points to.
- **Repository layout.** Standalone exes and `checksums.txt` live in `dist/`. Installers in `dist/installers/` are git-ignored. Probe scripts live in `scripts/diagnostics/`. `run-x-now.bat` starts `dist/X-Now_v2.5.0.exe`.
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
| `cargo test --lib` | 41 passed, 0 failed |
| `node scripts/verify-xnow-helpers.js` | 94 passed, 0 failed |
| `node scripts/verify-xnow-ui.js` | 80 passed, 0 failed |
| Icon byte-identity (`icons/` vs `src-tauri/icons/`) | Identical (6 of 6) |
| Version alignment (tauri.conf.json, package.json, Cargo.toml, Cargo.lock) | 2.5.0 |
| Live sign-in probes | Passed on the final build (§3.3) |
| Live unmute probe (§4.4) and window icon handle (§4.5) | Run on the built exe: video unmuted with the setting on (launch and reload), muted with it off; big icon handle 0 before the fix, set after |
| Live settings suite (`scripts/verify-xnow-settings-live.js`) | 172 checks, 0 failed on the local release build, with the Mute sound and Pause video switches starting both on and off. The earlier Mute sound failures were a test-setup error, not an app bug. |
| `actionlint` on `release.yml` | Not run (tool not installed). Structure checked with a YAML parser. |
| Windows installers built with `tauri build` | Built locally; SHA-256 below |
| macOS DMG and Linux bundles | Built by the release workflow only; not run locally |

### Local Windows build hashes (SHA-256)

These hashes are for local builds on the maintainer's machine, not for the release assets. The published release ships its own `SHA256SUMS.txt`, covering the seven files it attaches. Check downloads against that file.

| File (local build) | SHA-256 |
|---|---|
| `dist/X-Now_v2.5.0.exe` (standalone) | `5e5bece385b1e282c7a5f801b43e6fa8099947c4f3cb5ef9a82dcfc2b57273d2` |
| `dist/installers/X-Now_2.5.0_x64-setup.exe` | `970efa4ac04f8e1c8c83a34e088794fe61d1c4384ecfb8c325d1792dcea92226` |
| `dist/installers/X-Now_2.5.0_x64_en-US.msi` | `f02af0d5f3f605d0e36e53d36abb52ee9515511f7800ffc797a160491b9b192d` |

These are recorded in `dist/checksums.txt`. Run `sha256sum -c checksums.txt` from the `dist/` folder.

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
- **Autoplay switch scope.** `--autoplay-policy=no-user-gesture-required` applies to every page in X-Now's WebView, including the sign-in windows. A `XNOW_WEBVIEW_ARGS` override replaces the defaults, so it must include the switch to match the shipped build.

---

## 12. Upgrade notes

- Settings are stored in `settings.json` in the app data folder. Existing values carry over.
- If a previous version left X-Now's audio session muted, the first visible sync after launch clears it (the marker file handles crashes).
- The standalone exe and the installers replace the v2.1.0 build; no manual steps are needed.


---

## 13. Implementation notes for future versions

### 13.1 Where the logic lives

| Area | Function or file | Notes |
|---|---|---|
| Sign-in and new windows | `classify_new_window`, `Session` (Unknown, Out, In), `report_session` in `lib.rs` | Exact host match. Popups close only on Out to In |
| Title channel | `XNOW:<handle>`, `XNOWOUT:`, `XNOWBG:r,g,b` in `lib.rs` and `x-tools.js` | The page reports through `document.title`; Rust restores the title |
| Settings store | `init`, `get`, `update`, `mutate`, `apply_patch`, `write_file` in `settings.rs` | camelCase JSON, `#[serde(default)]`, temp file then rename. A corrupt file is kept as `settings.json.bad`. History is capped at 50 |
| Settings commands | `get_settings`, `update_settings`, `apply_settings_change` in `lib.rs` | `update_settings` refuses `launchAtLogin`. Native changes call `__xnowSettingsChanged` in the page |
| Settings sheet | `switchControl`, `save`, `write`, `loadSettings`, `render` in `x-settings.js` | Optimistic values in `state.view`, mirrored to `window.__xnowSettings` |
| Foreground unmute | `applyDefaultVideoAudio`, `unmuteForActiveWindow` in `x-tools.js` | `dataset.xnowFgSrc` marks each source. Capture-phase `play` listener and window `focus` |
| Pause and mute on hide | `__onWindowHidden`, `__resumeIfNeeded` in `x-tools.js`; watchdog in `lib.rs` | Reads `pauseOnMinimize` and `muteOnMinimize`. Restore resumes the video that was playing if it is on screen, otherwise the first video in view |
| Audio session | `audio::decide`, `audio::sync`, `Book`, marker `audio-muted.flag` in `audio.rs` | Modes Hidden, Visible, Release. Windows only. `audio.rs` existed in v2.1.0, but `decide` is new |
| Big window icon | `set_big_window_icon` in `lib.rs` | `WM_SETICON` with `ICON_BIG`, from icon group 32512 |
| Quiet hours | `quietActive`, `enforceQuiet`, `play` listener in `x-settings.js` | Local time, evaluated in the page. Enforced every 15 s |
| Refresh | `refreshHandle` in `x-tools.js`; the rail button in `x-rail.js` | In place, using X's Home tab and "Show N posts" pill. Falls back to a reload |

### 13.2 Settings model

| Key (camelCase) | Default | Limits and notes |
|---|---|---|
| `closeToTray` | `true` | |
| `alwaysOnTop` | `false` | |
| `pauseOnMinimize` | `true` | |
| `muteOnMinimize` | `true` | |
| `sleepOnMinimize` | `true` | |
| `feedVolume` | `20` | 0 to 100 |
| `standaloneVolume` | `50` | 0 to 100 |
| `cobaltFallback` | `true` | |
| `zoomPercent` | `100` | 50 to 300 |
| `motion` | `system` | `system`, `reduce`, `full` |
| `quietMode` | `off` | `off`, `nights`, `custom` |
| `quietStart`, `quietEnd` | `1380`, `420` | Minutes after midnight, 0 to 1439 |
| `focusLayout` | `false` | |
| `unmuteWhenActive` | `true` | |
| `history` | `[]` | Saved files, newest first, at most 50 |

To add a setting: add the field with its default, add an `apply_patch` arm with validation, add a Settings row, add it to the `DEFAULTS` in `scripts/verify-xnow-ui.js`, and add it to the `SWITCHES` list in `scripts/verify-xnow-settings-live.js` if it is a switch.

### 13.3 Test notes

- `npm run test:all` runs 41 Rust tests, the contract harness (94) and the UI harness (80). In jsdom, `currentSrc` is a getter, so set it with `Object.defineProperty`.
- `npm run test:live` drives the built exe on CDP port 9336. It closes any running X-Now, seeds one history row, and restores `settings.json` at the end.
- The live suite starts from the user's saved switch states. `setOn()` turns Pause video and Mute sound on before the checks that need them on. An earlier "Mute sound" failure came from this setup, not from the app. The suite passed 172/172 with the switches starting on and off.
- X-Now mutes the first playing `<video>` in DOM order. The mute check prepends its test video so that it is the one checked.
- Wrapping `window.__TAURI__.core.invoke` in the live page recorded no calls. Log from Rust (`eprintln!`) instead.
- Open risk, not reproduced: `__xnowSettingsChanged` re-reads settings after every change, so a late reply could overwrite a newer switch value. A probe that delayed replies by 400 ms did not reproduce it. If a switch ever shows a stale state, serialize the reads and writes in `x-settings.js`.

### 13.4 Build and artifact notes

- Tauri embeds `frontend/*.js` in the exe. After each build, check that every file's bytes appear in the exe. A byte search does this.
- Two builds of the same source differ in about 24 bytes: PE timestamps, debug-directory timestamps and the PDB GUID. The installers' copies of the exe differ by a 3-byte bundler marker (`UNK` in NSIS, `MSI` in the MSI). The code is the same.
- `tauri build` fails with "os error 32" while `target/release/X-Now.exe` is running. Close the app, or set `CARGO_TARGET_DIR` to a folder outside the repo.
- The NSIS payload cannot be inspected without installing, so verify it from the build log. Its exe comes from the same run as the MSI.
- `core.autocrlf` is true. Committed files are LF (`git ls-files --eol`). `sha256sum -c` fails on a CRLF working copy, so run it on the committed copy or strip the CR characters.
- `cargo check` reports five deprecation warnings for `tauri_plugin_shell::Shell::open` (in `lib.rs` and `tray.rs`). Moving to `tauri-plugin-opener` is deferred.

### 13.5 Release mechanics

- `release.yml` runs only on `workflow_dispatch`, with inputs `release_tag` and `publish_release`. Its `version` job checks the four manifests and `docs/releases/X-Now_vX.Y.Z.md`.
- A draft keeps the tag it was created with. Before a new run, delete the old draft, and delete any tag that points to an old commit.
- Publishing creates the tag on the commit `main` points to. Either keep `main` at the built commit, or make sure later commits change only docs (`git diff --stat <built>..HEAD`).
- Download URL pattern: `https://github.com/<owner>/<repo>/releases/download/<tag>/<file>`. `/releases/latest` points to the newest published release.
- Watch a run without polling: `gh run watch <id> --exit-status`, in the background.
- Check a draft before publishing: `targetCommitish`, the asset list, the notes body, and `grep <file> SHA256SUMS.txt | sha256sum -c -`.

### 13.6 Local folder layout

- `dist/`: tracked standalone exes (`X-Now_v2.1.0.exe`, `X-Now_v2.5.0.exe`) and `checksums.txt`. `dist/installers/` is git-ignored.
- `run-x-now.bat` launches `dist/X-Now_v2.5.0.exe`.
- `scripts/`: the verification harnesses and the flash tools. `scripts/diagnostics/`: one-off probes that npm does not run.
- `backup/`: a local rollback snapshot. It is git-ignored.

### 13.7 Open items carried forward

- Task Manager icon: confirm visually on the maintainer's machine.
- Revoke the `ghp_` token that was exposed in terminal output earlier.
- Manual sign-in checks not run: password, passkey, two-factor (§9).
- Correct the 2.5.0 wording in `CHANGELOG.md` and this record. Several items listed as new in 2.5.0 were already in the v2.1.0 tag: the mount guard, the theme background, the overlay and occlusion switches, the idle timers, the 5 s poll and the per-launch toggles. Reword them as refinements.
- The settings-race risk in §13.3.
- Replace the deprecated `Shell::open` calls.
- `docs/GITHUB_DESKTOP_PUBLISHING.md` is a historical v2.1.0 guide.

### 13.8 Test artifacts removed

After this record was written, the test and check caches from the v2.5.0 work were removed: `src-tauri/target/debug` (about 4.4 GB), the flash-smoke outputs, the separate installer build folder, downloaded release assets, live-suite runs and probe logs. To recreate them, run `npm run test:all`, run `npm run test:live` on Windows (it needs the built exe), and run `cargo build --release`.

Kept on purpose: `src-tauri/target/release` (the built app), `dist/`, `backup/`, and the smoke-test dependency copy at `%TEMP%\xnow-verify\node_modules`, which BUILD_AND_FIXES.md references.
