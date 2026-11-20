//! Reads the command contract from `desktop/commands.json`, the single list of
//! engine ops with their domain, sender and undo/recovery policy.

use serde::Deserialize;
use serde_json::Value;
use std::collections::HashMap;
use std::sync::OnceLock;

#[derive(Debug, Clone, Default, Deserialize)]
pub struct Route {
    pub domain: String,
    pub sender: String,
    /// `true`, or `"by-action"` when only some editClip actions are undoable.
    #[serde(default)]
    pub undoable: Option<Value>,
    #[serde(default)]
    pub edits: bool,
    #[serde(default)]
    pub gesture: bool,
    #[serde(default)]
    pub query: bool,
}

impl Route {
    pub fn always_undoable(&self) -> bool {
        self.undoable == Some(Value::Bool(true))
    }
    pub fn undoable_by_action(&self) -> bool {
        self.undoable.as_ref().and_then(Value::as_str) == Some("by-action")
    }
}

#[derive(Debug, Deserialize)]
pub struct Contract {
    pub engine: HashMap<String, Route>,
    pub library: Vec<String>,
}

pub fn contract() -> &'static Contract {
    static CONTRACT: OnceLock<Contract> = OnceLock::new();
    CONTRACT.get_or_init(|| {
        serde_json::from_str(include_str!("../commands.json"))
            .expect("desktop/commands.json is valid")
    })
}

/// The policy of an op; unknown ops get no flags, as in the engine router.
pub fn policy(op: &str) -> Route {
    contract().engine.get(op).cloned().unwrap_or_default()
}

/// Ops the UI may send through the `command` channel.
pub fn renderer_allowed(op: &str) -> bool {
    contract()
        .engine
        .get(op)
        .is_some_and(|route| route.sender == "renderer")
}

pub fn library_allowed(op: &str) -> bool {
    contract().library.iter().any(|known| known == op)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn contract_parses_and_scopes_senders() {
        assert!(renderer_allowed("track"));
        assert!(!renderer_allowed("plugin"), "paths come from the shell");
        assert!(!renderer_allowed("pump"), "test-only");
        assert!(!renderer_allowed("nonsense"));
        assert!(policy("track").gesture);
        assert!(policy("editClip").undoable_by_action());
        assert!(policy("state").query);
        assert!(library_allowed("scanFolder"));
    }
}
