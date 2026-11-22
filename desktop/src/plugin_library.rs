//! The Sound library: scanned VST3 plug-ins, favourites, recents and saved
//! track presets, stored in `sound-library.json` in the user-data folder.

use crate::history::{PLUGIN_SETTINGS, PRESET_SOUND_SETTINGS};
use crate::json::{op, truthy};
use crate::native_client::NativeClient;
use crate::session_files::write_json_atomically;
use crate::session_service::Requester;
use crate::starter_sounds::starter_sounds;
use crate::Outcome;
use serde_json::{json, Map, Value};
use std::path::{Path, PathBuf};
use std::sync::{Arc, Mutex};
use std::time::{Duration, SystemTime, UNIX_EPOCH};

#[derive(Default)]
struct State {
    plugins: Vec<Value>,
    presets: Vec<Value>,
    scanning: bool,
    progress: String,
    errors: Vec<String>,
}

/// Receives the library's view whenever a background scan changes it.
pub type LibraryListener = Box<dyn Fn(Value) + Send + Sync>;
type Listener = Arc<Mutex<Option<LibraryListener>>>;

pub struct PluginLibrary {
    file: PathBuf,
    executable: PathBuf,
    roots: Vec<PathBuf>,
    state: Arc<Mutex<State>>,
    /// Serializes writes of the library file.
    writes: Arc<tokio::sync::Mutex<()>>,
    listener: Listener,
}

fn millis(time: SystemTime) -> f64 {
    let since = time.duration_since(UNIX_EPOCH).unwrap_or_default();
    since.as_secs() as f64 * 1000.0 + f64::from(since.subsec_nanos()) / 1e6
}

impl PluginLibrary {
    /// `executable` is the engine, started per plug-in to scan it in isolation.
    pub fn new(directory: &Path, executable: PathBuf, roots: Vec<PathBuf>) -> Self {
        let file = directory.join("sound-library.json");
        let mut state = State::default();
        match std::fs::read_to_string(&file) {
            Ok(raw) => match serde_json::from_str::<Value>(&raw) {
                Ok(data) if data["plugins"].is_array() && data["presets"].is_array() => {
                    state.plugins = data["plugins"].as_array().cloned().unwrap_or_default();
                    state.presets = data["presets"].as_array().cloned().unwrap_or_default();
                }
                Ok(_) => state
                    .errors
                    .push("Could not read saved library: Invalid sound library".into()),
                Err(error) => state
                    .errors
                    .push(format!("Could not read saved library: {error}")),
            },
            Err(error) if error.kind() == std::io::ErrorKind::NotFound => {}
            Err(error) => state
                .errors
                .push(format!("Could not read saved library: {error}")),
        }
        Self {
            file,
            executable,
            roots,
            state: Arc::new(Mutex::new(state)),
            writes: Arc::new(tokio::sync::Mutex::new(())),
            listener: Listener::default(),
        }
    }

    /// Sends the library to `listener` as a scan progresses and finishes.
    pub fn on_change(&self, listener: LibraryListener) {
        *self.listener.lock().unwrap() = Some(listener);
    }

    fn announce(state: &Mutex<State>, listener: &Listener) {
        let view = Self::view_of(&state.lock().unwrap(), None);
        if let Some(listener) = listener.lock().unwrap().as_ref() {
            listener(view);
        }
    }

    fn view(&self, session: Option<Value>) -> Value {
        Self::view_of(&self.state.lock().unwrap(), session)
    }

    fn view_of(state: &State, session: Option<Value>) -> Value {
        let presets: Vec<Value> = state
            .presets
            .iter()
            .map(|p| json!({ "id": p.get("id"), "name": p.get("name"), "kind": p.get("kind") }))
            .collect();
        let starters: Vec<Value> = starter_sounds()
            .iter()
            .map(|s| json!({ "id": s.id, "name": s.name, "hint": s.hint }))
            .collect();
        let mut view = json!({
            "plugins": state.plugins,
            "presets": presets,
            "starters": starters,
            "scanning": state.scanning,
            "progress": state.progress,
            "errors": state.errors,
        });
        if let Some(session) = session {
            view["session"] = session;
        }
        view
    }

    async fn save(
        file: &Path,
        state: &Mutex<State>,
        writes: &tokio::sync::Mutex<()>,
    ) -> Outcome<()> {
        let _turn = writes.lock().await;
        let data = {
            let state = state.lock().unwrap();
            json!({ "plugins": state.plugins, "presets": state.presets })
        };
        write_json_atomically(file, &data, false)
    }

    async fn persist(&self) -> Outcome<()> {
        Self::save(&self.file, &self.state, &self.writes).await
    }

