<script lang="ts">
  import { theme, GROUPS, ACCENTS, type Mode } from "$lib/theme.svelte";
  import WorkspaceForm from "./WorkspaceForm.svelte";
  import { workspace, type WorkspaceConfig } from "$lib/workspace.svelte";
  import { app } from "$lib/state.svelte";
  import { getVersion, getTauriVersion } from "@tauri-apps/api/app";
  import Logo from "./Logo.svelte";
  import { logo } from "$lib/logo.svelte";
  import { LOGO_PRESETS, DEFAULT_LOGO, type Shape, type Weight } from "$lib/logo";

  const shapes: [Shape, string][] = [
    ["rounded", "Rounded"],
    ["circle", "Circle"],
    ["none", "None"],
  ];
  const weights: [Weight, string][] = [
    ["thin", "Thin"],
    ["regular", "Regular"],
    ["bold", "Bold"],
  ];
  const ls = $derived(logo.style);
  const isPreset = (p: (typeof LOGO_PRESETS)[number]["style"]) => p.line === ls.line && p.tile === ls.tile && p.shape === ls.shape;
  const logoChanged = $derived(JSON.stringify(ls) !== JSON.stringify(DEFAULT_LOGO));

  const modes: [Mode, string][] = [
    ["system", "System"],
    ["light", "Light"],
    ["dark", "Dark"],
  ];

  const overridden = $derived(Object.keys(theme.overrides).length);
  const accentNow = $derived.by(() => {
    theme.version;
    return theme.hex("--accent");
  });

  // Workspace: edit a copy, save on demand.
  const snap = () => structuredClone($state.snapshot(workspace.config)) as WorkspaceConfig;
  let draft = $state<WorkspaceConfig>(snap());
  const dirty = $derived(JSON.stringify(draft) !== JSON.stringify(workspace.config));
  async function saveWorkspace() {
    await app.run(async () => {
      await workspace.save(draft);
      draft = snap();
      await app.loadWeeks();
      app.notify("Workspace settings saved");
    }, "Couldn't save the workspace settings");
  }

  // About and diagnostics.
  let version = $state("");
  let tauriVersion = $state("");
  getVersion().then((v) => (version = v), () => {});
  getTauriVersion().then((v) => (tauriVersion = v), () => {});

  /** A plain-text report for bug reports: versions, platform, config and recent errors. No file contents or paths. */
  async function copyDiagnostics() {
    const text = [
      `ToMate ${version} (Tauri ${tauriVersion})`,
      `Platform: ${navigator.userAgent}`,
      `Screen: ${screen.width}x${screen.height} @${devicePixelRatio}x`,
      `Theme: ${theme.mode} (${theme.scheme})`,
      `Workspace config: ${JSON.stringify(workspace.config)}`,
      `Open tabs: ${app.tabs.length}`,
      "Recent errors:",
      ...(app.recentErrors.length ? app.recentErrors.map((e) => "  " + e) : ["  none"]),
    ].join("\n");
    await navigator.clipboard.writeText(text).then(
      () => app.notify("Diagnostics copied. Paste them into a GitHub issue or a message."),
      (e) => app.fail("Couldn't copy to the clipboard", e),
    );
  }
</script>

