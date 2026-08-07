# 🔒 Security & Privacy Policy

The security, privacy, and integrity of **X-Now** and its users are top priorities.

---

## 🛡️ Supported Versions

| Version | Supported | Security Maintenance |
| :--- | :---: | :--- |
| **`2.0.x`** | ✅ | Active security support & bug fixes (current release) |
| `1.0.x` – `1.1.x` | ⚠️ | Legacy — maintained only for critical security issues |
| `< 1.0.0` | ❌ | Pre-release / superseded versions |

---

## 🔐 Core Security & Privacy Guarantees

- **No analytics, no tracking, no remote database.** X-Now does not collect, transmit, or store any of your X activity. There is no telemetry, no ad SDK, and no account database.
- **Your session stays local.** The signed-in session lives in WebView2's on-disk profile on *your* computer. X-Now has no profile manager and never sees your password — you sign in through X's own official page inside the app.
- **Minimal native bridge.** The app exposes only a handful of narrow capabilities: opening safe external HTTP(S) URLs in the default browser, preparing the download folder, saving media bytes, and downloading a media URL that X itself has already exposed. Every command validates its input.
- **External links are routed safely.** Only `http`/`https` URLs (with no CR/LF injection) are ever opened externally; everything else stays in-app or is denied.
## Capabilities & the remote page

X-Now is a Tauri v2 app whose only page is the official x.com website. Tauri's access-control list (ACL) is therefore configured with least privilege:

- **Local origin** (the app shell): `core:default` + `shell:allow-open`.
- **Remote origin** (`https://x.com/*`, capability `remote-x-com`): **exactly four** app commands — `download_media` (curl a direct media URL to `Downloads\X-Now`), `save_media_bytes` (write in-page-fetched bytes), `open_external_url` (open a link in the OS default browser), `prepare_download_folder` (create the folder). The x.com page cannot reach window, shell, file-system, or any other command.

Media saving is opt-in and local. Downloads go only to `Downloads\X-Now` (or your OS's equivalent download folder). Nothing is uploaded anywhere.
- **Media is fetched as the page exposes it.** X-Now downloads X's CDN URLs (`pbs.twimg.com`, `video.twimg.com`) with a standard browser user-agent and the post URL as referer; it does not bypass X access controls.
- **Video resolution is post-scoped only.** A video is resolved exclusively from the clicked post (its own URL, its post page, or resources pinned to it via the poster's media ID) — page-wide shortcuts are never taken, X's own UI assets (`pbs.twimg.com/static/*`) are excluded from every candidate path, and HLS playlists are never saved as files.
- **Video hand-off is a browser redirect.** When X exposes only a streamed `blob:` URL, the video path opens the external [Cobalt](https://cobalt.tools/) service in your default browser; X-Now does not store the copied post link.

## 🧪 Security-Conscious Development

- Rust + Tauri v2 with a minimal dependency set; the only Windows-specific dependency is target-gated and used solely for the audio-session mute guarantee.
- Repository checks validate JavaScript syntax, Rust formatting, dependency compilation, and package generation.
- Release builds are reproducible through the GitHub Actions pipeline (`release.yml`), one job per platform with native installers, and ship with SHA-256 `checksums.txt`.

## 📋 What to Treat as Private

- WebView session data and your signed-in account state.
- Downloaded media in `Downloads\X-Now`.
- Any copied X post URL.

---

## 🐛 Reporting a Vulnerability

We take security reports seriously. To report a vulnerability:

1. **Do not** open a public issue with exploit details or account data.
2. Email the maintainer privately via the GitHub profile: [@benedictusrey](https://github.com/benedictusrey) — or open a GitHub issue *without* sensitive details and ask for a secure channel.
3. Include: affected version, platform, a minimal description of the issue, and steps to reproduce (no credentials, no session data, no private media).

You will receive an acknowledgement within a few days and a status update as the issue is investigated. Public disclosure happens only after a fix ships.

---

*Authored and maintained with ❤️ by [@benedictusrey](https://github.com/benedictusrey)*
