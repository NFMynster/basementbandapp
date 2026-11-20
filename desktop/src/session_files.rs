//! The session document: version, validation of untrusted JSON and atomic
//! writes. Shared by save/open and the recovery file.

use crate::json::array;
use serde_json::Value;
use std::collections::HashSet;
use std::path::Path;

pub const CURRENT_SESSION_VERSION: u64 = 4;
const METRONOME_SOUNDS: [&str; 3] = ["beep", "woodblock", "stick"];

/// Every clip of every track.
pub fn session_clips(session: &Value) -> Vec<&Value> {
    array(session, "tracks")
        .iter()
        .flat_map(|track| array(track, "clips"))
        .collect()
}

pub fn session_clips_mut(session: &mut Value) -> Vec<&mut Value> {
    let mut clips = Vec::new();
    if let Some(tracks) = session.get_mut("tracks").and_then(Value::as_array_mut) {
        for track in tracks {
            if let Some(list) = track.get_mut("clips").and_then(Value::as_array_mut) {
                clips.extend(list.iter_mut());
            }
        }
    }
    clips
}

/// Writes through a temporary sibling and a rename, so a crash or full disk
/// never leaves a half-written document in place of the previous one.
pub fn write_json_atomically(target: &Path, value: &Value, pretty: bool) -> Result<(), String> {
    let temporary = {
        let mut name = target.as_os_str().to_owned();
        name.push(format!(".{}.tmp", uuid::Uuid::new_v4()));
        std::path::PathBuf::from(name)
    };
    let text = if pretty {
        serde_json::to_string_pretty(value)
    } else {
        serde_json::to_string(value)
    }
    .map_err(|error| error.to_string())?;
    let result = std::fs::write(&temporary, text)
        .and_then(|()| std::fs::rename(&temporary, target))
        .map_err(|error| format!("Could not write {}: {error}", target.display()));
    let _ = std::fs::remove_file(&temporary);
    result
}

fn utf16_len_at_most(text: &str, limit: usize) -> bool {
    // UTF-16 units never exceed UTF-8 bytes, so most strings pass cheaply.
    text.len() <= limit || text.encode_utf16().count() <= limit
}

fn is_hex(text: &str) -> bool {
    text.bytes().all(|b| b.is_ascii_hexdigit())
}

/// A UUID with or without dashes.
fn is_session_id(text: &str) -> bool {
    if text.len() == 32 {
        return is_hex(text);
    }
    let parts: Vec<&str> = text.split('-').collect();
    parts.len() == 5
        && parts
            .iter()
            .zip([8, 4, 4, 4, 12])
            .all(|(part, len)| part.len() == len && is_hex(part))
}

struct Checker {
    ids: HashSet<String>,
}

impl Checker {
    fn assert(condition: bool, message: &str) -> Result<(), String> {
        if condition {
            Ok(())
        } else {
            Err(message.to_owned())
        }
    }
    fn number(value: Option<&Value>, min: f64, max: f64) -> Result<f64, String> {
        match value.and_then(Value::as_f64) {
            Some(n) if n.is_finite() && n >= min && n <= max => Ok(n),
            _ => Err("Invalid numeric session field".into()),
        }
    }
    fn integer(value: Option<&Value>, min: f64, max: f64, message: &str) -> Result<(), String> {
        let n = Self::number(value, min, max)?;
        Self::assert(n.fract() == 0.0, message)
    }
    fn text(value: Option<&Value>, length: usize) -> Result<(), String> {
        match value {
            Some(Value::String(s)) if utf16_len_at_most(s, length) => Ok(()),
            _ => Err("Invalid text session field".into()),
        }
    }
    fn boolean(value: Option<&Value>, message: &str) -> Result<(), String> {
        Self::assert(matches!(value, Some(Value::Bool(_))), message)
    }
    fn one_of(value: Option<&Value>, allowed: &[&str], message: &str) -> Result<(), String> {
        Self::assert(
            value
                .and_then(Value::as_str)
                .is_some_and(|s| allowed.contains(&s)),
            message,
        )
    }
    fn id(&mut self, value: Option<&Value>) -> Result<(), String> {
        let text = value.and_then(Value::as_str).unwrap_or("");
        let canonical = text.replace('-', "").to_lowercase();
        Self::assert(
            value.is_some_and(Value::is_string)
                && is_session_id(text)
                && !self.ids.contains(&canonical),
            "Session IDs must be valid and unique",
        )?;
        self.ids.insert(canonical);
        Ok(())
    }
}

