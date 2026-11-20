//! Lexical path helpers matching Node's `path.resolve` and `path.relative`,
//! which saved sessions rely on for portable media paths.

use std::path::{Component, Path, PathBuf};

/// Absolute, with `.` and `..` folded lexically (symlinks are not followed).
pub fn resolve(path: impl AsRef<Path>) -> PathBuf {
    let path = path.as_ref();
    let absolute = if path.is_absolute() {
        path.to_path_buf()
    } else {
        std::env::current_dir().unwrap_or_default().join(path)
    };
    normalize(&absolute)
}

pub fn normalize(path: &Path) -> PathBuf {
    let mut out = PathBuf::new();
    for component in path.components() {
        match component {
            Component::CurDir => {}
            Component::ParentDir => {
                // Never climb above the root or prefix.
                if matches!(out.components().next_back(), Some(Component::Normal(_))) {
                    out.pop();
                }
            }
            other => out.push(other.as_os_str()),
        }
    }
    out
}

fn same_component(a: &Component, b: &Component) -> bool {
    if cfg!(windows) {
        a.as_os_str().to_string_lossy().to_lowercase()
            == b.as_os_str().to_string_lossy().to_lowercase()
    } else {
        a == b
    }
}

/// The path from `from` to `to`; on Windows across drives it is `to` itself.
pub fn relative(from: &Path, to: &Path) -> PathBuf {
    let from = resolve(from);
    let to = resolve(to);
    let a: Vec<Component> = from.components().collect();
    let b: Vec<Component> = to.components().collect();
    if let (Some(first_a), Some(first_b)) = (a.first(), b.first()) {
        if !same_component(first_a, first_b) {
            return to;
        }
    }
    let common = a
        .iter()
        .zip(b.iter())
        .take_while(|(x, y)| same_component(x, y))
        .count();
    let mut out = PathBuf::new();
    for _ in common..a.len() {
        out.push("..");
    }
    for component in &b[common..] {
        out.push(component.as_os_str());
    }
    out
}

/// `path.extname`: the extension with its dot, or "" (also for dotfiles).
pub fn extname(path: &Path) -> String {
    path.extension()
        .map(|ext| format!(".{}", ext.to_string_lossy()))
        .unwrap_or_default()
}

/// `path.parse(file).name`.
pub fn stem(path: &Path) -> String {
    path.file_stem()
        .map(|stem| stem.to_string_lossy().into_owned())
        .unwrap_or_default()
}

pub fn has_extension(path: &str, extensions: &[&str]) -> bool {
    let lower = path.to_lowercase();
    extensions
        .iter()
        .any(|ext| lower.ends_with(&format!(".{ext}")))
}

pub fn display(path: &Path) -> String {
    path.to_string_lossy().into_owned()
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn relative_paths_walk_up_from_the_document_folder() {
        let base = resolve("work/session");
        let media = resolve("work/session/Jam.basement.audio/a.wav");
        assert_eq!(
            relative(&base, &media),
            PathBuf::from("Jam.basement.audio").join("a.wav")
        );
        let sibling = resolve("work/other/b.wav");
        assert_eq!(
            relative(&base, &sibling),
            PathBuf::from("..").join("other").join("b.wav")
        );
        assert_eq!(resolve("a/./b/../c"), resolve("a/c"));
    }

    #[test]
    fn names_follow_node() {
        assert_eq!(extname(Path::new("riff.WAV")), ".WAV");
        assert_eq!(extname(Path::new("noext")), "");
        assert_eq!(stem(Path::new("/x/My riff.wav")), "My riff");
        assert!(has_extension("C:/a/B.Vst3", &["vst3"]));
    }
}
