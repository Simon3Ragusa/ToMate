<!-- Time field with an iOS-style wheel popover. `value` is "HH:MM", or "" for all day. -->
<script lang="ts">
  import Wheel from "./Wheel.svelte";

  let { value = $bindable("") }: { value?: string } = $props();

  let open = $state(false);
  let hour = $state(9);
  let min = $state(0); // index of 5-minute steps
  let root = $state<HTMLDivElement>();
  let pop = $state<HTMLDivElement>();
  let place = $state({ left: 0, top: 0, up: false });

  const POP_W = 190;
  const POP_H = 222;

  /** Fixed position next to the field: below it, or above when there is no room; always on screen. */
  function measure() {
    if (!root) return;
    const r = root.getBoundingClientRect();
    const below = innerHeight - r.bottom - 8 >= POP_H;
    const top = below ? r.bottom + 6 : Math.max(8, r.top - 6 - POP_H);
    const left = Math.min(Math.max(8, r.left), innerWidth - POP_W - 8);
    place = { left, top, up: !below };
  }

  /** Render the popover at the end of <body>, outside any scrolling or clipping panel. */
  function portal(node: HTMLElement) {
    document.body.appendChild(node);
    return { destroy: () => node.remove() };
  }

  const pad = (n: number) => String(n).padStart(2, "0");

  function show() {
    if (value) {
      const [h, m] = value.split(":").map(Number);
      hour = h;
      min = Math.round(m / 5) % 12;
    } else {
      // Default: the next full hour.
      hour = (new Date().getHours() + 1) % 24;
      min = 0;
    }
    measure();
    open = true;
    value = `${pad(hour)}:${pad(min * 5)}`;
  }

  // Follow the field if a panel scrolls while the popover is open.
  $effect(() => {
    if (!open) return;
    const re = () => measure();
    document.addEventListener("scroll", re, true);
    return () => document.removeEventListener("scroll", re, true);
  });

  // Live update while the wheels turn, like the iOS picker.
  $effect(() => {
    if (open) value = `${pad(hour)}:${pad(min * 5)}`;
  });

  function outside(e: PointerEvent) {
    const t = e.target as Node;
    if (open && !root?.contains(t) && !pop?.contains(t)) open = false;
  }
</script>

<svelte:window
  onpointerdown={outside}
  onkeydown={(e) => open && e.key === "Escape" && (open = false)}
  onresize={() => open && measure()}
/>

<div class="picker" bind:this={root}>
  <button type="button" class="field" class:empty={!value} class:on={open} onclick={() => (open ? (open = false) : show())}>
    <svg viewBox="0 0 16 16"><circle cx="8" cy="8" r="6" fill="none" stroke="currentColor" stroke-width="1.2" /><path d="M8 4.5V8l2.3 1.6" fill="none" stroke="currentColor" stroke-width="1.2" stroke-linecap="round" /></svg>
    {value || "All day"}
  </button>

  {#if open}
    <div class="pop surface" class:up={place.up} bind:this={pop} use:portal style="left: {place.left}px; top: {place.top}px">
      <div class="wheels">
        <div class="band"></div>
        <Wheel count={24} label={pad} bind:value={hour} />
        <span class="colon">:</span>
        <Wheel count={12} label={(i) => pad(i * 5)} bind:value={min} />
      </div>
      <div class="foot">
        <button type="button" onclick={() => ((value = ""), (open = false))}>All day</button>
        <button type="button" class="done" onclick={() => (open = false)}>Done</button>
      </div>
    </div>
  {/if}
</div>

<style>
  .picker {
    position: relative;
  }
  .field {
    display: flex;
    width: 100%;
    align-items: center;
    gap: 6px;
    height: 30px;
    padding: 0 10px;
    border: 1px solid var(--border);
    border-radius: var(--r);
    background: var(--panel);
    color: var(--text);
    font: inherit;
    font-size: 13px;
    font-variant-numeric: tabular-nums;
    white-space: nowrap;
  }
  .field.empty {
    color: var(--muted);
  }
  .field:hover,
  .field.on {
    border-color: var(--accent);
  }
  .field svg {
    width: 14px;
    height: 14px;
    color: var(--muted);
  }
  .pop {
    position: fixed;
    z-index: 80;
    width: 190px;
    box-sizing: border-box;
    padding: 8px 8px 6px;
    animation: pop 0.22s var(--ease-spring);
    transform-origin: top left;
  }
  .pop.up {
    transform-origin: bottom left;
  }
  @keyframes pop {
    from {
      opacity: 0;
      transform: scale(0.92);
    }
  }
  .wheels {
    position: relative;
    display: flex;
    align-items: center;
    justify-content: center;
    gap: 2px;
  }
  /* The selection band the cylinder turns behind. */
  .band {
    position: absolute;
    left: 6px;
    right: 6px;
    top: calc(50% - 16px);
    height: 32px;
    border-radius: var(--r);
    background: var(--hover);
    pointer-events: none;
  }
  .colon {
    position: relative;
    color: var(--text);
    font-size: 20px;
    font-weight: 600;
  }
  .foot {
    display: flex;
    justify-content: space-between;
    margin-top: 6px;
    padding-top: 6px;
    border-top: 1px solid var(--border);
  }
  .foot button {
    padding: 3px 8px;
    border: 0;
    border-radius: var(--r-sm);
    background: none;
    color: var(--muted);
    font: inherit;
    font-size: 12.5px;
  }
  .foot button:hover {
    background: var(--hover);
    color: var(--text);
  }
  .foot .done {
    color: var(--accent);
    font-weight: 600;
  }
</style>
