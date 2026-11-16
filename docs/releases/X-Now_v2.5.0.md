# X-Now v2.5.0

Settings panel, Quiet hours, unmuted videos while X-Now is active, and fixes for sign-in, video sound on Windows, the Task Manager icon and scroll flashes.

## Download

Choose the file for your system. Every file is listed with its SHA-256 hash in [`SHA256SUMS.txt`](https://github.com/benedictusrey/X-Now/releases/download/v2.5.0/SHA256SUMS.txt).

| System | File | Size | How to install |
|---|---|---|---|
| **Windows 10/11, 64-bit** | [X-Now_2.5.0_windows_x64-setup.exe](https://github.com/benedictusrey/X-Now/releases/download/v2.5.0/X-Now_2.5.0_windows_x64-setup.exe) **(recommended)** | 2.8 MB | Run the file and follow the installer |
| Windows, managed install | [X-Now_2.5.0_windows_x64_en-US.msi](https://github.com/benedictusrey/X-Now/releases/download/v2.5.0/X-Now_2.5.0_windows_x64_en-US.msi) | 3.8 MB | Windows Installer package |
| Windows, no install | [X-Now_2.5.0_windows_x64-portable.exe](https://github.com/benedictusrey/X-Now/releases/download/v2.5.0/X-Now_2.5.0_windows_x64-portable.exe) | 7.3 MB | Run it directly |
| **macOS 11 or newer** (Apple Silicon and Intel) | [X-Now_2.5.0_universal.dmg](https://github.com/benedictusrey/X-Now/releases/download/v2.5.0/X-Now_2.5.0_universal.dmg) | 10.9 MB | Open the DMG and drag X-Now to Applications |
| **Linux, most distributions** | [X-Now_2.5.0_amd64.AppImage](https://github.com/benedictusrey/X-Now/releases/download/v2.5.0/X-Now_2.5.0_amd64.AppImage) | 82.4 MB | Run `chmod +x` on the file, then run it |
| Debian, Ubuntu | [X-Now_2.5.0_amd64.deb](https://github.com/benedictusrey/X-Now/releases/download/v2.5.0/X-Now_2.5.0_amd64.deb) | 4.0 MB | `sudo apt install ./X-Now_2.5.0_amd64.deb` |
| Fedora, RHEL, openSUSE | [X-Now_2.5.0_x86_64.rpm](https://github.com/benedictusrey/X-Now/releases/download/v2.5.0/X-Now_2.5.0_x86_64.rpm) | 4.0 MB | Open it with your package installer |

**Requirements:** Windows needs the Microsoft Edge WebView2 Runtime (install it from Microsoft if it is missing). Linux needs the WebKitGTK 4.1 runtime.

### Verify your download

- **Windows (PowerShell):** `Get-FileHash .\X-Now_2.5.0_windows_x64-setup.exe -Algorithm SHA256`, then compare the hash with its line in `SHA256SUMS.txt`.
- **Linux:** `grep "X-Now_2.5.0_amd64.AppImage" SHA256SUMS.txt | sha256sum -c -` (use your file's name).
- **macOS:** `grep "X-Now_2.5.0_universal.dmg" SHA256SUMS.txt | shasum -a 256 -c -`.

## What's new

- **Settings:** open from the X-Now button beside X's logo or from the tray. Covers the window, minimize, media, Quiet hours, zoom, theme, motion and saved media.
- **Unmute videos when X-Now is active:** on by default. Turn it off in Settings to keep X's muted default.
- **Quiet hours:** pause and mute video on a schedule (Nights, 23:00 to 07:00, or a custom window).
- **Refresh** beside the logo: loads new posts in place. Playing media and your scroll position stay.
- **Sign-in:** Google and Apple sign-in windows close by themselves after you sign in.
- **Fixes:** video sound on Windows, black flashes while scrolling, and the blank Task Manager icon.

## Known limits

- Packages are unsigned. Windows SmartScreen and macOS Gatekeeper may show a warning. On macOS, right-click X-Now and choose **Open** the first time.
- The unmute setting depends on an autoplay switch that applies to every X-Now page, including sign-in windows.
- Focus layout depends on X's current page layout.
- No Windows ARM64 build.

## More

- [Changelog](https://github.com/benedictusrey/X-Now/blob/main/CHANGELOG.md)
- [Full implementation record](https://github.com/benedictusrey/X-Now/blob/main/docs/releases/X-Now_v2.5.0-record.md)
