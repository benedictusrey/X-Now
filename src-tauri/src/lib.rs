#[cfg(windows)]
mod audio;
mod tray;

use std::{
    fs,
    io::Read,
    path::PathBuf,
    process::Command,
    sync::{
        atomic::{AtomicBool, AtomicU32, Ordering},
        Arc, Mutex,
    },
    time::{SystemTime, UNIX_EPOCH},
};

use tauri::{
    webview::NewWindowResponse, window::Color, AppHandle, Manager, WebviewUrl, WebviewWindowBuilder,
};
use tauri_plugin_shell::ShellExt;

const X_WINDOW_LABEL: &str = "x";
const X_HELPER_SCRIPT: &str = include_str!("../../frontend/x-tools.js");

/// Guards the playback watchdog so it is spawned exactly once per process,
/// no matter how many times the X window is (re)launched.
static WATCHDOG_STARTED: AtomicBool = AtomicBool::new(false);

/// Labels for OAuth popup windows created by the login flow (X's Google/Apple
/// sign-in opens `target=_blank` popups that relay the token back via
/// `postMessage` — they must open INSIDE the app, not in an external browser).
static POPUP_COUNTER: AtomicU32 = AtomicU32::new(0);

fn x_data_directory(app: &AppHandle) -> Result<PathBuf, String> {
    // Keep the existing Personal WebView2 data directory so removing the
    // profile manager does not sign the current X session out.
    app.path()
        .app_data_dir()
        .map(|path| path.join("profiles").join("profile-personal"))
        .map_err(|error| error.to_string())
}

fn is_safe_http_url(url: &str) -> bool {
    (url.starts_with("https://") || url.starts_with("http://")) && !url.contains(['\r', '\n'])
}

/// JS that pauses everything via the page helpers and returns a diagnostics report.
const PAUSE_JS: &str = r#"(function(){
    if (window.__onWindowHidden) window.__onWindowHidden();
    return window.__xnowPauseReport ? window.__xnowPauseReport() : 'no-report';
})()"#;

/// JS that returns the current page-state diagnostics (for re-checks).
/// NOTE: must be an IIFE — WebView2's ExecuteScript rejects top-level `return`.
const REPORT_JS: &str = r#"(function(){
    // Pick the AUDIBLE video: the tools' active video, else the first
    // currently-playing one, else the first video element. Sampling only the
    // first element was misleading — X preloads neighbor videos, and the
    // first element may not be the one that is actually playing.
    var _pickVideo = function() {
        var v = (window.__xnowActiveVideo && window.__xnowActiveVideo()) || null;
        if (!v) {
            var vs = document.querySelectorAll('video');
            for (var i = 0; i < vs.length; i++) { if (!vs[i].paused) { v = vs[i]; break; } }
            v = v || vs[0] || null;
        }
        return v;
    };
    return JSON.stringify({
        url: location.href,
        title: document.title,
        ready: document.readyState,
        hasPause: typeof window.__onWindowHidden,
        hasResume: typeof window.__resumeIfNeeded,
        hasReport: typeof window.__xnowPauseReport,
        hasToast: typeof window.showToast,
        media: document.querySelectorAll('video, audio').length,
        mediaMuted: (function(){ var v = _pickVideo(); return v ? v.muted : null; })(),
        mediaVolume: (function(){ var v = _pickVideo(); return v ? v.volume : null; })(),
        mediaPaused: (function(){ var v = _pickVideo(); return v ? v.paused : null; })()
    });
})()"#;

/// Pause playback when the window becomes hidden/minimized. Layered:
/// page-side pause (in `__onWindowHidden`), then a hard mute of this app's
/// Windows audio sessions as a guarantee.
fn pause_media_for_hidden(w: &tauri::WebviewWindow) {
    let _ = w.eval_with_callback(PAUSE_JS, |report| {
        eprintln!("[X-Now] Watchdog pause report: {}", report);
    });
    // Re-check a moment later: if the player engine re-played it, the report
    // will show it (and the OS-level session mute still guarantees silence).
    let w2 = w.clone();
    std::thread::spawn(move || {
        std::thread::sleep(std::time::Duration::from_millis(2500));
        let _ = w2.eval_with_callback(REPORT_JS, |report| {
            eprintln!("[X-Now] Watchdog recheck: {}", report);
        });
    });
    #[cfg(windows)]
    if audio::set_app_audio_mute(true) {
        eprintln!("[X-Now] Watchdog: audio sessions muted");
    } else {
        eprintln!("[X-Now] Watchdog: no audio session found to mute");
    }
}

