<!--
  The focus notch: its own always-on-top window at the top centre of the
  screen. Collapsed it shows a progress ring and the time left; resting the
  cursor on it springs it open with the topic and controls.

  The window never changes size (resizing mid-animation made the content
  jump). Instead it is click-through while collapsed, so whatever sits
  under it (e.g. browser tabs) stays clickable, and hover is detected by
  polling the cursor position with a short dwell, so passing over the
  notch on the way somewhere else does not open it.
-->
<script lang="ts">
  import { onMount } from "svelte";
  import { getCurrentWindow, currentMonitor, primaryMonitor, cursorPosition, PhysicalPosition } from "@tauri-apps/api/window";
  import { emitTo, listen } from "@tauri-apps/api/event";
  import { invoke } from "@tauri-apps/api/core";
  import { fmtClock } from "$lib/focus.svelte";
  import { NOTCH_SIZE, PILL_CLOSED, PILL_OPEN, type NotchCmd, type NotchState } from "$lib/notch.svelte";

  /** How long the cursor must rest on the collapsed notch before it opens. */
  const DWELL_MS = 300;
  /** Grace period after the cursor leaves the open notch. */
  const LEAVE_MS = 180;

  let s = $state<NotchState>({ phase: "idle", paused: false, topic: "", endsAt: 0, left: 0, total: 0, round: 1, rounds: 4, longBreak: false });
  let now = $state(Date.now());
  let open = $state(false);
  /** Clicked away: invisible and click-through until the cursor leaves the notch. */
  let ghost = $state(false);
  let doneSent = false;
  /** Window origin and scale on screen (physical px). */
  let geo = { x: 0, y: 0, scale: 1 };
  let enteredAt = 0;
  let leftAt = 0;

  const left = $derived(s.paused ? s.left : Math.max(0, s.endsAt - now));
  const progress = $derived(s.total ? 1 - left / s.total : 0);
  const tone = $derived(s.paused ? "paused" : s.phase === "break" ? "break" : "focus");
  const send = (c: NotchCmd) => emitTo("main", "notch-cmd", c);

  onMount(() => {
    document.documentElement.style.background = "transparent";
    document.body.style.background = "transparent";
    const win = getCurrentWindow();
    win.setIgnoreCursorEvents(true);
    place();
    const un = listen<NotchState>("focus-state", ({ payload }) => {
      s = payload;
      doneSent = false;
    });
    send("ready");
    const tick = setInterval(() => {
      now = Date.now();
      // The main window may be minimised and throttled: tell it when time is up.
      if (!s.paused && s.phase !== "idle" && s.endsAt && now >= s.endsAt && !doneSent) {
        doneSent = true;
        send("done");
      }
    }, 200);
    const hover = setInterval(trackCursor, 60);
    return () => {
      clearInterval(tick);
      clearInterval(hover);
      un.then((f) => f());
    };
  });

  /** Keep the window centred at the top of its monitor. */
  async function place() {
    const mon = (await currentMonitor()) ?? (await primaryMonitor());
    if (!mon) return;
    const x = mon.position.x + Math.round((mon.size.width - NOTCH_SIZE.w * mon.scaleFactor) / 2);
    geo = { x, y: mon.position.y, scale: mon.scaleFactor };
    await getCurrentWindow().setPosition(new PhysicalPosition(x, mon.position.y));
  }

  /** Is the cursor over the pill (of the given logical size, centred at the top)? */
  function over(p: { x: number; y: number }, pill: { w: number; h: number }) {
    const cx = geo.x + (NOTCH_SIZE.w * geo.scale) / 2;
    return Math.abs(p.x - cx) <= (pill.w * geo.scale) / 2 && p.y >= geo.y - 2 && p.y <= geo.y + pill.h * geo.scale;
  }

  async function trackCursor() {
    if (s.phase === "idle" || document.hidden) return;
    const p = await cursorPosition().catch(() => null);
    if (!p) return;
    const t = Date.now();
    if (ghost) {
      // Back to normal (collapsed, visible) once the cursor has moved away.
      // Collapse while still invisible (ghost has no size transition), then fade back in.
      if (!over(p, PILL_OPEN)) {
        if (open) {
          open = false;
          setTimeout(() => (ghost = false), 60);
        } else ghost = false;
      }
      return;
    }
    if (!open) {
      if (!over(p, PILL_CLOSED)) return void (enteredAt = 0);
      enteredAt ||= t;
      if (t - enteredAt >= DWELL_MS) setOpen(true);
    } else {
      if (over(p, PILL_OPEN)) return void (leftAt = 0);
      leftAt ||= t;
      if (t - leftAt >= LEAVE_MS) setOpen(false);
    }
  }

  function setOpen(v: boolean) {
    open = v;
    enteredAt = leftAt = 0;
    // Only the open notch takes clicks; collapsed, it lets them through.
    getCurrentWindow().setIgnoreCursorEvents(!v);
  }

  /**
   * A click on the notch itself (not on a control) means "I wanted what is
   * behind it": vanish, and replay the click on the window underneath.
   */
  function clickThrough(e: MouseEvent) {
    if ((e.target as HTMLElement).closest("button")) return;
    ghost = true;
    enteredAt = leftAt = 0;
    invoke("notch_click_through").catch(() => getCurrentWindow().setIgnoreCursorEvents(true));
  }

  // Ring geometry for the collapsed pill.
  const R = 7;
  const C = 2 * Math.PI * R;
