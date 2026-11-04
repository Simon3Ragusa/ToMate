<!--
  Session plan popover, in the spirit of iOS/macOS settings: a segmented
  control for presets, inset rows with pill steppers (press and hold to
  repeat), a switch, and a timeline of the whole session.
-->
<script lang="ts">
  import { focus, PRESETS, fmtMinutes, type Plan } from "$lib/focus.svelte";

  let { anchor, onclose }: { anchor: HTMLElement; onclose: () => void } = $props();

  let pop = $state<HTMLDivElement>();
  let place = $state({ left: 0, bottom: 0 });

  const p = $derived(focus.plan);
  const presetIdx = $derived(PRESETS.findIndex((x) => x.plan.focus === p.focus && x.plan.short === p.short && x.plan.long === p.long && x.plan.rounds === p.rounds));
  const segments = $derived([...PRESETS.map((x) => x.name.split(" ")[0]), "Custom"]);
  const active = $derived(presetIdx < 0 ? PRESETS.length : presetIdx);

  /** Every block of the session, for the timeline. */
  const blocks = $derived.by(() => {
    const out: { kind: "focus" | "short" | "long"; min: number }[] = [];
    for (let i = 0; i < p.rounds; i++) {
      out.push({ kind: "focus", min: p.focus });
      out.push(i === p.rounds - 1 ? { kind: "long", min: p.long } : { kind: "short", min: p.short });
    }
    return out;
  });
  const total = $derived(blocks.reduce((n, b) => n + b.min, 0));
  const focusTotal = $derived(p.focus * p.rounds);

  function measure() {
    const r = anchor.getBoundingClientRect();
    place = { left: Math.max(8, Math.min(r.left, innerWidth - 300 - 8)), bottom: innerHeight - r.top + 8 };
  }
  measure();

  function portal(node: HTMLElement) {
    document.body.appendChild(node);
    return { destroy: () => node.remove() };
  }

  function outside(e: PointerEvent) {
    const t = e.target as Node;
    if (!pop?.contains(t) && !anchor.contains(t)) onclose();
  }

  const rows: { key: keyof Plan; label: string; step: number; min: number; max: number; unit: string }[] = [
    { key: "focus", label: "Focus", step: 5, min: 5, max: 180, unit: "min" },
    { key: "short", label: "Short break", step: 1, min: 1, max: 60, unit: "min" },
    { key: "long", label: "Long break", step: 5, min: 5, max: 90, unit: "min" },
    { key: "rounds", label: "Rounds", step: 1, min: 1, max: 12, unit: "" },
  ];

  /** Move to the next multiple of `step` in direction `dir` (23 → 25 up, 23 → 20 down). */
  function bump(key: keyof Plan, dir: 1 | -1, step: number, min: number, max: number) {
    const v = focus.plan[key] as number;
    const n = dir > 0 ? Math.floor(v / step) * step + step : Math.ceil(v / step) * step - step;
    focus.setPlan({ [key]: Math.min(max, Math.max(min, n)) });
  }

  // Press and hold: repeat after a short delay, then faster.
  let holdTimer: ReturnType<typeof setTimeout> | undefined;
  function hold(e: PointerEvent, fn: () => void) {
    (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
    fn();
    let delay = 380;
    const again = () => {
      fn();
      delay = Math.max(60, delay * 0.8);
      holdTimer = setTimeout(again, delay);
    };
    holdTimer = setTimeout(again, delay);
  }
  const release = () => clearTimeout(holdTimer);
</script>

<svelte:window onpointerdown={outside} onkeydown={(e) => e.key === "Escape" && onclose()} onresize={measure} />

<div class="pop surface" bind:this={pop} use:portal style="left: {place.left}px; bottom: {place.bottom}px" role="dialog" aria-label="Focus session">
  <div class="head">
    <span class="title">Focus session</span>
    <span class="sum">{fmtMinutes(total)} · {fmtMinutes(focusTotal)} focused</span>
  </div>

  <!-- Segmented control with a sliding thumb -->
  <div class="seg" style="--n: {segments.length}; --i: {active}">
    <span class="thumb"></span>
    {#each segments as s, i}
      <button class:on={i === active} disabled={i === PRESETS.length && active !== PRESETS.length} onclick={() => i < PRESETS.length && focus.setPlan(PRESETS[i].plan)}>
        {s}
      </button>
    {/each}
  </div>

  <!-- The whole session, to scale -->
  <div class="timeline" aria-hidden="true">
    {#each blocks as b, i (i)}
      <span class="blk {b.kind}" style="flex-grow: {b.min}" title="{b.kind === 'focus' ? 'Focus' : b.kind === 'short' ? 'Short break' : 'Long break'} · {b.min} min"></span>
    {/each}
  </div>
  <div class="legend">
    <span><i class="focus"></i>Focus</span>
    <span><i class="short"></i>Break</span>
    <span><i class="long"></i>Long break</span>
  </div>

  <div class="group">
    {#each rows as r (r.key)}
      {@const v = p[r.key] as number}
      <div class="row">
        <span class="label">{r.label}</span>
        <span class="value">
          {#key v}<b class="num">{v}</b>{/key}{#if r.unit}<span class="unit">{r.unit}</span>{/if}
        </span>
        <span class="stepper">
          <button
            aria-label="Less {r.label.toLowerCase()}"
            disabled={v <= r.min}
            onpointerdown={(e) => hold(e, () => bump(r.key, -1, r.step, r.min, r.max))}
            onpointerup={release}
            onpointercancel={release}
            onpointerleave={release}
          >
            <svg viewBox="0 0 16 16"><path d="M4 8h8" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" /></svg>
          </button>
          <span class="sep"></span>
          <button
            aria-label="More {r.label.toLowerCase()}"
            disabled={v >= r.max}
            onpointerdown={(e) => hold(e, () => bump(r.key, 1, r.step, r.min, r.max))}
            onpointerup={release}
            onpointercancel={release}
            onpointerleave={release}
          >
            <svg viewBox="0 0 16 16"><path d="M4 8h8M8 4v8" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" /></svg>
          </button>
        </span>
      </div>
    {/each}
  </div>

  <div class="group">
    <label class="row switch-row">
      <span class="label">
        Auto-start next round
        <small>Begin the next focus block when a break ends</small>
      </span>
      <input type="checkbox" role="switch" checked={p.autoNext} onchange={(e) => focus.setPlan({ autoNext: e.currentTarget.checked })} />
      <span class="switch" aria-hidden="true"></span>
    </label>
  </div>
</div>

<style>
  .pop {
    --ease: var(--ease-spring);
    position: fixed;
    z-index: 80;
    width: 300px;
    padding: 14px 14px 12px;
    color: var(--text);
    font-size: 13px;
    transform-origin: bottom left;
    animation: in 0.28s var(--ease);
    user-select: none;
  }
  @keyframes in {
    from {
      opacity: 0;
      transform: scale(0.94) translateY(6px);
    }
  }
  .head {
    display: flex;
    align-items: baseline;
    justify-content: space-between;
    margin: 0 2px 10px;
  }
  .title {
    font-size: 14px;
    font-weight: 650;
  }
  .sum {
    color: var(--muted);
    font-size: 11.5px;
    font-variant-numeric: tabular-nums;
  }

  /* Segmented control */
  .seg {
    position: relative;
    display: grid;
    grid-template-columns: repeat(var(--n), 1fr);
    padding: 2px;
    border-radius: var(--r-lg);
    background: var(--hover);
  }
  .thumb {
    position: absolute;
    top: 2px;
    bottom: 2px;
    left: 2px;
    width: calc((100% - 4px) / var(--n));
    border-radius: var(--r);
    background: var(--panel);
    box-shadow:
      0 1px 3px rgba(0, 0, 0, 0.12),
      0 0 0 0.5px rgba(0, 0, 0, 0.06);
    transform: translateX(calc(100% * var(--i)));
    transition: transform 0.32s var(--ease);
  }
  .seg button {
    position: relative;
    height: 26px;
    border: 0;
    background: none;
    color: var(--muted);
    font: inherit;
    font-size: 12px;
    font-weight: 500;
    transition: color 0.2s;
  }
  .seg button.on {
    color: var(--text);
    font-weight: 600;
  }
  .seg button:disabled {
    cursor: not-allowed;
  }

  /* Timeline */
  .timeline {
    display: flex;
    gap: 2px;
    height: 8px;
    margin: 14px 2px 6px;
  }
  .blk {
    flex-basis: 0;
    min-width: 3px;
    border-radius: 3px;
    transition: flex-grow 0.35s var(--ease);
  }
  .focus {
    background: var(--focus);
  }
  .short {
    background: color-mix(in srgb, var(--break) 55%, transparent);
  }
  .long {
    background: var(--break);
  }
  .legend {
    display: flex;
    gap: 12px;
    margin: 0 2px 12px;
    color: var(--muted);
    font-size: 11px;
  }
  .legend i {
    display: inline-block;
    width: 7px;
    height: 7px;
    margin-right: 5px;
    border-radius: 2px;
  }

  /* Inset grouped rows */
  .group {
    margin-top: 8px;
    border-radius: var(--r-lg);
    background: color-mix(in srgb, var(--text) 4%, transparent);
    overflow: hidden;
  }
  .row {
    position: relative;
    display: flex;
    align-items: center;
    gap: 8px;
    min-height: 42px;
    padding: 6px 8px 6px 12px;
  }
  .row + .row::before {
    content: "";
    position: absolute;
    top: 0;
    left: 12px;
    right: 0;
    border-top: 0.5px solid var(--border);
  }
  .label {
    flex: 1;
    min-width: 0;
  }
  .label small {
    display: block;
    margin-top: 1px;
    color: var(--muted);
    font-size: 11px;
  }
  .value {
    display: flex;
    align-items: baseline;
    gap: 3px;
    color: var(--muted);
  }
  .num {
    display: inline-block;
    min-width: 22px;
    color: var(--text);
    font-size: 15px;
    font-weight: 600;
    font-variant-numeric: tabular-nums;
    text-align: right;
    animation: bump 0.22s var(--ease);
  }
  @keyframes bump {
    from {
      transform: translateY(-3px);
      opacity: 0.4;
    }
  }
  .unit {
    font-size: 11.5px;
  }

  /* iOS-style stepper */
  .stepper {
    display: flex;
    align-items: center;
    margin-left: 6px;
    border-radius: var(--r);
    background: var(--hover);
  }
  .stepper button {
    display: grid;
    place-items: center;
    width: 32px;
    height: 26px;
    border: 0;
    border-radius: var(--r);
    background: none;
    color: var(--text);
    transition:
      background 0.12s,
      transform 0.12s;
  }
  .stepper button:hover:not(:disabled) {
    background: var(--hover);
  }
  .stepper button:active:not(:disabled) {
    transform: scale(0.9);
    background: color-mix(in srgb, var(--text) 12%, transparent);
  }
  .stepper button:disabled {
    color: var(--muted);
    opacity: 0.4;
  }
  .stepper svg {
    width: 13px;
    height: 13px;
  }
  .sep {
    width: 0.5px;
    height: 14px;
    background: var(--border);
  }

  /* Toggle: a compact square-cornered switch, closer to an editor setting than a phone. */
  .switch-row {
    cursor: pointer;
  }
  .switch-row input {
    position: absolute;
    opacity: 0;
    pointer-events: none;
  }
  .switch {
    position: relative;
    flex: none;
    width: 30px;
    height: 17px;
    border: 1px solid var(--border);
    border-radius: var(--r-sm);
    background: var(--bg);
    transition:
      background-color var(--dur) var(--ease),
      border-color var(--dur) var(--ease);
  }
  .switch::after {
    content: "";
    position: absolute;
    top: 2px;
    left: 2px;
    width: 11px;
    height: 11px;
    border-radius: 3px;
    background: var(--muted);
    transition:
      transform 0.18s var(--ease),
      background-color var(--dur) var(--ease);
  }
  input:checked + .switch {
    border-color: var(--accent);
    background: var(--accent);
  }
  input:checked + .switch::after {
    background: #fff;
    transform: translateX(13px);
  }
  input:focus-visible + .switch {
    outline: 1px solid var(--accent);
    outline-offset: 1px;
  }
</style>
