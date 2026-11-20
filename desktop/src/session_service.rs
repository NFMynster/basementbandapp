//! Owns the open session between the UI and the engine: one ordered command
//! queue, slider-gesture coalescing, undo/redo, recovery and save/open.

use crate::audio_device::{device_configuration, load_audio_device, save_audio_device};
use crate::contract::policy;
use crate::history::{
    apply_history_entry, edit_description, global_edit, history_fingerprint, is_undoable,
    owned_track_keys, HistoryEntry,
};
use crate::json::{array, merge, op, remove, text_or_empty, truthy};
use crate::native_client::Engine;
use crate::session_files::{validate, write_json_atomically, CURRENT_SESSION_VERSION};
use crate::session_storage::{prepare_for_restore, read_session, save_session};
use crate::{BoxFuture, Outcome};
use serde_json::{json, Value};
use std::collections::HashMap;
use std::future::Future;
use std::path::{Path, PathBuf};
use std::pin::Pin;
use std::sync::atomic::{AtomicBool, Ordering};
use std::sync::{Arc, Mutex, OnceLock};
use std::task::{Context, Poll};
use tokio::sync::{mpsc, oneshot};

const RECOVERY_FILE: &str = "recovery.json";
const MAX_UNDO_STEPS: usize = 30;
/// Lifecycle moments that always refresh recovery, including desktop-only
/// save/open, which never reach the engine as commands.
const CHECKPOINT_COMMANDS: [&str; 4] = ["stop", "save", "new", "open"];
/// Edits whose "before" must come from the engine, not the cached snapshot.
const UNCACHED_BEFORE: [&str; 7] = [
    "removeTrack",
    "reorderTrack",
    "plugin",
    "removePlugin",
    "preset",
    "reorderEffect",
    "duplicateTrack",
];
/// Edits that change processor state, so their "after" needs full state.
const FULL_AFTER: [&str; 5] = [
    "plugin",
    "removePlugin",
    "preset",
    "reorderEffect",
    "duplicateTrack",
];
const RELOAD_PLUGINS: [&str; 4] = ["plugin", "removePlugin", "preset", "reorderEffect"];

/// Sends one command to the session; implemented by the service and by the
/// fakes the desktop handlers are tested with.
pub trait Requester: Send + Sync {
    fn request(&self, command: Value) -> BoxFuture<'_, Outcome>;
}

pub struct Options {
    /// Restore and write `recovery.json` in the sessions folder.
    pub recover: bool,
    /// Remembers the audio device chosen in Settings.
    pub device_file: Option<PathBuf>,
}

impl Default for Options {
    fn default() -> Self {
        Self {
            recover: true,
            device_file: None,
        }
    }
}

enum JobKind {
    Command,
    Close,
}

struct JobState {
    command: Option<Value>,
    waiters: Vec<oneshot::Sender<Outcome>>,
}

struct Job {
    /// Set for slider gestures that may still absorb newer values.
    key: Option<String>,
    kind: JobKind,
    state: Mutex<JobState>,
}

/// The reply to a queued request.
pub struct Reply(oneshot::Receiver<Outcome>);

impl Future for Reply {
    type Output = Outcome;
    fn poll(mut self: Pin<&mut Self>, cx: &mut Context<'_>) -> Poll<Outcome> {
        Pin::new(&mut self.0)
            .poll(cx)
            .map(|result| result.unwrap_or_else(|_| Err("The session closed.".into())))
    }
}

pub type EngineFuture = BoxFuture<'static, Result<Arc<dyn Engine>, String>>;

pub struct SessionService {
    jobs: mpsc::UnboundedSender<Arc<Job>>,
    /// The newest gesture that has not started yet, guarded together with
    /// each job's command so coalescing never races the worker.
    gesture: Arc<Mutex<Option<Arc<Job>>>>,
    engine: Arc<OnceLock<Arc<dyn Engine>>>,
    closed: AtomicBool,
}

