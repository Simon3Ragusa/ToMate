<script lang="ts">
  import FileIcon from "./FileIcon.svelte";
  import FileDots from "./FileDots.svelte";
  import { api, parentOf, listWork, type Entry } from "$lib/api";
  import { app } from "$lib/state.svelte";
  import { extractTasks, toggleTask, type Task } from "$lib/markdown";
  import { fmtDate } from "$lib/fileTypes";
  import {
    dayKey, fromKey, loadEvents, loadNotes, noteItems, loadActivity,
    type CalItem, type Activity,
  } from "$lib/calendar";

  let files = $state<Entry[]>([]);
  let tasks = $state<{ file: Entry; items: Task[] }[]>([]);
  let items = $state<CalItem[]>([]);
  let activity = $state<Activity>(new Map());
  let weekOffset = $state(0);

  $effect(() => {
    app.revision;
    app.root;
    load();
  });

  async function load() {
    files = await listWork();
    const mds = files.filter((f) => f.name.toLowerCase().endsWith(".md"));
    const [found, events, notes, act] = await Promise.all([
      Promise.all(mds.map(async (file) => ({ file, items: extractTasks(await api.readText(file.path)).filter((t) => !t.done) }))),
      loadEvents(),
      loadNotes(files),
      loadActivity(files),
    ]);
    tasks = found.filter((g) => g.items.length);
    items = [...events, ...noteItems(notes)].sort((a, b) => (a.date + (a.time ?? "")).localeCompare(b.date + (b.time ?? "")));
    activity = act;
  }

  const today = dayKey(new Date());
  const openCount = $derived(tasks.reduce((n, g) => n + g.items.length, 0));
  const recent = $derived([...files].sort((a, b) => b.modified - a.modified).slice(0, 8));

  /** Monday-to-Sunday of the shown week. */
  const week = $derived.by(() => {
    const monday = new Date();
    monday.setHours(0, 0, 0, 0);
    monday.setDate(monday.getDate() - ((monday.getDay() + 6) % 7) + weekOffset * 7);
    return Array.from({ length: 7 }, (_, i) => {
      const d = new Date(monday);
      d.setDate(monday.getDate() + i);
      const k = dayKey(d);
      return {
        date: d,
        key: k,
        items: items.filter((it) => it.date === k),
        paths: [...(activity.get(k)?.keys() ?? [])].filter((p) => !p.startsWith(".board")),
      };
    });
  });

  const weekLabel = $derived.by(() => {
    if (weekOffset === 0) return "This week";
    if (weekOffset === -1) return "Last week";
    if (weekOffset === 1) return "Next week";
    const f = (d: Date) => d.toLocaleDateString([], { day: "numeric", month: "short" });
    return `${f(week[0].date)} – ${f(week[6].date)}`;
  });

  const upcoming = $derived.by(() => {
    const until = dayKey(new Date(Date.now() + 14 * 86_400_000));
    return items.filter((i) => i.date >= today && i.date <= until).slice(0, 6);
  });

  function openDay(k: string) {
    app.calDay = k;
    app.show("calendar");
  }

  async function complete(file: Entry, t: Task) {
    await app.run(async () => {
      const src = await api.readText(file.path);
      const n = extractTasks(src).findIndex((x) => x.line === t.line);
      await api.writeText(file.path, toggleTask(src, n));
      await load();
    }, "Couldn't update the task");
  }

  const relDay = (k: string) => {
    const diff = Math.round((fromKey(k).getTime() - fromKey(today).getTime()) / 86_400_000);
    return diff === 0 ? "Today" : diff === 1 ? "Tomorrow" : fromKey(k).toLocaleDateString([], { weekday: "short", day: "numeric", month: "short" });
  };

  const greeting = $derived.by(() => {
    const h = new Date().getHours();
    return h < 12 ? "Good morning" : h < 18 ? "Good afternoon" : "Good evening";
  });
</script>

