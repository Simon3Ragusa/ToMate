<script lang="ts">
  import * as pdfjs from "pdfjs-dist";
  import workerUrl from "pdfjs-dist/build/pdf.worker.min.mjs?url";
  import { api } from "$lib/api";

  pdfjs.GlobalWorkerOptions.workerSrc = workerUrl;

  /** `path` is the PDF to show; `version` changes force a reload. */
  let { path, version = 0, slides = false }: { path: string; version?: number; slides?: boolean } = $props();

  let doc = $state<pdfjs.PDFDocumentProxy | null>(null);
  let error = $state("");
  let zoom = $state(1);
  let width = $state(800);
  let pageNum = $state(1);
  let scroller = $state<HTMLDivElement>();

  $effect(() => {
    path;
    version;
    let cancelled = false;
    error = "";
    api
      .readBytes(path)
      .then((data) => pdfjs.getDocument({ data, isEvalSupported: false }).promise)
      .then((d) => {
        if (cancelled) return d.destroy();
        doc?.destroy();
        doc = d;
      })
      .catch((e) => (error = String(e)));
    return () => (cancelled = true);
  });

  /** Renders a page when it scrolls near the viewport; re-renders on resize/zoom. */
  type PageArgs = { n: number; scale: number; w: number };
  function page(canvas: HTMLCanvasElement, args: PageArgs) {
    let rendered = "";
    let task: pdfjs.RenderTask | null = null;
    const draw = async () => {
      if (!doc) return;
      const key = `${args.n}:${args.scale}:${args.w}`;
      if (rendered === key) return;
      rendered = key;
      const p = await doc.getPage(args.n);
      const base = p.getViewport({ scale: 1 });
      const vp = p.getViewport({ scale: args.scale * (args.w / base.width) });
      const dpr = window.devicePixelRatio || 1;
      canvas.width = vp.width * dpr;
      canvas.height = vp.height * dpr;
      canvas.style.width = `${vp.width}px`;
      canvas.style.height = `${vp.height}px`;
      task?.cancel();
      task = p.render({ canvasContext: canvas.getContext("2d")!, viewport: vp, transform: [dpr, 0, 0, dpr, 0, 0] });
      await task.promise.catch(() => {});
    };
    const io = new IntersectionObserver((es) => es[0].isIntersecting && draw(), { rootMargin: "800px" });
    io.observe(canvas);
    return {
      update(a: PageArgs) {
        args = a;
        const r = canvas.getBoundingClientRect();
        if (r.bottom > -800 && r.top < innerHeight + 800) draw();
      },
      destroy() {
        io.disconnect();
        task?.cancel();
      },
    };
  }

  /** Placeholder size before render, from the first page's aspect ratio. */
  let aspect = $state(1.414);
  $effect(() => {
    doc?.getPage(1).then((p) => {
      const v = p.getViewport({ scale: 1 });
      aspect = v.height / v.width;
    });
  });

  function track() {
    if (!scroller) return;
    const pages = scroller.querySelectorAll("canvas");
    const mid = scroller.getBoundingClientRect().top + scroller.clientHeight / 3;
    pages.forEach((c, i) => {
      const r = c.getBoundingClientRect();
      if (r.top <= mid && r.bottom > mid) pageNum = i + 1;
    });
  }
</script>

<div class="toolbar">
  {#if doc}<span class="muted">{slides ? "Slide" : "Page"} {pageNum} / {doc.numPages}</span>{/if}
  <div class="zoom">
    <button onclick={() => (zoom = Math.max(0.5, +(zoom - 0.1).toFixed(1)))} title="Zoom out">−</button>
    <button class="pct" onclick={() => (zoom = 1)} title="Fit width">{Math.round(zoom * 100)}%</button>
    <button onclick={() => (zoom = Math.min(3, +(zoom + 0.1).toFixed(1)))} title="Zoom in">+</button>
  </div>
</div>

<div class="scroll" bind:this={scroller} onscroll={track} bind:clientWidth={width}>
  {#if error}
    <p class="msg">Could not open this PDF. {error}</p>
  {:else if doc}
    {#key doc}
    <div class="pages" class:slides>
      {#each Array(doc.numPages) as _, i (i)}
        <canvas
          use:page={{ n: i + 1, scale: zoom * (slides ? 0.86 : 0.78), w: width }}
          style="width: {width * zoom * (slides ? 0.86 : 0.78)}px; height: {width * zoom * (slides ? 0.86 : 0.78) * aspect}px"
        ></canvas>
      {/each}
    </div>
    {/key}
  {:else}
    <p class="msg">Loading…</p>
  {/if}
</div>

<style>
  .toolbar {
    display: flex;
    align-items: center;
    gap: 12px;
    height: 40px;
    padding: 0 16px;
    border-bottom: 1px solid var(--border);
    flex: none;
    font-size: 12px;
  }
  .muted {
    color: var(--muted);
  }
  .zoom {
    display: flex;
    margin-left: auto;
    border: 1px solid var(--border);
    border-radius: var(--r);
    overflow: hidden;
  }
  .zoom button {
    min-width: 28px;
    height: 24px;
    border: 0;
    background: none;
    color: var(--text);
    font: inherit;
  }
  .zoom button:hover {
    background: var(--hover);
  }
  .pct {
    min-width: 48px !important;
    border-inline: 1px solid var(--border) !important;
    color: var(--muted) !important;
  }
  .scroll {
    flex: 1;
    min-height: 0;
    overflow: auto;
    background: var(--canvas-bg);
  }
  .pages {
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 16px;
    padding: 24px 0 40px;
    width: fit-content;
    min-width: 100%;
  }
  .pages.slides {
    gap: 24px;
  }
  canvas {
    display: block;
    background: white;
    border-radius: 2px;
    box-shadow: 0 0 0 1px rgba(0, 0, 0, 0.06), 0 2px 8px rgba(0, 0, 0, 0.08);
  }
  .msg {
    padding: 40px;
    color: var(--muted);
    text-align: center;
  }
</style>
