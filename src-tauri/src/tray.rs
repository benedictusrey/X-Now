// Copyright (c) 2026 Benedictus Reynaldo Hartanto (@benedictusrey). All rights reserved.
// X-Now — High-performance desktop client for X (https://github.com/benedictusrey/X-Now)
// Licensed under the MIT License.

use std::error::Error;

use base64::Engine;
use tauri::{
    menu::{
        CheckMenuItemBuilder, IconMenuItemBuilder, Menu, MenuBuilder, MenuItemBuilder,
        PredefinedMenuItem, SubmenuBuilder,
    },
    tray::{MouseButton, MouseButtonState, TrayIconBuilder, TrayIconEvent},
    AppHandle, Manager, Wry,
};
use tauri_plugin_shell::ShellExt;

use crate::settings;

/// Decode one of the 16×16 menu glyphs (white Segoe-MDL2-style renders, see
/// `scripts/render-menu-icons.ps1` for regeneration) as a Tauri image.
fn menu_icon(name: &str) -> tauri::image::Image<'static> {
    let bytes: &'static [u8] = match name {
        "window" => include_bytes!("../../icons/menu/window.png"),
        "home" => include_bytes!("../../icons/menu/home.png"),
        "explore" => include_bytes!("../../icons/menu/explore.png"),
        "notifications" => include_bytes!("../../icons/menu/notifications.png"),
        "messages" => include_bytes!("../../icons/menu/messages.png"),
        "bookmarks" => include_bytes!("../../icons/menu/bookmarks.png"),
        "profile" => include_bytes!("../../icons/menu/profile.png"),
        "refresh" => include_bytes!("../../icons/menu/refresh.png"),
        "zoom-in" => include_bytes!("../../icons/menu/zoom-in.png"),
        "zoom-out" => include_bytes!("../../icons/menu/zoom-out.png"),
        "zoom-reset" => include_bytes!("../../icons/menu/zoom-reset.png"),
        "devtools" => include_bytes!("../../icons/menu/devtools.png"),
        "copy-url" => include_bytes!("../../icons/menu/copy-url.png"),
        "open-browser" => include_bytes!("../../icons/menu/open-browser.png"),
        "compact-memory" => include_bytes!("../../icons/menu/compact-memory.png"),
        "cobalt" => include_bytes!("../../icons/menu/cobalt.png"),
        "about" => include_bytes!("../../icons/menu/about.png"),
        "quit" => include_bytes!("../../icons/menu/quit.png"),
        _ => include_bytes!("../../icons/menu/home.png"),
    };
    tauri::image::Image::from_bytes(bytes).expect("menu icon decodes")
}

