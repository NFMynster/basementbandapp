//! Diagnostic log: `main.log` in the logs folder, rotated at 4 MiB, plus
//! stderr. Logging must never break audio startup.

use std::io::Write;
use std::path::{Path, PathBuf};
use std::sync::Mutex;
use std::time::{SystemTime, UNIX_EPOCH};

struct FileLogger {
    file: Option<Mutex<std::fs::File>>,
}

/// UTC ISO-8601 with milliseconds, like `Date.prototype.toISOString`.
pub fn iso_timestamp(time: SystemTime) -> String {
    let since = time.duration_since(UNIX_EPOCH).unwrap_or_default();
    let seconds = since.as_secs() as i64;
    let (days, rest) = (seconds.div_euclid(86_400), seconds.rem_euclid(86_400));
    // Civil date from days since 1970-01-01 (Howard Hinnant's algorithm).
    let z = days + 719_468;
    let era = z.div_euclid(146_097);
    let doe = z - era * 146_097;
    let yoe = (doe - doe / 1460 + doe / 36_524 - doe / 146_096) / 365;
    let doy = doe - (365 * yoe + yoe / 4 - yoe / 100);
    let mp = (5 * doy + 2) / 153;
    let day = doy - (153 * mp + 2) / 5 + 1;
    let month = if mp < 10 { mp + 3 } else { mp - 9 };
    let year = yoe + era * 400 + i64::from(month <= 2);
    format!(
        "{year:04}-{month:02}-{day:02}T{:02}:{:02}:{:02}.{:03}Z",
        rest / 3600,
        rest % 3600 / 60,
        rest % 60,
        since.subsec_millis()
    )
}

impl log::Log for FileLogger {
    fn enabled(&self, metadata: &log::Metadata) -> bool {
        metadata.level() <= log::Level::Info
            && (metadata.target().starts_with("basement")
                || metadata.target().starts_with("session_host")
                || metadata.level() <= log::Level::Warn)
    }

    fn log(&self, record: &log::Record) {
        if !self.enabled(record.metadata()) {
            return;
        }
        let level = match record.level() {
            log::Level::Error => "error",
            log::Level::Warn => "warn",
            _ => "log",
        };
        let line = format!(
            "{} [{level}] {}\n",
            iso_timestamp(SystemTime::now()),
            record.args()
        );
        if let Some(file) = &self.file {
            if let Ok(mut file) = file.lock() {
                let _ = file.write_all(line.as_bytes());
            }
        }
        eprint!("{line}");
    }

    fn flush(&self) {}
}

fn open_log(directory: &Path) -> Option<std::fs::File> {
    if let Err(error) = std::fs::create_dir_all(directory) {
        eprintln!("Could not create diagnostic log directory {error}");
        return None;
    }
    let file = directory.join("main.log");
    if std::fs::metadata(&file).is_ok_and(|m| m.len() > 4 * 1024 * 1024) {
        let previous = PathBuf::from(format!("{}.previous", file.display()));
        let _ = std::fs::remove_file(&previous);
        if let Err(error) = std::fs::rename(&file, &previous) {
            eprintln!("Could not rotate diagnostic log {error}");
        }
    }
    std::fs::OpenOptions::new()
        .create(true)
        .append(true)
        .open(&file)
        .map_err(|error| eprintln!("Could not open diagnostic log {error}"))
        .ok()
}

/// Installs the logger; `directory` of `None` logs to stderr only.
pub fn initialize(directory: Option<&Path>) {
    let logger = FileLogger {
        file: directory.and_then(open_log).map(Mutex::new),
    };
    if log::set_boxed_logger(Box::new(logger)).is_ok() {
        log::set_max_level(log::LevelFilter::Info);
    }
    log::info!(
        "Starting Basement Band {{ platform: {}, arch: {} }}",
        std::env::consts::OS,
        std::env::consts::ARCH
    );
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::time::Duration;

    #[test]
    fn timestamps_match_iso_strings() {
        let time = UNIX_EPOCH + Duration::from_millis(1_763_640_000_123);
        assert_eq!(iso_timestamp(time), "2025-11-20T12:00:00.123Z");
        assert_eq!(iso_timestamp(UNIX_EPOCH), "1970-01-01T00:00:00.000Z");
    }
}