/// Checks a session document before it reaches the engine. Input is untrusted
/// JSON, so fields are read loosely and asserted one by one.
pub fn validate(session: &Value) -> Result<(), String> {
    type C = Checker;
    let mut checker = Checker {
        ids: HashSet::new(),
    };
    C::assert(session.is_object(), "Invalid session")?;
    let get = |key: &str| session.get(key);
    C::assert(
        get("version").and_then(Value::as_f64) == Some(CURRENT_SESSION_VERSION as f64),
        "Unsupported session version",
    )?;
    for key in ["countIn", "metronome"] {
        C::boolean(get(key), "Invalid transport setting")?;
    }
    C::text(get("title"), 100)?;
    C::number(get("tempo"), 40.0, 240.0)?;
    C::number(get("masterGain"), 0.0, 2.0)?;
    C::number(get("metronomeGain"), 0.0, 4.0)?;
    if get("metronomeSound").is_some() {
        C::one_of(
            get("metronomeSound"),
            &METRONOME_SOUNDS,
            "Invalid metronome sound",
        )?;
    }
    C::boolean(get("limiterEnabled"), "Invalid output protection switch")?;
    let loop_start = C::number(get("loopStart"), 0.0, f64::MAX)?;
    let loop_end = C::number(get("loopEnd"), loop_start, f64::MAX)?;
    C::assert(
        loop_end > loop_start && matches!(get("looping"), Some(Value::Bool(_))),
        "Invalid loop",
    )?;
    let tracks = get("tracks").and_then(Value::as_array);
    C::assert(
        tracks.is_some_and(|t| t.len() <= 32),
        "Invalid session tracks",
    )?;
    for track in tracks.into_iter().flatten() {
        let t = |key: &str| track.get(key);
        checker.id(t("id"))?;
        C::text(t("name"), 80)?;
        C::boolean(t("monitor"), "Invalid monitor setting")?;
        C::one_of(
            t("icon"),
            &["guitar", "bass", "drums", "keys", "mic", "audio"],
            "Invalid track icon",
        )?;
        C::one_of(t("kind"), &["audio", "midi"], "Invalid track kind")?;
        let color = t("color").and_then(Value::as_str).unwrap_or("");
        C::assert(
            color.len() == 7 && color.starts_with('#') && is_hex(&color[1..]),
            "Invalid track color",
        )?;
        C::integer(t("input"), 0.0, 127.0, "Invalid input channel")?;
        C::number(t("gain"), 0.0, 1.5)?;
        C::number(t("pan"), -1.0, 1.0)?;
        for key in ["eqBassFrequency", "eqMidFrequency", "eqTrebleFrequency"] {
            if t(key).is_some() {
                C::number(t(key), 20.0, 20000.0)?;
            }
        }
        if t("eqMidQ").is_some() {
            C::number(t("eqMidQ"), 0.2, 10.0)?;
        }
        if t("eqLowCut").is_some() {
            C::number(t("eqLowCut"), 20.0, 1000.0)?;
        }
        for key in ["eqBass", "eqMid", "eqTreble"] {
            C::number(t(key), -12.0, 12.0)?;
        }
        for key in [
            "compressorAmount",
            "reverbAmount",
            "reverbSize",
            "reverbDamping",
            "reverbWidth",
        ] {
            C::number(t(key), 0.0, 1.0)?;
        }
        C::number(t("compressorAttack"), 1.0, 100.0)?;
        C::number(t("compressorRelease"), 20.0, 1000.0)?;
        C::number(t("gateThreshold"), -80.0, -10.0)?;
        for key in ["compressorEnabled", "reverbEnabled", "gateEnabled"] {
            C::boolean(t(key), "Invalid effect switch")?;
        }
        C::boolean(t("eqEnabled"), "Invalid EQ switch")?;
        // Starter amp fields arrived after version 4; without them there is no amp.
        if t("ampCharacter").is_some() {
            C::one_of(
                t("ampCharacter"),
                &["none", "clean", "crunch", "lead", "bass"],
                "Invalid amp character",
            )?;
        }
        if t("ampBypass").is_some() {
            C::boolean(t("ampBypass"), "Invalid effect switch")?;
        }
        for key in ["armed", "mute", "solo", "bypass"] {
            C::boolean(t(key), "Invalid track switch")?;
        }
        C::text(t("midiDevice"), 4096)?;
        C::integer(t("midiChannel"), 0.0, 16.0, "Invalid MIDI channel")?;
        C::assert(t("clips").is_some_and(Value::is_array), "Invalid regions")?;
        C::assert(
            t("effects")
                .and_then(Value::as_array)
                .is_some_and(|e| e.len() <= 16),
            "Invalid effect chain",
        )?;
        for effect in array(track, "effects") {
            let e = |key: &str| effect.get(key);
            checker.id(e("id"))?;
            C::text(e("path"), 32768)?;
            C::text(e("name"), 1024)?;
            C::boolean(e("bypass"), "Invalid effect bypass")?;
            if e("state").is_some() {
                C::text(e("state"), 64 * 1024 * 1024)?;
            }
        }
        for clip in array(track, "clips") {
            let c = |key: &str| clip.get(key);
            checker.id(c("id"))?;
            C::text(c("name"), 1024)?;
            C::text(c("path"), 32768)?;
            C::one_of(c("kind"), &["audio", "midi"], "Invalid region kind")?;
            C::assert(c("kind") == t("kind"), "Region type does not match track")?;
            C::number(c("start"), 0.0, f64::MAX)?;
            C::number(c("gain"), 0.0, 4.0)?;
            for key in ["fadeIn", "fadeOut"] {
                C::number(c(key), 0.0, 1200.0)?;
            }
            C::number(c("offset"), 0.0, 1200.0)?;
            let source_start = C::number(c("sourceStart"), 0.0, 1200.0)?;
            C::number(c("sourceEnd"), source_start, 1200.0)?;
            let length = C::number(c("length"), -1.0, 1200.0)?;
            C::assert(length == -1.0 || length > 0.0, "Invalid region length")?;
            C::boolean(c("active"), "Invalid take selection")?;
            C::text(c("takeGroup"), 64)?;
            C::integer(c("take"), 0.0, 24000.0, "Invalid take number")?;
        }
    }
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn ids_accept_both_uuid_spellings() {
        assert!(is_session_id("0123456789abcdef0123456789ABCDEF"));
        assert!(is_session_id("01234567-89ab-cdef-0123-456789abcdef"));
        assert!(!is_session_id("../escape"));
        assert!(!is_session_id("01234567-89ab-cdef-0123-456789abcdeg"));
    }
}
