import { api, parentOf, type Entry } from "$lib/api";
import { app } from "$lib/state.svelte";

/**
 * Drag & drop state. Tree rows carry `data-drop="<folder>"` (a folder row → itself,
 * a file row → its parent, the tree background → root), so the folder under any
 * point can be found with `elementFromPoint`.
 */
export const dnd = $state<{
  target: string | null; // folder currently hovered as drop target
  dragging: Entry | null; // entry being moved inside the tree
  external: boolean; // files dragged in from Windows
  x: number;
  y: number;
}>({ target: null, dragging: null, external: false, x: 0, y: 0 });

/** Where external drops land when not over the tree (set by the visible page). */
export const dropFallback = { dir: "" };

let expandTimer: ReturnType<typeof setTimeout> | undefined;
let justDragged = false;

export const wasDrag = () => justDragged;

export function dropDirAt(x: number, y: number): string | null {
  const el = document.elementFromPoint(x, y)?.closest<HTMLElement>("[data-drop]");
  return el ? (el.dataset.drop ?? "") : null;
}

/** Hovering a collapsed folder for a moment opens it, like VS Code. */
export function setTarget(dir: string | null) {
  if (dir === dnd.target) return;
  dnd.target = dir;
  clearTimeout(expandTimer);
  if (dir && !app.expanded[dir]) expandTimer = setTimeout(() => dnd.target === dir && app.toggle(dir), 650);
}

export function clearDrag() {
  dnd.dragging = null;
  dnd.external = false;
  setTarget(null);
}

/** Pointer-based move inside the tree (native HTML5 DnD is unavailable with OS file drops on). */
export function startDrag(ev: PointerEvent, entry: Entry) {
  if (ev.button !== 0) return;
  const sx = ev.clientX;
  const sy = ev.clientY;
  let active = false;

  const move = (e: PointerEvent) => {
    if (!active && Math.hypot(e.clientX - sx, e.clientY - sy) < 5) return;
    active = true;
    dnd.dragging = entry;
    dnd.x = e.clientX;
    dnd.y = e.clientY;
    setTarget(dropDirAt(e.clientX, e.clientY));
  };
  const up = () => {
    removeEventListener("pointermove", move);
    removeEventListener("pointerup", up);
    if (!active) return;
    justDragged = true;
    setTimeout(() => (justDragged = false), 0); // swallow the click that follows
    const dir = dnd.target;
    clearDrag();
    if (dir !== null) moveTo(entry, dir);
  };
  addEventListener("pointermove", move);
  addEventListener("pointerup", up);
}

export async function moveTo(entry: Entry, dir: string) {
  if (parentOf(entry.path) === dir || dir === entry.path) return;
  await app.run(async () => {
    const to = await api.moveEntry(entry.path, dir);
    await Promise.all([app.load(parentOf(entry.path)), app.load(dir)]);
    app.retab(entry.path, app.dirs[dir]?.find((e) => e.path === to) ?? null);
    app.notify(`Moved "${entry.name}" to ${dir || app.rootName}`);
  }, `Couldn't move "${entry.name}"`);
}

export async function importDropped(paths: string[], dir: string) {
  await app.run(async () => {
    if (dir) {
      await api.createDir(dir).catch(() => {}); // e.g. a week folder not created yet
      await app.load(parentOf(dir));
    }
    const added = await api.importPaths(paths, dir);
    await app.load(dir);
    if (dir) await app.reveal(dir + "/x");
    if (added.length) app.notify(`Added ${added.length} ${added.length === 1 ? "item" : "items"} to ${dir || app.rootName}`);
  }, "Couldn't add the dropped files");
}
