// Pomodoro-style focus timer. Finished (or stopped after a minute) focus
// blocks are appended to `.board/focus.jsonl`, one JSON object per line.

import { api } from "./api";
import { app } from "./state.svelte";

const LOG = ".board/focus.jsonl";

export interface FocusEntry {
  start: string; // ISO timestamps
  end: string;
  minutes: number;
  topic: string;
}

export async function loadFocus(): Promise<FocusEntry[]> {
  const text = await api.readText(LOG).catch(() => "");
  return text
    .split("\n")
    .filter((l) => l.trim())
    .flatMap((l) => {
      try {
        return [JSON.parse(l) as FocusEntry];
      } catch {
        return [];
      }
    });
}

/** Minutes per topic, largest first. */
export function byTopic(entries: FocusEntry[]): [string, number][] {
  const m = new Map<string, number>();
  for (const e of entries) m.set(e.topic || "Untitled", (m.get(e.topic || "Untitled") ?? 0) + e.minutes);
  return [...m].sort((a, b) => b[1] - a[1]);
}

export const fmtMinutes = (m: number) => (m < 60 ? `${m} min` : `${Math.floor(m / 60)} h${m % 60 ? ` ${m % 60}` : ""}`);

type Phase = "idle" | "focus" | "break";

/** A Pomodoro session: `rounds` focus blocks with short breaks, then one long break. */
export interface Plan {
  focus: number; // minutes
  short: number;
  long: number;
  rounds: number;
  /** Start the next focus round by itself when a break ends. */
  autoNext: boolean;
}

export const PRESETS: { name: string; plan: Omit<Plan, "autoNext"> }[] = [
  { name: "Classic", plan: { focus: 25, short: 5, long: 15, rounds: 4 } },
  { name: "Deep work", plan: { focus: 50, short: 10, long: 20, rounds: 3 } },
  { name: "Short sprints", plan: { focus: 15, short: 3, long: 10, rounds: 4 } },
];

const PLAN_KEY = "tomate.pomodoro";
const clampInt = (v: unknown, lo: number, hi: number, d: number) => {
  const n = Math.round(Number(v));
  return Number.isFinite(n) ? Math.min(hi, Math.max(lo, n)) : d;
};

function readPlan(): Plan {
  let p: Partial<Plan> = {};
  try {
    p = JSON.parse(localStorage.getItem(PLAN_KEY) ?? "{}");
  } catch {
    /* defaults */
  }
  return {
    focus: clampInt(p.focus, 1, 180, 25),
    short: clampInt(p.short, 1, 60, 5),
    long: clampInt(p.long, 1, 90, 15),
    rounds: clampInt(p.rounds, 1, 12, 4),
    autoNext: p.autoNext ?? false,
  };
}

class FocusTimer {
  phase = $state<Phase>("idle");
  topic = $state("");
  paused = $state(false);
  /** Milliseconds left in the current block. */
  left = $state(0);
  total = $state(0);
  /** Recent topics, newest first, for the topic picker. */
  recent = $state<string[]>([]);
  /** Bumped when a block is logged so views can refetch. */
  logged = $state(0);

  plan = $state<Plan>(readPlan());
  /** Current focus round, 1-based; kept between rounds when the next one waits for Start. */
  round = $state(1);
  /** Whether the running break is the long one at the end of the session. */
  longBreak = $state(false);

  /** When the running block ends (ms epoch); meaningless while paused or idle. */
  endsAt = $state(0);
  private startedAt = 0;
  private focusedMs = 0; // focus time accumulated before the last pause
  private resumedAt = 0;
  private tick: ReturnType<typeof setInterval> | undefined;

  async loadRecent() {
    const seen = new Set<string>();
    for (const e of (await loadFocus()).reverse()) if (e.topic) seen.add(e.topic);
    this.recent = [...seen].slice(0, 8);
  }

  setPlan(p: Partial<Plan>) {
    this.plan = { ...this.plan, ...p };
    this.plan = { ...this.plan, focus: clampInt(this.plan.focus, 1, 180, 25), short: clampInt(this.plan.short, 1, 60, 5), long: clampInt(this.plan.long, 1, 90, 15), rounds: clampInt(this.plan.rounds, 1, 12, 4) };
    if (this.round > this.plan.rounds) this.round = 1;
    try {
      localStorage.setItem(PLAN_KEY, JSON.stringify(this.plan));
    } catch {
      /* kept for this session */
    }
  }

  /** Start the next focus round of the session. */
  start() {
    this.begin("focus", this.plan.focus);
    this.startedAt = Date.now();
    this.focusedMs = 0;
  }

