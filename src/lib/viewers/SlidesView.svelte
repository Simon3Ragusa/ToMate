<script lang="ts">
  import PdfView from "./PdfView.svelte";
  import { api, type Entry } from "$lib/api";

  let { entry }: { entry: Entry } = $props();

  let pdf = $state<string | null>(null);
  let error = $state("");

  // Re-convert when the deck changes; the backend reuses a fresh cache.
  $effect(() => {
    const path = entry.path;
    entry.modified;
    let cancelled = false;
    error = "";
    api.pptxToPdf(path).then(
      (p) => !cancelled && (pdf = p),
      (e) => !cancelled && (error = String(e)),
    );
    return () => (cancelled = true);
  });
</script>

{#if error}
  <div class="msg">
    <p>Could not preview this presentation.</p>
    <p class="detail">{error}</p>
    <button onclick={() => api.openExternal(entry.path)}>Open in PowerPoint</button>
  </div>
{:else if pdf}
  <PdfView path={pdf} version={entry.modified} slides />
{:else}
  <div class="msg">
    <div class="spinner"></div>
    <p>Preparing slides…</p>
    <p class="detail">The first preview is converted with PowerPoint, so it takes a few seconds. Later opens are instant.</p>
  </div>
{/if}

<style>
  .msg {
    display: grid;
    place-items: center;
    align-content: center;
    gap: 6px;
    flex: 1;
    color: var(--muted);
    text-align: center;
  }
  .detail {
    max-width: 420px;
    font-size: 12px;
  }
  button {
    margin-top: 8px;
    padding: 6px 14px;
    border: 1px solid var(--border);
    border-radius: var(--r);
    background: var(--panel);
    color: var(--text);
    font: inherit;
  }
  .spinner {
    width: 18px;
    height: 18px;
    margin-bottom: 6px;
    border: 2px solid var(--border);
    border-top-color: var(--accent);
    border-radius: 50%;
    animation: spin 0.8s linear infinite;
  }
  @keyframes spin {
    to {
      transform: rotate(360deg);
    }
  }
</style>
