#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

#[cfg(target_os = "linux")]
fn configure_linux_webview_env() {
    // Disable DMA-BUF renderer/atlas and GStreamer GL/DMA-BUF video sinks on
    // Linux so WebKitGTK 2.46–2.54 does not hit DRI2/EGL failures or freeze
    // on Mesa/Wayland video playback; respect explicit user overrides.
    for (key, value) in [
        ("WEBKIT_DISABLE_DMABUF_RENDERER", "1"),
        ("WEBKIT_DISABLE_DMABUF_ATLAS", "1"),
        ("WEBKIT_GST_DMABUF_SINK_DISABLED", "1"),
        ("WEBKIT_GST_DISABLE_GL_SINK", "1"),
    ] {
        if std::env::var_os(key).is_none() {
            std::env::set_var(key, value);
        }
    }
    if std::env::var_os("WAYLAND_DISPLAY").is_some_and(|v| !v.is_empty())
        && std::env::var_os("WEBKIT_DISABLE_COMPOSITING_MODE").is_none()
    {
        std::env::set_var("WEBKIT_DISABLE_COMPOSITING_MODE", "1");
    }
}

fn main() {
    #[cfg(target_os = "linux")]
    configure_linux_webview_env();

    x_now_lib::run();
}
