//! The one network call the app makes: a quiet, best-effort check for a newer
//! GitHub release. Failures and offline use simply report no update.

use serde_json::{json, Value};
use std::cmp::Ordering;

pub const RELEASE_API: &str =
    "https://api.github.com/repos/NFMynster/basementbandapp/releases/latest";
pub const RELEASE_PAGE: &str = "https://github.com/NFMynster/basementbandapp/releases/latest";

struct Version {
    numbers: [u64; 3],
    prerelease: Vec<String>,
}

fn is_identifier(text: &str) -> bool {
    !text.is_empty()
        && text
            .chars()
            .all(|c| c.is_ascii_alphanumeric() || c == '.' || c == '-')
}

/// `v1.2.3`, `1.2.3-beta.1` or `1.2.3+build`.
fn parse_version(value: &str) -> Option<Version> {
    let text = value.trim();
    let text = text.strip_prefix('v').unwrap_or(text);
    let (text, build) = match text.split_once('+') {
        Some((core, build)) => (core, Some(build)),
        None => (text, None),
    };
    if build.is_some_and(|b| !is_identifier(b)) {
        return None;
    }
    let (core, prerelease) = match text.split_once('-') {
        Some((core, pre)) => (core, Some(pre)),
        None => (text, None),
    };
    if prerelease.is_some_and(|p| !is_identifier(p)) {
        return None;
    }
    let parts: Vec<&str> = core.split('.').collect();
    if parts.len() != 3
        || parts
            .iter()
            .any(|p| p.is_empty() || !p.bytes().all(|b| b.is_ascii_digit()))
    {
        return None;
    }
    let mut numbers = [0u64; 3];
    for (slot, part) in numbers.iter_mut().zip(parts) {
        *slot = part.parse().ok()?;
    }
    Some(Version {
        numbers,
        prerelease: prerelease
            .map(|p| p.split('.').map(str::to_owned).collect())
            .unwrap_or_default(),
    })
}

fn compare_prerelease(left: &[String], right: &[String]) -> Ordering {
    if left.is_empty() || right.is_empty() {
        // A release outranks any prerelease of the same version.
        return right.len().min(1).cmp(&left.len().min(1));
    }
    for i in 0..left.len().max(right.len()) {
        let (Some(a), Some(b)) = (left.get(i), right.get(i)) else {
            return left.len().cmp(&right.len());
        };
        if a == b {
            continue;
        }
        let a_number = a.bytes().all(|c| c.is_ascii_digit());
        let b_number = b.bytes().all(|c| c.is_ascii_digit());
        return match (a_number, b_number) {
            (true, true) => a
                .parse::<f64>()
                .unwrap_or(0.0)
                .partial_cmp(&b.parse::<f64>().unwrap_or(0.0))
                .unwrap_or(Ordering::Equal),
            (true, false) => Ordering::Less,
            (false, true) => Ordering::Greater,
            (false, false) => a.cmp(b),
        };
    }
    Ordering::Equal
}

pub fn is_newer_version(latest: &str, current: &str) -> bool {
    let (Some(left), Some(right)) = (parse_version(latest), parse_version(current)) else {
        return false;
    };
    match left.numbers.cmp(&right.numbers) {
        Ordering::Equal => {
            compare_prerelease(&left.prerelease, &right.prerelease) == Ordering::Greater
        }
        other => other == Ordering::Greater,
    }
}

/// Turns GitHub's reply into the UI's update status.
pub fn update_status(ok: bool, release: Option<&Value>, current: &str) -> Value {
    let tag = release
        .filter(|_| ok)
        .and_then(|r| r.get("tag_name"))
        .and_then(Value::as_str);
    match tag {
        Some(tag) if is_newer_version(tag, current) => json!({
            "available": true,
            "version": tag.strip_prefix('v').unwrap_or(tag),
        }),
        _ => json!({ "available": false }),
    }
}

pub async fn check_for_update(current: &str) -> Value {
    let result = async {
        let client = reqwest::Client::builder()
            .timeout(std::time::Duration::from_secs(20))
            .build()?;
        let response = client
            .get(RELEASE_API)
            .header("Accept", "application/vnd.github+json")
            .header("User-Agent", format!("Basement-Band/{current}"))
            .header("X-GitHub-Api-Version", "2022-11-28")
            .send()
            .await?;
        // A repository without a published release returns 404.
        let ok = response.status().is_success();
        let body = if ok {
            response.json::<Value>().await.ok()
        } else {
            None
        };
        Ok::<_, reqwest::Error>(update_status(ok, body.as_ref(), current))
    }
    .await;
    result.unwrap_or_else(|error| {
        log::warn!("Could not check for a Basement Band update {error}");
        json!({ "available": false })
    })
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn release_versions_are_compared_as_semver() {
        assert!(is_newer_version("v0.2.0", "0.1.9"));
        assert!(is_newer_version("0.1.1", "0.1.0"));
        assert!(!is_newer_version("0.1.0", "0.1.0"));
        assert!(!is_newer_version("0.0.9", "0.1.0"));
        assert!(is_newer_version("1.0.0", "1.0.0-beta.2"));
        assert!(!is_newer_version("1.0.0-beta.2", "1.0.0-beta.10"));
        assert!(is_newer_version("1.0.0-beta.10", "1.0.0-beta.2"));
        assert!(is_newer_version("1.0.0-beta.2.1", "1.0.0-beta.2"));
        assert!(!is_newer_version("latest", "0.1.0"));
    }

    #[test]
    fn a_newer_published_release_produces_a_quiet_update_result() {
        let current = "0.1.0";
        assert_eq!(
            update_status(true, Some(&json!({ "tag_name": "v0.2.0" })), current),
            json!({ "available": true, "version": "0.2.0" })
        );
        assert_eq!(
            update_status(false, None, current),
            json!({ "available": false })
        );
        assert_eq!(
            update_status(true, Some(&json!({ "tag_name": "v0.1.0" })), current),
            json!({ "available": false })
        );
    }
}
