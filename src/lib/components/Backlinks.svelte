<!-- Files that link to this one, via [[wiki links]] or relative Markdown links. -->
<script lang="ts">
  import { onMount } from "svelte";
  import FileIcon from "./FileIcon.svelte";
  import { app } from "$lib/state.svelte";
  import { index } from "$lib/search.svelte";
  import { backlinks } from "$lib/links";
  import type { Entry } from "$lib/api";

  let { entry, compact = false }: { entry: Entry; compact?: boolean } = $props();
  let open = $state(false);

  onMount(() => void index.update());

  const links = $derived.by(() => {
    index.version;
    return backlinks(entry, index.markdown(), index.files);
  });
  const name = (p: string) => p.split("/").pop() ?? p;
</script>

{#snippet list()}
  <ul>
    {#each links as l (l.path)}
      <li>
        <button onclick={() => ((open = false), app.openPath(l.path))}>
          <span class="file"><FileIcon name={l.path} /> {name(l.path)}</span>
          <span class="line">{l.line}</span>
        </button>
      </li>
    {/each}
  </ul>
{/snippet}

{#if compact}
  {#if links.length}
    <div class="chip-wrap">
      <button class="chip" title="Notes linking here" onclick={() => (open = !open)}>
        <svg viewBox="0 0 16 16"><path d="M6.5 9.5l3-3M5 8l-1.5 1.5a2.1 2.1 0 003 3L8 11M11 8l1.5-1.5a2.1 2.1 0 00-3-3L8 5" fill="none" stroke="currentColor" stroke-width="1.2" stroke-linecap="round" /></svg>
        {links.length}
      </button>
      {#if open}<div class="pop surface">{@render list()}</div>{/if}
    </div>
  {/if}
{:else if links.length}
  <section class="backlinks">
    <h2>Linked from {links.length} {links.length === 1 ? "note" : "notes"}</h2>
    {@render list()}
  </section>
{/if}

<style>
  .backlinks {
    max-width: 760px;
    margin: 48px auto 0;
    padding-top: 14px;
    border-top: 1px solid var(--border);
  }
  h2 {
    margin: 0 0 8px;
    color: var(--muted);
    font-size: 11px;
    font-weight: 600;
    letter-spacing: 0.04em;
    text-transform: uppercase;
  }
  ul {
    margin: 0;
    padding: 0;
    list-style: none;
  }
  li button {
    display: flex;
    flex-direction: column;
    gap: 1px;
    width: 100%;
    padding: 6px 8px;
    border: 0;
    border-radius: var(--r);
    background: none;
    color: var(--text);
    font: inherit;
    text-align: left;
  }
  li button:hover {
    background: var(--hover);
  }
  .file {
    display: flex;
    align-items: center;
    gap: 6px;
    font-size: 13px;
    font-weight: 550;
  }
  .line {
    overflow: hidden;
    padding-left: 22px;
    color: var(--muted);
    font-size: 12.5px;
    text-overflow: ellipsis;
    white-space: nowrap;
  }
  .chip-wrap {
    position: relative;
  }
  .chip {
    display: flex;
    align-items: center;
    gap: 4px;
    height: 26px;
    padding: 0 8px;
    border: 1px solid var(--border);
    border-radius: var(--r);
    background: none;
    color: var(--muted);
    font: inherit;
    font-size: 12px;
  }
  .chip:hover {
    color: var(--text);
  }
  .chip svg {
    width: 14px;
    height: 14px;
  }
  .pop {
    position: absolute;
    top: 32px;
    right: 0;
    z-index: 40;
    width: 340px;
    max-height: 320px;
    overflow: auto;
    padding: 4px;
  }
</style>
