import { ask } from "@tauri-apps/plugin-dialog";
import { api, joinPath, parentOf, type Entry } from "$lib/api";
import { app } from "$lib/state.svelte";

/** Inline edit in the tree: renaming an entry or naming a new one inside `dir`. */
export type Editing =
  | { mode: "rename"; entry: Entry }
  | { mode: "new-file" | "new-folder"; dir: string }
  | null;

export const tree = $state<{ editing: Editing; menu: { x: number; y: number; entry: Entry | null } | null }>({
  editing: null,
  menu: null,
});

export async function startNew(mode: "new-file" | "new-folder", dir: string) {
  if (dir) {
    app.expanded[dir] = true;
    if (!(dir in app.dirs)) await app.load(dir);
  }
  tree.editing = { mode, dir };
}

export async function commitEdit(name: string) {
  const ed = tree.editing;
  tree.editing = null;
  name = name.trim();
  if (!ed || !name) return;
  const what = ed.mode === "rename" ? `Couldn't rename "${ed.entry.name}"` : `Couldn't create "${name}"`;
  await app.run(async () => {
    if (ed.mode === "rename") {
      if (name === ed.entry.name) return;
      const to = joinPath(parentOf(ed.entry.path), name);
      await api.rename(ed.entry.path, to);
      await app.load(parentOf(ed.entry.path));
      app.retab(ed.entry.path, app.dirs[parentOf(to)]?.find((e) => e.path === to) ?? null);
    } else {
      const path = joinPath(ed.dir, name);
      if (ed.mode === "new-folder") await api.createDir(path);
      else await api.createFile(path, name.endsWith(".md") ? `# ${name.slice(0, -3)}\n\n` : "");
      await app.load(ed.dir);
      if (ed.mode === "new-file") app.current = app.dirs[ed.dir]?.find((e) => e.path === path) ?? null;
    }
  }, what);
}

export async function remove(entry: Entry) {
  const ok = await ask(`Move "${entry.name}" to the Recycle Bin?`, { title: "Delete", kind: "warning", okLabel: "Move to Recycle Bin" });
  if (!ok) return;
  await app.run(async () => {
    await api.delete(entry.path);
    app.closeUnder(entry.path);
    app.unpinUnder(entry.path);
    await app.load(parentOf(entry.path));
    app.notify(`Moved "${entry.name}" to the Recycle Bin`);
  }, `Couldn't delete "${entry.name}"`);
}
