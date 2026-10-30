import { api, isPlatform, type Entry } from "./api";
import { frontMatter, extractTasks } from "./markdown";

export const NOTES_DIR = "Notes";
const EVENTS_FILE = ".board/events.json";

export type EventKind = "meeting" | "deadline" | "event";

/** Something on a calendar day: a manual event or a dated note. */
export interface CalItem {
  id: string;
  date: string; // YYYY-MM-DD
  time?: string; // HH:MM
  title: string;
  kind: EventKind;
  path?: string; // set when the item comes from a note
}

export interface Note {
  entry: Entry;
  title: string;
  date: string;
  type: string;
  openActions: number;
}

export const dayKey = (d: Date) =>
  `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;

export const fromKey = (k: string) => {
  const [y, m, d] = k.split("-").map(Number);
  return new Date(y, m - 1, d);
};

/* Manual events, stored in the workspace so they sync with it. */

export async function loadEvents(): Promise<CalItem[]> {
  try {
    return JSON.parse(await api.readText(EVENTS_FILE));
  } catch {
    return [];
  }
}

export async function saveEvents(events: CalItem[]) {
  await api.createDir(".board").catch(() => {});
  const sorted = [...events].sort((a, b) => (a.date + (a.time ?? "")).localeCompare(b.date + (b.time ?? "")));
  await api.writeText(EVENTS_FILE, JSON.stringify(sorted, null, 2));
}

/* Notes: Markdown files under Notes/ with optional `date` / `type` front matter. */

export async function loadNotes(files: Entry[]): Promise<Note[]> {
  const mds = files.filter((f) => f.path.startsWith(NOTES_DIR + "/") && f.name.toLowerCase().endsWith(".md"));
  const notes = await Promise.all(
    mds.map(async (entry) => {
      const src = await api.readText(entry.path).catch(() => "");
      const { meta, body } = frontMatter(src);
      const heading = /^#\s+(.+)$/m.exec(body)?.[1];
      const fromName = /^(\d{4}-\d{2}-\d{2})/.exec(entry.name)?.[1];
      return {
        entry,
        title: heading ?? entry.name.replace(/\.md$/i, ""),
        date: /^\d{4}-\d{2}-\d{2}$/.test(meta.date ?? "") ? meta.date : fromName ?? dayKey(new Date(entry.created)),
        type: meta.type ?? "note",
        openActions: extractTasks(src).filter((t) => !t.done).length,
      };
    }),
  );
  return notes.sort((a, b) => b.date.localeCompare(a.date) || b.entry.modified - a.entry.modified);
}

export const noteItems = (notes: Note[]): CalItem[] =>
  notes.map((n) => ({
    id: "note:" + n.entry.path,
    date: n.date,
    title: n.title,
    kind: n.type === "meeting" ? "meeting" : "event",
    path: n.entry.path,
  }));

export async function createNote(title: string, date: string, type: "meeting" | "note"): Promise<string> {
  const safe = title.replace(/[\\/:*?"<>|]/g, "").trim() || "Untitled";
  const path = `${NOTES_DIR}/${date} ${safe}.md`;
  const body =
    type === "meeting"
      ? `---\ndate: ${date}\ntype: meeting\nattendees: \n---\n\n# ${safe}\n\n## Agenda\n- \n\n## Notes\n\n\n## Decisions\n- \n\n## Actions\n- [ ] \n`
      : `---\ndate: ${date}\ntype: note\n---\n\n# ${safe}\n\n`;
  await api.createFile(path, body);
  return path;
}

/* File activity per day: the watcher log plus file timestamps. */

export type Activity = Map<string, Map<string, "created" | "edited" | "removed">>;

export async function loadActivity(files: Entry[]): Promise<Activity> {
  const days: Activity = new Map();
  const mark = (key: string, path: string, kind: "created" | "edited" | "removed") => {
    if (!days.has(key)) days.set(key, new Map());
    const day = days.get(key)!;
    if (day.get(path) !== "created") day.set(path, kind); // "created" wins over later edits that day
  };
  for (const f of files) {
    mark(dayKey(new Date(f.created)), f.path, "created");
    if (dayKey(new Date(f.modified)) !== dayKey(new Date(f.created))) mark(dayKey(new Date(f.modified)), f.path, "edited");
  }
  const log = await api.readActivity().catch(() => "");
  for (const line of log.split("\n")) {
    if (!line.trim()) continue;
    try {
      const { ts, kind, path } = JSON.parse(line);
      if (typeof path !== "string" || isPlatform(path)) continue;
      mark(dayKey(new Date(ts)), path, kind === "removed" ? "removed" : "edited");
    } catch {
      /* skip malformed line */
    }
  }
  return days;
}
