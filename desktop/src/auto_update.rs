//! Self-updates for installed builds (Windows and macOS). The newest published
//! GitHub release carries `latest.json`, naming a signed installer (Windows)
//! or app archive (macOS) per platform. The update downloads in the
//! background and installs on quit, or right away through the footer's
//! "restart to update"; recovery is written first either way.
//!
//! Updates are signed with the project's updater key; only its public half is
//! in the app (`plugins.updater.pubkey` in tauri.conf.json). Without a key, in
//! development and in smoke runs the app falls back to the release-page
//! notice from `updates::check_for_update`.

use basement_desktop::updates::check_for_update;
use serde_json::{json, Value};
use std::sync::atomic::{AtomicBool, Ordering};
use std::sync::Mutex;
use tauri::{AppHandle, Emitter, Manager};
use tauri_plugin_updater::{Update, UpdaterExt};

#[derive(Default)]
pub struct AutoUpdate {
    started: AtomicBool,
    /// The UI's `UpdateStatus`.
    status: Mutex<Option<Value>>,
    ready: Mutex<Option<(Update, Vec<u8>)>>,
}

/// True when this build carries the updater's public key.
fn configured(app: &AppHandle) -> bool {
    app.config()
        .plugins
        .0
        .get("updater")
        .and_then(|updater| updater.get("pubkey"))
        .and_then(Value::as_str)
        .is_some_and(|key| !key.trim().is_empty())
}

/// An installed bundle: release build with its engine beside it, not a
/// `cargo`/`tauri` output under `target/`.
fn installed() -> bool {
    let Ok(exe) = std::env::current_exe() else {
        return false;
    };
    let engine = if cfg!(windows) {
        "BasementAudio.exe"
    } else {
        "BasementAudio"
    };
    !cfg!(debug_assertions)
        && exe.parent().is_some_and(|dir| dir.join(engine).exists())
        && !exe.components().any(|part| part.as_os_str() == "target")
}

/// Whether this run updates itself; otherwise it only shows the notice.
pub fn enabled(app: &AppHandle, smoke: bool) -> bool {
    !smoke && configured(app) && installed()
}

impl AutoUpdate {
    /// Starts the background check once and reports the current status.
    pub fn status(&self, app: &AppHandle) -> Value {
        if !self.started.swap(true, Ordering::SeqCst) {
            *self.status.lock().unwrap() = Some(json!({ "available": false }));
            let app = app.clone();
            tauri::async_runtime::spawn(async move { run(app).await });
        }
        self.status
            .lock()
            .unwrap()
            .clone()
            .unwrap_or_else(|| json!({ "available": false }))
    }

    pub fn is_ready(&self) -> bool {
        self.ready.lock().unwrap().is_some()
    }

    /// Records the status and tells the window ("update-status" events).
    fn set(&self, app: &AppHandle, status: Value) {
        let _ = app.emit("update-status", &status);
        *self.status.lock().unwrap() = Some(status);
    }
}

async fn run(app: AppHandle) {
    let state = app.state::<AutoUpdate>();
    let checked = match app.updater() {
        Ok(updater) => updater.check().await,
        Err(error) => Err(error),
    };
    let update = match checked {
        Ok(Some(update)) => update,
        Ok(None) => return,
        Err(error) => {
            // No manifest yet, or offline: still tell the user about a release.
            log::warn!("Update check failed, falling back to the release notice {error}");
            let version = app.package_info().version.to_string();
            state.set(&app, check_for_update(&version).await);
            return;
        }
    };
    let version = update.version.clone();
    log::info!("Downloading Basement Band {version}");
    state.set(
        &app,
        json!({ "available": true, "version": version, "state": "downloading" }),
    );
    match update.download(|_, _| {}, || {}).await {
        Ok(bytes) => {
            *state.ready.lock().unwrap() = Some((update, bytes));
            state.set(
                &app,
                json!({ "available": true, "version": version, "state": "ready" }),
            );
        }
        Err(error) => {
            log::warn!("Basement Band update failed {error}");
            state.set(
                &app,
                json!({ "available": true, "version": version, "state": "failed" }),
            );
        }
    }
}

/// Installs a downloaded update, if there is one, after recovery is written.
/// On Windows the installer takes over and this process exits here (it starts
/// the app again when `restart`); on macOS the app bundle is replaced in place
/// and the caller restarts or exits as usual.
pub fn install_ready(app: &AppHandle, restart: bool) {
    let Some((update, bytes)) = app.state::<AutoUpdate>().ready.lock().unwrap().take() else {
        return;
    };
    log::info!("Installing Basement Band {}", update.version);
    if let Err(error) = update.restart_after_install(restart).install(&bytes) {
        log::error!("Basement Band update could not be installed {error}");
    }
}
