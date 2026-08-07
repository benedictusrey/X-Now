use std::error::Error;

use tauri::{
    menu::{
        CheckMenuItemBuilder, Menu, MenuBuilder, MenuItemBuilder, PredefinedMenuItem,
        SubmenuBuilder,
    },
    tray::{MouseButton, MouseButtonState, TrayIconBuilder, TrayIconEvent},
    AppHandle, Manager, Wry,
};
use tauri_plugin_shell::ShellExt;

fn build_menu(app: &AppHandle) -> Result<(Menu<Wry>, tauri::menu::MenuItem<Wry>), Box<dyn Error>> {
    let show_hide = MenuItemBuilder::with_id("show_hide", "Show / Hide X-Now").build(app)?;
    let always_top = CheckMenuItemBuilder::with_id("always_top", "Always on top").build(app)?;

    let x_home = MenuItemBuilder::with_id("x_home", "Home feed").build(app)?;
    let x_explore = MenuItemBuilder::with_id("x_explore", "Explore").build(app)?;
    let x_notif = MenuItemBuilder::with_id("x_notif", "Notifications").build(app)?;
    let x_msgs = MenuItemBuilder::with_id("x_msgs", "Messages").build(app)?;
    let x_bookmarks = MenuItemBuilder::with_id("x_bookmarks", "Bookmarks").build(app)?;
    let x_profile = MenuItemBuilder::with_id("x_profile", "My profile").build(app)?;

    let refresh = MenuItemBuilder::with_id("refresh", "Refresh").build(app)?;
    let zoom_in = MenuItemBuilder::with_id("zoom_in", "Zoom in").build(app)?;
    let zoom_out = MenuItemBuilder::with_id("zoom_out", "Zoom out").build(app)?;
    let zoom_reset = MenuItemBuilder::with_id("zoom_reset", "Reset zoom (100%)").build(app)?;

    let clear_mem = MenuItemBuilder::with_id("clear_mem", "Compact memory and cache").build(app)?;
    let devtools = MenuItemBuilder::with_id("devtools", "Open developer tools").build(app)?;
    let copy_url = MenuItemBuilder::with_id("copy_url", "Copy current page URL").build(app)?;
    let open_browser =
        MenuItemBuilder::with_id("open_browser", "Open current page in browser").build(app)?;
    let autostart = MenuItemBuilder::with_id("autostart", "🚀 Launch on Startup").build(app)?;

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

    let about = MenuItemBuilder::with_id("about", "About X-Now").build(app)?;
    let quit = MenuItemBuilder::with_id("quit", "Quit X-Now").build(app)?;

    let separator_show = PredefinedMenuItem::separator(app)?;
    let separator_navigation = PredefinedMenuItem::separator(app)?;
    let separator_view = PredefinedMenuItem::separator(app)?;
    let separator_tools = PredefinedMenuItem::separator(app)?;
    let separator_about = PredefinedMenuItem::separator(app)?;

    Ok((
        MenuBuilder::new(app)
            .item(&show_hide)
            .item(&separator_show)
            .item(&x_home)
            .item(&x_explore)
            .item(&x_notif)
            .item(&x_msgs)
            .item(&x_bookmarks)
            .item(&x_profile)
            .item(&separator_navigation)
            .item(&refresh)
            .item(&zoom_in)
            .item(&zoom_out)
            .item(&zoom_reset)
            .item(&always_top)
            .item(&separator_view)
            .item(&clear_mem)
            .item(&devtools)
            .item(&copy_url)
            .item(&open_browser)
            .item(&autostart)
            .item(&separator_tools)
            .item(&usage)
            .item(&about)
            .item(&separator_about)
            .item(&quit)
            .build()?,
        autostart,
    ))
}