impl SessionService {
    /// Starts the queue. `engine` resolves once the engine process is up
    /// (after the macOS microphone prompt); requests queue until then and
    /// fail with its error if it cannot start.
    pub fn start(engine: EngineFuture, directory: PathBuf, options: Options) -> Arc<Self> {
        let (jobs, mut receiver) = mpsc::unbounded_channel::<Arc<Job>>();
        let gesture: Arc<Mutex<Option<Arc<Job>>>> = Arc::new(Mutex::new(None));
        let engine_slot: Arc<OnceLock<Arc<dyn Engine>>> = Arc::new(OnceLock::new());
        let worker_gesture = gesture.clone();
        let worker_slot = engine_slot.clone();
        tokio::spawn(async move {
            let mut session = None;
            let ready: Result<(), String> = async {
                let engine = engine.await?;
                let _ = worker_slot.set(engine.clone());
                let mut state = Session::new(engine, directory, options);
                state.initialize().await?;
                session = Some(state);
                Ok(())
            }
            .await;
            if let Err(error) = &ready {
                log::error!("Audio startup failed {error}");
            }
            while let Some(job) = receiver.recv().await {
                let command = {
                    let mut pending = worker_gesture.lock().unwrap();
                    if pending.as_ref().is_some_and(|p| Arc::ptr_eq(p, &job)) {
                        *pending = None;
                    }
                    job.state.lock().unwrap().command.take()
                };
                let result = match (&ready, session.as_mut()) {
                    (Err(error), _) => Err(error.clone()),
                    (Ok(()), Some(session)) => match job.kind {
                        JobKind::Command => session.execute(command.unwrap_or_default()).await,
                        JobKind::Close => session.close().await,
                    },
                    (Ok(()), None) => Err("The session is not ready.".into()),
                };
                let waiters = std::mem::take(&mut job.state.lock().unwrap().waiters);
                for waiter in waiters {
                    let _ = waiter.send(result.clone());
                }
            }
        });
        Arc::new(Self {
            jobs,
            gesture,
            engine: engine_slot,
            closed: AtomicBool::new(false),
        })
    }

    /// Queues a command now and returns its reply. Keeps only the newest
    /// waiting value in a continuous slider gesture: commands already
    /// executing finish normally, and other requests remain barriers.
    pub fn request(&self, command: Value) -> Reply {
        let (sender, receiver) = oneshot::channel();
        let key = gesture_key(&command);
        let mut pending = self.gesture.lock().unwrap();
        if let (Some(key), Some(job)) = (&key, pending.as_ref()) {
            if job.key.as_ref() == Some(key) {
                let mut state = job.state.lock().unwrap();
                state.command = Some(command);
                state.waiters.push(sender);
                return Reply(receiver);
            }
        }
        let job = Arc::new(Job {
            key: key.clone(),
            kind: JobKind::Command,
            state: Mutex::new(JobState {
                command: Some(command),
                waiters: vec![sender],
            }),
        });
        *pending = key.map(|_| job.clone());
        drop(pending);
        let _ = self.jobs.send(job);
        Reply(receiver)
    }

    /// Stops the transport, writes recovery and ends the engine. Repeating it
    /// after success is a no-op; after a failure it can be retried.
    pub async fn close(&self) -> Outcome<()> {
        if self.closed.load(Ordering::SeqCst) {
            return Ok(());
        }
        let (sender, receiver) = oneshot::channel();
        let job = Arc::new(Job {
            key: None,
            kind: JobKind::Close,
            state: Mutex::new(JobState {
                command: None,
                waiters: vec![sender],
            }),
        });
        *self.gesture.lock().unwrap() = None;
        let _ = self.jobs.send(job);
        Reply(receiver).await?;
        self.closed.store(true, Ordering::SeqCst);
        Ok(())
    }

    /// Ends the engine without preserving the session.
    pub fn abandon(&self) {
        if let Some(engine) = self.engine.get() {
            engine.close();
        }
    }
}

impl Requester for SessionService {
    fn request(&self, command: Value) -> BoxFuture<'_, Outcome> {
        let reply = SessionService::request(self, command);
        Box::pin(reply)
    }
}

impl Requester for Arc<SessionService> {
    fn request(&self, command: Value) -> BoxFuture<'_, Outcome> {
        let reply = SessionService::request(self, command);
        Box::pin(reply)
    }
}

