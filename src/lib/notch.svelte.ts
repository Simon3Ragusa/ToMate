// Main-window side of the focus "notch": a small always-on-top window at the
// top centre of the screen, shown while a block runs and the app is minimised
// or behind other windows. Also mirrors progress on the taskbar button.

import { WebviewWindow } from "@tauri-apps/api/webviewWindow";
import { getCurrentWindow, ProgressBarStatus } from "@tauri-apps/api/window";
import { emitTo, listen } from "@tauri-apps/api/event";
import { untrack } from "svelte";
import { focus } from "./focus.svelte";
import { app } from "./state.svelte";
import { workspace } from "./workspace.svelte";

export const NOTCH = "notch";

/** Fixed window size and the pill inside it, collapsed and open (logical px). */
export const NOTCH_SIZE = { w: 344, h: 112 };
export const PILL_CLOSED = { w: 120, h: 30 };
export const PILL_OPEN = { w: 328, h: 100 };

/** What the notch needs to draw itself; it runs its own countdown from `endsAt`. */
export interface NotchState {
  phase: "idle" | "focus" | "break";
  paused: boolean;
  topic: string;
  endsAt: number;
  left: number;
  total: number;
  round: number;
  rounds: number;
  longBreak: boolean;
}
export type NotchCmd = "pause" | "resume" | "stop" | "skip" | "open" | "done" | "ready";

const snapshot = (): NotchState => ({
  phase: focus.phase,
  paused: focus.paused,
  topic: focus.topic,
  endsAt: focus.endsAt,
  left: focus.left,
  total: focus.total,
  round: focus.round,
  rounds: focus.plan.rounds,
  longBreak: focus.longBreak,
});

/** Starts the bridge; returns a cleanup function. */
export function startNotch(): () => void {
  const main = getCurrentWindow();
  let focused = true;
  /** The notch window, resolved once Tauri has actually created it (null if that failed). */
  let win: Promise<WebviewWindow | null> | null = null;

  function ensure() {
    win ??= create();
    return win;
  }

  function create() {
    const w = new WebviewWindow(NOTCH, {
      url: "/#notch",
      title: "Focus",
      width: NOTCH_SIZE.w,
      height: NOTCH_SIZE.h,
      decorations: false,
      transparent: true,
      shadow: false,
      alwaysOnTop: true,
      skipTaskbar: true,
      resizable: false,
      focus: false,
      visible: false,
    });
    // Creation is asynchronous: calls made before "created" fail silently.
    return new Promise<WebviewWindow | null>((resolve) => {
      w.once("tauri://created", () => resolve(w));
      w.once("tauri://error", (e) => {
        win = null;
        app.notify(`Could not open the focus notch: ${String(e.payload)}`, true);
        resolve(null);
      });
    });
  }

  async function update() {
    const want = focus.phase !== "idle" && !focused && workspace.config.modules.notch;
    if (want) {
      const w = await ensure();
      if (!w) return;
      await emitTo(NOTCH, "focus-state", snapshot()).catch(() => {});
      await w.show().catch((e) => app.notify(`Focus notch: ${e}`, true));
    } else if (win) {
      const w = await win;
      if (focus.phase === "idle") {
        win = null;
        await w?.destroy().catch(() => {}); // free its webview between sessions
      } else await w?.hide().catch(() => {});
    }
  }

  // A notch left over from a previous run (e.g. a dev reload) would block the label.
  WebviewWindow.getByLabel(NOTCH).then((w) => w?.destroy()).catch(() => {});

  const unFocus = main.onFocusChanged(({ payload }) => {
    focused = payload;
    update();
  });
  // Backup for minimising: not every path reliably reports a focus change.
  const unResize = main.onResized(async () => {
    if (await main.isMinimized()) {
      focused = false;
      update();
    }
  });

  const unCmd = listen<NotchCmd>("notch-cmd", async ({ payload: c }) => {
    if (c === "ready") return emitTo(NOTCH, "focus-state", snapshot());
    if (c === "pause") focus.pause();
    if (c === "resume") focus.resume();
    if (c === "stop") await focus.stop();
    if (c === "skip") focus.skipBreak();
    if (c === "done") focus.checkEnd();
    if (c === "open") {
      await main.unminimize();
      await main.show();
      await main.setFocus();
    }
  });

  // Push state changes to the notch and the taskbar button.
  let last = "";
  const stopEffects = $effect.root(() => {
    $effect(() => {
      // Everything but `left`, which ticks 4x a second: the notch counts down itself.
      [focus.phase, focus.paused, focus.topic, focus.endsAt, focus.total, focus.round, focus.plan.rounds, focus.longBreak];
      untrack(update);
    });
    $effect(() => {
      const status =
        focus.phase === "idle" ? ProgressBarStatus.None : focus.paused ? ProgressBarStatus.Paused : ProgressBarStatus.Normal;
      const pct = focus.total ? Math.round((1 - focus.left / focus.total) * 100) : 0;
      const key = `${status}:${pct}`;
      if (key === last) return;
      last = key;
      main.setProgressBar({ status, progress: pct }).catch(() => {});
    });
  });

  return () => {
    stopEffects();
    unFocus.then((f) => f());
    unResize.then((f) => f());
    unCmd.then((f) => f());
    win?.then((w) => w?.destroy()).catch(() => {});
  };
}