/// Build the native tray menu — structured into clear sections, with the
/// Window / View / Tools groups as NATIVE submenus (hover flyouts). Every
/// clickable item carries a 16×16 glyph (same look as the classic v2.0.0
/// tray menu). Native menus behave the same on Windows, Linux and macOS.
fn build_menu(app: &AppHandle) -> Result<(Menu<Wry>, TrayChecks), Box<dyn Error>> {
    // ── Navigate ▸ ─────────────────────────────────────────────────────────
    let x_home = IconMenuItemBuilder::with_id("x_home", "Home feed")
        .icon(menu_icon("home"))
        .build(app)?;
    let x_explore = IconMenuItemBuilder::with_id("x_explore", "Explore")
        .icon(menu_icon("explore"))
        .build(app)?;
    let x_notif = IconMenuItemBuilder::with_id("x_notif", "Notifications")
        .icon(menu_icon("notifications"))
        .build(app)?;
    let x_msgs = IconMenuItemBuilder::with_id("x_msgs", "Messages")
        .icon(menu_icon("messages"))
        .build(app)?;
    let x_bookmarks = IconMenuItemBuilder::with_id("x_bookmarks", "Bookmarks")
        .icon(menu_icon("bookmarks"))
        .build(app)?;
    let x_profile = IconMenuItemBuilder::with_id("x_profile", "My profile")
        .icon(menu_icon("profile"))
        .build(app)?;
    let refresh = IconMenuItemBuilder::with_id("refresh", "Refresh feed")
        .icon(menu_icon("refresh"))
        .build(app)?;
    let sep_navigate = PredefinedMenuItem::separator(app)?;
    let navigate = SubmenuBuilder::with_id(app, "navigate", "Navigate")
        .item(&x_home)
        .item(&x_explore)
        .item(&x_notif)
        .item(&x_msgs)
        .item(&x_bookmarks)
        .item(&x_profile)
        .item(&sep_navigate)
        .item(&refresh)
        .build()?;

    // ── Settings ▸ ─────────────────────────────────────────────────────────
    // Every check here reads and writes the same settings.json as the in-page
    // panel, so the two never disagree (see `sync_checks`).
    let open_settings = IconMenuItemBuilder::with_id("open_settings", "Open Settings…")
        .icon(menu_icon("window"))
        .build(app)?;
    let close_to_tray =
        CheckMenuItemBuilder::with_id("set_close_to_tray", "Hide to tray on close").build(app)?;
    let always_top = CheckMenuItemBuilder::with_id("always_top", "Keep on top").build(app)?;
    let autostart =
        CheckMenuItemBuilder::with_id("autostart", "Start when you sign in").build(app)?;
    let pause = CheckMenuItemBuilder::with_id("set_pause", "Pause video").build(app)?;
    let mute = CheckMenuItemBuilder::with_id("set_mute", "Mute sound").build(app)?;
    let sleep = CheckMenuItemBuilder::with_id("set_sleep", "Sleep the page").build(app)?;
    let minimized = SubmenuBuilder::with_id(app, "minimized", "While minimized")
        .item(&pause)
        .item(&mute)
        .item(&sleep)
        .build()?;
    let focus = CheckMenuItemBuilder::with_id("set_focus", "Focus layout").build(app)?;
    let quiet_off = CheckMenuItemBuilder::with_id("quiet_off", "Off").build(app)?;
    let quiet_nights = CheckMenuItemBuilder::with_id("quiet_nights", "Nights").build(app)?;
    let quiet_custom = CheckMenuItemBuilder::with_id("quiet_custom", "Custom").build(app)?;
    let quiet = SubmenuBuilder::with_id(app, "quiet", "Quiet hours")
        .item(&quiet_off)
        .item(&quiet_nights)
        .item(&quiet_custom)
        .build()?;
    let sep_settings_a = PredefinedMenuItem::separator(app)?;
    let sep_settings_b = PredefinedMenuItem::separator(app)?;
    let settings_menu = SubmenuBuilder::with_id(app, "settings", "Settings")
        .item(&open_settings)
        .item(&sep_settings_a)
        .item(&close_to_tray)
        .item(&always_top)
        .item(&autostart)
        .item(&sep_settings_b)
        .item(&minimized)
        .item(&quiet)
        .item(&focus)
        .build()?;
    let checks = TrayChecks {
        close_to_tray,
        always_top,
        autostart,
        pause,
        mute,
        sleep,
        focus,
        quiet_off,
        quiet_nights,
        quiet_custom,
    };

    // ── View ▸ ─────────────────────────────────────────────────────────────
    let zoom_in = IconMenuItemBuilder::with_id("zoom_in", "Zoom in")
        .icon(menu_icon("zoom-in"))
        .build(app)?;
    let zoom_out = IconMenuItemBuilder::with_id("zoom_out", "Zoom out")
        .icon(menu_icon("zoom-out"))
        .build(app)?;
    let zoom_reset = IconMenuItemBuilder::with_id("zoom_reset", "Reset zoom")
        .icon(menu_icon("zoom-reset"))
        .build(app)?;
    let devtools = IconMenuItemBuilder::with_id("devtools", "Developer tools")
        .icon(menu_icon("devtools"))
        .build(app)?;
    let view = SubmenuBuilder::with_id(app, "view", "View")
        .item(&zoom_in)
        .item(&zoom_out)
        .item(&zoom_reset)
        .item(&devtools)
        .build()?;

    // ── Tools ▸ ────────────────────────────────────────────────────────────
    let open_downloader = IconMenuItemBuilder::with_id("open_downloader", "X-Now Downloader…")
        .icon(menu_icon("cobalt"))
        .build(app)?;
    let saved = IconMenuItemBuilder::with_id("open_saved", "Open saved media folder")
        .icon(menu_icon("bookmarks"))
        .build(app)?;
    let copy_url = IconMenuItemBuilder::with_id("copy_url", "Copy page link")
        .icon(menu_icon("copy-url"))
        .build(app)?;
    let open_browser = IconMenuItemBuilder::with_id("open_browser", "Open page in browser")
        .icon(menu_icon("open-browser"))
        .build(app)?;
    // Clears site caches only; it does not compact process memory.
    let clear_mem = IconMenuItemBuilder::with_id("clear_mem", "Clear site cache")
        .icon(menu_icon("compact-memory"))
        .build(app)?;
    let cobalt_guide = IconMenuItemBuilder::with_id("cobalt_guide", "Cobalt download guide")
        .icon(menu_icon("cobalt"))
        .build(app)?;
    let sep_tools = PredefinedMenuItem::separator(app)?;
    let tools = SubmenuBuilder::with_id(app, "tools", "Tools")
        .item(&open_downloader)
        .item(&saved)
        .item(&sep_tools)
        .item(&copy_url)
        .item(&open_browser)
        .item(&clear_mem)
        .item(&cobalt_guide)
        .build()?;

    // ── X-Now ▸ ────────────────────────────────────────────────────────────
    let show_hide = IconMenuItemBuilder::with_id("show_hide", "Show or hide X-Now")
        .icon(menu_icon("window"))
        .build(app)?;
    let usage_save =
        MenuItemBuilder::with_id("usage_save", "Right-click a photo or video to save it")
            .enabled(false)
            .build(app)?;
    let usage_link = MenuItemBuilder::with_id(
        "usage_link",
        "Right-click a link to open it in your browser",
    )
    .enabled(false)
    .build(app)?;
    let usage_escape =
        MenuItemBuilder::with_id("usage_escape", "Esc closes the viewer or a dialog")
            .enabled(false)
            .build(app)?;
    let usage_native = MenuItemBuilder::with_id("usage_native", "Video controls are X's own")
        .enabled(false)
        .build(app)?;
    let usage = SubmenuBuilder::with_id(app, "how_to", "How to X-Now")
        .item(&usage_save)
        .item(&usage_link)
        .item(&usage_escape)
        .item(&usage_native)
        .build()?;
    let about = IconMenuItemBuilder::with_id("about", "About X-Now")
        .icon(menu_icon("about"))
        .build(app)?;
    let quit = IconMenuItemBuilder::with_id("quit", "Quit X-Now")
        .icon(menu_icon("quit"))
        .build(app)?;

    let separator_a = PredefinedMenuItem::separator(app)?;
    let separator_b = PredefinedMenuItem::separator(app)?;
    let separator_c = PredefinedMenuItem::separator(app)?;

    let menu = MenuBuilder::new(app)
        .item(&show_hide)
        .item(&separator_a)
        .item(&navigate)
        .item(&separator_b)
        .item(&settings_menu)
        .item(&view)
        .item(&tools)
        .item(&separator_c)
        .item(&usage)
        .item(&about)
        .item(&quit)
        .build()?;

    Ok((menu, checks))
}

