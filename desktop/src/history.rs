//! Undo history: which settings each edit owns, how it is described, and how
//! an entry is applied without discarding later unrelated edits.

use crate::contract::policy;
use crate::json::{array, find_by_id, op, truthy};
use serde_json::{json, Value};

const UNDOABLE_CLIP_ACTIONS: [&str; 9] = [
    "move", "trim", "repeat", "split", "copy", "note", "quantize", "notes", "sound",
];

pub const UNDOABLE_TRACK_SETTINGS: [&str; 36] = [
    "compressorEnabled",
    "compressorAmount",
    "compressorAttack",
    "compressorRelease",
    "reverbEnabled",
    "reverbAmount",
    "reverbSize",
    "reverbDamping",
    "reverbWidth",
    "gateEnabled",
    "gateThreshold",
    "ampCharacter",
    "ampBypass",
    "name",
    "color",
    "icon",
    "input",
    "midiDevice",
    "midiChannel",
    "armed",
    "monitor",
    "mute",
    "solo",
    "gain",
    "pan",
    "eqEnabled",
    "eqBass",
    "eqMid",
    "eqTreble",
    "eqBassFrequency",
    "eqMidFrequency",
    "eqTrebleFrequency",
    "eqMidQ",
    "eqLowCut",
    "bypass",
    "pluginName",
];

/// Plug-in chain fields restored together when plug-ins change or a preset applies.
pub const PLUGIN_SETTINGS: [&str; 5] = [
    "pluginPath",
    "pluginUid",
    "pluginState",
    "effects",
    "bypass",
];

/// The sound a track preset carries besides its plug-ins. Presets keep the
/// track's name, routing and arming.
pub const PRESET_SOUND_SETTINGS: [&str; 24] = [
    "gain",
    "pan",
    "eqBass",
    "eqMid",
    "eqTreble",
    "eqBassFrequency",
    "eqMidFrequency",
    "eqTrebleFrequency",
    "eqMidQ",
    "eqLowCut",
    "compressorEnabled",
    "compressorAmount",
    "compressorAttack",
    "compressorRelease",
    "reverbEnabled",
    "reverbAmount",
    "reverbSize",
    "reverbDamping",
    "reverbWidth",
    "gateEnabled",
    "gateThreshold",
    "ampCharacter",
    "ampBypass",
    "eqEnabled",
];

/// Session-level settings owned by a global edit.
pub fn global_edit(op: &str) -> Option<&'static str> {
    Some(match op {
        "master" => "masterGain",
        "limiter" => "limiterEnabled",
        "tempo" => "tempo",
        "rename" => "title",
        "metronome" => "metronome",
        "metronomeVolume" => "metronomeGain",
        "metronomeSound" => "metronomeSound",
        "countIn" => "countIn",
        _ => return None,
    })
}

/// One undoable edit: snapshots on either side plus the keys it owns, so undo
/// restores only this edit and leaves later unrelated changes alone.
#[derive(Debug, Clone)]
pub struct HistoryEntry {
    pub description: String,
    pub before: Value,
    pub after: Value,
    pub track_id: Option<Value>,
    pub track_order: bool,
    /// Plug-in edits restore processor state instead of keeping live processors.
    pub reload_plugins: bool,
    pub global_keys: Vec<String>,
    pub track_keys: Vec<String>,
}

fn field(value: &Value, key: &str) -> Value {
    value.get(key).cloned().unwrap_or(Value::Null)
}

