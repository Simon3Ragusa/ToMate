<!-- The ToMate logo in the user's chosen style. -->
<script lang="ts">
  import { logo } from "$lib/logo.svelte";
  import { logoSvg, type LogoStyle } from "$lib/logo";

  let { size = 24, style }: { size?: number; style?: LogoStyle } = $props();

  // Generated from validated colours and fixed paths only, so it is safe to inline.
  const svg = $derived(logoSvg(style ?? logo.style, size));
</script>

<span class="logo" style="width: {size}px; height: {size}px" aria-hidden="true">{@html svg}</span>

<style>
  .logo {
    display: inline-block;
    flex: none;
    line-height: 0;
  }
  .logo :global(svg) {
    width: 100%;
    height: 100%;
  }
</style>
