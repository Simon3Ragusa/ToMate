<script lang="ts">
  import { onMount } from "svelte";
  import FileIcon from "./FileIcon.svelte";
  import { app } from "$lib/state.svelte";
  import { index, type Result } from "$lib/search.svelte";
  import { fmtDate } from "$lib/fileTypes";
  import { findings } from "$lib/findings.svelte";

  let q = $state(lastQuery);
  let shown = $state(lastQuery);
  let input = $state<HTMLInputElement>();
  let timer: ReturnType<typeof setTimeout> | undefined;

  onMount(() => {
    input?.focus();
    input?.select();
    index.update();
  });

  $effect(() => {
    const v = q;
    clearTimeout(timer);
    timer = setTimeout(() => ((shown = v), (lastQuery = v)), 150);
  });

  const results = $derived.by<Result[]>(() => {
    index.version;
    return index.search(shown);
  });
  const total = $derived(results.reduce((n, r) => n + r.count, 0));
  const foundFindings = $derived.by(() => {
    const words = shown.toLowerCase().split(/\s+/).filter(Boolean);
    if (!words.length) return [];
    return findings.list
      .filter((f) => findings.status(f.id) !== "archived")
      .filter((f) => words.every((w) => `${f.title} ${f.summary} ${f.relevance}`.toLowerCase().includes(w)))
      .slice(0, 8);
  });

  function openFinding() {
    findings.query = shown;
    app.show("findings");
  }
</script>

<script lang="ts" module>
  let lastQuery = "";
</script>

<div class="page">
  <header>
    <h1>Search</h1>
    <div class="box">
      <svg viewBox="0 0 16 16"><circle cx="7" cy="7" r="4.5" fill="none" stroke="currentColor" stroke-width="1.2" /><path d="M10.5 10.5L14 14" stroke="currentColor" stroke-width="1.2" /></svg>
      <input bind:this={input} bind:value={q} placeholder="Search notes, PDFs and slides…" spellcheck="false" />
    </div>
    <p class="status">
      {#if index.pending}Indexing… {index.pending} files left · {/if}
      {#if shown.trim()}
        {results.length} files{total ? `, ${total} matches` : ""}
      {:else}
        Searches Markdown, text, PDF pages, slide text and notes, and Word documents.
      {/if}
    </p>
  </header>

  {#if foundFindings.length}
    <section class="findings">
      <h2>Findings <span>from your digest feed</span></h2>
      {#each foundFindings as f (f.id)}
        <button class="hit" onclick={openFinding}>
          <span class="label">{f.score === null ? "fit –" : `fit ${f.score}`}</span>
          <span class="snip"><b>{f.title}</b>{f.summary ? ` · ${f.summary.slice(0, 140)}${f.summary.length > 140 ? "…" : ""}` : ""}</span>
        </button>
      {/each}
    </section>
  {/if}

  <ul class="results">
    {#each results as r (r.entry.path)}
      <li>
        <button class="file" onclick={() => app.openPath(r.entry.path)}>
          <FileIcon name={r.entry.name} />
          <span class="name">{r.entry.name}</span>
          <span class="path">{r.entry.path}</span>
          <span class="count">{r.count ? `${r.count}×` : "name"} · {fmtDate(r.entry.modified)}</span>
        </button>
        {#each r.hits as h}
          <button class="hit" onclick={() => app.openPath(r.entry.path)}>
            {#if h.label}<span class="label">{h.label}</span>{/if}
            <span class="snip"
              >{h.snippet.slice(0, h.start)}<mark>{h.snippet.slice(h.start, h.start + h.len)}</mark>{h.snippet.slice(h.start + h.len)}</span
            >
          </button>
        {/each}
      </li>
    {/each}
  </ul>
</div>

<style>
  .page {
    flex: 1;
    min-height: 0;
    overflow: auto;
    padding: 28px 36px 60px;
  }
  header,
  .results {
    max-width: 860px;
    margin: 0 auto;
  }
  h1 {
    margin: 0 0 14px;
    font-size: 20px;
    font-weight: 650;
  }
  .box {
    display: flex;
    align-items: center;
    gap: 8px;
    padding: 0 12px;
    height: 38px;
    border: 1px solid var(--border);
    border-radius: var(--r);
    background: var(--panel);
  }
  .box:focus-within {
    border-color: var(--accent);
  }
  .box svg {
    width: 16px;
    height: 16px;
    color: var(--muted);
  }
  input {
    flex: 1;
    border: 0;
    outline: none;
    background: none;
    color: var(--text);
    font: inherit;
    font-size: 14px;
  }
  .status {
    margin: 8px 2px 18px;
    color: var(--muted);
    font-size: 12px;
  }
  .findings {
    max-width: 860px;
    margin: 0 auto 18px;
  }
  .findings h2 {
    margin: 0 0 4px;
    padding: 0 8px;
    font-size: 13px;
    font-weight: 650;
  }
  .findings h2 span {
    color: var(--muted);
    font-weight: 400;
  }
  .findings .hit {
    padding-left: 8px;
  }
  .snip b {
    color: var(--text);
    font-weight: 600;
  }
  .results {
    padding: 0;
    list-style: none;
  }
  li {
    margin-bottom: 14px;
  }
  button {
    display: flex;
    align-items: baseline;
    gap: 8px;
    width: 100%;
    border: 0;
    background: none;
    color: var(--text);
    font: inherit;
    text-align: left;
  }
  .file {
    align-items: center;
    padding: 4px 8px;
    border-radius: var(--r);
    font-size: 13.5px;
  }
  .file:hover,
  .hit:hover {
    background: var(--hover);
  }
  .name {
    font-weight: 600;
    white-space: nowrap;
  }
  .path {
    flex: 1;
    min-width: 0;
    overflow: hidden;
    color: var(--muted);
    font-family: var(--mono);
    font-size: 11px;
    text-overflow: ellipsis;
    white-space: nowrap;
  }
  .count {
    color: var(--muted);
    font-size: 12px;
    white-space: nowrap;
  }
  .hit {
    padding: 3px 8px 3px 32px;
    border-radius: var(--r);
    font-size: 13px;
    line-height: 1.5;
  }
  .label {
    flex: none;
    min-width: 52px;
    color: var(--muted);
    font-size: 11.5px;
    font-variant-numeric: tabular-nums;
  }
  .snip {
    color: var(--muted);
  }
  mark {
    padding: 0 1px;
    border-radius: 3px;
    background: var(--accent-soft);
    color: var(--text);
    font-weight: 600;
  }
</style>
