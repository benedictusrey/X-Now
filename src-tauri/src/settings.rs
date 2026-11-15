//! Persistent settings shared by the page, the tray and the watchdog.
//!
//! One JSON file in the app data directory. Every change is validated as a
//! whole patch before it is committed, so a bad value never half-applies.

use std::fs;
use std::path::{Path, PathBuf};
use std::sync::{Mutex, MutexGuard, OnceLock};
use std::time::{SystemTime, UNIX_EPOCH};

use serde::{Deserialize, Serialize};
use serde_json::{Map, Value};

/// Most recent saves kept for the "Saved media" list.
pub const HISTORY_CAP: usize = 50;
const FILE_NAME: &str = "settings.json";

#[derive(Clone, Copy, Debug, Default, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "lowercase")]
pub enum Motion {
    #[default]
    System,
    Reduce,
    Full,
}

#[derive(Clone, Copy, Debug, Default, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "lowercase")]
pub enum QuietMode {
    #[default]
    Off,
    Nights,
    Custom,
}

#[derive(Clone, Debug, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct SavedItem {
    /// "image" or "video".
    pub kind: String,
    pub path: String,
    /// Unix seconds.
    pub saved_at: u64,
}

#[derive(Clone, Debug, PartialEq, Eq, Serialize, Deserialize)]
#[serde(default, rename_all = "camelCase")]
pub struct Settings {
    pub close_to_tray: bool,
    pub always_on_top: bool,
    pub pause_on_minimize: bool,
    pub mute_on_minimize: bool,
    pub sleep_on_minimize: bool,
    /// Percent, 0 to 100.
    pub feed_volume: u8,
    /// Percent, 0 to 100.
    pub standalone_volume: u8,
    pub cobalt_fallback: bool,
    /// Percent, 50 to 300.
    pub zoom_percent: u16,
    pub motion: Motion,
    pub quiet_mode: QuietMode,
    /// Minutes after midnight, 0 to 1439. Used by `QuietMode::Custom`.
    pub quiet_start: u16,
    pub quiet_end: u16,
    pub focus_layout: bool,
    pub history: Vec<SavedItem>,
}

impl Default for Settings {
    fn default() -> Self {
        Self {
            close_to_tray: true,
            always_on_top: false,
            pause_on_minimize: true,
            mute_on_minimize: true,
            sleep_on_minimize: true,
            feed_volume: 20,
            standalone_volume: 50,
            cobalt_fallback: true,
            zoom_percent: 100,
            motion: Motion::System,
            quiet_mode: QuietMode::Off,
            quiet_start: 23 * 60,
            quiet_end: 7 * 60,
            focus_layout: false,
            history: Vec::new(),
        }
    }
}

fn want_bool(key: &str, value: &Value) -> Result<bool, String> {
    value
        .as_bool()
        .ok_or_else(|| format!("{key} must be true or false"))
}

fn want_int(key: &str, value: &Value, min: u64, max: u64) -> Result<u64, String> {
    value
        .as_u64()
        .filter(|n| (min..=max).contains(n))
        .ok_or_else(|| format!("{key} must be a whole number from {min} to {max}"))
}

/// Applies a whole patch to `current`. Unknown keys and out-of-range values
/// reject the entire patch. `history` is not patchable: it only grows through
/// `record_save`.
pub fn apply_patch(current: &Settings, patch: &Map<String, Value>) -> Result<Settings, String> {
    let mut next = current.clone();
    for (key, value) in patch {
        match key.as_str() {
            "closeToTray" => next.close_to_tray = want_bool(key, value)?,
            "alwaysOnTop" => next.always_on_top = want_bool(key, value)?,
            "pauseOnMinimize" => next.pause_on_minimize = want_bool(key, value)?,
            "muteOnMinimize" => next.mute_on_minimize = want_bool(key, value)?,
            "sleepOnMinimize" => next.sleep_on_minimize = want_bool(key, value)?,
            "cobaltFallback" => next.cobalt_fallback = want_bool(key, value)?,
            "focusLayout" => next.focus_layout = want_bool(key, value)?,
            "feedVolume" => next.feed_volume = want_int(key, value, 0, 100)? as u8,
            "standaloneVolume" => next.standalone_volume = want_int(key, value, 0, 100)? as u8,
            "zoomPercent" => next.zoom_percent = want_int(key, value, 50, 300)? as u16,
            "quietStart" => next.quiet_start = want_int(key, value, 0, 1439)? as u16,
            "quietEnd" => next.quiet_end = want_int(key, value, 0, 1439)? as u16,
            "motion" => {
                next.motion = match value.as_str() {
                    Some("system") => Motion::System,
                    Some("reduce") => Motion::Reduce,
                    Some("full") => Motion::Full,
                    _ => return Err("motion must be system, reduce or full".to_string()),
                }
            }
            "quietMode" => {
                next.quiet_mode = match value.as_str() {
                    Some("off") => QuietMode::Off,
                    Some("nights") => QuietMode::Nights,
                    Some("custom") => QuietMode::Custom,
                    _ => return Err("quietMode must be off, nights or custom".to_string()),
                }
            }
            other => return Err(format!("unknown setting: {other}")),
        }
    }
    Ok(next)
}

