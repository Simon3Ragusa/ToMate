//! Workspace state and path scoping. Every path coming from the frontend is
//! relative to the workspace root and is resolved through `resolve`, which
//! rejects anything that could escape the root.

use std::path::{Component, Path, PathBuf};
use std::sync::Mutex;

use notify_debouncer_mini::Debouncer;

/// Folder for app data that lives inside the workspace (cache, activity log).
pub const BOARD_DIR: &str = ".board";

#[derive(Default)]
pub struct Workspace {
    pub root: Mutex<Option<PathBuf>>,
    pub watcher: Mutex<Option<Debouncer<notify::RecommendedWatcher>>>,
}

impl Workspace {
    pub fn root(&self) -> Result<PathBuf, String> {
        self.root
            .lock()
            .unwrap()
            .clone()
            .ok_or_else(|| "No workspace open".to_string())
    }

    /// Joins `rel` onto the root, refusing absolute paths and `..` segments.
    pub fn resolve(&self, rel: &str) -> Result<PathBuf, String> {
        let root = self.root()?;
        let rel = Path::new(rel);
        for c in rel.components() {
            match c {
                Component::Normal(_) | Component::CurDir => {}
                _ => return Err(format!("Path outside workspace: {}", rel.display())),
            }
        }
        Ok(root.join(rel))
    }
}

/// Converts an absolute path back to a forward-slash path relative to `root`.
pub fn to_rel(root: &Path, abs: &Path) -> Option<String> {
    abs.strip_prefix(root)
        .ok()
        .map(|p| p.to_string_lossy().replace('\\', "/"))
}