    /// Finds `.vst3` files and bundles under the roots, then asks a separate
    /// engine process about each changed one. A faulty plug-in can crash or
    /// hang only its own scan, never the active recording engine.
    async fn scan(
        file: PathBuf,
        executable: PathBuf,
        roots: Vec<PathBuf>,
        state: Arc<Mutex<State>>,
        writes: Arc<tokio::sync::Mutex<()>>,
        listener: Listener,
    ) {
        let mut files: Vec<PathBuf> = Vec::new();
        fn walk(folder: &Path, depth: usize, files: &mut Vec<PathBuf>) {
            if depth > 12 || files.len() >= 4096 {
                return;
            }
            let Ok(entries) = std::fs::read_dir(folder) else {
                return;
            };
            for entry in entries.flatten() {
                let Ok(kind) = entry.file_type() else {
                    continue;
                };
                if kind.is_symlink() {
                    continue;
                }
                let path = entry.path();
                let name = entry.file_name().to_string_lossy().to_lowercase();
                if name.ends_with(".vst3") {
                    if !files.contains(&path) {
                        files.push(path);
                    }
                } else if kind.is_dir() {
                    walk(&path, depth + 1, files);
                }
            }
        }
        for root in &roots {
            walk(root, 0, &mut files);
        }
        let total = files.len();
        for (index, path) in files.iter().enumerate() {
            let name = path
                .file_name()
                .map(|n| n.to_string_lossy().into_owned())
                .unwrap_or_default();
            let display = path.to_string_lossy().into_owned();
            let stamp = match std::fs::metadata(path).and_then(|m| m.modified()) {
                Ok(time) => millis(time),
                Err(error) => {
                    state
                        .lock()
                        .unwrap()
                        .errors
                        .push(format!("{name}: {error}"));
                    continue;
                }
            };
            {
                let mut s = state.lock().unwrap();
                s.progress = format!("{}/{total}: {name}", index + 1);
                if s.plugins.iter().any(|p| {
                    p["path"].as_str() == Some(display.as_str())
                        && p["stamp"].as_f64() == Some(stamp)
                }) {
                    continue;
                }
            }
            Self::announce(&state, &listener);
            let scanned =
                match NativeClient::spawn(&executable, &["--test-device"], Duration::from_secs(15))
                {
                    Ok(client) => {
                        let result = client
                            .send(json!({ "op": "scanPlugin", "path": display }))
                            .await;
                        client.shutdown();
                        client.kill();
                        result
                    }
                    Err(error) => Err(error.to_string()),
                };
            let mut s = state.lock().unwrap();
            match scanned {
                Ok(Value::Array(found)) => {
                    let previous: Vec<Value> = s
                        .plugins
                        .iter()
                        .filter(|p| p["path"].as_str() == Some(display.as_str()))
                        .cloned()
                        .collect();
                    s.plugins
                        .retain(|p| p["path"].as_str() != Some(display.as_str()));
                    for plugin in found {
                        let uid = crate::json::text_or_empty(plugin.get("uid"));
                        let uid = if plugin.get("uid").is_some() {
                            uid
                        } else {
                            "undefined".into()
                        };
                        let id = format!("{display}:{uid}");
                        let old = previous
                            .iter()
                            .find(|p| p["id"].as_str() == Some(id.as_str()));
                        let mut entry = crate::json::merge(
                            Some(&plugin),
                            &json!({
                                "id": id,
                                "stamp": stamp,
                                "favorite": old.and_then(|o| o.get("favorite")).cloned().unwrap_or(json!(false)),
                                "recent": old.and_then(|o| o.get("recent")).cloned().unwrap_or(json!(0)),
                            }),
                        );
                        if entry.get("uid").is_none() {
                            crate::json::remove(&mut entry, "uid");
                        }
                        s.plugins.push(entry);
                    }
                }
                Ok(other) => s
                    .errors
                    .push(format!("{name}: Unexpected scan reply {other}")),
                Err(error) => s.errors.push(format!("{name}: {error}")),
            }
        }
        if let Err(error) = Self::save(&file, &state, &writes).await {
            state.lock().unwrap().errors.push(error);
        }
        {
            let mut s = state.lock().unwrap();
            s.scanning = false;
            s.progress.clear();
        }
        Self::announce(&state, &listener);
    }

    /// Scans `folder` (besides nothing else) and waits for the result. The UI
    /// path scans in the background; tests use this to observe completion.
    pub async fn scan_folder(&self, folder: PathBuf) -> Value {
        {
            let mut s = self.state.lock().unwrap();
            if s.scanning {
                drop(s);
                return self.view(None);
            }
            s.scanning = true;
            s.errors.clear();
        }
        Self::scan(
            self.file.clone(),
            self.executable.clone(),
            vec![folder],
            self.state.clone(),
            self.writes.clone(),
            self.listener.clone(),
        )
        .await;
        self.view(None)
    }

    fn find_plugin(&self, id: Option<&Value>) -> Outcome<Value> {
        self.state
            .lock()
            .unwrap()
            .plugins
            .iter()
            .find(|p| p.get("id") == id)
            .cloned()
            .ok_or_else(|| "Plug-in no longer exists".to_owned())
    }