/// Clamps values read from disk, so a hand-edited file cannot break the app.
fn sanitize(mut s: Settings) -> Settings {
    s.feed_volume = s.feed_volume.min(100);
    s.standalone_volume = s.standalone_volume.min(100);
    s.zoom_percent = s.zoom_percent.clamp(50, 300);
    s.quiet_start = s.quiet_start.min(1439);
    s.quiet_end = s.quiet_end.min(1439);
    s.history.truncate(HISTORY_CAP);
    s
}

struct Store {
    file: Option<PathBuf>,
    current: Settings,
}

fn store() -> MutexGuard<'static, Store> {
    static STORE: OnceLock<Mutex<Store>> = OnceLock::new();
    STORE
        .get_or_init(|| {
            Mutex::new(Store {
                file: None,
                current: Settings::default(),
            })
        })
        .lock()
        .unwrap_or_else(|error| error.into_inner())
}

fn write_file(file: &Path, settings: &Settings) {
    let Ok(json) = serde_json::to_string_pretty(settings) else {
        return;
    };
    // Write beside the target, then rename, so a crash cannot leave half a file.
    let temp = file.with_extension("json.tmp");
    if fs::write(&temp, json).is_ok() && fs::rename(&temp, file).is_err() {
        eprintln!("[X-Now] Could not save settings to {}", file.display());
    }
}

/// Loads `settings.json` from `data_dir`. A missing or unreadable file keeps
/// the defaults; a corrupt one is kept beside as `settings.json.bad`.
pub fn init(data_dir: &Path) {
    let file = data_dir.join(FILE_NAME);
    let loaded = match fs::read_to_string(&file) {
        Ok(text) => match serde_json::from_str::<Settings>(&text) {
            Ok(settings) => sanitize(settings),
            Err(error) => {
                eprintln!("[X-Now] settings.json is unreadable ({error}); using defaults");
                let _ = fs::rename(&file, file.with_extension("json.bad"));
                Settings::default()
            }
        },
        Err(_) => Settings::default(),
    };
    let mut store = store();
    store.current = loaded;
    store.file = Some(file);
}

pub fn get() -> Settings {
    store().current.clone()
}

/// Reads without copying the history list. The watchdog calls this on every tick.
pub fn read<R>(look: impl FnOnce(&Settings) -> R) -> R {
    look(&store().current)
}

/// Validates and applies a page or tray patch, then saves it.
pub fn update(patch: &Map<String, Value>) -> Result<Settings, String> {
    let mut store = store();
    let next = apply_patch(&store.current, patch)?;
    store.current = next.clone();
    if let Some(file) = store.file.clone() {
        write_file(&file, &next);
    }
    Ok(next)
}

/// Changes one field from native code (the tray). The value is already valid.
pub fn mutate(change: impl FnOnce(&mut Settings)) -> Settings {
    let mut store = store();
    change(&mut store.current);
    let next = store.current.clone();
    if let Some(file) = store.file.clone() {
        write_file(&file, &next);
    }
    next
}

/// Adds a saved file to the front of the history and saves.
pub fn record_save(kind: &str, path: &str) {
    let saved_at = SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .map(|elapsed| elapsed.as_secs())
        .unwrap_or(0);
    mutate(|s| {
        s.history.insert(
            0,
            SavedItem {
                kind: kind.to_string(),
                path: path.to_string(),
                saved_at,
            },
        );
        s.history.truncate(HISTORY_CAP);
    });
}

