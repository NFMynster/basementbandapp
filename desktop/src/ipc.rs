//! The UI's desktop actions. Paths only ever come from native dialogs or a
//! native file drop, never from the UI, which cannot touch the filesystem.

use crate::contract::{library_allowed, renderer_allowed};
use crate::json::{array, find_by_id, truthy};
use crate::paths::{has_extension, stem};
use crate::plugin_library::PluginLibrary;
use crate::session_service::Requester;
use crate::{BoxFuture, Outcome};
use serde_json::{json, Value};
use std::path::{Path, PathBuf};

const AUDIO_EXTENSIONS: [&str; 5] = ["wav", "aif", "aiff", "flac", "mp3"];
const MIDI_EXTENSIONS: [&str; 2] = ["mid", "midi"];
const SESSION_FILTER: (&str, &[&str]) = ("Basement Band session", &["basement"]);

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum DialogKind {
    OpenFile,
    OpenFolder,
    SaveFile,
}

/// A native file dialog, described so tests can check what would be asked.
#[derive(Debug, Clone)]
pub struct DialogRequest {
    pub kind: DialogKind,
    pub title: Option<String>,
    pub filters: Vec<(String, Vec<String>)>,
    pub folder: Option<PathBuf>,
    pub file_name: Option<String>,
}

impl DialogRequest {
    fn new(kind: DialogKind) -> Self {
        Self {
            kind,
            title: None,
            filters: Vec::new(),
            folder: None,
            file_name: None,
        }
    }
    fn title(mut self, title: &str) -> Self {
        self.title = Some(title.into());
        self
    }
    fn filter(mut self, (name, extensions): (&str, &[&str])) -> Self {
        self.filters.push((
            name.into(),
            extensions.iter().map(|e| (*e).to_owned()).collect(),
        ));
        self
    }
}

pub trait Dialogs: Send + Sync {
    /// The chosen path, or `None` when cancelled.
    fn pick(&self, request: DialogRequest) -> BoxFuture<'_, Option<PathBuf>>;
}

/// Where VST3 plug-ins live on this platform, and the user's home.
pub struct PluginFolders {
    pub home: PathBuf,
    pub roots: Vec<PathBuf>,
}

impl PluginFolders {
    pub fn system(home: PathBuf) -> Self {
        let roots = if cfg!(windows) {
            let common = std::env::var_os("CommonProgramFiles")
                .map(PathBuf::from)
                .unwrap_or_else(|| PathBuf::from("C:/Program Files/Common Files"));
            let local = std::env::var_os("LOCALAPPDATA")
                .map(PathBuf::from)
                .unwrap_or_else(|| home.clone());
            vec![common.join("VST3"), local.join("Programs/Common/VST3")]
        } else if cfg!(target_os = "macos") {
            vec![
                PathBuf::from("/Library/Audio/Plug-Ins/VST3"),
                home.join("Library/Audio/Plug-Ins/VST3"),
            ]
        } else {
            vec![
                PathBuf::from("/usr/lib/vst3"),
                PathBuf::from("/usr/local/lib/vst3"),
                home.join(".vst3"),
            ]
        };
        Self { home, roots }
    }

    /// Where the "choose a plug-in" dialog starts.
    pub fn dialog_start(&self) -> PathBuf {
        if cfg!(target_os = "macos") {
            PathBuf::from("/Library/Audio/Plug-Ins/VST3")
        } else {
            self.home.clone()
        }
    }
}

fn path_text(path: &Path) -> String {
    path.to_string_lossy().into_owned()
}

fn require_track<'a>(state: &'a Value, id: Option<&Value>) -> Outcome<Option<&'a Value>> {
    let track = find_by_id(array(state, "tracks"), id);
    if id.is_some() && track.is_none() {
        return Err("Track no longer exists".into());
    }
    Ok(track)
}

fn optional(value: Option<Value>) -> Option<Value> {
    value.filter(|v| !v.is_null())
}

async fn state(request: &dyn Requester) -> Outcome {
    request.request(json!({ "op": "state" })).await
}

async fn remove_created_track(request: &dyn Requester, track: Option<&Value>, state: &Value) {
    if let Some(track) = track {
        if !truthy(state.get("playing")) {
            let _ = request
                .request(json!({ "op": "removeTrack", "track": track }))
                .await;
        }
    }
}

/// A UI command. On macOS, recording or opening an input needs microphone
/// permission first; `microphone` asks for it.
pub async fn command<F, Fut>(
    request: &dyn Requester,
    command: Value,
    microphone: Option<F>,
) -> Outcome
where
    F: FnOnce() -> Fut,
    Fut: std::future::Future<Output = bool>,
{
    let op = crate::json::op(&command).to_owned();
    if !renderer_allowed(&op) {
        return Err("Unknown command".into());
    }
    if let Some(microphone) = microphone {
        if op == "record" || op == "configure" {
            let needs_input = if op == "configure" {
                truthy(command.get("input"))
            } else {
                array(&state(request).await?, "tracks").iter().any(|t| {
                    truthy(t.get("armed")) && t.get("kind").and_then(Value::as_str) != Some("midi")
                })
            };
            if needs_input && !microphone().await {
                return Err("Allow microphone access in System Settings, then restart the app to record audio.".into());
            }
        }
    }
    request.request(command).await
}

