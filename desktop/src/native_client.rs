//! The pipe to the native engine. Commands are serialized; each gets one
//! `BASEMENT:`-framed JSON reply. Framed objects with an `event` field are
//! unsolicited (the live state stream) and go to the event sink instead.
//! Other stdout lines are plug-in diagnostics.

use crate::{BoxFuture, Outcome};
use serde_json::Value;
use std::ffi::OsStr;
use std::process::Stdio;
use std::sync::atomic::{AtomicBool, Ordering};
use std::sync::{Arc, Mutex};
use std::time::Duration;
use tokio::io::{AsyncBufReadExt, AsyncWriteExt, BufReader};
use tokio::process::{ChildStdin, Command};
use tokio::sync::{oneshot, Notify};

/// What the session layer needs from an engine; tests substitute their own.
pub trait Engine: Send + Sync + 'static {
    fn request(&self, command: Value) -> BoxFuture<'_, Outcome>;
    /// Finishes the in-flight reply, then ends the engine.
    fn close(&self);
}

const STOPPED: &str =
    "The audio engine stopped. Restart the app. Completed recordings remain in the session folder.";
const QUIET_OPS: [&str; 4] = ["state", "pump", "testMidi", "snapshot"];

/// Receives each engine event frame as the engine wrote it (JSON text), so
/// the shell can pass it on without re-encoding.
pub type EventSink = Box<dyn Fn(&str) + Send + Sync>;

struct Inner {
    /// Held for a whole request, which is what serializes commands.
    stdin: tokio::sync::Mutex<Option<ChildStdin>>,
    pending: Mutex<Option<oneshot::Sender<Outcome>>>,
    failure: Mutex<Option<String>>,
    closing: AtomicBool,
    kill: Notify,
    timeout: Duration,
    /// Shutdown can be requested from outside the runtime (window close).
    runtime: tokio::runtime::Handle,
    events: Mutex<Option<EventSink>>,
}

impl Inner {
    fn fail(&self, error: String, quiet: bool) {
        let (failure, first) = {
            let mut failure = self.failure.lock().unwrap();
            let first = failure.is_none();
            (failure.get_or_insert(error).clone(), first)
        };
        if first && !quiet {
            log::error!("Audio engine failure {failure}");
            // Nothing polls the engine, so tell the window it stopped.
            if let Some(sink) = self.events.lock().unwrap().as_ref() {
                sink(&serde_json::json!({ "event": "failed", "error": failure }).to_string());
            }
        }
        if let Some(pending) = self.pending.lock().unwrap().take() {
            let _ = pending.send(Err(failure));
        }
    }
    fn failure(&self) -> Option<String> {
        self.failure.lock().unwrap().clone()
    }
}

#[derive(Clone)]
pub struct NativeClient {
    inner: Arc<Inner>,
}

impl NativeClient {
    /// Starts `program` with `args` and attaches to its stdio. Call it inside
    /// the Tokio runtime.
    pub fn spawn(
        program: impl AsRef<OsStr>,
        args: &[&str],
        timeout: Duration,
    ) -> std::io::Result<Self> {
        let mut command = Command::new(program);
        command.args(args);
        Self::spawn_command(command, timeout)
    }