/// Check items the app keeps in step with settings.json. Stored as managed
/// state so `sync_checks` can reach them from anywhere.
pub(crate) struct TrayChecks {
    close_to_tray: tauri::menu::CheckMenuItem<Wry>,
    always_top: tauri::menu::CheckMenuItem<Wry>,
    autostart: tauri::menu::CheckMenuItem<Wry>,
    pause: tauri::menu::CheckMenuItem<Wry>,
    mute: tauri::menu::CheckMenuItem<Wry>,
    sleep: tauri::menu::CheckMenuItem<Wry>,
    focus: tauri::menu::CheckMenuItem<Wry>,
    quiet_off: tauri::menu::CheckMenuItem<Wry>,
    quiet_nights: tauri::menu::CheckMenuItem<Wry>,
    quiet_custom: tauri::menu::CheckMenuItem<Wry>,
}

/// Pushes the saved settings (and the real autostart state) into the tray checks.
pub(crate) fn sync_checks(app: &AppHandle) {
    use tauri_plugin_autostart::ManagerExt;
    let Some(checks) = app.try_state::<TrayChecks>() else {
        return;
    };
    let s = settings::get();
    let _ = checks.close_to_tray.set_checked(s.close_to_tray);
    let _ = checks.always_top.set_checked(s.always_on_top);
    let _ = checks
        .autostart
        .set_checked(app.autolaunch().is_enabled().unwrap_or(false));
    let _ = checks.pause.set_checked(s.pause_on_minimize);
    let _ = checks.mute.set_checked(s.mute_on_minimize);
    let _ = checks.sleep.set_checked(s.sleep_on_minimize);
    let _ = checks.focus.set_checked(s.focus_layout);
    let _ = checks
        .quiet_off
        .set_checked(s.quiet_mode == settings::QuietMode::Off);
    let _ = checks
        .quiet_nights
        .set_checked(s.quiet_mode == settings::QuietMode::Nights);
    let _ = checks
        .quiet_custom
        .set_checked(s.quiet_mode == settings::QuietMode::Custom);
}

