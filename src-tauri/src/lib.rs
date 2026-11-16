// Copyright (c) 2026 Benedictus Reynaldo Hartanto (@benedictusrey). All rights reserved.
// X-Now — High-performance desktop client for X (https://github.com/benedictusrey/X-Now)
// Licensed under the MIT License.

#[cfg(windows)]
mod audio;
mod settings;
mod tray;
#[cfg(windows)]
mod webview_sleep;

use std::{
    fs,
    io::Read,
    path::PathBuf,
    process::Command,
    sync::{
        atomic::{AtomicBool, AtomicU32, Ordering},
        Arc, Condvar, Mutex,
    },
    time::{SystemTime, UNIX_EPOCH},
};

use tauri::{
    webview::NewWindowResponse, window::Color, AppHandle, Manager, Url, WebviewUrl,
    WebviewWindowBuilder,
};
use tauri_plugin_shell::ShellExt;

const X_WINDOW_LABEL: &str = "x";
/// Page scripts, injected in this order: media tools and overlays first, then
/// the rail controls and the Settings panel that build on them. The brand icon
/// placeholder becomes a data URI, so the page needs no asset protocol.
fn helper_script() -> String {
    let brand = base64::Engine::encode(
        &base64::engine::general_purpose::STANDARD,
        include_bytes!("../../icons/128x128.png"),
    );
    concat!(
        include_str!("../../frontend/x-tools.js"),
        include_str!("../../frontend/x-rail.js"),
        include_str!("../../frontend/x-settings.js"),
    )
    .replace(
        "__XNOW_BRAND_ICON__",
        &format!("data:image/png;base64,{brand}"),
    )
}

/// WebView2 browser arguments for the X window. The wry defaults
/// (--disable-features=msWebOOUI,msPdfOOUI,msSmartScreenProtection) are kept
/// and joined with the two rendering fixes below — overriding the args
/// REPLACES the defaults, so the defaults must be spelled out here.
///
/// 1. CalculateNativeWinOcclusion is DISABLED because Chromium's native-window
///    occlusion tracker on Windows misclassifies this window during heavy GPU
///    churn — exactly what X's feed does when video posts start/stop around
///    static text/image posts — and then treats the window as "occluded": the
///    compositor throttles/skips frame production and the restored window
///    paints as a bleached surface until another resize forces a repaint.
///
/// 2. --disable-direct-composition-video-overlays (the switch) because
///    Chromium's DirectComposition video OVERLAY planes detach/re-attach on
///    every window geometry change; during a restore/resize the overlay and
///    the compositor surface resize out of sync, leaving a one-frame BLACK
///    BAND at the window edge (the dark default background showing where the
///    overlay had been — the "shadowing" glitch reports). With overlays off,
///    video is composited into the normal surface and follows every geometry
///    change atomically. Each fix is independently toggleable for bisecting:
///    --no-occlusion-fix / --no-gpu-video-overlays-fix.
/// --autoplay-policy lets "Unmute videos when X-Now is active" play with sound right
/// after launch. The page still decides the mute state; this only lifts the autoplay block.
const DEFAULT_WEBVIEW_BROWSER_ARGS: &str = "--disable-features=msWebOOUI,msPdfOOUI,msSmartScreenProtection,CalculateNativeWinOcclusion --disable-direct-composition-video-overlays --autoplay-policy=no-user-gesture-required";

/// Guards the playback watchdog so it is spawned exactly once per process,
/// no matter how many times the X window is (re)launched.
static WATCHDOG_STARTED: AtomicBool = AtomicBool::new(false);

/// Webview diagnostics mode (`--webview-diagnostics`): set once at launch,
/// read by the watchdog and the window-event paths to gate the detailed
/// per-transition logging (GPU, webview, audio state).
static WEBVIEW_DIAGNOSTICS: AtomicBool = AtomicBool::new(false);

/// Wake signal for the playback watchdog: window events (restore, focus,
/// resize, close, tray show/hide) interrupt the watchdog's wait so a
/// hidden↔visible transition is applied IMMEDIATELY instead of at the next
/// poll tick. This is what lets the watchdog fall back to a 5 s cadence while
/// the window stays hidden (idle-aware battery/CPU savings) without delaying
/// the pause/resume reaction.
static WATCHDOG_WAKE: (Mutex<bool>, Condvar) = (Mutex::new(false), Condvar::new());

/// Safety-net cadence while the window stays hidden. The normal reaction is
/// event-driven (instant); this only bounds the delay for transitions no event
/// reaches (some driver/desktop edge paths bypass both Win32 messages and the
/// tao event loop).
const HIDDEN_POLL: std::time::Duration = std::time::Duration::from_secs(5);

/// wry's built-in WebView2 browser arguments (see wry 0.55's
/// `create_environment`): overriding `additional_browser_args` REPLACES them,
/// so they must always be re-stated in every composed argument string.
const WRY_DEFAULT_BROWSER_ARGS: &str =
    "--disable-features=msWebOOUI,msPdfOOUI,msSmartScreenProtection";

/// Chromium feature flag composing the occlusion workaround and its toggle
/// switches (see compose_webview_browser_args). GPU-compositor experiments go
/// through --webview-args (e.g. "--disable-gpu-compositing") rather than a
/// dedicated flag — the shipped GPU-side mitigation IS the occlusion fix.
const GPU_OCCLUSION_FIX_FEATURE: &str = "CalculateNativeWinOcclusion";

/// Chromium switch for the video-overlay workaround (see
/// DEFAULT_WEBVIEW_BROWSER_ARGS). A bare switch (not a feature), so it is
/// removed by exact token match, not from the --disable-features list.
const GPU_VIDEO_OVERLAY_SWITCH: &str = "--disable-direct-composition-video-overlays";

/// Per-launch configuration for the WebView2 GPU/occlusion workarounds and
/// the diagnostics mode.
///
/// CLI flags (checked in order, first match wins per group):
/// - `--webview-default` — restore the plain wry defaults AND the stock white
///   window background (drops both rendering workarounds; escape hatch if
///   either ever misbehaves).
/// - `--no-occlusion-fix` — drop only the occlusion-tracker fix, keep the
///   dark background and the video-overlay fix (bisecting).
/// - `--no-gpu-video-overlays-fix` — drop only the video-overlay fix, keep
///   the occlusion fix and the dark background (bisecting the black-band
///   workaround itself).
/// - `--webview-args "..."` — FULL override for support sessions (e.g.
///   `--webview-args "--disable-gpu-compositing"` to test the GPU compositor).
/// - `--webview-diagnostics` — log the webview's real GPU/runtime state.
///
/// `XNOW_WEBVIEW_ARGS` (environment) behaves like `--webview-args` for
/// installed copies where editing the shortcut is impractical.
#[derive(Debug, Clone, PartialEq, Eq)]
struct LaunchConfig {
    /// Final WebView2 browser arguments passed to wry.
    webview_args: String,
    /// Pin the window background to X's dark surface (the white-flash fix).
    /// `--webview-default` restores the stock white background. The runtime
    /// then RE-SYNCS this color to the page's real theme background (see
    /// detect_page_theme_color) so unpainted compositor gaps never contrast
    /// with the rendered content while scrolling.
    dark_background: bool,
    /// Log the webview GPU/runtime state at startup and on hidden/visible
    /// transitions (diagnostics mode).
    webview_diagnostics: bool,
}

