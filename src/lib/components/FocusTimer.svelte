<!-- Sidebar focus timer: Pomodoro sessions (rounds of focus with short breaks, then a long one). -->
<script lang="ts">
  import { onMount } from "svelte";
  import { focus, fmtClock } from "$lib/focus.svelte";
  import PomodoroPanel from "./PomodoroPanel.svelte";

  onMount(() => void focus.loadRecent());

  let planOpen = $state(false);
  let planBtn = $state<HTMLButtonElement>();
  const progress = $derived(focus.total ? 1 - focus.left / focus.total : 0);
  const p = $derived(focus.plan);
  const label = $derived(focus.phase === "break" ? (focus.longBreak ? "Long break" : "Break") : focus.topic || "Focus");
  // Rounds already done in this session (the current one counts once its focus is over).
  const done = $derived(focus.round - 1 + (focus.phase === "break" ? 1 : 0));
</script>

<div class="focus" class:running={focus.phase !== "idle"} class:break={focus.phase === "break"}>
  {#if focus.phase === "idle"}
    <div class="row">
      <input bind:value={focus.topic} list="focus-topics" placeholder="Focus on…" spellcheck="false" />
      <datalist id="focus-topics">
        {#each focus.recent as t}<option value={t}></option>{/each}
      </datalist>
      <button class="go" title="Start round {focus.round} of {p.rounds} ({p.focus} min)" onclick={() => focus.start()}>
        <svg viewBox="0 0 16 16"><path d="M5 3.5l7 4.5-7 4.5z" fill="currentColor" /></svg>{p.focus}′
      </button>
      <button bind:this={planBtn} class:on={planOpen} title="Session plan" onclick={() => (planOpen = !planOpen)}>
        <svg viewBox="0 0 16 16"><path d="M2.5 4.5h7M12 4.5h1.5M2.5 11.5h2M7 11.5h6.5" stroke="currentColor" stroke-width="1.2" stroke-linecap="round" /><circle cx="10.5" cy="4.5" r="1.5" fill="none" stroke="currentColor" stroke-width="1.2" /><circle cx="5.5" cy="11.5" r="1.5" fill="none" stroke="currentColor" stroke-width="1.2" /></svg>
      </button>
    </div>
  {:else}
    <div class="row">
      <span class="clock">{fmtClock(focus.left)}</span>
      <span class="what">{label}</span>
      {#if focus.phase === "focus"}
        {#if focus.paused}
          <button title="Resume" onclick={() => focus.resume()}>
            <svg viewBox="0 0 16 16"><path d="M5 3.5l7 4.5-7 4.5z" fill="currentColor" /></svg>
          </button>
        {:else}
          <button title="Pause" onclick={() => focus.pause()}>
            <svg viewBox="0 0 16 16"><path d="M5 3.5v9M11 3.5v9" stroke="currentColor" stroke-width="2" /></svg>
          </button>
        {/if}
        <button title="Stop the session (the time so far is logged)" onclick={() => focus.stop()}>
          <svg viewBox="0 0 16 16"><rect x="4" y="4" width="8" height="8" rx="1" fill="currentColor" /></svg>
        </button>
      {:else}
        <button class="skip" title="End the break now" onclick={() => focus.skipBreak()}>Skip</button>
      {/if}
    </div>
    <div class="bar"><div style="width: {progress * 100}%"></div></div>
  {/if}

  {#if focus.phase !== "idle" || focus.round > 1}
    <div class="rounds" title="Round {Math.min(focus.round, p.rounds)} of {p.rounds}">
      {#each { length: p.rounds } as _, i}
        <span class="dot" class:done={i < done} class:now={i === focus.round - 1 && focus.phase === "focus"}></span>
      {/each}
      <span class="rlabel">Round {Math.min(focus.round, p.rounds)}/{p.rounds}</span>
      {#if focus.phase === "idle"}
        <button class="reset" title="Start over from round 1" onclick={() => (focus.round = 1)}>Reset</button>
      {/if}
    </div>
  {/if}

  {#if planOpen && planBtn}
    <PomodoroPanel anchor={planBtn} onclose={() => (planOpen = false)} />
  {/if}
</div>

<style>
  .focus {
    margin: 0 8px 10px;
    padding: 8px;
    border: 1px solid var(--border);
    border-radius: var(--r);
    background: var(--panel);
  }
  .row {
    display: flex;
    align-items: center;
    gap: 4px;
  }
  .row input {
    flex: 1;
    min-width: 0;
    height: 26px;
    padding: 0 6px;
    border: 0;
    border-radius: var(--r-sm);
    outline: none;
    background: none;
    color: var(--text);
    font: inherit;
    font-size: 12.5px;
  }
  .row input:focus {
    background: var(--hover);
  }
  button {
    display: grid;
    place-items: center;
    height: 26px;
    min-width: 26px;
    padding: 0 6px;
    border: 0;
    border-radius: var(--r-sm);
    background: none;
    color: var(--muted);
    font: inherit;
    font-size: 12px;
  }
  button:hover {
    background: var(--hover);
    color: var(--text);
  }
  .go {
    display: flex;
    gap: 3px;
    border: 1px solid var(--border);
    font-variant-numeric: tabular-nums;
  }
  .go svg {
    width: 9px;
    height: 9px;
  }
  button.on {
    background: var(--hover);
    color: var(--text);
  }
  .rounds {
    display: flex;
    align-items: center;
    gap: 4px;
    margin: 7px 4px 0;
  }
  .dot {
    width: 6px;
    height: 6px;
    border-radius: 50%;
    background: var(--bar);
  }
  .dot.done {
    background: var(--focus);
  }
  .dot.now {
    background: color-mix(in srgb, var(--focus) 45%, transparent);
    box-shadow: 0 0 0 1.5px var(--focus);
  }
  .rlabel {
    margin-left: 4px;
    color: var(--muted);
    font-size: 11px;
  }
  .reset {
    height: 18px;
    margin-left: auto;
    padding: 0 6px;
    font-size: 11px;
  }
</style>