    /// Starts a prepared command (tests run fake engines through Node).
    pub fn spawn_command(mut command: Command, timeout: Duration) -> std::io::Result<Self> {
        command
            .stdin(Stdio::piped())
            .stdout(Stdio::piped())
            .stderr(Stdio::piped())
            .kill_on_drop(true);
        #[cfg(windows)]
        command.creation_flags(0x0800_0000); // CREATE_NO_WINDOW
        let mut child = command.spawn()?;
        let stdin = child.stdin.take();
        let stdout = child.stdout.take().expect("piped stdout");
        let stderr = child.stderr.take().expect("piped stderr");
        let inner = Arc::new(Inner {
            stdin: tokio::sync::Mutex::new(stdin),
            pending: Mutex::new(None),
            failure: Mutex::new(None),
            closing: AtomicBool::new(false),
            kill: Notify::new(),
            timeout,
            runtime: tokio::runtime::Handle::current(),
            events: Mutex::new(None),
        });

        let reader_inner = inner.clone();
        let reader = tokio::spawn(async move {
            let mut lines = BufReader::new(stdout).lines();
            while let Ok(Some(line)) = lines.next_line().await {
                let Some(frame) = line.strip_prefix("BASEMENT:") else {
                    log::info!("Native: {line}");
                    continue;
                };
                match serde_json::from_str::<Value>(frame) {
                    Ok(event) if event.get("event").is_some() => {
                        if let Some(sink) = reader_inner.events.lock().unwrap().as_ref() {
                            sink(frame);
                        }
                    }
                    Ok(result) => {
                        let Some(pending) = reader_inner.pending.lock().unwrap().take() else {
                            continue;
                        };
                        let reply = match result.get("error") {
                            Some(error) if crate::json::truthy(Some(error)) => Err(error
                                .as_str()
                                .map(str::to_owned)
                                .unwrap_or_else(|| error.to_string())),
                            _ => Ok(result),
                        };
                        let _ = pending.send(reply);
                    }
                    Err(error) => reader_inner.fail(error.to_string(), false),
                }
            }
        });
        // Engine diagnostics, one log entry per non-empty line. Raw bytes, so
        // a plug-in writing invalid UTF-8 cannot stop the reader.
        tokio::spawn(async move {
            let mut reader = BufReader::new(stderr);
            let mut line = Vec::new();
            while matches!(reader.read_until(b'\n', &mut line).await, Ok(read) if read > 0) {
                let text = String::from_utf8_lossy(&line);
                let text = text.trim_end();
                if !text.is_empty() {
                    log::error!("{text}");
                }
                line.clear();
            }
        });
        let watcher_inner = inner.clone();
        tokio::spawn(async move {
            let status = tokio::select! {
                status = child.wait() => status,
                () = watcher_inner.kill.notified() => {
                    let _ = child.start_kill();
                    child.wait().await
                }
            };
            // Read every reply the engine wrote before it exited.
            let _ = reader.await;
            let closing = watcher_inner.closing.load(Ordering::SeqCst);
            log::info!("Audio engine exited {status:?} expected: {closing}");
            watcher_inner.fail(STOPPED.into(), closing);
        });
        Ok(Self { inner })
    }

    pub async fn send(&self, command: Value) -> Outcome {
        let mut stdin = self.inner.stdin.lock().await;
        if let Some(failure) = self.inner.failure() {
            return Err(failure);
        }
        let Some(pipe) = stdin.as_mut() else {
            return Err("The audio engine is closing.".into());
        };
        let op = crate::json::op(&command).to_owned();
        if !op.is_empty() && !QUIET_OPS.contains(&op.as_str()) {
            log::info!("Audio command: {op}");
        }
        let (sender, reply) = oneshot::channel();
        *self.inner.pending.lock().unwrap() = Some(sender);
        let mut line = serde_json::to_string(&command).map_err(|e| e.to_string())?;
        line.push('\n');
        if let Err(error) = async {
            pipe.write_all(line.as_bytes()).await?;
            pipe.flush().await
        }
        .await
        {
            self.inner.fail(error.to_string(), false);
        }
        let long = op == "export"
            || (op == "tempo" && command.get("match").and_then(Value::as_str) == Some("all"));
        let limit = if long {
            Duration::from_secs(1800)
        } else {
            self.inner.timeout
        };
        match tokio::time::timeout(limit, reply).await {
            Ok(Ok(result)) => result,
            Ok(Err(_)) => Err(self.inner.failure().unwrap_or_else(|| STOPPED.into())),
            Err(_) => {
                self.inner.fail(
                    format!(
                        "The audio engine timed out during {op}. Open logs for startup/device details, then restart the app."
                    ),
                    false,
                );
                Err(self.inner.failure().unwrap_or_default())
            }
        }
    }

    /// Drains an in-flight reply before ending stdin; queued and new requests
    /// reject. The engine is killed if it has not exited five seconds later.
    pub fn shutdown(&self) {
        if self.inner.closing.swap(true, Ordering::SeqCst) {
            return;
        }
        self.inner
            .failure
            .lock()
            .unwrap()
            .get_or_insert_with(|| "The audio engine is closing.".into());
        let inner = self.inner.clone();
        self.inner.runtime.clone().spawn(async move {
            inner.stdin.lock().await.take();
            tokio::time::sleep(Duration::from_secs(5)).await;
            inner.kill.notify_one();
        });
    }

    /// Sends the engine's event frames to `sink` from now on; without one
    /// they are dropped.
    pub fn on_events(&self, sink: EventSink) {
        *self.inner.events.lock().unwrap() = Some(sink);
    }

    /// Ends the process now (plug-in scans that must not linger).
    pub fn kill(&self) {
        self.inner.closing.store(true, Ordering::SeqCst);
        self.inner.kill.notify_one();
    }
}