<div class="overview">
  <header>
    <p class="eyebrow">{new Date().toLocaleDateString([], { weekday: "long", day: "numeric", month: "long" })}</p>
    <h1>{greeting}</h1>
    <p class="sub">
      {#if app.currentWeek}
        <button class="week-link" onclick={() => app.show("week", app.currentWeek!.id)}>{app.currentWeek.id} →</button> ·
      {/if}
      {files.length} files in <strong>{app.rootName}</strong> · {openCount} open {openCount === 1 ? "task" : "tasks"}
    </p>
  </header>

  <section class="card">
    <div class="card-head">
      <h2>{weekLabel}</h2>
      <div class="week-nav">
        <button onclick={() => weekOffset--} aria-label="Previous week">
          <svg viewBox="0 0 16 16"><path d="M10 4l-4 4 4 4" fill="none" stroke="currentColor" stroke-width="1.4" /></svg>
        </button>
        {#if weekOffset !== 0}<button class="txt" onclick={() => (weekOffset = 0)}>Today</button>{/if}
        <button onclick={() => weekOffset++} aria-label="Next week">
          <svg viewBox="0 0 16 16"><path d="M6 4l4 4-4 4" fill="none" stroke="currentColor" stroke-width="1.4" /></svg>
        </button>
        <button class="txt link" onclick={() => app.show("calendar")}>Open calendar →</button>
      </div>
    </div>
    <div class="week">
      {#each week as d (d.key)}
        <button class="wday" class:today={d.key === today} class:past={d.key < today} onclick={() => openDay(d.key)}>
          <span class="whead">
            <span class="wname">{d.date.toLocaleDateString([], { weekday: "short" })}</span>
            <span class="wnum">{d.date.getDate()}</span>
          </span>
          <span class="wchips">
            {#each d.items.slice(0, 3) as it (it.id)}
              <span class="chip {it.kind}">{it.time ? it.time + " " : ""}{it.title}</span>
            {/each}
            {#if d.items.length > 3}<span class="more">+{d.items.length - 3}</span>{/if}
          </span>
          <span class="wdots"><FileDots paths={d.paths} max={14} /></span>
        </button>
      {/each}
    </div>
  </section>

  <div class="cols">
    <section class="card">
      <div class="card-head">
        <h2>Upcoming</h2>
        <button class="txt link" onclick={() => (app.newNote = { date: today, type: "meeting" })}>+ Meeting note</button>
      </div>
      <ul>
        {#each upcoming as it (it.id)}
          <li>
            <button class="row {it.kind}" onclick={() => (it.path ? app.openPath(it.path) : openDay(it.date))}>
              <span class="ubar"></span>
              <span class="grow">{it.title}</span>
              <span class="meta">{relDay(it.date)}{it.time ? " · " + it.time : ""}</span>
            </button>
          </li>
        {:else}
          <li class="empty">Nothing in the next two weeks.</li>
        {/each}
      </ul>
    </section>

    <section class="card">
      <div class="card-head"><h2>Open tasks</h2></div>
      <div class="scroll">
        {#each tasks as g (g.file.path)}
          <div class="group">
            <button class="row gtitle" onclick={() => app.openPath(g.file.path)}><FileIcon name={g.file.name} /> {g.file.path}</button>
            <ul class="tasks">
              {#each g.items as t (t.line)}
                <li>
                  <label>
                    <input type="checkbox" onchange={() => complete(g.file, t)} />
                    <span>{t.text}</span>
                  </label>
                </li>
              {/each}
            </ul>
          </div>
        {:else}
          <p class="empty">No open tasks. Add <code>- [ ] something</code> to any Markdown file.</p>
        {/each}
      </div>
    </section>
  </div>

  <section class="card">
    <div class="card-head"><h2>Recently changed</h2></div>
    <ul class="recent">
      {#each recent as f (f.path)}
        <li>
          <button class="row" onclick={() => app.openPath(f.path)}>
            <FileIcon name={f.name} />
            <span class="fname">{f.name}</span>
            <span class="grow where">{parentOf(f.path)}</span>
            <span class="meta">{fmtDate(f.modified)}</span>
          </button>
        </li>
      {/each}
    </ul>
  </section>
</div>

<style>
  .overview {
    flex: 1;
    min-height: 0;
    overflow: auto;
    padding: 40px 48px 64px;
  }
  header,
  .card,
  .cols {
    max-width: 1080px;
    margin-inline: auto;
  }
  header {
    margin-bottom: 24px;
  }
  .eyebrow {
    margin: 0;
    color: var(--muted);
    font-size: 13px;
  }
  h1 {
    margin: 4px 0 6px;
    font-size: 26px;
    font-weight: 650;
    letter-spacing: -0.01em;
  }
  .sub {
    margin: 0;
    color: var(--muted);
    font-size: 13px;
  }
  .week-link {
    padding: 0;
    border: 0;
    background: none;
    color: var(--accent);
    font: inherit;
    font-weight: 600;
  }
  .sub strong {
    color: var(--text);
    font-weight: 550;
  }
  .card {
    padding: 16px 18px;
    border: 1px solid var(--border);
    border-radius: var(--r-lg);
    background: var(--panel);
  }
  .card + .cols,
  .cols + .card {
    margin-top: 16px;
  }
  .cols {
    display: grid;
    grid-template-columns: repeat(2, minmax(0, 1fr));
    gap: 16px;
  }
  .cols .card {
    margin: 0;
    min-width: 0;
  }
  @media (max-width: 1000px) {
    .cols {
      grid-template-columns: 1fr;
    }
  }
  .card-head {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 8px;
    margin-bottom: 10px;
  }
  h2 {
    margin: 0;
    color: var(--muted);
    font-size: 11px;
    font-weight: 600;
    letter-spacing: 0.05em;
    text-transform: uppercase;
  }
  ul {
    margin: 0;
    padding: 0;
    list-style: none;
  }
  .txt {
    padding: 3px 8px;
    border: 0;
    border-radius: var(--r-sm);
    background: none;
    color: var(--muted);
    font: inherit;
    font-size: 12.5px;
  }
  .txt:hover {
    background: var(--hover);
  }
  .link {
    color: var(--accent);
  }

  /* Week strip: fixed height so nothing below moves. */
  .week-nav {
    display: flex;
    align-items: center;
    gap: 2px;
  }
  .week-nav button:not(.txt) {
    display: grid;
    place-items: center;
    width: 26px;
    height: 26px;
    border: 0;
    border-radius: var(--r-sm);
    background: none;
    color: var(--muted);
  }
  .week-nav button:not(.txt):hover {
    background: var(--hover);
    color: var(--text);
  }
  .week-nav svg {
    width: 14px;
    height: 14px;
  }
  .week {
    display: grid;
    grid-template-columns: repeat(7, minmax(0, 1fr));
    gap: 6px;
  }
  .wday {
    display: flex;
    flex-direction: column;
    gap: 6px;
    height: 148px;
    padding: 8px;
    overflow: hidden;
    border: 1px solid var(--border);
    border-radius: var(--r);
    background: var(--bg);
    color: var(--text);
    font: inherit;
    text-align: left;
  }
  .wday:hover {
    border-color: var(--accent);
  }
  .wday.today {
    border-color: var(--accent);
    box-shadow: inset 0 0 0 1px var(--accent);
  }
  .whead {
    display: flex;
    align-items: baseline;
    justify-content: space-between;
  }
  .wname {
    color: var(--muted);
    font-size: 11px;
    font-weight: 600;
    text-transform: uppercase;
  }
  .wnum {
    font-size: 15px;
    font-weight: 600;
    font-variant-numeric: tabular-nums;
  }
  .today .wnum {
    color: var(--accent);
  }
  .past .wnum {
    color: var(--muted);
  }
  .wchips {
    display: flex;
    flex-direction: column;
    gap: 2px;
    min-height: 0;
    overflow: hidden;
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
  .wdots {
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

  /* Lists */
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
  .ubar {
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
  .fname {
    flex: 0 1 45%;
    min-width: 0;
    max-width: 45%;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }
  .where,
  .meta {
    color: var(--muted);
    font-size: 12px;
  }
  .meta {
    flex: none;
    font-variant-numeric: tabular-nums;
  }
  .scroll {
    max-height: 260px;
    overflow: auto;
  }
  .group + .group {
    margin-top: 8px;
  }
  .gtitle {
    color: var(--muted);
    font-size: 12px;
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
  .recent {
    display: grid;
    grid-template-columns: repeat(2, minmax(0, 1fr));
    column-gap: 16px;
  }
  .recent > li {
    min-width: 0;
    overflow: hidden;
  }
  .recent .row {
    overflow: hidden;
  }
  @media (max-width: 1000px) {
    .recent {
      grid-template-columns: 1fr;
    }
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