fn gesture_key(command: &Value) -> Option<String> {
    let group = command.get("historyGroup")?.as_str()?;
    if !policy(op(command)).gesture {
        return None;
    }
    let mut keys: Vec<&String> = command.as_object()?.keys().collect();
    keys.sort();
    Some(
        json!([
            op(command),
            command.get("track"),
            command.get("clip"),
            command.get("action"),
            group,
            keys
        ])
        .to_string(),
    )
}

/// The worker's state; only the queue worker touches it.
struct Session {
    engine: Arc<dyn Engine>,
    directory: PathBuf,
    recover: bool,
    device_file: Option<PathBuf>,
    undo_stack: Vec<HistoryEntry>,
    redo_stack: Vec<HistoryEntry>,
    /// Working folder for the open session's new media.
    folder: Option<PathBuf>,
    /// Latest full snapshot, the base for recovery.
    last_snapshot: Option<Value>,
    recovered: bool,
    recovery_error: String,
    recovery_blocked: bool,
    last_history_group: Option<String>,
}

impl Session {
    fn new(engine: Arc<dyn Engine>, directory: PathBuf, options: Options) -> Self {
        Self {
            engine,
            directory,
            recover: options.recover,
            device_file: options.device_file,
            undo_stack: Vec::new(),
            redo_stack: Vec::new(),
            folder: None,
            last_snapshot: None,
            recovered: false,
            recovery_error: String::new(),
            recovery_blocked: false,
            last_history_group: None,
        }
    }

    async fn engine(&self, command: Value) -> Outcome {
        self.engine.request(command).await
    }

    async fn snapshot(&self, metadata_only: Option<bool>) -> Outcome {
        let mut command = json!({ "op": "snapshot" });
        if let Some(metadata_only) = metadata_only {
            command["metadataOnly"] = json!(metadata_only);
        }
        self.engine(command).await
    }

    /// Reapplies the device chosen last time. A device that is gone (unplugged
    /// interface, renamed driver) is retried without its input, then left at
    /// the engine's default, exactly as on a first launch.
    async fn restore_audio_device(&self) {
        let Some(file) = &self.device_file else {
            return;
        };
        let Some(saved) = load_audio_device(file) else {
            return;
        };
        // A failed configure can leave the device closed; keep the launch default.
        let fallback =
            device_configuration(self.engine(json!({ "op": "devices" })).await.ok().as_ref());
        let mut without_input = saved.clone();
        without_input["input"] = json!("");
        for attempt in [saved, without_input] {
            match self
                .engine(merge(Some(&json!({ "op": "configure" })), &attempt))
                .await
            {
                Ok(_) => {
                    log::info!(
                        "Restored audio device {} {}",
                        text_or_empty(attempt.get("type")),
                        text_or_empty(attempt.get("output"))
                    );
                    return;
                }
                Err(error) => {
                    log::error!("Remembered audio device unavailable: {error}");
                    if !truthy(attempt.get("input")) {
                        break;
                    }
                }
            }
        }
        if let Some(fallback) = fallback {
            if let Err(error) = self
                .engine(merge(Some(&json!({ "op": "configure" })), &fallback))
                .await
            {
                log::error!("Default audio device could not be reopened {error}");
            }
        }
    }

    async fn initialize(&mut self) -> Outcome {
        let folder = self.working_directory()?;
        self.folder = Some(folder.clone());
        let mut state = self
            .engine(json!({ "op": "init", "folder": folder.to_string_lossy() }))
            .await?;
        self.restore_audio_device().await;
        if self.recover {
            let file = self.directory.join(RECOVERY_FILE);
            match std::fs::read_to_string(&file) {
                Err(error) if error.kind() == std::io::ErrorKind::NotFound => {}
                Err(error) => {
                    self.last_snapshot = None;
                    self.recovery_error =
                        format!("Previous session could not be restored: {error}");
                }
                Ok(raw) => match self.restore_recovery(&raw, &folder).await {
                    Ok(restored) => {
                        state = restored;
                        self.recovered = true;
                    }
                    Err(error) => {
                        self.last_snapshot = None;
                        self.recovery_error =
                            format!("Previous session could not be restored: {error}");
                        let backup = self
                            .directory
                            .join(format!("recovery-unreadable-{}.json", uuid::Uuid::new_v4()));
                        match std::fs::copy(&file, &backup) {
                            Ok(_) => {
                                self.recovery_error += &format!(
                                    ". Original recovery preserved at {}",
                                    backup.display()
                                );
                            }
                            Err(_) => {
                                self.recovery_blocked = true;
                                self.recovery_error +=
                                    ". Recovery writes disabled to preserve the original file.";
                            }
                        }
                    }
                },
            }
        }
        if self.recover && self.last_snapshot.is_none() {
            self.last_snapshot = Some(self.snapshot(None).await?);
        }
        Ok(state)
    }