impl LaunchConfig {
    /// Stock launch: wry defaults + the occlusion fix + the dark background
    /// (the shipped behavior).
    fn stock() -> Self {
        LaunchConfig {
            webview_args: DEFAULT_WEBVIEW_BROWSER_ARGS.to_string(),
            dark_background: true,
            webview_diagnostics: false,
        }
    }
}

/// Pure helper: compose the final browser-args string from the stock one and
/// an optional override.
///
/// - `Some(args)` wins wholesale — the caller's string is used verbatim (with
///   the wry defaults re-injected when absent, so a user override never
///   accidentally re-enables the msWebOOUI mini-menu or SmartScreen). An empty
///   string is treated as "not provided".
/// - `None` keeps the stock args.
fn compose_webview_browser_args(stock: &str, override_args: Option<&str>) -> String {
    let Some(args) = override_args.map(str::trim).filter(|args| !args.is_empty()) else {
        return stock.to_string();
    };
    // Re-inject the wry defaults unless the override already carries them:
    // they exist to suppress UI papercuts, not rendering behavior, and must
    // survive user experiments.
    if args.contains("msWebOOUI") {
        args.to_string()
    } else {
        format!("{WRY_DEFAULT_BROWSER_ARGS} {args}")
    }
}

/// Pure helper: drop one Chromium feature from a `--disable-features=` list
/// (used by the `--no-occlusion-fix` / `--no-gpu-fix` bisect switches).
fn remove_disabled_feature(args: &str, feature: &str) -> String {
    let mut result = String::with_capacity(args.len());
    for token in args.split_whitespace() {
        if let Some(list) = token.strip_prefix("--disable-features=") {
            let kept: Vec<&str> = list
                .split(',')
                .map(str::trim)
                .filter(|item| !item.is_empty() && *item != feature)
                .collect();
            if !kept.is_empty() {
                result.push_str("--disable-features=");
                result.push_str(&kept.join(","));
                result.push(' ');
            }
        } else {
            result.push_str(token);
            result.push(' ');
        }
    }
    result.trim_end().to_string()
}

/// Pure helper: drop one whole Chromium switch (e.g.
/// `--disable-direct-composition-video-overlays`) from a whitespace-separated
/// browser-args string (the overlay fix is a bare switch, not a
/// --disable-features list entry).
fn remove_browser_switch(args: &str, switch: &str) -> String {
    args.split_whitespace()
        .filter(|token| *token != switch)
        .collect::<Vec<_>>()
        .join(" ")
}

/// Resolve the per-launch configuration from the process arguments and the
/// `XNOW_WEBVIEW_ARGS` environment override.
fn resolve_launch_config<I, S>(args: I) -> LaunchConfig
where
    I: IntoIterator<Item = S>,
    S: AsRef<str>,
{
    let mut config = LaunchConfig::stock();
    let mut iter = args.into_iter().peekable();
    let mut explicit_override: Option<String> = None;

    while let Some(arg) = iter.next() {
        let arg = arg.as_ref();
        match arg {
            "--webview-default" => {
                // Plain wry behavior: the stock args minus BOTH rendering
                // workarounds, and the stock (white) window background back.
                // Orthogonal to --webview-diagnostics (flags stay
                // order-independent).
                config.webview_args =
                    remove_disabled_feature(&config.webview_args, GPU_OCCLUSION_FIX_FEATURE);
                config.webview_args =
                    remove_browser_switch(&config.webview_args, GPU_VIDEO_OVERLAY_SWITCH);
                config.dark_background = false;
            }
            "--no-occlusion-fix" => {
                config.webview_args =
                    remove_disabled_feature(&config.webview_args, GPU_OCCLUSION_FIX_FEATURE);
            }
            "--no-gpu-video-overlays-fix" => {
                config.webview_args =
                    remove_browser_switch(&config.webview_args, GPU_VIDEO_OVERLAY_SWITCH);
            }
            "--webview-args" => {
                explicit_override = iter.next().map(|value| value.as_ref().to_string());
            }
            other if other.starts_with("--webview-args=") => {
                explicit_override = Some(other["--webview-args=".len()..].to_string());
            }
            "--webview-diagnostics" => {
                config.webview_diagnostics = true;
            }
            _ => {}
        }
    }

    let flag_override = explicit_override.as_deref();
    if let Some(value) = flag_override {
        config.webview_args = compose_webview_browser_args(&config.webview_args, Some(value));
    }
    // Environment override (same semantics as --webview-args) for installed
    // copies. Its only precedence over the flag is that it also works when
    // the flag cannot be added (fixed shortcuts); when both are present the
    // flag wins as the more explicit signal.
    if explicit_override.is_none() {
        if let Ok(value) = std::env::var("XNOW_WEBVIEW_ARGS") {
            config.webview_args = compose_webview_browser_args(&config.webview_args, Some(&value));
        }
    }

    config
}

/// Interrupt the watchdog's wait so it re-evaluates the window state now.
fn wake_watchdog() {
    let mut pending = WATCHDOG_WAKE
        .0
        .lock()
        .unwrap_or_else(|error| error.into_inner());
    *pending = true;
    WATCHDOG_WAKE.1.notify_all();
}

/// Parse a CSS color string (`rgb(255, 255, 255)`, `#0f1419`, `transparent`)
/// into a native window color. Returns None when there is no opaque RGB
/// triple to pin (the caller keeps the current background).
fn parse_css_color_to_native(value: &str) -> Option<Color> {
    let v = value.trim().to_lowercase();
    if v.is_empty() || v == "transparent" {
        return None;
    }
    if let Some(hex) = v.strip_prefix('#') {
        // Slicing below counts bytes; a non-ASCII value would panic, and panic=abort kills the app.
        if !hex.is_ascii() {
            return None;
        }
        return match hex.len() {
            3 => Some(Color(
                u8::from_str_radix(&hex[0..1].repeat(2), 16).ok()?,
                u8::from_str_radix(&hex[1..2].repeat(2), 16).ok()?,
                u8::from_str_radix(&hex[2..3].repeat(2), 16).ok()?,
                255,
            )),
            6 => Some(Color(
                u8::from_str_radix(&hex[0..2], 16).ok()?,
                u8::from_str_radix(&hex[2..4], 16).ok()?,
                u8::from_str_radix(&hex[4..6], 16).ok()?,
                255,
            )),
            _ => None,
        };
    }
    if v.starts_with("rgb") {
        let nums: Vec<u8> = v
            .split(|c: char| !c.is_ascii_digit())
            .filter(|s| !s.is_empty())
            .filter_map(|s| s.parse::<u8>().ok())
            .collect();
        if nums.len() >= 3 {
            return Some(Color(nums[0], nums[1], nums[2], 255));
        }
    }
    // Bare "r,g,b" component list (the XNOWBG: title-ping payload).
    if !v.is_empty() && v.chars().all(|c| c.is_ascii_digit() || c == ',') {
        let parts: Vec<u8> = v.split(',').filter_map(|s| s.parse::<u8>().ok()).collect();
        if parts.len() == 3 {
            return Some(Color(parts[0], parts[1], parts[2], 255));
        }
    }
    None
}

