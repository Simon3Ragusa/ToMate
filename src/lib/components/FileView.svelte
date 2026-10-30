<script lang="ts">
  import MarkdownView from "$lib/viewers/MarkdownView.svelte";
  import PdfView from "$lib/viewers/PdfView.svelte";
  import SlidesView from "$lib/viewers/SlidesView.svelte";
  import OtherViews from "$lib/viewers/OtherViews.svelte";
  import { api, type Entry } from "$lib/api";
  import { app } from "$lib/state.svelte";
  import { kindOf, fmtDate } from "$lib/fileTypes";
  import Backlinks from "./Backlinks.svelte";

  let { entry }: { entry: Entry } = $props();
  const kind = $derived(kindOf(entry.name));
  const crumbs = $derived(entry.path.split("/"));
</script>

<header>
  <nav class="crumbs">
    <span>{app.rootName}</span>
    {#each crumbs as c, i}
      <span class="sep">/</span><span class:last={i === crumbs.length - 1}>{c}</span>
    {/each}
  </nav>
  <span class="meta">Edited {fmtDate(entry.modified)}</span>
  {#if kind !== "markdown"}<Backlinks {entry} compact />{/if}
  <button class:pinned={app.isPinned(entry.path)} title={app.isPinned(entry.path) ? "Unpin from sidebar" : "Pin to sidebar"} onclick={() => app.togglePin(entry.path)}>
    <svg viewBox="0 0 16 16"><path d="M9.8 2.2l4 4-2.1.7-2.6 2.6.3 3-1.4 1.4-2.6-2.6L2.7 14 2 13.3l2.7-2.7-2.6-2.6 1.4-1.4 3 .3 2.6-2.6z" fill={app.isPinned(entry.path) ? "currentColor" : "none"} stroke="currentColor" stroke-width="1.1" stroke-linejoin="round" /></svg>
  </button>
  <button title="Show in Explorer" onclick={() => app.run(() => api.reveal(entry.path), "Couldn't show it in Explorer")}>
    <svg viewBox="0 0 16 16"><path d="M1.5 3.5h4l1.5 1.5h7.5v7.5h-13z" fill="none" stroke="currentColor" stroke-width="1.2" stroke-linejoin="round" /></svg>
  </button>
  <button title="Open with default app" onclick={() => app.run(() => api.openExternal(entry.path), "Couldn't open it with the default app")}>
    <svg viewBox="0 0 16 16"><path d="M9 2.5h4.5V7 M13.5 2.5L7.5 8.5 M11.5 9.5v4h-9v-9h4" fill="none" stroke="currentColor" stroke-width="1.2" /></svg>
  </button>
</header>

<div class="body">
  {#key entry.path}
    {#if kind === "markdown"}
      <MarkdownView {entry} />
    {:else if kind === "pdf"}
      <PdfView path={entry.path} version={entry.modified} />
    {:else if kind === "slides"}
      <SlidesView {entry} />
    {:else}
      <OtherViews {entry} />
    {/if}
  {/key}
</div>

<style>
  header {
    display: flex;
    align-items: center;
    gap: 4px;
    height: 44px;
    padding: 0 12px 0 20px;
    border-bottom: 1px solid var(--border);
    flex: none;
  }
  .crumbs {
    flex: 1;
    min-width: 0;
    overflow: hidden;
    color: var(--muted);
    font-size: 13px;
    text-overflow: ellipsis;
    white-space: nowrap;
  }
  .sep {
    margin: 0 6px;
    opacity: 0.5;
  }
  .last {
    color: var(--text);
    font-weight: 550;
  }
  .meta {
    margin-right: 8px;
    color: var(--muted);
    font-family: var(--mono);
    font-size: 11px;
    white-space: nowrap;
  }
  header button {
    display: grid;
    place-items: center;
    width: 28px;
    height: 28px;
    border: 0;
    border-radius: var(--r);
    background: none;
    color: var(--muted);
  }
  header button:hover {
    background: var(--hover);
    color: var(--text);
  }
  header svg {
    width: 16px;
    height: 16px;
  }
  header button.pinned {
    color: var(--accent);
  }
  .body {
    flex: 1;
    min-height: 0;
    display: flex;
    flex-direction: column;
  }
</style>
