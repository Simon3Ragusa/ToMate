//! PowerPoint → PDF conversion through PowerPoint's COM automation, cached in
//! `.board/cache`. A deck is re-converted only when it is newer than its PDF.

use std::collections::hash_map::DefaultHasher;
use std::fs;
use std::hash::{Hash, Hasher};
use std::process::Command;

use tauri::State;

use crate::workspace::{Workspace, BOARD_DIR};

const SCRIPT: &str = r#"
param([string]$src, [string]$dst)
$ErrorActionPreference = 'Stop'
$ppt = New-Object -ComObject PowerPoint.Application
$hadOpen = $ppt.Presentations.Count -gt 0
try {
  $p = $ppt.Presentations.Open($src, -1, 0, 0)   # ReadOnly, Untitled=false, WithWindow=false
  $p.SaveAs($dst, 32)                            # ppSaveAsPDF
  $p.Close()
} finally {
  if (-not $hadOpen) { $ppt.Quit() }
  [void][System.Runtime.InteropServices.Marshal]::ReleaseComObject($ppt)
}
"#;

/// Returns the workspace-relative path of the cached PDF.
#[tauri::command]
pub async fn pptx_to_pdf(ws: State<'_, Workspace>, path: String) -> Result<String, String> {
    let root = ws.root()?;
    let src = ws.resolve(&path)?;
    let cache = root.join(BOARD_DIR).join("cache");
    fs::create_dir_all(&cache).map_err(|e| e.to_string())?;

    let mut h = DefaultHasher::new();
    path.hash(&mut h);
    let name = format!("{:016x}.pdf", h.finish());
    let dst = cache.join(&name);
    let rel = format!("{BOARD_DIR}/cache/{name}");

    let src_time = fs::metadata(&src).and_then(|m| m.modified()).map_err(|e| e.to_string())?;
    if let Ok(t) = fs::metadata(&dst).and_then(|m| m.modified()) {
        if t >= src_time {
            return Ok(rel);
        }
    }

    let script = cache.join("convert.ps1");
    fs::write(&script, SCRIPT).map_err(|e| e.to_string())?;
    let out = tauri::async_runtime::spawn_blocking(move || {
        let mut cmd = Command::new("powershell");
        cmd.args(["-NoProfile", "-NonInteractive", "-ExecutionPolicy", "Bypass", "-File"])
            .arg(&script)
            .arg(&src)
            .arg(&dst);
        #[cfg(windows)]
        {
            use std::os::windows::process::CommandExt;
            cmd.creation_flags(0x0800_0000); // CREATE_NO_WINDOW
        }
        cmd.output()
    })
    .await
    .map_err(|e| e.to_string())?
    .map_err(|e| e.to_string())?;

    if !out.status.success() {
        return Err(format!(
            "PowerPoint conversion failed: {}",
            String::from_utf8_lossy(&out.stderr).trim()
        ));
    }
    Ok(rel)
}
