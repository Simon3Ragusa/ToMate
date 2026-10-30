<!-- First-run setup for a folder ToMate has never opened: rhythm, log, modules, theme. -->
<script lang="ts">
  import WorkspaceForm from "./WorkspaceForm.svelte";
  import Logo from "./Logo.svelte";
  import { api } from "$lib/api";
  import { app } from "$lib/state.svelte";
  import { theme, type Mode } from "$lib/theme.svelte";
  import { workspace, type WorkspaceConfig } from "$lib/workspace.svelte";

  let draft = $state<WorkspaceConfig>(structuredClone($state.snapshot(workspace.config)) as WorkspaceConfig);
  let createLog = $state(true);
  let busy = $state(false);

  async function done() {
    busy = true;
    await app.run(async () => {
      await workspace.save(draft);
      if (createLog) {
        const today = new Date().toISOString().slice(0, 10);
        await api
          .createFile(workspace.config.log.file, `# Log\n\nOne entry per idea, experiment or decision:\n\n## [${today}] [IDEA] Started using ToMate\n- \n`)
          .catch(() => {}); // already there: keep it
      }
      workspace.needsSetup = false;
      await Promise.all([app.loadWeeks(), app.load("")]);
    }, "Couldn't save the setup");
    busy = false;
  }
</script>

<div class="scrim">
  <form class="dialog surface" onsubmit={(e) => (e.preventDefault(), done())}>
    <header>
      <Logo size={40} />
      <div>
        <h1>Set up {app.rootName}</h1>
        <p>A few choices to fit ToMate to how you work. You can change all of it later in Settings, or edit <code>.board/config.json</code> directly.</p>
      </div>
    </header>

    <WorkspaceForm bind:config={draft} />

    <div class="extra">
      <label class="check">
        <input type="checkbox" bind:checked={createLog} />
        Create <code>{draft.log.file}</code> if it doesn't exist
      </label>
      <div class="theme">
        <span>Theme</span>
        {#each [["system", "System"], ["light", "Light"], ["dark", "Dark"]] as [m, l]}
          <button type="button" class:on={theme.mode === m} onclick={() => theme.setMode(m as Mode)}>{l}</button>
        {/each}
      </div>
    </div>

    <footer>
      <span class="note">Your files stay where they are. ToMate keeps its own data in <code>.board/</code>.</span>
      <button class="primary" type="submit" disabled={busy}>Start</button>
    </footer>
  </form>
</div>

<style>
  .scrim {
    position: fixed;
    inset: 0;
    z-index: 90;
    display: grid;
    place-items: center;
    padding: 24px;
    background: var(--scrim);
  }
  .dialog {
    width: min(600px, 100%);
    max-height: 100%;
    overflow: auto;
    padding: 22px 24px 18px;
    animation: rise 0.3s var(--ease-spring);
  }
  @keyframes rise {
    from {
      opacity: 0;
      transform: translateY(8px) scale(0.98);
    }
  }
  header {
    display: flex;
    gap: 14px;
    margin-bottom: 20px;
  }
  h1 {
    margin: 2px 0 4px;
    font-size: 17px;
    font-weight: 650;
  }
  header p {
    margin: 0;
    color: var(--muted);
    font-size: 12.5px;
    line-height: 1.5;
  }
  code {
    font-family: var(--mono);
    font-size: 0.92em;
  }
  .extra {
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    justify-content: space-between;
    gap: 10px;
    margin-top: 18px;
    padding-top: 14px;
    border-top: 1px solid var(--border);
    font-size: 12.5px;
  }
  .check {
    display: flex;
    align-items: center;
    gap: 7px;
    color: var(--muted);
  }
  .check input {
    accent-color: var(--accent);
  }
  .theme {
    display: flex;
    align-items: center;
    gap: 2px;
    color: var(--muted);
  }
  .theme span {
    margin-right: 6px;
  }
  .theme button {
    height: 24px;
    padding: 0 10px;
    border: 0;
    border-radius: var(--r-sm);
    background: none;
    color: var(--muted);
    font: inherit;
  }
  .theme button.on {
    background: var(--hover);
    color: var(--text);
  }
  footer {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 12px;
    margin-top: 18px;
  }
  .note {
    color: var(--muted);
    font-size: 11.5px;
  }
  .primary {
    height: 32px;
    padding: 0 22px;
    border: 0;
    border-radius: var(--r);
    background: var(--accent);
    color: white;
    font: inherit;
    font-weight: 600;
  }
  .primary:disabled {
    opacity: 0.6;
  }
</style>
