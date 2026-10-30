<script lang="ts">
  import FileIcon from "./FileIcon.svelte";
  import FileDots from "./FileDots.svelte";
  import { api, parentOf, listWork, type Entry } from "$lib/api";
  import { app } from "$lib/state.svelte";
  import { dropFallback, moveTo } from "./dnd.svelte";
  import { extractTasks, toggleTask, type Task } from "$lib/markdown";
  import { dayKey, fromKey, loadActivity, loadEvents, loadNotes, noteItems, type Activity, type CalItem } from "$lib/calendar";
  import { daysOf, fmtRange, logEntries, saveWeeks, weekFiles, type Week } from "$lib/weeks";
  import { generateReport } from "$lib/report";
  import { focus, loadFocus, byTopic, fmtMinutes, type FocusEntry } from "$lib/focus.svelte";
  import { findings } from "$lib/findings.svelte";
  import { workspace } from "$lib/workspace.svelte";
  import { inRange } from "$lib/findings";

  const today = dayKey(new Date());
  const idx = $derived(Math.max(0, app.weeks.findIndex((w) => w.id === (app.weekId ?? app.currentWeek?.id))));
  const week = $derived<Week | undefined>(app.weeks[idx]);
  const days = $derived(week ? daysOf(week) : []);
  const inWeek = (k: string) => !!week && week.start <= k && k <= week.end;

  let files = $state<Entry[]>([]);
  let activity = $state<Activity>(new Map());
  let items = $state<CalItem[]>([]);
  let logs = $state<{ date: string; tag: string; title: string }[]>([]);
  let tasks = $state<{ file: Entry; items: Task[] }[]>([]);
  let focused = $state<FocusEntry[]>([]);
  const focusTotal = $derived(focused.reduce((n, e) => n + e.minutes, 0));
  /** Saved or noted findings first, then the best-scoring new ones; archived ones are left out. */
  const weekFindings = $derived.by(() => {
    if (!week) return [];
    const all = inRange(findings.list, week.start, week.end).filter((f) => findings.status(f.id) !== "archived");
    const kept = (id: string) => findings.status(id) === "saved" || !!findings.user[id]?.note;
    return [...all.filter((f) => kept(f.id)), ...all.filter((f) => !kept(f.id))].slice(0, 8);
  });
  let editing = $state(false);
  let eStart = $state("");
  let eEnd = $state("");

  $effect(() => {
    app.revision;
    focus.logged;
    week?.id;
    load();
  });

  // External drops on this page land in the week folder.
  $effect(() => {
    dropFallback.dir = week?.id ?? "";
    return () => (dropFallback.dir = "");
  });

  async function load() {
    if (!week) return;
    files = await listWork();
    const [act, events, notes] = await Promise.all([loadActivity(files), loadEvents(), loadNotes(files)]);
    activity = act;
    items = [...events, ...noteItems(notes)].filter((i) => inWeek(i.date));
    const logFile = workspace.config.log.file.toLowerCase();
    const wl = files.find((f) => f.path.toLowerCase() === logFile);
    focused = (await loadFocus()).filter((e) => inWeek(dayKey(new Date(e.start))));
    logs = wl ? logEntries(await api.readText(wl.path)).filter((e) => inWeek(e.date)) : [];
    const mds = [...new Set([...mine, ...touchedPaths].filter((p) => p.toLowerCase().endsWith(".md")))];
    const found = await Promise.all(
      mds.map(async (p) => {
        const file = files.find((f) => f.path === p)!;
        return { file, items: extractTasks(await api.readText(p)).filter((t) => !t.done && t.text) };
      }),
    );
    tasks = found.filter((g) => g.file && g.items.length);
  }

  const folderExists = $derived(!!week && files.some((f) => f.path.split("/")[0] === week.id) || !!app.dirs[""]?.some((e) => e.is_dir && e.name === week?.id));
  const mine = $derived(week ? weekFiles(files, week.id).map((f) => f.path) : []);
  const grouped = $derived.by(() => {
    const g = new Map<string, Entry[]>();
    for (const f of week ? weekFiles(files, week.id) : []) {
      const dir = parentOf(f.path);
      if (!g.has(dir)) g.set(dir, []);
      g.get(dir)!.push(f);
    }
    return [...g].sort((a, b) => a[0].length - b[0].length || a[0].localeCompare(b[0]));
  });
  const touchedPaths = $derived.by(() => {
    const s = new Set<string>();
    for (const k of days) for (const [p, kind] of activity.get(k) ?? []) if (kind !== "removed" && !p.startsWith(".board")) s.add(p);
    return [...s].filter((p) => files.some((f) => f.path === p));
  });
  /** Touched this week, sitting loose at the root: candidates for tidying into the week folder. */
  const loose = $derived(
    touchedPaths.filter((p) => !p.includes("/") && p.toLowerCase() !== workspace.config.log.file.toLowerCase()).map((p) => files.find((f) => f.path === p)!),
  );

  const dayPaths = (k: string) => [...(activity.get(k)?.keys() ?? [])].filter((p) => !p.startsWith(".board"));

  const status = $derived.by(() => {
    if (!week) return "";
    if (today < week.start) return "Upcoming";
    if (today > week.end) return "Done";
    const left = days.length - days.indexOf(today) - 1;
    return left === 0 ? "Current week · last day" : `Current week · ${left} ${left === 1 ? "day" : "days"} left`;
  });

  function go(n: number) {
    const w = app.weeks[idx + n];
    if (w) app.weekId = w.id;
  }

  async function createFolder() {
    if (!week) return;
    await app.run(async () => {
      await api.createDir(week.id);
      await app.load("");
      app.notify(`Created ${week.id}/`);
      await load();
    }, "Couldn't create the week folder");
  }

  async function report() {
    if (!week) return;
    await app.run(async () => {
      await api.createDir(week.id).catch(() => {});
      const body = await generateReport(week, files);
      let path = `${week.id}/${week.id} report draft.md`;
      for (let n = 1; files.some((f) => f.path === path); n++) path = `${week.id}/${week.id} report draft (${n}).md`;
      await api.createFile(path, body);
      await Promise.all([app.load(""), app.load(week.id)]);
      await app.openPath(path);
    }, "Couldn't write the report draft");
  }

  async function tidy(f: Entry) {
    if (!week) return;
    await api.createDir(week.id).catch(() => {});
    await app.load("");
    await moveTo(f, week.id);
  }

  async function complete(file: Entry, t: Task) {
    await app.run(async () => {
      const src = await api.readText(file.path);
      await api.writeText(file.path, toggleTask(src, extractTasks(src).findIndex((x) => x.line === t.line)));
      await load();
    }, "Couldn't update the task");
  }

  function startEdit() {
    if (!week) return;
    eStart = week.start;
    eEnd = week.end;
    editing = true;
  }

  /** Saves this week's dates; earlier weeks are kept, later ones regenerate from here. */
  async function saveEdit() {
    if (!week || !eStart || eEnd < eStart) return app.notify("End must be on or after start", true);
    const kept = app.weeks.slice(0, idx).map((w) => ({ ...w }));
    if (kept.length) kept[kept.length - 1].end = kept[kept.length - 1].end < eStart ? kept[kept.length - 1].end : dayKey(new Date(fromKey(eStart).getTime() - 86_400_000));
    await app.run(async () => {
      await saveWeeks([...kept, { id: week.id, start: eStart, end: eEnd }]);
      await app.loadWeeks();
      editing = false;
    }, "Couldn't save the week dates");
  }

  const tagClass = (t: string) => t.toLowerCase();
