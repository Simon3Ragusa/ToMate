<!--
  The platform folder: material about ToMate itself (the ideas backlog,
  handoffs, notes on the app), kept apart from the work files.
-->
<script lang="ts">
  import FileIcon from "./FileIcon.svelte";
  import { api, isPlatform, parentOf, PLATFORM_DIR, type Entry } from "$lib/api";
  import { app } from "$lib/state.svelte";
  import { extractTasks } from "$lib/markdown";
  import { fmtDate } from "$lib/fileTypes";
  import { dropFallback } from "./dnd.svelte";

  let files = $state<Entry[]>([]);
  let progress = $state<Record<string, { done: number; total: number }>>({});

  $effect(() => {
    app.revision;
    load();
  });

  // Files dropped from Windows onto this page land in the platform folder.
  $effect(() => {
    dropFallback.dir = PLATFORM_DIR;
    return () => (dropFallback.dir = "");
  });

  async function load() {
    files = (await api.listAll()).filter((f) => isPlatform(f.path)).sort((a, b) => b.modified - a.modified);
    const p: typeof progress = {};
    for (const f of files.filter((f) => f.name.toLowerCase().endsWith(".md"))) {
      const tasks = extractTasks(await api.readText(f.path).catch(() => ""));
      if (tasks.length) p[f.path] = { done: tasks.filter((t) => t.done).length, total: tasks.length };
    }
    progress = p;
  }

  const rel = (f: Entry) => parentOf(f.path).slice(PLATFORM_DIR.length + 1);
</script>

<div class="page">
  <div class="inner">
    <header>
      <h1>Platform</h1>
      <p>
        Everything about ToMate itself: the ideas backlog, handoffs and notes on the app. It lives in
        <code>{PLATFORM_DIR}/</code> and stays out of the file tree, the weeks and the calendar, so those show your work only.
      </p>
      <div class="actions">
        <button onclick={() => app.run(() => api.createDir(PLATFORM_DIR).catch(() => {}).then(() => api.reveal(PLATFORM_DIR)), "Couldn't open the folder")}>
          Show in Explorer
        </button>
      </div>
    </header>

    <ul>
      {#each files as f (f.path)}
        {@const pr = progress[f.path]}
        <li>
          <button class="row" onclick={() => app.openPath(f.path)}>
            <FileIcon name={f.name} />
            <span class="name">{f.name}</span>
            {#if rel(f)}<span class="dir">{rel(f)}</span>{/if}
            {#if pr}
              <span class="prog" title="{pr.done} of {pr.total} items ticked">
                <span class="track"><span style="width: {(pr.done / pr.total) * 100}%"></span></span>
                {pr.done}/{pr.total}
              </span>
            {/if}
            <span class="date">{fmtDate(f.modified)}</span>
          </button>
        </li>
      {:else}
        <li class="empty">Nothing here yet. Drop files on this page to add them.</li>
      {/each}
    </ul>
  </div>
</div>

<style>
  .page {
    flex: 1;
    min-height: 0;
    overflow: auto;
    padding: 28px 36px 60px;
  }
  .inner {
    max-width: 760px;
    margin: 0 auto;
  }
  h1 {
    margin: 0 0 6px;
    font-size: 20px;
    font-weight: 650;
  }
  header p {
    margin: 0;
    color: var(--muted);
    font-size: 13px;
    line-height: 1.55;
  }
  code {
    padding: 0.05em 0.35em;
    border-radius: var(--r-sm);
    background: var(--code-bg);
    font-family: var(--mono);
    font-size: 0.9em;
  }
  .actions {
    margin: 12px 0 20px;
  }
  .actions button {
    padding: 5px 12px;
    border: 1px solid var(--border);
    border-radius: var(--r);
    background: var(--panel);
    color: var(--text);
    font: inherit;
    font-size: 12.5px;
  }
  .actions button:hover {
    border-color: var(--accent);
  }
  ul {
    margin: 0;
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
  .row {
    display: flex;
    align-items: center;
    gap: 10px;
    width: 100%;
    padding: 10px 14px;
    border: 0;
    background: none;
    color: var(--text);
    font: inherit;
    font-size: 13.5px;
    text-align: left;
  }
  .row:hover {
    background: var(--hover);
  }
  .name {
    font-weight: 550;
  }
  .dir {
    color: var(--muted);
    font-size: 12px;
  }
  .prog {
    display: flex;
    align-items: center;
    gap: 6px;
    margin-left: auto;
    color: var(--muted);
    font-size: 12px;
    font-variant-numeric: tabular-nums;
  }
  .track {
    width: 70px;
    height: 4px;
    border-radius: 2px;
    background: var(--bar);
    overflow: hidden;
  }
  .track span {
    display: block;
    height: 100%;
    background: var(--accent);
  }
  .date {
    min-width: 60px;
    color: var(--muted);
    font-size: 12px;
    text-align: right;
  }
  .prog + .date {
    margin-left: 6px;
  }
  .row .date:first-of-type {
    margin-left: auto;
  }
  .empty {
    padding: 16px;
    color: var(--muted);
    font-size: 13px;
  }
</style>
