<!--
  One iOS-style picker column: items sit on a 3D cylinder that turns with
  drag (with momentum), the mouse wheel or the arrow keys, snaps to the
  nearest value and gives a soft tick for every step, like a gear detent.
-->
<script lang="ts">
  let {
    count,
    label,
    value = $bindable(0),
  }: { count: number; label: (i: number) => string; value?: number } = $props();

  const ITEM = 32; // px per row
  const STEP = 20; // degrees between rows on the cylinder
  const RADIUS = ITEM / 2 / Math.tan((STEP / 2) * (Math.PI / 180));

  const mod = (n: number) => ((n % count) + count) % count;

  // svelte-ignore state_referenced_locally
  let pos = $state(value); // continuous position, in rows
  // svelte-ignore state_referenced_locally
  let target = value;
  let raf = 0;
  let dragging = false;
  let wheelAcc = 0;

  let lastT = 0;

  /** Ease toward the target (frame-rate independent); settles exactly on a row. */
  function frame(t: number) {
    const dt = lastT ? Math.min(64, t - lastT) : 16;
    lastT = t;
    const d = target - pos;
    if (Math.abs(d) < 0.002) {
      pos = target;
      raf = lastT = 0;
      return;
    }
    pos += d * (1 - Math.exp(-dt / 70));
    raf = requestAnimationFrame(frame);
  }

  /** Snap to a row: the value is committed at once, the drum animates after it. */
  function goTo(t: number) {
    target = Math.round(t);
    value = mod(target);
    if (!raf) raf = requestAnimationFrame(frame);
  }

  // Follow outside changes by turning the short way round.
  $effect(() => {
    const v = value;
    const cur = mod(Math.round(target));
    if (v === cur || dragging) return;
    let delta = v - cur;
    if (delta > count / 2) delta -= count;
    if (delta < -count / 2) delta += count;
    goTo(target + delta);
  });

  // A tick each time a new row crosses the centre line.
  // svelte-ignore state_referenced_locally
  let lastRow = Math.round(pos);
  $effect(() => {
    const row = Math.round(pos);
    if (row !== lastRow) {
      lastRow = row;
      tick();
    }
  });

  // Drag with momentum.
  let startY = 0;
  let startPos = 0;
  let samples: { t: number; y: number }[] = [];

  function down(e: PointerEvent) {
    (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
    cancelAnimationFrame(raf);
    raf = 0;
    dragging = true;
    startY = e.clientY;
    startPos = pos;
    samples = [{ t: e.timeStamp, y: e.clientY }];
  }

  function move(e: PointerEvent) {
    if (!dragging) return;
    pos = startPos + (startY - e.clientY) / ITEM;
    samples.push({ t: e.timeStamp, y: e.clientY });
    if (samples.length > 6) samples.shift();
  }

  function up(e: PointerEvent) {
    if (!dragging) return;
    dragging = false;
    pos = startPos + (startY - e.clientY) / ITEM;
    const a = samples[0];
    const dt = e.timeStamp - a.t;
    const v = dt > 0 ? (a.y - e.clientY) / ITEM / dt : 0; // rows per ms
    // A tap (no movement) on a row selects it.
    if (Math.abs(e.clientY - startY) < 3) {
      const el = (e.target as HTMLElement).closest<HTMLElement>("[data-row]");
      if (el) return goTo(Number(el.dataset.row));
    }
    goTo(pos + Math.max(-12, Math.min(12, v * 220)));
  }

  function wheel(e: WheelEvent) {
    e.preventDefault();
    wheelAcc += e.deltaY;
    const steps = Math.trunc(wheelAcc / 90); // ~one row per mouse-wheel notch
    if (!steps) return;
    wheelAcc -= steps * 90;
    goTo(target + steps);
  }

  function key(e: KeyboardEvent) {
    if (e.key === "ArrowDown") (e.preventDefault(), goTo(target + 1));
    if (e.key === "ArrowUp") (e.preventDefault(), goTo(target - 1));
    if (e.key === "PageDown") (e.preventDefault(), goTo(target + 5));
    if (e.key === "PageUp") (e.preventDefault(), goTo(target - 5));
  }

  const rows = $derived.by(() => {
    const base = Math.round(pos);
    const out: { i: number; angle: number }[] = [];
    for (let k = -5; k <= 5; k++) {
      const angle = (base + k - pos) * STEP;
      if (Math.abs(angle) < 90) out.push({ i: base + k, angle });
    }
    return out;
  });

  let audio: AudioContext | undefined;
  /** A very short, quiet click: the detent of the gear. */
  function tick() {
    try {
      audio ??= new AudioContext();
      const t = audio.currentTime;
      const o = audio.createOscillator();
      const g = audio.createGain();
      o.type = "triangle";
      o.frequency.setValueAtTime(2400, t);
      o.frequency.exponentialRampToValueAtTime(900, t + 0.018);
      g.gain.setValueAtTime(0.035, t);
      g.gain.exponentialRampToValueAtTime(0.0001, t + 0.03);
      o.connect(g).connect(audio.destination);
      o.start(t);
      o.stop(t + 0.035);
    } catch {
      /* no audio */
    }
  }
</script>

<!-- svelte-ignore a11y_no_noninteractive_tabindex -->
<div
  class="wheel"
  tabindex="0"
  role="listbox"
  aria-activedescendant="row-{mod(Math.round(pos))}"
  style="height: {ITEM * 5}px; --item: {ITEM}px"
  onpointerdown={down}
  onpointermove={move}
  onpointerup={up}
  onpointercancel={up}
  onwheel={wheel}
  onkeydown={key}
>
  <div class="drum" style="transform: translateZ(-{RADIUS}px)">
    {#each rows as r (r.i)}
      <div
        class="row"
        data-row={r.i}
        role="option"
        aria-selected={r.i === Math.round(pos)}
        style="transform: rotateX({-r.angle}deg) translateZ({RADIUS}px); opacity: {0.18 + 0.82 * Math.cos((r.angle * Math.PI) / 180) ** 3}"
      >
        {label(mod(r.i))}
      </div>
    {/each}
  </div>
</div>

<style>
  .wheel {
    position: relative;
    width: 56px;
    overflow: hidden;
    perspective: 520px;
    outline: none;
    touch-action: none;
    cursor: grab;
    /* Fade the rows into the cylinder's far side. */
    mask-image: linear-gradient(to bottom, transparent, #000 30%, #000 70%, transparent);
  }
  .wheel:active {
    cursor: grabbing;
  }
  .drum {
    position: absolute;
    inset: 0;
    transform-style: preserve-3d;
  }
  .row {
    position: absolute;
    top: calc(50% - var(--item) / 2);
    left: 0;
    right: 0;
    height: var(--item);
    line-height: var(--item);
    text-align: center;
    color: var(--text);
    font-size: 20px;
    font-variant-numeric: tabular-nums;
    backface-visibility: hidden;
    pointer-events: auto;
  }
</style>