    /// Restores the project, but always begins at the start of its timeline.
    /// Native restore also resets transport for explicitly opened projects.
    async fn restore_recovery(&mut self, raw: &str, folder: &Path) -> Outcome {
        let mut session: Value = serde_json::from_str(raw).map_err(|e| e.to_string())?;
        self.last_snapshot = Some(session.clone());
        validate(&session)?;
        prepare_for_restore(&mut session, None)?;
        self.last_snapshot = Some(session.clone());
        self.engine(json!({
            "op": "restore",
            "session": session,
            "folder": folder.to_string_lossy(),
        }))
        .await
    }

    /// Session-shaped replies gain history and recovery flags.
    fn decorate(&self, result: Value) -> Value {
        if !truthy(result.get("tracks")) {
            return result;
        }
        merge(
            Some(&result),
            &json!({
                "canUndo": !self.undo_stack.is_empty(),
                "canRedo": !self.redo_stack.is_empty(),
                "recovered": self.recovered,
                "recoveryError": self.recovery_error,
            }),
        )
    }

    async fn checkpoint(&mut self, snapshot: Option<Value>) -> Outcome<()> {
        if self.recovery_blocked {
            return Err(self.recovery_error.clone());
        }
        let mut current = match snapshot {
            Some(snapshot) => snapshot,
            None => self.snapshot(None).await?,
        };
        if self.recover {
            current["version"] = json!(CURRENT_SESSION_VERSION);
        }
        self.last_snapshot = Some(current.clone());
        if !self.recover {
            return Ok(());
        }
        validate(&current)?;
        write_json_atomically(&self.directory.join(RECOVERY_FILE), &current, false)?;
        self.recovery_error.clear();
        Ok(())
    }

    fn working_directory(&self) -> Outcome<PathBuf> {
        let folder = self.directory.join(uuid::Uuid::new_v4().to_string());
        std::fs::create_dir_all(&folder)
            .map_err(|e| format!("Could not create {}: {e}", folder.display()))?;
        Ok(folder)
    }

