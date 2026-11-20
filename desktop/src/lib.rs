#![recursion_limit = "256"]
//! The desktop layer of Basement Band: everything between the sandboxed UI and
//! the native audio engine. `main.rs` wires these modules into the Tauri app;
//! `bin/session-host.rs` exposes the same session layer to the Node tests.

pub mod audio_device;
pub mod contract;
pub mod history;
pub mod ipc;
pub mod json;
pub mod logging;
pub mod native_client;
pub mod paths;
pub mod permissions;
pub mod plugin_library;
pub mod session_files;
pub mod session_service;
pub mod session_storage;
pub mod starter_sounds;
pub mod updates;

use std::future::Future;
use std::pin::Pin;

/// A boxed, sendable future; keeps the engine and request traits object-safe.
pub type BoxFuture<'a, T> = Pin<Box<dyn Future<Output = T> + Send + 'a>>;

/// Every desktop operation reports failures as a user-facing message.
pub type Outcome<T = serde_json::Value> = Result<T, String>;