</script>

{#if week}
  <div class="page">
    <header>
      <div class="title">
        <div class="nav">
          <button disabled={idx === 0} onclick={() => go(-1)} aria-label="Previous week">
            <svg viewBox="0 0 16 16"><path d="M10 4l-4 4 4 4" fill="none" stroke="currentColor" stroke-width="1.4" /></svg>
          </button>
          <button disabled={idx === app.weeks.length - 1} onclick={() => go(1)} aria-label="Next week">
            <svg viewBox="0 0 16 16"><path d="M6 4l4 4-4 4" fill="none" stroke="currentColor" stroke-width="1.4" /></svg>
          </button>
        </div>
        <h1>{week.id}</h1>
        <div>
          {#if editing}
            <span class="edit">
              <input type="date" bind:value={eStart} /> – <input type="date" bind:value={eEnd} />
              <button class="txt link" onclick={saveEdit}>Save</button>
              <button class="txt" onclick={() => (editing = false)}>Cancel</button>
            </span>
          {:else}
            <p class="range">{fmtRange(week)} <button class="txt" onclick={startEdit}>Edit dates</button></p>
          {/if}
          <p class="status" class:now={status.startsWith("Current")}>{status}</p>
        </div>
      </div>
      <div class="actions">
        {#if !folderExists}
          <button class="ghost" onclick={createFolder}>Create {week.id}/ folder</button>
        {/if}
        <button class="primary" onclick={report}>Generate report draft</button>
      </div>
    </header>

    <section class="days" style="grid-template-columns: repeat({Math.min(days.length, 7)}, minmax(0, 1fr))">
      {#each days as k (k)}
        {@const its = items.filter((i) => i.date === k)}
        <button class="day" class:today={k === today} onclick={() => ((app.calDay = k), app.show("calendar"))}>
          <span class="dh">
            <span class="dn">{fromKey(k).toLocaleDateString([], { weekday: "short" })}</span>
            <span class="dd">{fromKey(k).getDate()}</span>
          </span>
          {#each its.slice(0, 2) as it (it.id)}<span class="chip {it.kind}">{it.title}</span>{/each}
          {#if its.length > 2}<span class="more">+{its.length - 2}</span>{/if}
          <span class="dots"><FileDots paths={dayPaths(k)} max={12} /></span>
        </button>
      {/each}
    </section>

    <div class="cols">
      <section class="card">
        <h2>Week folder</h2>
        {#each grouped as [dir, fs] (dir)}
          <p class="dir">{dir}/</p>
          <ul>
            {#each fs as f (f.path)}
              <li><button class="row" onclick={() => app.openPath(f.path)}><FileIcon name={f.name} /><span class="grow">{f.name}</span></button></li>
            {/each}
          </ul>
        {:else}
          <p class="empty">
            No files in <code>{week.id}/</code> yet. Drop files on this page to add them to the week folder.
          </p>
        {/each}
        {#if loose.length}
          <p class="dir">Loose files touched this week</p>
          <ul>
            {#each loose as f (f.path)}
              <li class="loose">
                <button class="row" onclick={() => app.openPath(f.path)}><FileIcon name={f.name} /><span class="grow">{f.name}</span></button>
                <button class="txt link" onclick={() => tidy(f)}>Move to {week.id}/</button>
              </li>
            {/each}
          </ul>
        {/if}
      </section>

      <section class="card">
        <h2>Agenda</h2>
        <ul>
          {#each items as it (it.id)}
            <li>
              <button class="row {it.kind}" onclick={() => (it.path ? app.openPath(it.path) : ((app.calDay = it.date), app.show("calendar")))}>
                <span class="bar"></span><span class="grow">{it.title}</span>
                <span class="meta">{fromKey(it.date).toLocaleDateString([], { weekday: "short", day: "numeric" })}</span>
              </button>
            </li>
          {:else}
            <li class="empty">No events or meeting notes.</li>
          {/each}
        </ul>

        <h2 class="gap">Log entries</h2>
        <ul>
          {#each logs as l (l.date + l.title)}
            <li>
              <button class="row" onclick={() => app.openPath(workspace.config.log.file)}>
                <span class="tag {tagClass(l.tag)}">{l.tag}</span><span class="grow">{l.title}</span>
              </button>
            </li>
          {:else}
            <li class="empty">No log entries this week.</li>
          {/each}
        </ul>

        <h2 class="gap">Focus time {#if focusTotal}<span class="count">{fmtMinutes(focusTotal)}</span>{/if}</h2>
        <ul>
          {#each byTopic(focused) as [topic, min] (topic)}
            <li class="row static">
              <span class="grow">{topic}</span>
              <span class="meta">{fmtMinutes(min)}</span>
            </li>
          {:else}
            <li class="empty">No focus blocks yet. Start one from the sidebar.</li>
          {/each}
        </ul>
      </section>
    </div>

    <div class="cols">
      <section class="card">
        <h2>Open tasks <span class="count">from this week's files</span></h2>
        {#each tasks as g (g.file.path)}
          <button class="row sub" onclick={() => app.openPath(g.file.path)}><FileIcon name={g.file.name} /> {g.file.path}</button>
          <ul class="tasks">
            {#each g.items as t (t.line)}
              <li><label><input type="checkbox" onchange={() => complete(g.file, t)} /><span>{t.text}</span></label></li>
            {/each}
          </ul>
        {:else}
          <p class="empty">No open tasks.</p>
        {/each}
      </section>

      <section class="card">
        {#if findings.connected}
          <h2>Findings <span class="count">from this week's digests</span></h2>
          <ul>
            {#each weekFindings as f (f.id)}
              {@const st = findings.status(f.id)}
              <li>
                <button class="row" onclick={() => (findings.user[f.id]?.note ? app.openPath(findings.user[f.id].note!) : app.show("findings"))}>
                  <span class="fit">{f.score ?? "–"}</span>
                  <span class="grow">{f.title}</span>
                  {#if findings.user[f.id]?.note}<span class="meta">note</span>{:else if st === "saved"}<span class="meta">saved</span>{:else if st === "unread"}<span class="meta">new</span>{/if}
                </button>
              </li>
            {:else}
              <li class="empty">No findings in this week's digests.</li>
            {/each}
          </ul>
        {/if}

        <h2 class:gap={findings.connected}>Files touched <span class="count">{touchedPaths.length}</span></h2>
        <ul class="scroll">
          {#each touchedPaths as p (p)}
            <li><button class="row" onclick={() => app.openPath(p)}><FileIcon name={p} /><span class="grow">{p}</span></button></li>
          {:else}
            <li class="empty">No file activity.</li>
          {/each}
        </ul>
      </section>
    </div>
  </div>
{/if}

<style>
  .page {
    flex: 1;
    min-height: 0;
    overflow: auto;
    padding: 32px 48px 64px;
  }
  header,
  .days,
  .cols {
    max-width: 1080px;
    margin-inline: auto;
  }
  header {
    display: flex;
    align-items: flex-end;
    justify-content: space-between;
    gap: 16px;
    margin-bottom: 20px;
  }
  .title {
    display: flex;
    align-items: center;
    gap: 14px;
  }
  .nav {
    display: flex;
    flex-direction: column;
    gap: 2px;
  }
  .nav button {
    display: grid;
    place-items: center;
    width: 24px;
    height: 22px;
    border: 0;
    border-radius: var(--r-sm);
    background: none;
    color: var(--muted);
  }
  .nav button:hover:not(:disabled) {
    background: var(--hover);
    color: var(--text);
  }
  .nav button:disabled {
    opacity: 0.3;
  }
  .nav svg {
    width: 14px;
    height: 14px;
  }
  h1 {
    margin: 0;
    font-size: 40px;
    font-weight: 700;
    letter-spacing: -0.02em;
    line-height: 1;
  }
  .range {
    margin: 0;
    font-size: 14px;
    font-weight: 550;
  }
  .status {
    margin: 2px 0 0;
    color: var(--muted);
    font-size: 12.5px;
  }
  .status.now {
    color: var(--accent);
  }
  .edit {
    display: flex;
    align-items: center;
    gap: 6px;
    font-size: 13px;
  }
  .edit input {
    height: 28px;
    padding: 0 6px;
    border: 1px solid var(--border);
    border-radius: var(--r);
    background: var(--panel);
    color: var(--text);
    font: inherit;
    font-size: 12.5px;
  }
  .actions {
    display: flex;
    gap: 8px;
    flex: none;
  }
  .actions button {
    padding: 7px 14px;
    border-radius: var(--r);
    font: inherit;
    font-size: 13px;
  }
  .ghost {
    border: 1px solid var(--border);
    background: var(--panel);
    color: var(--text);
  }
  .primary {
    border: 0;
    background: var(--accent);
    color: white;
    font-weight: 550;
  }
  .txt {
    padding: 2px 6px;
    border: 0;
    border-radius: var(--r-sm);
    background: none;
    color: var(--muted);
    font: inherit;
    font-size: 12px;
    font-weight: 400;
  }
  .txt:hover {
    background: var(--hover);
  }
  .link {
    color: var(--accent);
  }

  .days {
    display: grid;
    gap: 6px;
    margin-bottom: 16px;
  }
  .day {
    display: flex;
    flex-direction: column;
    gap: 4px;
    height: 112px;
    padding: 8px;
    overflow: hidden;
    border: 1px solid var(--border);
    border-radius: var(--r);
    background: var(--panel);
    color: var(--text);
    font: inherit;
    text-align: left;
  }
  .day:hover,
  .day.today {
    border-color: var(--accent);
  }
  .day.today {
    box-shadow: inset 0 0 0 1px var(--accent);
  }
  .dh {
    display: flex;
    align-items: baseline;
    justify-content: space-between;
  }
  .dn {
    color: var(--muted);
    font-size: 11px;
    font-weight: 600;
    text-transform: uppercase;
  }
  .dd {
    font-size: 14px;
    font-weight: 600;
  }
  .today .dd {
    color: var(--accent);
  }
  .chip {
    overflow: hidden;
    padding: 1px 5px;
    border-left: 2px solid var(--c);
    border-radius: 3px;
    background: color-mix(in srgb, var(--c) 12%, transparent);
    font-size: 11px;
    text-overflow: ellipsis;
    white-space: nowrap;
  }
  .more {
    color: var(--muted);
    font-size: 11px;
  }
  .dots {
    margin-top: auto;
  }
  .meeting {
    --c: var(--ev-meeting);
  }
  .deadline {
    --c: var(--ev-deadline);
  }
  .event {
    --c: var(--ev-other);
  }

  .cols {
    display: grid;
    grid-template-columns: 1fr 1fr;
    gap: 16px;
  }
  .cols + .cols {
    margin-top: 16px;
  }
  @media (max-width: 1000px) {
    .cols {
      grid-template-columns: 1fr;
    }
  }
  .card {
    min-width: 0;
    padding: 16px 18px;
    border: 1px solid var(--border);
    border-radius: var(--r-lg);
    background: var(--panel);
  }
  h2 {
    margin: 0 0 10px;
    color: var(--muted);
    font-size: 11px;
    font-weight: 600;
    letter-spacing: 0.05em;
    text-transform: uppercase;
  }
  h2.gap {
    margin-top: 18px;
  }
  .count {
    margin-left: 4px;
    font-weight: 500;
    text-transform: none;
    letter-spacing: 0;
  }
  ul {
    margin: 0;
    padding: 0;
    list-style: none;
  }
  .scroll {
    max-height: 240px;
    overflow: auto;
  }
  .dir {
    margin: 10px 0 4px;
    color: var(--muted);
    font-size: 12px;
  }
  .dir:first-of-type {
    margin-top: 0;
  }
  .row {
    display: flex;
    align-items: center;
    gap: 8px;
    width: 100%;
    min-width: 0;
    padding: 5px 6px;
    border: 0;
    border-radius: var(--r-sm);
    background: none;
    color: var(--text);
    font: inherit;
    font-size: 13px;
    text-align: left;
  }
  .row:hover {
    background: var(--hover);
  }
  .fit {
    flex: none;
    min-width: 18px;
    color: var(--muted);
    font-size: 11.5px;
    font-weight: 650;
    font-variant-numeric: tabular-nums;
    text-align: center;
  }
  .row.static:hover {
    background: none;
  }
  .row.sub {
    color: var(--muted);
    font-size: 12px;
  }
  .loose {
    display: flex;
    align-items: center;
  }
  .loose .txt {
    flex: none;
  }
  .bar {
    align-self: stretch;
    width: 3px;
    border-radius: 2px;
    background: var(--c);
  }
  .grow {
    flex: 1;
    min-width: 0;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }
  .meta {
    flex: none;
    color: var(--muted);
    font-size: 12px;
  }
  .tag {
    flex: none;
    padding: 1px 6px;
    border-radius: var(--r-sm);
    background: var(--hover);
    color: var(--muted);
    font-size: 10.5px;
    font-weight: 600;
    letter-spacing: 0.03em;
  }
  .tag.idea {
    background: color-mix(in srgb, var(--tag-idea) 14%, transparent);
    color: var(--tag-idea);
  }
  .tag.exp {
    background: color-mix(in srgb, var(--tag-exp) 16%, transparent);
    color: var(--tag-exp);
  }
  .tag.decision {
    background: color-mix(in srgb, var(--tag-decision) 16%, transparent);
    color: var(--tag-decision);
  }
  .tag.recap {
    background: color-mix(in srgb, var(--tag-recap) 16%, transparent);
    color: var(--tag-recap);
  }
  .tasks label {
    display: flex;
    align-items: flex-start;
    gap: 10px;
    padding: 4px 6px 4px 30px;
    font-size: 13px;
    line-height: 1.45;
  }
  .tasks input {
    margin-top: 2px;
    accent-color: var(--accent);
  }
  .empty {
    margin: 0;
    padding: 4px 6px;
    color: var(--muted);
    font-size: 13px;
  }
  code {
    font-family: var(--mono);
    font-size: 12px;
  }
</style>