/// Shows the window and opens the in-page Settings panel.
fn show_settings(app: &AppHandle) {
    if let Some(window) = active_x(app) {
        let _ = window.unminimize();
        let _ = window.show();
        let _ = window.set_focus();
        let _ = window.eval("if (window.__xnowOpenSettings) window.__xnowOpenSettings();");
    }
}

/// Opens the folder of the most recent save.
fn open_saved_folder(app: &AppHandle) {
    let latest = settings::get().history.first().and_then(|item| {
        std::path::Path::new(&item.path)
            .parent()
            .map(|p| p.to_path_buf())
    });
    match latest {
        Some(folder) => {
            if let Err(error) = app
                .shell()
                .open(folder.to_string_lossy().into_owned(), None)
            {
                eprintln!("[X-Now] Could not open the saved media folder: {error}");
            }
        }
        None => {
            if let Some(window) = active_x(app) {
                let _ = window
                    .eval("if (window.showToast) window.showToast('No saved media yet', 'info');");
            }
        }
    }
}

/// In-page About overlay for the X window — the TikTok-Now pattern:
/// a seamless card rendered INSIDE the page (no separate window hop). The
/// `__VERSION__` placeholder is replaced with the real package version and
/// `__ICON_DATA_URI__` with the brand icon embedded as a base64 data URI
/// (no asset-protocol calls — the overlay runs on the remote x.com page).
/// The About dialog. Its placeholders (version, icon) are filled in by show_about.
const ABOUT_JS: &str = include_str!("../../frontend/x-about.js");

fn launch_x_in_background(app: &AppHandle) {
    let app = app.clone();
    std::thread::spawn(move || {
        if let Err(error) = crate::launch_x_internal(&app, false) {
            eprintln!("[X-Now] Failed to launch X: {}", error);
        }
    });
}

fn active_x(app: &AppHandle) -> Option<tauri::WebviewWindow> {
    app.get_webview_window("x")
}

// Zoom lives in settings (`zoomPercent`) and is applied to the window by
// `apply_settings_change`. It uses the webview engine's zoom, which scales every
// layer consistently; the old `document.body.style.zoom` hack did not.

/// The restore-vs-hide rule used by both the Show/Hide menu item and a tray
/// icon click. A minimized window is still "visible" per Win32 — so restore
/// it whenever it is minimized, hidden, or merely unfocused (the user clicked
/// the tray expecting the app to come to the front). Only hide when it is
/// visible AND focused (true toggle); pause first so nothing keeps playing.
fn toggle_show_hide(app: &AppHandle) {
    if let Some(window) = active_x(app) {
        let minimized = window.is_minimized().unwrap_or(false);
        let visible = window.is_visible().unwrap_or(false);
        let focused = window.is_focused().unwrap_or(false);
        if minimized || !visible || !focused {
            let _ = window.unminimize();
            let _ = window.show();
            let _ = window.set_focus();
            // Wake the (idle-aware) watchdog so the resume media pass runs NOW.
            crate::wake_watchdog();
        } else {
            let _ = window.eval("if (window.__onWindowHidden) window.__onWindowHidden();");
            let _ = window.hide();
            crate::wake_watchdog();
        }
    } else {
        launch_x_in_background(app);
    }
}

