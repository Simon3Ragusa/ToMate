import { invoke } from "@tauri-apps/api/core";
import { listen } from "@tauri-apps/api/event";

export interface Entry {
  name: string;
  path: string; // workspace-relative, forward slashes
  is_dir: boolean;
  size: number;
  modified: number; // ms since epoch
  created: number;
}

export const api = {
  openWorkspace: (path: string) => invoke<string>("open_workspace", { path }),
  lastWorkspace: () => invoke<string | null>("last_workspace"),
  listDir: (path: string) => invoke<Entry[]>("list_dir", { path }),
  listAll: () => invoke<Entry[]>("list_all"),
  readText: (path: string) => invoke<string>("read_text", { path }),
  readBytes: async (path: string) => new Uint8Array(await invoke<ArrayBuffer>("read_bytes", { path })),
  writeText: (path: string, content: string) => invoke<void>("write_text", { path, content }),
  createFile: (path: string, content?: string) => invoke<void>("create_file", { path, content }),
  createDir: (path: string) => invoke<void>("create_dir", { path }),
  rename: (from: string, to: string) => invoke<void>("rename", { from, to }),
  delete: (path: string) => invoke<void>("delete", { path }),
  importPaths: (paths: string[], dir: string) => invoke<string[]>("import_paths", { paths, dir }),
  moveEntry: (from: string, dir: string) => invoke<string>("move_entry", { from, dir }),
  openExternal: (path: string) => invoke<void>("open_external", { path }),
  reveal: (path: string) => invoke<void>("reveal", { path }),
  readActivity: () => invoke<string>("read_activity"),
  pptxToPdf: (path: string) => invoke<string>("pptx_to_pdf", { path }),
  /** Digest files (`YYYY-MM-DD.json`) in a folder outside the workspace, chosen by the user. */
  /** Update the local cache of `owner/name`'s data/findings via git; returns that folder. */
  syncRadar: (repo: string) => invoke<string>("sync_radar", { repo }),
  readDigestDir: (path: string) => invoke<{ name: string; text: string | null; error: string | null }[]>("read_digest_dir", { path }),
};

/** App/platform material (ideas, handoffs, notes about ToMate itself), kept out of the work views. */
export const PLATFORM_DIR = "Platform";
export const isPlatform = (path: string) => path === PLATFORM_DIR || path.startsWith(PLATFORM_DIR + "/");

/** Every file except the platform folder: what calendar, weeks, notes and recents show. */
export const listWork = async () => (await api.listAll()).filter((f) => !isPlatform(f.path));

/** Fires with the list of workspace folders whose contents changed. */
export const onFsChange = (cb: (dirs: string[]) => void) =>
  listen<string[]>("fs-change", (e) => cb(e.payload));

export const parentOf = (path: string) => (path.includes("/") ? path.slice(0, path.lastIndexOf("/")) : "");
export const joinPath = (dir: string, name: string) => (dir ? `${dir}/${name}` : name);
export const extOf = (name: string) => (name.includes(".") ? name.slice(name.lastIndexOf(".") + 1).toLowerCase() : "");
