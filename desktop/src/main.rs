//! Basement Band's desktop shell: one window running the React UI in the
//! system webview, the native engine as a child process, and a narrow set of
//! commands between them. See docs/ARCHITECTURE.md.

#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

mod auto_update;

use basement_desktop::contract::renderer_allowed;
use basement_desktop::ipc::{self, DialogKind, DialogRequest, Dialogs, PluginFolders};
use basement_desktop::native_client::{Engine, NativeClient};
use basement_desktop::permissions::microphone_access;
use basement_desktop::plugin_library::PluginLibrary;
use basement_desktop::session_service::{Options, SessionService};
use basement_desktop::updates::{check_for_update, RELEASE_PAGE};
use basement_desktop::{json::op, BoxFuture, Outcome};
use serde_json::{json, Value};
use std::path::{Path, PathBuf};
use std::sync::atomic::{AtomicBool, Ordering};
use std::sync::{Arc, Mutex, OnceLock};
use std::time::Duration;
use tauri::ipc::Channel;
use tauri::menu::{Menu, MenuItem};
use tauri::tray::{MouseButton, MouseButtonState, TrayIconBuilder, TrayIconEvent};
use tauri::{
    AppHandle, DragDropEvent, Manager, RunEvent, State, WebviewUrl, WebviewWindow,
    WebviewWindowBuilder, WindowEvent,
};
use tauri_plugin_dialog::{DialogExt, MessageDialogButtons, MessageDialogKind};
use tauri_plugin_opener::OpenerExt;

const MAIN: &str = "main";

fn env_flag(name: &str) -> bool {
    std::env::var(name).as_deref() == Ok("1")
}

/// Shell state shared by the commands.
struct Shell {
    service: Arc<SessionService>,
    library: OnceLock<Arc<PluginLibrary>>,
    engine: PathBuf,
    data: PathBuf,
    logs: PathBuf,
    smoke: bool,
    recovery_flushed: AtomicBool,
    quit_pending: AtomicBool,
    /// Paths of the latest native file drop; `drop_files` accepts only these.
    dropped: Mutex<Vec<PathBuf>>,
    visible: tokio::sync::watch::Sender<bool>,
    update: tokio::sync::OnceCell<Value>,
    /// Smoke runs answer file dialogs from the test instead of the screen.
    smoke_dialogs: Mutex<SmokeDialogs>,
}

#[derive(Default)]
struct SmokeDialogs {
    opened: u32,
    waiting: Option<tokio::sync::oneshot::Sender<Option<PathBuf>>>,
}

impl Shell {
    fn library(&self) -> Arc<PluginLibrary> {
        self.library
            .get_or_init(|| {
                let folders = PluginFolders::system(home());
                Arc::new(PluginLibrary::new(
                    &self.data,
                    self.engine.clone(),
                    folders.roots,
                ))
            })
            .clone()
    }
}

fn home() -> PathBuf {
    std::env::var_os(if cfg!(windows) { "USERPROFILE" } else { "HOME" })
        .map(PathBuf::from)
        .unwrap_or_default()
}

fn repository() -> PathBuf {
    Path::new(env!("CARGO_MANIFEST_DIR"))
        .parent()
        .map(Path::to_path_buf)
        .unwrap_or_default()
}

/// The app identifier, also the name of its data folder.
const IDENTIFIER: &str = "com.footstompstudios.basementband";

/// Recovery, the Sound library and the remembered device:
/// `<app data>/com.footstompstudios.basementband` (Roaming on Windows).
fn user_data(smoke: bool) -> PathBuf {
    if smoke {
        return basement_desktop::paths::resolve("artifacts/smoke-user");
    }
    let base = if cfg!(windows) {
        std::env::var_os("APPDATA").map(PathBuf::from)
    } else if cfg!(target_os = "macos") {
        Some(home().join("Library/Application Support"))
    } else {
        std::env::var_os("XDG_CONFIG_HOME")
            .map(PathBuf::from)
            .or_else(|| Some(home().join(".config")))
    };
    base.unwrap_or_else(home).join(IDENTIFIER)
}

fn logs_folder(data: &Path) -> PathBuf {
    if cfg!(target_os = "macos") {
        home().join("Library/Logs/Basement Band")
    } else {
        data.join("logs")
    }
}