/// What undo compares to decide whether an edit changed anything.
pub fn history_fingerprint(s: &Value) -> Value {
    let keys: Vec<&str> = UNDOABLE_TRACK_SETTINGS
        .iter()
        .copied()
        .chain([
            "id",
            "kind",
            "pluginPath",
            "pluginUid",
            "pluginState",
            "effects",
        ])
        .collect();
    let clip_keys = [
        "id",
        "path",
        "name",
        "start",
        "offset",
        "length",
        "active",
        "takeGroup",
        "take",
        "sourceStart",
        "sourceEnd",
        "gain",
        "fadeIn",
        "fadeOut",
    ];
    json!({
        "title": field(s, "title"),
        "tempo": field(s, "tempo"),
        "masterGain": field(s, "masterGain"),
        "limiterEnabled": field(s, "limiterEnabled"),
        "metronome": field(s, "metronome"),
        "metronomeGain": field(s, "metronomeGain"),
        "metronomeSound": field(s, "metronomeSound"),
        "countIn": field(s, "countIn"),
        "tracks": array(s, "tracks").iter().map(|t| json!({
            "settings": keys.iter().map(|k| field(t, k)).collect::<Vec<_>>(),
            "clips": array(t, "clips").iter().map(|c| {
                clip_keys.iter().map(|k| field(c, k)).collect::<Vec<_>>()
            }).collect::<Vec<_>>(),
        })).collect::<Vec<_>>(),
    })
}

fn has_key(command: &Value, test: impl Fn(&str) -> bool) -> bool {
    command
        .as_object()
        .is_some_and(|map| map.keys().any(|k| test(k)))
}

pub fn edit_description(command: &Value) -> String {
    let op = op(command);
    let fixed = match op {
        "duplicateTrack" => Some("duplicate track"),
        "addTrack" => Some("create track"),
        "createMidi" => Some("create MIDI region"),
        "import" => Some("import region"),
        "reorderEffect" => Some("reorder effects"),
        "preset" => Some("apply track preset"),
        "plugin" | "removePlugin" => Some("change plug-in"),
        "bypass" => Some("bypass plug-in"),
        "limiter" => Some("change output protection"),
        _ => None,
    };
    if let Some(text) = fixed {
        return text.into();
    }
    if op == "track" {
        return if has_key(command, |k| {
            k.starts_with("compressor") || k.starts_with("reverb") || k.starts_with("gate")
        }) {
            "change built-in effects"
        } else if has_key(command, |k| k.starts_with("eq")) {
            "change EQ"
        } else if command.get("gain").is_some() {
            "change track volume"
        } else if command.get("pan").is_some() {
            "change pan"
        } else if command.get("name").is_some() {
            "rename track"
        } else {
            "change track settings"
        }
        .into();
    }
    if op == "metronomeSound" {
        return "change metronome sound".into();
    }
    if global_edit(op).is_some() {
        return format!(
            "change {}",
            if op == "master" { "output volume" } else { op }
        );
    }
    match op {
        "reorderTrack" => return "reorder tracks".into(),
        "removeTrack" => return "delete track".into(),
        "removeClip" => return "delete region".into(),
        "editRegions" => {
            return if command.get("action").and_then(Value::as_str) == Some("delete") {
                "delete regions"
            } else {
                "move regions"
            }
            .into()
        }
        _ => {}
    }
    match command.get("action").and_then(Value::as_str) {
        Some("move") => "move region",
        Some("trim") => "trim region",
        Some("repeat") => "loop region",
        Some("split") => "split region",
        Some("copy") => "copy region",
        Some("note") => "edit MIDI note",
        Some("notes") => "edit MIDI notes",
        Some("sound") => "change clip sound",
        Some("quantize") => "align MIDI notes",
        _ => "edit",
    }
    .into()
}

pub fn is_undoable(command: &Value) -> bool {
    let route = policy(op(command));
    route.always_undoable()
        || (route.undoable_by_action()
            && command
                .get("action")
                .and_then(Value::as_str)
                .is_some_and(|a| UNDOABLE_CLIP_ACTIONS.contains(&a)))
}

