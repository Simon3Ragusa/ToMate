<!-- Simple viewers: images, spreadsheets, Word documents, plain text, unknown files. -->
<script lang="ts">
  import DOMPurify from "dompurify";
  import Editor from "./Editor.svelte";
  import { api, extOf, type Entry } from "$lib/api";
  import { app } from "$lib/state.svelte";
  import { kindOf, mimeOf, fmtSize, fmtDate } from "$lib/fileTypes";

  let { entry }: { entry: Entry } = $props();
  const kind = $derived(kindOf(entry.name));

  let url = $state("");
  let sheets = $state<{ name: string; html: string }[]>([]);
  let sheetIdx = $state(0);
  let docHtml = $state("");
  let text = $state("");
  let saved = $state(true);
  let error = $state("");
  let saveTimer: ReturnType<typeof setTimeout> | undefined;

  $effect(() => {
    const e = entry;
    e.modified;
    error = "";
    load(e).catch((err) => (error = String(err)));
  });

  async function load(e: Entry) {
    const k = kindOf(e.name);
    if (k === "image") {
      const b = await api.readBytes(e.path);
      URL.revokeObjectURL(url);
      url = URL.createObjectURL(new Blob([b], { type: mimeOf(e.name) }));
    } else if (k === "sheet") {
      const XLSX = await import("xlsx");
      const ext = extOf(e.name);
      const wb =
        ext === "csv" || ext === "tsv"
          ? XLSX.read(await api.readText(e.path), { type: "string", FS: ext === "tsv" ? "\t" : "," })
          : XLSX.read(await api.readBytes(e.path), { cellDates: true });
      sheets = wb.SheetNames.map((name) => ({
        name,
        html: DOMPurify.sanitize(XLSX.utils.sheet_to_html(wb.Sheets[name], { header: "", footer: "" })),
      }));
      sheetIdx = Math.min(sheetIdx, sheets.length - 1);
    } else if (k === "doc") {
      const mammoth = await import("mammoth");
      const b = await api.readBytes(e.path);
      const res = await mammoth.convertToHtml({ arrayBuffer: b.buffer as ArrayBuffer });
      docHtml = DOMPurify.sanitize(res.value);
    } else if (k === "text") {
      const t = await api.readText(e.path);
      // Our own saves also fire fs events: never clobber unsaved typing.
      if (saved && t !== text) text = t;
    }
  }

  function edited(v: string) {
    if (v === text) return;
    app.keepTab(entry.path); // editing a temporary tab keeps it
    text = v;
    saved = false;
    clearTimeout(saveTimer);
    saveTimer = setTimeout(save, 800);
  }

  async function save() {
    const t = text;
    await app.run(async () => {
      await api.writeText(entry.path, t);
      saved = text === t;
      if (!saved) saveTimer = setTimeout(save, 800);
    }, "Couldn't save your changes");
  }
</script>

{#if error}
  <div class="center"><p>Could not open this file.</p><p class="detail">{error}</p></div>
{:else if kind === "image"}
  <div class="image"><img src={url} alt={entry.name} /></div>
{:else if kind === "sheet"}
  {#if sheets.length > 1}
    <div class="tabs">
      {#each sheets as s, i}
        <button class:on={i === sheetIdx} onclick={() => (sheetIdx = i)}>{s.name}</button>
      {/each}
    </div>
  {/if}
  <div class="sheet">{@html sheets[sheetIdx]?.html ?? ""}</div>
{:else if kind === "doc"}
  <div class="doc"><article class="prose">{@html docHtml}</article></div>
{:else if kind === "text"}
  <div class="toolbar"><span>{saved ? "Saved" : "Editing…"}</span></div>
  <div class="text"><Editor value={text} onchange={edited} gutter /></div>
{:else}
  <div class="center">
    <p class="big">{entry.name}</p>
    <p class="detail">{fmtSize(entry.size)} · modified {fmtDate(entry.modified)}</p>
    <p class="detail">This format has no in-app preview.</p>
    <button onclick={() => app.run(() => api.openExternal(entry.path), "Couldn't open it with the default app")}>Open with default app</button>
  </div>
{/if}

<style>
  .center {
    display: grid;
    place-items: center;
    align-content: center;
    gap: 6px;
    flex: 1;
    color: var(--muted);
    text-align: center;
  }
  .big {
    color: var(--text);
    font-size: 16px;
    font-weight: 600;
  }
  .detail {
    font-size: 12px;
  }
  .center button {
    margin-top: 10px;
    padding: 6px 14px;
    border: 1px solid var(--border);
    border-radius: var(--r);
    background: var(--panel);
    color: var(--text);
    font: inherit;
  }
  .image {
    flex: 1;
    min-height: 0;
    display: grid;
    place-items: center;
    padding: 24px;
    overflow: auto;
    background: var(--canvas-bg);
  }
  .image img {
    max-width: 100%;
    max-height: 100%;
    object-fit: contain;
    box-shadow: 0 0 0 1px var(--border);
  }
  .tabs {
    display: flex;
    gap: 2px;
    padding: 6px 12px;
    border-bottom: 1px solid var(--border);
    flex: none;
    overflow-x: auto;
  }
  .tabs button {
    padding: 4px 12px;
    border: 0;
    border-radius: var(--r-sm);
    background: none;
    color: var(--muted);
    font: inherit;
    font-size: 12px;
    white-space: nowrap;
  }
  .tabs button.on {
    background: var(--selected);
    color: var(--selected-text);
  }
  .sheet {
    flex: 1;
    min-height: 0;
    overflow: auto;
    padding: 16px;
  }
  .sheet :global(table) {
    border-collapse: collapse;
    font-size: 12.5px;
    font-variant-numeric: tabular-nums;
  }
  .sheet :global(td) {
    padding: 4px 10px;
    border: 1px solid var(--border);
    white-space: nowrap;
  }
  .sheet :global(tr:first-child td) {
    background: var(--hover);
    font-weight: 600;
  }
  .doc {
    flex: 1;
    min-height: 0;
    overflow: auto;
    padding: 28px 32px 30vh;
  }
  .toolbar {
    display: flex;
    justify-content: flex-end;
    align-items: center;
    height: 40px;
    padding: 0 16px;
    border-bottom: 1px solid var(--border);
    color: var(--muted);
    font-size: 12px;
    flex: none;
  }
  .text {
    flex: 1;
    min-height: 0;
  }
</style>
