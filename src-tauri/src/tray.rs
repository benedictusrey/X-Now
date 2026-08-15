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
fn build_menu(
    app: &AppHandle,
) -> Result<(Menu<Wry>, tauri::menu::CheckMenuItem<Wry>, tauri::menu::CheckMenuItem<Wry>), Box<dyn Error>> {
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
    let navigate = SubmenuBuilder::with_id(app, "navigate", "Navigate")
        .item(&x_home)
        .item(&x_explore)
        .item(&x_notif)
        .item(&x_msgs)
        .item(&x_bookmarks)
        .item(&x_profile)
        .build()?;

    // ── Window ▸ ───────────────────────────────────────────────────────────
    let always_top = CheckMenuItemBuilder::with_id("always_top", "Always on top").build(app)?;
    let autostart =
        CheckMenuItemBuilder::with_id("autostart", "Launch on Startup").build(app)?;
    let refresh = IconMenuItemBuilder::with_id("refresh", "Refresh")
        .icon(menu_icon("refresh"))
        .build(app)?;
    let window = SubmenuBuilder::with_id(app, "window", "Window")
        .item(&always_top)
        .item(&autostart)
        .item(&refresh)
        .build()?;

    // ── View ▸ ─────────────────────────────────────────────────────────────
    let zoom_in = IconMenuItemBuilder::with_id("zoom_in", "Zoom in")
        .icon(menu_icon("zoom-in"))
        .build(app)?;
    let zoom_out = IconMenuItemBuilder::with_id("zoom_out", "Zoom out")
        .icon(menu_icon("zoom-out"))
        .build(app)?;
    let zoom_reset = IconMenuItemBuilder::with_id("zoom_reset", "Reset zoom (100%)")
        .icon(menu_icon("zoom-reset"))
        .build(app)?;
    let devtools = IconMenuItemBuilder::with_id("devtools", "Open developer tools")
        .icon(menu_icon("devtools"))
        .build(app)?;
    let view = SubmenuBuilder::with_id(app, "view", "View")
        .item(&zoom_in)
        .item(&zoom_out)
        .item(&zoom_reset)
        .item(&devtools)
        .build()?;

    // ── Tools ▸ ────────────────────────────────────────────────────────────
    let copy_url = IconMenuItemBuilder::with_id("copy_url", "Copy current page URL")
        .icon(menu_icon("copy-url"))
        .build(app)?;
    let open_browser = IconMenuItemBuilder::with_id("open_browser", "Open current page in browser")
        .icon(menu_icon("open-browser"))
        .build(app)?;
    let clear_mem =
        IconMenuItemBuilder::with_id("clear_mem", "Compact memory and cache")
            .icon(menu_icon("compact-memory"))
            .build(app)?;
    let cobalt_guide = IconMenuItemBuilder::with_id("cobalt_guide", "Cobalt downloader guide")
        .icon(menu_icon("cobalt"))
        .build(app)?;
    let tools = SubmenuBuilder::with_id(app, "tools", "Tools")
        .item(&copy_url)
        .item(&open_browser)
        .item(&clear_mem)
        .item(&cobalt_guide)
        .build()?;

    // ── X-Now ▸ ────────────────────────────────────────────────────────────
    let show_hide = IconMenuItemBuilder::with_id("show_hide", "Show / Hide X-Now")
        .icon(menu_icon("window"))
        .build(app)?;
    let usage_save = MenuItemBuilder::with_id(
        "usage_save",
        "Right-click image/video: save to Downloads\\X-Now",
    )
    .enabled(false)
    .build(app)?;
    let usage_link =
        MenuItemBuilder::with_id("usage_link", "Right-click link: open in default browser")
            .enabled(false)
            .build(app)?;
    let usage_escape =
        MenuItemBuilder::with_id("usage_escape", "Esc: close the media lightbox or a dialog")
            .enabled(false)
            .build(app)?;
    let usage_native = MenuItemBuilder::with_id(
        "usage_native",
        "Video playback, mute and fullscreen stay X's own controls",
    )
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
        .item(&window)
        .item(&view)
        .item(&tools)
        .item(&separator_c)
        .item(&usage)
        .item(&about)
        .item(&quit)
        .build()?;

    Ok((menu, always_top, autostart))
}