fn engine_path() -> PathBuf {
    if env_flag("BASEMENT_TEST_DEVICE") {
        if let Some(test) = std::env::var_os("BASEMENT_NATIVE_TEST") {
            return basement_desktop::paths::resolve(PathBuf::from(test));
        }
    }
    let name = if cfg!(windows) {
        "BasementAudio.exe"
    } else {
        "BasementAudio"
    };
    // Bundled builds ship the engine next to the app executable.
    if let Some(beside) = std::env::current_exe()
        .ok()
        .and_then(|exe| exe.parent().map(|dir| dir.join(name)))
        .filter(|path| path.exists())
    {
        return beside;
    }
    repository().join("artifacts/native").join(name)
}

fn licenses_folder(app: &AppHandle) -> PathBuf {
    app.path()
        .resource_dir()
        .map(|dir| dir.join("licenses"))
        .ok()
        .filter(|dir| dir.exists())
        .unwrap_or_else(|| repository().join("artifacts/licenses"))
}

fn start_engine(path: PathBuf) -> BoxFuture<'static, Result<Arc<dyn Engine>, String>> {
    Box::pin(async move {
        let input_allowed = microphone_access().await;
        if !path.exists() {
            return Err("Run npm run build:all to build the audio engine.".into());
        }
        let args: &[&str] = if env_flag("BASEMENT_TEST_DEVICE") {
            &["--test-device"]
        } else if input_allowed {
            &[]
        } else {
            &["--no-input"]
        };
        log::info!(
            "Launching audio engine {} inputAllowed: {input_allowed}",
            path.display()
        );
        let client = NativeClient::spawn(&path, args, Duration::from_secs(60))
            .map_err(|error| format!("The audio engine could not start: {error}"))?;
        Ok(Arc::new(client) as Arc<dyn Engine>)
    })
}

/// Native file dialogs, parented to the main window.
struct NativeDialogs {
    app: AppHandle,
}

impl Dialogs for NativeDialogs {
    fn pick(&self, request: DialogRequest) -> BoxFuture<'_, Option<PathBuf>> {
        let shell = self.app.state::<Shell>();
        if shell.smoke {
            let (sender, receiver) = tokio::sync::oneshot::channel();
            let mut dialogs = shell.smoke_dialogs.lock().unwrap();
            dialogs.opened += 1;
            dialogs.waiting = Some(sender);
            return Box::pin(async move { receiver.await.ok().flatten() });
        }
        let mut builder = self.app.dialog().file();
        if let Some(window) = self.app.get_webview_window(MAIN) {
            builder = builder.set_parent(&window);
        }
        if let Some(title) = &request.title {
            builder = builder.set_title(title);
        }
        for (name, extensions) in &request.filters {
            let extensions: Vec<&str> = extensions.iter().map(String::as_str).collect();
            builder = builder.add_filter(name, &extensions);
        }
        if let Some(folder) = &request.folder {
            builder = builder.set_directory(folder);
        }
        if let Some(name) = &request.file_name {
            builder = builder.set_file_name(name);
        }
        let (sender, receiver) = tokio::sync::oneshot::channel();
        let done = move |path: Option<tauri_plugin_dialog::FilePath>| {
            let _ = sender.send(path.and_then(|p| p.into_path().ok()));
        };
        match request.kind {
            DialogKind::OpenFile => builder.pick_file(done),
            DialogKind::OpenFolder => builder.pick_folder(done),
            DialogKind::SaveFile => builder.save_file(done),
        }
        Box::pin(async move { receiver.await.ok().flatten() })
    }
}

fn from_main(window: &tauri::Webview) -> Outcome<()> {
    if window.label() == MAIN {
        Ok(())
    } else {
        Err("Unknown window".into())
    }
}

fn reply_to(channel: Channel<Value>, result: Outcome) {
    let message = match result {
        Ok(value) => json!({ "ok": value }),
        Err(error) => json!({ "error": error }),
    };
    if let Err(error) = channel.send(message) {
        log::warn!("Could not deliver a reply to the UI: {error}");
    }
}

/// Session commands. Synchronous so each is queued in the order the UI sent
/// it (slider gestures depend on that); the reply arrives on `reply`.
#[tauri::command]
fn command(
    webview: tauri::Webview,
    shell: State<'_, Shell>,
    command: Value,
    reply: Channel<Value>,
) -> Outcome<()> {
    from_main(&webview)?;
    let op = op(&command).to_owned();
    if !renderer_allowed(&op) {
        return Err("Unknown command".into());
    }
    let service = shell.service.clone();
    if cfg!(target_os = "macos") && (op == "record" || op == "configure") {
        tauri::async_runtime::spawn(async move {
            let result = ipc::command(&service, command, Some(microphone_access)).await;
            reply_to(reply, result);
        });
        return Ok(());
    }
    let pending = service.request(command);
    tauri::async_runtime::spawn(async move { reply_to(reply, pending.await) });
    Ok(())
}

