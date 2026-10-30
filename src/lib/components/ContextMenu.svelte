<script lang="ts">
  import { api } from "$lib/api";
  import { app } from "$lib/state.svelte";
  import { tree, startNew, remove } from "./tree.svelte";

  const m = $derived(tree.menu);
  const target = $derived(m?.entry ?? null);
  const dir = $derived(target ? (target.is_dir ? target.path : target.path.split("/").slice(0, -1).join("/")) : "");

  function close() {
    tree.menu = null;
  }
  /** Run a menu action, then close. (Closing first clears `target` before the action reads it.) */
  function act(fn: () => unknown) {
    fn();
    close();
  }
</script>

<svelte:window onclick={close} onblur={close} onkeydown={(e) => e.key === "Escape" && close()} />

{#if m}
  <div class="menu surface" style="left: {m.x}px; top: {m.y}px" role="menu">
    <button onclick={() => act(() => startNew("new-file", dir))}>New file</button>
    <button onclick={() => act(() => startNew("new-folder", dir))}>New folder</button>
    {#if target}
      <hr />
      <button onclick={() => act(() => app.togglePin(target.path))}>{app.isPinned(target.path) ? "Unpin" : "Pin to sidebar"}</button>
      <button onclick={() => act(() => (tree.editing = { mode: "rename", entry: target }))}>Rename<kbd>F2</kbd></button>
      <button onclick={() => act(() => app.run(() => api.openExternal(target.path), "Couldn't open it with the default app"))}>Open with default app</button>
      <button onclick={() => act(() => app.run(() => api.reveal(target.path), "Couldn't show it in Explorer"))}>Show in Explorer</button>
      <hr />
      <button class="danger" onclick={() => act(() => remove(target))}>Delete<kbd>Del</kbd></button>
    {/if}
  </div>
{/if}

<style>
  .menu {
    position: fixed;
    z-index: 50;
    min-width: 200px;
    padding: 4px;
  }
  button {
    display: flex;
    justify-content: space-between;
    width: 100%;
    padding: 6px 10px;
    border: 0;
    border-radius: var(--r-sm);
    background: none;
    color: var(--text);
    font: inherit;
    font-size: 13px;
    text-align: left;
  }
  button:hover {
    background: var(--hover);
  }
  .danger {
    color: var(--danger);
  }
  kbd {
    color: var(--muted);
    font-size: 12px;
  }
  hr {
    margin: 4px 6px;
    border: 0;
    border-top: 1px solid var(--border);
  }
</style>
