<script lang="ts">
  import FileIcon from "./FileIcon.svelte";
  import { api, parentOf, type Entry } from "$lib/api";
  import { app } from "$lib/state.svelte";

  let { onclose }: { onclose: () => void } = $props();

  let files = $state<Entry[]>([]);
  let q = $state("");
  let sel = $state(0);

  api.listAll().then((f) => (files = f.sort((a, b) => b.modified - a.modified)));

  /** Every query word must appear in the path; name hits rank first. */
  const results = $derived.by(() => {
    const words = q.toLowerCase().split(/\s+/).filter(Boolean);
    if (!words.length) return files.slice(0, 12);
    return files
      .filter((f) => words.every((w) => f.path.toLowerCase().includes(w)))
      .sort((a, b) => +!a.name.toLowerCase().includes(words[0]) - +!b.name.toLowerCase().includes(words[0]))
      .slice(0, 12);
  });

  async function pick(e: Entry | undefined) {
    if (!e) return;
    onclose();
    await app.reveal(e.path);
    app.current = app.dirs[parentOf(e.path)]?.find((x) => x.path === e.path) ?? e;
  }

  function keys(e: KeyboardEvent) {
    if (e.key === "ArrowDown") (sel = Math.min(sel + 1, results.length - 1)), e.preventDefault();
    if (e.key === "ArrowUp") (sel = Math.max(sel - 1, 0)), e.preventDefault();
    if (e.key === "Enter") pick(results[sel]);
    if (e.key === "Escape") onclose();
  }
</script>

<!-- svelte-ignore a11y_click_events_have_key_events, a11y_no_static_element_interactions -->
<div class="scrim" onclick={onclose}>
  <div class="box surface" onclick={(e) => e.stopPropagation()}>
    <!-- svelte-ignore a11y_autofocus -->
    <input bind:value={q} oninput={() => (sel = 0)} onkeydown={keys} placeholder="Go to file…" autofocus spellcheck="false" />
    <ul>
      {#each results as f, i (f.path)}
        <li>
          <button class:sel={i === sel} onmouseenter={() => (sel = i)} onclick={() => pick(f)}>
            <FileIcon name={f.name} />
            <span class="name">{f.name}</span>
            <span class="dir">{parentOf(f.path)}</span>
          </button>
        </li>
      {:else}
        <li class="none">No matching files</li>
      {/each}
    </ul>
  </div>
</div>

<style>
  .scrim {
    position: fixed;
    inset: 0;
    z-index: 40;
    display: flex;
    justify-content: center;
    padding-top: 14vh;
    background: var(--scrim);
  }
  .box {
    width: min(600px, 90vw);
    height: fit-content;
    overflow: hidden;
  }
  input {
    width: 100%;
    padding: 14px 16px;
    border: 0;
    border-bottom: 1px solid var(--border);
    background: none;
    color: var(--text);
    font: inherit;
    font-size: 15px;
    outline: none;
  }
  ul {
    margin: 0;
    padding: 6px;
    list-style: none;
  }
  button {
    display: flex;
    align-items: center;
    gap: 10px;
    width: 100%;
    padding: 7px 10px;
    border: 0;
    border-radius: var(--r);
    background: none;
    color: var(--text);
    font: inherit;
    font-size: 13px;
    text-align: left;
  }
  button.sel {
    background: var(--selected);
    color: var(--selected-text);
  }
  .name {
    white-space: nowrap;
  }
  .dir {
    overflow: hidden;
    color: var(--muted);
    font-family: var(--mono);
    font-size: 11px;
    text-overflow: ellipsis;
    white-space: nowrap;
  }
  .none {
    padding: 10px;
    color: var(--muted);
    font-size: 13px;
  }
</style>
