//! macOS microphone permission. Without it the engine starts output-only, so
//! playback still works and the app explains how to allow recording.

/// True when audio input may be opened. Prompts only while undetermined.
pub async fn microphone_access() -> bool {
    if std::env::var("BASEMENT_TEST_DEVICE").as_deref() == Ok("1") {
        return true;
    }
    platform::microphone_access().await
}

/// The decision table, kept separate so it is testable on every platform.
pub fn decide(status: Status, ask: impl FnOnce() -> bool) -> bool {
    match status {
        Status::Granted => true,
        Status::NotDetermined => ask(),
        Status::Denied | Status::Restricted => false,
    }
}

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum Status {
    NotDetermined,
    Restricted,
    Denied,
    Granted,
}

#[cfg(not(target_os = "macos"))]
mod platform {
    pub async fn microphone_access() -> bool {
        true
    }
}

#[cfg(target_os = "macos")]
mod platform {
    use super::{decide, Status};
    use block2::RcBlock;
    use objc2::runtime::Bool;
    use objc2_av_foundation::{AVAuthorizationStatus, AVCaptureDevice, AVMediaTypeAudio};
    use std::sync::Mutex;

    fn status() -> Status {
        let Some(media) = (unsafe { AVMediaTypeAudio }) else {
            return Status::Denied;
        };
        let status = unsafe { AVCaptureDevice::authorizationStatusForMediaType(media) };
        match status {
            AVAuthorizationStatus::Authorized => Status::Granted,
            AVAuthorizationStatus::NotDetermined => Status::NotDetermined,
            AVAuthorizationStatus::Restricted => Status::Restricted,
            _ => Status::Denied,
        }
    }

    /// Starts the system prompt. Kept synchronous so the block, which is not
    /// `Send`, is dropped before the caller awaits (AVFoundation copies it).
    fn request(sender: tokio::sync::oneshot::Sender<bool>) -> bool {
        let Some(media) = (unsafe { AVMediaTypeAudio }) else {
            return false;
        };
        let sender = Mutex::new(Some(sender));
        let block = RcBlock::new(move |granted: Bool| {
            if let Some(sender) = sender.lock().unwrap().take() {
                let _ = sender.send(granted.as_bool());
            }
        });
        unsafe { AVCaptureDevice::requestAccessForMediaType_completionHandler(media, &block) };
        true
    }

    async fn ask() -> bool {
        let (sender, receiver) = tokio::sync::oneshot::channel::<bool>();
        if !request(sender) {
            return false;
        }
        receiver.await.unwrap_or(false)
    }

    pub async fn microphone_access() -> bool {
        let status = status();
        log::info!("Microphone permission: {status:?}");
        let granted = if status == Status::NotDetermined {
            ask().await
        } else {
            decide(status, || false)
        };
        log::info!(
            "Microphone permission result: {}",
            if granted {
                "granted"
            } else {
                "denied; starting output-only"
            }
        );
        granted
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn prompts_only_when_undetermined_and_denial_means_output_only() {
        for (status, answer, expected, asks) in [
            (Status::NotDetermined, true, true, 1),
            (Status::NotDetermined, false, false, 1),
            (Status::Granted, false, true, 0),
            (Status::Denied, true, false, 0),
            (Status::Restricted, true, false, 0),
        ] {
            let mut called = 0;
            assert_eq!(
                decide(status, || {
                    called += 1;
                    answer
                }),
                expected
            );
            assert_eq!(called, asks);
        }
    }
}
