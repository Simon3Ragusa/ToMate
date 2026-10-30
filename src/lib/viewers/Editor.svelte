<script lang="ts">
  import { onMount } from "svelte";
  import { EditorView, keymap, lineNumbers, highlightActiveLine } from "@codemirror/view";
  import { EditorState } from "@codemirror/state";
  import { defaultKeymap, history, historyKeymap, indentWithTab } from "@codemirror/commands";
  import { syntaxHighlighting, defaultHighlightStyle, HighlightStyle } from "@codemirror/language";
  import { markdown, markdownLanguage } from "@codemirror/lang-markdown";
  import { languages } from "@codemirror/language-data";
  import { tags as t } from "@lezer/highlight";
  import { autocompletion, type CompletionContext } from "@codemirror/autocomplete";

  let {
    value,
    onchange,
    md = false,
    gutter = false,
    completions,
    jump,
  }: {
    value: string;
    onchange: (v: string) => void;
    md?: boolean;
    gutter?: boolean;
    completions?: () => string[];
    /** Put the cursor at the start of this 0-based line (a new object re-triggers). */
    jump?: { line: number };
  } = $props();

  /** `[[` opens a list of file names; picking one closes the link. */
  function wikiComplete(ctx: CompletionContext) {
    const m = ctx.matchBefore(/\[\[[^\]\n|]*/);
    if (!m || !completions) return null;
    const closed = ctx.state.sliceDoc(ctx.pos, ctx.pos + 2) === "]]";
    return {
      from: m.from + 2,
      options: completions().map((label) => ({ label, type: "text", apply: closed ? label : label + "]]" })),
      validFor: /^[^\]\n|]*$/,
    };
  }

  let host: HTMLDivElement;
  let view: EditorView;

  const mdStyle = HighlightStyle.define([
    { tag: t.heading1, fontSize: "1.3em", fontWeight: "650" },
    { tag: t.heading2, fontSize: "1.15em", fontWeight: "650" },
    { tag: [t.heading3, t.heading4], fontWeight: "650" },
    { tag: t.strong, fontWeight: "650" },
    { tag: t.emphasis, fontStyle: "italic" },
    { tag: [t.link, t.url], color: "var(--accent)" },
    { tag: [t.processingInstruction, t.contentSeparator, t.meta], color: "var(--muted)" },
    { tag: t.monospace, fontFamily: "var(--mono)", color: "var(--code-text)" },
  ]);

  // Editor mode is fixed for the component's lifetime.
  // svelte-ignore state_referenced_locally
  const theme = EditorView.theme({
    "&": { height: "100%", fontSize: "14px", color: "var(--text)", backgroundColor: "transparent" },
    ".cm-scroller": { fontFamily: md ? "var(--font)" : "var(--mono)", lineHeight: "1.65" },
    ".cm-content": { padding: "28px 0 40vh", maxWidth: md ? "760px" : "none", margin: md ? "0 auto" : "0", caretColor: "var(--accent)" },
    ".cm-line": { padding: md ? "0 32px" : "0 16px" },
    "&.cm-focused": { outline: "none" },
    ".cm-activeLine": { backgroundColor: "var(--active-line)" },
    ".cm-gutters": { backgroundColor: "transparent", border: "none", color: "var(--muted)" },
    ".cm-selectionBackground, &.cm-focused .cm-selectionBackground, ::selection": { backgroundColor: "var(--selection) !important" },
    ".cm-cursor": { borderLeftColor: "var(--accent)" },
  });

  onMount(() => {
    view = new EditorView({
      parent: host,
      state: EditorState.create({
        doc: value,
        extensions: [
          history(),
          keymap.of([...defaultKeymap, ...historyKeymap, indentWithTab]),
          EditorView.lineWrapping,
          highlightActiveLine(),
          gutter ? lineNumbers() : [],
          md ? [markdown({ base: markdownLanguage, codeLanguages: languages }), syntaxHighlighting(mdStyle)] : [],
          syntaxHighlighting(defaultHighlightStyle, { fallback: true }),
          completions ? autocompletion({ override: [wikiComplete], icons: false }) : [],
          theme,
          EditorView.updateListener.of((u) => u.docChanged && onchange(u.state.doc.toString())),
        ],
      }),
    });
    view.focus();
    return () => view.destroy();
  });

  $effect(() => {
    const j = jump;
    if (!j || !view) return;
    // The document may still be loading on first mount: wait until it is in.
    queueMicrotask(() => {
      const doc = view.state.doc;
      const line = doc.line(Math.min(doc.lines, Math.max(1, j.line + 1)));
      view.dispatch({ selection: { anchor: line.from }, effects: EditorView.scrollIntoView(line.from, { y: "center" }) });
      view.focus();
    });
  });

  // Apply outside changes (e.g. a reload) as the smallest differing span,
  // so CodeMirror can keep the cursor and scroll position where they were.
  $effect(() => {
    if (!view) return;
    const cur = view.state.doc.toString();
    if (value === cur) return;
    let a = 0;
    while (a < cur.length && a < value.length && cur[a] === value[a]) a++;
    let b = 0;
    while (b < cur.length - a && b < value.length - a && cur[cur.length - 1 - b] === value[value.length - 1 - b]) b++;
    view.dispatch({ changes: { from: a, to: cur.length - b, insert: value.slice(a, value.length - b) } });
  });
</script>

<div class="editor" bind:this={host}></div>

<style>
  .editor {
    height: 100%;
    min-height: 0;
    overflow: hidden;
  }
</style>
