# X-Now v2.6.0

Native **X-Now Downloader** (top-left rail left of Refresh feed, context menu, tray Tools, and `Ctrl/Cmd+Shift+D`), multi-platform stability fixes, and performance/memory optimizations.

## Download

Choose the file for your system from the [v2.6.0 release assets](https://github.com/benedictusrey/X-Now/releases/tag/v2.6.0). Every file is listed with its SHA-256 hash in [`SHA256SUMS.txt`](https://github.com/benedictusrey/X-Now/releases/download/v2.6.0/SHA256SUMS.txt).

| System | File | How to install |
|---|---|---|
| **Windows 10/11, 64-bit** | [X-Now_2.6.0_windows_x64-setup.exe](https://github.com/benedictusrey/X-Now/releases/download/v2.6.0/X-Now_2.6.0_windows_x64-setup.exe) **(recommended)** | Run the file and follow the installer |
| Windows, managed install | [X-Now_2.6.0_windows_x64_en-US.msi](https://github.com/benedictusrey/X-Now/releases/download/v2.6.0/X-Now_2.6.0_windows_x64_en-US.msi) | Windows Installer package |
| Windows, no install | [X-Now_2.6.0_windows_x64-portable.exe](https://github.com/benedictusrey/X-Now/releases/download/v2.6.0/X-Now_2.6.0_windows_x64-portable.exe) | Run it directly |
| **macOS 11 or newer** (Apple Silicon and Intel) | [X-Now_2.6.0_universal.dmg](https://github.com/benedictusrey/X-Now/releases/download/v2.6.0/X-Now_2.6.0_universal.dmg) | Open the DMG and drag X-Now to Applications |
| **Linux, most distributions** | [X-Now_2.6.0_amd64.AppImage](https://github.com/benedictusrey/X-Now/releases/download/v2.6.0/X-Now_2.6.0_amd64.AppImage) | Run `chmod +x` on the file, then run it |
| Debian, Ubuntu | [X-Now_2.6.0_amd64.deb](https://github.com/benedictusrey/X-Now/releases/download/v2.6.0/X-Now_2.6.0_amd64.deb) | `sudo apt install ./X-Now_2.6.0_amd64.deb` |
| Fedora, RHEL, openSUSE | [X-Now_2.6.0_x86_64.rpm](https://github.com/benedictusrey/X-Now/releases/download/v2.6.0/X-Now_2.6.0_x86_64.rpm) | Open it with your package installer |

**Requirements:** Windows needs the Microsoft Edge WebView2 Runtime (install it from Microsoft if it is missing). Linux needs the WebKitGTK 4.1 runtime. Audio extraction (`.m4a`), HLS stream remuxing, and GIF conversion use `ffmpeg` when installed on `PATH`.

### Verify your download

- **Windows (PowerShell):** `Get-FileHash .\X-Now_2.6.0_windows_x64-setup.exe -Algorithm SHA256`, then compare the hash with its line in `SHA256SUMS.txt`.
- **Linux:** `grep "X-Now_2.6.0_amd64.AppImage" SHA256SUMS.txt | sha256sum -c -` (use your file's name).
- **macOS:** `grep "X-Now_2.6.0_universal.dmg" SHA256SUMS.txt | shasum -a 256 -c -`.

## What's new

- **X-Now Downloader:** inspect any X/Twitter post URL or ID (`x.com`, `twitter.com`, `fxtwitter.com`, `vxtwitter.com`, `fixupx.com`) with live page probe + syndication fallback, multi-item thumbnail strip, item/format picker, editable post text (`.txt`), single-file save, audio-only `.m4a` extraction, high-compatibility `JPG`/`PNG` defaults and `aac_adtstoasc` HLS muxing, and Full Post Bundle (`post.txt` + `metadata.json` + all media).
- **Built-in Image Zoom Slider & Keyboard Shortcuts:** `Ctrl/Cmd+click` any post image (or context menu *View / Zoom image*) to zoom (`10%–400%` slider, `+`/`−`, `0`/`F` fit, `1` actual size, arrows pan, `Esc` close); Downloader previews include an image zoom slider (`100%–400%`) as well.
- **Top-left rail Downloader icon:** added to the left of **Refresh feed** with compact-sidebar scaling and `Dim` / `Black` / `Light` theme sync.
- **Performance & memory optimizations:** unified DOM `MutationObserver` without per-mutation array churn, suspended hidden timers/theme probes, linear `O(N)` audio process-tree discovery with `CloseHandle` cleanup, reduced watchdog wakeups (`15s` visible / `5s` hidden), cross-filesystem safe image conversion temp paths, and gated startup diagnostics.
- **Reliability & accessibility fixes:** Wayland minimize/hide state tracking, Linux WebKitGTK Wayland/DMA-BUF video & compositing guards, AppImage GStreamer `bundleMediaFramework`, blocking broken WebKitGTK OAuth popups (plus denying sign-in popups when already signed in), routing in-app popups cleanly, `pbs.twimg.com` image extension normalization, silent GIF audio guard, WCAG AA dark-surface contrast, keyboard/touch pan cleanup, WebView2 `TrySuspend()` pause-before-suspend sequencing, Windows settings write fallback, serialized async settings persistence, and titlebar diagnostic cleanup.

## Known limits

- Packages are unsigned. Windows SmartScreen and macOS Gatekeeper may show a warning. On macOS, right-click X-Now and choose **Open** the first time.
- Audio extraction (`.m4a`), `.m3u8` HLS remuxing, and `.mp4`→`.gif` conversion require `ffmpeg` on `PATH`.
- No Windows ARM64 build.

### Linux performance & AppImage limitations (tracked for future release)

- **Wayland software compositing overhead:** `X-Now` defaults to `WEBKIT_DISABLE_COMPOSITING_MODE=1` and DMA-BUF/GStreamer GL sink guards (`WEBKIT_DISABLE_DMABUF_RENDERER=1`, `WEBKIT_DISABLE_DMABUF_ATLAS=1`, `WEBKIT_GST_DMABUF_SINK_DISABLED=1`, `WEBKIT_GST_DISABLE_GL_SINK=1`) on Wayland to avoid black video frames, bottom clipping, and blank hide/show surfaces. CPU compositing makes Linux scroll and video playback noticeably slower than Windows and macOS; advanced users on unaffected drivers can override with `WEBKIT_DISABLE_COMPOSITING_MODE=0`.
- **Ubuntu 22.04 AppImage PulseAudio deadlock:** `X-Now_2.6.0_amd64.AppImage` ships Ubuntu 22.04's GStreamer `1.20` `libgstpulseaudio.so` and `libpulse` `15.99`, which were observed deadlocking `WebKitWebProcess` on the main thread (`pa_threaded_mainloop_wait` / `gst_element_change_state`) when scrolling past videos or toggling volume. Future Linux builds on `main` already move CI to `ubuntu-24.04` (GStreamer `1.24` + native `libsoup-3.0`) and strip bundled `libwayland-*` and `libpulse*`; for `v2.6.0`, the native `.deb` or `.rpm` packages (linking the host system's GStreamer/PulseAudio) are recommended over the AppImage where available.
- **Linux OAuth popups:** Third-party Google and Apple OAuth popups are blocked on Linux WebKitGTK due to upstream blank-window/popup lifecycle bugs in `wry`; use X's in-window email, username, or password sign-in instead.

## More

- [Changelog](https://github.com/benedictusrey/X-Now/blob/main/CHANGELOG.md)
