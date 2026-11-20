//! Saving and opening `.basement` documents. File operations only: the caller
//! owns the engine, queue, history and recovery.

use crate::json::remove;
use crate::paths::{display, extname, relative, resolve};
use crate::session_files::{
    session_clips_mut, validate, write_json_atomically, CURRENT_SESSION_VERSION,
};
use serde_json::{json, Value};
use std::collections::HashMap;
use std::path::{Path, PathBuf};

/// Live engine fields that never belong in a document.
const TRANSIENT_SESSION_KEYS: [&str; 17] = [
    "position",
    "playing",
    "recording",
    "device",
    "deviceError",
    "diskOverrun",
    "sampleRate",
    "bufferSize",
    "inputLatencySamples",
    "outputLatencySamples",
    "countdown",
    "audioCpu",
    "masterPeak",
    "outputClipped",
    "processingDropouts",
    "recordingDropouts",
    "deviceDropouts",
];
const TRANSIENT_TRACK_KEYS: [&str; 3] = ["peak", "recordStart", "latencySamples"];

/// Copies media next to the document (`<name>.basement.audio`) and stores
/// paths relative to it, so a session folder can move between machines.
pub fn save_session(target_path: &Path, snapshot: &Value) -> Result<Value, String> {
    let mut snapshot = snapshot.clone();
    snapshot["version"] = json!(CURRENT_SESSION_VERSION);
    validate(&snapshot)?;
    let target = resolve(target_path);
    let assets = {
        let mut name = target.as_os_str().to_owned();
        name.push(".audio");
        PathBuf::from(name)
    };
    std::fs::create_dir_all(&assets)
        .map_err(|e| format!("Could not create {}: {e}", assets.display()))?;
    let document_folder = target.parent().map(Path::to_path_buf).unwrap_or_default();
    let mut copied: HashMap<String, PathBuf> = HashMap::new();
    for clip in session_clips_mut(&mut snapshot) {
        let source = resolve(clip["path"].as_str().unwrap_or_default());
        let key = if cfg!(windows) {
            display(&source).to_lowercase()
        } else {
            display(&source)
        };
        let destination = match copied.get(&key) {
            Some(existing) => existing.clone(),
            None => {
                let destination = if source.parent() == Some(assets.as_path()) {
                    source.clone()
                } else {
                    assets.join(format!("{}{}", uuid::Uuid::new_v4(), extname(&source)))
                };
                if source != destination {
                    std::fs::copy(&source, &destination)
                        .map_err(|e| format!("Could not copy {}: {e}", source.display()))?;
                }
                copied.insert(key, destination.clone());
                destination
            }
        };
        clip["path"] = json!(display(&relative(&document_folder, &destination)));
        remove(clip, "peaks");
        remove(clip, "notes");
    }
    for key in TRANSIENT_SESSION_KEYS {
        remove(&mut snapshot, key);
    }
    if let Some(tracks) = snapshot.get_mut("tracks").and_then(Value::as_array_mut) {
        for track in tracks {
            for key in TRANSIENT_TRACK_KEYS {
                remove(track, key);
            }
        }
    }
    write_json_atomically(&target, &snapshot, true)?;
    Ok(json!({ "saved": display(&target) }))
}

/// Reads and validates a document, resolving media paths next to it.
pub fn read_session(target_path: &Path) -> Result<Value, String> {
    let target = resolve(target_path);
    let raw = std::fs::read_to_string(&target)
        .map_err(|e| format!("Could not read {}: {e}", target.display()))?;
    let mut session: Value = serde_json::from_str(&raw)
        .map_err(|e| format!("{} is not a valid session: {e}", target.display()))?;
    validate(&session)?;
    prepare_for_restore(&mut session, target.parent())?;
    Ok(session)
}

