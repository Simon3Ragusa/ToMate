<script lang="ts">
  import { onMount } from "svelte";
  import { open as pickFolder } from "@tauri-apps/plugin-dialog";
  import Sidebar from "$lib/components/Sidebar.svelte";
  import Overview from "$lib/components/Overview.svelte";
  import FileView from "$lib/components/FileView.svelte";
  import QuickOpen from "$lib/components/QuickOpen.svelte";
  import Calendar from "$lib/components/Calendar.svelte";
  import Notes from "$lib/components/Notes.svelte";
  import NewNote from "$lib/components/NewNote.svelte";
  import WeekPage from "$lib/components/WeekPage.svelte";
  import SearchPage from "$lib/components/SearchPage.svelte";
  import TabBar from "$lib/components/TabBar.svelte";
  import Notch from "$lib/components/Notch.svelte";
  import { startNotch } from "$lib/notch.svelte";
  import Settings from "$lib/components/Settings.svelte";
  import PlatformPage from "$lib/components/PlatformPage.svelte";
  import SetupDialog from "$lib/components/SetupDialog.svelte";
  import { workspace } from "$lib/workspace.svelte";
  import FindingsPage from "$lib/components/FindingsPage.svelte";
  import { theme } from "$lib/theme.svelte";
  import { logo } from "$lib/logo.svelte";
  import Logo from "$lib/components/Logo.svelte";
  import { getCurrentWebview } from "@tauri-apps/api/webview";
  import { api, onFsChange, parentOf } from "$lib/api";
  import { app } from "$lib/state.svelte";
  import { dnd, dropDirAt, dropFallback, setTarget, clearDrag, importDropped } from "$lib/components/dnd.svelte";
  import "../app.css";

  /** The same page also renders the focus notch window (opened at `/#notch`). */
  const isNotch = location.hash === "#notch";
  theme.init(); // before the first paint, so saved colours never flash

  let ready = $state(false);
  let quick = $state(false);
  let sidebarW = $state(272);

  onMount(() => {
    if (isNotch) return;
    logo.init(); // the taskbar icon follows the logo style
    const stopNotch = startNotch();
    const unlisten = onFsChange((dirs) => app.refresh(dirs));
    const unDrop = getCurrentWebview().onDragDropEvent(({ payload: p }) => {
      if (!app.root) return;
      if (p.type === "leave") return clearDrag();
      const s = window.devicePixelRatio || 1;
      const dir = dropDirAt(p.position.x / s, p.position.y / s) ?? (app.current ? parentOf(app.current.path) : dropFallback.dir);
      if (p.type === "drop") {
        clearDrag();
        importDropped(p.paths, dir);
      } else {
        dnd.external = true;
        setTarget(dir);
      }
    });
    api
      .lastWorkspace()
      .then((p) => (p ? app.open(p) : undefined))
      .catch((e) => app.fail("Couldn't reopen the last folder", e))
      .finally(() => (ready = true));
    return () => {
      stopNotch();
      unlisten.then((f) => f());
      unDrop.then((f) => f());
    };
  });

  async function choose() {
    const dir = await pickFolder({ directory: true, title: "Choose a folder to work in" });
    if (typeof dir === "string") await app.run(() => app.open(dir), "Couldn't open that folder");
  }

  function keys(e: KeyboardEvent) {
    if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "p" && app.root) {
      e.preventDefault();
      quick = !quick;
    }
    if ((e.ctrlKey || e.metaKey) && e.shiftKey && e.key.toLowerCase() === "f" && app.root) {
      e.preventDefault();
      app.show("search");
    }
  }

  function drag(e: PointerEvent) {
    const start = e.clientX - sidebarW;
    const move = (ev: PointerEvent) => (sidebarW = Math.min(480, Math.max(200, ev.clientX - start)));
    const up = () => (removeEventListener("pointermove", move), removeEventListener("pointerup", up));
    addEventListener("pointermove", move);
    addEventListener("pointerup", up);
  }