#[tauri::command]
async fn sound_library(
    app: AppHandle,
    webview: tauri::Webview,
    shell: State<'_, Shell>,
    command: Value,
) -> Outcome {
    from_main(&webview)?;
    let library = shell.library();
    ipc::sound_library(&library, &NativeDialogs { app }, &shell.service, command).await
}

#[tauri::command]
async fn save(app: AppHandle, webview: tauri::Webview, shell: State<'_, Shell>) -> Outcome {
    from_main(&webview)?;
    ipc::save(&shell.service, &NativeDialogs { app }).await
}

#[tauri::command]
async fn open(app: AppHandle, webview: tauri::Webview, shell: State<'_, Shell>) -> Outcome {
    from_main(&webview)?;
    ipc::open(&shell.service, &NativeDialogs { app }).await
}

#[tauri::command]
async fn import_audio(
    app: AppHandle,
    webview: tauri::Webview,
    shell: State<'_, Shell>,
    track: Option<Value>,
    position: Option<Value>,
) -> Outcome {
    from_main(&webview)?;
    ipc::import(&shell.service, &NativeDialogs { app }, track, position).await
}

#[tauri::command]
async fn plugin(
    app: AppHandle,
    webview: tauri::Webview,
    shell: State<'_, Shell>,
    track: Value,
    bundle: Option<bool>,
    append: Option<bool>,
) -> Outcome {
    from_main(&webview)?;
    let folders = PluginFolders::system(home());
    let dialogs = NativeDialogs { app };
    ipc::plugin(
        &shell.service,
        &dialogs,
        &folders,
        track,
        bundle.unwrap_or(false),
        append.unwrap_or(false),
    )
    .await
}

#[tauri::command]
async fn drop_files(
    webview: tauri::Webview,
    shell: State<'_, Shell>,
    paths: Vec<String>,
    track: Option<Value>,
    plugin: Option<bool>,
) -> Outcome {
    from_main(&webview)?;
    {
        let mut dropped = shell.dropped.lock().unwrap();
        if paths.is_empty() || !paths.iter().all(|p| dropped.contains(&PathBuf::from(p))) {
            return Err("Invalid dropped files".into());
        }
        dropped.clear();
    }
    ipc::drop_files(&shell.service, paths, track, plugin.unwrap_or(false)).await
}

#[tauri::command]
async fn export_audio(
    app: AppHandle,
    webview: tauri::Webview,
    shell: State<'_, Shell>,
    options: Value,
) -> Outcome {
    from_main(&webview)?;
    ipc::export(&shell.service, &NativeDialogs { app }, options).await
}

#[tauri::command]
async fn window_visible(webview: tauri::Webview, shell: State<'_, Shell>) -> Outcome<()> {
    from_main(&webview)?;
    let mut visible = shell.visible.subscribe();
    let _ = visible.wait_for(|shown| *shown).await;
    Ok(())
}

#[tauri::command]
async fn check_update(app: AppHandle, webview: tauri::Webview, shell: State<'_, Shell>) -> Outcome {
    from_main(&webview)?;
    if shell.smoke {
        return Ok(json!({ "available": false }));
    }
    if auto_update::enabled(&app, shell.smoke) {
        return Ok(app.state::<auto_update::AutoUpdate>().status(&app));
    }
    let version = app.package_info().version.to_string();
    Ok(shell
        .update
        .get_or_init(|| async move { check_for_update(&version).await })
        .await
        .clone())
}

/// "Restart to update": writes recovery, installs the downloaded update and
/// starts the new version.
#[tauri::command]
fn install_update(app: AppHandle, webview: tauri::Webview) -> Outcome<()> {
    from_main(&webview)?;
    if app.state::<auto_update::AutoUpdate>().is_ready() {
        quit(&app, true);
    }
    Ok(())
}

fn open_url(app: &AppHandle, url: &str) -> Outcome<()> {
    app.opener()
        .open_url(url, None::<&str>)
        .map_err(|error| error.to_string())
}

