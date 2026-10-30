//! File-system commands, all scoped to the open workspace.

use std::fs;
use std::time::UNIX_EPOCH;

use serde::Serialize;
use tauri::ipc::Response;
use tauri::{AppHandle, Manager, State};
use tauri_plugin_opener::OpenerExt;

use crate::watch;
use crate::workspace::{to_rel, Workspace, BOARD_DIR};

#[derive(Serialize)]
pub struct Entry {
    name: String,
    path: String,
    is_dir: bool,
    size: u64,
    /// Milliseconds since the Unix epoch.
    modified: u64,
    created: u64,
}

fn millis(t: std::io::Result<std::time::SystemTime>) -> u64 {
    t.ok()
        .and_then(|t| t.duration_since(UNIX_EPOCH).ok())
        .map(|d| d.as_millis() as u64)
        .unwrap_or(0)
}

fn hidden(name: &str) -> bool {
    name == BOARD_DIR || name == ".git" || name.starts_with("~$") || name == "desktop.ini" || name == "Thumbs.db"
}

fn entry(root: &std::path::Path, p: &std::path::Path) -> Option<Entry> {
    let meta = fs::metadata(p).ok()?;
    Some(Entry {
        name: p.file_name()?.to_string_lossy().into_owned(),
        path: to_rel(root, p)?,
        is_dir: meta.is_dir(),
        size: meta.len(),
        modified: millis(meta.modified()),
        created: millis(meta.created()),
    })
}

fn config_file(app: &AppHandle) -> Option<std::path::PathBuf> {
    app.path().app_config_dir().ok().map(|d| d.join("last_workspace.txt"))
}

#[tauri::command]
pub fn open_workspace(app: AppHandle, ws: State<Workspace>, path: String) -> Result<String, String> {
    let root = dunce_canonical(&path)?;
    if !root.is_dir() {
        return Err("Not a folder".into());
    }
    *ws.root.lock().unwrap() = Some(root.clone());
    watch::start(&app, &ws, &root)?;
    if let Some(f) = config_file(&app) {
        let _ = fs::create_dir_all(f.parent().unwrap());
        let _ = fs::write(f, root.to_string_lossy().as_bytes());
    }
    Ok(root.to_string_lossy().into_owned())
}

#[tauri::command]
pub fn last_workspace(app: AppHandle) -> Option<String> {
    let s = fs::read_to_string(config_file(&app)?).ok()?;
    std::path::Path::new(&s).is_dir().then_some(s)
}