</script>

<svelte:window onkeydown={keys} />

{#if isNotch}
  <Notch />
{:else if !ready}
  <div></div>
{:else if !app.root}
  <main class="welcome">
    <div class="intro">
      <Logo size={72} />
      <h1>ToMate</h1>
      <p>Open a folder to browse, read and edit everything in it, in one place.</p>
      <button onclick={choose}>Open folder…</button>
    </div>
  </main>
{:else}
  <div class="shell" style="grid-template-columns: {sidebarW}px 1fr">
    <Sidebar onswitch={choose} onsearch={() => (quick = true)} />
    <!-- svelte-ignore a11y_no_static_element_interactions -->
    <div class="resizer" style="left: {sidebarW - 3}px" onpointerdown={drag}></div>
    <main>
      <TabBar />
      {#if app.current}
        <FileView entry={app.current} />
      {:else if app.view === "calendar"}
        <Calendar />
      {:else if app.view === "notes"}
        <Notes />
      {:else if app.view === "week"}
        <WeekPage />
      {:else if app.view === "search"}
        <SearchPage />
      {:else if app.view === "settings"}
        <Settings />
      {:else if app.view === "platform"}
        <PlatformPage />
      {:else if app.view === "findings"}
        <FindingsPage />
      {:else}
        <Overview />
      {/if}
    </main>
  </div>
{/if}

{#if quick}
  <QuickOpen onclose={() => (quick = false)} />
{/if}

{#if app.root && workspace.needsSetup}
  <SetupDialog />
{/if}

{#if app.newNote}
  <NewNote />
{/if}

{#if dnd.external && dnd.target !== null}
  <div class="drop-hint">Drop to copy into <strong>{dnd.target || app.rootName}</strong></div>
{/if}

{#if app.toast}
  <!-- svelte-ignore a11y_click_events_have_key_events, a11y_no_static_element_interactions -->
  <div class="toast" class:error={app.toast.error} title="Click to dismiss" onclick={() => (app.toast = null)}>{app.toast.text}</div>
{/if}

<style>
  .shell {
    display: grid;
    height: 100vh;
    position: relative;
  }
  main {
    display: flex;
    flex-direction: column;
    min-width: 0;
    min-height: 0;
    background: var(--bg);
  }
  .resizer {
    position: absolute;
    top: 0;
    bottom: 0;
    width: 6px;
    z-index: 5;
    cursor: col-resize;
  }
  .resizer:hover {
    background: var(--accent-soft);
  }
  .welcome {
    height: 100vh;
    display: grid;
    place-items: center;
  }
  .intro {
    max-width: 380px;
    text-align: center;
  }
  .intro h1 {
    margin: 0 0 8px;
    font-size: 24px;
    font-weight: 650;
  }
  .intro p {
    margin: 0 0 20px;
    color: var(--muted);
  }
  .intro button {
    padding: 8px 18px;
    border: 0;
    border-radius: var(--r);
    background: var(--accent);
    color: white;
    font: inherit;
    font-weight: 550;
  }
  .drop-hint {
    position: fixed;
    bottom: 20px;
    left: 50%;
    z-index: 60;
    padding: 8px 14px;
    border: 1px solid var(--accent);
    border-radius: var(--r);
    background: var(--panel);
    color: var(--text);
    font-size: 13px;
    transform: translateX(-50%);
    box-shadow: var(--shadow);
    pointer-events: none;
  }
  .toast {
    cursor: default;
    position: fixed;
    bottom: 20px;
    left: 50%;
    z-index: 60;
    max-width: 70vw;
    padding: 8px 14px;
    border-radius: var(--r);
    background: var(--toast);
    color: var(--toast-text);
    font-size: 13px;
    transform: translateX(-50%);
    box-shadow: var(--shadow);
  }
  .toast.error {
    background: var(--danger);
    color: white;
  }
</style>
