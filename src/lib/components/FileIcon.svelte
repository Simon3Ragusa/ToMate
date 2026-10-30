<script lang="ts">
  import { kindOf, kindStyle } from "$lib/fileTypes";

  let { name, isDir = false, open = false }: { name: string; isDir?: boolean; open?: boolean } = $props();
  const style = $derived(kindStyle[kindOf(name)]);
</script>

{#if isDir}
  <svg class="icon" viewBox="0 0 16 16" aria-hidden="true">
    {#if open}
      <path d="M1.5 4.5v8h11l2-5.5h-11l-2 5.5M1.5 4.5V3.5h4l1.5 1.5h5v2" fill="none" stroke="currentColor" stroke-width="1.2" stroke-linejoin="round" />
    {:else}
      <path d="M1.5 3.5h4l1.5 1.5h7.5v7.5h-13z" fill="none" stroke="currentColor" stroke-width="1.2" stroke-linejoin="round" />
    {/if}
  </svg>
{:else}
  <svg class="icon" viewBox="0 0 16 16" aria-hidden="true" style="color: {style.tint}">
    <path d="M3.5 1.5h6l3 3v10h-9z" fill="none" stroke="currentColor" stroke-width="1.2" stroke-linejoin="round" />
    <path d="M9.5 1.5v3h3" fill="none" stroke="currentColor" stroke-width="1.2" stroke-linejoin="round" />
    <rect x="5.5" y="8" width="5" height="1.3" rx=".6" fill="currentColor" opacity=".7" />
    <rect x="5.5" y="10.6" width="3.4" height="1.3" rx=".6" fill="currentColor" opacity=".45" />
  </svg>
{/if}

<style>
  .icon {
    width: 16px;
    height: 16px;
    flex: none;
    color: var(--muted);
  }
</style>
