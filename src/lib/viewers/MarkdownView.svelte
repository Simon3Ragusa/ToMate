<script lang="ts" module>
  /** Read/Split/Edit choice per file, kept while switching tabs. */
  const modes = new Map<string, "read" | "edit" | "split">();
</script>

<script lang="ts">
  import { onMount, untrack } from "svelte";
  import DOMPurify from "dompurify";
  import { openUrl } from "@tauri-apps/plugin-opener";
  import Editor from "./Editor.svelte";
  import { ask } from "@tauri-apps/plugin-dialog";
  import { api, parentOf, joinPath, type Entry } from "$lib/api";
  import { app } from "$lib/state.svelte";
  import { mimeOf } from "$lib/fileTypes";
  import { renderMarkdown, toggleTask, frontMatter, bodyLineOffset } from "$lib/markdown";
  import { resolveWiki, linkNames } from "$lib/links";
  import { index } from "$lib/search.svelte";
  import Backlinks from "$lib/components/Backlinks.svelte";
  import "katex/dist/katex.min.css";

  let { entry }: { entry: Entry } = $props();

  // FileView keys this component by path, so the path is fixed for its lifetime.
  // svelte-ignore state_referenced_locally
  const path = entry.path;

  type Mode = "read" | "edit" | "split";
  let mode = $state<Mode>(modes.get(path) ?? "read");
  let src = $state("");
  let saved = $state(true);
  /** What we last read from or wrote to disk; tells our own saves from external edits. */
  let disk = "";
  let saving: Promise<void> | null = null;
  let saveTimer: ReturnType<typeof setTimeout> | undefined;
  let body = $state<HTMLElement>();

  const html = $derived(DOMPurify.sanitize(renderMarkdown(src)));
  const names = () => linkNames(index.files);
  const meta = $derived(Object.entries(frontMatter(src).meta).filter(([, v]) => v));

  $effect(() => {
    modes.set(path, mode);
  });

  onMount(() => {
    api.readText(path).then((t) => ((src = disk = t), (saved = true)), (e) => app.fail(`Couldn't open "${entry.name}"`, e));
    return () => void save(); // flush pending edits when the tab closes or switches
  });

  // The entry object is replaced on every fs event (our saves included):
  // only reload when the disk content really differs and nothing is unsaved.
  $effect(() => {
    entry.modified;
    untrack(checkDisk);
  });

  async function checkDisk() {
    await saving;
    const t = await api.readText(path).catch(() => null);
    if (t === null || t === disk) return;
    if (saved) {
      src = disk = t;
    } else {
      disk = t;
      app.notify("This file changed on disk; your unsaved edits are kept and will overwrite it.", true);
    }
  }

  async function save() {
    clearTimeout(saveTimer);
    if (saved) return;
    await saving;
    const text = src;
    saving = (async () => {
      try {
        await api.writeText(path, text);
        disk = text;
        // Edits typed while writing stay unsaved and get their own save.
        saved = src === text;
      } catch (e) {
        app.fail("Couldn't save your changes (they are kept here; retrying on the next edit)", e);
      }
    })();
    await saving;
    saving = null;
    if (!saved) saveTimer = setTimeout(save, 800);
  }

  function edited(v: string) {
    if (v === src) return; // echo of a reload, not a user edit
    app.keepTab(path); // editing a temporary tab keeps it
    src = v;
    saved = false;
    clearTimeout(saveTimer);
    saveTimer = setTimeout(save, 800);
  }

  // Post-render: mermaid diagrams, local images, link handling.
  $effect(() => {
    html;
    if (!body) return;
    const el = body;
    queueMicrotask(async () => {
      const diagrams = el.querySelectorAll<HTMLElement>("code.language-mermaid");
      if (diagrams.length) {
        const mermaid = (await import("mermaid")).default;
        const dark = matchMedia("(prefers-color-scheme: dark)").matches;
        mermaid.initialize({ startOnLoad: false, theme: dark ? "dark" : "neutral", fontFamily: "inherit" });
        for (const [i, code] of [...diagrams].entries()) {
          try {
            const { svg } = await mermaid.render(`mmd-${Date.now()}-${i}`, code.textContent ?? "");
            const fig = document.createElement("figure");
            fig.className = "mermaid";
            fig.innerHTML = svg;
            code.parentElement!.replaceWith(fig);
          } catch {
            /* leave the source visible */
          }
        }
      }
      if (el.querySelector("a.wikilink")) {
        if (!index.files.length) await index.update();
        for (const a of el.querySelectorAll<HTMLElement>("a.wikilink")) {
          a.classList.toggle("missing", !resolveWiki(a.dataset.wiki ?? "", index.files));
        }
      }
      for (const img of el.querySelectorAll<HTMLImageElement>("img")) {
        const s = img.getAttribute("src") ?? "";
        if (!s || /^(https?:|data:|blob:)/.test(s)) continue;
        const rel = resolveRel(s);
        api.readBytes(rel).then((b) => (img.src = URL.createObjectURL(new Blob([b], { type: mimeOf(rel) }))), () => {});
      }
    });
  });

  function resolveRel(href: string) {
    const parts = parentOf(entry.path).split("/").filter(Boolean);
    for (const seg of decodeURIComponent(href.split("#")[0]).split("/")) {
      if (seg === "..") parts.pop();
      else if (seg && seg !== ".") parts.push(seg);
    }
    return parts.join("/");
  }

  async function click(e: MouseEvent) {
    const target = e.target as HTMLElement;
    if (target instanceof HTMLInputElement && target.type === "checkbox") {
      e.preventDefault();
      const boxes = [...body!.querySelectorAll<HTMLInputElement>("input.task-list-item-checkbox")];
      src = toggleTask(src, boxes.indexOf(target));
      app.keepTab(path);
      saved = false;
      await save();
      return;
    }
    const a = target.closest("a");
    if (!a) return;
    e.preventDefault();
    if (a.dataset.wiki !== undefined) return openWiki(a.dataset.wiki);
    const href = a.getAttribute("href") ?? "";
    if (/^(https?:|mailto:)/.test(href)) return openUrl(href);
    if (href.startsWith("#")) return document.getElementById(href.slice(1))?.scrollIntoView();
    const rel = resolveRel(href);
    await app.reveal(rel);
    const found = app.dirs[parentOf(rel)]?.find((x) => x.path === rel);
    if (found) app.current = found;
    else app.notify(`Link target not found: ${rel}`, true);
  }

  /** Follow a wiki link; a missing target is created as a note next to this one. */
  async function openWiki(target: string) {
    if (!index.files.length) await index.update();
    const hit = resolveWiki(target, index.files);
    if (hit) return app.openPath(hit.path);
    const name = target.replace(/[\\/:*?"<>|]/g, "-").trim();
    const ok = await ask(`"${target}" does not exist yet. Create ${name}.md next to this note?`, { title: "New note", okLabel: "Create" });
    if (!ok) return;
    const file = joinPath(parentOf(path), name + ".md");
    await app.run(async () => {
      await api.createFile(file, `# ${target}

`);
      await app.load(parentOf(file));
      index.update();
      await app.openPath(file);
    }, "Couldn't create the note");
  }

  let jump = $state<{ line: number }>();

  /** Double-click in the rendered note: edit it, cursor on the clicked block's line. */
  function dbl(e: MouseEvent) {
    const t = e.target as HTMLElement;
    if (t.closest("a, input, button")) return;
    const block = t.closest<HTMLElement>("[data-line]");
    window.getSelection()?.removeAllRanges();
    jump = { line: (block ? Number(block.dataset.line) : 0) + bodyLineOffset(src) };
    if (mode === "read") mode = "edit";
  }

  function keys(e: KeyboardEvent) {
    if (e.ctrlKey && e.key === "s") {
      e.preventDefault();
      save();
    }
    if (e.ctrlKey && e.key === "e") {
      e.preventDefault();
      mode = mode === "read" ? "split" : "read";
    }
  }
</script>

<svelte:window onkeydown={keys} />

<div class="toolbar">
  <div class="seg" role="tablist">
    {#each [["read", "Read"], ["split", "Split"], ["edit", "Edit"]] as [m, label]}
      <button class:on={mode === m} onclick={() => (mode = m as Mode)}>{label}</button>
    {/each}
  </div>
  <span class="status">{mode === "read" ? "Ctrl E to edit" : saved ? "Saved" : "Editing…"}</span>
</div>

<div class="panes" class:split={mode === "split"}>
  {#if mode !== "read"}
    <div class="pane edit"><Editor value={src} onchange={edited} md completions={names} {jump} /></div>
  {/if}
  {#if mode !== "edit"}
    <!-- svelte-ignore a11y_click_events_have_key_events, a11y_no_noninteractive_element_interactions -->
    <div class="pane preview">
      {#if meta.length}
        <dl class="meta">
          {#each meta as [k, v]}<div><dt>{k}</dt><dd>{v}</dd></div>{/each}
        </dl>
      {/if}
      <article class="prose" bind:this={body} onclick={click} ondblclick={dbl} title="Double-click to edit">{@html html}</article>
      <Backlinks {entry} />
    </div>
  {/if}
</div>

<style>
  .toolbar {
    display: flex;
    align-items: center;
    gap: 12px;
    padding: 0 16px;
    height: 40px;
    border-bottom: 1px solid var(--border);
    flex: none;
  }
  .seg {
    display: flex;
    padding: 2px;
    border-radius: var(--r);
    background: var(--hover);
  }
  .seg button {
    padding: 3px 12px;
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
  .status {
    margin-left: auto;
    color: var(--muted);
    font-size: 12px;
  }
  .panes {
    flex: 1;
    min-height: 0;
    display: grid;
  }
  .panes.split {
    grid-template-columns: 1fr 1fr;
  }
  .pane {
    min-width: 0;
    min-height: 0;
    overflow: auto;
  }
  .split .edit {
    border-right: 1px solid var(--border);
  }
  .preview {
    padding: 28px 32px 30vh;
  }
  .meta {
    display: flex;
    flex-wrap: wrap;
    gap: 6px 20px;
    max-width: 760px;
    margin: 0 auto 20px;
    padding-bottom: 12px;
    border-bottom: 1px solid var(--border);
    font-size: 12px;
  }
  .meta div {
    display: flex;
    gap: 6px;
  }
  .meta dt {
    color: var(--muted);
    text-transform: capitalize;
  }
  .meta dd {
    margin: 0;
  }
</style>
