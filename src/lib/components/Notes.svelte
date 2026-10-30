<script lang="ts">
  import { api, listWork } from "$lib/api";
  import { app } from "$lib/state.svelte";
  import { dayKey, fromKey, loadNotes, NOTES_DIR, type Note } from "$lib/calendar";

  let notes = $state<Note[]>([]);
  let filter = $state<"all" | "meeting" | "note">("all");

  $effect(() => {
    app.revision;
    app.root;
    listWork().then(loadNotes).then((n) => (notes = n));
  });

  const shown = $derived(notes.filter((n) => filter === "all" || (filter === "meeting") === (n.type === "meeting")));

  /** Group by month, newest first. */
  const groups = $derived.by(() => {
    const out: { label: string; notes: Note[] }[] = [];
    for (const n of shown) {
      const label = fromKey(n.date).toLocaleDateString([], { month: "long", year: "numeric" });
      if (out.at(-1)?.label !== label) out.push({ label, notes: [] });
      out.at(-1)!.notes.push(n);
    }
    return out;
  });

  const create = (type: "meeting" | "note") => (app.newNote = { date: dayKey(new Date()), type });
</script>

<div class="notes">
  <header>
    <div>
      <h1>Notes</h1>
      <p class="sub">Meeting minutes and quick notes, saved as Markdown in <code>{NOTES_DIR}/</code>.</p>
    </div>
    <div class="actions">
      <button class="ghost" onclick={() => create("note")}>New note</button>
      <button class="primary" onclick={() => create("meeting")}>New meeting</button>
    </div>
  </header>

  <div class="filters">
    {#each [["all", "All"], ["meeting", "Meetings"], ["note", "Notes"]] as [f, l]}
      <button class:on={filter === f} onclick={() => (filter = f as typeof filter)}>{l}</button>
    {/each}
  </div>

  {#each groups as g (g.label)}
    <h2>{g.label}</h2>
    <ul>
      {#each g.notes as n (n.entry.path)}
        <li>
          <button onclick={() => app.openPath(n.entry.path)}>
            <span class="date">
              <span class="d">{fromKey(n.date).getDate()}</span>
              <span class="w">{fromKey(n.date).toLocaleDateString([], { weekday: "short" })}</span>
            </span>
            <span class="body">
              <span class="title">{n.title}</span>
              <span class="kind" class:meeting={n.type === "meeting"}>{n.type === "meeting" ? "Meeting" : "Note"}</span>
            </span>
            {#if n.openActions}
              <span class="todo">{n.openActions} open {n.openActions === 1 ? "action" : "actions"}</span>
            {/if}
          </button>
        </li>
      {/each}
    </ul>
  {:else}
    <div class="empty">
      <p>No notes yet.</p>
      <p class="hint">Create a meeting note before your next check-in. Its action items will appear under Open tasks.</p>
    </div>
  {/each}
</div>

<style>
  .notes {
    flex: 1;
    min-height: 0;
    overflow: auto;
    padding: 40px 48px 64px;
  }
  header,
  .filters,
  h2,
  ul,
  .empty {
    max-width: 820px;
    margin-inline: auto;
  }
  header {
    display: flex;
    align-items: flex-end;
    justify-content: space-between;
    gap: 16px;
    margin-bottom: 20px;
  }
  h1 {
    margin: 0 0 4px;
    font-size: 26px;
    font-weight: 650;
  }
  .sub {
    margin: 0;
    color: var(--muted);
    font-size: 13px;
  }
  code {
    font-family: var(--mono);
    font-size: 12px;
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
  .filters {
    display: flex;
    gap: 4px;
    margin-bottom: 8px;
  }
  .filters button {
    padding: 4px 12px;
    border: 0;
    border-radius: 999px;
    background: none;
    color: var(--muted);
    font: inherit;
    font-size: 12.5px;
  }
  .filters button.on {
    background: var(--selected);
    color: var(--selected-text);
  }
  h2 {
    margin-top: 24px;
    margin-bottom: 8px;
    color: var(--muted);
    font-size: 11px;
    font-weight: 600;
    letter-spacing: 0.05em;
    text-transform: uppercase;
  }
  ul {
    padding: 0;
    list-style: none;
    border: 1px solid var(--border);
    border-radius: var(--r-lg);
    background: var(--panel);
    overflow: hidden;
  }
  li + li {
    border-top: 1px solid var(--border);
  }
  li button {
    display: flex;
    align-items: center;
    gap: 16px;
    width: 100%;
    padding: 10px 16px;
    border: 0;
    background: none;
    color: var(--text);
    font: inherit;
    text-align: left;
  }
  li button:hover {
    background: var(--hover);
  }
  .date {
    display: grid;
    justify-items: center;
    width: 32px;
    flex: none;
  }
  .d {
    font-size: 17px;
    font-weight: 600;
    font-variant-numeric: tabular-nums;
    line-height: 1.1;
  }
  .w {
    color: var(--muted);
    font-size: 11px;
  }
  .body {
    display: flex;
    flex-direction: column;
    gap: 2px;
    flex: 1;
    min-width: 0;
  }
  .title {
    overflow: hidden;
    font-size: 14px;
    font-weight: 550;
    text-overflow: ellipsis;
    white-space: nowrap;
  }
  .kind {
    color: var(--muted);
    font-size: 12px;
  }
  .kind.meeting {
    color: var(--ev-meeting);
  }
  .todo {
    flex: none;
    padding: 2px 8px;
    border-radius: 999px;
    background: var(--hover);
    color: var(--muted);
    font-size: 11.5px;
  }
  .empty {
    padding: 48px 0;
    text-align: center;
    color: var(--muted);
  }
  .empty p {
    margin: 0 0 6px;
  }
  .hint {
    font-size: 13px;
  }
</style>
