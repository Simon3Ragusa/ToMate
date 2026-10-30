//! Watches the workspace, tells the frontend which folders changed and keeps
//! an append-only activity log (`.board/activity.jsonl`) for the calendar.

use std::collections::BTreeSet;
use std::fs::{self, OpenOptions};
use std::io::Write;
use std::path::Path;
use std::time::Duration;

use notify::RecursiveMode;
use notify_debouncer_mini::new_debouncer;
use tauri::{AppHandle, Emitter, State};

use crate::workspace::{to_rel, Workspace, BOARD_DIR};

pub fn start(app: &AppHandle, ws: &State<Workspace>, root: &Path) -> Result<(), String> {
    let app = app.clone();
    let root_owned = root.to_path_buf();
    let mut debouncer = new_debouncer(Duration::from_millis(400), move |res: notify_debouncer_mini::DebounceEventResult| {
        let Ok(events) = res else { return };
        let mut dirs = BTreeSet::new();
        let mut files = BTreeSet::new();
        for ev in events {
            let Some(rel) = to_rel(&root_owned, &ev.path) else { continue };
            if rel.starts_with(BOARD_DIR) || rel.starts_with(".git/") || rel == ".git" || rel.split('/').any(|s| s.starts_with("~$")) {
                continue;
            }
            let parent = rel.rsplit_once('/').map(|(d, _)| d.to_string()).unwrap_or_default();
            dirs.insert(parent);
            files.insert(rel);
        }
        if dirs.is_empty() {
            return;
        }
        log_activity(&root_owned, &files);
        let _ = app.emit("fs-change", dirs.into_iter().collect::<Vec<_>>());
    })
    .map_err(|e| e.to_string())?;
    debouncer
        .watcher()
        .watch(root, RecursiveMode::Recursive)
        .map_err(|e| e.to_string())?;
    // Replacing the old debouncer drops (and stops) the previous watcher.
    *ws.watcher.lock().unwrap() = Some(debouncer);
    Ok(())
}

/// One line per touched file: whether it still exists tells "changed" from "removed".
fn log_activity(root: &Path, files: &BTreeSet<String>) {
    let dir = root.join(BOARD_DIR);
    if fs::create_dir_all(&dir).is_err() {
        return;
    }
    let Ok(mut f) = OpenOptions::new().create(true).append(true).open(dir.join("activity.jsonl")) else { return };
    let ts = chrono::Local::now().to_rfc3339();
    for rel in files {
        let abs = root.join(rel);
        if abs.is_dir() {
            continue;
        }
        let kind = if abs.exists() { "changed" } else { "removed" };
        let line = serde_json::json!({ "ts": ts, "kind": kind, "path": rel });
        let _ = writeln!(f, "{line}");
    }
}

#[tauri::command]
pub fn read_activity(ws: State<Workspace>) -> Result<String, String> {
    let p = ws.root()?.join(BOARD_DIR).join("activity.jsonl");
    Ok(fs::read_to_string(p).unwrap_or_default())
}