/// True only for paths X-Now itself recorded, so the page cannot open
/// arbitrary folders through `open_saved_folder`.
pub fn is_recorded_path(path: &str) -> bool {
    store().current.history.iter().any(|item| item.path == path)
}

#[cfg(test)]
mod tests {
    use super::*;
    use serde_json::json;

    fn patch(value: Value) -> Map<String, Value> {
        value.as_object().cloned().unwrap()
    }

    #[test]
    fn defaults_match_the_shipped_behaviour() {
        let s = Settings::default();
        assert!(s.close_to_tray && s.pause_on_minimize && s.mute_on_minimize);
        assert!(s.sleep_on_minimize && s.cobalt_fallback);
        assert_eq!((s.feed_volume, s.standalone_volume), (20, 50));
        assert_eq!(s.zoom_percent, 100);
        assert_eq!(s.quiet_mode, QuietMode::Off);
    }

    #[test]
    fn valid_patch_applies_every_field() {
        let next = apply_patch(
            &Settings::default(),
            &patch(json!({
                "alwaysOnTop": true,
                "feedVolume": 35,
                "zoomPercent": 150,
                "motion": "reduce",
                "quietMode": "custom",
                "quietStart": 1320,
                "quietEnd": 360,
                "focusLayout": true
            })),
        )
        .unwrap();
        assert!(next.always_on_top && next.focus_layout);
        assert_eq!((next.feed_volume, next.zoom_percent), (35, 150));
        assert_eq!(next.motion, Motion::Reduce);
        assert_eq!(next.quiet_mode, QuietMode::Custom);
        assert_eq!((next.quiet_start, next.quiet_end), (1320, 360));
    }

    #[test]
    fn unknown_key_rejects_the_whole_patch() {
        let err = apply_patch(
            &Settings::default(),
            &patch(json!({ "alwaysOnTop": true, "downloadDir": "C:/" })),
        )
        .unwrap_err();
        assert!(err.contains("unknown setting: downloadDir"));
    }

    #[test]
    fn history_cannot_be_patched_directly() {
        assert!(apply_patch(&Settings::default(), &patch(json!({ "history": [] }))).is_err());
    }

    #[test]
    fn out_of_range_and_wrong_type_are_rejected() {
        let s = Settings::default();
        assert!(apply_patch(&s, &patch(json!({ "feedVolume": 101 }))).is_err());
        assert!(apply_patch(&s, &patch(json!({ "feedVolume": -1 }))).is_err());
        assert!(apply_patch(&s, &patch(json!({ "feedVolume": 20.5 }))).is_err());
        assert!(apply_patch(&s, &patch(json!({ "zoomPercent": 49 }))).is_err());
        assert!(apply_patch(&s, &patch(json!({ "quietStart": 1440 }))).is_err());
        assert!(apply_patch(&s, &patch(json!({ "closeToTray": "yes" }))).is_err());
        assert!(apply_patch(&s, &patch(json!({ "motion": "loud" }))).is_err());
    }

    #[test]
    fn sanitize_clamps_a_hand_edited_file() {
        let s = sanitize(Settings {
            feed_volume: 250,
            zoom_percent: 10,
            quiet_start: 9000,
            ..Settings::default()
        });
        assert_eq!(
            (s.feed_volume, s.zoom_percent, s.quiet_start),
            (100, 50, 1439)
        );
    }

    #[test]
    fn json_round_trip_keeps_every_field() {
        let mut s = Settings::default();
        s.motion = Motion::Full;
        s.quiet_mode = QuietMode::Nights;
        s.history.push(SavedItem {
            kind: "image".into(),
            path: "C:/Downloads/X-Now/a.jpg".into(),
            saved_at: 42,
        });
        let text = serde_json::to_string(&s).unwrap();
        let back: Settings = serde_json::from_str(&text).unwrap();
        assert_eq!(back, s);
    }

    #[test]
    fn missing_fields_fall_back_to_defaults() {
        let s: Settings = serde_json::from_str(r#"{"feedVolume": 40}"#).unwrap();
        assert_eq!(s.feed_volume, 40);
        assert!(s.close_to_tray);
    }
}
