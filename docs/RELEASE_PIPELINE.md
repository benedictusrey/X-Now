# X-Now v2.1.0 release pipeline: Azure DevOps guide

This repository uses Azure Pipelines as a manual build service. The pipeline builds the installers, validates the packages, and makes them available for download. It does not push files to GitHub or publish a GitHub Release for you.

## Build matrix

| Job | Agent | Output |
|---|---|---|
| `build_windows` | `windows-latest` | Windows x64 NSIS `.exe` and WiX `.msi` |
| `build_linux` | `ubuntu-24.04` | Linux x64 `.AppImage`, `.deb`, and `.rpm` |
| `build_macos` | `macos-15` | One universal `.dmg` containing arm64 and x86_64 code |
| `package_release` | `ubuntu-24.04` | Combined artifact with installers, branding assets, and SHA-256 manifests |

A universal installer means one macOS installer containing both Apple Silicon and Intel binaries. Windows and Linux still receive their own native packages. There is no single installer that runs on all three operating systems.

The pipeline validates:

- Version `2.1.0` in `src-tauri/tauri.conf.json` and `src-tauri/Cargo.toml`.
- The presence of `src-tauri/Cargo.lock`.
- The requested root icons in `icons/`, including `icon.ico` and `icon.png`.
- The required package type for every platform.
- Both `arm64` and `x86_64` slices in the macOS application with `lipo`.
- SHA-256 checksums for the Azure artifact and the GitHub upload folder.

## Before you start

1. Commit and push `azure-pipelines.yml` at the repository root. The file must exist in the branch that Azure will build.
2. Commit the v2.1.0 application files and the release Markdown before creating the final GitHub release.
3. Keep the repository private if that is your preference. Azure can build a private GitHub repository after you authorize its GitHub connection.
4. The current pipeline creates unsigned packages. Windows SmartScreen and macOS Gatekeeper can display warnings. Signing and notarization require additional certificates and secret variables.