/// Monitoring always starts off (a fallback device could route a saved input
/// to speakers), and every clip's media must still exist. Relative clip paths
/// resolve against `folder` when given.
pub fn prepare_for_restore(session: &mut Value, folder: Option<&Path>) -> Result<(), String> {
    if let Some(tracks) = session.get_mut("tracks").and_then(Value::as_array_mut) {
        for track in tracks {
            track["monitor"] = json!(false);
        }
    }
    for clip in session_clips_mut(session) {
        let stored = clip["path"].as_str().unwrap_or_default().to_owned();
        let path = match folder {
            Some(folder) => resolve(folder.join(&stored)),
            None => PathBuf::from(&stored),
        };
        if !path.exists() {
            return Err(format!("Missing media file {}", path.display()));
        }
        if folder.is_some() {
            clip["path"] = json!(display(&path));
        }
    }
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;

    fn session(media: &Path) -> Value {
        json!({
            "version": 4, "title": "Jam", "tempo": 120, "masterGain": 1, "metronomeGain": 1,
            "metronome": false, "countIn": false, "limiterEnabled": true,
            "loopStart": 0, "loopEnd": 8, "looping": false, "position": 3, "playing": false,
            "tracks": [{
                "id": "0123456789abcdef0123456789abcdef", "name": "Guitar", "monitor": true,
                "icon": "guitar", "kind": "audio", "color": "#aabbcc", "input": 0, "gain": 1,
                "pan": 0, "eqBass": 0, "eqMid": 0, "eqTreble": 0, "compressorAmount": 0,
                "reverbAmount": 0, "reverbSize": 0.5, "reverbDamping": 0.5, "reverbWidth": 1,
                "compressorAttack": 10, "compressorRelease": 100, "gateThreshold": -60,
                "compressorEnabled": false, "reverbEnabled": false, "gateEnabled": false,
                "eqEnabled": true, "armed": false, "mute": false, "solo": false, "bypass": false,
                "midiDevice": "", "midiChannel": 0, "effects": [], "peak": 0,
                "clips": [{
                    "id": "fedcba9876543210fedcba9876543210", "name": "take", "kind": "audio",
                    "path": media.to_string_lossy(), "start": 0, "gain": 1, "fadeIn": 0,
                    "fadeOut": 0, "offset": 0, "sourceStart": 0, "sourceEnd": 1, "length": -1,
                    "active": true, "takeGroup": "", "take": 0, "peaks": [0.5]
                }]
            }]
        })
    }

    #[test]
    fn saving_copies_media_writes_relative_paths_and_never_mutates_or_corrupts() {
        let folder = std::env::temp_dir().join(format!("basement-save-{}", uuid::Uuid::new_v4()));
        std::fs::create_dir_all(&folder).unwrap();
        let media = folder.join("source.wav");
        std::fs::write(&media, b"RIFF").unwrap();
        let snapshot = session(&media);
        let before = snapshot.clone();
        let document = folder.join("Jam.basement");
        let saved = save_session(&document, &snapshot).unwrap();
        assert_eq!(saved["saved"], json!(display(&resolve(&document))));
        assert_eq!(
            snapshot, before,
            "Saving must not mutate the caller's snapshot"
        );

        let written: Value =
            serde_json::from_str(&std::fs::read_to_string(&document).unwrap()).unwrap();
        let stored = written["tracks"][0]["clips"][0]["path"].as_str().unwrap();
        assert!(!Path::new(stored).is_absolute());
        assert!(written.get("position").is_none() && written.get("playing").is_none());
        assert!(written["tracks"][0].get("peak").is_none());
        assert!(written["tracks"][0]["clips"][0].get("peaks").is_none());

        let reopened = read_session(&document).unwrap();
        assert_eq!(reopened["tracks"][0]["monitor"], json!(false));
        assert!(Path::new(reopened["tracks"][0]["clips"][0]["path"].as_str().unwrap()).exists());

        // Saving a reopened document under a new name copies its media again.
        let copy = folder.join("Copy.basement");
        save_session(&copy, &reopened).unwrap();
        assert_eq!(read_session(&copy).unwrap()["title"], json!("Jam"));
        let previous = std::fs::read_to_string(&copy).unwrap();
        let mut broken = reopened.clone();
        broken["tracks"][0]["clips"][0]["path"] = json!(display(&folder.join("missing.wav")));
        assert!(save_session(&copy, &broken).is_err());
        assert_eq!(
            std::fs::read_to_string(&copy).unwrap(),
            previous,
            "Failed saves preserve the previous document"
        );
        let _ = std::fs::remove_dir_all(folder);
    }
}
