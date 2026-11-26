//! Windows audio-session control for X-Now.
//!
//! Brands this process tree's Core Audio sessions (Volume Mixer name and icon)
//! and keeps them silent while the window is hidden. Windows remembers a mute
//! per app, so a session muted while hidden can start muted on the next launch
//! or after a crash. Once the window is visible again, X-Now clears those mutes:
//! on the first visible sync after a hide (and on the start after a crash), and on
//! sessions that appear while visible. A mute the user sets in the Volume Mixer
//! while the window stays visible is respected. A marker file records that X-Now
//! holds mutes, so a crash cannot leave the app silent on the next launch.

use std::collections::HashSet;
use std::fs;
use std::path::{Path, PathBuf};
use std::sync::{Mutex, MutexGuard, OnceLock};

use windows::core::{Interface, PCWSTR};
use windows::Win32::Foundation::{CloseHandle, RPC_E_CHANGED_MODE};
use windows::Win32::Media::Audio::Endpoints::IAudioMeterInformation;
use windows::Win32::Media::Audio::{
    eMultimedia, eRender, IAudioSessionControl, IAudioSessionControl2, IAudioSessionEnumerator,
    IAudioSessionManager2, IMMDeviceEnumerator, ISimpleAudioVolume, MMDeviceEnumerator,
};
use windows::Win32::System::Com::{
    CoCreateInstance, CoInitializeEx, CoTaskMemFree, CoUninitialize, CLSCTX_ALL,
    COINIT_MULTITHREADED,
};
use windows::Win32::System::Diagnostics::ToolHelp::{
    CreateToolhelp32Snapshot, Process32FirstW, Process32NextW, PROCESSENTRY32W, TH32CS_SNAPPROCESS,
};

/// Name shown for this app's sessions in the Volume Mixer.
const SESSION_NAME: &str = "X-Now";
/// Marker file (in app data) present while X-Now holds mutes.
const MARKER_FILE: &str = "audio-muted.flag";

/// What the watchdog wants the sessions to be doing.
#[derive(Clone, Copy, PartialEq, Eq)]
pub enum Mode {
    /// Window hidden: mute every session in the tree, including new ones.
    Hidden,
    /// Window visible: clear the mutes that should not be there (see `decide`).
    Visible,
    /// App exit: unmute what X-Now muted and drop the marker.
    Release,
}

/// What `sync_inner` does with one session.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
enum Action {
    /// Mute it, and remember that X-Now did.
    Mute,
    /// Unmute it.
    Unmute,
    /// Leave it as it is.
    Keep,
}

/// The decision for one session. `transition` is true on the first visible sync
/// after a hidden one. `is_new` is true for a session this process has not seen
/// before. `ours` is true when X-Now muted the session itself.
fn decide(mode: Mode, transition: bool, is_new: bool, muted: bool, ours: bool) -> Action {
    match mode {
        // Hidden: silence what is audible. A session that is already muted stays as it is.
        Mode::Hidden if !muted => Action::Mute,
        Mode::Hidden => Action::Keep,
        // Visible: clear a mute only where X-Now should not have one, right after hiding
        // or on a session that just appeared. A mute set while the window stays visible
        // is kept.
        Mode::Visible if muted && (transition || is_new) => Action::Unmute,
        Mode::Visible => Action::Keep,
        // Release: lift only the mutes X-Now holds.
        Mode::Release if ours && muted => Action::Unmute,
        Mode::Release => Action::Keep,
    }
}

#[derive(Default)]
struct Book {
    /// Session instance ids X-Now muted and has not released.
    muted_by_us: HashSet<String>,
    /// Session instance ids this process has seen in the tree while they exist.
    branded: HashSet<String>,
    marker: Option<PathBuf>,
    marker_on: bool,
    /// The last reconcile hid the window. The next visible one is a transition.
    was_hidden: bool,
}

fn book() -> MutexGuard<'static, Book> {
    static BOOK: OnceLock<Mutex<Book>> = OnceLock::new();
    BOOK.get_or_init(|| Mutex::new(Book::default()))
        .lock()
        .unwrap_or_else(|error| error.into_inner())
}

/// Call once at startup with the app data directory.
pub fn init(data_dir: &Path) {
    let marker = data_dir.join(MARKER_FILE);
    let mut book = book();
    // A marker from a previous run means its mutes may still be set. Treat the start
    // as a hidden window, so the first visible sync clears them.
    book.was_hidden = marker.exists();
    book.marker_on = book.was_hidden;
    book.marker = Some(marker);
}