/// The page tools ping the native side with the theme's background via a
/// `XNOWBG:r,g,b` document title. This applies it to the webview so the
/// unpainted-surface color matches the rendered theme exactly (a compositor
/// raster gap while scrolling then fills with the SAME color as the content
/// around it — invisible — instead of flashing dark-on-light or vice versa).
fn apply_page_theme_background(window: &tauri::WebviewWindow, css_rgb: &str) {
    if let Some(color) = parse_css_color_to_native(css_rgb) {
        if window.set_background_color(Some(color)).is_ok() {
            eprintln!(
                "[X-Now] Native background synced to page theme: #{:02x}{:02x}{:02x}",
                color.0, color.1, color.2
            );
        }
    }
}

/// Labels for OAuth popup windows created by the login flow (X's Google/Apple
/// sign-in opens `target=_blank` popups that relay the token back via
/// `postMessage` — they must open INSIDE the app, not in an external browser).
static POPUP_COUNTER: AtomicU32 = AtomicU32::new(0);

/// What X-Now does when a page asks to open a new window.
#[derive(Debug, PartialEq, Eq)]
enum NewWindow {
    /// Google, Apple or Microsoft sign-in: a managed popup that shares X's
    /// profile, so the token relay back to the opener still works.
    SignIn,
    /// X's own login or sign-up pages load in the main window. As a popup they
    /// closed themselves on the x.com hop and the main window never reloaded.
    MainWindow,
    /// Any other site: the OS default browser.
    External,
    /// Plain X pages: WebView2 opens them as usual.
    Allow,
}

/// Sign-in provider hosts, matched on whole host names only.
const SIGN_IN_HOSTS: [&str; 5] = [
    "accounts.google.com",
    "appleid.apple.com",
    "idmsa.apple.com",
    "login.microsoftonline.com",
    "login.live.com",
];

fn is_x_host(host: &str) -> bool {
    host == "x.com"
        || host.ends_with(".x.com")
        || host == "twitter.com"
        || host.ends_with(".twitter.com")
}

fn classify_new_window(url: &Url) -> NewWindow {
    // window.open() with no address starts on about:blank; sign-in SDKs
    // navigate that window to the provider afterwards.
    if url.as_str() == "about:blank" {
        return NewWindow::SignIn;
    }
    let host = url.host_str().unwrap_or("");
    if is_x_host(host) {
        let path = url.path();
        let is_flow = path.starts_with("/i/flow/")
            || path == "/login"
            || path.starts_with("/login/")
            || path.starts_with("/i/oauth");
        return if is_flow {
            NewWindow::MainWindow
        } else {
            NewWindow::Allow
        };
    }
    let is_provider = SIGN_IN_HOSTS
        .iter()
        .any(|known| host == *known || host.ends_with(&format!(".{known}")));
    if url.scheme() == "https" && is_provider {
        NewWindow::SignIn
    } else {
        NewWindow::External
    }
}

/// Sign-in state as the page reports it. `Unknown` until the first report, so
/// a popup opened while the page is still loading is never taken for a sign-in.
#[derive(Clone, Copy, Debug, PartialEq, Eq)]
enum Session {
    Unknown,
    Out,
    In,
}

static SESSION: Mutex<Session> = Mutex::new(Session::Unknown);

/// Next state for a page report, and whether it completes a sign-in (Out -> In).
/// Only that completion closes the sign-in popups: a reload or a popup opened
/// while already signed in must leave them alone.
fn on_session_report(prev: Session, signed_in: bool) -> (Session, bool) {
    let next = if signed_in { Session::In } else { Session::Out };
    (next, prev == Session::Out && next == Session::In)
}

/// Records a page report in `SESSION`; true when it completes a sign-in.
fn report_session(signed_in: bool) -> bool {
    let mut session = SESSION.lock().unwrap();
    let (next, completed) = on_session_report(*session, signed_in);
    *session = next;
    completed
}

pub(crate) fn x_data_directory(app: &AppHandle) -> Result<PathBuf, String> {
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

/// Media is fetched only from X's own hosts, so the page cannot make the app
/// fetch arbitrary addresses (including local network ones).
fn is_x_media_url(url: &str) -> bool {
    let Some(rest) = url.strip_prefix("https://") else {
        return false;
    };
    let authority = rest.split(['/', '?', '#']).next().unwrap_or("");
    if authority.contains('@') {
        return false;
    }
    let host = authority
        .split(':')
        .next()
        .unwrap_or("")
        .to_ascii_lowercase();
    host == "x.com"
        || host == "twitter.com"
        || host.ends_with(".twimg.com")
        || host.ends_with(".x.com")
        || host.ends_with(".twitter.com")
}

/// JS that pauses everything via the page helpers and returns a diagnostics report.
const PAUSE_JS: &str = r#"(function(){
    if (window.__onWindowHidden) window.__onWindowHidden();
    return window.__xnowPauseReport ? window.__xnowPauseReport() : 'no-report';
})()"#;

/// Webview GPU/runtime diagnostics (`--webview-diagnostics`). Returns the
/// evidence needed to attribute rendering problems to a GPU or occlusion
/// source: the occlusion state and the open-video count. Synchronous IIFE —
/// the eval callback receives the JSON string directly.
const WEBVIEW_DIAGNOSTICS_JS: &str = r#"(function(){
    var videos = document.querySelectorAll('video');
    var playing = 0;
    for (var i = 0; i < videos.length; i++) { if (!videos[i].paused) playing++; }
    // The page cannot read Chromium's internal feature list; h264 decode
    // support is the proxy for a functioning media/GPU stack.
    var probe = document.createElement('video');
    var canH264 = probe.canPlayType('video/mp4; codecs="avc1.42E01E"');
    return JSON.stringify({
        url: location.href,
        visibility: document.visibilityState,
        hidden: document.hidden,
        videos: videos.length,
        playing: playing,
        h264Decode: canH264 ? 'supported' : 'unsupported'
    });
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
        hasBridge: typeof (window.__TAURI__ && window.__TAURI__.core && window.__TAURI__.core.invoke),
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
    let (pause, sleep) = settings::read(|s| (s.pause_on_minimize, s.sleep_on_minimize));
    if pause {
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
    }
    #[cfg(windows)]
    if sleep {
        set_page_sleep(w, true);
    }
}

/// Put the page to sleep or wake it. `with_webview` runs the COM calls on the
/// UI thread that owns the WebView2 controller.
#[cfg(windows)]
fn set_page_sleep(w: &tauri::WebviewWindow, sleeping: bool) {
    let _ = w.with_webview(move |webview| webview_sleep::set_sleeping(&webview, sleeping));
}

/// Sets the large window icon. `.icon(...)` sets only the small one, so Task Manager
/// found no big icon and showed a blank tile. Uses the exe's own icon group (ID 32512).
#[cfg(windows)]
fn set_big_window_icon(window: &tauri::WebviewWindow) {
    use windows::core::PCWSTR;
    use windows::Win32::Foundation::{HINSTANCE, LPARAM, WPARAM};
    use windows::Win32::System::LibraryLoader::GetModuleHandleW;
    use windows::Win32::UI::WindowsAndMessaging::{LoadIconW, SendMessageW, ICON_BIG, WM_SETICON};

    let Ok(hwnd) = window.hwnd() else {
        return;
    };
    unsafe {
        let Ok(module) = GetModuleHandleW(PCWSTR::null()) else {
            return;
        };
        let Ok(icon) = LoadIconW(Some(HINSTANCE(module.0)), PCWSTR(32512 as *const u16)) else {
            return;
        };
        SendMessageW(
            hwnd,
            WM_SETICON,
            Some(WPARAM(ICON_BIG as usize)),
            Some(LPARAM(icon.0 as isize)),
        );
    }
}

