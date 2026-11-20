//! Test host for the session layer: `npm test` drives the shipped Rust
//! SessionService, PluginLibrary and desktop handlers through this binary,
//! with the real engine on its test device. Never bundled with the app.
//!
//! Usage: session-host --engine <BasementAudio> --folder <sessions folder>
//! Each stdin line is `{"id": n, ...}` with one of:
//!   "command": {...}             a session request
//!   "library": {...}             a Sound library action (library in --folder)
//!   "desktop": "drop" | "import", "args": {...}, "dialog": "<path>" | null
//!   "validate": {...}            session document validation
//!   "scan": "<folder>"           scans plug-ins in a folder and waits
//!   "reloadLibrary": true        lists a freshly loaded library file
//! and gets `{"id": n, "result": ...}` or `{"id": n, "error": "..."}`.
//! End of input stops the transport, writes recovery and closes the engine.

use basement_desktop::ipc::{self, DialogRequest, Dialogs};
use basement_desktop::native_client::{Engine, NativeClient};
use basement_desktop::plugin_library::PluginLibrary;
use basement_desktop::session_service::{Options, SessionService};
use basement_desktop::{BoxFuture, Outcome};
use serde_json::{json, Value};
use std::path::PathBuf;
use std::sync::Arc;
use std::time::Duration;
use tokio::io::{AsyncBufReadExt, AsyncWriteExt, BufReader};
use tokio::sync::Mutex;

struct ScriptedDialog(Option<PathBuf>);

impl Dialogs for ScriptedDialog {
    fn pick(&self, _request: DialogRequest) -> BoxFuture<'_, Option<PathBuf>> {
        let chosen = self.0.clone();
        Box::pin(async move { chosen })
    }
}

fn argument(name: &str) -> Option<String> {
    let args: Vec<String> = std::env::args().collect();
    args.iter()
        .position(|a| a == name)
        .and_then(|i| args.get(i + 1).cloned())
}

async fn handle(
    message: &Value,
    service: &Arc<SessionService>,
    library: &PluginLibrary,
) -> Outcome {
    if let Some(command) = message.get("command") {
        return service.request(command.clone()).await;
    }
    if let Some(command) = message.get("library") {
        return library.command(command, None, service).await;
    }
    if let Some(folder) = message.get("scan").and_then(Value::as_str) {
        return Ok(library.scan_folder(PathBuf::from(folder)).await);
    }
    if message.get("reloadLibrary").is_some() {
        let folder = PathBuf::from(argument("--folder").unwrap_or_default());
        let fresh = PluginLibrary::new(&folder, PathBuf::new(), Vec::new());
        return fresh.command(&json!({ "op": "list" }), None, service).await;
    }
    if let Some(session) = message.get("validate") {
        return basement_desktop::session_files::validate(session).map(|()| Value::Bool(true));
    }
    let args = message.get("args").cloned().unwrap_or(json!({}));
    let dialog = ScriptedDialog(
        message
            .get("dialog")
            .and_then(Value::as_str)
            .map(PathBuf::from),
    );
    match message.get("desktop").and_then(Value::as_str) {
        Some("drop") => {
            let paths = args["paths"]
                .as_array()
                .map(|p| {
                    p.iter()
                        .filter_map(|v| v.as_str().map(str::to_owned))
                        .collect()
                })
                .unwrap_or_default();
            ipc::drop_files(
                service,
                paths,
                args.get("track").cloned(),
                args["plugin"] == true,
            )
            .await
        }
        Some("import") => {
            ipc::import(
                service,
                &dialog,
                args.get("track").cloned(),
                args.get("position").cloned(),
            )
            .await
        }
        _ => Err("Unknown test message".into()),
    }
}

#[tokio::main]
async fn main() {
    basement_desktop::logging::initialize(None);
    let engine_path = argument("--engine").expect("--engine <path>");
    let folder = PathBuf::from(argument("--folder").expect("--folder <path>"));
    let engine: Arc<dyn Engine> = Arc::new(
        NativeClient::spawn(&engine_path, &["--test-device"], Duration::from_secs(10))
            .expect("engine starts"),
    );
    let service = SessionService::start(
        Box::pin(async move { Ok(engine) }),
        folder.clone(),
        Options::default(),
    );
    let library = Arc::new(PluginLibrary::new(
        &folder,
        PathBuf::from(&engine_path),
        Vec::new(),
    ));
    let stdout = Arc::new(Mutex::new(tokio::io::stdout()));
    let mut lines = BufReader::new(tokio::io::stdin()).lines();
    let mut running = Vec::new();
    while let Ok(Some(line)) = lines.next_line().await {
        let Ok(message) = serde_json::from_str::<Value>(&line) else {
            continue;
        };
        let (service, library, stdout) = (service.clone(), library.clone(), stdout.clone());
        // Session commands queue in arrival order before any await.
        let queued = message
            .get("command")
            .map(|command| service.request(command.clone()));
        running.push(tokio::spawn(async move {
            let id = message.get("id").cloned().unwrap_or(Value::Null);
            let result = match queued {
                Some(reply) => reply.await,
                None => handle(&message, &service, &library).await,
            };
            let reply = match result {
                Ok(result) => json!({ "id": id, "result": result }),
                Err(error) => json!({ "id": id, "error": error }),
            };
            let mut out = stdout.lock().await;
            let _ = out.write_all(format!("{reply}\n").as_bytes()).await;
            let _ = out.flush().await;
        }));
    }
    for task in running {
        let _ = task.await;
    }
    if let Err(error) = service.close().await {
        log::error!("Session close failed {error}");
    }
}