impl Engine for NativeClient {
    fn request(&self, command: Value) -> BoxFuture<'_, Outcome> {
        Box::pin(self.send(command))
    }
    fn close(&self) {
        self.shutdown();
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use serde_json::json;
    use std::path::PathBuf;

    /// tests/fixtures/service.mjs echoes `value` after `delay`, with a
    /// diagnostic line first, and can exit, hang or write an invalid frame.
    fn fixture(timeout_ms: u64) -> NativeClient {
        let script =
            PathBuf::from(env!("CARGO_MANIFEST_DIR")).join("../tests/fixtures/service.mjs");
        let mut command = Command::new(if cfg!(windows) { "node.exe" } else { "node" });
        command.arg(script);
        NativeClient::spawn_command(command, Duration::from_millis(timeout_ms)).expect("node runs")
    }

    #[tokio::test]
    async fn replies_are_serialized_in_request_order() {
        let client = fixture(2000);
        let (a, b) = tokio::join!(
            client.send(json!({ "value": 1, "delay": 30 })),
            client.send(json!({ "value": 2 }))
        );
        assert_eq!((a.unwrap(), b.unwrap()), (json!(1), json!(2)));
        client.shutdown();
    }

    #[tokio::test]
    async fn event_frames_reach_the_sink_and_never_answer_a_request() {
        let client = fixture(2000);
        let (sender, mut received) = tokio::sync::mpsc::unbounded_channel();
        client.on_events(Box::new(move |frame| {
            let _ = sender.send(frame.to_owned());
        }));
        let reply = client
            .send(json!({ "op": "events", "value": "reply" }))
            .await;
        assert_eq!(reply.unwrap(), json!("reply"));
        for index in 0..2 {
            let frame = received.recv().await.unwrap();
            assert_eq!(
                serde_json::from_str::<Value>(&frame).unwrap(),
                json!({ "event": "state", "index": index })
            );
        }
        client.shutdown();
    }

    /// Collects the client's event frames.
    fn events(client: &NativeClient) -> tokio::sync::mpsc::UnboundedReceiver<Value> {
        let (sender, received) = tokio::sync::mpsc::unbounded_channel();
        client.on_events(Box::new(move |frame| {
            let _ = sender.send(serde_json::from_str(frame).unwrap());
        }));
        received
    }

    #[tokio::test]
    async fn an_engine_crash_tells_the_window_once_and_a_shutdown_does_not() {
        let crashed = fixture(2000);
        let mut received = events(&crashed);
        assert!(crashed.send(json!({ "op": "exit" })).await.is_err());
        let frame = received.recv().await.unwrap();
        assert_eq!(frame["event"], "failed");
        assert!(frame["error"].as_str().unwrap().contains("stopped"));
        assert!(crashed.send(json!({ "value": "late" })).await.is_err());
        tokio::time::sleep(Duration::from_millis(100)).await;
        assert!(received.try_recv().is_err(), "one notice per failure");

        let closed = fixture(2000);
        let mut quiet = events(&closed);
        closed.shutdown();
        tokio::time::sleep(Duration::from_millis(500)).await;
        assert!(
            quiet.try_recv().is_err(),
            "an expected exit is not a failure"
        );
    }

    #[tokio::test]
    async fn closing_drains_the_active_reply_and_rejects_queued_requests() {
        let client = fixture(2000);
        let first = tokio::spawn({
            let c = client.clone();
            async move { c.send(json!({ "value": "active", "delay": 100 })).await }
        });
        tokio::time::sleep(Duration::from_millis(20)).await;
        let queued = tokio::spawn({
            let c = client.clone();
            async move { c.send(json!({ "value": "queued" })).await }
        });
        tokio::time::sleep(Duration::from_millis(20)).await;
        client.shutdown();
        assert_eq!(first.await.unwrap().unwrap(), json!("active"));
        assert!(queued.await.unwrap().is_err());
        let late = client.send(json!({ "value": "after close" })).await;
        assert!(late.unwrap_err().contains("closing"));
    }

    #[tokio::test]
    async fn exits_invalid_frames_and_hangs_fail_pending_and_future_requests() {
        for op in ["exit", "invalid", "hang"] {
            let client = fixture(200);
            let (first, queued) = tokio::join!(
                client.send(json!({ "op": op })),
                client.send(json!({ "value": "queued" }))
            );
            assert!(first.is_err(), "{op} rejects the active request");
            assert!(queued.is_err(), "{op} rejects the queued request");
            assert!(client.send(json!({ "value": "late" })).await.is_err());
            client.kill();
        }
    }
}
