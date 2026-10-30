// [[Wiki links]] between files and the backlinks they create.

import type MarkdownIt from "markdown-it";
import { parentOf, type Entry } from "./api";

const WIKI = /\[\[([^\[\]\n|]+)(?:\|([^\[\]\n]+))?\]\]/g;

/** markdown-it rule: `[[Target]]` / `[[Target|label]]` → `<a class="wikilink" data-wiki="Target">`. */
export function wikiLinks(md: MarkdownIt) {
  md.inline.ruler.before("link", "wikilink", (state, silent) => {
    const src = state.src.slice(state.pos);
    if (!src.startsWith("[[")) return false;
    const m = /^\[\[([^\[\]\n|]+)(?:\|([^\[\]\n]+))?\]\]/.exec(src);
    if (!m) return false;
    if (!silent) {
      const open = state.push("link_open", "a", 1);
      open.attrs = [["href", "#"], ["class", "wikilink"], ["data-wiki", m[1].trim()]];
      state.push("text", "", 0).content = (m[2] ?? m[1]).trim();
      state.push("link_close", "a", -1);
    }
    state.pos += m[0].length;
    return true;
  });
}

const stem = (name: string) => name.replace(/\.[^./]+$/, "");
const norm = (s: string) => s.trim().toLowerCase().replace(/\\/g, "/");

/** File a wiki target points to: an exact path (with or without extension), else a file name. */
export function resolveWiki(target: string, files: Entry[]): Entry | undefined {
  const t = norm(target.split("#")[0]);
  return (
    files.find((f) => norm(f.path) === t || norm(stem(f.path)) === t) ??
    files.find((f) => norm(f.name) === t || norm(stem(f.name)) === t)
  );
}

/** Names offered by `[[` completion. */
export const linkNames = (files: Entry[]) => [...new Set(files.map((f) => stem(f.name)))].sort();

export interface Backlink {
  path: string;
  line: string;
}

/** Markdown files linking to `target` with a wiki link or a relative Markdown link. */
export function backlinks(target: Entry, docs: [string, string][], files: Entry[]): Backlink[] {
  const out: Backlink[] = [];
  for (const [path, text] of docs) {
    if (path === target.path) continue;
    const lines = text.split("\n");
    const hit = lines.find((l) => {
      for (const m of l.matchAll(WIKI)) if (resolveWiki(m[1], files)?.path === target.path) return true;
      for (const m of l.matchAll(/\]\((?:<([^>\n]+)>|([^)\s]+))/g)) if (resolveRel(path, m[1] ?? m[2]) === target.path) return true;
      return false;
    });
    if (hit !== undefined) out.push({ path, line: hit.replace(/^\s*[-*+]\s+(\[.\]\s+)?|^#+\s+/, "").trim() });
  }
  return out;
}

/** Workspace path of a relative link written in the file at `from`. */
export function resolveRel(from: string, href: string) {
  if (/^[a-z]+:/i.test(href) || href.startsWith("#")) return "";
  const parts = parentOf(from).split("/").filter(Boolean);
  let h: string;
  try {
    h = decodeURIComponent(href.split("#")[0]);
  } catch {
    h = href;
  }
  for (const seg of h.split("/")) {
    if (seg === "..") parts.pop();
    else if (seg && seg !== ".") parts.push(seg);
  }
  return parts.join("/");
}
