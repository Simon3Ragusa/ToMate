import { api, type Entry } from "./api";
import { extractTasks } from "./markdown";
import { dayKey, loadActivity, loadEvents, loadNotes } from "./calendar";
import { daysOf, fmtRange, logEntries, section, type Week } from "./weeks";
import { loadFocus, byTopic, fmtMinutes } from "./focus.svelte";
import { findings } from "./findings.svelte";
import { inRange } from "./findings";
import { workspace } from "./workspace.svelte";

/** Link from inside the week folder (one level down) to a workspace path. */
const link = (path: string, label = path.split("/").pop()!) => `[${label}](<../${path}>)`;

/**
 * Draft of the weekly report, written into the week folder. Everything is
 * derived from files: the activity log, notes, events, log entries, tasks.
 */
export async function generateReport(week: Week, files: Entry[]): Promise<string> {
  const days = new Set(daysOf(week));
  const inWeek = (k: string) => days.has(k);

  const [activity, notes, events] = await Promise.all([loadActivity(files), loadNotes(files), loadEvents()]);

  const touched = new Map<string, "created" | "edited">();
  for (const k of days) {
    for (const [p, kind] of activity.get(k) ?? []) {
      if (kind === "removed" || p.startsWith(".board") || p.endsWith("report draft.md")) continue;
      if (touched.get(p) !== "created") touched.set(p, kind);
    }
  }
  const exists = new Set(files.map((f) => f.path));
  const created = [...touched].filter(([p, k]) => k === "created" && exists.has(p)).map(([p]) => p).sort();
  const edited = [...touched].filter(([p, k]) => k === "edited" && exists.has(p)).map(([p]) => p).sort();

  const logFile = workspace.config.log.file.toLowerCase();
  const logDoc = files.find((f) => f.path.toLowerCase() === logFile);
  const logs = logDoc ? logEntries(await api.readText(logDoc.path)).filter((e) => inWeek(e.date)) : [];

  const meetings = notes.filter((n) => inWeek(n.date));
  const meetingBlocks = await Promise.all(
    meetings.map(async (n) => {
      const src = await api.readText(n.entry.path);
      const decisions = section(src, "Decisions");
      return [`- ${link(n.entry.path, n.title)} (${n.date})`, ...decisions.map((d) => `  ${d}`)].join("\n");
    }),
  );

  const deadlines = events.filter((e) => inWeek(e.date));

  const focused = (await loadFocus()).filter((e) => inWeek(dayKey(new Date(e.start))));
  const focusTotal = focused.reduce((n, e) => n + e.minutes, 0);

  const mdTouched = files.filter((f) => touched.has(f.path) && f.name.toLowerCase().endsWith(".md"));
  const open: string[] = [];
  for (const f of mdTouched) {
    for (const t of extractTasks(await api.readText(f.path))) if (!t.done && t.text) open.push(`- [ ] ${t.text} — ${link(f.path)}`);
  }

  // Findings you kept (saved, or with a note) from this week's digests.
  const foundLines = inRange(findings.list, week.start, week.end)
    .filter((f) => findings.status(f.id) === "saved" || findings.user[f.id]?.note)
    .map((f) => {
      const note = findings.user[f.id]?.note;
      const title = f.url ? `[${f.title.replace(/[\[\]]/g, "")}](${f.url})` : f.title;
      return `- ${title}${f.score !== null ? ` (fit ${f.score}/10)` : ""}${note ? ` · ${link(note, "my note")}` : ""}`;
    });

  const list = (items: string[], empty = "- ") => (items.length ? items.join("\n") : empty);

  return `---
date: ${dayKey(new Date())}
type: report
week: ${week.id}
---

# ${week.id} report (${fmtRange(week)})

## Summary
-

## Log entries
${list(logs.map((e) => `- **[${e.tag}]** ${e.title} (${e.date})`), "- No log entries this week.")}

## Meetings and decisions
${list(meetingBlocks, "- No meeting notes this week.")}

## Events and deadlines
${list(deadlines.map((e) => `- ${e.date}${e.time ? " " + e.time : ""}: ${e.title}`), "- None.")}

## Focus time${focusTotal ? ` (${fmtMinutes(focusTotal)})` : ""}
${list(byTopic(focused).map(([t, m]) => `- ${t}: ${fmtMinutes(m)}`), "- No focus blocks logged.")}

## Files created
${list(created.map((p) => `- ${link(p, p)}`), "- None.")}

## Files edited
${list(edited.map((p) => `- ${link(p, p)}`), "- None.")}

## Findings
${list(foundLines, findings.connected ? "- Nothing saved or noted from this week's digests." : "- No digest feed connected.")}

## Open tasks
${list(open, "- None.")}

## Next steps
- [ ]
`;
}