fn open_folder(app: &AppHandle, folder: &Path) -> Outcome<String> {
    let _ = std::fs::create_dir_all(folder);
    app.opener()
        .open_path(folder.to_string_lossy(), None::<&str>)
        .map(|()| String::new())
        .map_err(|error| error.to_string())
}

#[tauri::command]
fn open_website(app: AppHandle, webview: tauri::Webview) -> Outcome<()> {
    from_main(&webview)?;
    open_url(&app, "https://footstomp.studio/")
}

#[tauri::command]
fn open_release(app: AppHandle, webview: tauri::Webview) -> Outcome<()> {
    from_main(&webview)?;
    open_url(&app, RELEASE_PAGE)
}

fn encode_component(text: &str) -> String {
    text.bytes()
        .map(|b| match b {
            b'A'..=b'Z'
            | b'a'..=b'z'
            | b'0'..=b'9'
            | b'-'
            | b'_'
            | b'.'
            | b'!'
            | b'~'
            | b'*'
            | b'\''
            | b'('
            | b')' => (b as char).to_string(),
            other => format!("%{other:02X}"),
        })
        .collect()
}

fn platform_name() -> &'static str {
    match std::env::consts::OS {
        "windows" => "win32",
        "macos" => "darwin",
        other => other,
    }
}

#[tauri::command]
fn open_feedback(app: AppHandle, webview: tauri::Webview) -> Outcome<()> {
    from_main(&webview)?;
    let subject = encode_component("Basement Band feedback");
    let body = encode_component(&format!(
        "Hi NFMynster,\n\n[Write your feedback, bug report, or suggestion here]\n\nWhat I was doing:\n\nWhat happened:\n\nWhat I expected:\n\n---\nBasement Band {} · {}",
        app.package_info().version,
        platform_name()
    ));
    open_url(
        &app,
        &format!("mailto:nfmynster@footstomp.studio?subject={subject}&body={body}"),
    )
}

#[tauri::command]
fn open_logs(app: AppHandle, webview: tauri::Webview, shell: State<'_, Shell>) -> Outcome<String> {
    from_main(&webview)?;
    open_folder(&app, &shell.logs)
}

#[tauri::command]
fn open_licenses(app: AppHandle, webview: tauri::Webview) -> Outcome<String> {
    from_main(&webview)?;
    let folder = licenses_folder(&app);
    open_folder(&app, &folder)
}

#[tauri::command]
fn restart(app: AppHandle, webview: tauri::Webview) -> Outcome<()> {
    from_main(&webview)?;
    quit(&app, true);
    Ok(())
}

/// Test-only: any engine command, including test-device ops. Rejected
/// unless the app was started for the desktop smoke run.
#[tauri::command]
async fn smoke_request(
    webview: tauri::Webview,
    shell: State<'_, Shell>,
    command: Value,
) -> Outcome {
    from_main(&webview)?;
    if !shell.smoke {
        return Err("Unknown command".into());
    }
    shell.service.request(command).await
}

/// Test-only: how many file dialogs opened, and (with `resolve`) answers the
/// waiting one with `answer` or cancels it.
#[tauri::command]
fn smoke_dialog(
    webview: tauri::Webview,
    shell: State<'_, Shell>,
    answer: Option<String>,
    resolve: Option<bool>,
) -> Outcome {
    from_main(&webview)?;
    if !shell.smoke {
        return Err("Unknown command".into());
    }
    let mut dialogs = shell.smoke_dialogs.lock().unwrap();
    let answered = resolve.unwrap_or(false)
        && dialogs
            .waiting
            .take()
            .is_some_and(|waiting| waiting.send(answer.map(PathBuf::from)).is_ok());
    Ok(json!({ "opened": dialogs.opened, "answered": answered }))
}

/// Test-only: resizes the window's content area for layout checks.
#[tauri::command]
fn smoke_set_size(
    webview: tauri::Webview,
    shell: State<'_, Shell>,
    width: f64,
    height: f64,
) -> Outcome<()> {
    from_main(&webview)?;
    if !shell.smoke {
        return Err("Unknown command".into());
    }
    webview
        .window()
        .set_size(tauri::LogicalSize::new(width, height))
        .map_err(|error| error.to_string())
}

