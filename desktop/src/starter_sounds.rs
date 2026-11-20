//! Factory track presets from `desktop/starter-sounds.json`.

use serde_json::{Map, Value};
use std::sync::OnceLock;

#[derive(Debug, Clone)]
pub struct StarterSound {
    pub id: String,
    pub name: String,
    pub hint: String,
    /// The complete preset: `base` first, then the starter's own values.
    pub settings: Value,
}

pub fn starter_sounds() -> &'static [StarterSound] {
    static STARTERS: OnceLock<Vec<StarterSound>> = OnceLock::new();
    STARTERS.get_or_init(|| {
        let file: Value = serde_json::from_str(include_str!("../starter-sounds.json"))
            .expect("desktop/starter-sounds.json is valid");
        let base = file["base"].as_object().cloned().unwrap_or_default();
        file["starters"]
            .as_array()
            .expect("starters list")
            .iter()
            .map(|starter| {
                let mut settings: Map<String, Value> = base.clone();
                for (key, value) in starter["settings"].as_object().into_iter().flatten() {
                    settings.insert(key.clone(), value.clone());
                }
                let text = |key: &str| starter[key].as_str().unwrap_or_default().to_owned();
                StarterSound {
                    id: text("id"),
                    name: text("name"),
                    hint: text("hint"),
                    settings: Value::Object(settings),
                }
            })
            .collect()
    })
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn starters_are_audio_presets_without_volume() {
        let ids: Vec<_> = starter_sounds().iter().map(|s| s.id.as_str()).collect();
        assert_eq!(
            ids,
            [
                "starter-clean",
                "starter-crunch",
                "starter-lead",
                "starter-bass"
            ]
        );
        for starter in starter_sounds() {
            assert_eq!(starter.settings["kind"], "audio");
            assert_eq!(starter.settings["bypass"], false);
            assert!(starter.settings.get("gain").is_none());
            assert!(starter.settings.get("pan").is_none());
        }
        assert_eq!(starter_sounds()[0].settings["eqTreble"], 2);
    }
}