pub async fn sound_library(
    library: &PluginLibrary,
    dialogs: &dyn Dialogs,
    request: &dyn Requester,
    command: Value,
) -> Outcome {
    let op = crate::json::op(&command);
    if !library_allowed(op) {
        return Err("Unknown library action".into());
    }
    if op == "scanFolder" {
        let folder = dialogs
            .pick(DialogRequest::new(DialogKind::OpenFolder).title("Scan plug-in folder"))
            .await;
        return match folder {
            None => {
                library
                    .command(&json!({ "op": "list" }), None, request)
                    .await
            }
            Some(folder) => {
                library
                    .command(&json!({ "op": "scan" }), Some(folder), request)
                    .await
            }
        };
    }
    // Scan paths come only from the system locations or the native folder picker.
    library.command(&command, None, request).await
}

pub async fn save(request: &dyn Requester, dialogs: &dyn Dialogs) -> Outcome {
    let state = state(request).await?;
    let title: String = state
        .get("title")
        .and_then(Value::as_str)
        .unwrap_or_default()
        .chars()
        .map(|c| if "<>:\"/\\|?*".contains(c) { '_' } else { c })
        .collect();
    let mut dialog = DialogRequest::new(DialogKind::SaveFile)
        .title("Save session")
        .filter(SESSION_FILTER);
    dialog.file_name = Some(format!(
        "{}.basement",
        if title.is_empty() { "Untitled" } else { &title }
    ));
    match dialogs.pick(dialog).await {
        None => Ok(Value::Null),
        Some(path) => {
            request
                .request(json!({ "op": "save", "path": path_text(&path) }))
                .await
        }
    }
}

pub async fn open(request: &dyn Requester, dialogs: &dyn Dialogs) -> Outcome {
    let dialog = DialogRequest::new(DialogKind::OpenFile).filter(SESSION_FILTER);
    match dialogs.pick(dialog).await {
        None => Ok(Value::Null),
        Some(path) => {
            request
                .request(json!({ "op": "open", "path": path_text(&path) }))
                .await
        }
    }
}

fn valid_position(position: &Option<Value>) -> Outcome<()> {
    match position {
        None => Ok(()),
        Some(value) if value.as_f64().is_some_and(|p| p.is_finite() && p >= 0.0) => Ok(()),
        Some(_) => Err("Invalid import position".into()),
    }
}

pub async fn import(
    request: &dyn Requester,
    dialogs: &dyn Dialogs,
    track: Option<Value>,
    position: Option<Value>,
) -> Outcome {
    let (track, position) = (optional(track), optional(position));
    let state = state(request).await?;
    if truthy(state.get("recording")) {
        return Err("Stop recording before importing".into());
    }
    let target = require_track(&state, track.as_ref())?;
    valid_position(&position)?;
    let midi = target.and_then(|t| t.get("kind")).and_then(Value::as_str) == Some("midi");
    let dialog = DialogRequest::new(DialogKind::OpenFile).filter(if midi {
        ("MIDI", &MIDI_EXTENSIONS[..])
    } else {
        ("Audio", &AUDIO_EXTENSIONS[..])
    });
    let Some(file) = dialogs.pick(dialog).await else {
        return Ok(Value::Null);
    };
    let mut created_track = None;
    let track = match track {
        Some(track) => track,
        None => {
            let next = request
                .request(json!({ "op": "addTrack", "kind": "audio" }))
                .await?;
            let id = array(&next, "tracks")
                .last()
                .and_then(|t| t.get("id"))
                .cloned()
                .ok_or("The new track could not be created")?;
            created_track = Some(id.clone());
            id
        }
    };
    let result = async {
        if created_track.is_some() {
            request
                .request(json!({ "op": "track", "track": track, "name": stem(&file) }))
                .await?;
        }
        let mut command = json!({ "op": "import", "track": track, "path": path_text(&file) });
        if let Some(position) = &position {
            command["position"] = position.clone();
        }
        request.request(command).await
    }
    .await;
    if result.is_err() {
        remove_created_track(request, created_track.as_ref(), &state).await;
    }
    result
}

