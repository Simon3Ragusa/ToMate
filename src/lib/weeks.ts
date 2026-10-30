import { api, type Entry } from "./api";
import { dayKey, fromKey } from "./calendar";
import type { WorkspaceConfig } from "./workspace.svelte";

type WeekRule = WorkspaceConfig["weeks"];

const WEEKS_FILE = ".board/weeks.json";

export interface Week {
  id: string; // "W3"
  start: string; // YYYY-MM-DD, inclusive
  end: string; // YYYY-MM-DD, inclusive
}

const addDays = (k: string, n: number) => {
  const d = fromKey(k);
  d.setDate(d.getDate() + n);
  return dayKey(d);
};

/** Explicit weeks from `.board/weeks.json`; if absent, week 1 is the one containing the oldest file. */
export async function loadWeeks(files: Entry[], rule: WeekRule): Promise<Week[]> {
  try {
    const saved = JSON.parse(await api.readText(WEEKS_FILE));
    if (Array.isArray(saved.weeks) && saved.weeks.length) return saved.weeks;
  } catch {
    /* fall through */
  }
  const oldest = files.reduce((m, f) => Math.min(m, f.created || Infinity), Date.now());
  const d = new Date(oldest);
  d.setDate(d.getDate() - ((d.getDay() - rule.startDay + 7) % 7));
  const start = dayKey(d);
  return [{ id: `${rule.prefix}1`, start, end: addDays(start, rule.length - 1) }];
}

/** Saved weeks continued in steps of the configured length until one step past today. */
export function expandWeeks(saved: Week[], rule: WeekRule): Week[] {
  const weeks = [...saved];
  const horizon = addDays(dayKey(new Date()), rule.length);
  while (weeks.at(-1)!.end < horizon) {
    const last = weeks.at(-1)!;
    const start = addDays(last.end, 1);
    weeks.push({ id: `${rule.prefix}${weeks.length + 1}`, start, end: addDays(start, rule.length - 1) });
  }
  return weeks;
}

export async function saveWeeks(weeks: Week[]) {
  await api.createDir(".board").catch(() => {});
  await api.writeText(WEEKS_FILE, JSON.stringify({ weeks }, null, 2));
}

export const weekOf = (weeks: Week[], k: string) => weeks.find((w) => w.start <= k && k <= w.end);

export const daysOf = (w: Week) => {
  const out: string[] = [];
  for (let k = w.start; k <= w.end; k = addDays(k, 1)) out.push(k);
  return out;
};

export const fmtRange = (w: Week) => {
  const f = (k: string) => fromKey(k).toLocaleDateString([], { day: "numeric", month: "short" });
  return `${f(w.start)} – ${f(w.end)}`;
};

/** Files inside any folder named like the week (e.g. `W3/…`, `Drafts/W3/…`). */
export const weekFiles = (files: Entry[], id: string) =>
  files.filter((f) => f.path.split("/").slice(0, -1).includes(id));

/** `## [YYYY-MM-DD] [TAG] Title` headings from the workspace log file. */
export function logEntries(src: string): { date: string; tag: string; title: string }[] {
  const out: { date: string; tag: string; title: string }[] = [];
  for (const m of src.matchAll(/^##\s*\[(\d{4}-\d{2}-\d{2})\]\s*\[([A-Z]+)\]\s*(.+)$/gm)) {
    out.push({ date: m[1], tag: m[2], title: m[3].trim() });
  }
  return out;
}

/** Bullet lines under a `## Heading` of a Markdown document. */
export function section(src: string, heading: string): string[] {
  const m = new RegExp(`^##\\s+${heading}\\s*$([\\s\\S]*?)(?=^##\\s|(?![\\s\\S]))`, "mi").exec(src);
  return (m?.[1] ?? "")
    .split("\n")
    .map((l) => l.trim())
    .filter((l) => /^[-*]\s+\S/.test(l) && !/^[-*]\s+\[ \]\s*$/.test(l));
}
