// Copyright (c) 2026 Benedictus Reynaldo Hartanto (@benedictusrey). All rights reserved.
// X-Now — High-performance desktop client for X (https://github.com/benedictusrey/X-Now)
// Licensed under the MIT License.

use std::{
    collections::{HashMap, HashSet},
    env,
    ffi::OsStr,
    fs,
    io::Write,
    path::{Path, PathBuf},
    process::{Command, Output, Stdio},
    sync::{
        atomic::{AtomicU64, Ordering},
        Mutex,
    },
    time::{SystemTime, UNIX_EPOCH},
};

#[cfg(windows)]
use std::os::windows::process::CommandExt;

use serde::{Deserialize, Serialize};
use serde_json::Value;
use tokio::sync::oneshot;

static TEMP_SEQ: AtomicU64 = AtomicU64::new(1);

const DEFAULT_UA: &str =
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36";

pub fn apply_no_window(cmd: &mut Command) {
    #[cfg(windows)]
    {
        const CREATE_NO_WINDOW: u32 = 0x0800_0000;
        cmd.creation_flags(CREATE_NO_WINDOW);
    }
    #[cfg(not(windows))]
    let _ = cmd;
}

pub fn system_curl_bin() -> String {
    #[cfg(windows)]
    {
        let root = env::var("SystemRoot").unwrap_or_else(|_| "C:\\Windows".to_string());
        return format!("{root}\\System32\\curl.exe");
    }
    #[cfg(not(windows))]
    {
        let sys_curl = Path::new("/usr/bin/curl");
        if sys_curl.is_file() {
            return sys_curl.to_string_lossy().into_owned();
        }
        "curl".to_string()
    }
}