/// PIDs of this process and all its descendants (covers `msedgewebview2.exe`
/// children, which actually own the audio sessions for the web content).
fn process_tree() -> HashSet<u32> {
    use std::collections::{HashMap, VecDeque};

    let root = std::process::id();
    let mut tree = HashSet::with_capacity(16);
    tree.insert(root);

    unsafe {
        let Ok(snapshot) = CreateToolhelp32Snapshot(TH32CS_SNAPPROCESS, 0) else {
            return tree;
        };
        let mut children: HashMap<u32, Vec<u32>> = HashMap::with_capacity(128);
        let mut entry = PROCESSENTRY32W::default();
        entry.dwSize = std::mem::size_of::<PROCESSENTRY32W>() as u32;
        if Process32FirstW(snapshot, &mut entry).is_ok() {
            loop {
                children
                    .entry(entry.th32ParentProcessID)
                    .or_default()
                    .push(entry.th32ProcessID);
                if Process32NextW(snapshot, &mut entry).is_err() {
                    break;
                }
            }
        }
        let _ = CloseHandle(snapshot);
        let mut queue = VecDeque::with_capacity(16);
        queue.push_back(root);
        while let Some(pid) = queue.pop_front() {
            if let Some(kids) = children.get(&pid) {
                for &kid in kids {
                    if tree.insert(kid) {
                        queue.push_back(kid);
                    }
                }
            }
        }
    }
    tree
}

/// Reconcile this app's audio sessions with `mode`. Cheap enough for the
/// watchdog tick: one snapshot, one session enumeration.
pub fn sync(mode: Mode) {
    unsafe {
        // The UI thread is already STA (tao, WebView2), so asking for MTA on it
        // returns RPC_E_CHANGED_MODE. That is harmless for these calls, and it
        // must not be undone with CoUninitialize, which would break the UI thread.
        let hr = CoInitializeEx(None, COINIT_MULTITHREADED);
        let owned = hr.is_ok();
        if !owned && hr != RPC_E_CHANGED_MODE {
            return;
        }
        sync_inner(mode);
        if owned {
            CoUninitialize();
        }
    }
}

unsafe fn session_enumerator() -> Option<IAudioSessionEnumerator> {
    let enumerator: IMMDeviceEnumerator =
        CoCreateInstance(&MMDeviceEnumerator, None, CLSCTX_ALL).ok()?;
    let device = enumerator
        .GetDefaultAudioEndpoint(eRender, eMultimedia)
        .ok()?;
    let manager = device
        .Activate::<IAudioSessionManager2>(CLSCTX_ALL, None)
        .ok()?;
    manager.GetSessionEnumerator().ok()
}

/// Stable per-session identity (survives the session's own mute changes).
unsafe fn instance_id(control: &IAudioSessionControl2) -> Option<String> {
    let raw = control.GetSessionInstanceIdentifier().ok()?;
    let id = raw.to_string().ok();
    CoTaskMemFree(Some(raw.0 as *const core::ffi::c_void));
    id
}

/// Name and icon for the Volume Mixer. The icon is the app's own exe, which
/// embeds the `icons/icon.ico` brand icon at build time.
unsafe fn brand(session: &IAudioSessionControl) -> windows::core::Result<()> {
    let name: Vec<u16> = SESSION_NAME
        .encode_utf16()
        .chain(std::iter::once(0))
        .collect();
    session.SetDisplayName(PCWSTR(name.as_ptr()), std::ptr::null())?;
    if let Ok(exe) = std::env::current_exe() {
        let icon: Vec<u16> = format!("{},0", exe.display())
            .encode_utf16()
            .chain(std::iter::once(0))
            .collect();
        session.SetIconPath(PCWSTR(icon.as_ptr()), std::ptr::null())?;
    }
    Ok(())
}

fn persist_marker(book: &mut Book, hold: bool) {
    if hold == book.marker_on {
        return;
    }
    if let Some(path) = &book.marker {
        if hold {
            let _ = fs::write(path, b"muted");
        } else {
            let _ = fs::remove_file(path);
        }
    }
    book.marker_on = hold;
}

unsafe fn sync_inner(mode: Mode) {
    let Some(sessions) = session_enumerator() else {
        return;
    };
    let Ok(count) = sessions.GetCount() else {
        return;
    };
    let tree = process_tree();
    let mut book = book();
    // The first visible sync after a hidden one clears the mutes in the tree.
    let transition = mode == Mode::Visible && book.was_hidden;

    let mut seen: HashSet<String> = HashSet::new();
    for i in 0..count {
        let Ok(session) = sessions.GetSession(i) else {
            continue;
        };
        let Ok(control) = session.cast::<IAudioSessionControl2>() else {
            continue;
        };
        let Some(id) = instance_id(&control) else {
            continue;
        };
        seen.insert(id.clone());
        let Ok(pid) = control.GetProcessId() else {
            continue;
        };
        if !tree.contains(&pid) {
            continue;
        }
        // `insert` is true only the first time this process sees the session.
        let is_new = book.branded.insert(id.clone());
        if is_new {
            match brand(&session) {
                Ok(()) => eprintln!("[X-Now] Audio session named '{SESSION_NAME}'"),
                Err(error) => eprintln!("[X-Now] Audio session name refused: {error}"),
            }
        }
        let Ok(volume) = session.cast::<ISimpleAudioVolume>() else {
            continue;
        };
        let Ok(muted) = volume.GetMute() else {
            continue;
        };
        let muted = muted.as_bool();
        if is_new {
            eprintln!("[X-Now] Audio session found: muted={muted}");
        }
        let ours = book.muted_by_us.contains(&id);

        match decide(mode, transition, is_new, muted, ours) {
            Action::Mute => {
                if volume.SetMute(true, std::ptr::null()).is_ok() {
                    eprintln!("[X-Now] Audio: muted the app's session (window hidden)");
                    book.muted_by_us.insert(id);
                }
            }
            Action::Unmute => {
                if volume.SetMute(false, std::ptr::null()).is_ok() {
                    eprintln!("[X-Now] Audio: unmuted the app's session (window visible)");
                    book.muted_by_us.remove(&id);
                }
            }
            Action::Keep => {}
        }
    }

    book.branded.retain(|id| seen.contains(id));
    book.muted_by_us.retain(|id| seen.contains(id));
    if mode == Mode::Release {
        book.muted_by_us.clear();
    }
    // Recorded only after a successful enumeration, so a failed one is retried.
    match mode {
        Mode::Hidden => book.was_hidden = true,
        Mode::Visible => book.was_hidden = false,
        Mode::Release => {}
    }
    let hold = !book.muted_by_us.is_empty();
    persist_marker(&mut book, hold);
}