    async fn execute(&mut self, mut command: Value) -> Outcome {
        let op = op(&command).to_owned();
        let route = policy(&op);
        let history_group = match command.get("historyGroup").and_then(Value::as_str) {
            Some(group) if route.gesture => Some(format!(
                "{op}:{}:{}:{group}",
                text_or_empty(command.get("track")),
                text_or_empty(command.get("clip"))
            )),
            _ => None,
        };
        let continues_history = history_group.is_some() && history_group == self.last_history_group;
        if !route.query {
            self.last_history_group = None;
        }
        if op == "play" {
            self.last_snapshot = Some(self.snapshot(None).await?);
        }
        if op == "undo" || op == "redo" {
            return self.undo_or_redo(op == "undo").await;
        }
        let editable = route.edits;
        let undoable = is_undoable(&command);
        let mut before: Option<Value> = None;
        if undoable && !continues_history {
            let state = self.engine(json!({ "op": "state" })).await?;
            if !truthy(state.get("recording")) {
                let playing = truthy(state.get("playing"));
                let cached = (!UNCACHED_BEFORE.contains(&op.as_str()) && !playing)
                    .then(|| self.last_snapshot.clone())
                    .flatten()
                    .map(|mut cached| {
                        crate::json::assign(
                            &mut cached,
                            "position",
                            state.get("position").cloned(),
                        );
                        cached
                    });
                let reuse = cached.is_some();
                let mut snapshot = match cached {
                    Some(cached) => cached,
                    None => self.snapshot(Some(playing)).await?,
                };
                if !reuse {
                    self.keep_plugin_state(&mut snapshot);
                }
                before = Some(snapshot);
            }
        }
        let result = self.execute_raw(&mut command).await?;
        if op == "configure" {
            if let Some(file) = &self.device_file {
                if let Err(error) = save_audio_device(file, &result) {
                    log::error!("Audio device could not be remembered {error}");
                }
            }
        }
        if history_group.is_some() {
            self.last_history_group = history_group.clone();
        }
        if let Some(before) = &before {
            let after = self
                .snapshot(Some(!FULL_AFTER.contains(&op.as_str())))
                .await?;
            let recovered_after = recovery_snapshot(&after, before);
            if history_fingerprint(before) != history_fingerprint(&recovered_after) {
                let mut global_keys = Vec::new();
                if let Some(key) = global_edit(&op) {
                    global_keys.push(key.to_owned());
                    if op == "tempo" {
                        global_keys.extend(["loopStart".to_owned(), "loopEnd".to_owned()]);
                    }
                }
                self.undo_stack.push(HistoryEntry {
                    description: edit_description(&command),
                    before: before.clone(),
                    after: recovered_after,
                    track_id: command.get("track").cloned(),
                    track_order: op == "reorderTrack",
                    reload_plugins: RELOAD_PLUGINS.contains(&op.as_str()),
                    global_keys,
                    track_keys: owned_track_keys(&command),
                });
                if self.undo_stack.len() > MAX_UNDO_STEPS {
                    self.undo_stack.remove(0);
                }
                self.redo_stack.clear();
            } else {
                self.last_history_group = None;
            }
        }
        if undoable
            && continues_history
            && !self.undo_stack.is_empty()
            && !truthy(result.get("recording"))
        {
            let after = self.snapshot(Some(true)).await?;
            let latest = self.undo_stack.last_mut().expect("history entry");
            latest.after = recovery_snapshot(&after, &latest.after);
            self.redo_stack.clear();
        }
        if op == "new" || op == "open" {
            self.undo_stack.clear();
            self.redo_stack.clear();
            self.recovered = false;
        }
        if (editable || CHECKPOINT_COMMANDS.contains(&op.as_str()))
            && !truthy(result.get("playing"))
            && !truthy(result.get("recording"))
        {
            let base = before.clone().or_else(|| self.last_snapshot.clone());
            let snapshot = base
                .filter(|_| can_reuse_media(&command))
                .map(|base| recovery_snapshot(&result, &base));
            if let Err(error) = self.checkpoint(snapshot).await {
                self.recovery_error = format!("Recovery could not be saved: {error}");
            }
        }
        Ok(self.decorate(result))
    }

    /// Metadata-only snapshots omit plug-in state; carry the last known state
    /// for tracks whose plug-in did not change.
    fn keep_plugin_state(&self, snapshot: &mut Value) {
        let Some(last) = &self.last_snapshot else {
            return;
        };
        let Some(tracks) = snapshot.get_mut("tracks").and_then(Value::as_array_mut) else {
            return;
        };
        for track in tracks {
            let saved = array(last, "tracks").iter().find(|t| {
                t.get("id") == track.get("id") && t.get("pluginPath") == track.get("pluginPath")
            });
            if track.get("pluginState").is_none() {
                if let Some(state) = saved.and_then(|s| s.get("pluginState")) {
                    track["pluginState"] = state.clone();
                }
            }
        }
    }