/// Resume playback when the window becomes visible again.
fn resume_media_for_visible(w: &tauri::WebviewWindow) {
    let _ = w.eval("if (window.__resumeIfNeeded) window.__resumeIfNeeded();");
    let _ = w.eval_with_callback(REPORT_JS, |report| {
        eprintln!("[X-Now] Watchdog visible report: {}", report);
    });
    #[cfg(windows)]
    if audio::set_app_audio_mute(false) {
        eprintln!("[X-Now] Watchdog: audio sessions unmuted");
    }
}

/// Playback watchdog for the X window.
///
/// Some WebView2/WebKit builds never fire `visibilitychange` (or a resize
/// event) for a minimized window, so the page would keep playing audio in the
/// background. This thread polls the REAL window state and drives the page
/// helpers on every hidden/visible transition. Cheap: two state reads every
/// 800 ms, and the page eval only runs on a state CHANGE.
fn watch_x_window(w: tauri::WebviewWindow) {
    // Fail-safe direction: if a state query errors (e.g. the window was
    // destroyed), treat the window as HIDDEN so playback gets paused.
    let state_hidden = || w.is_minimized().unwrap_or(true) || !w.is_visible().unwrap_or(false);
    let mut last_hidden = state_hidden();
    #[cfg(windows)]
    let mut unmute_ticks = 0u32;
    #[cfg(windows)]
    let mut startup_unmuted = false;
    let mut startup_ticks = 0u32;
    let mut startup_reported = false;
    loop {
        std::thread::sleep(std::time::Duration::from_millis(800));
        let hidden = state_hidden();
        // Windows PERSISTS a session's mute state across app restarts
        // (per-app Volume Mixer store). If the previous session exited while
        // muted (pause-on-minimize), this cold start would begin OS-muted —
        // with no hidden/visible transition ever firing, nothing would unmute
        // it and the app would be silent while the page plays fine. Retry the
        // unmute until a session actually exists (the WebView2 session appears
        // seconds after launch), capped at ~48 s. (Windows-only: audio.rs /
        // Core Audio is cfg(windows).)
        #[cfg(windows)]
        {
            if !startup_unmuted {
                unmute_ticks += 1;
                if unmute_ticks >= 3 && !hidden {
                    if audio::set_app_audio_mute(false) {
                        startup_unmuted = true;
                        eprintln!(
                            "[X-Now] Watchdog: startup unmute (cleared persisted session mute)"
                        );
                        // Immediate evidence: session state right after clearing.
                        audio::report_audio_state();
                    } else if unmute_ticks >= 60 {
                        startup_unmuted = true; // no session appeared — nothing to clear
                        eprintln!("[X-Now] Watchdog: startup unmute gave up (no session appeared)");
                    }
                }
            }
        }
        if hidden && !last_hidden {
            eprintln!("[X-Now] Watchdog: window hidden -> pausing media");
            pause_media_for_hidden(&w);
        } else if !hidden && last_hidden {
            eprintln!("[X-Now] Watchdog: window visible -> resuming media");
            resume_media_for_visible(&w);
        }
        last_hidden = hidden;
        // Cold-start diagnostic: ~20 s after launch, with no hidden/visible
        // transition yet, dump the TRUE fresh-launch page state (muted?
        // volume?) — the E2E evidence that the startup audio defaults hold
        // BEFORE any minimize/restore cycle.
        if !startup_reported {
            if hidden {
                startup_reported = true; // a transition happened first; skip
            } else {
                startup_ticks += 1;
                if startup_ticks >= 25 {
                    startup_reported = true;
                    let _ = w.eval_with_callback(REPORT_JS, |report| {
                        eprintln!("[X-Now] Watchdog startup report: {}", report);
                    });
                    // OS-level evidence: session mute + master volume.
                    #[cfg(windows)]
                    audio::report_audio_state();
                }
            }
        }
    }
}

