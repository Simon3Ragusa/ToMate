<script lang="ts">
  import TimePicker from "./TimePicker.svelte";
  import FileIcon from "./FileIcon.svelte";
  import FileDots from "./FileDots.svelte";
  import TypeLegend from "./TypeLegend.svelte";
  import { api, listWork } from "$lib/api";
  import { app } from "$lib/state.svelte";
  import {
    dayKey, fromKey, loadEvents, saveEvents, loadNotes, noteItems, loadActivity,
    type CalItem, type EventKind, type Activity,
  } from "$lib/calendar";

  const today = dayKey(new Date());
  // Open on the day requested by another view (e.g. the Overview week strip), else today.
  const initial = fromKey(app.calDay ?? today);
  app.calDay = null;
  let month = $state(new Date(initial.getFullYear(), initial.getMonth(), 1));
  let selected = $state(dayKey(initial));
  let events = $state<CalItem[]>([]);
  let notes = $state<CalItem[]>([]);
  let activity = $state<Activity>(new Map());

  // New-event form
  let fTitle = $state("");
  let fTime = $state("");
  let fKind = $state<EventKind>("deadline");

  $effect(() => {
    app.revision;
    app.root;
    load();
  });

  async function load() {
    const files = await listWork();
    [events, notes, activity] = await Promise.all([loadEvents(), loadNotes(files).then(noteItems), loadActivity(files)]);
  }

  const items = $derived.by(() => {
    const byDay = new Map<string, CalItem[]>();
    for (const it of [...events, ...notes]) {
      if (!byDay.has(it.date)) byDay.set(it.date, []);
      byDay.get(it.date)!.push(it);
    }
    for (const list of byDay.values()) list.sort((a, b) => (a.time ?? "99").localeCompare(b.time ?? "99"));
    return byDay;
  });

  /** 6 weeks starting on the Monday on or before the 1st. */
  const grid = $derived.by(() => {
    const start = new Date(month);
    start.setDate(1 - ((start.getDay() + 6) % 7));
    return Array.from({ length: 42 }, (_, i) => {
      const d = new Date(start);
      d.setDate(start.getDate() + i);
      return d;
    });
  });

  const weekdays = Array.from({ length: 7 }, (_, i) =>
    new Date(2024, 0, 1 + i).toLocaleDateString([], { weekday: "short" }),
  );

  const dayItems = $derived(items.get(selected) ?? []);
  const dayFiles = $derived(
    [...(activity.get(selected) ?? new Map<string, "created" | "edited" | "removed">())]
      .filter(([p]) => !p.startsWith(".board"))
      .sort((a, b) => a[0].localeCompare(b[0])),
  );

  const pathsOn = (k: string) => [...(activity.get(k)?.keys() ?? [])].filter((p) => !p.startsWith(".board"));

  function shift(n: number) {
    month = new Date(month.getFullYear(), month.getMonth() + n, 1);
  }

  function goToday() {
    month = new Date(new Date().getFullYear(), new Date().getMonth(), 1);
    selected = today;
  }

  async function addEvent(e: SubmitEvent) {
    e.preventDefault();
    if (!fTitle.trim()) return;
    const ev: CalItem = { id: crypto.randomUUID(), date: selected, title: fTitle.trim(), kind: fKind, ...(fTime ? { time: fTime } : {}) };
    await app.run(async () => {
      await saveEvents([...events, ev]);
      events = [...events, ev];
      fTitle = "";
      fTime = "";
    }, "Couldn't save the event");
  }

  async function removeEvent(id: string) {
    const next = events.filter((e) => e.id !== id);
    await app.run(async () => {
      await saveEvents(next);
      events = next;
    }, "Couldn't remove the event");
  }

  const label = { created: "Created", edited: "Edited", removed: "Removed" } as const;
</script>