    async fn undo_or_redo(&mut self, undo: bool) -> Outcome {
        let state = self.engine(json!({ "op": "state" })).await?;
        if truthy(state.get("playing")) {
            return Err("Stop playback before undo or redo".into());
        }
        let from_empty = if undo {
            self.undo_stack.is_empty()
        } else {
            self.redo_stack.is_empty()
        };
        if from_empty {
            return Ok(self.decorate(state));
        }
        let metadata = self.snapshot(Some(true)).await?;
        let current = match &self.last_snapshot {
            Some(last) => recovery_snapshot(&metadata, last),
            None => metadata,
        };
        let entry = if undo {
            self.undo_stack.last()
        } else {
            self.redo_stack.last()
        }
        .cloned()
        .expect("history entry");
        let target = apply_history_entry(&current, &entry, undo);
        let live_ids: Vec<Option<&Value>> = array(&current, "tracks")
            .iter()
            .map(|t| t.get("id"))
            .collect();
        let mut session = target.clone();
        if let Some(tracks) = session.get_mut("tracks").and_then(Value::as_array_mut) {
            for track in tracks {
                let reload = entry.reload_plugins && track.get("id") == entry.track_id.as_ref();
                if !reload && live_ids.contains(&track.get("id")) {
                    remove(track, "pluginState");
                    if let Some(effects) = track.get_mut("effects").and_then(Value::as_array_mut) {
                        for effect in effects {
                            remove(effect, "state");
                        }
                    }
                }
            }
        }
        let replace = if entry.reload_plugins {
            json!([entry.track_id.clone().unwrap_or(Value::Null)])
        } else {
            json!([])
        };
        self.engine(json!({
            "op": "restore",
            "session": session,
            "folder": self.folder.as_ref().map(|f| f.to_string_lossy().into_owned()),
            "preservePlugins": true,
            "replacePlugins": replace,
        }))
        .await?;
        let mut seek = json!({ "op": "seek" });
        crate::json::assign(&mut seek, "position", current.get("position").cloned());
        let restored = self.engine(seek).await?;
        if undo {
            self.undo_stack.pop();
            self.redo_stack.push(entry.clone());
        } else {
            self.redo_stack.pop();
            self.undo_stack.push(entry.clone());
        }
        if let Err(error) = self
            .checkpoint(Some(recovery_snapshot(&restored, &target)))
            .await
        {
            self.recovery_error = format!("Recovery could not be saved: {error}");
        }
        let mut reply = self.decorate(restored);
        reply["historyNotice"] = json!(format!(
            "{} {}",
            if undo { "Undo" } else { "Redo" },
            entry.description
        ));
        Ok(reply)
    }

    async fn execute_raw(&mut self, command: &mut Value) -> Outcome {
        let path = command
            .get("path")
            .and_then(Value::as_str)
            .map(PathBuf::from);
        match op(command) {
            "save" => {
                let snapshot = self.snapshot(None).await?;
                save_session(&path.unwrap_or_default(), &snapshot)
            }
            "open" => {
                let session = read_session(&path.unwrap_or_default())?;
                let folder = self.working_directory()?;
                let result = self
                    .engine(json!({
                        "op": "restore",
                        "session": session,
                        "folder": folder.to_string_lossy(),
                    }))
                    .await?;
                self.folder = Some(folder);
                Ok(result)
            }
            "new" => {
                let folder = self.working_directory()?;
                command["folder"] = json!(folder.to_string_lossy());
                self.folder = Some(folder);
                self.engine(command.clone()).await
            }
            _ => self.engine(command.clone()).await,
        }
    }

    async fn close(&mut self) -> Outcome {
        self.execute(json!({ "op": "stop" })).await?;
        self.checkpoint(None).await?;
        self.engine.close();
        Ok(Value::Null)
    }
}

/// Edits whose reply plus the previous snapshot fully describe the session,
/// so recovery can skip re-reading media and plug-in state from the engine.
fn can_reuse_media(command: &Value) -> bool {
    let action = command.get("action").and_then(Value::as_str);
    let tempo_match = command.get("match");
    match op(command) {
        "addTrack" | "removeTrack" | "removeClip" | "rename" | "master" | "limiter" | "loop"
        | "metronome" | "metronomeVolume" | "metronomeSound" | "countIn" | "bypass" => true,
        "tempo" => !truthy(tempo_match) || tempo_match.and_then(Value::as_str) == Some("none"),
        "track" => command.get("midiDevice").is_none(),
        "editClip" => matches!(action, Some("move") | Some("take")),
        _ => false,
    }
}

