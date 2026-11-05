import { api, parentOf, listWork, type Entry } from "./api";
import { loadWeeks, expandWeeks, weekOf, type Week } from "./weeks";
import { dayKey } from "./calendar";
import { index } from "./search.svelte";
import { workspace } from "./workspace.svelte";
import { describe } from "./errors";
import { recentWorkspaces } from "./recent-workspaces.svelte";

const PINS_FILE = ".board/pins.json";

export type View = "overview" | "calendar" | "notes" | "week" | "search" | "settings" | "platform" | "findings";

/** App-wide state: workspace, folder listings cache, selection, toasts. */
class AppState {
  root = $state<string | null>(null);
  /** The page shown when no file is open. */
  view = $state<View>("overview");
  /** Week shown by the Week page. */
  weekId = $state<string | null>(null);
  /** Saved weeks continued up to next week. */
  weeks = $state<Week[]>([]);
  /** Pinned workspace paths (files or folders), shown at the top of the sidebar. */
  pins = $state<string[]>([]);
  /** Open files, in tab order. */
  tabs = $state<Entry[]>([]);
  #current = $state<Entry | null>(null);
  /**
   * The temporary tab, as in VS Code: a single click in the tree opens a file
   * here, replacing the previous preview; double-clicking it (or editing the
   * file) keeps it.
   */
  previewTab = $state<string | null>(null);
  /** The file shown; setting one opens (or focuses) its tab, as a kept tab. */
  get current() {
    return this.#current;
  }
  set current(e: Entry | null) {
    if (e) {
      const i = this.tabs.findIndex((t) => t.path === e.path);
      if (i < 0) this.tabs.push(e);
      else this.tabs[i] = e;
    }
    this.#current = e;
  }
  /** Day (YYYY-MM-DD) the calendar should open on next time it is shown. */
  calDay: string | null = null;
  /** Set to open the "new note" dialog, optionally preset to a date. */
  newNote = $state<{ date: string; type: "meeting" | "note" } | null>(null);
  dirs = $state<Record<string, Entry[]>>({});
  expanded = $state<Record<string, boolean>>({ "": true });
  toast = $state<{ text: string; error: boolean } | null>(null);
  /** Bumped on any file-system change so views can refetch. */
  revision = $state(0);
  private toastTimer: ReturnType<typeof setTimeout> | undefined;

  get rootName() {
    return this.root?.split(/[\\/]/).pop() ?? "";
  }

  async open(path: string) {
    this.root = await api.openWorkspace(path);
    recentWorkspaces.add(this.root);
    this.current = null;
    this.tabs = [];
    this.previewTab = null;
    this.dirs = {};
    this.expanded = { "": true };
    index.reset();
    this.pins = [];
    await workspace.load(); // weeks and modules depend on it
    await Promise.all([this.load(""), this.loadWeeks(), this.loadPins()]);
    index.update(); // background: builds or refreshes the full-text index
    import("./findings.svelte").then(({ findings }) => findings.open()); // unread badge; lazy to avoid an import cycle
  }

  async loadWeeks() {
    const rule = workspace.config.weeks;
    this.weeks = expandWeeks(await loadWeeks(await listWork(), rule), rule);
  }

  get currentWeek() {
    return weekOf(this.weeks, dayKey(new Date()));
  }

  show(view: View, weekId?: string) {
    this.current = null;
    this.view = view;
    if (weekId) this.weekId = weekId;
  }

  /** Open a file by path, expanding the tree to it. */
  async openPath(path: string) {
    await this.reveal(path);
    const found = this.dirs[parentOf(path)]?.find((e) => e.path === path);
    if (found) this.current = found;
    else this.notify(`Not found: ${path}`, true);
  }

  /** Show a file in the temporary tab (an already open tab is just focused). */
  preview(e: Entry) {
    const open = this.tabs.findIndex((t) => t.path === e.path);
    if (open >= 0) {
      this.tabs[open] = e;
    } else {
      const slot = this.tabs.findIndex((t) => t.path === this.previewTab);
      if (slot >= 0) this.tabs[slot] = e;
      else this.tabs.push(e);
      this.previewTab = e.path;
    }
    this.#current = e;
  }

  /** Turn the temporary tab into a kept one. */
  keepTab(path: string) {
    if (this.previewTab === path) this.previewTab = null;
  }