<div class="cal">
  <section class="month">
    <header>
      <h1>{month.toLocaleDateString([], { month: "long", year: "numeric" })}</h1>
      <div class="nav">
        <button onclick={() => shift(-1)} title="Previous month" aria-label="Previous month">
          <svg viewBox="0 0 16 16"><path d="M10 4l-4 4 4 4" fill="none" stroke="currentColor" stroke-width="1.4" /></svg>
        </button>
        <button class="today-btn" onclick={goToday}>Today</button>
        <button onclick={() => shift(1)} title="Next month" aria-label="Next month">
          <svg viewBox="0 0 16 16"><path d="M6 4l4 4-4 4" fill="none" stroke="currentColor" stroke-width="1.4" /></svg>
        </button>
      </div>
    </header>

    <div class="weekdays">
      {#each weekdays as w}<span>{w}</span>{/each}
    </div>
    <div class="grid">
      {#each grid as d (d.getTime())}
        {@const k = dayKey(d)}
        {@const its = items.get(k) ?? []}
        <button
          class="cell"
          class:out={d.getMonth() !== month.getMonth()}
          class:sel={k === selected}
          class:is-today={k === today}
          onclick={() => (selected = k)}
        >
          <span class="num">{d.getDate()}</span>
          <div class="chips">
            {#each its.slice(0, 3) as it (it.id)}
              <span class="chip {it.kind}">{it.time ? it.time + " " : ""}{it.title}</span>
            {/each}
            {#if its.length > 3}<span class="more">+{its.length - 3} more</span>{/if}
          </div>
          <div class="act"><FileDots paths={pathsOn(k)} max={10} /></div>
        </button>
      {/each}
    </div>
    <div class="legend-row"><TypeLegend /></div>
  </section>

  <aside class="day">
    <h2>{fromKey(selected).toLocaleDateString([], { weekday: "long", day: "numeric", month: "long" })}</h2>

    <h3>Agenda</h3>
    <ul class="items">
      {#each dayItems as it (it.id)}
        <li class={it.kind}>
          {#if it.path}
            <button class="item" onclick={() => app.openPath(it.path!)}>
              <span class="bar"></span>
              <span class="t">{it.title}</span>
              <span class="k">{it.kind === "meeting" ? "Meeting note" : "Note"}</span>
            </button>
          {:else}
            <div class="item">
              <span class="bar"></span>
              <span class="t">{#if it.time}<b>{it.time}</b> {/if}{it.title}</span>
              <button class="x" title="Delete event" aria-label="Delete event" onclick={() => removeEvent(it.id)}>×</button>
            </div>
          {/if}
        </li>
      {:else}
        <li class="empty">Nothing planned.</li>
      {/each}
    </ul>

    <form class="add" onsubmit={addEvent}>
      <input class="title" bind:value={fTitle} placeholder="Add event or deadline…" />
      <div class="row">
        <TimePicker bind:value={fTime} />
        <select bind:value={fKind}>
          <option value="deadline">Deadline</option>
          <option value="meeting">Meeting</option>
          <option value="event">Other</option>
        </select>
        <button type="submit" disabled={!fTitle.trim()}>Add</button>
      </div>
    </form>
    <button class="note-btn" onclick={() => (app.newNote = { date: selected, type: "meeting" })}>
      + Meeting note for this day
    </button>

    <h3>Files <span class="count">{dayFiles.length || ""}</span></h3>
    <ul class="files">
      {#each dayFiles as [path, kind] (path)}
        <li>
          <button disabled={kind === "removed"} onclick={() => app.openPath(path)}>
            <FileIcon name={path} />
            <span class="p">{path}</span>
            <span class="k">{label[kind]}</span>
          </button>
        </li>
      {:else}
        <li class="empty">No file activity.</li>
      {/each}
    </ul>
  </aside>
</div>

<style>
  .cal {
    flex: 1;
    min-height: 0;
    display: grid;
    grid-template-columns: 1fr 320px;
  }
  .month {
    display: flex;
    flex-direction: column;
    min-width: 0;
    min-height: 0;
    padding: 24px 28px;
  }
  header {
    display: flex;
    align-items: center;
    justify-content: space-between;
    margin-bottom: 16px;
  }
  h1 {
    margin: 0;
    font-size: 20px;
    font-weight: 650;
    text-transform: capitalize;
  }
  .nav {
    display: flex;
    gap: 4px;
  }
  .nav button {
    display: grid;
    place-items: center;
    min-width: 30px;
    height: 30px;
    padding: 0 10px;
    border: 1px solid var(--border);
    border-radius: var(--r);
    background: var(--panel);
    color: var(--text);
    font: inherit;
    font-size: 13px;
  }
  .nav button:hover {
    background: var(--hover);
  }
  .nav svg {
    width: 14px;
    height: 14px;
  }
  .weekdays,
  .grid {
    display: grid;
    grid-template-columns: repeat(7, 1fr);
  }
  .weekdays span {
    padding: 0 8px 6px;
    color: var(--muted);
    font-size: 11px;
    font-weight: 600;
    letter-spacing: 0.04em;
    text-transform: uppercase;
  }
  .grid {
    flex: 1;
    min-height: 0;
    grid-template-rows: repeat(6, 1fr);
    border-top: 1px solid var(--border);
    border-left: 1px solid var(--border);
  }
  .cell {
    position: relative;
    display: flex;
    flex-direction: column;
    gap: 3px;
    min-width: 0;
    min-height: 0;
    padding: 6px;
    overflow: hidden;
    border: 0;
    border-right: 1px solid var(--border);
    border-bottom: 1px solid var(--border);
    background: var(--panel);
    color: var(--text);
    font: inherit;
    text-align: left;
  }
  .cell:hover {
    background: var(--hover);
  }
  .cell.out {
    background: var(--bg);
  }
  .cell.out .num {
    color: var(--muted);
    opacity: 0.6;
  }
  .cell.sel {
    box-shadow: inset 0 0 0 2px var(--accent);
  }
  .num {
    display: grid;
    place-items: center;
    width: 24px;
    height: 24px;
    border-radius: 50%;
    font-size: 12px;
    font-variant-numeric: tabular-nums;
  }
  .is-today .num {
    background: var(--accent);
    color: white;
    font-weight: 600;
  }
  .chips {
    display: flex;
    flex-direction: column;
    gap: 2px;
    min-width: 0;
  }
  .chip {
    overflow: hidden;
    padding: 1px 6px;
    border-left: 2px solid var(--c);
    border-radius: 3px;
    background: color-mix(in srgb, var(--c) 12%, transparent);
    font-size: 11.5px;
    text-overflow: ellipsis;
    white-space: nowrap;
  }
  .more {
    padding-left: 6px;
    color: var(--muted);
    font-size: 11px;
  }
  .act {
    margin-top: auto;
    padding: 2px 1px 0;
  }
  .legend-row {
    display: flex;
    justify-content: flex-end;
    margin-top: 10px;
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

  .day {
    min-height: 0;
    overflow: auto;
    padding: 24px 20px;
    border-left: 1px solid var(--border);
    background: var(--sidebar);
  }
  h2 {
    margin: 0 0 18px;
    font-size: 15px;
    font-weight: 600;
    text-transform: capitalize;
  }
  h3 {
    margin: 20px 0 8px;
    color: var(--muted);
    font-size: 11px;
    font-weight: 600;
    letter-spacing: 0.05em;
    text-transform: uppercase;
  }
  h3:first-of-type {
    margin-top: 0;
  }
  .count {
    margin-left: 4px;
    font-weight: 500;
  }
  ul {
    margin: 0;
    padding: 0;
    list-style: none;
  }
  .item {
    display: flex;
    align-items: center;
    gap: 8px;
    width: 100%;
    padding: 6px 8px;
    border: 0;
    border-radius: var(--r);
    background: var(--panel);
    color: var(--text);
    font: inherit;
    font-size: 13px;
    text-align: left;
  }
  .items li + li {
    margin-top: 4px;
  }
  .bar {
    align-self: stretch;
    width: 3px;
    border-radius: 2px;
    background: var(--c);
  }
  .t {
    flex: 1;
    min-width: 0;
  }
  .k {
    color: var(--muted);
    font-size: 11px;
    white-space: nowrap;
  }
  .x {
    width: 20px;
    height: 20px;
    border: 0;
    border-radius: var(--r-sm);
    background: none;
    color: var(--muted);
    font-size: 15px;
    line-height: 1;
  }
  .x:hover {
    background: var(--hover);
    color: var(--danger);
  }
  .empty {
    padding: 4px 2px;
    color: var(--muted);
    font-size: 13px;
  }
  .add {
    display: grid;
    gap: 6px;
    margin-top: 10px;
  }
  .add input,
  .add select {
    height: 30px;
    padding: 0 8px;
    border: 1px solid var(--border);
    border-radius: var(--r);
    background: var(--panel);
    color: var(--text);
    font: inherit;
    font-size: 13px;
    outline: none;
  }
  .add input:focus,
  .add select:focus {
    border-color: var(--accent);
  }
  .row {
    display: grid;
    grid-template-columns: 1fr 1fr auto;
    gap: 6px;
  }
  .add button {
    padding: 0 12px;
    border: 0;
    border-radius: var(--r);
    background: var(--accent);
    color: white;
    font: inherit;
    font-size: 13px;
  }
  .add button:disabled {
    opacity: 0.4;
  }
  .note-btn {
    width: 100%;
    margin-top: 8px;
    padding: 6px;
    border: 1px dashed var(--border);
    border-radius: var(--r);
    background: none;
    color: var(--muted);
    font: inherit;
    font-size: 12.5px;
  }
  .note-btn:hover {
    border-color: var(--accent);
    color: var(--accent);
  }
  .files button {
    display: flex;
    align-items: center;
    gap: 8px;
    width: 100%;
    padding: 5px 6px;
    border: 0;
    border-radius: var(--r-sm);
    background: none;
    color: var(--text);
    font: inherit;
    font-size: 12.5px;
    text-align: left;
  }
  .files button:hover:not(:disabled) {
    background: var(--hover);
  }
  .files button:disabled {
    opacity: 0.55;
  }
  .p {
    flex: 1;
    min-width: 0;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }
</style>