/// Preserves the session through recovery, exactly once, before exiting or
/// restarting. When recovery fails the user decides whether to quit anyway.
fn quit(app: &AppHandle, restart: bool) {
    let shell = app.state::<Shell>();
    if shell.recovery_flushed.load(Ordering::SeqCst) {
        finish(app, restart);
        return;
    }
    if shell.quit_pending.swap(true, Ordering::SeqCst) {
        return;
    }
    let app = app.clone();
    tauri::async_runtime::spawn(async move {
        let shell = app.state::<Shell>();
        match shell.service.close().await {
            Ok(()) => {
                shell.recovery_flushed.store(true, Ordering::SeqCst);
                finish(&app, restart);
            }
            Err(error) => {
                shell.quit_pending.store(false, Ordering::SeqCst);
                log::error!("Session recovery on exit failed {error}");
                let handle = app.clone();
                app.dialog()
                    .message(error)
                    .title("Your latest session could not be preserved.")
                    .kind(MessageDialogKind::Error)
                    .buttons(MessageDialogButtons::OkCancelCustom(
                        "Keep app open".into(),
                        "Quit without recovery".into(),
                    ))
                    .show(move |keep_open| {
                        if keep_open {
                            return;
                        }
                        let shell = handle.state::<Shell>();
                        shell.service.abandon();
                        shell.recovery_flushed.store(true, Ordering::SeqCst);
                        finish(&handle, restart);
                    });
            }
        }
    });
}

/// After recovery: a downloaded update installs now (also on a plain quit,
/// as on the next launch the new version should open).
fn finish(app: &AppHandle, restart: bool) {
    auto_update::install_ready(app, restart);
    if restart {
        app.restart();
    } else {
        app.exit(0);
    }
}

fn show(window: &WebviewWindow) {
    let _ = window.show();
    let _ = window.unminimize();
    let _ = window.set_focus();
}

fn create_window(app: &AppHandle, smoke: bool) -> tauri::Result<WebviewWindow> {
    let dev_url = env_flag("BASEMENT_DEV").then(|| {
        std::env::var("BASEMENT_DEV_URL").unwrap_or_else(|_| "http://127.0.0.1:5173/".into())
    });
    let url = match &dev_url {
        Some(url) => {
            let parsed: tauri::Url = url.parse().expect("BASEMENT_DEV_URL is a URL");
            assert!(
                parsed.scheme() == "http" && parsed.host_str() == Some("127.0.0.1"),
                "The development UI must use loopback HTTP"
            );
            WebviewUrl::External(parsed)
        }
        None => WebviewUrl::App("index.html".into()),
    };
    let allowed_dev = dev_url.clone();
    #[allow(unused_mut)]
    let mut builder = WebviewWindowBuilder::new(app, MAIN, url)
        .title("Basement Band")
        .inner_size(1440.0, 940.0)
        .min_inner_size(1050.0, 700.0)
        .background_color(tauri::window::Color(0x19, 0x1a, 0x1e, 0xff))
        .visible(false)
        .center()
        .on_navigation(move |url| {
            // The UI is a single page; links open through the shell instead.
            let local = matches!(url.scheme(), "tauri" | "asset")
                || url.host_str() == Some("tauri.localhost");
            local
                || allowed_dev
                    .as_deref()
                    .is_some_and(|dev| url.as_str().starts_with(dev))
        });
    if smoke {
        // A separate, disposable webview profile for test runs.
        // The test driver names a fresh profile per run.
        let profile = std::env::var_os("BASEMENT_WEBVIEW_PROFILE")
            .map(PathBuf::from)
            .unwrap_or_else(|| user_data(true).join("webview"));
        builder = builder.data_directory(profile);
    }
    #[cfg(windows)]
    if smoke {
        // The smoke and visual runs drive WebView2 over the DevTools protocol,
        // and keep timers and frames running while the window is covered.
        let port = std::env::var("BASEMENT_CDP_PORT").unwrap_or_else(|_| "9333".into());
        builder = builder.additional_browser_args(&format!(
            "--disable-features=msWebOOUI,msPdfOOUI,msSmartScreenProtection,CalculateNativeWinOcclusion --disable-background-timer-throttling --disable-renderer-backgrounding --disable-backgrounding-occluded-windows --remote-debugging-port={port}"
        ));
    }
    let window = builder.build()?;
    if dev_url.is_some() {
        app.add_capability(
            tauri::ipc::CapabilityBuilder::new("development-ui")
                .remote("http://127.0.0.1:*".into())
                .window(MAIN)
                .permission("core:default"),
        )?;
    }
    Ok(window)
}

