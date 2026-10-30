// Findings store: the imported archive (`.board/findings/archive.json`),
// the user's own state per finding (`.board/findings/user.json`), and the
// import from the digest folder chosen in the Findings page.

import { api, joinPath } from "./api";
import { app } from "./state.svelte";
import { describe } from "./errors";
import { emptyArchive, isDigestFile, merge, parseDigest, type Archive, type ParsedDigest, type ReadStatus, type Stored, type UserState } from "./findings";

const DIR = ".board/findings";
const ARCHIVE = `${DIR}/archive.json`;
const USER = `${DIR}/user.json`;
const FOLDER_KEY = "tomate.findings.folder";
const REPO_KEY = "tomate.findings.repo";
/** Suggested in the connect form; empty so nobody's repo is assumed. */
export const DEFAULT_REPO = "";
const NOTES_DIR = "Notes/Findings";

export interface ImportReport {
  at: string;
  files: number;
  added: number;
  updated: number;
  /** Files or records that were skipped, with the reason. */
  problems: string[];
  /** Sync with GitHub failed, but the local cache was still read. */
  syncError: string | null;
  /** The whole import failed (cache kept). */
  error: string | null;
}

class FindingsStore {
  archive = $state<Archive>(emptyArchive());
  user = $state<Record<string, UserState>>({});
  /** Local folder with digests (manual mode). */
  folder = $state<string>(read(FOLDER_KEY));
  /** GitHub repository `owner/name` whose data/findings is pulled at launch (preferred mode). */
  repo = $state<string>(read(REPO_KEY));
  report = $state<ImportReport | null>(null);
  busy = $state(false);
  /** Search text handed over from global search when it opens the Findings page. */
  query = $state("");
  private loadedFor: string | null = null;

  get list(): Stored[] {
    return Object.values(this.archive.records);
  }

  status(id: string): ReadStatus {
    return this.user[id]?.status ?? "unread";
  }

  get unread() {
    return this.list.filter((f) => this.status(f.id) === "unread").length;
  }

  /** Load the cached archive for the open workspace (once), then import if a folder is set. */
  async open() {
    if (this.loadedFor !== app.root) {
      this.loadedFor = app.root;
      this.archive = await readJson(ARCHIVE, emptyArchive());
      this.user = await readJson(USER, {});
      if (!this.archive.records || this.archive.version !== 1) this.archive = emptyArchive();
    }
    if (this.connected) await this.import();
  }

  get connected() {
    return !!(this.repo || this.folder);
  }

  setRepo(repo: string) {
    this.repo = repo.trim();
    this.folder = "";
    write(REPO_KEY, this.repo);
    write(FOLDER_KEY, "");
    return this.import();
  }

  setFolder(path: string) {
    this.folder = path;
    this.repo = "";
    write(FOLDER_KEY, path);
    write(REPO_KEY, "");
    return this.import();
  }

  disconnect() {
    this.repo = this.folder = "";
    write(REPO_KEY, "");
    write(FOLDER_KEY, "");
    this.report = null;
  }

  /** Read every digest in the folder and merge it. Never deletes cached records. */
  async import() {
    if (!this.connected || this.busy) return;
    this.busy = true;
    const at = new Date().toISOString();
    let syncError: string | null = null;
    try {
      let dir = this.folder;
      if (this.repo) {
        // Pull the repo's data/findings into the app's cache; offline, read the last copy.
        try {
          dir = await api.syncRadar(this.repo);
          write(CACHE_KEY, dir);
        } catch (e) {
          syncError = describe(e);
          dir = read(CACHE_KEY);
          if (!dir) throw e;
        }
      }
      let files: Awaited<ReturnType<typeof api.readDigestDir>> = [];
      try {
        files = await api.readDigestDir(dir);
      } catch (e) {
        // A repo without exports yet has no data/findings folder: that is "nothing yet", not an error.
        if (!this.repo) throw e;
      }
      const problems: string[] = [];
      const parsed: ParsedDigest[] = [];
      for (const f of files.filter((f) => isDigestFile(f.name))) {
        if (f.error || f.text === null) {
          problems.push(`${f.name}: ${f.error ?? "unreadable"}`);
          continue;
        }
        try {
          const d = parseDigest(f.name, f.text);
          parsed.push(d);
          problems.push(...d.rejected.map((r) => `${f.name}: skipped record (${r})`));
        } catch (e) {
          problems.push(String(e instanceof Error ? e.message : e));
        }
      }
      const { archive, added, updated } = merge(this.archive, parsed, at);
      this.archive = archive;
      await this.write(ARCHIVE, archive);
      this.report = { at, files: parsed.length, added, updated, problems, error: null, syncError };
    } catch (e) {
      // Folder missing, permissions, offline drive…: keep showing the cache.
      this.report = { at, files: 0, added: 0, updated: 0, problems: [], error: describe(e), syncError: null };
    } finally {
      this.busy = false;
    }
  }

  async setStatus(id: string, status: ReadStatus) {
    this.user = { ...this.user, [id]: { ...this.user[id], status, updated: new Date().toISOString() } };
    await this.write(USER, this.user);
  }

  /** Open the finding's note, creating it (with the source details) the first time. */
  async note(f: Stored) {
    const existing = this.user[f.id]?.note;
    if (existing) return app.openPath(existing);
    const name = f.title.replace(/[\\/:*?"<>|#\[\]]/g, "-").replace(/\s+/g, " ").trim().slice(0, 80) || "Finding";
    const path = joinPath(NOTES_DIR, `${name}.md`);
    const today = new Date().toISOString().slice(0, 10);
    const quote = (s: string) => s.split("\n").map((l) => `> ${l}`).join("\n");
    const body = `---
date: ${today}
type: finding
source: ${f.url ?? ""}
finding: ${f.id}
---

# ${f.title}

${f.url ? `[Open source](${f.url})` : "Source link unavailable."}${f.score !== null ? ` · AI fit ${f.score}/10` : ""}

## Summary (AI, from the abstract)
${f.summary ? quote(f.summary) : "> —"}

## Why it matters (AI)
${f.relevance ? quote(f.relevance) : "> —"}

## My notes
-
`;
    await app.run(async () => {
      await api.createDir(NOTES_DIR).catch(() => {});
      await api.createFile(path, body).catch((e) => {
        // Same title already noted (e.g. a reposted item): reuse that note.
        if (!/exists/i.test(String(e))) throw e;
      });
      // Writing a note counts as having read it.
      const status = this.status(f.id) === "unread" ? "read" : this.status(f.id);
      this.user = { ...this.user, [f.id]: { ...this.user[f.id], status, note: path, updated: new Date().toISOString() } };
      await this.write(USER, this.user);
      await app.openPath(path);
    }, "Couldn't create the note");
  }

  private async write(path: string, data: unknown) {
    await api.createDir(DIR).catch(() => {});
    await api.writeText(path, JSON.stringify(data, null, 1)).catch((e) => app.fail("Couldn't save findings", e));
  }
}

const CACHE_KEY = "tomate.findings.cache";

function read(key: string) {
  try {
    return localStorage.getItem(key) ?? "";
  } catch {
    return "";
  }
}

function write(key: string, value: string) {
  try {
    localStorage.setItem(key, value);
  } catch {
    /* remembered for this session only */
  }
}

async function readJson<T>(path: string, fallback: T): Promise<T> {
  try {
    return JSON.parse(await api.readText(path));
  } catch {
    return fallback;
  }
}

export const findings = new FindingsStore();