/// Ids in first-seen order, like a JavaScript `Set`.
fn ordered_ids<'a>(lists: impl IntoIterator<Item = &'a [Value]>) -> Vec<Value> {
    let mut ids: Vec<Value> = Vec::new();
    for list in lists {
        for item in list {
            let id = item.get("id").cloned().unwrap_or(Value::Null);
            if !ids.contains(&id) {
                ids.push(id);
            }
        }
    }
    ids
}

fn position_of(items: &[Value], wanted: &Value) -> usize {
    items
        .iter()
        .position(|item| item.get("id") == Some(wanted))
        .unwrap_or(items.len())
}

fn insert_clamped(list: &mut Vec<Value>, index: usize, value: Value) {
    let index = index.min(list.len());
    list.insert(index, value);
}

/// Applies an entry to the current session without discarding unrelated edits.
pub fn apply_history_entry(current: &Value, entry: &HistoryEntry, undo: bool) -> Value {
    let (source, destination) = if undo {
        (&entry.after, &entry.before)
    } else {
        (&entry.before, &entry.after)
    };
    let mut target = current.clone();
    let source_tracks = array(source, "tracks");
    let destination_tracks = array(destination, "tracks");
    // Apply only this edit's region differences. Later imports, mix changes,
    // transport settings and newly added tracks survive undo/redo.
    let ids = ordered_ids([source_tracks, destination_tracks]);
    if !target.get("tracks").is_some_and(Value::is_array) {
        target["tracks"] = json!([]);
    }
    for id in &ids {
        let old = find_by_id(source_tracks, Some(id));
        let next = find_by_id(destination_tracks, Some(id));
        let tracks = target["tracks"].as_array_mut().expect("tracks array");
        let Some(next) = next else {
            tracks.retain(|track| track.get("id") != Some(id));
            continue;
        };
        let Some(old) = old else {
            insert_clamped(tracks, position_of(destination_tracks, id), next.clone());
            continue;
        };
        let Some(live) = tracks.iter_mut().find(|t| t.get("id") == Some(id)) else {
            continue;
        };
        let old_clips = array(old, "clips");
        let next_clips = array(next, "clips");
        for clip_id in ordered_ids([old_clips, next_clips]) {
            let a = find_by_id(old_clips, Some(&clip_id));
            let b = find_by_id(next_clips, Some(&clip_id));
            if a == b {
                continue;
            }
            if !live.get("clips").is_some_and(Value::is_array) {
                live["clips"] = json!([]);
            }
            let clips = live["clips"].as_array_mut().expect("clips array");
            clips.retain(|clip| clip.get("id") != Some(&clip_id));
            if let Some(b) = b {
                insert_clamped(clips, position_of(next_clips, &clip_id), b.clone());
            }
        }
    }
    // Only settings belonging to this history entry are restored.
    for key in &entry.global_keys {
        crate::json::assign(&mut target, key, destination.get(key).cloned());
    }
    for id in &ids {
        let next = find_by_id(destination_tracks, Some(id));
        let old = find_by_id(source_tracks, Some(id));
        let tracks = target["tracks"].as_array_mut().expect("tracks array");
        let live = tracks.iter_mut().find(|t| t.get("id") == Some(id));
        let (Some(next), Some(live)) = (next, live) else {
            continue;
        };
        for key in &entry.track_keys {
            if old.and_then(|o| o.get(key)) == next.get(key) {
                continue;
            }
            crate::json::assign(live, key, next.get(key).cloned());
        }
    }
    if entry.track_order {
        let order: Vec<Value> = destination_tracks
            .iter()
            .map(|t| t.get("id").cloned().unwrap_or(Value::Null))
            .collect();
        let tracks = target["tracks"].as_array_mut().expect("tracks array");
        let mut sorted: std::collections::VecDeque<Value> = order
            .iter()
            .flat_map(|id| {
                tracks
                    .iter()
                    .filter(move |t| t.get("id") == Some(id))
                    .cloned()
            })
            .collect();
        for track in tracks.iter_mut() {
            let id = track.get("id").cloned().unwrap_or(Value::Null);
            if order.contains(&id) {
                if let Some(next) = sorted.pop_front() {
                    *track = next;
                }
            }
        }
    }
    target
}

