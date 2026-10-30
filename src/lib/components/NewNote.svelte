<script lang="ts">
  import { app } from "$lib/state.svelte";
  import { createNote, NOTES_DIR } from "$lib/calendar";

  const preset = app.newNote!;
  let title = $state(preset.type === "meeting" ? "Meeting" : "");
  let date = $state(preset.date);
  let type = $state(preset.type);

  async function submit(e: SubmitEvent) {
    e.preventDefault();
    await app.run(async () => {
      const path = await createNote(title, date, type);
      app.newNote = null;
      await Promise.all([app.load(""), app.load(NOTES_DIR)]);
      await app.openPath(path);
    }, "Couldn't create the note");
  }

  function select(node: HTMLInputElement) {
    node.focus();
    node.select();
  }
</script>

<!-- svelte-ignore a11y_click_events_have_key_events, a11y_no_static_element_interactions, a11y_no_noninteractive_element_interactions -->
<div class="scrim" onclick={() => (app.newNote = null)} onkeydown={(e) => e.key === "Escape" && (app.newNote = null)}>
  <form class="dialog surface" onclick={(e) => e.stopPropagation()} onsubmit={submit}>
    <h2>New note</h2>
    <div class="seg">
      <button type="button" class:on={type === "meeting"} onclick={() => (type = "meeting")}>Meeting</button>
      <button type="button" class:on={type === "note"} onclick={() => (type = "note")}>Note</button>
    </div>
    <label>
      <span>Title</span>
      <input bind:value={title} use:select placeholder="e.g. Weekly check-in" required />
    </label>
    <label>
      <span>Date</span>
      <input type="date" bind:value={date} required />
    </label>
    <p class="hint">
      Saved as <code>{NOTES_DIR}/{date} {title || "…"}.md</code>{type === "meeting" ? " with agenda, decisions and actions sections." : "."}
    </p>
    <div class="buttons">
      <button type="button" class="ghost" onclick={() => (app.newNote = null)}>Cancel</button>
      <button type="submit" class="primary">Create</button>
    </div>
  </form>
</div>

<style>
  .scrim {
    position: fixed;
    inset: 0;
    z-index: 45;
    display: grid;
    place-items: center;
    background: var(--scrim);
  }
  .dialog {
    width: min(420px, 92vw);
    padding: 20px;
  }
  h2 {
    margin: 0 0 14px;
    font-size: 15px;
    font-weight: 600;
  }
  .seg {
    display: inline-flex;
    margin-bottom: 14px;
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
    font-size: 12px;
  }
  .seg button.on {
    background: var(--panel);
    color: var(--text);
    box-shadow: var(--shadow-sm);
  }
  label {
    display: grid;
    gap: 4px;
    margin-bottom: 12px;
    font-size: 12px;
    color: var(--muted);
  }
  input {
    height: 32px;
    padding: 0 10px;
    border: 1px solid var(--border);
    border-radius: var(--r);
    background: var(--bg);
    color: var(--text);
    font: inherit;
    font-size: 13px;
    outline: none;
  }
  input:focus {
    border-color: var(--accent);
  }
  .hint {
    margin: 0 0 16px;
    color: var(--muted);
    font-size: 12px;
  }
  code {
    font-family: var(--mono);
    font-size: 11.5px;
  }
  .buttons {
    display: flex;
    justify-content: flex-end;
    gap: 8px;
  }
  .buttons button {
    padding: 6px 14px;
    border-radius: var(--r);
    font: inherit;
    font-size: 13px;
  }
  .ghost {
    border: 1px solid var(--border);
    background: none;
    color: var(--text);
  }
  .primary {
    border: 0;
    background: var(--accent);
    color: white;
    font-weight: 550;
  }
</style>