</script>

<div class="stage">
  <!-- svelte-ignore a11y_click_events_have_key_events, a11y_no_static_element_interactions -->
  <div class="pill {tone}" class:open class:ghost onclick={clickThrough}>
    <div class="compact">
      <svg class="ring" viewBox="0 0 18 18">
        <circle cx="9" cy="9" r={R} class="track" />
        <circle cx="9" cy="9" r={R} class="arc" stroke-dasharray={C} stroke-dashoffset={C * (1 - progress)} />
      </svg>
      <span class="time">{fmtClock(left)}</span>
    </div>

    <div class="full">
      <div class="head">
        <div class="what">
          <span class="kicker"
            >{s.paused ? "Paused" : s.phase === "break" ? (s.longBreak ? "Long break" : "Break") : "Focusing on"} · round {Math.min(s.round, s.rounds)} of {s.rounds}</span
          >
          <span class="topic">{s.phase === "break" ? "Step away for a bit" : s.topic || "Untitled block"}</span>
        </div>
        <span class="big">{fmtClock(left)}</span>
      </div>
      <div class="bar"><div style="transform: scaleX({progress})"></div></div>
      <div class="controls">
        {#if s.phase === "focus"}
          {#if s.paused}
            <button title="Resume" onclick={() => send("resume")}>
              <svg viewBox="0 0 16 16"><path d="M5 3.5l7 4.5-7 4.5z" fill="currentColor" /></svg>
            </button>
          {:else}
            <button title="Pause" onclick={() => send("pause")}>
              <svg viewBox="0 0 16 16"><path d="M5 3.5v9M11 3.5v9" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" /></svg>
            </button>
          {/if}
          <button title="Stop and log" onclick={() => send("stop")}>
            <svg viewBox="0 0 16 16"><rect x="4" y="4" width="8" height="8" rx="1.5" fill="currentColor" /></svg>
          </button>
        {:else}
          <button class="text" title="Skip the break" onclick={() => send("skip")}>Skip</button>
        {/if}
        <button class="text" title="Open ToMate" onclick={() => send("open")}>Open</button>
      </div>
    </div>
  </div>
</div>

<style>
  :global(html),
  :global(body) {
    margin: 0;
    overflow: hidden;
    background: transparent !important;
    user-select: none;
  }
  .stage {
    display: flex;
    justify-content: center;
    align-items: flex-start;
    height: 100vh;
    font-family: "Segoe UI Variable Text", "Segoe UI", system-ui, sans-serif;
  }
  .pill {
    --tone: var(--focus);
    position: relative;
    width: 120px;
    height: 30px;
    overflow: hidden;
    border-radius: 0 0 15px 15px;
    background: var(--notch-bg);
    color: #fff;
    cursor: pointer;
    /* A slight overshoot gives the "springy" island feel. */
    transition:
      width 0.42s var(--ease-spring),
      height 0.42s var(--ease-spring),
      border-radius 0.42s var(--ease-spring),
      opacity 0.3s ease;
  }
  .pill.ghost {
    opacity: 0;
    transition: opacity 0.12s ease;
  }
  .pill.break {
    --tone: var(--break);
  }
  .pill.paused {
    --tone: #8e8e93;
  }
  .pill.open {
    width: 328px;
    height: 100px;
    border-radius: 0 0 26px 26px;
  }
  /*
   * Both layers have their final, fixed size and stay centred: the pill's
   * animated size only reveals or clips them, so nothing re-lays out (and no
   * digit shifts) mid-animation. Only opacity and a small offset animate, on
   * their own compositor layers so text rendering never switches mode.
   */
  .compact,
  .full {
    position: absolute;
    top: 0;
    left: 50%;
    will-change: opacity, transform;
  }
  .compact {
    display: flex;
    align-items: center;
    justify-content: center;
    gap: 8px;
    width: 120px;
    height: 30px;
    margin-left: -60px;
    transition: opacity 0.18s ease 0.12s;
  }
  .open .compact {
    opacity: 0;
    transition: opacity 0.1s ease;
  }
  .full {
    width: 328px;
    height: 100px;
    margin-left: -164px;
    padding: 12px 18px 0;
    box-sizing: border-box;
    opacity: 0;
    transform: translateY(-4px);
    pointer-events: none;
    transition:
      opacity 0.12s ease,
      transform 0.12s ease;
  }
  .open .full {
    opacity: 1;
    transform: none;
    pointer-events: auto;
    transition:
      opacity 0.22s ease 0.1s,
      transform 0.32s var(--ease-spring) 0.06s;
  }
  .ring {
    width: 15px;
    height: 15px;
    transform: rotate(-90deg);
  }
  .ring circle {
    fill: none;
    stroke-width: 2.4;
  }
  .track {
    stroke: rgba(255, 255, 255, 0.18);
  }
  .arc {
    stroke: var(--tone);
    stroke-linecap: round;
    transition: stroke-dashoffset 0.3s linear;
  }
  .time {
    color: var(--tone);
    font-size: 13px;
    font-weight: 600;
    font-variant-numeric: tabular-nums;
    letter-spacing: 0.01em;
  }
  .head {
    display: flex;
    align-items: flex-end;
    justify-content: space-between;
    gap: 12px;
  }
  .what {
    display: flex;
    flex-direction: column;
    min-width: 0;
  }
  .kicker {
    color: rgba(255, 255, 255, 0.5);
    font-size: 11px;
  }
  .topic {
    overflow: hidden;
    font-size: 14px;
    font-weight: 600;
    text-overflow: ellipsis;
    white-space: nowrap;
  }
  .big {
    color: var(--tone);
    font-size: 28px;
    font-weight: 300;
    line-height: 1;
    font-variant-numeric: tabular-nums;
  }
  .bar {
    height: 4px;
    margin: 9px 0 8px;
    border-radius: 2px;
    background: rgba(255, 255, 255, 0.14);
    overflow: hidden;
  }
  .bar div {
    height: 100%;
    border-radius: 2px;
    background: var(--tone);
    transform-origin: left;
    transition: transform 0.3s linear;
  }
  .controls {
    display: flex;
    gap: 6px;
  }
  button {
    display: grid;
    place-items: center;
    height: 24px;
    min-width: 24px;
    padding: 0 8px;
    border: 0;
    border-radius: var(--r-lg);
    background: rgba(255, 255, 255, 0.12);
    color: #fff;
    font: inherit;
    font-size: 12px;
  }
  button:hover {
    background: rgba(255, 255, 255, 0.22);
  }
  button.text:last-child {
    margin-left: auto;
  }
  button svg {
    width: 11px;
    height: 11px;
  }
</style>