<div class="page">
  <div class="inner">
    <h1>Settings</h1>

    <section>
      <div class="head">
        <h2>Workspace <span class="note">· {app.rootName}</span></h2>
        {#if dirty}
          <div class="ws-actions">
            <button class="reset-all" onclick={() => (draft = snap())}>Discard</button>
            <button class="save" onclick={saveWorkspace}>Save</button>
          </div>
        {/if}
      </div>
      <p class="hint">Stored in <code>.board/config.json</code> inside this folder: plain JSON you, or your AI agent, can also edit directly.</p>
      <div class="ws"><WorkspaceForm bind:config={draft} /></div>
    </section>

    <section>
      <h2>Appearance</h2>
      <div class="line">
        <span class="label">Theme</span>
        <div class="seg">
          {#each modes as [m, label]}
            <button class:on={theme.mode === m} onclick={() => theme.setMode(m)}>{label}</button>
          {/each}
        </div>
      </div>
      <div class="line">
        <span class="label">Accent</span>
        <div class="swatches">
          {#each ACCENTS as a}
            {@const c = theme.scheme === "dark" ? a.dark : a.light}
            <button
              class="swatch"
              class:on={accentNow === c}
              style="--c: {c}"
              title={a.name}
              aria-label="{a.name} accent"
              onclick={() => theme.setAccent(a)}
            ></button>
          {/each}
        </div>
      </div>
    </section>

    <section>
      <div class="head">
        <h2>Logo</h2>
        {#if logoChanged}<button class="reset-all" onclick={() => logo.reset()}>Reset</button>{/if}
      </div>
      <div class="logo-row">
        <div class="previews" aria-label="Preview">
          <Logo size={96} />
          <Logo size={48} />
          <Logo size={24} />
          <Logo size={16} />
        </div>
        <div class="logo-opts">
          <div class="presets">
            {#each LOGO_PRESETS as pr}
              <button class="preset" class:on={isPreset(pr.style)} title={pr.name} onclick={() => logo.set(pr.style)}>
                <Logo size={34} style={{ ...ls, ...pr.style }} />
                <span>{pr.name}</span>
              </button>
            {/each}
          </div>
          <label class="line">
            <span class="label">Line</span>
            <input type="color" value={ls.line} oninput={(e) => logo.set({ line: e.currentTarget.value })} />
            <span class="hex">{ls.line}</span>
          </label>
          <label class="line" class:dim={ls.shape === "none"}>
            <span class="label">Tile</span>
            <input type="color" value={ls.tile} disabled={ls.shape === "none"} oninput={(e) => logo.set({ tile: e.currentTarget.value })} />
            <span class="hex">{ls.shape === "none" ? "no tile" : ls.tile}</span>
          </label>
          <div class="line">
            <span class="label">Shape</span>
            <div class="seg">
              {#each shapes as [v, label]}
                <button class:on={ls.shape === v} onclick={() => logo.set({ shape: v })}>{label}</button>
              {/each}
            </div>
          </div>
          <div class="line">
            <span class="label">Line weight</span>
            <div class="seg">
              {#each weights as [v, label]}
                <button class:on={ls.weight === v} onclick={() => logo.set({ weight: v })}>{label}</button>
              {/each}
            </div>
          </div>
          <label class="line">
            <span class="label">Face</span>
            <input type="checkbox" checked={ls.face} onchange={(e) => logo.set({ face: e.currentTarget.checked })} />
            <span class="hex">{ls.face ? "Smiling" : "Just the tomato"}</span>
          </label>
        </div>
      </div>
      <p class="hint">Shown in the sidebar, on the welcome screen and as the taskbar icon while ToMate runs. The installed shortcut keeps the default Night icon.</p>
    </section>

    <section>
      <div class="head">
        <h2>Colours <span class="note">· {theme.scheme} palette</span></h2>
        {#if overridden}
          <button class="reset-all" onclick={() => theme.resetScheme()}>Reset {overridden} {overridden === 1 ? "change" : "changes"}</button>
        {/if}
      </div>
      <p class="hint">
        Changes apply to the {theme.scheme} palette, the one showing now. Switch the theme above to edit the other one.
      </p>

      {#each GROUPS as g}
        <h3>{g.title}</h3>
        <div class="grid">
          {#each g.tokens as t (t.key)}
            {@const value = (theme.version, theme.hex(t.key))}
            {@const changed = t.key in theme.overrides}
            <label class="tok">
              <input type="color" {value} oninput={(e) => theme.set(t.key, e.currentTarget.value)} />
              <span class="name">{t.label}</span>
              <span class="hex">{value}</span>
              {#if changed}
                <button
                  class="undo"
                  title="Back to default"
                  onclick={(e) => {
                    e.preventDefault();
                    theme.set(t.key, null);
                  }}
                >
                  <svg viewBox="0 0 16 16"><path d="M4 6.5h6a3 3 0 010 6H7M4 6.5L6.5 4M4 6.5L6.5 9" fill="none" stroke="currentColor" stroke-width="1.3" stroke-linecap="round" stroke-linejoin="round" /></svg>
                </button>
              {/if}
            </label>
          {/each}
        </div>
      {/each}
    </section>

    <section>
      <div class="head">
        <h2>About</h2>
        <button class="reset-all" onclick={copyDiagnostics}>Copy diagnostics</button>
      </div>
      <p class="hint">
        ToMate <span class="mono">{version}</span> · Tauri <span class="mono">{tauriVersion}</span>. Diagnostics copy versions, settings and recent
        error messages to the clipboard (no file contents) for bug reports.
      </p>
    </section>
  </div>
</div>

<style>
  .page {
    flex: 1;
    min-height: 0;
    overflow: auto;
    padding: 28px 36px 60px;
  }
  .inner {
    max-width: 760px;
    margin: 0 auto;
  }
  h1 {
    margin: 0 0 20px;
    font-size: 20px;
    font-weight: 650;
  }
  section {
    margin-bottom: 28px;
    padding: 16px 18px;
    border: 1px solid var(--border);
    border-radius: var(--r-lg);
    background: var(--panel);
  }
  h2 {
    margin: 0 0 12px;
    font-size: 14px;
    font-weight: 650;
  }
  .note {
    color: var(--muted);
    font-weight: 400;
  }
  h3 {
    margin: 18px 0 8px;
    color: var(--muted);
    font-size: 11px;
    font-weight: 600;
    letter-spacing: 0.04em;
    text-transform: uppercase;
  }
  .head {
    display: flex;
    align-items: baseline;
    justify-content: space-between;
  }
  .ws {
    margin-top: 14px;
  }
  .ws-actions {
    display: flex;
    gap: 6px;
  }
  .save {
    padding: 3px 12px;
    border: 1px solid var(--accent);
    border-radius: var(--r);
    background: var(--accent);
    color: white;
    font: inherit;
    font-size: 12px;
    font-weight: 600;
  }
  .hint code {
    font-family: var(--mono);
    font-size: 0.92em;
  }
  .hint {
    margin: -6px 0 0;
    color: var(--muted);
    font-size: 12.5px;
  }
  .line {
    display: flex;
    align-items: center;
    gap: 16px;
    padding: 6px 0;
  }
  .label {
    width: 70px;
    color: var(--muted);
    font-size: 13px;
  }
  .seg {
    display: flex;
    padding: 2px;
    border-radius: var(--r);
    background: var(--hover);
  }
  .seg button {
    padding: 4px 14px;
    border: 0;
    border-radius: var(--r-sm);
    background: none;
    color: var(--muted);
    font: inherit;
    font-size: 12.5px;
  }
  .seg button.on {
    background: var(--panel);
    color: var(--text);
    box-shadow: var(--shadow-sm);
  }
  .swatches {
    display: flex;
    gap: 8px;
  }
  .swatch {
    width: 22px;
    height: 22px;
    padding: 0;
    border: 0;
    border-radius: 50%;
    background: var(--c);
    box-shadow: inset 0 0 0 1px rgba(0, 0, 0, 0.12);
    transition: transform 0.15s;
  }
  .swatch:hover {
    transform: scale(1.12);
  }
  .swatch.on {
    box-shadow:
      0 0 0 2px var(--panel),
      0 0 0 4px var(--c);
  }
  .reset-all {
    padding: 3px 10px;
    border: 1px solid var(--border);
    border-radius: var(--r);
    background: none;
    color: var(--muted);
    font: inherit;
    font-size: 12px;
  }
  .reset-all:hover {
    border-color: var(--danger);
    color: var(--danger);
  }
  .grid {
    display: grid;
    grid-template-columns: repeat(auto-fill, minmax(220px, 1fr));
    gap: 2px 12px;
  }
  .tok {
    display: flex;
    align-items: center;
    gap: 10px;
    height: 34px;
    padding: 0 6px;
    border-radius: var(--r);
    cursor: pointer;
  }
  .tok:hover {
    background: var(--hover);
  }
  input[type="color"] {
    flex: none;
    width: 22px;
    height: 22px;
    padding: 0;
    border: 0;
    border-radius: var(--r);
    background: none;
    cursor: pointer;
  }
  input[type="color"]::-webkit-color-swatch-wrapper {
    padding: 0;
  }
  input[type="color"]::-webkit-color-swatch {
    border: 1px solid var(--border);
    border-radius: var(--r);
  }
  .name {
    flex: 1;
    min-width: 0;
    overflow: hidden;
    font-size: 13px;
    text-overflow: ellipsis;
    white-space: nowrap;
  }
  .hex {
    color: var(--muted);
    font-family: var(--mono);
    font-size: 11.5px;
  }
  .undo {
    display: grid;
    place-items: center;
    width: 22px;
    height: 22px;
    padding: 0;
    border: 0;
    border-radius: var(--r-sm);
    background: none;
    color: var(--muted);
  }
  .undo:hover {
    background: var(--hover);
    color: var(--text);
  }
  .undo svg {
    width: 14px;
    height: 14px;
  }
  .logo-row {
    display: flex;
    flex-wrap: wrap;
    gap: 16px 24px;
    align-items: flex-start;
    margin-bottom: 10px;
  }
  .previews {
    display: flex;
    align-items: flex-end;
    gap: 14px;
    padding: 16px;
    border-radius: var(--r-lg);
    background: var(--bg);
  }
  .logo-opts {
    flex: 1 1 340px;
    min-width: 0;
  }
  .presets {
    display: flex;
    flex-wrap: wrap;
    gap: 6px;
    margin-bottom: 6px;
  }
  .preset {
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 4px;
    padding: 6px 6px 4px;
    border: 1px solid transparent;
    border-radius: var(--r-lg);
    background: none;
    color: var(--muted);
    font: inherit;
    font-size: 11px;
  }
  .preset:hover {
    background: var(--hover);
  }
  .preset.on {
    border-color: var(--accent);
    color: var(--text);
  }
  .dim {
    opacity: 0.5;
  }
  .logo-opts .label {
    width: 90px;
  }
  .logo-opts .hex {
    color: var(--muted);
    font-family: var(--mono);
    font-size: 11.5px;
  }
</style>