/// Fills a metadata-only reply with the media and plug-in state it omits.
pub fn recovery_snapshot(result: &Value, before: &Value) -> Value {
    let mut all_clips: HashMap<String, &Value> = HashMap::new();
    let mut previous_tracks: HashMap<String, &Value> = HashMap::new();
    for track in array(before, "tracks") {
        previous_tracks.insert(crate::json::id_key(track), track);
        for clip in array(track, "clips") {
            all_clips.insert(crate::json::id_key(clip), clip);
        }
    }
    let mut out = merge(Some(before), result);
    let tracks: Vec<Value> = array(result, "tracks")
        .iter()
        .map(|track| {
            let previous = previous_tracks.get(&crate::json::id_key(track)).copied();
            let previous_clips: HashMap<String, &Value> = previous
                .map(|p| {
                    array(p, "clips")
                        .iter()
                        .map(|c| (crate::json::id_key(c), c))
                        .collect()
                })
                .unwrap_or_default();
            let mut merged = merge(previous, track);
            let previous_effects = previous.map(|p| array(p, "effects")).unwrap_or(&[]);
            merged["effects"] = Value::Array(
                array(track, "effects")
                    .iter()
                    .map(|effect| {
                        merge(
                            crate::json::find_by_id(previous_effects, effect.get("id")),
                            effect,
                        )
                    })
                    .collect(),
            );
            merged["clips"] = Value::Array(
                array(track, "clips")
                    .iter()
                    .map(|clip| {
                        let key = crate::json::id_key(clip);
                        merge(
                            previous_clips
                                .get(&key)
                                .or_else(|| all_clips.get(&key))
                                .copied(),
                            clip,
                        )
                    })
                    .collect(),
            );
            merged
        })
        .collect();
    if result.get("tracks").is_some() {
        out["tracks"] = Value::Array(tracks);
    }
    out
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::sync::Mutex as StdMutex;
    use tokio::sync::Notify;

    /// An engine that records commands and answers from a script.
    struct ScriptedEngine {
        log: StdMutex<Vec<Value>>,
        gate: Notify,
        hold_init: bool,
        answer: Box<dyn Fn(&Value) -> Outcome + Send + Sync>,
    }

    impl Engine for ScriptedEngine {
        fn request(&self, command: Value) -> BoxFuture<'_, Outcome> {
            Box::pin(async move {
                if self.hold_init && op(&command) == "init" {
                    self.gate.notified().await;
                }
                self.log.lock().unwrap().push(command.clone());
                (self.answer)(&command)
            })
        }
        fn close(&self) {}
    }

    fn scripted(
        hold_init: bool,
        answer: impl Fn(&Value) -> Outcome + Send + Sync + 'static,
    ) -> Arc<ScriptedEngine> {
        Arc::new(ScriptedEngine {
            log: StdMutex::new(Vec::new()),
            gate: Notify::new(),
            hold_init,
            answer: Box::new(answer),
        })
    }

    fn temp_folder(name: &str) -> PathBuf {
        let folder = std::env::temp_dir().join(format!("basement-{name}-{}", uuid::Uuid::new_v4()));
        std::fs::create_dir_all(&folder).unwrap();
        folder
    }

    fn ready(engine: Arc<ScriptedEngine>) -> EngineFuture {
        Box::pin(async move { Ok(engine as Arc<dyn Engine>) })
    }

    #[tokio::test]
    async fn pending_slider_updates_collapse_without_crossing_undo_or_gesture_boundaries() {
        let engine = scripted(true, |command| {
            Ok(match op(command) {
                "state" => json!({ "playing": false, "recording": true }),
                _ => json!({}),
            })
        });
        let service = SessionService::start(
            ready(engine.clone()),
            temp_folder("gestures"),
            Options {
                recover: false,
                device_file: None,
            },
        );
        let mut replies = Vec::new();
        for i in 0..1000 {
            replies.push(service.request(json!({
                "op": "track", "track": "a", "gain": i as f64 / 1000.0, "historyGroup": "first"
            })));
        }
        replies.push(service.request(json!({ "op": "undo" })));
        replies.push(service.request(json!({
            "op": "track", "track": "a", "gain": 0.2, "historyGroup": "second"
        })));
        engine.gate.notify_one();
        for reply in replies {
            reply.await.unwrap();
        }
        let tracks: Vec<Value> = engine
            .log
            .lock()
            .unwrap()
            .iter()
            .filter(|c| op(c) == "track")
            .cloned()
            .collect();
        assert_eq!(tracks.len(), 2);
        assert_eq!(tracks[0]["gain"], json!(0.999));
        assert_eq!(tracks[1]["historyGroup"], json!("second"));
    }

    fn launch_default() -> Value {
        json!({ "type": "Windows Audio", "output": "Speakers", "input": "",
                "sampleRate": 48000, "bufferSize": 480 })
    }

    async fn restore_with(file: PathBuf, available: fn(&Value) -> bool) -> Vec<Value> {
        let engine = scripted(false, move |command| match op(command) {
            "devices" => Ok(merge(Some(&launch_default()), &json!({ "types": [] }))),
            "configure" if !available(command) => Err("No such device".into()),
            _ => Ok(command.clone()),
        });
        let session = Session::new(
            engine.clone(),
            temp_folder("device"),
            Options {
                recover: false,
                device_file: Some(file),
            },
        );
        session.restore_audio_device().await;
        let log = engine.log.lock().unwrap().clone();
        log
    }

    #[tokio::test]
    async fn launch_reapplies_the_remembered_device_drops_a_missing_input_else_keeps_the_default() {
        let remembered = json!({ "type": "ASIO", "output": "USB Interface", "input": "USB Interface",
                                 "sampleRate": 48000, "bufferSize": 128 });
        let file = temp_folder("device-file").join("audio-device.json");
        save_audio_device(&file, &remembered).unwrap();
        let configure = |config: &Value| merge(Some(&json!({ "op": "configure" })), config);

        let log = restore_with(file.clone(), |_| true).await;
        assert_eq!(log.last(), Some(&configure(&remembered)));

        // Interface present but its input gone: keep the output choice.
        let log = restore_with(file.clone(), |c| {
            c["output"] == "USB Interface" && c["input"] == ""
        })
        .await;
        let mut without_input = remembered.clone();
        without_input["input"] = json!("");
        assert_eq!(log.last(), Some(&configure(&without_input)));

        // Interface unplugged: reopen the device the engine started with.
        let log = restore_with(file.clone(), |c| c["output"] == "Speakers").await;
        assert_eq!(log.last(), Some(&configure(&launch_default())));

        // Without a remembered device nothing is touched.
        let log = restore_with(temp_folder("none").join("none.json"), |_| true).await;
        assert!(log.is_empty());
    }

    #[tokio::test]
    async fn a_failed_open_keeps_the_active_working_folder() {
        let folder = temp_folder("open");
        let document = folder.join("Broken.basement");
        std::fs::write(&document, "{}").unwrap();
        let engine = scripted(false, |_| Err("Could not restore media".into()));
        let mut session = Session::new(
            engine,
            folder.clone(),
            Options {
                recover: false,
                device_file: None,
            },
        );
        session.folder = Some(PathBuf::from("current-working-folder"));
        let mut command = json!({ "op": "open", "path": document.to_string_lossy() });
        assert!(session.execute_raw(&mut command).await.is_err());
        assert_eq!(
            session.folder,
            Some(PathBuf::from("current-working-folder"))
        );
    }

    #[test]
    fn recovery_snapshot_fills_omitted_media_and_plugin_state() {
        let before = json!({ "title": "Jam", "tracks": [{
            "id": "t", "pluginState": "abc",
            "effects": [{ "id": "e", "state": "fx" }],
            "clips": [{ "id": "c", "path": "a.wav", "peaks": [1] }]
        }]});
        let reply = json!({ "tracks": [{
            "id": "t", "gain": 1, "effects": [{ "id": "e", "bypass": true }],
            "clips": [{ "id": "c", "start": 2 }]
        }]});
        let merged = recovery_snapshot(&reply, &before);
        assert_eq!(merged["title"], "Jam");
        assert_eq!(merged["tracks"][0]["pluginState"], "abc");
        assert_eq!(merged["tracks"][0]["effects"][0]["state"], "fx");
        assert_eq!(merged["tracks"][0]["clips"][0]["path"], "a.wav");
        assert_eq!(merged["tracks"][0]["clips"][0]["start"], 2);
    }
}