/// Diagnostic: print every audio session owned by this app's process tree with
/// its MUTE flag and MASTER VOLUME. Used at cold start to catch "page element
/// says unmuted but the OS session is silent" cases (mixer volume at 0, etc.).
pub fn report_audio_state() {
    unsafe {
        if CoInitializeEx(None, COINIT_MULTITHREADED).0 < 0 {
            eprintln!("[X-Now] Audio state: COM init failed");
            return;
        }
        let Some(sessions) = session_enumerator() else {
            eprintln!("[X-Now] Audio state: no audio endpoint or session manager");
            CoUninitialize();
            return;
        };
        let Ok(count) = sessions.GetCount() else {
            eprintln!("[X-Now] Audio state: no session count");
            CoUninitialize();
            return;
        };

        let tree = process_tree();
        let mut found = 0;
        for i in 0..count {
            let Ok(session) = sessions.GetSession(i) else {
                continue;
            };
            let Ok(control) = session.cast::<IAudioSessionControl2>() else {
                continue;
            };
            let Ok(pid) = control.GetProcessId() else {
                continue;
            };
            if !tree.contains(&pid) {
                continue;
            }
            let Ok(volume) = session.cast::<ISimpleAudioVolume>() else {
                continue;
            };
            let Ok(muted) = volume.GetMute() else {
                continue;
            };
            let Ok(level) = volume.GetMasterVolume() else {
                continue;
            };
            // TRUE audio-flow evidence: the session's peak meter. 0.0 while a
            // video "plays" = the player is outputting silence (player-level
            // mute / WebAudio gain at 0), even though the DOM says unmuted.
            let peak = session
                .cast::<IAudioMeterInformation>()
                .ok()
                .and_then(|m| m.GetPeakValue().ok())
                .unwrap_or(-1.0);
            eprintln!(
                "[X-Now] Audio state: pid={} muted={} volume={:.2} peak={:.4}",
                pid,
                if muted.as_bool() { "yes" } else { "no" },
                level,
                peak
            );
            found += 1;
        }
        if found == 0 {
            eprintln!("[X-Now] Audio state: no sessions in the process tree");
        }
        CoUninitialize();
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn hiding_mutes_audible_sessions_and_keeps_muted_ones() {
        assert_eq!(
            decide(Mode::Hidden, false, false, false, false),
            Action::Mute
        );
        assert_eq!(
            decide(Mode::Hidden, false, true, false, false),
            Action::Mute
        );
        assert_eq!(decide(Mode::Hidden, false, false, true, true), Action::Keep);
    }

    #[test]
    fn the_first_visible_sync_after_hiding_clears_every_mute() {
        assert_eq!(
            decide(Mode::Visible, true, false, true, false),
            Action::Unmute
        );
        assert_eq!(
            decide(Mode::Visible, true, false, true, true),
            Action::Unmute
        );
        assert_eq!(
            decide(Mode::Visible, true, false, false, false),
            Action::Keep
        );
    }

    #[test]
    fn a_new_muted_session_is_cleared_while_visible() {
        assert_eq!(
            decide(Mode::Visible, false, true, true, false),
            Action::Unmute
        );
    }

    #[test]
    fn a_mute_set_while_visible_is_respected() {
        assert_eq!(
            decide(Mode::Visible, false, false, true, false),
            Action::Keep
        );
    }

    #[test]
    fn release_lifts_only_our_mutes() {
        assert_eq!(
            decide(Mode::Release, false, false, true, true),
            Action::Unmute
        );
        assert_eq!(
            decide(Mode::Release, false, false, true, false),
            Action::Keep
        );
        assert_eq!(
            decide(Mode::Release, false, false, false, true),
            Action::Keep
        );
    }
}