fn navigate(app: &AppHandle, path: &str) {
    if let Some(window) = active_x(app) {
        // show() alone does not restore a minimized window.
        let _ = window.unminimize();
        let _ = window.show();
        let _ = window.set_focus();
        // In-page route (no document reload); a full load only if the page helper is missing.
        let _ = window.eval(&format!(
            "window.__xnowNavigate ? window.__xnowNavigate('{path}') : (window.location.href = 'https://x.com{path}');"
        ));
    }
}

fn navigate_to_profile(app: &AppHandle) {
    // X's own profile tab link carries the signed-in handle; when it is not
    // present (signed out), fall back to the Home feed.
    if let Some(window) = active_x(app) {
        let _ = window.unminimize();
        let _ = window.show();
        let _ = window.set_focus();
        let _ = window.eval(
            r#"var a = document.querySelector('a[data-testid="AppTabBar_Profile_Link"]');
               var path = a ? new URL(a.href).pathname : '/home';
               window.__xnowNavigate ? window.__xnowNavigate(path) : (window.location.href = 'https://x.com' + path);"#,
        );
    }
}

fn show_about(app: &AppHandle) {
    if let Some(window) = active_x(app) {
        let _ = window.unminimize();
        let _ = window.show();
        let _ = window.set_focus();
        // Embed the brand icon as a data URI so the overlay works on the
        // remote x.com page (no asset-protocol / mixed-content issues on any
        // platform). The 512x512 master (icon.png) keeps the 84px render
        // sharp and adds ~0.5 MB to the binary — negligible.
        let icon_b64 = base64::engine::general_purpose::STANDARD
            .encode(include_bytes!("../../icons/icon.png"));
        let icon_data_uri = format!("data:image/png;base64,{}", icon_b64);
        let about_js = ABOUT_JS
            .replace("__VERSION__", env!("CARGO_PKG_VERSION"))
            .replace("__ICON_DATA_URI__", &icon_data_uri);
        let _ = window.eval(&about_js);
    }
}

pub fn setup_tray(app: &AppHandle) -> Result<(), Box<dyn Error>> {
    // Purpose-made 32px tray render: the default window icon decodes the
    // .ico's largest frame (256x256) and Windows downscales it to tray size
    // (16-24px), which looks blurry. A native 32px PNG stays crisp.
    let icon =
        tauri::image::Image::from_bytes(include_bytes!("../../icons/system_tray/tray-32x32.png"))
            .map_err(|error| format!("failed to decode the tray icon: {error}"))?;

    let (menu, checks) = build_menu(app)?;
    app.manage(checks);
    sync_checks(app);

    TrayIconBuilder::with_id("main")
        .icon(icon)
        .menu(&menu)
        .tooltip("X-Now")
        .show_menu_on_left_click(false)
        .on_menu_event(move |app, event| run_action(app, event.id.as_ref()))
        .on_tray_icon_event(|tray, event| {
            if let TrayIconEvent::Click {
                button: MouseButton::Left,
                button_state: MouseButtonState::Up,
                ..
            } = event
            {
                // Same restore-vs-hide rule as the Show/Hide menu item:
                // minimized OR hidden OR unfocused -> restore to the front;
                // visible AND focused -> hide to the tray (pause first).
                toggle_show_hide(&tray.app_handle());
            }
        })
        .build(app)?;

    Ok(())
}

