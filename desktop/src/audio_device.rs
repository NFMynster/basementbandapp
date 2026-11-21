//! Remembers the audio device chosen in Settings between launches. The file
//! lives in the app's user-data folder; a missing or damaged file just means
//! the default device, as on first launch.

use crate::session_files::write_json_atomically;
use serde_json::{json, Value};
use std::path::Path;

/// Engine launch arguments that open the remembered device in one step.
///
/// `--device` carries the configuration as hex-encoded UTF-8 JSON, so device
/// names survive any command-line code page. `--listening` asks for the input
/// to open with it when the recovered session has an armed audio track
/// (restoring turns monitoring off). The engine opens nothing else if the
/// device is gone: the user picks a new one.
pub fn startup_arguments(device_file: Option<&Path>, recovery_file: Option<&Path>) -> Vec<String> {
    let Some(device) = device_file.and_then(load_audio_device) else {
        return Vec::new();
    };
    let hex = device
        .to_string()
        .bytes()
        .map(|byte| format!("{byte:02x}"))
        .collect();
    let mut arguments = vec!["--device".to_owned(), hex];
    if recovery_file.is_some_and(session_listens) {
        arguments.push("--listening".to_owned());
    }
    arguments
}

fn session_listens(recovery_file: &Path) -> bool {
    let Some(session) = std::fs::read_to_string(recovery_file)
        .ok()
        .and_then(|raw| serde_json::from_str::<Value>(&raw).ok())
    else {
        return false;
    };
    session["tracks"].as_array().is_some_and(|tracks| {
        tracks
            .iter()
            .any(|track| track["kind"] != "midi" && track["armed"] == true)
    })
}

/// The configuration part of an engine `devices`/`configure` reply.
pub fn device_configuration(value: Option<&Value>) -> Option<Value> {
    let v = value?;
    let text = |key: &str| v.get(key).and_then(Value::as_str);
    let number = |key: &str| v.get(key).and_then(Value::as_f64).map(|_| v[key].clone());
    let (kind, output, input) = (text("type")?, text("output")?, text("input")?);
    let (rate, buffer) = (number("sampleRate")?, number("bufferSize")?);
    if kind.is_empty() || output.is_empty() {
        return None;
    }
    Some(json!({
        "type": kind,
        "output": output,
        "input": input,
        "sampleRate": rate,
        "bufferSize": buffer,
    }))
}

pub fn load_audio_device(file: &Path) -> Option<Value> {
    let raw = std::fs::read_to_string(file).ok()?;
    let value: Value = serde_json::from_str(&raw).ok()?;
    device_configuration(Some(&value))
}

/// Stores what the engine actually applied (it may adjust rate or buffer).
pub fn save_audio_device(file: &Path, devices: &Value) -> Result<(), String> {
    match device_configuration(Some(devices)) {
        Some(configuration) => write_json_atomically(file, &configuration, true),
        None => Ok(()),
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn the_chosen_device_is_saved_as_applied_and_validated_on_load() {
        let folder = std::env::temp_dir().join(format!("basement-device-{}", uuid::Uuid::new_v4()));
        std::fs::create_dir_all(&folder).unwrap();
        let file = folder.join("audio-device.json");
        let remembered = json!({
            "type": "ASIO", "output": "USB Interface", "input": "USB Interface",
            "sampleRate": 48000, "bufferSize": 128
        });
        assert_eq!(load_audio_device(&file), None, "No file means defaults");
        let mut reply = remembered.clone();
        reply["types"] = json!([]);
        reply["rates"] = json!([44100]);
        save_audio_device(&file, &reply).unwrap();
        assert_eq!(load_audio_device(&file), Some(remembered.clone()));
        let stored: Value = serde_json::from_str(&std::fs::read_to_string(&file).unwrap()).unwrap();
        let mut keys: Vec<_> = stored.as_object().unwrap().keys().cloned().collect();
        keys.sort();
        assert_eq!(
            keys,
            ["bufferSize", "input", "output", "sampleRate", "type"]
        );
        std::fs::write(&file, "{ not json").unwrap();
        assert_eq!(load_audio_device(&file), None, "Damaged file is ignored");
        let mut incomplete = remembered;
        incomplete["output"] = json!("");
        std::fs::write(&file, incomplete.to_string()).unwrap();
        assert_eq!(load_audio_device(&file), None, "Incomplete entry ignored");
        let _ = std::fs::remove_dir_all(folder);
    }

    fn decode(hex: &str) -> Value {
        let bytes: Vec<u8> = (0..hex.len())
            .step_by(2)
            .map(|i| u8::from_str_radix(&hex[i..i + 2], 16).unwrap())
            .collect();
        serde_json::from_slice(&bytes).unwrap()
    }

    #[test]
    fn launch_opens_the_remembered_device_with_input_only_for_an_armed_audio_track() {
        let folder = std::env::temp_dir().join(format!("basement-launch-{}", uuid::Uuid::new_v4()));
        std::fs::create_dir_all(&folder).unwrap();
        let device = folder.join("audio-device.json");
        let recovery = folder.join("recovery.json");
        let remembered = json!({
            "type": "Windows Audio", "output": "Lautsprecher (Realtek®)", "input": "Mikrofon",
            "sampleRate": 48000, "bufferSize": 480
        });
        assert!(
            startup_arguments(Some(&device), Some(&recovery)).is_empty(),
            "No remembered device: the engine opens the default output"
        );
        save_audio_device(&device, &remembered).unwrap();
        let arguments = startup_arguments(Some(&device), Some(&recovery));
        assert_eq!(arguments.len(), 2, "No recovery: output only");
        assert_eq!(arguments[0], "--device");
        assert!(arguments[1].bytes().all(|b| b.is_ascii_hexdigit()));
        assert_eq!(decode(&arguments[1]), remembered);

        let session = |tracks: Value| {
            std::fs::write(&recovery, json!({ "tracks": tracks }).to_string()).unwrap()
        };
        session(json!([{ "kind": "audio", "armed": false, "monitor": true }]));
        assert_eq!(
            startup_arguments(Some(&device), Some(&recovery)).len(),
            2,
            "Restoring turns monitoring off, so it does not open the input"
        );
        session(json!([{ "kind": "midi", "armed": true }]));
        assert_eq!(startup_arguments(Some(&device), Some(&recovery)).len(), 2);
        session(json!([{ "kind": "midi", "armed": true }, { "kind": "audio", "armed": true }]));
        assert_eq!(
            startup_arguments(Some(&device), Some(&recovery))
                .last()
                .map(String::as_str),
            Some("--listening")
        );
        assert_eq!(
            startup_arguments(Some(&device), None).len(),
            2,
            "Without recovery there is no session to listen for"
        );
        let _ = std::fs::remove_dir_all(folder);
    }
}
