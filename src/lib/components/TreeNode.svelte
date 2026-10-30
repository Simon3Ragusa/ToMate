<script lang="ts">
  import TreeNode from "./TreeNode.svelte";
  import FileIcon from "./FileIcon.svelte";
  import { app } from "$lib/state.svelte";
  import { workspace } from "$lib/workspace.svelte";
  import { tree, commitEdit } from "./tree.svelte";
  import { dnd, startDrag, wasDrag } from "./dnd.svelte";
  import { parentOf, PLATFORM_DIR, type Entry } from "$lib/api";

  let { dir, depth = 0 }: { dir: string; depth?: number } = $props();
  // With the Platform module on, that folder has its own sidebar page and stays out of the tree.
  const entries = $derived(
    (app.dirs[dir] ?? []).filter((e) => dir !== "" || !workspace.config.modules.platform || e.path !== PLATFORM_DIR),
  );
  const pad = $derived(`padding-left: ${10 + depth * 14}px`);

  function select(e: Entry) {
    if (wasDrag()) return;
    if (e.is_dir) app.toggle(e.path);
    else app.preview(e);
  }

  function menu(ev: MouseEvent, e: Entry) {
    ev.preventDefault();
    ev.stopPropagation();
    tree.menu = { x: ev.clientX, y: ev.clientY, entry: e };
  }

  function focusSelect(node: HTMLInputElement) {
    node.focus();
    const dot = node.value.lastIndexOf(".");
    node.setSelectionRange(0, dot > 0 ? dot : node.value.length);
  }

  function keys(ev: KeyboardEvent) {
    if (ev.key === "Enter") commitEdit((ev.target as HTMLInputElement).value);
    if (ev.key === "Escape") tree.editing = null;
  }
</script>

{#snippet editor(value: string, icon: { name: string; isDir: boolean })}
  <div class="row editing" style={pad}>
    <span class="chev"></span>
    <FileIcon name={icon.name} isDir={icon.isDir} />
    <input {value} use:focusSelect onkeydown={keys} onblur={(e) => commitEdit(e.currentTarget.value)} spellcheck="false" />
  </div>
{/snippet}

{#if tree.editing && tree.editing.mode !== "rename" && tree.editing.dir === dir}
  {@const folder = tree.editing.mode === "new-folder"}
  {@render editor(folder ? "New folder" : "untitled.md", { name: folder ? "" : "x.md", isDir: folder })}
{/if}

{#each entries as e (e.path)}
  <!-- A folder and its children form one drop zone, highlighted as a block. -->
  <div class="group" class:drop={e.is_dir && dnd.target === e.path}>
  {#if tree.editing?.mode === "rename" && tree.editing.entry.path === e.path}
    {@render editor(e.name, { name: e.name, isDir: e.is_dir })}
  {:else}
    <button
      class="row"
      class:active={app.current?.path === e.path}
      class:moving={dnd.dragging?.path === e.path}
      style={pad}
      title={e.path}
      data-drop={e.is_dir ? e.path : parentOf(e.path)}
      onclick={() => select(e)}
      ondblclick={() => !e.is_dir && app.keepTab(e.path)}
      onpointerdown={(ev) => startDrag(ev, e)}
      oncontextmenu={(ev) => menu(ev, e)}
    >
      <span class="chev" class:open={app.expanded[e.path]}>
        {#if e.is_dir}
          <svg viewBox="0 0 16 16"><path d="M6 4l4 4-4 4" fill="none" stroke="currentColor" stroke-width="1.4" /></svg>
        {/if}
      </span>
      <FileIcon name={e.name} isDir={e.is_dir} open={app.expanded[e.path]} />
      <span class="name">{e.name}</span>
    </button>
  {/if}
  {#if e.is_dir && app.expanded[e.path]}
    <TreeNode dir={e.path} depth={depth + 1} />
  {/if}
  </div>
{/each}

<style>
  .group {
    border-radius: var(--r);
  }
  .group.drop {
    background: var(--accent-soft);
    box-shadow: inset 0 0 0 1px var(--accent);
  }
  .moving {
    opacity: 0.45;
  }
  .row {
    display: flex;
    align-items: center;
    gap: 6px;
    width: 100%;
    height: 28px;
    padding-right: 10px;
    border: 0;
    border-radius: var(--r);
    background: none;
    color: var(--text);
    font: inherit;
    font-size: 13px;
    text-align: left;
    cursor: default;
  }
  .row:hover {
    background: var(--hover);
  }
  .row.active {
    background: var(--selected);
    color: var(--selected-text);
  }
  .row.active :global(.icon) {
    color: currentColor;
  }
  .chev {
    width: 12px;
    flex: none;
    color: var(--muted);
    display: grid;
    place-items: center;
    transition: transform 0.12s;
  }
  .chev svg {
    width: 12px;
    height: 12px;
  }
  .chev.open {
    transform: rotate(90deg);
  }
  .name {
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }
  .editing input {
    flex: 1;
    min-width: 0;
    height: 22px;
    padding: 0 6px;
    border: 1px solid var(--accent);
    border-radius: var(--r-sm);
    background: var(--bg);
    color: var(--text);
    font: inherit;
    font-size: 13px;
    outline: none;
  }
</style>