/// Resume playback when the window becomes visible again.
fn resume_media_for_visible(w: &tauri::WebviewWindow) {
    // Wake the page first, so the resume script runs in a live renderer.
    #[cfg(windows)]
    set_page_sleep(w, false);
    let _ = w.eval("if (window.__resumeIfNeeded) window.__resumeIfNeeded();");
    let _ = w.eval_with_callback(REPORT_JS, |report| {
        eprintln!("[X-Now] Watchdog visible report: {}", report);
    });
}

/// Playback watchdog for the X window.
///
/// Some WebView2/WebKit builds never fire `visibilitychange` (or a resize
/// event) for a minimized window, so the page would keep playing audio in the
/// background. This thread checks the REAL window state and drives the page
/// helpers on every hidden/visible transition. Idle-aware: it sleeps on a
/// condvar that window events wake immediately (restore, focus, resize,
/// close, tray show/hide), so the reaction to a state change is instant while
/// the steady-state cost is ONE timer wakeup per 5 s (~6× fewer OS wakeups
/// than the old blind 800 ms poll) and the page eval still only runs on a
/// state CHANGE.
fn watch_x_window(w: tauri::WebviewWindow) {
    // Fail-safe direction: if a state query errors (e.g. the window was
    // destroyed), treat the window as HIDDEN so playback gets paused.
    let state_hidden = || w.is_minimized().unwrap_or(true) || !w.is_visible().unwrap_or(false);
    let mut last_hidden = state_hidden();
    // Last audio reconcile: (hidden state, when). Re-run on every hidden change
    // and at least once per poll, so sessions WebView2 creates later are caught.
    #[cfg(windows)]
    let mut audio_synced: Option<(bool, std::time::Instant)> = None;
    let mut startup_ticks = 0u32;
    let mut startup_reported = false;
    loop {
        // Idle-aware wait: window events set WATCHDOG_WAKE and interrupt this
        // wait immediately; with no event it times out after 5 s and the
        // state is re-checked anyway as a safety net for any edge path that
        // bypasses the event hooks.
        let pending_guard = WATCHDOG_WAKE
            .0
            .lock()
            .unwrap_or_else(|error| error.into_inner());
        let (mut pending_guard, _timeout) = WATCHDOG_WAKE
            .1
            .wait_timeout_while(pending_guard, HIDDEN_POLL, |flag| !*flag)
            .unwrap_or_else(|error| error.into_inner());
        *pending_guard = false;
        drop(pending_guard);

        let hidden = state_hidden();
        // Audio sessions (audio.rs): muted while hidden, and only the mutes we
        // set are released while visible. Covers persisted mutes from a crash
        // and sessions created after a transition.
        #[cfg(windows)]
        {
            let due = match audio_synced {
                Some((was_hidden, at)) => was_hidden != hidden || at.elapsed() >= HIDDEN_POLL,
                None => true,
            };
            if due {
                let mute = hidden && settings::read(|s| s.mute_on_minimize);
                let mode = if mute {
                    audio::Mode::Hidden
                } else {
                    audio::Mode::Visible
                };
                audio::sync(mode);
                audio_synced = Some((hidden, std::time::Instant::now()));
            }
        }
        if hidden && !last_hidden {
            eprintln!("[X-Now] Watchdog: window hidden -> pausing media");
            if WEBVIEW_DIAGNOSTICS.load(Ordering::Relaxed) {
                let _ = w.eval_with_callback(WEBVIEW_DIAGNOSTICS_JS, |report| {
                    eprintln!("[X-Now] Webview diagnostics (hidden): {}", report);
                });
            }
            pause_media_for_hidden(&w);
        } else if !hidden && last_hidden {
            eprintln!("[X-Now] Watchdog: window visible -> resuming media");
            if WEBVIEW_DIAGNOSTICS.load(Ordering::Relaxed) {
                let _ = w.eval_with_callback(WEBVIEW_DIAGNOSTICS_JS, |report| {
                    eprintln!("[X-Now] Webview diagnostics (visible): {}", report);
                });
            }
            resume_media_for_visible(&w);
        }
        last_hidden = hidden;
        // Cold-start diagnostic: ~20 s after launch, with no hidden/visible
        // transition yet, dump the TRUE fresh-launch page state (muted?
        // volume?) — the E2E evidence that the startup audio defaults hold
        // BEFORE any minimize/restore cycle. (4 ticks ≈ 20 s at the 5 s
        // fallback cadence; launch events usually land it sooner.)
        if !startup_reported {
            if hidden {
                startup_reported = true; // a transition happened first; skip
            } else {
                startup_ticks += 1;
                if startup_ticks >= 4 {
                    startup_reported = true;
                    let _ = w.eval_with_callback(REPORT_JS, |report| {
                        eprintln!("[X-Now] Watchdog startup report: {}", report);
                    });
                    // OS-level evidence: session mute + master volume.
                    #[cfg(windows)]
                    audio::report_audio_state();
                    // Diagnostics mode: full webview GPU/runtime state too.
                    if WEBVIEW_DIAGNOSTICS.load(Ordering::Relaxed) {
                        let _ = w.eval_with_callback(WEBVIEW_DIAGNOSTICS_JS, |report| {
                            eprintln!("[X-Now] Webview diagnostics (startup): {}", report);
                        });
                    }
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

    // Per-launch webview workarounds + diagnostics (--webview-* / XNOW_WEBVIEW_ARGS).
    let launch_config = resolve_launch_config(std::env::args());
    WEBVIEW_DIAGNOSTICS.store(launch_config.webview_diagnostics, Ordering::Relaxed);
    eprintln!(
        "[X-Now] Launch config: webview_args=\"{}\" dark_background={} diagnostics={}",
        launch_config.webview_args,
        launch_config.dark_background,
        launch_config.webview_diagnostics
    );

    let browser_app = app.clone();
    let navigation_app = app.clone();
    let popup_app = app.clone();

    // HD window icon (48x48, rendered from the icon.png master): tauri's
    // default window icon decodes the .ico's LARGEST frame (256x256) and
    // Windows downscales it for the title bar and taskbar — that is the
    // blur. A purpose-made 48px render stays crisp across DPI scales
    // (taskbar is 32px at 100% DPI, 48px at 150%).
    let window_icon =
        tauri::image::Image::from_bytes(include_bytes!("../../icons/system_tray/tray-48x48.png"))
            .map_err(|error| error.to_string())?;

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
    // Built hidden and shown once below: a visible-then-shown window painted twice at launch.
    .visible(false)
    // X's dark surface color: with a white default background, every frame
    // not yet painted by the webview (launch, occlusion-throttled
    // compositing, heavy video churn) blanches the whole window. wry maps
    // this straight to WebView2's opaque SetDefaultBackgroundColor, so
    // the unpainted surface is X-dark instead of white — this kills the
    // white launch flash too. The page tools then report the ACTUAL theme
    // background (XNOWBG:r,g,b) and the app re-syncs at runtime, so the
    // fill color always matches the rendered theme — no dark-flash-on-light
    // while scrolling. --webview-default restores the stock white start.
    .background_color(if launch_config.dark_background {
        Color(15, 20, 25, 255)
    } else {
        Color(255, 255, 255, 255)
    })
    .icon(window_icon)
    .expect("X-Now bundled window icon is invalid")
    .data_directory(profile_data_dir)
    // Occlusion-tracker + video-overlay hardening, per-launch overridable
    // (see DEFAULT_WEBVIEW_BROWSER_ARGS / resolve_launch_config docs).
    .additional_browser_args(&launch_config.webview_args)
    .initialization_script(&helper_script())
    // ── OAuth popup manager & external-link router ─────────────────────────
    // X's Google/Apple sign-in opens `target=_blank` popups (accounts.google.com
    // / appleid.apple.com) that relay the token back to x.com via postMessage.
    // They MUST open as managed in-app windows — an external browser breaks the
    // relay. Everything else that opens a new window goes to the OS browser.
    .on_new_window(move |url, features| {
        let kind = classify_new_window(&url);

        if kind == NewWindow::SignIn {
            let label = format!("popup-{}", POPUP_COUNTER.fetch_add(1, Ordering::Relaxed));
            eprintln!("[X-Now] Intercepted OAuth login window: {}", url);

            let (w, h) = features
                .size()
                .map(|s| (s.width as f64, s.height as f64))
                .unwrap_or((540.0, 700.0));

            #[cfg(windows)]
            let env = features.opener().environment.clone();

            let blank = url.as_str() == "about:blank";
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
                let is_x = is_x_host(nav_url.host_str().unwrap_or(""));
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
                Ok(popup) => {
                    if blank {
                        // A window opened blank that nothing navigates would stay as an empty stray window.
                        let stray = popup.clone();
                        std::thread::spawn(move || {
                            std::thread::sleep(std::time::Duration::from_secs(15));
                            if stray.url().map_or(true, |u| u.as_str() == "about:blank") {
                                let _ = stray.close();
                            }
                        });
                    }
                    NewWindowResponse::Create { window: popup }
                }
                Err(error) => {
                    eprintln!("[X-Now] Could not open the sign-in window: {error}");
                    NewWindowResponse::Allow
                }
            }
        } else if kind == NewWindow::MainWindow {
            eprintln!("[X-Now] Sign-in page opened in the main window ({})", url);
            let app = popup_app.clone();
            let target = url.clone();
            std::thread::spawn(move || {
                if let Some(main) = app.get_webview_window(X_WINDOW_LABEL) {
                    let _ = main.navigate(target);
                }
            });
            NewWindowResponse::Deny
        } else if kind == NewWindow::External {
            eprintln!("[X-Now] External hyperlink in new window ({}), launching OS default browser...", url);
            if let Err(error) = open_external_url(browser_app.clone(), url.to_string()) {
                eprintln!("[X-Now] Could not open the link in the OS browser: {error}");
            }
            NewWindowResponse::Deny
        } else {
            NewWindowResponse::Allow
        }
    })
    .on_navigation(move |url| {
        if is_x_host(url.host_str().unwrap_or("")) {
            return true;
        }
        // Same-window navigation to anything outside X (e.g. a redirect to an
        // external site) is routed to the OS default browser instead.
        eprintln!("[X-Now] External link intercepted ({}), opening in OS default browser...", url);
        let _ = open_external_url(navigation_app.clone(), url.to_string());
        false
    })
    // ── Titlebar Username & OAuth Popup Sweeper ────────────────────────────
    // The tools script sets `document.title` to `XNOW:<handle>` when the
    // signed-in profile link appears, and to `XNOWOUT:` when it has been gone
    // for a while. Two jobs happen here:
    //  1. Surface the handle as "X-Now (@handle)" in the native titlebar.
    //  2. Close the sign-in popups once a sign-in completes (signed out ->
    //     signed in). X's Google sign-in (GIS) can leave its popup on
    //     accounts.google.com forever, so the popup never closes itself.
    .on_document_title_changed(move |window, page_title| {
        let app = window.app_handle().clone();
        // Theme channel: the page tools ping `XNOWBG:r,g,b` when the theme's
        // real background color is known/changes. The native background is
        // re-synced so unpainted compositor gaps (scroll raster tiles,
        // restore frames) never contrast with the rendered content.
        if let Some(rgb) = page_title.strip_prefix("XNOWBG:") {
            apply_page_theme_background(&window, rgb);
            // Restore the proper titlebar text at once — the ping payload must
            // never flash up in the native title.
            let cached = cache_for_title.lock().unwrap().clone();
            let _ = window.set_title(&cached.map_or_else(
                || "X-Now".to_string(),
                |u| format!("X-Now (@{u})"),
            ));
            return;
        }
        // Diagnostic channel: the page tools report media-save failures via a
        // XNOWERR: title — surfaced to the app log without touching the title.
        if let Some(reason) = page_title.strip_prefix("XNOWERR:") {
            eprintln!("[X-Now] Media-save failure reported by page: {}", reason);
            return;
        }
        // Success-side diagnostics: XNOWLOG:<json> — candidates + chosen URL.
        if let Some(summary) = page_title.strip_prefix("XNOWLOG:") {
            eprintln!("[X-Now] Media-save diagnostics: {}", summary);
            return;
        }
        if page_title == "XNOWOUT:" {
            report_session(false);
            eprintln!("[X-Now] Page reports signed out");
            *cache_for_title.lock().unwrap() = None;
            let _ = window.set_title("X-Now");
            return;
        }
        if let Some(user) = page_title.strip_prefix("XNOW:") {
            let user = user.trim().to_string();
            let is_pure_numeric = !user.is_empty() && user.chars().all(|c| c.is_ascii_digit());

            if !user.is_empty() && !is_pure_numeric {
                *cache_for_title.lock().unwrap() = Some(user.clone());
            }

            // Only a completed sign-in closes the sign-in popups. A reload, or a
            // popup opened while already signed in, must leave them open.
            if report_session(!user.is_empty()) {
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
            }

            // Deliberately no show()/set_focus(): this handler also runs after
            // reloads, which must not un-hide a window the user sent to the tray.
            // The OAuth success path shows the window itself.
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

    let initial = settings::get();
    if initial.zoom_percent != 100 {
        let _ = window.set_zoom(initial.zoom_percent as f64 / 100.0);
    }
    if initial.always_on_top {
        let _ = window.set_always_on_top(true);
    }
    #[cfg(windows)]
    set_big_window_icon(&window);

    if !start_minimized {
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

/// Downloads base directory: the OS download folder, with graceful fallbacks
/// (documents, then home) so media saving never fails on exotic setups.
fn download_base_dir(app: &AppHandle) -> Result<PathBuf, String> {
    let paths = app.path();
    paths
        .download_dir()
        .or_else(|_| paths.document_dir())
        .or_else(|_| paths.home_dir())
        .map_err(|error| error.to_string())
}

/// Saved settings plus the autostart state, which the autostart plugin owns and
/// settings.json therefore does not store.
#[derive(serde::Serialize)]
#[serde(rename_all = "camelCase")]
struct SettingsView {
    #[serde(flatten)]
    settings: settings::Settings,
    launch_at_login: bool,
}

fn settings_view(app: &AppHandle) -> SettingsView {
    use tauri_plugin_autostart::ManagerExt;
    SettingsView {
        settings: settings::get(),
        launch_at_login: app.autolaunch().is_enabled().unwrap_or(false),
    }
}

/// Applies what a settings change touches outside the page: window flags, zoom,
/// the tray checkmarks, and the open page so its panel stays in step.
pub(crate) fn apply_settings_change(
    app: &AppHandle,
    before: &settings::Settings,
    after: &settings::Settings,
) {
    if let Some(window) = app.get_webview_window(X_WINDOW_LABEL) {
        if before.always_on_top != after.always_on_top {
            let _ = window.set_always_on_top(after.always_on_top);
        }
        if before.zoom_percent != after.zoom_percent {
            let _ = window.set_zoom(after.zoom_percent as f64 / 100.0);
        }
        let _ = window.eval("if (window.__xnowSettingsChanged) window.__xnowSettingsChanged();");
    }
    tray::sync_checks(app);
}

/// Native-side change (the tray): mutate, then apply.
pub(crate) fn change_settings(app: &AppHandle, change: impl FnOnce(&mut settings::Settings)) {
    let before = settings::get();
    let after = settings::mutate(change);
    apply_settings_change(app, &before, &after);
}

#[tauri::command]
fn get_settings(app: AppHandle) -> SettingsView {
    settings_view(&app)
}

#[tauri::command]
fn update_settings(
    app: AppHandle,
    patch: serde_json::Map<String, serde_json::Value>,
) -> Result<SettingsView, String> {
    // Startup registration is system configuration. The page is a remote origin,
    // so only the native tray may change it.
    if patch.contains_key("launchAtLogin") {
        return Err("Change launch at login from the X-Now tray menu.".to_string());
    }
    let before = settings::get();
    let after = settings::update(&patch)?;
    apply_settings_change(&app, &before, &after);
    Ok(settings_view(&app))
}

/// Opens the folder of a file X-Now saved. Only paths in the recorded history
/// are accepted, so the page cannot open arbitrary folders.
#[tauri::command]
fn open_saved_folder(app: AppHandle, path: String) -> Result<(), String> {
    if !settings::is_recorded_path(&path) {
        return Err("That file is not in X-Now's saved media list.".to_string());
    }
    let folder = std::path::Path::new(&path)
        .parent()
        .ok_or("The saved file has no folder.")?;
    app.shell()
        .open(folder.to_string_lossy().into_owned(), None)
        .map_err(|error| error.to_string())
}

#[tauri::command]
fn prepare_download_folder(app: AppHandle) -> Result<String, String> {
    let download_dir = download_base_dir(&app)?.join("X-Now");
    fs::create_dir_all(&download_dir).map_err(|error| error.to_string())?;
    Ok(download_dir.to_string_lossy().into_owned())
}

/// Image extension from the file's magic bytes. X serves jpg, png, webp and gif
/// variants, so the saved name must follow the bytes, not the URL.
fn sniff_image_extension(head: &[u8]) -> &'static str {
    if head.starts_with(&[0x89, b'P', b'N', b'G']) {
        "png"
    } else if head.starts_with(b"GIF8") {
        "gif"
    } else if head.len() >= 12 && &head[0..4] == b"RIFF" && &head[8..12] == b"WEBP" {
        "webp"
    } else {
        "jpg"
    }
}

fn media_target_path(app: &AppHandle, extension: &str) -> Result<PathBuf, String> {
    let is_video = extension == "mp4";
    let download_dir = download_base_dir(app)?.join("X-Now");
    fs::create_dir_all(&download_dir).map_err(|error| error.to_string())?;
    let timestamp = SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .map_err(|error| error.to_string())?
        .as_millis();
    Ok(download_dir.join(format!(
        "X-Now-{}-{timestamp}.{extension}",
        if is_video { "Video" } else { "Image" }
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
    if !is_x_media_url(&url) {
        return Err("This media is not hosted by X, so X-Now will not download it.".to_string());
    }

    let is_video = media_type.eq_ignore_ascii_case("video");
    let target_path = media_target_path(&app, if is_video { "mp4" } else { "jpg" })?;
    let referer = referer
        .filter(|value| is_safe_http_url(value))
        .unwrap_or_else(|| "https://x.com/".to_string());

    tauri::async_runtime::spawn_blocking(move || -> Result<String, String> {
        // Windows ships `curl.exe`; macOS/Linux use the system `curl`.
        // Windows ships curl in System32. The full path avoids running a curl.exe
        // from the app or current folder, which a bare name would find first.
        let curl = if cfg!(windows) {
            let root = std::env::var("SystemRoot").unwrap_or_else(|_| "C:\\Windows".to_string());
            format!("{root}\\System32\\curl.exe")
        } else {
            "curl".to_string()
        };
        let mut command = Command::new(&curl);
        command
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
            .arg(&url);
        // Windows: spawn curl with CREATE_NO_WINDOW so no console window
        // flashes next to the app during media downloads.
        #[cfg(windows)]
        {
            use std::os::windows::process::CommandExt;
            command.creation_flags(0x08000000);
        }
        let output = command
            .output()
            .map_err(|error| format!("Unable to start {curl}: {error}"))?;

        if !output.status.success() {
            let _ = fs::remove_file(&target_path);
            let stderr = String::from_utf8_lossy(&output.stderr);
            eprintln!(
                "[X-Now] download_media failed: url={} target={} status={} stderr={}",
                url,
                target_path.display(),
                output.status,
                stderr.trim()
            );
            return Err(format!(
                "{curl} exited with status {}: {}",
                output.status,
                stderr.trim()
            ));
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

        // The URL's format is not reliable: rename images to match their bytes.
        let final_path = if media_type.eq_ignore_ascii_case("video") {
            target_path
        } else {
            let mut head = [0_u8; 12];
            let read = fs::File::open(&target_path)
                .and_then(|mut file| file.read(&mut head))
                .unwrap_or(0);
            let corrected = target_path.with_extension(sniff_image_extension(&head[..read]));
            if corrected != target_path && fs::rename(&target_path, &corrected).is_ok() {
                corrected
            } else {
                target_path
            }
        };

        eprintln!(
            "[X-Now] download_media OK: {} bytes -> {} <- {}",
            metadata.len(),
            final_path.display(),
            url
        );
        let saved = final_path.to_string_lossy().into_owned();
        settings::record_save(if is_video { "video" } else { "image" }, &saved);
        Ok(saved)
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

    let extension = if media_type.eq_ignore_ascii_case("video") {
        "mp4"
    } else {
        sniff_image_extension(&data)
    };
    let target_path = media_target_path(&app, extension)?;
    tauri::async_runtime::spawn_blocking(move || -> Result<String, String> {
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
        eprintln!(
            "[X-Now] save_media_bytes OK: {} bytes -> {}",
            metadata.len(),
            target_path.display()
        );
        let saved = target_path.to_string_lossy().into_owned();
        let kind = if media_type.eq_ignore_ascii_case("video") {
            "video"
        } else {
            "image"
        };
        settings::record_save(kind, &saved);
        Ok(saved)
    })
    .await
    .map_err(|error| error.to_string())?
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        // A second launch brings the running window forward instead of starting a
        // second process, which would share the profile and fight over settings.json.
        .plugin(tauri_plugin_single_instance::init(|app, _args, _cwd| {
            if let Some(window) = app.get_webview_window(X_WINDOW_LABEL) {
                let _ = window.unminimize();
                let _ = window.show();
                let _ = window.set_focus();
            }
        }))
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
            save_media_bytes,
            get_settings,
            update_settings,
            open_saved_folder
        ])
        .setup(|app| {
            if let Err(error) = tray::setup_tray(app.handle()) {
                eprintln!("[X-Now] Tray setup failed: {error}");
            }

            // Launch hidden to tray when started by the OS autostart feature.
            if let Ok(data_dir) = app.path().app_data_dir() {
                settings::init(&data_dir);
                #[cfg(windows)]
                audio::init(&data_dir);
            }
            let start_minimized = std::env::args().any(|arg| arg == "--minimized");

            if let Err(error) = launch_x_internal(app.handle(), start_minimized) {
                eprintln!("[X-Now] Failed to launch X: {error}");
            }

            Ok(())
        })
        .on_window_event(|window, event| match event {
            tauri::WindowEvent::CloseRequested { api, .. } => {
                // With "Hide to tray on close" off, the close goes through and
                // the app quits with its last window.
                if window.label() == X_WINDOW_LABEL && settings::read(|s| s.close_to_tray) {
                    // Minimal, deterministic close-to-tray: prevent the close
                    // FIRST, pause via a plain eval (no callbacks/threads/COM —
                    // those were observed to race with the OS close processing
                    // and occasionally let the window be destroyed), then hide.
                    // The wake makes the watchdog apply the full layered pause
                    // immediately; the 5 s fallback is the safety net.
                    api.prevent_close();
                    wake_watchdog();
                    if let Some(win) = window.get_webview_window(X_WINDOW_LABEL) {
                        let _ = win.eval("if (window.__onWindowHidden) window.__onWindowHidden();");
                        let _ = win.hide();
                    }
                }
            }
            // Fast path: tao emits Resized(0x0) the moment the window minimizes.
            // Wake the watchdog so the hidden transition (and its layered
            // pause) applies instantly.
            //
            // Deliberately NO direct pause here: during a RESTORE, tao emits
            // Resized events with stale interim sizes, and the is_minimized()
            // probe raced the actual SW_RESTORE — it intermittently still
            // reported true, so the "minimize fast path" PAUSED right after
            // the resume, forcing the video to re-attach its compositor
            // overlay mid-resize. That re-attachment under a moving window
            // geometry is the intermittent black-flash band at restore. The
            // watchdog re-checks state after every wake anyway, and its pause
            // goes through the same page helpers.
            tauri::WindowEvent::Resized(_) => {
                if window.label() == X_WINDOW_LABEL {
                    wake_watchdog();
                }
            }
            tauri::WindowEvent::Focused(_) => {
                // Restore/focus transitions are what the resume path reacts to;
                // waking here removes any perceptible resume delay.
                if window.label() == X_WINDOW_LABEL {
                    wake_watchdog();
                }
            }
            _ => {}
        })
        .build(tauri::generate_context!())
        .expect("error while building X-Now")
        .run(|_app, event| {
            if let tauri::RunEvent::Exit = event {
                // Release any audio mutes X-Now holds before the process ends.
                #[cfg(windows)]
                audio::sync(audio::Mode::Release);
            }
        });
}

#[cfg(test)]
mod tests {
    use super::*;

    fn url(text: &str) -> Url {
        Url::parse(text).unwrap()
    }

    #[test]
    fn sign_in_providers_open_as_managed_popups() {
        for text in [
            "about:blank",
            "https://accounts.google.com/o/oauth2/v2/auth?client_id=1",
            "https://appleid.apple.com/auth/authorize?response_type=code",
            "https://idmsa.apple.com/IDMSWebAuth/signin",
            "https://login.microsoftonline.com/common/oauth2/authorize",
        ] {
            assert_eq!(classify_new_window(&url(text)), NewWindow::SignIn, "{text}");
        }
    }

    #[test]
    fn lookalike_and_plain_hosts_go_to_the_os_browser() {
        for text in [
            "https://pineapple.com/",
            "https://accounts.google.com.example.net/",
            "https://evilaccounts.google.com/",
            "http://accounts.google.com/",
            "https://example.com/author/bob",
            "https://example.com/login",
        ] {
            assert_eq!(
                classify_new_window(&url(text)),
                NewWindow::External,
                "{text}"
            );
        }
    }

    #[test]
    fn x_login_pages_load_in_the_main_window_and_other_x_pages_are_allowed() {
        assert_eq!(
            classify_new_window(&url("https://x.com/i/flow/login")),
            NewWindow::MainWindow
        );
        assert_eq!(
            classify_new_window(&url("https://twitter.com/login")),
            NewWindow::MainWindow
        );
        assert_eq!(
            classify_new_window(&url("https://x.com/intent/post")),
            NewWindow::Allow
        );
        assert_eq!(
            classify_new_window(&url("https://x.com/home")),
            NewWindow::Allow
        );
    }

    #[test]
    fn only_a_completed_sign_in_closes_popups() {
        assert_eq!(
            on_session_report(Session::Unknown, true),
            (Session::In, false)
        );
        assert_eq!(on_session_report(Session::In, true), (Session::In, false));
        assert_eq!(on_session_report(Session::Out, true), (Session::In, true));
        assert_eq!(on_session_report(Session::In, false), (Session::Out, false));
    }

    fn args<'a>(list: &'a [&'a str]) -> Vec<&'a str> {
        list.to_vec()
    }

    // ── sniff_image_extension ────────────────────────────────────────

    #[test]
    fn sniff_image_extension_follows_magic_bytes() {
        assert_eq!(
            sniff_image_extension(&[0x89, b'P', b'N', b'G', 0, 0]),
            "png"
        );
        assert_eq!(sniff_image_extension(b"RIFF\0\0\0\0WEBPVP8 "), "webp");
        assert_eq!(sniff_image_extension(b"GIF89a"), "gif");
        assert_eq!(sniff_image_extension(&[0xFF, 0xD8, 0xFF, 0xE0]), "jpg");
        // Short or unreadable heads fall back to the old default.
        assert_eq!(sniff_image_extension(b"RIFF"), "jpg");
        assert_eq!(sniff_image_extension(&[]), "jpg");
    }

    // ── compose_webview_browser_args ─────────────────────────────────

    #[test]
    fn default_args_allow_unmuted_autoplay() {
        assert!(DEFAULT_WEBVIEW_BROWSER_ARGS.contains("--autoplay-policy=no-user-gesture-required"));
    }

    #[test]
    fn compose_keeps_stock_when_no_override() {
        assert_eq!(
            compose_webview_browser_args(DEFAULT_WEBVIEW_BROWSER_ARGS, None),
            DEFAULT_WEBVIEW_BROWSER_ARGS
        );
    }

    #[test]
    fn compose_ignores_empty_override() {
        assert_eq!(
            compose_webview_browser_args(DEFAULT_WEBVIEW_BROWSER_ARGS, Some("   ")),
            DEFAULT_WEBVIEW_BROWSER_ARGS
        );
    }

    #[test]
    fn compose_reinjects_wry_defaults() {
        let composed = compose_webview_browser_args(
            DEFAULT_WEBVIEW_BROWSER_ARGS,
            Some("--disable-gpu-compositing"),
        );
        assert!(composed.starts_with(WRY_DEFAULT_BROWSER_ARGS));
        assert!(composed.contains("--disable-gpu-compositing"));
    }

    #[test]
    fn compose_does_not_duplicate_wry_defaults() {
        let composed = compose_webview_browser_args(
            DEFAULT_WEBVIEW_BROWSER_ARGS,
            Some("--disable-features=msWebOOUI,Foo"),
        );
        assert_eq!(composed.matches("msWebOOUI").count(), 1);
    }

    // ── remove_disabled_feature ──────────────────────────────────────

    #[test]
    fn remove_feature_drops_only_the_named_flag() {
        let result = remove_disabled_feature(
            "--disable-features=msWebOOUI,CalculateNativeWinOcclusion,msPdfOOUI",
            "CalculateNativeWinOcclusion",
        );
        assert_eq!(result, "--disable-features=msWebOOUI,msPdfOOUI");
    }

    #[test]
    fn remove_feature_keeps_other_tokens() {
        // The named feature is the ONLY list entry: the empty --disable-features
        // token is dropped entirely, other switches survive untouched.
        let result = remove_disabled_feature(
            "--disable-features=CalculateNativeWinOcclusion --disable-gpu-compositing",
            "CalculateNativeWinOcclusion",
        );
        assert_eq!(result, "--disable-gpu-compositing");
    }

    #[test]
    fn remove_feature_removes_empty_list_token() {
        let result = remove_disabled_feature(
            "--disable-features=CalculateNativeWinOcclusion",
            "CalculateNativeWinOcclusion",
        );
        assert_eq!(result, "");
    }

    // ── remove_browser_switch ────────────────────────────────────────

    #[test]
    fn remove_switch_drops_only_the_named_switch() {
        let result = remove_browser_switch(
            "--disable-features=A,B --disable-direct-composition-video-overlays --other",
            "--disable-direct-composition-video-overlays",
        );
        assert_eq!(result, "--disable-features=A,B --other");
    }

    #[test]
    fn remove_switch_tolerates_absent_switch() {
        let result = remove_browser_switch(
            "--disable-features=A",
            "--disable-direct-composition-video-overlays",
        );
        assert_eq!(result, "--disable-features=A");
    }

    // ── resolve_launch_config ────────────────────────────────────────

    #[test]
    fn default_config_is_stock() {
        let config = resolve_launch_config(args(&[]));
        assert_eq!(config, LaunchConfig::stock());
        assert!(config.webview_args.contains(GPU_OCCLUSION_FIX_FEATURE));
        assert!(config.webview_args.contains(GPU_VIDEO_OVERLAY_SWITCH));
        assert!(config.dark_background);
        assert!(!config.webview_diagnostics);
    }

    #[test]
    fn webview_default_drops_fix_and_dark_background() {
        let config = resolve_launch_config(args(&["--webview-default"]));
        assert!(!config.webview_args.contains(GPU_OCCLUSION_FIX_FEATURE));
        // Both rendering workarounds are dropped: the overlay switch too.
        assert!(!config.webview_args.contains(GPU_VIDEO_OVERLAY_SWITCH));
        assert!(!config.dark_background);
        // The wry defaults (mini-menu / SmartScreen suppression) survive.
        assert!(config.webview_args.contains("msWebOOUI"));
    }

    #[test]
    fn no_occlusion_fix_keeps_dark_background() {
        let config = resolve_launch_config(args(&["--no-occlusion-fix"]));
        assert!(!config.webview_args.contains(GPU_OCCLUSION_FIX_FEATURE));
        assert!(config.dark_background);
        assert!(config.webview_args.contains("msWebOOUI"));
    }

    #[test]
    fn no_gpu_video_overlays_fix_drops_only_the_overlay_switch() {
        let config = resolve_launch_config(args(&["--no-gpu-video-overlays-fix"]));
        assert!(!config.webview_args.contains(GPU_VIDEO_OVERLAY_SWITCH));
        // The occlusion fix and the dark background stay.
        assert!(config.webview_args.contains(GPU_OCCLUSION_FIX_FEATURE));
        assert!(config.dark_background);
        assert!(config.webview_args.contains("msWebOOUI"));
    }

    #[test]
    fn webview_args_override_wins_and_keeps_wry_defaults() {
        let config = resolve_launch_config(args(&["--webview-args", "--disable-gpu-compositing"]));
        assert!(config.webview_args.starts_with(WRY_DEFAULT_BROWSER_ARGS));
        assert!(config.webview_args.contains("--disable-gpu-compositing"));
        // A full override does NOT silently re-add the occlusion fix.
        assert!(!config.webview_args.contains(GPU_OCCLUSION_FIX_FEATURE));
        assert!(config.dark_background);
    }

    #[test]
    fn webview_args_equals_form_works() {
        let config = resolve_launch_config(args(&["--webview-args=--disable-gpu"]));
        assert!(config.webview_args.contains("--disable-gpu"));
    }

    #[test]
    fn diagnostics_flag_enables_mode() {
        let config = resolve_launch_config(args(&["--webview-diagnostics"]));
        assert!(config.webview_diagnostics);
        // Diagnostics alone does not change the workarounds.
        assert_eq!(config.webview_args, DEFAULT_WEBVIEW_BROWSER_ARGS);
    }

    #[test]
    fn flags_combine() {
        let config = resolve_launch_config(args(&[
            "--webview-diagnostics",
            "--no-occlusion-fix",
            "--webview-args=--disable-gpu-compositing",
        ]));
        assert!(config.webview_diagnostics);
        assert!(!config.webview_args.contains(GPU_OCCLUSION_FIX_FEATURE));
        assert!(config.webview_args.contains("--disable-gpu-compositing"));
        assert!(config.webview_args.contains("msWebOOUI"));
    }

    #[test]
    fn unrelated_flags_are_ignored() {
        let config = resolve_launch_config(args(&["--minimized", "--webview-diagnostics"]));
        assert!(config.webview_diagnostics);
        assert_eq!(config.webview_args, DEFAULT_WEBVIEW_BROWSER_ARGS);
    }

    // ── parse_css_color_to_native (theme background sync) ────────────

    #[test]
    fn css_rgb_parses() {
        assert_eq!(
            parse_css_color_to_native("rgb(255, 255, 255)"),
            Some(Color(255, 255, 255, 255))
        );
        assert_eq!(
            parse_css_color_to_native("rgb(21, 32, 43)"),
            Some(Color(21, 32, 43, 255))
        );
    }

    #[test]
    fn css_hex_parses() {
        assert_eq!(
            parse_css_color_to_native("#0f1419"),
            Some(Color(15, 20, 25, 255))
        );
        assert_eq!(
            parse_css_color_to_native("#fff"),
            Some(Color(255, 255, 255, 255))
        );
    }

    #[test]
    fn css_transparent_and_garbage_return_none() {
        assert_eq!(parse_css_color_to_native("transparent"), None);
        assert_eq!(parse_css_color_to_native(""), None);
        assert_eq!(parse_css_color_to_native("rgb(1, 2)"), None);
    }

    #[test]
    fn bare_rgb_component_list_parses() {
        // The exact XNOWBG: title-ping payload form.
        assert_eq!(
            parse_css_color_to_native("255,255,255"),
            Some(Color(255, 255, 255, 255))
        );
        assert_eq!(
            parse_css_color_to_native("15,20,25"),
            Some(Color(15, 20, 25, 255))
        );
        assert_eq!(parse_css_color_to_native("1,2,3,4"), None);
    }
}