/// In-page About overlay for the X window — the TikTok-Now pattern:
/// a seamless card rendered INSIDE the page (no separate window hop). The
/// `__VERSION__` placeholder is replaced with the real package version and
/// `__ICON_DATA_URI__` with the brand icon embedded as a base64 data URI
/// (no asset-protocol calls — the overlay runs on the remote x.com page).
const ABOUT_JS: &str = r##"(function() {
  var ID = '__xnow_about';
  var old = document.getElementById(ID);
  if (old) { old.remove(); return; }

  function el(tag, css, extra) {
    var e = document.createElement(tag);
    if (css) e.style.cssText = css;
    if (extra) Object.assign(e, extra);
    return e;
  }
  function btn(label, cssTxt) {
    var b = el('button', cssTxt);
    b.textContent = label;
    b.onclick = function() { document.getElementById(ID).remove(); };
    return b;
  }

  var overlay = el('div',
    'position:fixed;top:0;left:0;width:100vw;height:100vh;' +
    'background:rgba(0,0,0,0.80);backdrop-filter:blur(10px);' +
    '-webkit-backdrop-filter:blur(10px);display:flex;align-items:center;' +
    'justify-content:center;z-index:2147483647;' +
    'font-family:system-ui,-apple-system,Segoe UI,sans-serif;');
  overlay.id = ID;
  overlay.onclick = function(e) { if (e.target === overlay) overlay.remove(); };

  var card = el('div',
    'background:#0f1419;border:1px solid rgba(29,155,240,0.45);border-radius:22px;' +
    'padding:1.7rem 1.9rem 1.5rem;width:470px;max-width:92vw;max-height:88vh;' +
    'overflow-y:auto;text-align:center;position:relative;' +
    'box-shadow:0 18px 55px rgba(0,0,0,0.85),0 0 30px rgba(29,155,240,0.18);' +
    'color:#fff;');

  // Close X
  var closeX = btn('\u00d7',
    'position:absolute;top:10px;right:14px;background:none;border:none;' +
    'color:#8e8ea0;font-size:22px;cursor:pointer;line-height:1;');
  card.appendChild(closeX);

  // The X-Now brand icon (embedded data URI — works on the remote page)
  var icon = document.createElement('img');
  icon.src = '__ICON_DATA_URI__';
  icon.alt = 'X-Now';
  icon.style.cssText = 'width:84px;height:84px;border-radius:20px;' +
    'box-shadow:0 10px 28px rgba(0,0,0,0.55),0 0 22px rgba(29,155,240,0.3);' +
    'margin:0 auto 14px;display:block;';
  card.appendChild(icon);

  // Kicker — explicit line-height: X's global CSS sets tight heading
  // line-heights, which CROPS clipped titles; every text element here pins
  // its own.
  var kicker = el('p',
    'color:#8e8ea0;font-size:11px;font-weight:700;letter-spacing:2px;' +
    'line-height:1.4;margin:0 0 4px;text-transform:uppercase;');
  kicker.textContent = 'Desktop client for X';
  card.appendChild(kicker);

  // Title
  var h2 = el('h2',
    'font-size:1.75rem;font-weight:800;line-height:1.25;margin:0 0 2px;color:#ffffff;');
  h2.textContent = 'X-Now';
  card.appendChild(h2);

  var sub = el('p',
    'color:#1D9BF0;font-size:0.95rem;font-weight:600;line-height:1.4;margin:0 0 6px;');
  sub.textContent = 'The X you know, with desktop superpowers.';
  card.appendChild(sub);

  var ver = el('p',
    'color:#8e8ea0;font-size:0.85rem;line-height:1.5;margin:0 0 1.1rem;');
  ver.textContent = 'Version __VERSION__ · Rust + Tauri v2 · ~7 MB';
  card.appendChild(ver);

  // Feature grid — two columns of compact, informative highlights
  var grid = el('div',
    'display:flex;flex-wrap:wrap;gap:8px;margin:0 0 1.1rem;text-align:left;');
  function chip(icon, title, desc) {
    var c = el('div',
      'flex:1 1 44%;min-width:185px;background:rgba(255,255,255,0.045);' +
      'border:1px solid rgba(255,255,255,0.08);border-radius:12px;' +
      'padding:9px 11px;');
    var t = el('div',
      'color:#fff;font-size:0.88rem;font-weight:700;line-height:1.4;margin:0 0 2px;');
    t.textContent = icon + ' ' + title;
    var d = el('div',
      'color:#a7a7b3;font-size:0.8rem;line-height:1.45;margin:0;');
    d.textContent = desc;
    c.append(t, d);
    return c;
  }
  grid.append(
    chip('\ud83d\udcbe', 'Save media', 'Right-click images and videos to save them to Downloads\\X-Now'),
    chip('\ud83d\udda5\ufe0f', 'Tray controls', 'Close-to-tray, show/hide, navigation and zoom from the tray'),
    chip('\ud83d\udd07', 'Quiet minimize', 'Guaranteed silence on minimize — page pause plus an OS-level mute'),
    chip('\ud83c\udf10', 'Links open out', 'External links hand off to your default browser automatically')
  );
  card.appendChild(grid);

  // Built-by credit
  var built = el('p',
    'color:#fff;font-size:0.85rem;font-weight:600;line-height:1.5;margin:0 0 1.1rem;');
  built.appendChild(document.createTextNode('Built with \u2764\ufe0f by '));
  var authorLink = document.createElement('a');
  authorLink.textContent = '@benedictusrey';
  authorLink.href = 'https://github.com/benedictusrey';
  authorLink.style.cssText = 'color:#1D9BF0;text-decoration:none;cursor:pointer;';
  authorLink.onclick = function(e) {
    e.preventDefault();
    e.stopImmediatePropagation();
    try {
      if (window.__TAURI__ && window.__TAURI__.core && window.__TAURI__.core.invoke) {
        // Opens in the OS default browser via the native bridge; if that
        // fails for any reason, fall back to a plain new-window open.
        window.__TAURI__.core.invoke('open_external_url', { url: 'https://github.com/benedictusrey' })
          .catch(function() { window.open('https://github.com/benedictusrey', '_blank'); });
      } else {
        window.open('https://github.com/benedictusrey', '_blank');
      }
    } catch (err) {
      window.open('https://github.com/benedictusrey', '_blank');
    }
  };
  built.appendChild(authorLink);
  card.appendChild(built);

  // Got It button
  var gotit = btn('Got It!',
    'background:#1D9BF0;color:#fff;font-weight:700;' +
    'border:none;padding:0.6rem 2.2rem;border-radius:10px;cursor:pointer;line-height:1.4;' +
    'font-size:0.92rem;box-shadow:0 4px 14px rgba(29,155,240,0.3);');
  card.appendChild(gotit);

  overlay.appendChild(card);
  document.body.appendChild(overlay);
})();"##;

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
        } else {
            let _ = window.eval("if (window.__onWindowHidden) window.__onWindowHidden();");
            let _ = window.hide();
        }
    } else {
        launch_x_in_background(app);
    }
}