fn create_tray(app: &AppHandle) -> tauri::Result<()> {
    let open = MenuItem::with_id(app, "open", "Open Basement Band", true, None::<&str>)?;
    let quit_item = MenuItem::with_id(app, "quit", "Quit", true, None::<&str>)?;
    let menu = Menu::with_items(app, &[&open, &quit_item])?;
    let mut tray = TrayIconBuilder::with_id("main")
        .tooltip("Basement Band")
        .menu(&menu)
        .show_menu_on_left_click(false)
        .on_menu_event(|app, event| match event.id().as_ref() {
            "open" => {
                if let Some(window) = app.get_webview_window(MAIN) {
                    show(&window);
                }
            }
            "quit" => quit(app, false),
            _ => {}
        })
        .on_tray_icon_event(|tray, event| {
            if let TrayIconEvent::Click {
                button: MouseButton::Left,
                button_state: MouseButtonState::Up,
                ..
            } = event
            {
                if let Some(window) = tray.app_handle().get_webview_window(MAIN) {
                    show(&window);
                }
            }
        });
    if let Some(icon) = app.default_window_icon() {
        tray = tray.icon(icon.clone());
    }
    tray.build(app)?;
    Ok(())
}

fn main() {
    let smoke = env_flag("BASEMENT_SMOKE");
    let data = user_data(smoke);
    let logs = logs_folder(&data);
    basement_desktop::logging::initialize(Some(&logs));
    let _ = std::fs::create_dir_all(&data);

    tauri::Builder::default()
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_opener::init())
        .plugin(tauri_plugin_updater::Builder::new().build())
        .invoke_handler(tauri::generate_handler![
            command,
            sound_library,
            save,
            open,
            import_audio,
            plugin,
            drop_files,
            export_audio,
            window_visible,
            check_update,
            install_update,
            open_website,
            open_release,
            open_feedback,
            open_logs,
            open_licenses,
            restart,
            smoke_request,
            smoke_set_size,
            smoke_dialog,
        ])
        .setup(move |app| {
            let engine = engine_path();
            let test_device = env_flag("BASEMENT_TEST_DEVICE");
            let service = tauri::async_runtime::block_on(async {
                SessionService::start(
                    start_engine(engine.clone()),
                    data.join("Sessions"),
                    Options {
                        recover: !smoke,
                        device_file: (!test_device).then(|| data.join("audio-device.json")),
                    },
                )
            });
            let (visible, _) = tokio::sync::watch::channel(false);
            app.manage(Shell {
                service,
                library: OnceLock::new(),
                engine,
                data: data.clone(),
                logs: logs.clone(),
                smoke,
                recovery_flushed: AtomicBool::new(false),
                quit_pending: AtomicBool::new(false),
                dropped: Mutex::new(Vec::new()),
                visible,
                update: tokio::sync::OnceCell::new(),
                smoke_dialogs: Mutex::new(SmokeDialogs::default()),
            });
            app.manage(auto_update::AutoUpdate::default());
            let handle = app.handle().clone();
            let window = create_window(&handle, smoke)?;
            let shown = window.clone();
            window.on_window_event(move |event| match event {
                WindowEvent::CloseRequested { api, .. } => {
                    let app = shown.app_handle();
                    if !app.state::<Shell>().recovery_flushed.load(Ordering::SeqCst) {
                        api.prevent_close();
                        quit(app, false);
                    }
                }
                WindowEvent::DragDrop(DragDropEvent::Drop { paths, .. }) => {
                    *shown.app_handle().state::<Shell>().dropped.lock().unwrap() = paths.clone();
                }
                _ => {}
            });
            if !smoke {
                if let Err(error) = create_tray(&handle) {
                    log::warn!("Tray icon unavailable {error}");
                }
            }
            Ok(())
        })
        .on_page_load(|webview, payload| {
            if payload.event() == tauri::webview::PageLoadEvent::Finished && webview.label() == MAIN
            {
                let window = webview.window();
                if !window.is_visible().unwrap_or(false) {
                    let _ = window.show();
                    let _ = window.set_focus();
                }
                webview
                    .app_handle()
                    .state::<Shell>()
                    .visible
                    .send_replace(true);
            }
        })
        .build(tauri::generate_context!())
        .expect("Basement Band could not start")
        .run(|app, event| {
            if let RunEvent::ExitRequested { api, code, .. } = event {
                // Quit from the menu bar or tray: preserve the session first.
                let flushed = app.state::<Shell>().recovery_flushed.load(Ordering::SeqCst);
                if !flushed && code.is_none() {
                    api.prevent_exit();
                    quit(app, false);
                }
            }
        });
}
