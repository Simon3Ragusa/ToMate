<script lang="ts">
  import TreeNode from "./TreeNode.svelte";
  import ContextMenu from "./ContextMenu.svelte";
  import { app } from "$lib/state.svelte";
  import { tree, startNew, remove } from "./tree.svelte";
  import { dnd } from "./dnd.svelte";
  import { parentOf } from "$lib/api";
  import FocusTimer from "./FocusTimer.svelte";
  import { workspace } from "$lib/workspace.svelte";
  import Pinned from "./Pinned.svelte";
  import Logo from "./Logo.svelte";
  import { findings } from "$lib/findings.svelte";

  let { onswitch, onsearch }: { onswitch: () => void; onsearch: () => void } = $props();

  /** New items go next to the selection (inside it if it is a folder). */
  const targetDir = $derived(app.current ? parentOf(app.current.path) : "");

  function keys(e: KeyboardEvent) {
    if (tree.editing || !app.current) return;
    if (e.key === "F2") tree.editing = { mode: "rename", entry: app.current };
    if (e.key === "Delete") remove(app.current);
  }
</script>

<aside>
  <header>
    <Logo size={22} />
    <button class="workspace" onclick={onswitch} title="Open another folder">
      <span class="ws-name">{app.rootName}</span>
      <svg viewBox="0 0 16 16"><path d="M4.5 6.5l3.5 3.5 3.5-3.5" fill="none" stroke="currentColor" stroke-width="1.3" /></svg>
    </button>
    <button class="gear" class:active={!app.current && app.view === "settings"} title="Settings" onclick={() => app.show("settings")}>
      <svg viewBox="0 0 16 16"><circle cx="8" cy="8" r="2.2" fill="none" stroke="currentColor" stroke-width="1.2" /><path d="M8 1.8v1.6M8 12.6v1.6M1.8 8h1.6M12.6 8h1.6M3.6 3.6l1.1 1.1M11.3 11.3l1.1 1.1M3.6 12.4l1.1-1.1M11.3 4.7l1.1-1.1" stroke="currentColor" stroke-width="1.2" stroke-linecap="round" /></svg>
    </button>
  </header>

  <nav class="actions">
    <button class:active={!app.current && app.view === "overview"} onclick={() => app.show("overview")}>
      <svg viewBox="0 0 16 16"><path d="M2.5 7.5L8 3l5.5 4.5V13h-11z" fill="none" stroke="currentColor" stroke-width="1.2" stroke-linejoin="round" /></svg>
      Overview
    </button>
    <button class:active={!app.current && app.view === "calendar"} onclick={() => app.show("calendar")}>
      <svg viewBox="0 0 16 16"><rect x="2" y="3" width="12" height="11" rx="1.5" fill="none" stroke="currentColor" stroke-width="1.2" /><path d="M2 6.5h12M5.5 1.5v3M10.5 1.5v3" stroke="currentColor" stroke-width="1.2" /></svg>
      Calendar
    </button>
    <button class:active={!app.current && app.view === "notes"} onclick={() => app.show("notes")}>
      <svg viewBox="0 0 16 16"><path d="M3.5 1.5h9v13h-9z M6 5h4 M6 7.5h4 M6 10h2.5" fill="none" stroke="currentColor" stroke-width="1.2" stroke-linejoin="round" /></svg>
      Notes
    </button>
    <button class:active={!app.current && app.view === "search"} onclick={() => app.show("search")}>
      <svg viewBox="0 0 16 16"><path d="M2.5 4h11M2.5 8h6M2.5 12h4" stroke="currentColor" stroke-width="1.2" /><circle cx="11.5" cy="10.5" r="2.5" fill="none" stroke="currentColor" stroke-width="1.2" /><path d="M13.3 12.3L15 14" stroke="currentColor" stroke-width="1.2" /></svg>
      Search
      <kbd>⌘/Ctrl ⇧ F</kbd>
    </button>
    {#if workspace.config.modules.findings}
    <button class:active={!app.current && app.view === "findings"} onclick={() => app.show("findings")}>
      <svg viewBox="0 0 16 16"><circle cx="8" cy="8" r="6" fill="none" stroke="currentColor" stroke-width="1.2" /><circle cx="8" cy="8" r="3" fill="none" stroke="currentColor" stroke-width="1.2" /><path d="M8 8l4.2-4.2" stroke="currentColor" stroke-width="1.2" stroke-linecap="round" /></svg>
      Findings
      {#if findings.unread}<span class="count">{findings.unread}</span>{/if}
    </button>
    {/if}
    {#if workspace.config.modules.platform}
    <button class:active={!app.current && app.view === "platform"} onclick={() => app.show("platform")} title="Material about ToMate itself">
      <svg viewBox="0 0 16 16"><rect x="2" y="2.5" width="12" height="9" rx="1.5" fill="none" stroke="currentColor" stroke-width="1.2" /><path d="M5.5 14h5M8 11.5V14" stroke="currentColor" stroke-width="1.2" stroke-linecap="round" /></svg>
      Platform
    </button>
    {/if}
    <button class="search" onclick={onsearch}>
      <svg viewBox="0 0 16 16"><circle cx="7" cy="7" r="4.5" fill="none" stroke="currentColor" stroke-width="1.2" /><path d="M10.5 10.5L14 14" stroke="currentColor" stroke-width="1.2" /></svg>
      Go to file
      <kbd>⌘/Ctrl P</kbd>
    </button>
  </nav>

  <Pinned />

  <div class="section"><span>Weeks</span></div>
  <div class="weeks">
    {#each app.weeks as w (w.id)}
      <button
        class:active={!app.current && app.view === "week" && app.weekId === w.id}
        class:now={app.currentWeek?.id === w.id}
        title="{w.start} → {w.end}"
        onclick={() => app.show("week", w.id)}>{w.id}</button
      >
    {/each}
  </div>

  <div class="section">
    <span>Files</span>
    <div class="tools">
      <button title="New file" onclick={() => startNew("new-file", targetDir)}>
        <svg viewBox="0 0 16 16"><path d="M3.5 1.5h6l3 3v10h-9z M8 7.5v4 M6 9.5h4" fill="none" stroke="currentColor" stroke-width="1.2" /></svg>
      </button>
      <button title="New folder" onclick={() => startNew("new-folder", targetDir)}>
        <svg viewBox="0 0 16 16"><path d="M1.5 3.5h4l1.5 1.5h7.5v7.5h-13z M8 7v4 M6 9h4" fill="none" stroke="currentColor" stroke-width="1.2" /></svg>
      </button>
    </div>
  </div>

  <!-- svelte-ignore a11y_no_noninteractive_tabindex -->
  <div
    class="tree"
    class:drop-root={dnd.target === ""}
    data-drop=""
    tabindex="0"
    role="tree"
    onkeydown={keys}
    oncontextmenu={(e) => {
      e.preventDefault();
      tree.menu = { x: e.clientX, y: e.clientY, entry: null };
    }}
  >
    <TreeNode dir="" />
  </div>

  {#if workspace.config.modules.focus}<FocusTimer />{/if}
</aside>

<ContextMenu />

{#if dnd.dragging}
  <div class="ghost" style="left: {dnd.x + 12}px; top: {dnd.y + 8}px">{dnd.dragging.name}</div>
{/if}

<style>
  aside {
    display: flex;
    flex-direction: column;
    height: 100%;
    min-height: 0;
    background: var(--sidebar);
    border-right: 1px solid var(--border);
  }
  header {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 4px;
    padding: 12px 10px 6px;
  }
  header :global(.logo) {
    margin-left: 6px;
  }
  .workspace {
    margin-right: auto;
  }
  .gear {
    display: grid;
    place-items: center;
    flex: none;
    width: 28px;
    height: 28px;
    border: 0;
    border-radius: var(--r);
    background: none;
    color: var(--muted);
  }
  .gear:hover {
    background: var(--hover);
    color: var(--text);
  }
  .gear.active {
    background: var(--selected);
    color: var(--selected-text);
  }
  .gear svg {
    width: 16px;
    height: 16px;
  }
  .workspace {
    display: flex;
    align-items: center;
    gap: 4px;
    max-width: 100%;
    padding: 4px 8px;
    border: 0;
    border-radius: var(--r);
    background: none;
    color: var(--text);
    font: inherit;
    font-size: 14px;
    font-weight: 600;
  }
  .workspace:hover {
    background: var(--hover);
  }
  .ws-name {
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }
  .workspace svg {
    width: 14px;
    height: 14px;
    flex: none;
    color: var(--muted);
  }
  .actions {
    display: flex;
    flex-direction: column;
    gap: 1px;
    padding: 2px 6px 8px;
  }
  .actions button {
    display: flex;
    align-items: center;
    gap: 8px;
    height: 30px;
    padding: 0 10px;
    border: 0;
    border-radius: var(--r);
    background: none;
    color: var(--text);
    font: inherit;
    font-size: 13px;
  }
  .actions button:hover {
    background: var(--hover);
  }
  .actions button.active {
    background: var(--selected);
    color: var(--selected-text);
  }
  .actions svg {
    width: 16px;
    height: 16px;
    color: var(--muted);
  }
  .actions .active svg {
    color: currentColor;
  }
  .count {
    margin-left: auto;
    min-width: 18px;
    padding: 0 5px;
    border-radius: var(--r-lg);
    background: var(--accent);
    color: white;
    font-size: 10.5px;
    font-weight: 600;
    line-height: 16px;
    text-align: center;
  }
  kbd {
    margin-left: auto;
    color: var(--muted);
    font-size: 10.5px;
  }
  .section {
    display: flex;
    align-items: center;
    justify-content: space-between;
    padding: 6px 10px 4px 16px;
    color: var(--muted);
    font-size: 11px;
    font-weight: 600;
    letter-spacing: 0.04em;
    text-transform: uppercase;
  }
  .weeks {
    display: flex;
    flex-wrap: wrap;
    gap: 4px;
    padding: 2px 12px 10px 14px;
  }
  .weeks button {
    min-width: 34px;
    height: 24px;
    padding: 0 8px;
    border: 1px solid var(--border);
    border-radius: var(--r);
    background: var(--panel);
    color: var(--text);
    font-family: var(--mono);
    font-size: 11.5px;
  }
  .weeks button:hover {
    border-color: var(--accent);
  }
  .weeks button.now {
    border-color: var(--accent);
    color: var(--accent);
    font-weight: 600;
  }
  .weeks button.active {
    background: var(--accent);
    border-color: var(--accent);
    color: white;
  }
  .tools {
    display: flex;
    gap: 2px;
  }
  .tools button {
    display: grid;
    place-items: center;
    width: 24px;
    height: 24px;
    border: 0;
    border-radius: var(--r-sm);
    background: none;
    color: var(--muted);
  }
  .tools button:hover {
    background: var(--hover);
    color: var(--text);
  }
  .tools svg {
    width: 15px;
    height: 15px;
  }
  .tree {
    flex: 1;
    min-height: 0;
    overflow: auto;
    padding: 0 6px 12px;
    outline: none;
    user-select: none;
  }
  .tree.drop-root {
    background: var(--accent-soft);
    box-shadow: inset 0 0 0 1px var(--accent);
  }
  .ghost {
    position: fixed;
    z-index: 70;
    padding: 3px 10px;
    border-radius: var(--r);
    background: var(--panel);
    box-shadow: var(--shadow);
    color: var(--text);
    font-size: 12.5px;
    pointer-events: none;
  }
</style>