/// In-page About overlay for the X window — the TikTok-Now pattern:
/// a seamless card rendered INSIDE the page (no separate window hop). The
/// `__VERSION__` placeholder is replaced with the real package version.
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
    'background:rgba(0,0,0,0.82);backdrop-filter:blur(12px);' +
    '-webkit-backdrop-filter:blur(12px);display:flex;align-items:center;' +
    'justify-content:center;z-index:2147483647;' +
    'font-family:system-ui,-apple-system,Segoe UI,sans-serif;');
  overlay.id = ID;
  overlay.onclick = function(e) { if (e.target === overlay) overlay.remove(); };

  var card = el('div',
    'background:#0f1419;border:1px solid #1D9BF0;border-radius:24px;' +
    'padding:2.4rem 2.2rem;width:500px;max-width:92vw;max-height:90vh;overflow-y:auto;text-align:center;' +
    'position:relative;box-shadow:0 20px 60px rgba(0,0,0,0.9),0 0 40px rgba(29,155,240,0.25);' +
    'color:#fff;');

  // Close X
  var closeX = btn('\u00d7',
    'position:absolute;top:14px;right:18px;background:none;border:none;' +
    'color:#8e8ea0;font-size:26px;cursor:pointer;line-height:1;');
  card.appendChild(closeX);

  // X logo mark (inline SVG — no asset loading on the remote page)
  var svgNS = 'http://www.w3.org/2000/svg';
  var svg = document.createElementNS(svgNS, 'svg');
  svg.setAttribute('width', '64'); svg.setAttribute('height', '64');
  svg.setAttribute('viewBox', '0 0 24 24');
  svg.style.cssText = 'filter:drop-shadow(0 0 14px rgba(29,155,240,0.5));margin:0 auto 1rem;display:block;';
  svg.innerHTML = '<path fill="#ffffff" d="M18.244 2.25h3.308l-7.227 8.26 8.502 11.24H16.17l-5.214-6.817L4.99 21.75H1.68l7.73-8.835L1.254 2.25H8.08l4.713 6.231zm-1.161 17.52h1.833L7.084 4.126H5.117z"/>';
  card.appendChild(svg);

  // Kicker — explicit line-height: X's global CSS sets tight heading
  // line-heights, which CROPS gradient-clipped titles; every text element
  // here pins its own.
  var kicker = el('p',
    'color:#8e8ea0;font-size:10px;font-weight:800;letter-spacing:1.5px;' +
    'line-height:1.4;margin:0 0 4px;text-transform:uppercase;');
  kicker.textContent = 'X Desktop View';
  card.appendChild(kicker);

  // Title
  var h2 = el('h2',
    'font-size:2rem;font-weight:800;line-height:1.25;padding:0.1em 0;margin:0 0 0.35rem;' +
    'color:#ffffff;');
  h2.textContent = 'X-Now';
  card.appendChild(h2);

  var sub = el('p',
    'color:#1D9BF0;font-size:0.88rem;font-weight:bold;line-height:1.4;margin:0 0 0.2rem;');
  sub.textContent = 'Your focused X desktop experience \ud83d\udc26';
  card.appendChild(sub);

  var ver = el('p',
    'color:#8e8ea0;font-size:0.78rem;line-height:1.5;margin:0 0 0.6rem;');
  ver.textContent = 'v__VERSION__ • Powered by Rust & Tauri v2';
  card.appendChild(ver);

  var desc = el('p',
    'color:#c9c9d2;font-size:0.82rem;line-height:1.6;margin:0 0 1.5rem;');
  desc.textContent = 'Posts, media, DMs and more in a lightweight native window ' +
    '— with tray controls, close-to-tray, media saving and guaranteed ' +
    'silence on minimize.';
  card.appendChild(desc);

  // Author
  var author = el('div', 'font-size:0.78rem;line-height:1.5;color:#8e8ea0;margin-bottom:1.5rem;');
  var authorLink = document.createElement('a');
  authorLink.textContent = '@benedictusrey';
  authorLink.href = 'https://github.com/benedictusrey';
  authorLink.style.cssText = 'color:#1D9BF0;text-decoration:none;font-weight:bold;cursor:pointer;';
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
  author.appendChild(document.createTextNode('Authored and maintained with \u2764\ufe0f by '));
  author.appendChild(authorLink);
  card.appendChild(author);

  // Got It button
  var gotit = btn('Got It!',
    'background:#1D9BF0;color:#fff;font-weight:bold;' +
    'border:none;padding:0.7rem 2.4rem;border-radius:12px;cursor:pointer;line-height:1.4;' +
    'font-size:0.92rem;box-shadow:0 4px 15px rgba(29,155,240,0.3);');
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
        let about_js = ABOUT_JS.replace("__VERSION__", env!("CARGO_PKG_VERSION"));
        let _ = window.eval(&about_js);
    }
}

pub fn setup_tray(app: &AppHandle) -> Result<(), Box<dyn Error>> {
    let (menu, autostart_handle) = build_menu(app)?;
    let icon = app
        .default_window_icon()
        .cloned()
        .ok_or_else(|| std::io::Error::other("failed to get default window icon"))?;

    TrayIconBuilder::with_id("main")
        .icon(icon)
        .menu(&menu)
        .tooltip("X-Now Desktop")
        .show_menu_on_left_click(false)
        .on_menu_event(move |app, event| match event.id.as_ref() {
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
            "always_top" => {
                if let Some(window) = active_x(app) {
                    if let Ok(is_top) = window.is_always_on_top() {
                        let _ = window.set_always_on_top(!is_top);
                    }
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
                let _ = autostart_handle.set_text(format!(
                    "🚀 Launch on Startup: {}",
                    if now_enabled { "ON" } else { "OFF" }
                ));
                if let Some(window) = active_x(app) {
                    let _ = window.eval(&format!(
                        "if (window.showToast) window.showToast('🚀 Launch on Startup: {}');",
                        if now_enabled { "ON" } else { "OFF" }
                    ));
                }
            }
            "about" => show_about(app),
            "quit" => std::process::exit(0),
            _ => {}
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
