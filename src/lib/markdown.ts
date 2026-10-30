import MarkdownIt from "markdown-it";
import taskLists from "markdown-it-task-lists";
import katex from "@vscode/markdown-it-katex";
import { wikiLinks } from "./links";

// CommonJS plugins: unwrap `default` when the bundler hasn't already.
const plugin = (m: any) => m.default ?? m;

const md = new MarkdownIt({ html: false, linkify: true, typographer: true })
  .use(plugin(katex), { throwOnError: false })
  .use(plugin(taskLists), { enabled: true, label: true })
  .use(wikiLinks);

// Tag each block with its source line, so a double-click can jump the editor there.
md.core.ruler.push("source_lines", (state) => {
  for (const t of state.tokens) if (t.map && t.nesting === 1) t.attrSet("data-line", String(t.map[0]));
});

const FRONT = /^---\r?\n([\s\S]*?)\r?\n---\r?\n?/;

/** Simple `key: value` front matter (no nesting), as used by notes. */
export function frontMatter(src: string): { meta: Record<string, string>; body: string } {
  const m = FRONT.exec(src);
  if (!m) return { meta: {}, body: src };
  const meta: Record<string, string> = {};
  for (const line of m[1].split(/\r?\n/)) {
    const i = line.indexOf(":");
    if (i > 0) meta[line.slice(0, i).trim().toLowerCase()] = line.slice(i + 1).trim();
  }
  return { meta, body: src.slice(m[0].length) };
}

export const renderMarkdown = (src: string) => md.render(frontMatter(src).body);

/** Lines taken by the front matter: add to a rendered `data-line` to get the source line. */
export const bodyLineOffset = (src: string) => {
  const body = frontMatter(src).body;
  return src.slice(0, src.length - body.length).split("\n").length - 1;
};

const TASK = /^(\s*(?:[-*+]|\d+[.)])\s+)\[([ xX])\]/;

/** Line indexes of task items, skipping fenced code (same order as rendered). */
export function taskLines(src: string): number[] {
  const out: number[] = [];
  let fence = false;
  src.split("\n").forEach((line, i) => {
    if (/^\s*(```|~~~)/.test(line)) fence = !fence;
    else if (!fence && TASK.test(line)) out.push(i);
  });
  return out;
}

/** Flip the n-th task checkbox in the source. */
export function toggleTask(src: string, n: number): string {
  const lines = src.split("\n");
  const i = taskLines(src)[n];
  if (i === undefined) return src;
  lines[i] = lines[i].replace(TASK, (_, pre, mark) => `${pre}[${mark === " " ? "x" : " "}]`);
  return lines.join("\n");
}

export interface Task {
  text: string;
  done: boolean;
  line: number;
}

/** All tasks of a document with their text (markdown markers stripped). */
export function extractTasks(src: string): Task[] {
  const lines = src.split("\n");
  return taskLines(src).map((i) => ({
    line: i,
    done: TASK.exec(lines[i])![2] !== " ",
    text: lines[i].replace(TASK, "").replace(/[*_`]/g, "").trim(),
  }));
}
