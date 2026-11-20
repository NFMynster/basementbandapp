//! Remembers the audio device chosen in Settings between launches. The file
//! lives in the app's user-data folder; a missing or damaged file just means
//! the default device, as on first launch.

use crate::session_files::write_json_atomically;
use serde_json::{json, Value};
use std::path::Path;

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
}
