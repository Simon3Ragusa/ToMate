//! Findings: read exported digest files from a folder the user
//! picked. Only `YYYY-MM-DD.json` files directly inside it are read (no
//! recursion, no paths taken from file content), with a size cap per file.
//! Validation of the content happens in the frontend.

use std::fs;
use std::path::Path;

use serde::Serialize;

const MAX_FILE_BYTES: u64 = 4 * 1024 * 1024;
const MAX_FILES: usize = 2000;

#[derive(Serialize)]
pub struct DigestFile {
    name: String,
    text: Option<String>,
    /// Why the file could not be read, if it could not.
    error: Option<String>,
}

fn is_digest_name(name: &str) -> bool {
    let b = name.as_bytes();
    name.len() == 15
        && name.to_ascii_lowercase().ends_with(".json")
        && b[..10].iter().enumerate().all(|(i, c)| if i == 4 || i == 7 { *c == b'-' } else { c.is_ascii_digit() })
}

#[tauri::command]
pub fn read_digest_dir(path: String) -> Result<Vec<DigestFile>, String> {
    let dir = Path::new(&path);
    if !dir.is_dir() {
        return Err(format!("The findings folder was not found: {path}"));
    }
    let mut out: Vec<DigestFile> = fs::read_dir(dir)
        .map_err(|e| e.to_string())?
        .filter_map(|e| e.ok())
        .filter(|e| e.file_type().map(|t| t.is_file()).unwrap_or(false))
        .filter_map(|e| {
            let name = e.file_name().to_string_lossy().into_owned();
            is_digest_name(&name).then_some((name, e))
        })
        .take(MAX_FILES)
        .map(|(name, e)| match e.metadata() {
            Ok(m) if m.len() > MAX_FILE_BYTES => DigestFile { name, text: None, error: Some("larger than 4 MB, skipped".into()) },
            Ok(_) => match fs::read_to_string(e.path()) {
                Ok(text) => DigestFile { name, text: Some(text), error: None },
                Err(err) => DigestFile { name, text: None, error: Some(err.to_string()) },
            },
            Err(err) => DigestFile { name, text: None, error: Some(err.to_string()) },
        })
        .collect();
    out.sort_by(|a, b| a.name.cmp(&b.name));
    Ok(out)
}

/// Brings the local cache of a feed repository's `data/findings`
/// up to date and returns that folder. The cache is a shallow, sparse git
/// checkout in the app's own data directory (outside the workspace and any
/// synced folder); git handles authentication through the user's existing
/// credential manager, so no token ever passes through the app.
#[tauri::command]
pub async fn sync_radar(app: tauri::AppHandle, repo: String) -> Result<String, String> {
    use tauri::Manager;
    if !is_repo_slug(&repo) {
        return Err(format!("\"{repo}\" is not a GitHub repository name like owner/name"));
    }
    let base = app.path().app_local_data_dir().map_err(|e| e.to_string())?;
    let dir = base.join("radar");
    tauri::async_runtime::spawn_blocking(move || {
        let url = format!("https://github.com/{repo}.git");
        let fresh = !dir.join(".git").is_dir();
        if fresh {
            let _ = fs::remove_dir_all(&dir); // half-made cache from an interrupted first sync
            fs::create_dir_all(&base).map_err(|e| e.to_string())?;
            git(&base, &["clone", "--depth", "1", "--filter=blob:none", "--sparse", &url, "radar"])?;
            git(&dir, &["sparse-checkout", "set", "data/findings"])?;
        } else {
            git(&dir, &["remote", "set-url", "origin", &url])?;
            git(&dir, &["fetch", "--depth", "1", "origin", "HEAD"])?;
            // A read-only cache: always mirror the remote exactly.
            git(&dir, &["reset", "--hard", "FETCH_HEAD"])?;
        }
        Ok(dir.join("data").join("findings").to_string_lossy().into_owned())
    })
    .await
    .map_err(|e| e.to_string())?
}

fn is_repo_slug(s: &str) -> bool {
    let mut parts = s.split('/');
    let ok = |p: Option<&str>| p.is_some_and(|p| !p.is_empty() && p.len() <= 100 && p.chars().all(|c| c.is_ascii_alphanumeric() || "-_.".contains(c)) && p != "." && p != "..");
    ok(parts.next()) && ok(parts.next()) && parts.next().is_none()
}

/// Runs git without a console window and without terminal prompts (a missing
/// login fails fast, or shows the credential manager's own sign-in window).
fn git(cwd: &Path, args: &[&str]) -> Result<(), String> {
    use std::process::{Command, Stdio};
    use std::time::{Duration, Instant};
    let mut cmd = Command::new("git");
    cmd.args(args).current_dir(cwd).env("GIT_TERMINAL_PROMPT", "0").stdin(Stdio::null()).stdout(Stdio::null()).stderr(Stdio::piped());
    #[cfg(windows)]
    {
        use std::os::windows::process::CommandExt;
        cmd.creation_flags(0x0800_0000); // CREATE_NO_WINDOW
    }
    let mut child = cmd.spawn().map_err(|_| "Git is not installed or not on PATH".to_string())?;
    let start = Instant::now();
    loop {
        if let Some(status) = child.try_wait().map_err(|e| e.to_string())? {
            if status.success() {
                return Ok(());
            }
            let mut err = String::new();
            if let Some(mut s) = child.stderr.take() {
                use std::io::Read;
                let _ = s.read_to_string(&mut err);
            }
            return Err(git_error(&err));
        }
        if start.elapsed() > Duration::from_secs(90) {
            let _ = child.kill();
            return Err("GitHub did not answer within 90 seconds (offline?)".into());
        }
        std::thread::sleep(Duration::from_millis(100));
    }
}

fn git_error(stderr: &str) -> String {
    let s = stderr.to_lowercase();
    if s.contains("authentication") || s.contains("could not read username") || s.contains("terminal prompts disabled") {
        "GitHub sign-in is needed: run any git command on this repo once (e.g. git ls-remote) and sign in".into()
    } else if s.contains("repository not found") || s.contains("not found") {
        "the repository was not found, or this GitHub account can't access it".into()
    } else if s.contains("could not resolve host") || s.contains("unable to access") {
        "GitHub can't be reached (offline?)".into()
    } else {
        // First meaningful line only; git's stderr never contains credentials.
        stderr.lines().map(str::trim).find(|l| !l.is_empty()).unwrap_or("git failed").chars().take(200).collect()
    }
}

#[cfg(test)]
mod tests {
    use super::is_digest_name;


    #[test]
    fn digest_names() {
        assert!(is_digest_name("2026-10-30.json"));
        assert!(is_digest_name("2026-10-30.JSON"));
        assert!(!is_digest_name("index.json"));
        assert!(!is_digest_name("2026-10-30.json.bak"));
        assert!(!is_digest_name("../2026-10-3.json"));
    }

    #[test]
    fn repo_slugs() {
        use super::is_repo_slug;
        assert!(is_repo_slug("octo-org/research-feed"));
        assert!(!is_repo_slug("octo-org"));
        assert!(!is_repo_slug("a/b/c"));
        assert!(!is_repo_slug("../x"));
        assert!(!is_repo_slug("a/b; rm -rf"));
        assert!(!is_repo_slug("https://github.com/a/b"));
    }
}