  pause() {
    if (this.phase === "idle" || this.paused) return;
    this.paused = true;
    if (this.phase === "focus") this.focusedMs += Date.now() - this.resumedAt;
    clearInterval(this.tick);
  }

  resume() {
    if (!this.paused) return;
    this.paused = false;
    this.endsAt = Date.now() + this.left;
    this.resumedAt = Date.now();
    this.run();
  }

  /** Stop the session: a focus block of at least a minute is still logged. */
  async stop() {
    if (this.phase === "focus") await this.log();
    this.reset();
    this.round = 1;
  }

  /** End the break now and move on as if it had run out. */
  skipBreak() {
    if (this.phase === "break") this.afterBreak();
  }

  private begin(phase: Phase, minutes: number) {
    clearInterval(this.tick);
    this.phase = phase;
    this.paused = false;
    this.total = this.left = minutes * 60_000;
    this.endsAt = Date.now() + this.left;
    this.resumedAt = Date.now();
    this.run();
  }

  private run() {
    this.tick = setInterval(() => {
      this.left = Math.max(0, this.endsAt - Date.now());
      document.title = `${fmtClock(this.left)} · ${this.phase === "focus" ? this.topic || "Focus" : this.longBreak ? "Long break" : "Break"}`;
      if (this.left === 0) this.finish();
    }, 250);
  }

  /**
   * Called by the notch window when its own countdown hits zero: a minimised
   * main window gets its timers throttled, the visible notch does not.
   */
  checkEnd() {
    if (this.phase !== "idle" && !this.paused && Date.now() >= this.endsAt - 300) {
      this.left = 0;
      this.finish();
    }
  }

  private finishing = false;
  private async finish() {
    if (this.finishing) return;
    this.finishing = true;
    clearInterval(this.tick);
    chime();
    if (this.phase === "focus") {
      await this.log();
      this.longBreak = this.round >= this.plan.rounds;
      const mins = this.longBreak ? this.plan.long : this.plan.short;
      app.notify(
        this.longBreak
          ? `Session done: ${this.plan.rounds} rounds. Long break, ${mins} min.`
          : `Round ${this.round} of ${this.plan.rounds} done. Break, ${mins} min.`,
      );
      this.begin("break", mins);
    } else {
      this.afterBreak();
    }
    this.finishing = false;
  }

  /** After a break: next round (or a new session after the long one), started now or on Start. */
  private afterBreak() {
    const sessionOver = this.longBreak;
    this.round = sessionOver ? 1 : this.round + 1;
    this.longBreak = false;
    if (this.plan.autoNext && !sessionOver) {
      this.start();
    } else {
      this.reset();
      if (!sessionOver) app.notify(`Break over. Start round ${this.round} of ${this.plan.rounds} when you're ready.`);
    }
  }

  private async log() {
    const ms = this.focusedMs + (this.paused ? 0 : Date.now() - this.resumedAt);
    const minutes = Math.round(ms / 60_000);
    if (minutes < 1) return;
    const entry: FocusEntry = { start: new Date(this.startedAt).toISOString(), end: new Date().toISOString(), minutes, topic: this.topic.trim() };
    const text = await api.readText(LOG).catch(() => "");
    await api.writeText(LOG, text + (text && !text.endsWith("\n") ? "\n" : "") + JSON.stringify(entry) + "\n").catch((e) => app.fail(`Couldn't log ${minutes} min of focus time`, e));
    if (entry.topic) this.recent = [entry.topic, ...this.recent.filter((t) => t !== entry.topic)].slice(0, 8);
    this.logged++;
  }

  private reset() {
    clearInterval(this.tick);
    this.phase = "idle";
    this.paused = false;
    this.left = this.total = 0;
    document.title = "ToMate";
  }
}

export const fmtClock = (ms: number) => {
  const s = Math.ceil(ms / 1000);
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`;
};

/** Two soft notes, so the end of a block is noticed without a notification permission. */
function chime() {
  try {
    const ctx = new AudioContext();
    [660, 880].forEach((f, i) => {
      const o = ctx.createOscillator();
      const g = ctx.createGain();
      o.frequency.value = f;
      o.connect(g).connect(ctx.destination);
      const t = ctx.currentTime + i * 0.22;
      g.gain.setValueAtTime(0.0001, t);
      g.gain.exponentialRampToValueAtTime(0.25, t + 0.02);
      g.gain.exponentialRampToValueAtTime(0.0001, t + 0.6);
      o.start(t);
      o.stop(t + 0.65);
    });
  } catch {
    /* no audio device */
  }
}

export const focus = new FocusTimer();