/// Canonicalizes without the `\\?\` prefix Windows adds.
fn dunce_canonical(path: &str) -> Result<std::path::PathBuf, String> {
    let p = fs::canonicalize(path).map_err(|e| e.to_string())?;
    let s = p.to_string_lossy();
    Ok(s.strip_prefix(r"\\?\").map(Into::into).unwrap_or(p.clone()))
}

#[tauri::command]
pub fn list_dir(ws: State<Workspace>, path: String) -> Result<Vec<Entry>, String> {
    let root = ws.root()?;
    let dir = ws.resolve(&path)?;
    let mut out: Vec<Entry> = fs::read_dir(&dir)
        .map_err(|e| e.to_string())?
        .filter_map(|e| e.ok())
        .filter(|e| !hidden(&e.file_name().to_string_lossy()))
        .filter_map(|e| entry(&root, &e.path()))
        .collect();
    out.sort_by(|a, b| b.is_dir.cmp(&a.is_dir).then(a.name.to_lowercase().cmp(&b.name.to_lowercase())));
    Ok(out)
}

/// Every file in the workspace (for recents, search and the calendar).
#[tauri::command]
pub fn list_all(ws: State<Workspace>) -> Result<Vec<Entry>, String> {
    let root = ws.root()?;
    let mut out = Vec::new();
    let mut stack = vec![root.clone()];
    while let Some(dir) = stack.pop() {
        let Ok(rd) = fs::read_dir(&dir) else { continue };
        for e in rd.flatten() {
            let name = e.file_name().to_string_lossy().into_owned();
            if hidden(&name) || name == "node_modules" || name == ".git" {
                continue;
            }
            if let Some(en) = entry(&root, &e.path()) {
                if en.is_dir {
                    stack.push(e.path());
                } else {
                    out.push(en);
                }
            }
        }
    }
    Ok(out)
}

#[tauri::command]
pub fn read_text(ws: State<Workspace>, path: String) -> Result<String, String> {
    let bytes = fs::read(ws.resolve(&path)?).map_err(|e| e.to_string())?;
    Ok(String::from_utf8_lossy(&bytes).into_owned())
}

#[tauri::command]
pub fn read_bytes(ws: State<Workspace>, path: String) -> Result<Response, String> {
    fs::read(ws.resolve(&path)?).map(Response::new).map_err(|e| e.to_string())
}

#[tauri::command]
pub fn write_text(ws: State<Workspace>, path: String, content: String) -> Result<(), String> {
    fs::write(ws.resolve(&path)?, content).map_err(|e| e.to_string())
}

#[tauri::command]
pub fn create_file(ws: State<Workspace>, path: String, content: Option<String>) -> Result<(), String> {
    let p = ws.resolve(&path)?;
    if p.exists() {
        return Err("A file with this name already exists".into());
    }
    if let Some(parent) = p.parent() {
        fs::create_dir_all(parent).map_err(|e| e.to_string())?;
    }
    fs::write(p, content.unwrap_or_default()).map_err(|e| e.to_string())
}

#[tauri::command]
pub fn create_dir(ws: State<Workspace>, path: String) -> Result<(), String> {
    let p = ws.resolve(&path)?;
    if p.exists() {
        return Err("A folder with this name already exists".into());
    }
    fs::create_dir_all(p).map_err(|e| e.to_string())
}

#[tauri::command]
pub fn rename(ws: State<Workspace>, from: String, to: String) -> Result<(), String> {
    let (a, b) = (ws.resolve(&from)?, ws.resolve(&to)?);
    if b.exists() {
        return Err("Destination already exists".into());
    }
    fs::rename(a, b).map_err(|e| e.to_string())
}

/// First free name in `dir`: "name.ext", "name (1).ext", "name (2).ext", ...
fn unique_target(dir: &std::path::Path, name: &str) -> std::path::PathBuf {
    let p = dir.join(name);
    if !p.exists() {
        return p;
    }
    let (stem, ext) = match name.rfind('.') {
        Some(i) if i > 0 => (&name[..i], &name[i..]),
        _ => (name, ""),
    };
    (1..)
        .map(|n| dir.join(format!("{stem} ({n}){ext}")))
        .find(|p| !p.exists())
        .unwrap()
}

fn copy_recursive(src: &std::path::Path, dst: &std::path::Path) -> std::io::Result<()> {
    if src.is_dir() {
        fs::create_dir_all(dst)?;
        for e in fs::read_dir(src)? {
            let e = e?;
            copy_recursive(&e.path(), &dst.join(e.file_name()))?;
        }
        Ok(())
    } else {
        fs::copy(src, dst).map(|_| ())
    }
}

/// Copies files or folders dropped from outside into a workspace folder.
/// Returns the new workspace-relative paths.
#[tauri::command]
pub fn import_paths(ws: State<Workspace>, paths: Vec<String>, dir: String) -> Result<Vec<String>, String> {
    let root = ws.root()?;
    let target = ws.resolve(&dir)?;
    let mut out = Vec::new();
    for src in paths {
        let src = std::path::PathBuf::from(src);
        // Dropping something that already lives in the workspace onto it would duplicate it in place.
        if src.starts_with(&root) && src.parent() == Some(target.as_path()) {
            continue;
        }
        let name = src.file_name().ok_or("Invalid path")?.to_string_lossy().into_owned();
        let dst = unique_target(&target, &name);
        copy_recursive(&src, &dst).map_err(|e| format!("{name}: {e}"))?;
        out.push(to_rel(&root, &dst).unwrap_or_default());
    }
    Ok(out)
}

/// Moves an entry into another workspace folder, keeping its name.
#[tauri::command]
pub fn move_entry(ws: State<Workspace>, from: String, dir: String) -> Result<String, String> {
    let root = ws.root()?;
    let src = ws.resolve(&from)?;
    let target = ws.resolve(&dir)?;
    if target.starts_with(&src) {
        return Err("Cannot move a folder into itself".into());
    }
    let name = src.file_name().ok_or("Invalid path")?;
    let dst = target.join(name);
    if dst.exists() {
        return Err(format!("\"{}\" already exists there", name.to_string_lossy()));
    }
    fs::rename(&src, &dst).map_err(|e| e.to_string())?;
    Ok(to_rel(&root, &dst).unwrap_or_default())
}

/// Extensions Windows executes when "opened" rather than showing a document.
fn is_executable(p: &std::path::Path) -> bool {
    const EXEC: &[&str] = &[
        "exe", "com", "bat", "cmd", "msi", "msp", "scr", "pif", "cpl", "lnk", "url", "ps1", "psm1", "vbs", "vbe",
        "js", "jse", "wsf", "wsh", "hta", "reg", "jar", "appref-ms", "application", "gadget", "inf", "sct",
    ];
    p.extension()
        .and_then(|e| e.to_str())
        .is_some_and(|e| EXEC.contains(&e.to_ascii_lowercase().as_str()))
}

/// Moves to the Recycle Bin, never a hard delete.
#[tauri::command]
pub fn delete(ws: State<Workspace>, path: String) -> Result<(), String> {
    if path.trim_matches('/').is_empty() {
        return Err("Cannot delete the workspace root".into());
    }
    trash::delete(ws.resolve(&path)?).map_err(|e| e.to_string())
}

#[tauri::command]
pub fn open_external(app: AppHandle, ws: State<Workspace>, path: String) -> Result<(), String> {
    let p = ws.resolve(&path)?;
    if is_executable(&p) {
        // A shared folder could contain anything: programs and scripts are only started from Explorer.
        return Err("ToMate does not run programs or scripts. Use Show in Explorer to start it yourself".into());
    }
    app.opener()
        .open_path(p.to_string_lossy(), None::<&str>)
        .map_err(|e| e.to_string())
}

#[tauri::command]
pub fn reveal(app: AppHandle, ws: State<Workspace>, path: String) -> Result<(), String> {
    let p = ws.resolve(&path)?;
    app.opener().reveal_item_in_dir(p).map_err(|e| e.to_string())
}

#[cfg(test)]
mod tests {
    use super::is_executable;
    use std::path::Path;

    #[test]
    fn executables_are_refused_documents_are_not() {
        for p in ["setup.exe", "run.BAT", "x.ps1", "link.lnk", "a.b.vbs", "site.url"] {
            assert!(is_executable(Path::new(p)), "{p}");
        }
        for p in ["notes.md", "deck.pptx", "paper.pdf", "data.xlsx", "Makefile", "image.png"] {
            assert!(!is_executable(Path::new(p)), "{p}");
        }
    }
}