pub async fn plugin(
    request: &dyn Requester,
    dialogs: &dyn Dialogs,
    folders: &PluginFolders,
    track: Value,
    bundle: bool,
    append: bool,
) -> Outcome {
    let mut dialog = DialogRequest::new(if bundle {
        DialogKind::OpenFolder
    } else {
        DialogKind::OpenFile
    })
    .title(if bundle {
        "Choose a VST3 bundle folder"
    } else {
        "Choose a VST3 plugin"
    })
    .filter(("VST3 plugin", &["vst3"]));
    dialog.folder = Some(folders.dialog_start());
    let Some(path) = dialogs.pick(dialog).await else {
        return Ok(Value::Null);
    };
    let mut command = json!({ "op": "plugin", "track": track, "path": path_text(&path) });
    if append {
        command["append"] = json!(true);
    }
    request.request(command).await
}

fn media_kind(file: &str) -> Outcome<&'static str> {
    if has_extension(file, &MIDI_EXTENSIONS) {
        Ok("midi")
    } else if has_extension(file, &AUDIO_EXTENSIONS) {
        Ok("audio")
    } else {
        Err("Drop audio or MIDI files on the arrangement; VST3 plug-ins belong in Plug-ins".into())
    }
}

/// Files dropped on the arrangement, a track lane, or (with `plugin`) a
/// track's plug-in chain. The caller has already matched `paths` against the
/// native drop, so they are files the user actually dragged in.
pub async fn drop_files(
    request: &dyn Requester,
    paths: Vec<String>,
    track: Option<Value>,
    plugin: bool,
) -> Outcome {
    let track = optional(track);
    if paths.is_empty() || paths.len() > 32 || paths.iter().any(|p| !Path::new(p).is_absolute()) {
        return Err("Invalid dropped files".into());
    }
    if plugin {
        if paths.len() != 1 || !has_extension(&paths[0], &["vst3"]) {
            return Err("Drop one VST3 file or bundle here".into());
        }
        let state = state(request).await?;
        let target = require_track(&state, track.as_ref())?;
        let mut command = json!({ "op": "plugin", "track": track, "path": paths[0] });
        if target.is_some_and(|t| truthy(t.get("pluginName"))) {
            command["append"] = json!(true);
        }
        return request.request(command).await;
    }
    let mut state = state(request).await?;
    if truthy(state.get("recording")) {
        return Err("Stop recording before importing".into());
    }
    require_track(&state, track.as_ref())?;
    for file in &paths {
        let kind = media_kind(file)?;
        let target = find_by_id(array(&state, "tracks"), track.as_ref()).cloned();
        if let Some(target) = &target {
            let target_kind = target
                .get("kind")
                .and_then(Value::as_str)
                .unwrap_or("audio");
            if target_kind != kind {
                return Err("Drop this file on a matching audio or MIDI track".into());
            }
        }
        let created = target.is_none();
        let track_id = match target {
            Some(target) => target.get("id").cloned().unwrap_or(Value::Null),
            None => {
                state = request
                    .request(json!({ "op": "addTrack", "kind": kind }))
                    .await?;
                let id = array(&state, "tracks")
                    .last()
                    .and_then(|t| t.get("id"))
                    .cloned()
                    .ok_or("The new track could not be created")?;
                request
                    .request(json!({ "op": "track", "track": id, "name": stem(Path::new(file)) }))
                    .await?;
                id
            }
        };
        match request
            .request(json!({ "op": "import", "track": track_id, "path": file }))
            .await
        {
            Ok(next) => state = next,
            Err(error) => {
                remove_created_track(request, created.then_some(&track_id), &state).await;
                return Err(error);
            }
        }
    }
    Ok(state)
}