  /** Close a tab; closing the shown one moves to its neighbour or back to the page. */
  closeTab(path: string) {
    const i = this.tabs.findIndex((t) => t.path === path);
    if (i < 0) return;
    if (this.previewTab === path) this.previewTab = null;
    this.tabs.splice(i, 1);
    if (this.#current?.path === path) this.#current = this.tabs[Math.min(i, this.tabs.length - 1)] ?? null;
  }

  async loadPins() {
    try {
      const p = JSON.parse(await api.readText(PINS_FILE));
      this.pins = Array.isArray(p) ? p.filter((x) => typeof x === "string") : [];
    } catch {
      this.pins = [];
    }
  }

  isPinned = (path: string) => this.pins.includes(path);

  async togglePin(path: string) {
    this.pins = this.isPinned(path) ? this.pins.filter((p) => p !== path) : [...this.pins, path];
    await this.savePins();
  }

  /** Forget pins of a deleted path (and of anything inside it). */
  async unpinUnder(path: string) {
    const kept = this.pins.filter((p) => p !== path && !p.startsWith(path + "/"));
    if (kept.length === this.pins.length) return;
    this.pins = kept;
    await this.savePins();
  }

  private async savePins() {
    await api.createDir(".board").catch(() => {});
    await api.writeText(PINS_FILE, JSON.stringify(this.pins, null, 2)).catch((e) => this.fail("Couldn't save the pinned files", e));
  }

  /** A file was renamed or moved: its tab follows it in place. Tabs inside a moved folder close. */
  retab(from: string, to: Entry | null) {
    // Pins follow renames and moves, including of folders containing them.
    if (to && this.pins.some((p) => p === from || p.startsWith(from + "/"))) {
      this.pins = this.pins.map((p) => (p === from ? to.path : p.startsWith(from + "/") ? to.path + p.slice(from.length) : p));
      this.savePins();
    }
    const i = this.tabs.findIndex((t) => t.path === from);
    if (i >= 0 && to && !to.is_dir) {
      this.tabs[i] = to;
      if (this.previewTab === from) this.previewTab = to.path;
      if (this.#current?.path === from) this.#current = to;
    } else this.closeUnder(from);
  }

  /** Close every tab of `path` and, if it is a folder, of what is inside it. */
  closeUnder(path: string) {
    for (const t of this.tabs.filter((t) => t.path === path || t.path.startsWith(path + "/"))) this.closeTab(t.path);
  }

  async load(dir: string) {
    try {
      this.dirs[dir] = await api.listDir(dir);
    } catch {
      delete this.dirs[dir]; // folder vanished
    }
  }

  /** Reload every cached folder affected by an external change. */
  async refresh(dirs: string[]) {
    await Promise.all(dirs.filter((d) => d in this.dirs).map((d) => this.load(d)));
    // Keep tabs in sync: fresh metadata, and drop files that are gone.
    for (const t of [...this.tabs]) {
      const siblings = this.dirs[parentOf(t.path)];
      if (!siblings) continue;
      const fresh = siblings.find((e) => e.path === t.path);
      if (!fresh) this.closeTab(t.path);
      else if (fresh.modified !== t.modified || fresh.size !== t.size) {
        this.tabs[this.tabs.findIndex((x) => x.path === t.path)] = fresh;
        if (this.#current?.path === t.path) this.#current = fresh;
      }
    }
    this.revision++;
    index.update();
  }

  async toggle(dir: string) {
    this.expanded[dir] = !this.expanded[dir];
    if (this.expanded[dir] && !(dir in this.dirs)) await this.load(dir);
  }

  /** Expand all ancestors of `path` so it is visible in the tree. */
  async reveal(path: string) {
    const parts = path.split("/");
    for (let i = 0; i < parts.length - 1; i++) {
      const dir = parts.slice(0, i + 1).join("/");
      this.expanded[dir] = true;
      if (!(dir in this.dirs)) await this.load(dir);
    }
  }

  notify(text: string, error = false) {
    this.toast = { text, error };
    clearTimeout(this.toastTimer);
    // Errors stay longer (they usually say what to do); a click dismisses either.
    this.toastTimer = setTimeout(() => (this.toast = null), error ? 8000 : 2200);
  }

  /** Report a failed action as "Couldn't <action>: <reason>". The raw error goes to the console. */
  /** The last few failures, for "Copy diagnostics" (no file contents, just messages). */
  recentErrors: string[] = [];

  fail(action: string, err: unknown) {
    console.error(action, err);
    this.recentErrors = [`${new Date().toISOString()} ${action}: ${String(err)}`, ...this.recentErrors].slice(0, 20);
    this.notify(`${action}: ${describe(err)}.`, true);
  }

  /** Run an action, reporting any failure with `action` as context (e.g. "Couldn't rename"). */
  async run(fn: () => Promise<unknown>, action = "Something went wrong") {
    try {
      await fn();
    } catch (e) {
      this.fail(action, e);
    }
  }
}

export const app = new AppState();