/// The track keys an edit owns, in the order undo restores them.
pub fn owned_track_keys(command: &Value) -> Vec<String> {
    let op = op(command);
    let strings = |keys: &[&str]| keys.iter().map(|k| (*k).to_owned()).collect::<Vec<_>>();
    match op {
        "track" => command
            .as_object()
            .map(|map| {
                map.keys()
                    .filter(|k| UNDOABLE_TRACK_SETTINGS.contains(&k.as_str()))
                    .cloned()
                    .collect()
            })
            .unwrap_or_default(),
        "plugin" | "removePlugin" | "preset" | "reorderEffect" => {
            let mut keys = strings(&PLUGIN_SETTINGS);
            keys.push("pluginName".into());
            if op == "preset" {
                keys.extend(strings(&PRESET_SOUND_SETTINGS));
            }
            keys
        }
        "bypass" => {
            if truthy(command.get("effect")) {
                strings(&["effects"])
            } else {
                strings(&["bypass"])
            }
        }
        _ => Vec::new(),
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    fn entry(before: Value, after: Value) -> HistoryEntry {
        HistoryEntry {
            description: "edit".into(),
            before,
            after,
            track_id: None,
            track_order: false,
            reload_plugins: false,
            global_keys: vec![],
            track_keys: vec!["gain".into()],
        }
    }

    #[test]
    fn undo_restores_only_the_entry_and_keeps_later_edits() {
        let before = json!({"tracks": [{"id": "a", "gain": 0.5, "pan": 0, "clips": []}]});
        let after = json!({"tracks": [{"id": "a", "gain": 1.0, "pan": 0, "clips": []}]});
        let current = json!({"tracks": [
            {"id": "a", "gain": 1.0, "pan": 0.3, "clips": [{"id": "c"}]},
            {"id": "b", "clips": []}
        ]});
        let undone = apply_history_entry(&current, &entry(before, after), true);
        assert_eq!(undone["tracks"][0]["gain"], json!(0.5));
        assert_eq!(undone["tracks"][0]["pan"], json!(0.3), "later pan stays");
        assert_eq!(undone["tracks"][0]["clips"][0]["id"], json!("c"));
        assert_eq!(undone["tracks"][1]["id"], json!("b"), "later track stays");
    }

    #[test]
    fn undoing_a_new_track_removes_it_and_redo_reinserts_in_place() {
        let before = json!({"tracks": [{"id": "a", "clips": []}]});
        let after = json!({"tracks": [{"id": "a", "clips": []}, {"id": "n", "clips": []}]});
        let e = entry(before.clone(), after.clone());
        let undone = apply_history_entry(&after, &e, true);
        assert_eq!(undone["tracks"].as_array().unwrap().len(), 1);
        let redone = apply_history_entry(&undone, &e, false);
        assert_eq!(redone["tracks"][1]["id"], json!("n"));
    }

    #[test]
    fn descriptions_and_undoability_follow_the_contract() {
        assert_eq!(
            edit_description(&json!({"op": "track", "gain": 1})),
            "change track volume"
        );
        assert_eq!(
            edit_description(&json!({"op": "track", "eqBass": 1})),
            "change EQ"
        );
        assert_eq!(
            edit_description(&json!({"op": "master"})),
            "change output volume"
        );
        assert_eq!(edit_description(&json!({"op": "tempo"})), "change tempo");
        assert_eq!(
            edit_description(&json!({"op": "editClip", "action": "trim"})),
            "trim region"
        );
        assert!(is_undoable(&json!({"op": "editClip", "action": "move"})));
        assert!(!is_undoable(&json!({"op": "editClip", "action": "select"})));
        assert!(!is_undoable(&json!({"op": "play"})));
    }
}
