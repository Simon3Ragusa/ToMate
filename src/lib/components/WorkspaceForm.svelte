<!-- The workspace config as a form: used by first-run setup and by Settings. Edits `config` in place. -->
<script lang="ts">
  import { WEEKDAYS, type WorkspaceConfig } from "$lib/workspace.svelte";

  let { config = $bindable() }: { config: WorkspaceConfig } = $props();

  const modules: { key: keyof WorkspaceConfig["modules"]; label: string; hint: string }[] = [
    { key: "focus", label: "Focus timer", hint: "Pomodoro sessions in the sidebar, logged per topic" },
    { key: "notch", label: "Focus notch", hint: "A small timer at the top of the screen while the app is in the background" },
    { key: "findings", label: "Findings", hint: "Papers and news imported from a JSON digest feed" },
    { key: "platform", label: "Platform folder", hint: "Keep notes about the app itself in Platform/, out of the tree and weeks" },
  ];
</script>

<div class="form">
  <div class="field">
    <span class="label">Weeks start on</span>
    <div class="days">
      {#each WEEKDAYS as d, i}
        <button type="button" class:on={config.weeks.startDay === i} title={d} onclick={() => (config.weeks.startDay = i)}>{d.slice(0, 2)}</button>
      {/each}
    </div>
  </div>
  <div class="field">
    <span class="label">Length</span>
    <div class="seg">
      {#each [[7, "1 week"], [14, "2 weeks"]] as [n, l]}
        <button type="button" class:on={config.weeks.length === n} onclick={() => (config.weeks.length = n as number)}>{l}</button>
      {/each}
    </div>
  </div>
  <label class="field">
    <span class="label">Week names</span>
    <span class="inline">
      <input class="short mono" bind:value={config.weeks.prefix} maxlength="6" spellcheck="false" aria-label="Week prefix" />
      <span class="hint mono">{config.weeks.prefix || ""}1, {config.weeks.prefix || ""}2, …</span>
    </span>
  </label>
  <label class="field">
    <span class="label">Log file</span>
    <span class="inline">
      <input class="mono" bind:value={config.log.file} spellcheck="false" aria-label="Log file" />
      <span class="hint">headings <code>## [date] [TAG] Title</code></span>
    </span>
  </label>

  <div class="field top">
    <span class="label">Modules</span>
    <div class="mods">
      {#each modules as m (m.key)}
        <label class="mod">
          <input type="checkbox" bind:checked={config.modules[m.key]} />
          <span class="box" aria-hidden="true"></span>
          <span><b>{m.label}</b><small>{m.hint}</small></span>
        </label>
      {/each}
    </div>
  </div>
</div>

<style>
  .form {
    display: flex;
    flex-direction: column;
    gap: 12px;
  }
  .field {
    display: flex;
    align-items: center;
    gap: 14px;
  }
  .field.top {
    align-items: flex-start;
  }
  .label {
    flex: none;
    width: 110px;
    color: var(--muted);
    font-size: 13px;
  }
  .days,
  .seg {
    display: flex;
    padding: 2px;
    border-radius: var(--r);
    background: var(--hover);
  }
  .days button,
  .seg button {
    min-width: 34px;
    height: 26px;
    padding: 0 10px;
    border: 0;
    border-radius: var(--r-sm);
    background: none;
    color: var(--muted);
    font: inherit;
    font-size: 12.5px;
  }
  .days button.on,
  .seg button.on {
    background: var(--panel);
    color: var(--text);
    box-shadow: var(--shadow-sm);
  }
  .inline {
    display: flex;
    flex: 1;
    align-items: center;
    gap: 10px;
    min-width: 0;
  }
  input:not([type]) {
    height: 30px;
    min-width: 0;
    flex: 1;
    max-width: 240px;
    padding: 0 9px;
    border: 1px solid var(--border);
    border-radius: var(--r);
    outline: none;
    background: var(--bg);
    color: var(--text);
    font-size: 12.5px;
  }
  input.short {
    flex: none;
    width: 70px;
  }
  input:not([type]):focus {
    border-color: var(--accent);
  }
  .hint {
    color: var(--muted);
    font-size: 11.5px;
  }
  code {
    font-family: var(--mono);
    font-size: 0.95em;
  }
  .mods {
    display: flex;
    flex-direction: column;
    gap: 8px;
  }
  .mod {
    position: relative;
    display: flex;
    align-items: flex-start;
    gap: 10px;
    cursor: pointer;
  }
  .mod input {
    position: absolute;
    opacity: 0;
    pointer-events: none;
  }
  /* Square checkbox, matching the app's toggle language. */
  .box {
    flex: none;
    width: 15px;
    height: 15px;
    margin-top: 2px;
    border: 1px solid var(--border);
    border-radius: 4px;
    background: var(--bg);
    transition:
      background-color var(--dur) var(--ease),
      border-color var(--dur) var(--ease);
  }
  .mod input:checked + .box {
    border-color: var(--accent);
    background: var(--accent)
      url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 16 16'%3E%3Cpath d='M4 8.5l2.5 2.5L12 5.5' fill='none' stroke='white' stroke-width='2' stroke-linecap='round' stroke-linejoin='round'/%3E%3C/svg%3E")
      center / 12px no-repeat;
  }
  .mod input:focus-visible + .box {
    outline: 1px solid var(--accent);
    outline-offset: 1px;
  }
  .mod b {
    display: block;
    font-size: 13px;
    font-weight: 550;
  }
  .mod small {
    color: var(--muted);
    font-size: 11.5px;
  }
</style>