fn navigate(app: &AppHandle, path: &str) {
    if let Some(window) = active_x(app) {
        let _ = window.show();
        let _ = window.set_focus();
        let _ = window.eval(&format!("window.location.href = 'https://x.com{}';", path));
    }
}

fn navigate_to_profile(app: &AppHandle) {
    // X's own profile tab link carries the signed-in handle; when it is not
    // present (signed out), fall back to the Home feed.
    if let Some(window) = active_x(app) {
        let _ = window.show();
        let _ = window.set_focus();
        let _ = window.eval(
            r#"var a = document.querySelector('a[data-testid="AppTabBar_Profile_Link"]');
               window.location.href = a ? a.href : 'https://x.com/home';"#,
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
    let icon = tauri::image::Image::from_bytes(include_bytes!("../../icons/system_tray/tray-32x32.png"))
        .map_err(|error| format!("failed to decode the tray icon: {error}"))?;

    let (menu, always_top, autostart) = build_menu(app)?;

    // Sync the initial checkmarks with the real state.
    let always_top_checked = active_x(app)
        .and_then(|window| window.is_always_on_top().ok())
        .unwrap_or(false);
    let _ = always_top.set_checked(always_top_checked);
    use tauri_plugin_autostart::ManagerExt;
    let _ = autostart.set_checked(app.autolaunch().is_enabled().unwrap_or(false));

    TrayIconBuilder::with_id("main")
        .icon(icon)
        .menu(&menu)
        .tooltip("X-Now Desktop")
        .show_menu_on_left_click(false)
        .on_menu_event(move |app, event| {
            match event.id.as_ref() {
                // Toggles update their checkmark too.
                "always_top" => {
                    if let Some(window) = active_x(app) {
                        if let Ok(is_top) = window.is_always_on_top() {
                            let _ = window.set_always_on_top(!is_top);
                            let _ = always_top.set_checked(!is_top);
                        }
                    }
                }
                "autostart" => {
                    use tauri_plugin_autostart::ManagerExt;
                    let autol = app.autolaunch();
                    let was_enabled = autol.is_enabled().unwrap_or(false);
                    if was_enabled {
                        let _ = autol.disable();
                    } else {
                        let _ = autol.enable();
                    }
                    let now_enabled = !was_enabled;
                    let _ = autostart.set_checked(now_enabled);
                    if let Some(window) = active_x(app) {
                        let _ = window.eval(&format!(
                            "if (window.showToast) window.showToast('🚀 Launch on Startup: {}');",
                            if now_enabled { "ON" } else { "OFF" }
                        ));
                    }
                }
                _ => run_action(app, event.id.as_ref()),
            }
        })
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
        "refresh" => {
            if let Some(window) = active_x(app) {
                let _ = window.eval("window.location.reload();");
            }
        }
        "zoom_in" => {
            if let Some(window) = active_x(app) {
                let _ = window.eval(
                    "document.body.style.zoom = (parseFloat(document.body.style.zoom || '1') + 0.1).toFixed(1);",
                );
            }
        }
        "zoom_out" => {
            if let Some(window) = active_x(app) {
                let _ = window.eval(
                    "document.body.style.zoom = Math.max(0.5, (parseFloat(document.body.style.zoom || '1') - 0.1)).toFixed(1);",
                );
            }
        }
        "zoom_reset" => {
            if let Some(window) = active_x(app) {
                let _ = window.eval("document.body.style.zoom = '1';");
            }
        }
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
                let _ = window.eval(
                    "navigator.clipboard.writeText(window.location.href).catch(() => {});",
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
                            eprintln!("[X-Now] Failed to open the current page in the browser: {error}");
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
        "quit" => std::process::exit(0),
        _ => {}
    }
}