    /// One library action. `folder` is an extra scan root chosen in the native
    /// folder picker by the shell; the UI can never supply one.
    pub async fn command(
        &self,
        c: &Value,
        folder: Option<PathBuf>,
        request: &dyn Requester,
    ) -> Outcome {
        match op(c) {
            "list" => Ok(self.view(None)),
            "scan" => {
                let start = {
                    let mut s = self.state.lock().unwrap();
                    let idle = !s.scanning;
                    if idle {
                        s.scanning = true;
                        s.errors.clear();
                    }
                    idle
                };
                if start {
                    let mut roots = self.roots.clone();
                    roots.extend(folder);
                    tokio::spawn(Self::scan(
                        self.file.clone(),
                        self.executable.clone(),
                        roots,
                        self.state.clone(),
                        self.writes.clone(),
                        self.listener.clone(),
                    ));
                }
                Ok(self.view(None))
            }
            "favorite" => {
                {
                    let mut s = self.state.lock().unwrap();
                    let plugin = s
                        .plugins
                        .iter_mut()
                        .find(|p| p.get("id") == c.get("id"))
                        .ok_or("Plug-in no longer exists")?;
                    let favorite = truthy(plugin.get("favorite"));
                    plugin["favorite"] = json!(!favorite);
                }
                self.persist().await?;
                Ok(self.view(None))
            }
            "load" => {
                let plugin = self.find_plugin(c.get("id"))?;
                let mut command = json!({
                    "op": "plugin",
                    "track": c.get("track"),
                    "path": plugin.get("path"),
                    "append": truthy(c.get("append")),
                });
                match plugin.get("uid") {
                    Some(uid) => command["uid"] = uid.clone(),
                    None => crate::json::remove(&mut command, "uid"),
                }
                if c.get("track").is_none() {
                    crate::json::remove(&mut command, "track");
                }
                let session = request.request(command).await?;
                let now = millis(SystemTime::now()).floor();
                if let Some(entry) = self
                    .state
                    .lock()
                    .unwrap()
                    .plugins
                    .iter_mut()
                    .find(|p| p.get("id") == c.get("id"))
                {
                    entry["recent"] = json!(now as u64);
                }
                self.persist().await?;
                Ok(self.view(Some(session)))
            }
            "savePreset" => {
                let snapshot = request.request(json!({ "op": "snapshot" })).await?;
                let track = crate::json::array(&snapshot, "tracks")
                    .iter()
                    .find(|t| t.get("id") == c.get("track"))
                    .cloned()
                    .ok_or("Track no longer exists")?;
                let name: String = c
                    .get("name")
                    .and_then(Value::as_str)
                    .map(|n| n.trim().chars().take(80).collect())
                    .unwrap_or_default();
                if name.is_empty() {
                    return Err("Name your preset first".into());
                }
                let mut settings = Map::new();
                for key in std::iter::once("kind")
                    .chain(PLUGIN_SETTINGS)
                    .chain(PRESET_SOUND_SETTINGS)
                {
                    if let Some(value) = track.get(key) {
                        settings.insert(key.to_owned(), value.clone());
                    }
                }
                self.state.lock().unwrap().presets.push(json!({
                    "id": uuid::Uuid::new_v4().to_string(),
                    "name": name,
                    "kind": track.get("kind"),
                    "settings": settings,
                }));
                self.persist().await?;
                Ok(self.view(None))
            }
            "applyPreset" => {
                let wanted = c.get("id").and_then(Value::as_str).unwrap_or_default();
                let settings = starter_sounds()
                    .iter()
                    .find(|s| s.id == wanted)
                    .map(|s| s.settings.clone())
                    .or_else(|| {
                        self.state
                            .lock()
                            .unwrap()
                            .presets
                            .iter()
                            .find(|p| p.get("id") == c.get("id"))
                            .map(|p| p.get("settings").cloned().unwrap_or(Value::Null))
                    })
                    .ok_or("Preset no longer exists")?;
                let session = request
                    .request(json!({
                        "op": "preset",
                        "track": c.get("track"),
                        "preset": settings.to_string(),
                    }))
                    .await?;
                Ok(self.view(Some(session)))
            }
            "deletePreset" => {
                self.state
                    .lock()
                    .unwrap()
                    .presets
                    .retain(|p| p.get("id") != c.get("id"));
                self.persist().await?;
                Ok(self.view(None))
            }
            _ => Err("Unknown library action".into()),
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[tokio::test]
    async fn a_finished_scan_announces_the_library() {
        let folder =
            std::env::temp_dir().join(format!("basement-library-{}", uuid::Uuid::new_v4()));
        std::fs::create_dir_all(&folder).unwrap();
        let library = PluginLibrary::new(&folder, PathBuf::from("no-engine"), Vec::new());
        let (sender, mut received) = tokio::sync::mpsc::unbounded_channel();
        library.on_change(Box::new(move |view| {
            let _ = sender.send(view);
        }));
        library.scan_folder(folder.clone()).await;
        let view = received.recv().await.unwrap();
        assert_eq!(view["scanning"], json!(false));
        assert_eq!(view["plugins"], json!([]));
        let _ = std::fs::remove_dir_all(&folder);
    }
}