pub async fn export(request: &dyn Requester, dialogs: &dyn Dialogs, options: Value) -> Outcome {
    let text = |key: &str| options.get(key).filter(|v| !v.is_null());
    let one_of = |key: &str, allowed: &[&str]| {
        text(key).is_none_or(|v| v.as_str().is_some_and(|s| allowed.contains(&s)))
    };
    if !options.is_object()
        || !text("mode")
            .and_then(Value::as_str)
            .is_some_and(|m| ["separate", "mix"].contains(&m))
        || !one_of("format", &["wav", "flac"])
        || !one_of("midi", &["audio", "midi"])
        || text("track").is_some_and(|t| !t.is_string())
    {
        return Err("Invalid export options".into());
    }
    let mut dialog = DialogRequest::new(DialogKind::OpenFolder).title("Choose export folder");
    dialog.file_name = None;
    let Some(folder) = dialogs.pick(dialog).await else {
        return Ok(Value::Null);
    };
    let mut command = json!({
        "op": "export",
        "path": path_text(&folder),
        "mode": options["mode"],
        "format": text("format").cloned().unwrap_or(json!("wav")),
        "midi": text("midi").cloned().unwrap_or(json!("audio")),
    });
    if let Some(track) = text("track") {
        command["track"] = track.clone();
    }
    request.request(command).await
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::sync::Mutex;

    struct FakeSession {
        commands: Mutex<Vec<Value>>,
    }

    impl Requester for FakeSession {
        fn request(&self, command: Value) -> BoxFuture<'_, Outcome> {
            Box::pin(async move {
                if crate::json::op(&command) == "state" {
                    return Ok(json!({ "tracks": [{ "id": "g", "kind": "audio" }] }));
                }
                self.commands.lock().unwrap().push(command.clone());
                Ok(command)
            })
        }
    }

    struct FakeDialogs {
        canceled: bool,
        asked: Mutex<Vec<DialogRequest>>,
    }

    impl Dialogs for FakeDialogs {
        fn pick(&self, request: DialogRequest) -> BoxFuture<'_, Option<PathBuf>> {
            self.asked.lock().unwrap().push(request);
            let canceled = self.canceled;
            Box::pin(async move { (!canceled).then(|| PathBuf::from("chosen-path")) })
        }
    }

    #[tokio::test]
    async fn file_dialogs_feed_paths_and_validate_options() {
        let session = FakeSession {
            commands: Mutex::new(vec![]),
        };
        let dialogs = FakeDialogs {
            canceled: false,
            asked: Mutex::new(vec![]),
        };
        let folders = PluginFolders::system(PathBuf::from("user-home"));
        let g = json!("g");
        let opened = open(&session, &dialogs).await.unwrap();
        assert_eq!(
            (opened["op"].clone(), opened["path"].clone()),
            (json!("open"), json!("chosen-path"))
        );
        let plugged = plugin(&session, &dialogs, &folders, g.clone(), false, false)
            .await
            .unwrap();
        assert_eq!(plugged["path"], "chosen-path");
        let vst_dialog = dialogs.asked.lock().unwrap().last().cloned().unwrap();
        assert_eq!(
            vst_dialog.folder,
            Some(if cfg!(target_os = "macos") {
                PathBuf::from("/Library/Audio/Plug-Ins/VST3")
            } else {
                PathBuf::from("user-home")
            })
        );
        let imported = import(&session, &dialogs, Some(g.clone()), None)
            .await
            .unwrap();
        assert_eq!(imported["op"], "import");
        let exported = export(
            &session,
            &dialogs,
            json!({ "mode": "separate", "track": "g" }),
        )
        .await
        .unwrap();
        assert_eq!(
            (exported["op"].clone(), exported["format"].clone()),
            (json!("export"), json!("wav"))
        );
        assert_eq!(dialogs.asked.lock().unwrap().len(), 4);
        assert!(export(&session, &dialogs, json!({ "mode": "invalid" }))
            .await
            .is_err());
        assert!(export(
            &session,
            &dialogs,
            json!({ "mode": "separate", "midi": "invalid" })
        )
        .await
        .is_err());
        let midi = export(
            &session,
            &dialogs,
            json!({ "mode": "separate", "midi": "midi", "track": "g" }),
        )
        .await
        .unwrap();
        assert_eq!(midi["midi"], "midi");
        let canceled = FakeDialogs {
            canceled: true,
            asked: Mutex::new(vec![]),
        };
        assert_eq!(
            plugin(&session, &canceled, &folders, g, false, false)
                .await
                .unwrap(),
            Value::Null
        );
        assert_eq!(session.commands.lock().unwrap().len(), 5);
    }

    #[tokio::test]
    async fn commands_are_limited_to_the_renderer_contract() {
        let session = FakeSession {
            commands: Mutex::new(vec![]),
        };
        let no_microphone: Option<fn() -> std::future::Ready<bool>> = None;
        assert!(command(&session, json!({ "op": "pump" }), no_microphone)
            .await
            .is_err());
        assert!(command(
            &session,
            json!({ "op": "plugin", "path": "x" }),
            no_microphone
        )
        .await
        .is_err());
        assert!(command(
            &session,
            json!({ "op": "seek", "position": 1 }),
            no_microphone
        )
        .await
        .is_ok());
        let denied = Some(|| std::future::ready(false));
        let configure = json!({ "op": "configure", "input": "Mic" });
        assert!(command(&session, configure, denied)
            .await
            .unwrap_err()
            .contains("microphone"));
    }

    #[tokio::test]
    async fn drops_reject_relative_paths_and_wrong_file_types() {
        let session = FakeSession {
            commands: Mutex::new(vec![]),
        };
        assert!(
            drop_files(&session, vec!["relative.wav".into()], None, false)
                .await
                .is_err()
        );
        let absolute = std::env::temp_dir()
            .join("riff.txt")
            .to_string_lossy()
            .into_owned();
        assert!(drop_files(&session, vec![absolute.clone()], None, false)
            .await
            .unwrap_err()
            .contains("VST3"));
        assert!(drop_files(&session, vec![absolute], Some(json!("g")), true)
            .await
            .unwrap_err()
            .contains("VST3"));
    }
}
