<!-- Sidebar list of pinned files and folders. Pin from the file header or the tree's context menu. -->
<script lang="ts">
  import FileIcon from "./FileIcon.svelte";
  import { app } from "$lib/state.svelte";
  import { index } from "$lib/search.svelte";
  import { parentOf } from "$lib/api";

  const name = (p: string) => p.split("/").pop() ?? p;

  /** Folders are known from the tree cache, files from the index; unknown means "maybe gone". */
  const items = $derived.by(() => {
    index.version;
    const files = new Set(index.files.map((f) => f.path));
    return app.pins.map((path) => {
      const dir = !!app.dirs[parentOf(path)]?.find((e) => e.path === path && e.is_dir) || path in app.dirs;
      return { path, dir, missing: index.files.length > 0 && !dir && !files.has(path) };
    });
  });

  async function open(it: { path: string; dir: boolean; missing: boolean }) {
    if (it.missing) return app.notify(`"${name(it.path)}" is no longer there. Unpin it with ×.`, true);
    if (it.dir) {
      await app.reveal(it.path); // expands its parents
      app.expanded[it.path] = true;
      if (!(it.path in app.dirs)) await app.load(it.path);
    } else await app.openPath(it.path);
  }
</script>

{#if app.pins.length}
  <div class="section"><span>Pinned</span></div>
  <ul class="pins">
    {#each items as it (it.path)}
      <li>
        <button class="pin" class:on={app.current?.path === it.path} class:missing={it.missing} title={it.path} onclick={() => open(it)}>
          <FileIcon name={it.path} isDir={it.dir} />
          <span class="name">{name(it.path)}</span>
        </button>
        <button class="x" title="Unpin" onclick={() => app.togglePin(it.path)}>
          <svg viewBox="0 0 16 16"><path d="M4.5 4.5l7 7M11.5 4.5l-7 7" stroke="currentColor" stroke-width="1.3" /></svg>
        </button>
      </li>
    {/each}
  </ul>
{/if}

<style>
  .section {
    padding: 6px 10px 4px 16px;
    color: var(--muted);
    font-size: 11px;
    font-weight: 600;
    letter-spacing: 0.04em;
    text-transform: uppercase;
  }
  .pins {
    margin: 0;
    padding: 0 6px 8px;
    list-style: none;
  }
  li {
    position: relative;
    display: flex;
    align-items: center;
  }
  .pin {
    display: flex;
    align-items: center;
    gap: 7px;
    width: 100%;
    min-width: 0;
    height: 28px;
    padding: 0 28px 0 10px;
    border: 0;
    border-radius: var(--r);
    background: none;
    color: var(--text);
    font: inherit;
    font-size: 13px;
    text-align: left;
  }
  .pin:hover {
    background: var(--hover);
  }
  .pin.on {
    background: var(--selected);
    color: var(--selected-text);
  }
  .pin.missing {
    color: var(--muted);
    text-decoration: line-through;
  }
  .name {
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }
  .x {
    position: absolute;
    right: 4px;
    display: grid;
    place-items: center;
    width: 20px;
    height: 20px;
    border: 0;
    border-radius: var(--r-sm);
    background: none;
    color: var(--muted);
    opacity: 0;
  }
  li:hover .x {
    opacity: 1;
  }
  .x:hover {
    background: var(--hover);
    color: var(--text);
  }
  .x svg {
    width: 12px;
    height: 12px;
  }
</style>
