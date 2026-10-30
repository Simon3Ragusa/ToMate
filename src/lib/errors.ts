// Turns raw errors (Rust io::Error text, Tauri IPC errors, JS exceptions)
// into short messages that say what happened and what to do about it.

const RULES: [RegExp, string][] = [
  [/os error 32\b|being used by another process/i, "it is open in another program. Close it there and try again"],
  [/os error 33\b|locked a portion/i, "another program has locked it. Close it there and try again"],
  [/os error 5\b|access is denied|permission denied/i, "Windows denied access. The file may be open elsewhere, read-only, or still syncing with OneDrive"],
  [/os error 2\b|os error 3\b|cannot find the (file|path)|no such file/i, "it no longer exists. It may have been moved, renamed or deleted"],
  [/os error 183\b|os error 80\b|already exists/i, "something with that name is already there"],
  [/os error 112\b|not enough space|disk full/i, "the disk is full"],
  [/os error 123\b|syntax is incorrect|invalid (file ?name|path)/i, 'the name contains characters Windows does not allow (\\ / : * ? " < > |)'],
  [/os error 206\b|name too long|path too long/i, "the path is too long for Windows. Use a shorter name or a less nested folder"],
  [/os error 145\b|directory is not empty/i, "the folder is not empty"],
  [/os error 1920\b|cannot be accessed by the system/i, "OneDrive has not downloaded this file yet. Open it in Explorer once, then retry"],
  [/os error 362\b|cloud file provider is not running/i, "OneDrive is not running, so this online-only file can't be opened"],
  [/Path outside workspace/i, "that path is outside the open folder"],
  [/No workspace/i, "no folder is open"],
  [/PowerPoint|0x800A|COM/i, "PowerPoint could not convert the deck. Check that PowerPoint is installed and not showing a dialog"],
  [/Failed to fetch|NetworkError|timed out/i, "the network request failed. Check your connection and retry"],
  [/Unexpected token|JSON/i, "the file is not valid JSON"],
];

/** Short, human description of an error. */
export function describe(err: unknown): string {
  const raw = (err instanceof Error ? err.message : String(err ?? "")).replace(/^(Error|TypeError):\s*/, "").trim();
  for (const [re, msg] of RULES) if (re.test(raw)) return msg;
  // Messages written by the backend for the user are kept as they are.
  return raw || "unknown error";
}