pub fn launch_x_internal(app: &AppHandle, start_minimized: bool) -> Result<(), String> {
    let profile_data_dir = x_data_directory(app)?;
    fs::create_dir_all(&profile_data_dir).map_err(|error| error.to_string())?;

    if let Some(window) = app.get_webview_window(X_WINDOW_LABEL) {
        // Autostart (`--minimized`) never pops a window over the user's work.
        if !start_minimized {
            let _ = window.unminimize();
            let _ = window.show();
            let _ = window.set_focus();
        }
        return Ok(());
    }

    let browser_app = app.clone();
    let navigation_app = app.clone();
    let popup_app = app.clone();

    // Signed-in handle cache for the titlebar (TikTok-Now pattern): X's SPA
    // overwrites `document.title` on route changes / unread counts, so the
    // native title is re-applied from this cache whenever the page title
    // changes to anything else.
    let username_cache: Arc<Mutex<Option<String>>> = Arc::new(Mutex::new(None));
    let cache_for_title = username_cache.clone();
    let window = WebviewWindowBuilder::new(
        app,
        X_WINDOW_LABEL,
        WebviewUrl::External("https://x.com/".parse().unwrap()),
    )
    .title("X-Now")
    .inner_size(1300.0, 850.0)
    .min_inner_size(900.0, 600.0)
    .resizable(true)
    .center()
    .visible(!start_minimized)
    .data_directory(profile_data_dir)
    .initialization_script(X_HELPER_SCRIPT)
    // ── OAuth popup manager & external-link router ─────────────────────────
    // X's Google/Apple sign-in opens `target=_blank` popups (accounts.google.com
    // / appleid.apple.com) that relay the token back to x.com via postMessage.
    // They MUST open as managed in-app windows — an external browser breaks the
    // relay. Everything else that opens a new window goes to the OS browser.
    .on_new_window(move |url, features| {
        let host = url.host_str().unwrap_or("");
        let path = url.path();
        let is_x = host == "x.com" || host.ends_with(".x.com") || host == "twitter.com" || host.ends_with(".twitter.com");
        let is_auth_provider = host.contains("google")
            || host.contains("apple")
            || host.contains("microsoft")
            || path.contains("login")
            || path.contains("auth")
            || path.contains("sso")
            || path.contains("passport");

        if is_auth_provider || (is_x && (path.contains("login") || path.contains("auth"))) {
            let label = format!("popup-{}", POPUP_COUNTER.fetch_add(1, Ordering::Relaxed));
            eprintln!("[X-Now] Intercepted OAuth login window: {}", url);

            let (w, h) = features
                .size()
                .map(|s| (s.width as f64, s.height as f64))
                .unwrap_or((540.0, 700.0));

            #[cfg(windows)]
            let env = features.opener().environment.clone();

            let app_close = popup_app.clone();
            let label_close = label.clone();
            let close_once = Arc::new(AtomicBool::new(false));
            let flag_nav = close_once.clone();

            let mut builder = WebviewWindowBuilder::new(
                &popup_app,
                label,
                WebviewUrl::External(url.clone()),
            )
            .title("X-Now — Sign in")
            .inner_size(w.max(500.0), h.max(600.0))
            .center()
            .background_color(Color(15, 20, 25, 255))
            .initialization_script(r#"
                (function() {
                    var darkStyle = document.createElement('style');
                    darkStyle.textContent = 'html, body { background-color: #0f1419 !important; color: #fff !important; }';
                    (document.head || document.documentElement).appendChild(darkStyle);

                    setInterval(function() {
                        var host = location.hostname;
                        var isX = host === 'x.com' || host.endsWith('.x.com') ||
                                  host === 'twitter.com' || host.endsWith('.twitter.com');
                        // OAuth redirects back to x.com once the token relay
                        // (postMessage) has fired — the popup's job is done.
                        if (isX) window.close();
                    }, 300);
                })();
            "#)
            .on_navigation(move |nav_url| {
                let host = nav_url.host_str().unwrap_or("");
                let is_x = host == "x.com" || host.ends_with(".x.com") || host == "twitter.com" || host.ends_with(".twitter.com");
                if is_x && !flag_nav.load(Ordering::Relaxed) {
                    flag_nav.store(true, Ordering::Relaxed);
                    let app = app_close.clone();
                    let label = label_close.clone();
                    std::thread::spawn(move || {
                        std::thread::sleep(std::time::Duration::from_millis(50));
                        if let Some(popup) = app.get_webview_window(&label) {
                            let _ = popup.close();
                        }
                        if let Some(main) = app.get_webview_window(X_WINDOW_LABEL) {
                            let _ = main.show();
                            let _ = main.set_focus();
                            let _ = main.eval("window.location.reload();");
                        }
                    });
                }
                true
            });

            #[cfg(windows)]
            {
                builder = builder.with_environment(env);
            }

            match builder.build() {
                Ok(popup) => NewWindowResponse::Create { window: popup },
                Err(_) => NewWindowResponse::Allow,
            }
        } else if !is_x {
            eprintln!("[X-Now] External hyperlink in new window ({}), launching OS default browser...", url);
            let _ = open_external_url(browser_app.clone(), url.to_string());
            NewWindowResponse::Deny
        } else {
            NewWindowResponse::Allow
        }
    })
    .on_navigation(move |url| {
        let host = url.host_str().unwrap_or("");
        let is_x = host == "x.com" || host.ends_with(".x.com") || host == "twitter.com" || host.ends_with(".twitter.com");
        if is_x {
            return true;
        }
        // Same-window navigation to anything outside X (e.g. a redirect to an
        // external site) is routed to the OS default browser instead.
        eprintln!("[X-Now] External link intercepted ({}), opening in OS default browser...", url);
        let _ = open_external_url(navigation_app.clone(), url.to_string());
        false
    })
    // ── Titlebar Username & OAuth Popup Sweeper ────────────────────────────
    // The tools script sets `document.title` to `XNOW:<handle>` once the
    // signed-in profile link appears — i.e. AFTER the OAuth token relay
    // (postMessage) has already completed. Two jobs happen here, mirroring
    // TikTok-Now's handler:
    //  1. Surface the handle as "X-Now (@handle)" in the native titlebar.
    //  2. Sweep: close ANY remaining `popup-*` OAuth windows. X's Google
    //     sign-in (GIS) can leave the popup on accounts.google.com forever
    //     (it never navigates back to x.com), so the popup's own self-close
    //     never fires — this title signal is the guaranteed close moment.
    .on_document_title_changed(move |window, page_title| {
        let app = window.app_handle().clone();
        if let Some(user) = page_title.strip_prefix("XNOW:") {
            let user = user.trim().to_string();
            let is_pure_numeric = !user.is_empty() && user.chars().all(|c| c.is_ascii_digit());

            if !user.is_empty() && !is_pure_numeric {
                *cache_for_title.lock().unwrap() = Some(user.clone());
            }

            // Immediately close ALL open OAuth popup windows upon login!
            let popup_labels: Vec<String> = app
                .webview_windows()
                .keys()
                .filter(|label| label.starts_with("popup-"))
                .cloned()
                .collect();
            for label in popup_labels {
                eprintln!("[X-Now] Login detected — closing popup window '{}'", label);
                if let Some(popup) = app.get_webview_window(&label) {
                    let _ = popup.close();
                }
            }

            let _ = window.show();
            let _ = window.set_focus();

            let cached = cache_for_title.lock().unwrap().clone();
            let new_title = if let Some(u) = cached {
                format!("X-Now (@{})", u)
            } else if !user.is_empty() && !is_pure_numeric {
                format!("X-Now (@{})", user)
            } else {
                "X-Now".to_string()
            };
            let _ = window.set_title(&new_title);
        } else {
            // X's SPA overwrote the page title (route change, unread count…):
            // re-apply the cached signed-in handle so the titlebar stays put.
            let cached = cache_for_title.lock().unwrap().clone();
            if let Some(u) = cached {
                let _ = window.set_title(&format!("X-Now (@{})", u));
            }
        }
    })
    .build()
    .map_err(|error| error.to_string())?;

    if !start_minimized {
        window.unminimize().map_err(|error| error.to_string())?;
        window.show().map_err(|error| error.to_string())?;
        window.set_focus().map_err(|error| error.to_string())?;
    }

    // Start the playback watchdog exactly once for this window. It polls the
    // REAL window state (minimized/visible) and applies the layered pause /
    // resume on transitions, plus the Windows session unmute retry.
    if !WATCHDOG_STARTED.swap(true, Ordering::Relaxed) {
        let w = window.clone();
        std::thread::spawn(move || watch_x_window(w));
    }

    Ok(())
}

#[tauri::command]
fn open_external_url(app: AppHandle, url: String) -> Result<(), String> {
    if !is_safe_http_url(&url) {
        return Err("Only safe HTTP(S) URLs can be opened externally.".to_string());
    }

    app.shell()
        .open(url, None)
        .map_err(|error| error.to_string())
}

#[tauri::command]
fn prepare_download_folder(app: AppHandle) -> Result<String, String> {
    let download_dir = app
        .path()
        .download_dir()
        .map_err(|error| error.to_string())?
        .join("X-Now");
    fs::create_dir_all(&download_dir).map_err(|error| error.to_string())?;
    Ok(download_dir.to_string_lossy().into_owned())
}

fn media_target_path(app: &AppHandle, media_type: &str) -> Result<PathBuf, String> {
    let extension = if media_type.eq_ignore_ascii_case("video") {
        "mp4"
    } else {
        "jpg"
    };
    let download_dir = app
        .path()
        .download_dir()
        .map_err(|error| error.to_string())?
        .join("X-Now");
    fs::create_dir_all(&download_dir).map_err(|error| error.to_string())?;
    let timestamp = SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .map_err(|error| error.to_string())?
        .as_millis();
    Ok(download_dir.join(format!(
        "X-Now-{}-{timestamp}.{extension}",
        if extension == "mp4" { "Video" } else { "Image" }
    )))
}

fn validate_mp4_file(path: &PathBuf) -> Result<(), String> {
    let mut file = fs::File::open(path).map_err(|error| error.to_string())?;
    let mut header = [0_u8; 8];
    file.read_exact(&mut header).map_err(|_| {
        "The downloaded video was only a media fragment, not a complete MP4.".to_string()
    })?;
    if &header[4..8] != b"ftyp" {
        return Err(
            "The downloaded video was only a media fragment, not a complete MP4.".to_string(),
        );
    }
    Ok(())
}

#[tauri::command]
async fn download_media(
    app: AppHandle,
    url: String,
    media_type: String,
    referer: Option<String>,
) -> Result<String, String> {
    if !is_safe_http_url(&url) {
        return Err("X did not provide a downloadable HTTP(S) media URL.".to_string());
    }

    let target_path = media_target_path(&app, &media_type)?;
    let referer = referer
        .filter(|value| is_safe_http_url(value))
        .unwrap_or_else(|| "https://x.com/".to_string());

    tokio::task::spawn_blocking(move || -> Result<String, String> {
        // Windows ships `curl.exe`; macOS/Linux use the system `curl`.
        let curl = if cfg!(windows) { "curl.exe" } else { "curl" };
        let status = Command::new(curl)
            .args([
                "--fail",
                "--location",
                "--silent",
                "--show-error",
                "--retry",
                "2",
                "--connect-timeout",
                "20",
                "--max-time",
                "300",
                "--user-agent",
                "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36",
                "--referer",
            ])
            .arg(referer)
            .args(["--header", "Accept: */*", "--output"])
            .arg(&target_path)
            .arg(&url)
            .status()
            .map_err(|error| format!("Unable to start {curl}: {error}"))?;

        if !status.success() {
            let _ = fs::remove_file(&target_path);
            return Err(format!("{curl} exited with status {status}"));
        }

        let metadata = fs::metadata(&target_path).map_err(|error| error.to_string())?;
        if metadata.len() == 0 {
            let _ = fs::remove_file(&target_path);
            return Err("The downloaded media file was empty.".to_string());
        }
        if media_type.eq_ignore_ascii_case("video") {
            if let Err(error) = validate_mp4_file(&target_path) {
                let _ = fs::remove_file(&target_path);
                return Err(error);
            }
        }

        Ok(target_path.to_string_lossy().into_owned())
    })
    .await
    .map_err(|error| error.to_string())?
}

#[tauri::command]
async fn save_media_bytes(
    app: AppHandle,
    data: Vec<u8>,
    media_type: String,
) -> Result<String, String> {
    if data.is_empty() {
        return Err("X returned an empty media response.".to_string());
    }

    let target_path = media_target_path(&app, &media_type)?;
    tokio::task::spawn_blocking(move || -> Result<String, String> {
        if media_type.eq_ignore_ascii_case("video") && data.len() < 8 {
            return Err(
                "The downloaded video was only a media fragment, not a complete MP4.".to_string(),
            );
        }
        if media_type.eq_ignore_ascii_case("video") && &data[4..8] != b"ftyp" {
            return Err(
                "The downloaded video was only a media fragment, not a complete MP4.".to_string(),
            );
        }
        fs::write(&target_path, data).map_err(|error| error.to_string())?;
        let metadata = fs::metadata(&target_path).map_err(|error| error.to_string())?;
        if metadata.len() == 0 {
            let _ = fs::remove_file(&target_path);
            return Err("The saved media file was empty.".to_string());
        }
        Ok(target_path.to_string_lossy().into_owned())
    })
    .await
    .map_err(|error| error.to_string())?
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_shell::init())
        // Launch-on-startup support; the app reads the `--minimized` argument
        // itself and starts hidden to the tray (autostart never pops a window).
        .plugin(tauri_plugin_autostart::init(
            tauri_plugin_autostart::MacosLauncher::LaunchAgent,
            Some(vec!["--minimized"]),
        ))
        .invoke_handler(tauri::generate_handler![
            open_external_url,
            prepare_download_folder,
            download_media,
            save_media_bytes
        ])
        .setup(|app| {
            if let Err(error) = tray::setup_tray(app.handle()) {
                eprintln!("[X-Now] Tray setup failed: {error}");
            }

            // Launch hidden to tray when started by the OS autostart feature.
            let start_minimized = std::env::args().any(|arg| arg == "--minimized");

            if let Err(error) = launch_x_internal(app.handle(), start_minimized) {
                eprintln!("[X-Now] Failed to launch X: {error}");
            }

            Ok(())
        })
        .on_window_event(|window, event| match event {
            tauri::WindowEvent::CloseRequested { api, .. } => {
                if window.label() == X_WINDOW_LABEL {
                    // Minimal, deterministic close-to-tray: prevent the close
                    // FIRST, pause via a plain eval (no callbacks/threads/COM —
                    // those were observed to race with the OS close processing
                    // and occasionally let the window be destroyed), then hide.
                    // The watchdog's hidden-transition applies the full layered
                    // pause within ~800 ms.
                    api.prevent_close();
                    if let Some(win) = window.get_webview_window(X_WINDOW_LABEL) {
                        let _ = win.eval("if (window.__onWindowHidden) window.__onWindowHidden();");
                        let _ = win.hide();
                    }
                }
            }
            // Fast path: tao emits Resized(0x0) the moment the window minimizes,
            // while the watchdog polls at 800 ms. Pause immediately here too.
            tauri::WindowEvent::Resized(_) => {
                if window.label() == X_WINDOW_LABEL && window.is_minimized().unwrap_or(false) {
                    if let Some(win) = window.get_webview_window(X_WINDOW_LABEL) {
                        pause_media_for_hidden(&win);
                    }
                }
            }
            _ => {}
        })
        .run(tauri::generate_context!())
        .expect("error while running X-Now");
}