pub fn is_windows_reserved_stem(raw: &str) -> bool {
    let base = raw.split('.').next().unwrap_or(raw).trim();
    matches!(
        base.to_ascii_uppercase().as_str(),
        "CON"
            | "PRN"
            | "AUX"
            | "NUL"
            | "COM1"
            | "COM2"
            | "COM3"
            | "COM4"
            | "COM5"
            | "COM6"
            | "COM7"
            | "COM8"
            | "COM9"
            | "LPT1"
            | "LPT2"
            | "LPT3"
            | "LPT4"
            | "LPT5"
            | "LPT6"
            | "LPT7"
            | "LPT8"
            | "LPT9"
    )
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct VideoFormat {
    pub id: String,
    pub label: String,
    pub width: u32,
    pub height: u32,
    pub bandwidth: u64,
    pub ext: String,
    pub requires_mux: bool,
    pub video_url: String,
    pub audio_url: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct MediaItemSpec {
    pub index: usize,
    pub kind: String,
    pub thumbnail_url: Option<String>,
    pub formats: Vec<VideoFormat>,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct InspectedPost {
    pub tweet_id: String,
    pub username: String,
    pub display_name: String,
    pub post_url: String,
    pub created_at: String,
    pub text: String,
    pub ffmpeg_available: bool,
    pub items: Vec<MediaItemSpec>,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct DownloadOutcome {
    pub saved_paths: Vec<String>,
    pub text_path: Option<String>,
    pub metadata_path: Option<String>,
    pub subfolder: Option<String>,
    pub warning: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct PendingDownloadOpen {
    pub url: String,
    pub payload_json: Option<String>,
    #[serde(default)]
    pub item_index: Option<usize>,
    #[serde(default)]
    pub item_hint: Option<String>,
    #[serde(default)]
    pub theme: Option<String>,
}

#[derive(Default)]
pub struct DownloaderProbeState {
    pub pending_open: Mutex<Option<PendingDownloadOpen>>,
    pub pending_probes: Mutex<HashMap<String, oneshot::Sender<String>>>,
}

impl DownloaderProbeState {
    pub fn set_pending_open(&self, open: Option<PendingDownloadOpen>) {
        let mut slot = self.pending_open.lock().unwrap_or_else(|e| e.into_inner());
        *slot = open;
    }

    pub fn take_pending_open(&self) -> Option<PendingDownloadOpen> {
        self.pending_open
            .lock()
            .unwrap_or_else(|e| e.into_inner())
            .take()
    }

    pub fn register_probe(&self, request_id: String, tx: oneshot::Sender<String>) {
        let mut map = self
            .pending_probes
            .lock()
            .unwrap_or_else(|e| e.into_inner());
        map.insert(request_id, tx);
    }

    pub fn resolve_probe(&self, request_id: &str, payload: String) -> bool {
        let sender = self
            .pending_probes
            .lock()
            .unwrap_or_else(|e| e.into_inner())
            .remove(request_id);
        match sender {
            Some(tx) => tx.send(payload).is_ok(),
            None => false,
        }
    }

    pub fn cancel_probe(&self, request_id: &str) {
        self.pending_probes
            .lock()
            .unwrap_or_else(|e| e.into_inner())
            .remove(request_id);
    }
}

pub fn is_safe_http_url(url: &str) -> bool {
    let trimmed = url.trim();
    (trimmed.starts_with("https://") || trimmed.starts_with("http://"))
        && !trimmed.contains(['\r', '\n', '\0'])
}

pub fn is_x_app_host(url: &str) -> bool {
    tauri::Url::parse(url.trim())
        .ok()
        .and_then(|parsed| parsed.host_str().map(|h| h.to_ascii_lowercase()))
        .is_some_and(|host| {
            host == "x.com"
                || host.ends_with(".x.com")
                || host == "twitter.com"
                || host.ends_with(".twitter.com")
        })
}

pub fn is_x_share_url(url: &str) -> bool {
    tauri::Url::parse(url.trim())
        .ok()
        .and_then(|parsed| parsed.host_str().map(|h| h.to_ascii_lowercase()))
        .is_some_and(|host| {
            matches!(
                host.as_str(),
                "x.com"
                    | "twitter.com"
                    | "fxtwitter.com"
                    | "vxtwitter.com"
                    | "fixupx.com"
                    | "fixvx.com"
            ) || host.ends_with(".x.com")
                || host.ends_with(".twitter.com")
                || host.ends_with(".fxtwitter.com")
                || host.ends_with(".vxtwitter.com")
                || host.ends_with(".fixupx.com")
                || host.ends_with(".fixvx.com")
        })
}

pub fn is_x_media_url(url: &str) -> bool {
    let Some(rest) = url.trim().strip_prefix("https://") else {
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

pub fn unescape_url(raw: &str) -> String {
    raw.trim()
        .replace("\\u0026", "&")
        .replace("\\u003A", ":")
        .replace("\\u003a", ":")
        .replace("\\u002F", "/")
        .replace("\\u002f", "/")
        .replace("\\u003F", "?")
        .replace("\\u003f", "?")
        .replace("\\u003D", "=")
        .replace("\\u003d", "=")
        .replace("\\/", "/")
        .replace("&amp;", "&")
        .replace("&lt;", "<")
        .replace("&gt;", ">")
        .replace("&quot;", "\"")
        .replace("&#39;", "'")
        .replace("&#x27;", "'")
}

fn sanitize_media_url(raw: &str) -> Option<String> {
    let cleaned = unescape_url(raw);
    if !is_safe_http_url(&cleaned) || !is_x_media_url(&cleaned) {
        return None;
    }
    if cleaned.contains("twimg.com/static/") || cleaned.contains("abs.twimg.com/") {
        return None;
    }
    Some(cleaned)
}

pub fn tweet_id_from_url(input: &str) -> Option<String> {
    let trimmed = input.trim();
    if trimmed.is_empty() {
        return None;
    }
    if trimmed.chars().all(|c| c.is_ascii_digit()) && (5..=24).contains(&trimmed.len()) {
        return Some(trimmed.to_string());
    }
    if (trimmed.contains("://") || trimmed.to_ascii_lowercase().starts_with("http"))
        && !is_x_share_url(trimmed)
    {
        return None;
    }
    if let Some(pos) = trimmed.find("/status/") {
        let rest = &trimmed[pos + "/status/".len()..];
        let id = rest.split(['/', '?', '#', '&']).next().unwrap_or("").trim();
        if !id.is_empty() && id.chars().all(|c| c.is_ascii_digit()) {
            return Some(id.to_string());
        }
    }
    None
}

pub fn username_from_url(input: &str) -> Option<String> {
    let parsed = tauri::Url::parse(input.trim()).ok()?;
    let mut segs = parsed.path_segments()?;
    let first = segs.next()?.trim();
    let second = segs.next()?.trim();
    if second == "status" && !first.is_empty() && first != "i" {
        Some(first.to_string())
    } else {
        None
    }
}

/// Twitter embed syndication token: `((id / 1e15) * PI)` formatted in base-36
/// with `0` and `.` stripped.
pub fn syndication_token(tweet_id: &str) -> String {
    let Ok(id) = tweet_id.trim().parse::<f64>() else {
        return "0".to_string();
    };
    if !id.is_finite() || id <= 0.0 {
        return "0".to_string();
    }
    let val = (id / 1e15) * std::f64::consts::PI;
    // Format fractional base-36 up to 12 digits, matching JS `(num).toString(36).replace(/(0+|\.)/g, '')`.
    let int_part = val.trunc() as u64;
    let mut frac = val.fract();
    let mut out = String::with_capacity(16);
    if int_part > 0 {
        let mut n = int_part;
        let mut digits = Vec::new();
        while n > 0 {
            let d = (n % 36) as u8;
            if d != 0 {
                digits.push(if d < 10 { b'0' + d } else { b'a' + (d - 10) });
            }
            n /= 36;
        }
        for &b in digits.iter().rev() {
            out.push(b as char);
        }
    }
    for _ in 0..12 {
        frac *= 36.0;
        let d = frac.trunc() as u8;
        frac -= d as f64;
        if d > 0 && d < 36 {
            out.push((if d < 10 { b'0' + d } else { b'a' + (d - 10) }) as char);
        }
    }
    if out.is_empty() {
        "0".to_string()
    } else {
        out
    }
}

fn parse_dimensions_from_url(url: &str) -> (u32, u32) {
    for seg in url.split(['/', '?']) {
        if let Some((w_str, h_str)) = seg.split_once('x') {
            if let (Ok(w), Ok(h)) = (w_str.parse::<u32>(), h_str.parse::<u32>()) {
                if (64..=8192).contains(&w) && (64..=8192).contains(&h) {
                    return (w, h);
                }
            }
        }
    }
    (0, 0)
}

fn format_resolution_label(width: u32, height: u32, bitrate: u64, suffix: &str) -> String {
    let kbps = if bitrate >= 1000 {
        format!(" · {} kbps", bitrate / 1000)
    } else {
        String::new()
    };
    let short_side = width.min(height);
    if short_side > 0 {
        format!("{short_side}p MP4{kbps}{suffix}")
    } else if width > 0 && height > 0 {
        format!("{width}x{height} MP4{kbps}{suffix}")
    } else {
        format!("MP4{kbps}{suffix}")
    }
}

fn push_unique_format(list: &mut Vec<VideoFormat>, candidate: VideoFormat) {
    let dup = list
        .iter()
        .any(|existing| existing.video_url == candidate.video_url && existing.ext == candidate.ext);
    if !dup {
        list.push(candidate);
    }
}

fn build_twimg_image_variants(raw_url: &str, orig_w: u32, orig_h: u32) -> Vec<VideoFormat> {
    let Some(clean) = sanitize_media_url(raw_url) else {
        return Vec::new();
    };
    let mut formats = Vec::new();
    if let Ok(parsed) = tauri::Url::parse(&clean) {
        if parsed.host_str().is_some_and(|h| h.ends_with("twimg.com"))
            && parsed.path().contains("/media/")
        {
            let ext_from_path = Path::new(parsed.path())
                .extension()
                .and_then(|e| e.to_str())
                .map(|s| s.to_ascii_lowercase())
                .filter(|s| matches!(s.as_str(), "jpg" | "jpeg" | "png" | "webp"));
            let source_format = parsed
                .query_pairs()
                .find(|(k, _)| k == "format")
                .map(|(_, v)| v.into_owned().to_ascii_lowercase())
                .or(ext_from_path)
                .unwrap_or_else(|| "jpg".to_string());
            let path_str = parsed.path();
            let clean_path = ["jpg", "jpeg", "png", "webp"]
                .iter()
                .find_map(|ext| {
                    let dot_len = ext.len() + 1;
                    (path_str.len() > dot_len
                        && path_str.as_bytes()[path_str.len() - dot_len] == b'.'
                        && path_str[path_str.len() - ext.len()..].eq_ignore_ascii_case(ext))
                    .then(|| &path_str[..path_str.len() - dot_len])
                })
                .unwrap_or(path_str);
            let base = format!(
                "{}://{}{clean_path}",
                parsed.scheme(),
                parsed.host_str().unwrap_or("")
            );
            let dims = if orig_w > 0 && orig_h > 0 {
                format!("{orig_w}x{orig_h} ")
            } else {
                String::new()
            };

            // Offer both .jpg and .png at full authentic resolution (orig first), omitting WebP
            // so downloaded images stay compatible across viewers while preserving source quality.
            let specs: Vec<(&str, &str, String, u32, u32, u64)> = if source_format == "png" {
                vec![
                    (
                        "png",
                        "orig",
                        format!("{dims}Original PNG (Authentic Lossless)"),
                        orig_w,
                        orig_h,
                        4_500_000,
                    ),
                    (
                        "jpg",
                        "orig",
                        format!("{dims}Original JPG (Authentic)"),
                        orig_w,
                        orig_h,
                        4_000_000,
                    ),
                    (
                        "png",
                        "large",
                        "Large PNG (Lossless)".to_string(),
                        0,
                        0,
                        2_200_000,
                    ),
                    ("jpg", "large", "Large JPG".to_string(), 0, 0, 2_000_000),
                ]
            } else {
                vec![
                    (
                        "jpg",
                        "orig",
                        format!("{dims}Original JPG (Authentic)"),
                        orig_w,
                        orig_h,
                        4_500_000,
                    ),
                    (
                        "png",
                        "orig",
                        format!("{dims}Original PNG (Lossless)"),
                        orig_w,
                        orig_h,
                        4_000_000,
                    ),
                    ("jpg", "large", "Large JPG".to_string(), 0, 0, 2_000_000),
                    (
                        "png",
                        "large",
                        "Large PNG (Lossless)".to_string(),
                        0,
                        0,
                        1_800_000,
                    ),
                ]
            };

            for (idx, (fmt, size_name, label, w, h, bw)) in specs.into_iter().enumerate() {
                let url = format!("{base}?format={fmt}&name={size_name}");
                push_unique_format(
                    &mut formats,
                    VideoFormat {
                        id: format!("img-{fmt}-{size_name}-{idx}"),
                        label,
                        width: w,
                        height: h,
                        bandwidth: bw,
                        ext: fmt.to_string(),
                        requires_mux: false,
                        video_url: url,
                        audio_url: None,
                    },
                );
            }
            return formats;
        }
    }
    push_unique_format(
        &mut formats,
        VideoFormat {
            id: "img-direct".to_string(),
            label: if orig_w > 0 && orig_h > 0 {
                format!("{orig_w}x{orig_h} Image")
            } else {
                "Original Image".to_string()
            },
            width: orig_w,
            height: orig_h,
            bandwidth: (orig_w as u64) * (orig_h as u64),
            ext: "jpg".to_string(),
            requires_mux: false,
            video_url: clean,
            audio_url: None,
        },
    );
    formats
}

fn parse_media_entry(entry: &Value, index: usize, has_ffmpeg: bool) -> Option<MediaItemSpec> {
    let media_type = entry
        .get("type")
        .and_then(|v| v.as_str())
        .unwrap_or("")
        .to_ascii_lowercase();
    let thumb = entry
        .get("media_url_https")
        .or_else(|| entry.get("media_url"))
        .and_then(|v| v.as_str())
        .and_then(sanitize_media_url);
    let orig_w = entry
        .get("original_info")
        .and_then(|o| o.get("width"))
        .and_then(|v| v.as_u64())
        .unwrap_or(0) as u32;
    let orig_h = entry
        .get("original_info")
        .and_then(|o| o.get("height"))
        .and_then(|v| v.as_u64())
        .unwrap_or(0) as u32;

    if media_type == "video" || media_type == "animated_gif" || entry.get("video_info").is_some() {
        let mut mp4_formats = Vec::new();
        let mut hls_urls = Vec::new();
        if let Some(variants) = entry
            .get("video_info")
            .and_then(|vi| vi.get("variants"))
            .and_then(|v| v.as_array())
        {
            for (v_idx, var) in variants.iter().enumerate() {
                let Some(raw_url) = var.get("url").and_then(|v| v.as_str()) else {
                    continue;
                };
                let Some(url) = sanitize_media_url(raw_url) else {
                    continue;
                };
                let content_type = var
                    .get("content_type")
                    .or_else(|| var.get("type"))
                    .and_then(|v| v.as_str())
                    .unwrap_or("")
                    .to_ascii_lowercase();
                let bitrate = var.get("bitrate").and_then(|v| v.as_u64()).unwrap_or(0);
                if content_type.contains("mpegurl") || url.contains(".m3u8") {
                    hls_urls.push(url);
                    continue;
                }
                if !content_type.is_empty()
                    && !content_type.contains("mp4")
                    && !url.contains(".mp4")
                {
                    continue;
                }
                let (mut w, mut h) = parse_dimensions_from_url(&url);
                if w == 0 || h == 0 {
                    w = orig_w;
                    h = orig_h;
                }
                let label = if media_type == "animated_gif" {
                    "MP4 Loop (H.264, Best Quality)".to_string()
                } else {
                    format_resolution_label(w, h, bitrate, "")
                };
                push_unique_format(
                    &mut mp4_formats,
                    VideoFormat {
                        id: format!("mp4-{v_idx}"),
                        label,
                        width: w,
                        height: h,
                        bandwidth: if bitrate > 0 {
                            bitrate
                        } else {
                            (w as u64) * (h as u64)
                        },
                        ext: "mp4".to_string(),
                        requires_mux: false,
                        video_url: url,
                        audio_url: None,
                    },
                );
            }
        }
        mp4_formats.sort_by(|a, b| {
            let area_a = (a.width as u64) * (a.height as u64);
            let area_b = (b.width as u64) * (b.height as u64);
            area_b
                .cmp(&area_a)
                .then_with(|| b.bandwidth.cmp(&a.bandwidth))
        });
        if media_type != "animated_gif" {
            if let Some(top) = mp4_formats.first_mut() {
                if !top.label.contains("Original") {
                    top.label.push_str(" (Original)");
                }
            }
        }

        if media_type == "animated_gif" && has_ffmpeg {
            if let Some(best_mp4) = mp4_formats.first().cloned() {
                mp4_formats.insert(
                    0,
                    VideoFormat {
                        id: "gif-convert".to_string(),
                        label: "Animated GIF (.gif, Authentic Quality)".to_string(),
                        width: best_mp4.width,
                        height: best_mp4.height,
                        bandwidth: best_mp4.bandwidth,
                        ext: "gif".to_string(),
                        requires_mux: true,
                        video_url: best_mp4.video_url,
                        audio_url: None,
                    },
                );
            }
        }

        if mp4_formats.is_empty() && has_ffmpeg {
            for (h_idx, hls) in hls_urls.into_iter().enumerate() {
                push_unique_format(
                    &mut mp4_formats,
                    VideoFormat {
                        id: format!("hls-{h_idx}"),
                        label: "HLS Stream -> MP4 (FFmpeg)".to_string(),
                        width: orig_w,
                        height: orig_h,
                        bandwidth: 1,
                        ext: "mp4".to_string(),
                        requires_mux: true,
                        video_url: hls,
                        audio_url: None,
                    },
                );
            }
        }

        if !mp4_formats.is_empty() {
            return Some(MediaItemSpec {
                index,
                kind: if media_type == "animated_gif" {
                    "gif".to_string()
                } else {
                    "video".to_string()
                },
                thumbnail_url: thumb,
                formats: mp4_formats,
            });
        }
    }

    if let Some(ref img_url) = thumb {
        let formats = build_twimg_image_variants(img_url, orig_w, orig_h);
        if !formats.is_empty() {
            return Some(MediaItemSpec {
                index,
                kind: "image".to_string(),
                thumbnail_url: Some(img_url.clone()),
                formats,
            });
        }
    }
    None
}

fn parse_xnow_seed(
    root: &Value,
    tweet_hint: Option<&str>,
    has_ffmpeg: bool,
) -> Option<InspectedPost> {
    if !root
        .get("xnowSeed")
        .and_then(|v| v.as_bool())
        .unwrap_or(false)
    {
        return None;
    }
    let tweet_id = root
        .get("tweetId")
        .and_then(|v| v.as_str())
        .filter(|s| !s.is_empty())
        .or(tweet_hint)
        .unwrap_or("")
        .to_string();
    let username = root
        .get("username")
        .and_then(|v| v.as_str())
        .unwrap_or("")
        .trim()
        .to_string();
    let text = root
        .get("text")
        .and_then(|v| v.as_str())
        .unwrap_or("")
        .trim()
        .to_string();
    let created_at = root
        .get("createdAt")
        .and_then(|v| v.as_str())
        .unwrap_or("")
        .trim()
        .to_string();
    let post_url = root
        .get("postUrl")
        .and_then(|v| v.as_str())
        .filter(|s| is_safe_http_url(s))
        .map(str::to_string)
        .unwrap_or_else(|| canonical_post_url(&username, &tweet_id));

    let mut items = Vec::new();
    if let Some(arr) = root.get("items").and_then(|v| v.as_array()) {
        for (idx, item) in arr.iter().enumerate() {
            let kind = item.get("kind").and_then(|v| v.as_str()).unwrap_or("image");
            let thumb = item
                .get("thumbnailUrl")
                .and_then(|v| v.as_str())
                .and_then(sanitize_media_url);
            let urls: Vec<String> = item
                .get("urls")
                .and_then(|v| v.as_array())
                .map(|list| {
                    list.iter()
                        .filter_map(|u| u.as_str())
                        .filter_map(sanitize_media_url)
                        .collect()
                })
                .unwrap_or_default();
            let is_tweet_video_gif =
                kind == "video" && urls.iter().any(|u| u.contains("/tweet_video/"));
            let resolved_kind = if is_tweet_video_gif {
                "gif"
            } else if kind == "video" {
                "video"
            } else {
                "image"
            };
            let mut formats = Vec::new();
            if resolved_kind == "video" || resolved_kind == "gif" {
                for (f_idx, url) in urls.into_iter().enumerate() {
                    if url.contains(".m3u8") && !has_ffmpeg {
                        continue;
                    }
                    let (w, h) = parse_dimensions_from_url(&url);
                    push_unique_format(
                        &mut formats,
                        VideoFormat {
                            id: format!("seed-vid-{f_idx}"),
                            label: if resolved_kind == "gif" {
                                "MP4 Loop (H.264, Best Quality)".to_string()
                            } else if url.contains(".m3u8") {
                                "HLS Stream -> MP4 (FFmpeg)".to_string()
                            } else {
                                format_resolution_label(w, h, 0, "")
                            },
                            width: w,
                            height: h,
                            bandwidth: (w as u64) * (h as u64),
                            ext: "mp4".to_string(),
                            requires_mux: url.contains(".m3u8"),
                            video_url: url,
                            audio_url: None,
                        },
                    );
                }
                formats.sort_by(|a, b| {
                    let area_a = (a.width as u64) * (a.height as u64);
                    let area_b = (b.width as u64) * (b.height as u64);
                    area_b
                        .cmp(&area_a)
                        .then_with(|| b.bandwidth.cmp(&a.bandwidth))
                });
                if resolved_kind == "gif" && has_ffmpeg {
                    if let Some(best_mp4) = formats.first().cloned() {
                        formats.insert(
                            0,
                            VideoFormat {
                                id: "gif-convert".to_string(),
                                label: "Animated GIF (.gif, Authentic Quality)".to_string(),
                                width: best_mp4.width,
                                height: best_mp4.height,
                                bandwidth: best_mp4.bandwidth,
                                ext: "gif".to_string(),
                                requires_mux: true,
                                video_url: best_mp4.video_url,
                                audio_url: None,
                            },
                        );
                    }
                }
            } else if let Some(first) = urls.first() {
                formats = build_twimg_image_variants(first, 0, 0);
            }
            if !formats.is_empty() {
                items.push(MediaItemSpec {
                    index: idx,
                    kind: resolved_kind.to_string(),
                    thumbnail_url: thumb.or_else(|| {
                        (resolved_kind == "image").then(|| formats[0].video_url.clone())
                    }),
                    formats,
                });
            }
        }
    }

    if items.is_empty() {
        return None;
    }

    Some(InspectedPost {
        tweet_id,
        username,
        display_name: String::new(),
        post_url,
        created_at,
        text,
        ffmpeg_available: has_ffmpeg,
        items,
    })
}

fn canonical_post_url(username: &str, tweet_id: &str) -> String {
    if !tweet_id.is_empty() {
        if !username.is_empty() {
            format!("https://x.com/{username}/status/{tweet_id}")
        } else {
            format!("https://x.com/i/status/{tweet_id}")
        }
    } else {
        "https://x.com/".to_string()
    }
}

fn node_is_x_tweet(val: &Value) -> bool {
    let Some(obj) = val.as_object() else {
        return false;
    };
    let legacy = obj.get("legacy").and_then(|v| v.as_object());
    let has_id = obj.get("rest_id").and_then(|v| v.as_str()).is_some()
        || obj.get("id_str").and_then(|v| v.as_str()).is_some()
        || legacy
            .and_then(|l| l.get("id_str"))
            .and_then(|v| v.as_str())
            .is_some();
    if !has_id {
        return false;
    }
    obj.get("mediaDetails").and_then(|v| v.as_array()).is_some()
        || legacy
            .and_then(|l| l.get("extended_entities"))
            .and_then(|e| e.get("media"))
            .and_then(|m| m.as_array())
            .is_some()
        || obj
            .get("extended_entities")
            .and_then(|e| e.get("media"))
            .and_then(|m| m.as_array())
            .is_some()
        || legacy
            .and_then(|l| l.get("entities"))
            .and_then(|e| e.get("media"))
            .and_then(|m| m.as_array())
            .is_some()
        || obj
            .get("entities")
            .and_then(|e| e.get("media"))
            .and_then(|m| m.as_array())
            .is_some()
}

fn build_post_from_tweet_node(
    node: &Value,
    tweet_hint: Option<&str>,
    has_ffmpeg: bool,
) -> Option<InspectedPost> {
    let legacy = node.get("legacy").unwrap_or(node);
    let tweet_id = node
        .get("rest_id")
        .or_else(|| legacy.get("id_str"))
        .or_else(|| node.get("id_str"))
        .and_then(|v| v.as_str())
        .map(str::to_string)
        .or_else(|| tweet_hint.map(str::to_string))
        .unwrap_or_default();

    let media_arr = node
        .get("mediaDetails")
        .and_then(|v| v.as_array())
        .or_else(|| {
            legacy
                .get("extended_entities")
                .and_then(|e| e.get("media"))
                .and_then(|m| m.as_array())
        })
        .or_else(|| {
            node.get("extended_entities")
                .and_then(|e| e.get("media"))
                .and_then(|m| m.as_array())
        })
        .or_else(|| {
            legacy
                .get("entities")
                .and_then(|e| e.get("media"))
                .and_then(|m| m.as_array())
        })
        .or_else(|| {
            node.get("entities")
                .and_then(|e| e.get("media"))
                .and_then(|m| m.as_array())
        })?;

    let mut items = Vec::new();
    for entry in media_arr {
        if let Some(spec) = parse_media_entry(entry, items.len(), has_ffmpeg) {
            items.push(spec);
        }
    }
    if items.is_empty() {
        return None;
    }

    let user_result = node
        .get("core")
        .and_then(|c| c.get("user_results"))
        .and_then(|r| r.get("result"));
    let user_legacy = user_result.and_then(|u| u.get("legacy"));
    let user_core = user_result.and_then(|u| u.get("core"));

    let username = node
        .get("user")
        .and_then(|u| u.get("screen_name"))
        .or_else(|| user_legacy.and_then(|u| u.get("screen_name")))
        .or_else(|| user_core.and_then(|u| u.get("screen_name")))
        .and_then(|v| v.as_str())
        .unwrap_or("")
        .trim()
        .to_string();

    let display_name = node
        .get("user")
        .and_then(|u| u.get("name"))
        .or_else(|| user_legacy.and_then(|u| u.get("name")))
        .or_else(|| user_core.and_then(|u| u.get("name")))
        .and_then(|v| v.as_str())
        .unwrap_or("")
        .trim()
        .to_string();

    let text = node
        .get("note_tweet")
        .and_then(|n| n.get("note_tweet_results"))
        .and_then(|r| r.get("result"))
        .and_then(|r| r.get("text"))
        .or_else(|| legacy.get("full_text"))
        .or_else(|| node.get("text"))
        .and_then(|v| v.as_str())
        .unwrap_or("")
        .trim()
        .to_string();

    let created_at = legacy
        .get("created_at")
        .or_else(|| node.get("created_at"))
        .and_then(|v| v.as_str())
        .unwrap_or("")
        .trim()
        .to_string();

    let post_url = canonical_post_url(&username, &tweet_id);

    Some(InspectedPost {
        tweet_id,
        username,
        display_name,
        post_url,
        created_at,
        text,
        ffmpeg_available: has_ffmpeg,
        items,
    })
}

fn scan_value_for_tweet(
    root: &Value,
    tweet_hint: Option<&str>,
    has_ffmpeg: bool,
) -> Option<InspectedPost> {
    if let Some(seed) = parse_xnow_seed(root, tweet_hint, has_ffmpeg) {
        return Some(seed);
    }
    let mut stack = vec![(root, 0usize)];
    let mut visited = 0usize;
    let mut fallback: Option<InspectedPost> = None;

    while let Some((val, depth)) = stack.pop() {
        if visited >= 16_000 || depth > 24 {
            continue;
        }
        visited += 1;
        if node_is_x_tweet(val) {
            if let Some(post) = build_post_from_tweet_node(val, tweet_hint, has_ffmpeg) {
                if tweet_hint
                    .map(|hint| !hint.is_empty() && post.tweet_id == hint)
                    .unwrap_or(false)
                {
                    return Some(post);
                }
                if fallback.is_none() {
                    fallback = Some(post);
                }
            }
        }
        match val {
            Value::Array(arr) => {
                for item in arr.iter().rev() {
                    if item.is_object() || item.is_array() {
                        stack.push((item, depth + 1));
                    }
                }
            }
            Value::Object(map) => {
                for child in map.values() {
                    if child.is_object() || child.is_array() {
                        stack.push((child, depth + 1));
                    }
                }
            }
            _ => {}
        }
    }
    fallback
}

pub fn extract_post_from_json_text(
    raw: &str,
    tweet_hint: Option<&str>,
    has_ffmpeg: bool,
) -> Option<InspectedPost> {
    let cleaned = raw.trim();
    if cleaned.is_empty() || cleaned.len() > 8 * 1024 * 1024 {
        return None;
    }
    if let Ok(parsed) = serde_json::from_str::<Value>(cleaned) {
        if let Some(post) = scan_value_for_tweet(&parsed, tweet_hint, has_ffmpeg) {
            return Some(post);
        }
    }
    None
}

fn read_xml_attr(tag: &str, name: &str) -> Option<String> {
    let lower_tag = tag.to_ascii_lowercase();
    let needle = format!("{}=", name.to_ascii_lowercase());
    let mut offset = 0;
    while let Some(pos) = lower_tag[offset..].find(&needle) {
        let abs = offset + pos;
        let prev_ok = abs == 0
            || lower_tag.as_bytes()[abs - 1].is_ascii_whitespace()
            || lower_tag.as_bytes()[abs - 1] == b'<';
        let after = &tag[abs + needle.len()..];
        offset = abs + needle.len();
        if !prev_ok {
            continue;
        }
        let quote = after.chars().next()?;
        if quote != '"' && quote != '\'' {
            continue;
        }
        let value = &after[quote.len_utf8()..];
        if let Some(end) = value.find(quote) {
            return Some(unescape_url(&value[..end]));
        }
    }
    None
}

fn find_meta_content(html: &str, attr_name: &str, attr_value: &str) -> Option<String> {
    let lower = html.to_ascii_lowercase();
    let target = attr_value.to_ascii_lowercase();
    let mut pos = 0;
    while let Some(idx) = lower[pos..].find("<meta") {
        let abs = pos + idx;
        let Some(gt_rel) = lower[abs..].find('>') else {
            break;
        };
        let tag = &html[abs..abs + gt_rel + 1];
        pos = abs + gt_rel + 1;
        let matches = read_xml_attr(tag, attr_name)
            .map(|v| v.eq_ignore_ascii_case(&target))
            .unwrap_or(false);
        if matches {
            if let Some(content) = read_xml_attr(tag, "content") {
                return Some(unescape_url(&content));
            }
        }
    }
    None
}

pub fn extract_post_from_html(
    html: &str,
    tweet_hint: Option<&str>,
    username_hint: Option<&str>,
    has_ffmpeg: bool,
) -> Option<InspectedPost> {
    let video_url = find_meta_content(html, "property", "og:video:secure_url")
        .or_else(|| find_meta_content(html, "property", "og:video:url"))
        .or_else(|| find_meta_content(html, "property", "og:video"))
        .or_else(|| find_meta_content(html, "name", "twitter:player:stream"))
        .and_then(|u| sanitize_media_url(&u));
    let image_url = find_meta_content(html, "property", "og:image")
        .or_else(|| find_meta_content(html, "name", "twitter:image"))
        .and_then(|u| sanitize_media_url(&u));
    let text = find_meta_content(html, "property", "og:description")
        .or_else(|| find_meta_content(html, "name", "description"))
        .unwrap_or_default()
        .trim()
        .to_string();

    let mut items = Vec::new();
    if let Some(url) = video_url.filter(|u| !u.contains(".m3u8") || has_ffmpeg) {
        let (w, h) = parse_dimensions_from_url(&url);
        let is_hls = url.contains(".m3u8");
        items.push(MediaItemSpec {
            index: 0,
            kind: "video".to_string(),
            thumbnail_url: image_url,
            formats: vec![VideoFormat {
                id: "og-video".to_string(),
                label: if is_hls {
                    "HLS Stream -> MP4 (FFmpeg)".to_string()
                } else {
                    format_resolution_label(w, h, 0, "")
                },
                width: w,
                height: h,
                bandwidth: 0,
                ext: "mp4".to_string(),
                requires_mux: is_hls,
                video_url: url,
                audio_url: None,
            }],
        });
    } else if let Some(url) = image_url {
        let formats = build_twimg_image_variants(&url, 0, 0);
        if !formats.is_empty() {
            items.push(MediaItemSpec {
                index: 0,
                kind: "image".to_string(),
                thumbnail_url: Some(url),
                formats,
            });
        }
    }

    if items.is_empty() {
        return None;
    }

    let tweet_id = tweet_hint.unwrap_or("").to_string();
    let username = username_hint.unwrap_or("").to_string();
    let post_url = canonical_post_url(&username, &tweet_id);

    Some(InspectedPost {
        tweet_id,
        username,
        display_name: String::new(),
        post_url,
        created_at: String::new(),
        text,
        ffmpeg_available: has_ffmpeg,
        items,
    })
}

fn find_ffmpeg_in_paths_and_candidates(
    path_var: Option<&OsStr>,
    candidates: &[PathBuf],
) -> Option<PathBuf> {
    let names = if cfg!(windows) {
        &["ffmpeg.exe", "ffmpeg"][..]
    } else {
        &["ffmpeg"][..]
    };
    if let Some(paths) = path_var {
        for dir in env::split_paths(paths) {
            for name in names {
                let candidate = dir.join(name);
                if candidate.is_file() {
                    return Some(candidate);
                }
            }
        }
    }
    candidates.iter().find(|c| c.is_file()).cloned()
}

pub fn find_ffmpeg_binary() -> Option<PathBuf> {
    #[cfg(windows)]
    let extra = {
        let mut list = vec![PathBuf::from(r"C:\ProgramData\chocolatey\bin\ffmpeg.exe")];
        if let Ok(local_app) = env::var("LOCALAPPDATA") {
            list.push(PathBuf::from(local_app).join(r"Microsoft\WinGet\Links\ffmpeg.exe"));
        }
        if let Ok(profile) = env::var("USERPROFILE") {
            list.push(PathBuf::from(profile).join(r"scoop\shims\ffmpeg.exe"));
        }
        list
    };
    #[cfg(not(windows))]
    let extra = vec![
        PathBuf::from("/opt/homebrew/bin/ffmpeg"),
        PathBuf::from("/usr/local/bin/ffmpeg"),
        PathBuf::from("/opt/local/bin/ffmpeg"),
        PathBuf::from("/usr/bin/ffmpeg"),
    ];
    find_ffmpeg_in_paths_and_candidates(env::var_os("PATH").as_deref(), &extra)
}

pub fn unique_temp_media_path(tag: &str, ext: &str) -> PathBuf {
    let ts = SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .map(|d| d.as_nanos())
        .unwrap_or(0);
    let seq = TEMP_SEQ.fetch_add(1, Ordering::Relaxed);
    env::temp_dir().join(format!("xnow-{tag}-{ts}-{seq}.{ext}"))
}

pub fn extract_audio_aac_m4a_ffmpeg(
    ffmpeg: &Path,
    input_path: &Path,
    out_path: &Path,
) -> Result<(), String> {
    let mut cmd = Command::new(ffmpeg);
    apply_no_window(&mut cmd);
    let output = cmd
        .args(["-y", "-fflags", "+genpts", "-i"])
        .arg(input_path)
        .args([
            "-vn",
            "-sn",
            "-dn",
            "-map",
            "0:a:0",
            "-c:a",
            "aac",
            "-b:a",
            "192k",
            "-ac",
            "2",
            "-ar",
            "44100",
            "-movflags",
            "+faststart",
        ])
        .arg(out_path)
        .output()
        .map_err(|e| format!("Failed to start ffmpeg: {e}"))?;
    if !output.status.success() {
        let _ = fs::remove_file(out_path);
        let stderr = String::from_utf8_lossy(&output.stderr);
        let tail: String = stderr.lines().rev().take(4).collect::<Vec<_>>().join(" | ");
        return Err(format!(
            "ffmpeg audio extraction exited with status {}: {tail}",
            output.status
        ));
    }
    let meta = fs::metadata(out_path).map_err(|e| e.to_string())?;
    if meta.len() == 0 {
        let _ = fs::remove_file(out_path);
        return Err("ffmpeg audio extraction produced an empty file.".to_string());
    }
    Ok(())
}

pub fn convert_image_ffmpeg(
    ffmpeg: &Path,
    input_path: &Path,
    out_path: &Path,
    target_ext: &str,
) -> Result<(), String> {
    let mut cmd = Command::new(ffmpeg);
    apply_no_window(&mut cmd);
    cmd.args(["-y", "-i"])
        .arg(input_path)
        .args(["-frames:v", "1"]);
    if target_ext.eq_ignore_ascii_case("jpg") || target_ext.eq_ignore_ascii_case("jpeg") {
        cmd.args(["-q:v", "1"]);
    } else if target_ext.eq_ignore_ascii_case("png") {
        cmd.args(["-compression_level", "6"]);
    }
    let output = cmd
        .arg(out_path)
        .output()
        .map_err(|e| format!("Failed to start ffmpeg: {e}"))?;
    if !output.status.success() {
        let _ = fs::remove_file(out_path);
        return Err(format!("ffmpeg image conversion exited {}", output.status));
    }
    let meta = fs::metadata(out_path).map_err(|e| e.to_string())?;
    if meta.len() == 0 {
        let _ = fs::remove_file(out_path);
        return Err("ffmpeg image conversion produced an empty file.".to_string());
    }
    Ok(())
}

pub fn convert_mp4_to_gif_ffmpeg(
    ffmpeg: &Path,
    input_mp4: &Path,
    out_gif: &Path,
) -> Result<(), String> {
    let mut cmd = Command::new(ffmpeg);
    apply_no_window(&mut cmd);
    // Preserve native resolution and source frame timing with a full 256-color palette.
    let output = cmd
        .args(["-y", "-i"])
        .arg(input_mp4)
        .args([
            "-vf",
            "split[s0][s1];[s0]palettegen=max_colors=256:stats_mode=diff[p];[s1][p]paletteuse=dither=floyd_steinberg",
            "-loop",
            "0",
        ])
        .arg(out_gif)
        .output()
        .map_err(|e| format!("Failed to start ffmpeg: {e}"))?;
    if !output.status.success() {
        let _ = fs::remove_file(out_gif);
        return Err(format!("ffmpeg GIF conversion exited {}", output.status));
    }
    let meta = fs::metadata(out_gif).map_err(|e| e.to_string())?;
    if meta.len() == 0 {
        let _ = fs::remove_file(out_gif);
        return Err("ffmpeg GIF conversion produced an empty file.".to_string());
    }
    Ok(())
}

pub fn download_hls_to_mp4_ffmpeg(
    ffmpeg: &Path,
    hls_url: &str,
    out_mp4: &Path,
) -> Result<(), String> {
    if !is_safe_http_url(hls_url) || !is_x_media_url(hls_url) {
        return Err("Invalid X HLS stream URL.".to_string());
    }
    let mut cmd = Command::new(ffmpeg);
    apply_no_window(&mut cmd);
    let output = cmd
        .args([
            "-y",
            "-user_agent",
            DEFAULT_UA,
            "-referer",
            "https://x.com/",
            "-i",
            hls_url,
            "-c",
            "copy",
            "-bsf:a",
            "aac_adtstoasc",
            "-movflags",
            "+faststart",
        ])
        .arg(out_mp4)
        .output()
        .map_err(|e| format!("Failed to start ffmpeg: {e}"))?;
    if !output.status.success() {
        let _ = fs::remove_file(out_mp4);
        return Err(format!("ffmpeg HLS download exited {}", output.status));
    }
    let meta = fs::metadata(out_mp4).map_err(|e| e.to_string())?;
    if meta.len() == 0 {
        let _ = fs::remove_file(out_mp4);
        return Err("ffmpeg HLS download produced an empty file.".to_string());
    }
    Ok(())
}

fn parse_created_date_digits(created_at: &str) -> Option<String> {
    let trimmed = created_at.trim();
    if trimmed.is_empty() {
        return None;
    }
    // ISO 8601: YYYY-MM-DD...
    let digits: String = trimmed
        .chars()
        .take(10)
        .filter(|c| c.is_ascii_digit())
        .collect();
    if digits.len() == 8 {
        return Some(digits);
    }
    // Twitter legacy RFC 2822: "Wed Oct 10 20:19:24 +0000 2018"
    let parts: Vec<&str> = trimmed.split_whitespace().collect();
    if parts.len() == 6 {
        let month = match parts[1] {
            "Jan" => "01",
            "Feb" => "02",
            "Mar" => "03",
            "Apr" => "04",
            "May" => "05",
            "Jun" => "06",
            "Jul" => "07",
            "Aug" => "08",
            "Sep" => "09",
            "Oct" => "10",
            "Nov" => "11",
            "Dec" => "12",
            _ => return None,
        };
        let day: u32 = parts[2].parse().ok()?;
        let year: u32 = parts[5].parse().ok()?;
        return Some(format!("{year:04}{month}{day:02}"));
    }
    None
}

fn format_unix_yyyymmdd_utc(secs: u64) -> String {
    let days = (secs / 86_400) as i64;
    let z = days + 719_468;
    let era = if z >= 0 { z } else { z - 146_096 } / 146_097;
    let doe = z - era * 146_097;
    let yoe = (doe - doe / 1_460 + doe / 36_524 - doe / 146_096) / 365;
    let y = yoe + era * 400;
    let doy = doe - (365 * yoe + yoe / 4 - yoe / 100);
    let mp = (5 * doy + 2) / 153;
    let d = doy - (153 * mp + 2) / 5 + 1;
    let m = mp + if mp < 10 { 3 } else { -9 };
    let year = y + if m <= 2 { 1 } else { 0 };
    format!("{year:04}{m:02}{d:02}")
}

pub fn build_source_filename_stem(username: &str, created_at: &str, tweet_id: &str) -> String {
    let cleaned_user: String = username
        .trim()
        .chars()
        .map(|c| {
            if c.is_ascii_alphanumeric() || matches!(c, '_' | '.') {
                c
            } else {
                '_'
            }
        })
        .collect();
    let user_part = cleaned_user.trim_matches(|c| c == '.' || c == '_');
    let user = if user_part.is_empty() {
        "x_post"
    } else {
        user_part
    };
    let mut user_capped: String = user.chars().take(36).collect();
    if is_windows_reserved_stem(&user_capped) {
        user_capped = format!("_{user_capped}");
    }

    let date_part = parse_created_date_digits(created_at).unwrap_or_else(|| {
        let now_secs = SystemTime::now()
            .duration_since(UNIX_EPOCH)
            .map(|d| d.as_secs())
            .unwrap_or(0);
        format_unix_yyyymmdd_utc(now_secs)
    });

    let id_part: String = tweet_id
        .chars()
        .filter(|c| c.is_ascii_digit())
        .take(22)
        .collect();
    if id_part.is_empty() {
        let seq = TEMP_SEQ.fetch_add(1, Ordering::Relaxed);
        format!("{user_capped}-{date_part}-{seq}")
    } else {
        format!("{user_capped}-{date_part}-{id_part}")
    }
}

pub fn format_post_document(post: &InspectedPost) -> String {
    let mut lines = Vec::new();
    if !post.username.trim().is_empty() {
        if post.display_name.trim().is_empty() {
            lines.push(format!("Author: @{}", post.username.trim()));
        } else {
            lines.push(format!(
                "Author: {} (@{})",
                post.display_name.trim(),
                post.username.trim()
            ));
        }
    }
    if !post.post_url.trim().is_empty() {
        lines.push(format!("URL: {}", post.post_url.trim()));
    }
    if !post.created_at.trim().is_empty() {
        lines.push(format!("Date: {}", post.created_at.trim()));
    }
    if !lines.is_empty() {
        lines.push(String::new());
    }
    let body = post.text.trim();
    lines.push(if body.is_empty() {
        "(No post text available)".to_string()
    } else {
        body.to_string()
    });
    lines.join("\n")
}

pub fn build_metadata_json(post: &InspectedPost) -> Result<String, String> {
    let payload = serde_json::json!({
        "tweetId": post.tweet_id,
        "username": post.username,
        "displayName": post.display_name,
        "postUrl": post.post_url,
        "createdAt": post.created_at,
        "text": post.text,
        "mediaCount": post.items.len(),
    });
    serde_json::to_string_pretty(&payload).map_err(|e| e.to_string())
}

pub fn cookie_header_and_ct0_from_pairs(
    pairs: &[(String, String)],
) -> (Option<String>, Option<String>) {
    let mut seen = HashSet::new();
    let mut cookie_parts = Vec::new();
    let mut ct0 = None;
    for (k, v) in pairs {
        let name: String = k
            .chars()
            .filter(|c| !matches!(c, '\r' | '\n' | '\0'))
            .collect();
        let val: String = v
            .chars()
            .filter(|c| !matches!(c, '\r' | '\n' | '\0'))
            .collect();
        if name.is_empty() || val.is_empty() || !seen.insert(name.clone()) {
            continue;
        }
        if name == "ct0" {
            ct0 = Some(val.clone());
        }
        cookie_parts.push(format!("{name}={val}"));
    }
    let header = (!cookie_parts.is_empty()).then(|| cookie_parts.join("; "));
    (header, ct0)
}

fn escape_curl_config_header(header_name: &str, value: &str) -> Option<String> {
    let clean: String = value
        .chars()
        .filter(|&c| c != '\r' && c != '\n' && c != '\0')
        .collect();
    let trimmed = clean.trim();
    if trimmed.is_empty() {
        return None;
    }
    let escaped = trimmed.replace('\\', "\\\\").replace('"', "\\\"");
    Some(format!("header = \"{header_name}: {escaped}\"\n"))
}

pub fn build_curl_stdin_headers(cookie_header: Option<&str>, ct0_token: Option<&str>) -> Vec<u8> {
    let mut buf = String::new();
    if let Some(cookie) = cookie_header {
        if let Some(line) = escape_curl_config_header("Cookie", cookie) {
            buf.push_str(&line);
        }
    }
    if let Some(ct0) = ct0_token {
        if let Some(line) = escape_curl_config_header("X-Csrf-Token", ct0) {
            buf.push_str(&line);
        }
    }
    buf.into_bytes()
}

pub fn run_curl_with_auth_stdin(
    cmd: &mut Command,
    url: &str,
    cookie_header: Option<&str>,
    ct0_token: Option<&str>,
) -> std::io::Result<Output> {
    let send_auth = is_x_app_host(url);
    let config_bytes = if send_auth {
        build_curl_stdin_headers(cookie_header, ct0_token)
    } else {
        Vec::new()
    };
    if !config_bytes.is_empty() {
        cmd.args(["--config", "-"])
            .stdin(Stdio::piped())
            .stdout(Stdio::piped())
            .stderr(Stdio::piped());
        let mut child = cmd.spawn()?;
        if let Some(mut stdin) = child.stdin.take() {
            let _ = stdin.write_all(&config_bytes);
        }
        return child.wait_with_output();
    }
    cmd.output()
}

pub fn curl_download_file(
    url: &str,
    referer: &str,
    cookie_header: Option<&str>,
    target_path: &Path,
) -> Result<u64, String> {
    if !is_safe_http_url(url) || !is_x_media_url(url) {
        return Err("X did not provide a valid media URL.".to_string());
    }
    let curl = system_curl_bin();
    let mut cmd = Command::new(&curl);
    apply_no_window(&mut cmd);
    cmd.args([
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
        DEFAULT_UA,
        "--referer",
    ])
    .arg(referer)
    .args(["--header", "Accept: */*", "--output"])
    .arg(target_path)
    .arg(url);
    let output = run_curl_with_auth_stdin(&mut cmd, url, cookie_header, None)
        .map_err(|error| format!("Unable to start {curl}: {error}"))?;
    if !output.status.success() {
        let _ = fs::remove_file(target_path);
        let stderr = String::from_utf8_lossy(&output.stderr);
        return Err(format!(
            "{curl} exited with status {}: {}",
            output.status,
            stderr.trim()
        ));
    }
    let metadata = fs::metadata(target_path).map_err(|error| error.to_string())?;
    if metadata.len() == 0 {
        let _ = fs::remove_file(target_path);
        return Err("The downloaded media file was empty.".to_string());
    }
    Ok(metadata.len())
}

pub fn run_curl_text(
    url: &str,
    cookie_header: Option<&str>,
    ct0_token: Option<&str>,
) -> Result<String, String> {
    if !is_safe_http_url(url) || !is_x_media_url(url) {
        return Err("Invalid X URL.".to_string());
    }
    let curl = system_curl_bin();
    let mut cmd = Command::new(&curl);
    apply_no_window(&mut cmd);
    cmd.args([
        "--fail",
        "--location",
        "--silent",
        "--show-error",
        "--connect-timeout",
        "15",
        "--max-time",
        "25",
        "--user-agent",
        DEFAULT_UA,
        "--referer",
        "https://x.com/",
        url,
    ]);
    let output = run_curl_with_auth_stdin(&mut cmd, url, cookie_header, ct0_token)
        .map_err(|e| format!("Failed to invoke {curl}: {e}"))?;
    if !output.status.success() {
        let stderr = String::from_utf8_lossy(&output.stderr);
        return Err(format!("HTTP error ({url}): {}", stderr.trim()));
    }
    Ok(String::from_utf8_lossy(&output.stdout).into_owned())
}

pub fn inspect_via_http_cascade(
    url_or_id: &str,
    cookie_header: Option<&str>,
    ct0_token: Option<&str>,
) -> Result<InspectedPost, String> {
    let tweet_id = tweet_id_from_url(url_or_id).ok_or_else(|| {
        "Enter a valid X post URL (x.com/user/status/...) or post ID.".to_string()
    })?;
    let user_hint = username_from_url(url_or_id);
    let has_ffmpeg = find_ffmpeg_binary().is_some();

    let token = syndication_token(&tweet_id);
    let syndication_url =
        format!("https://cdn.syndication.twimg.com/tweet-result?id={tweet_id}&token={token}");
    if let Ok(body) = run_curl_text(&syndication_url, None, None) {
        if let Some(post) = extract_post_from_json_text(&body, Some(&tweet_id), has_ffmpeg) {
            return Ok(post);
        }
    }

    let page_url = if is_safe_http_url(url_or_id) && is_x_app_host(url_or_id) {
        url_or_id.trim().to_string()
    } else {
        format!("https://x.com/i/status/{tweet_id}")
    };
    if let Ok(html) = run_curl_text(&page_url, cookie_header, ct0_token) {
        if let Some(post) =
            extract_post_from_html(&html, Some(&tweet_id), user_hint.as_deref(), has_ffmpeg)
        {
            return Ok(post);
        }
    }

    Err("X did not return playable media from public endpoints.".to_string())
}

pub fn pick_richer_inspected_post(
    http_post: InspectedPost,
    mut seed_post: InspectedPost,
) -> InspectedPost {
    let same_id = http_post.tweet_id.is_empty()
        || seed_post.tweet_id.is_empty()
        || http_post.tweet_id == seed_post.tweet_id;
    let seed_has_formats = seed_post.items.iter().any(|item| !item.formats.is_empty());
    if !same_id || !seed_has_formats {
        return http_post;
    }
    let http_formats: usize = http_post.items.iter().map(|i| i.formats.len()).sum();
    let seed_formats: usize = seed_post.items.iter().map(|i| i.formats.len()).sum();
    if seed_post.items.len() > http_post.items.len()
        || (http_post.username.is_empty() && !seed_post.username.is_empty())
        || (seed_post.items.len() == http_post.items.len() && seed_formats > http_formats)
    {
        if seed_post.username.is_empty() && !http_post.username.is_empty() {
            seed_post.username = http_post.username;
        }
        if seed_post.display_name.is_empty() && !http_post.display_name.is_empty() {
            seed_post.display_name = http_post.display_name;
        }
        if seed_post.text.is_empty() && !http_post.text.is_empty() {
            seed_post.text = http_post.text;
        }
        if seed_post.created_at.is_empty() && !http_post.created_at.is_empty() {
            seed_post.created_at = http_post.created_at;
        }
        return seed_post;
    }
    http_post
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn parses_x_and_twitter_status_urls_and_rejects_foreign_hosts() {
        assert_eq!(
            tweet_id_from_url("https://x.com/eliza_huang/status/1899999999999999999/photo/1?s=20"),
            Some("1899999999999999999".to_string())
        );
        assert_eq!(
            tweet_id_from_url("https://twitter.com/jack/status/20"),
            Some("20".to_string())
        );
        assert_eq!(
            tweet_id_from_url("https://fxtwitter.com/user/status/1234567890123"),
            Some("1234567890123".to_string())
        );
        assert_eq!(
            tweet_id_from_url("https://evil.example/user/status/1234567890123"),
            None
        );
        assert_eq!(
            tweet_id_from_url("1899999999999999999"),
            Some("1899999999999999999".to_string())
        );
    }

    #[test]
    fn syndication_json_extracts_multi_photo_and_video_variants() {
        let json = r#"{
          "id_str": "189000111222333444",
          "text": "Testing multi-media post",
          "created_at": "2026-11-20T10:30:00.000Z",
          "user": { "screen_name": "benedictusrey", "name": "Benedictus RH" },
          "mediaDetails": [
            {
              "type": "video",
              "media_url_https": "https://pbs.twimg.com/ext_tw_video_thumb/9911/pu/img/thumb.jpg",
              "original_info": { "width": 1280, "height": 720 },
              "video_info": {
                "variants": [
                  { "content_type": "application/x-mpegURL", "url": "https://video.twimg.com/ext_tw_video/9911/pl/stream.m3u8" },
                  { "bitrate": 832000, "content_type": "video/mp4", "url": "https://video.twimg.com/ext_tw_video/9911/pu/vid/avc1/640x360/low.mp4" },
                  { "bitrate": 2176000, "content_type": "video/mp4", "url": "https://video.twimg.com/ext_tw_video/9911/pu/vid/avc1/1280x720/hd.mp4" }
                ]
              }
            },
            {
              "type": "photo",
              "media_url_https": "https://pbs.twimg.com/media/AbCdEfG?format=png&name=small",
              "original_info": { "width": 1600, "height": 900 }
            }
          ]
        }"#;

        let post =
            extract_post_from_json_text(json, Some("189000111222333444"), false).expect("parsed");
        assert_eq!(post.username, "benedictusrey");
        assert_eq!(post.display_name, "Benedictus RH");
        assert_eq!(post.items.len(), 2);
        assert_eq!(post.items[0].kind, "video");
        assert_eq!(post.items[0].formats.len(), 2);
        assert_eq!(post.items[0].formats[0].width, 1280);
        assert!(post.items[0].formats[0].video_url.contains("hd.mp4"));
        assert_eq!(post.items[1].kind, "image");
        assert_eq!(post.items[1].formats[0].ext, "png");
        assert!(post.items[1].formats[0].video_url.contains("name=orig"));
    }

    #[test]
    fn graphql_tweet_node_extracts_note_tweet_and_animated_gif() {
        let json = r#"{
          "data": {
            "tweetResult": {
              "result": {
                "rest_id": "555666777888",
                "core": {
                  "user_results": {
                    "result": {
                      "legacy": { "screen_name": "x_creator", "name": "Creator" }
                    }
                  }
                },
                "note_tweet": {
                  "note_tweet_results": {
                    "result": { "text": "Long form post body text" }
                  }
                },
                "legacy": {
                  "id_str": "555666777888",
                  "created_at": "Wed Oct 10 20:19:24 +0000 2018",
                  "full_text": "Truncated...",
                  "extended_entities": {
                    "media": [{
                      "type": "animated_gif",
                      "media_url_https": "https://pbs.twimg.com/tweet_video_thumb/XYZ.jpg",
                      "video_info": {
                        "variants": [{
                          "bitrate": 0,
                          "content_type": "video/mp4",
                          "url": "https://video.twimg.com/tweet_video/XYZ.mp4"
                        }]
                      }
                    }]
                  }
                }
              }
            }
          }
        }"#;

        let post = extract_post_from_json_text(json, Some("555666777888"), true).expect("parsed");
        assert_eq!(post.username, "x_creator");
        assert_eq!(post.text, "Long form post body text");
        assert_eq!(post.items[0].kind, "gif");
        assert_eq!(post.items[0].formats.len(), 2);
        assert_eq!(post.items[0].formats[0].ext, "gif");
        assert_eq!(post.items[0].formats[1].ext, "mp4");
        assert_eq!(
            build_source_filename_stem(&post.username, &post.created_at, &post.tweet_id),
            "x_creator-20181010-555666777888"
        );
    }

    #[test]
    fn rejects_non_x_media_urls_and_escapes_curl_headers() {
        let evil_json = r#"{"id_str":"12345","mediaDetails":[{"type":"photo","media_url_https":"https://evil.example/a.jpg"}]}"#;
        assert!(extract_post_from_json_text(evil_json, Some("12345"), false).is_none());

        assert!(is_x_app_host("https://x.com/home"));
        assert!(!is_x_app_host("https://video.twimg.com/v.mp4"));
        assert!(!is_x_app_host("https://evilx.com/home"));

        let raw = build_curl_stdin_headers(Some("auth_token=\"a\\b\"\r\nurl=evil"), Some("tok\n"));
        let text = String::from_utf8(raw).expect("utf8");
        assert!(text.contains("header = \"Cookie: auth_token=\\\"a\\\\b\\\"url=evil\""));
        assert!(text.contains("header = \"X-Csrf-Token: tok\""));
        assert_eq!(text.lines().count(), 2);
    }

    #[test]
    fn html_fallback_parses_og_video_and_probe_resolves_once() {
        let html = r#"<html><head>
          <meta property="og:video" content="https://video.twimg.com/ext_tw_video/42/pu/vid/720x1280/clip.mp4?tag=12" />
          <meta property="og:image" content="https://pbs.twimg.com/ext_tw_video_thumb/42/pu/img/thumb.jpg" />
          <meta property="og:description" content="Sample post text" />
        </head></html>"#;
        let post =
            extract_post_from_html(html, Some("424242"), Some("alice"), false).expect("html");
        assert_eq!(post.username, "alice");
        assert_eq!(post.items[0].kind, "video");
        assert_eq!(post.items[0].formats[0].width, 720);

        let state = DownloaderProbeState::default();
        let (tx, mut rx) = oneshot::channel();
        state.register_probe("req-1".to_string(), tx);
        assert!(!state.resolve_probe("wrong", "no".to_string()));
        assert!(state.resolve_probe("req-1", "{\"ok\":true}".to_string()));
        assert!(!state.resolve_probe("req-1", "dup".to_string()));
        assert_eq!(rx.try_recv().ok().as_deref(), Some("{\"ok\":true}"));
    }

    #[test]
    fn webp_source_prefers_compatible_jpg_first_and_sanitizes_reserved_stems() {
        let formats = build_twimg_image_variants(
            "https://pbs.twimg.com/media/CompatTest?format=webp&name=medium",
            1920,
            1080,
        );
        assert_eq!(formats.first().map(|f| f.ext.as_str()), Some("jpg"));
        assert!(formats[0].video_url.contains("format=jpg&name=orig"));
        assert!(formats
            .iter()
            .any(|f| f.ext == "png" && f.video_url.contains("name=orig")));
        assert!(!formats.iter().any(|f| f.ext == "webp"));

        assert_eq!(
            build_source_filename_stem("CON", "2026-11-25T00:00:00Z", "998877"),
            "_CON-20261125-998877"
        );
    }

    #[test]
    fn strips_media_extension_on_twimg_variants_and_accepts_fixvx_subdomain() {
        let formats =
            build_twimg_image_variants("https://pbs.twimg.com/media/ABC123.jpg", 800, 600);
        assert!(formats
            .iter()
            .any(|f| f.video_url == "https://pbs.twimg.com/media/ABC123?format=jpg&name=orig"));
        assert!(formats
            .iter()
            .any(|f| f.video_url == "https://pbs.twimg.com/media/ABC123?format=png&name=orig"));
        assert_eq!(
            tweet_id_from_url("https://www.fixvx.com/user/status/123456"),
            Some("123456".to_string())
        );
    }
}