The Azure free-tier rules can change. Check the current [Microsoft-hosted parallel jobs and limits](https://learn.microsoft.com/en-us/azure/devops/pipelines/licensing/concurrent-jobs?view=azure-devops) before planning a large build.

## 1. Create the Azure DevOps project

1. Open [Azure DevOps](https://dev.azure.com/) and sign in.
2. Create or select an organization.
3. Create a project named **X-Now**.
4. Set the project visibility to **Private**. The GitHub repository can remain private.
5. Open **Pipelines** in the left menu and select **New pipeline**.
6. Choose **GitHub** as the source.
7. Authorize Azure DevOps to access GitHub when prompted.
8. Select the private repository **benedictusrey/X-Now**.
9. Choose **Existing Azure Pipelines YAML file**.
10. Select branch **main** and file **/azure-pipelines.yml**.
11. Select **Continue**, review the YAML, and choose **Run** or **Save**.

If Azure cannot see the repository, return to the GitHub authorization screen and grant access to the specific private repository. Do not make the repository public just to solve an authorization problem.

## 2. Run the v2.1.0 build

The YAML has `trigger: none`, so it does not run on every push.

1. Open **Pipelines** and select the X-Now pipeline.
2. Select **Run pipeline**.
3. Choose the **main** branch.
4. Set the version parameter to **2.1.0**.
5. Select **Run**.
6. Open the run and watch the four jobs.

The three platform jobs can run independently. If your private Azure organization has only one Microsoft-hosted parallel job, Azure queues the jobs and runs them one at a time. That is expected. The `package_release` job starts only after all three platform jobs succeed.

## 3. Download the combined artifact

When `package_release` is green:

1. Open the completed pipeline run.
2. Open the **Summary** page.
3. In **Artifacts**, select **x-now-v2.1.0-release**.
4. Download the artifact and extract it on your computer.

The useful folder is:

```text
x-now-v2.1.0-release/
├── github-assets/       # upload these files to the GitHub Release
│   ├── *.exe
│   ├── *.msi
│   ├── *.AppImage
│   ├── *.deb
│   ├── *.rpm
│   ├── *.dmg
│   └── SHA256SUMS.txt
├── windows/             # Windows packages plus the platform checksum file
├── linux/               # Linux packages plus the platform checksum file
├── macos/               # universal DMG plus the platform checksum file
├── branding/            # icon.ico, icon.png, and icon.icns
├── BUILD_INFO.txt
└── SHA256SUMS.txt       # checksums with platform-relative paths
```

For GitHub, use the installer files and `SHA256SUMS.txt` inside `github-assets/`. The manifest in that folder uses the same flat filenames as the GitHub Release assets.

Azure stores downloadable pipeline artifacts separately from the source repository. See Microsoft's [Publish and download pipeline artifacts](https://learn.microsoft.com/en-us/azure/devops/pipelines/artifacts/pipeline-artifacts?view=azure-devops) documentation for the current Azure interface.

## 4. Verify the downloads

### Windows

Open PowerShell in the `github-assets` folder:

```powershell
Get-FileHash .\X-Now_2.1.0_x64-setup.exe -Algorithm SHA256
```

Compare the resulting hash with the matching line in `SHA256SUMS.txt`. Use the actual filename produced by the pipeline if it differs.

### Linux or macOS

Open a terminal in the `github-assets` folder:

```bash
shasum -a 256 -c SHA256SUMS.txt
```

On Linux, `sha256sum -c SHA256SUMS.txt` provides the same check.

A successful verification reports `OK` for every installer. Do not install a package whose hash does not match.

## 5. Create the private GitHub Release

1. Open the private repository on GitHub.
2. Select **Releases**.
3. Select **Draft a new release**.
4. Choose the existing tag **v2.1.0**, or create that tag from the final commit if it does not exist.
5. Set the release title to **X-Now v2.1.0**.
6. Paste the contents of `RELEASE_NOTES.md` into the release description, or use the same headings and text.
7. Upload every installer from `github-assets/`:
   - Windows: `.exe` and `.msi`.
   - Linux: `.AppImage`, `.deb`, and `.rpm`.
   - macOS: the universal `.dmg`.
8. Upload `github-assets/SHA256SUMS.txt`.
9. Review the asset names and release description.
10. Use **Publish release** only after the manual smoke tests pass.

GitHub Release assets remain private when the repository is private. The branding files do not need to be uploaded as release assets.

## 6. Test one installer per platform

### Windows

- Use Windows 10 or 11 on an x64 machine.
- Confirm that WebView2 is installed.
- Install the NSIS `.exe` or WiX `.msi`.
- Sign in, open the tray menu, test Show / Hide, Always on top, Launch on Startup, media saving, and an external link.
- Confirm the X-Now icon appears in the installer, taskbar, window, and tray.

### macOS

- Use macOS 11 or newer.
- Open the universal DMG and copy X-Now to Applications.
- Approve the unsigned application through the right-click **Open** action.
- Confirm the application launches on both an Apple Silicon Mac and an Intel Mac when available.
- Test the tray menu, About card, startup option, media saving, and external links.

### Linux

- Use an x64 Linux distribution with WebKitGTK 4.1.
- Test the AppImage first.
- Install the DEB or RPM on a matching distribution when possible.
- On GNOME, install an AppIndicator extension if the tray icon is not visible.
- Test the tray menu, media saving, and external links.

## Troubleshooting

| Symptom | Action |
|---|---|
| Azure cannot list the private repository | Re-authorize the Azure DevOps GitHub connection and grant access to `benedictusrey/X-Now`. |
| Jobs remain queued | Your organization is using one hosted parallel job. Wait for the earlier job to finish, or request more parallelism. |
| Version validation fails | Keep the version in `Cargo.toml`, `tauri.conf.json`, the pipeline parameter, and the release tag aligned. |
| An icon validation step fails | Confirm `icons/icon.ico`, `icons/icon.png`, `icons/icon.icns`, and the required size-specific PNG files are committed. |
| Linux build cannot find WebKitGTK | Check the `apt-get` step and the availability of the Ubuntu hosted image. |
| macOS reports a missing architecture | The universal build must contain both `arm64` and `x86_64`; inspect the `lipo` output before downloading the artifact. |
| Windows or macOS shows a trust warning | The current pipeline does not sign or notarize packages. Verify the SHA-256 checksum and approve only packages you built and checked. |

## Future releases

For a future version:

1. Update `src-tauri/Cargo.toml`, `src-tauri/tauri.conf.json`, and the release Markdown.
2. Update the default `version` parameter in `azure-pipelines.yml`.
3. Run the source checks and commit the changes.
4. Push the commit to `main`.
5. Run Azure Pipelines with the matching version.
6. Verify the combined artifact and test each platform.
7. Create the matching GitHub tag and private release.
8. Upload the files from `github-assets/` and publish the release.

The Azure pipeline never moves tags, rewrites Git history, or publishes to GitHub automatically.

---

Maintained by [@benedictusrey](https://github.com/benedictusrey).
