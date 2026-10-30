<!-- One small coloured mark per file, tinted by file type; hover shows the path. -->
<script lang="ts">
  import { kindOf, kindStyle } from "$lib/fileTypes";

  let { paths, max = 12 }: { paths: string[]; max?: number } = $props();
  const shown = $derived(paths.slice(0, max));
</script>

{#if paths.length}
  <span class="dots" aria-label="{paths.length} files">
    {#each shown as p (p)}
      <span class="dot" style="background: {kindStyle[kindOf(p)].tint}" title={p}></span>
    {/each}
    {#if paths.length > max}<span class="more">+{paths.length - max}</span>{/if}
  </span>
{/if}

<style>
  .dots {
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    gap: 3px;
  }
  .dot {
    width: 7px;
    height: 7px;
    border-radius: 2px;
    opacity: 0.85;
  }
  .more {
    margin-left: 1px;
    color: var(--muted);
    font-size: 10px;
    line-height: 1;
  }
</style>
