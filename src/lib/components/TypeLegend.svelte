<script lang="ts">
  import { kindStyle } from "$lib/fileTypes";

  const kinds = (["markdown", "pdf", "slides", "sheet", "doc", "image", "text"] as const).map((k) => ({
    tint: kindStyle[k].tint,
    label: { markdown: "Markdown", pdf: "PDF", slides: "Slides", sheet: "Sheets", doc: "Word", image: "Images", text: "Other" }[k],
  }));
</script>

<span class="legend">
  {#each kinds as k}
    <span class="item"><span class="dot" style="background: {k.tint}"></span>{k.label}</span>
  {/each}
</span>

<style>
  .legend {
    display: flex;
    flex-wrap: wrap;
    gap: 4px 12px;
    color: var(--muted);
    font-size: 11px;
  }
  .item {
    display: flex;
    align-items: center;
    gap: 5px;
  }
  .dot {
    width: 7px;
    height: 7px;
    border-radius: 2px;
  }
</style>
