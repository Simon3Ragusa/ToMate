//! PowerPoint → PDF conversion through PowerPoint's COM automation, cached in
//! `.board/cache`. A deck is re-converted only when it is newer than its PDF.

use std::collections::hash_map::DefaultHasher;
use std::fs;
use std::hash::{Hash, Hasher};
use std::process::Command;

use tauri::State;

use crate::workspace::{Workspace, BOARD_DIR};

#[cfg(windows)]
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

#[cfg(target_os = "macos")]
const APPLESCRIPT: &str = r#"
on run argv
  set src to POSIX file (item 1 of argv)
  set dst to POSIX file (item 2 of argv)
  tell application "Microsoft PowerPoint"
    set deck to open src
    save deck in dst as save as PDF
    close deck saving no
  end tell
end run
"#;

#[cfg(target_os = "macos")]
fn convert_with_powerpoint(src: &std::path::Path, dst: &std::path::Path) -> Result<(), String> {
    let out = Command::new("osascript")
        .args(["-e", APPLESCRIPT, "--"])
        .arg(src)
        .arg(dst)
        .output()
        .map_err(|e| e.to_string())?;
    if out.status.success() && dst.exists() {
        Ok(())
    } else {
        Err(String::from_utf8_lossy(&out.stderr).trim().to_owned())
    }
}

#[cfg(not(windows))]
fn convert_with_libreoffice(src: &std::path::Path, dst: &std::path::Path) -> Result<(), String> {
    let cache = dst.parent().ok_or("Invalid cache path")?;
    let program = if cfg!(target_os = "macos") {
        "/Applications/LibreOffice.app/Contents/MacOS/soffice"
    } else {
        "soffice"
    };
    let out = Command::new(program)
        .args(["--headless", "--convert-to", "pdf", "--outdir"])
        .arg(cache)
        .arg(src)
        .output()
        .map_err(|e| format!("LibreOffice is not installed: {e}"))?;
    let produced = cache.join(src.file_stem().ok_or("Invalid slide filename")?).with_extension("pdf");
    if !out.status.success() || !produced.exists() {
        return Err(String::from_utf8_lossy(&out.stderr).trim().to_owned());
    }
    if produced != dst {
        fs::rename(produced, dst).map_err(|e| e.to_string())?;
    }
    Ok(())
}

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

    #[cfg(windows)]
    let script = {
        let script = cache.join("convert.ps1");
        fs::write(&script, SCRIPT).map_err(|e| e.to_string())?;
        script
    };
    let out = tauri::async_runtime::spawn_blocking(move || {
        #[cfg(windows)]
        {
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
        return cmd.output().map_err(|e| e.to_string()).and_then(|out| {
            if out.status.success() { Ok(()) } else { Err(String::from_utf8_lossy(&out.stderr).trim().to_owned()) }
        });
        }
        #[cfg(target_os = "macos")]
        {
            convert_with_powerpoint(&src, &dst).or_else(|powerpoint| {
                convert_with_libreoffice(&src, &dst)
                    .map_err(|libreoffice| format!("PowerPoint: {powerpoint}; LibreOffice: {libreoffice}"))
            })
        }
        #[cfg(all(not(windows), not(target_os = "macos")))]
        {
            convert_with_libreoffice(&src, &dst)
        }
    })
    .await
    .map_err(|e| e.to_string())?;

    if let Err(message) = out {
        return Err(format!("Slide conversion failed: {message}"));
    }
    Ok(rel)
}