/// Dispatches a native menu item id to its action. Kept separate so both the
/// menu and (previously) the page-side box menu shared one implementation.
pub(crate) fn run_action(app: &AppHandle, action: &str) {
    match action {
        "show_hide" => toggle_show_hide(app),
        "x_home" => navigate(app, "/home"),
        "x_explore" => navigate(app, "/explore"),
        "x_notif" => navigate(app, "/notifications"),
        "x_msgs" => navigate(app, "/messages"),
        "x_bookmarks" => navigate(app, "/i/bookmarks"),
        "x_profile" => navigate_to_profile(app),
        // Soft refresh lives in the page (x-rail.js); a plain reload is the fallback.
        "refresh" => {
            if let Some(window) = active_x(app) {
                let _ = window.eval(
                    "if (window.__xnowRefreshFeed) window.__xnowRefreshFeed(); else window.location.reload();",
                );
            }
        }
        "open_settings" => show_settings(app),
        "open_downloader" => {
            if let Err(error) =
                crate::open_downloader_window_internal(app, None, None, None, None, None)
            {
                eprintln!("[X-Now] Could not open X-Now Downloader: {error}");
            }
        }
        "open_saved" => open_saved_folder(app),
        "autostart" => {
            use tauri_plugin_autostart::ManagerExt;
            let autol = app.autolaunch();
            let now_enabled = !autol.is_enabled().unwrap_or(false);
            let result = if now_enabled {
                autol.enable()
            } else {
                autol.disable()
            };
            if let Err(error) = result {
                eprintln!("[X-Now] Could not change launch at login: {error}");
            }
            sync_checks(app);
            // A toast can only be seen on the visible window.
            if let Some(window) = active_x(app)
                .filter(|w| w.is_visible().unwrap_or(false) && !w.is_minimized().unwrap_or(false))
            {
                let _ = window.eval(&format!(
                    "if (window.showToast) window.showToast('Start when you sign in: {}');",
                    if now_enabled { "on" } else { "off" }
                ));
            }
        }
        "always_top" => {
            crate::change_settings(app, |s| s.always_on_top = !s.always_on_top);
        }
        "set_close_to_tray" => {
            crate::change_settings(app, |s| s.close_to_tray = !s.close_to_tray);
        }
        "set_pause" => {
            crate::change_settings(app, |s| s.pause_on_minimize = !s.pause_on_minimize);
        }
        "set_mute" => {
            crate::change_settings(app, |s| s.mute_on_minimize = !s.mute_on_minimize);
        }
        "set_sleep" => {
            crate::change_settings(app, |s| s.sleep_on_minimize = !s.sleep_on_minimize);
        }
        "set_focus" => {
            crate::change_settings(app, |s| s.focus_layout = !s.focus_layout);
        }
        "quiet_off" => crate::change_settings(app, |s| s.quiet_mode = settings::QuietMode::Off),
        "quiet_nights" => {
            crate::change_settings(app, |s| s.quiet_mode = settings::QuietMode::Nights)
        }
        "quiet_custom" => {
            crate::change_settings(app, |s| s.quiet_mode = settings::QuietMode::Custom)
        }
        "zoom_in" => crate::change_settings(app, |s| {
            s.zoom_percent = (s.zoom_percent + 10).min(300);
        }),
        "zoom_out" => crate::change_settings(app, |s| {
            s.zoom_percent = s.zoom_percent.saturating_sub(10).max(50);
        }),
        "zoom_reset" => crate::change_settings(app, |s| s.zoom_percent = 100),
        "clear_mem" => {
            if let Some(window) = active_x(app) {
                let _ = window.eval(
                    "if (window.caches) caches.keys().then(keys => keys.forEach(key => caches.delete(key)));",
                );
            }
        }
        "devtools" => {
            if let Some(window) = active_x(app) {
                let _ = window.open_devtools();
            }
        }
        "copy_url" => {
            if let Some(window) = active_x(app) {
                // Report the result on the page, so a failed copy is not silent.
                let _ = window.eval(
                    "navigator.clipboard.writeText(location.href).then(() => window.showToast && window.showToast('Page link copied', 'success'), () => window.showToast && window.showToast('Could not copy the link', 'error'));",
                );
            }
        }
        "open_browser" => {
            if let Some(window) = active_x(app) {
                if let Ok(url) = window.url() {
                    let url = url.to_string();
                    if (url.starts_with("https://") || url.starts_with("http://"))
                        && !url.contains(['\r', '\n'])
                    {
                        if let Err(error) = app.shell().open(url, None) {
                            eprintln!(
                                "[X-Now] Failed to open the current page in the browser: {error}"
                            );
                        }
                    }
                }
            }
        }
        "cobalt_guide" => {
            if let Err(error) = app.shell().open("https://cobalt.tools/", None) {
                eprintln!("[X-Now] Failed to open the Cobalt setup guide: {error}");
            }
        }
        "about" => show_about(app),
        // app.exit runs RunEvent::Exit (audio cleanup, profile flush); a raw
        // process::exit skipped both.
        "quit" => app.exit(0),
        _ => {}
    }
}
