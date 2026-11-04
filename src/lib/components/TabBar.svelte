<script lang="ts">
  import FileIcon from "./FileIcon.svelte";
  import { app } from "$lib/state.svelte";

  function keys(e: KeyboardEvent) {
    if (!(e.ctrlKey || e.metaKey) || !app.tabs.length) return;
    if (e.key.toLowerCase() === "w" && app.current) {
      e.preventDefault();
      app.closeTab(app.current.path);
    } else if (e.key === "Tab") {
      e.preventDefault();
      const i = app.tabs.findIndex((t) => t.path === app.current?.path);
      const n = app.tabs.length;
      app.current = app.tabs[i < 0 ? (e.shiftKey ? n - 1 : 0) : (i + (e.shiftKey ? n - 1 : 1)) % n];
    }
  }
</script>

<svelte:window onkeydown={keys} />

{#if app.tabs.length}
  <div class="tabs" role="tablist">
    {#each app.tabs as t (t.path)}
      <div
        class="tab"
        class:on={app.current?.path === t.path}
        class:preview={app.previewTab === t.path}
        role="tab"
        tabindex="0"
        aria-selected={app.current?.path === t.path}
        title={t.path}
        onclick={() => (app.current = t)}
        ondblclick={() => app.keepTab(t.path)}
        onkeydown={(e) => e.key === "Enter" && (app.current = t)}
        onauxclick={(e) => e.button === 1 && app.closeTab(t.path)}
      >
        <FileIcon name={t.name} />
        <span class="name">{t.name}</span>
        <button
          class="x"
          title="Close (⌘/Ctrl W)"
          onclick={(e) => {
            e.stopPropagation();
            app.closeTab(t.path);
          }}
        >
          <svg viewBox="0 0 16 16"><path d="M4.5 4.5l7 7M11.5 4.5l-7 7" stroke="currentColor" stroke-width="1.3" /></svg>
        </button>
      </div>
    {/each}
  </div>
{/if}

<style>
  .tabs {
    display: flex;
    flex: none;
    height: 34px;
    overflow-x: auto;
    overflow-y: hidden;
    background: var(--sidebar);
    border-bottom: 1px solid var(--border);
    scrollbar-width: none;
  }
  .tab {
    display: flex;
    align-items: center;
    gap: 6px;
    max-width: 220px;
    padding: 0 4px 0 12px;
    border-right: 1px solid var(--border);
    color: var(--muted);
    font-size: 12.5px;
    cursor: pointer;
    user-select: none;
  }
  .tab:hover {
    color: var(--text);
  }
  .tab.on {
    background: var(--bg);
    color: var(--text);
    box-shadow: inset 0 2px 0 var(--accent);
  }
  /* Temporary tab: italic until kept (double-click, or edit the file). */
  .preview .name {
    font-style: italic;
  }
  .name {
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }
  .x {
    display: grid;
    place-items: center;
    flex: none;
    width: 20px;
    height: 20px;
    border: 0;
    border-radius: var(--r-sm);
    background: none;
    color: inherit;
    opacity: 0;
  }
  .tab:hover .x,
  .tab.on .x {
    opacity: 1;
  }
  .x:hover {
    background: var(--hover);
  }
  .x svg {
    width: 13px;
    height: 13px;
  }
</style>
