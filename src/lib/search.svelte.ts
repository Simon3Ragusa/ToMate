// Full-text index of the workspace: Markdown/text, PDF pages, slides and Word
// documents. Extracted text is cached in `.board/cache/search-index.json` and
// refreshed incrementally, keyed by each file's modification time.

import { api, type Entry } from "./api";
import { kindOf } from "./fileTypes";

const INDEX_FILE = ".board/cache/search-index.json";
const MAX_BYTES = 40 * 1024 * 1024;

/** One searchable chunk: a whole note, a PDF page or a slide. */
export interface Part {
  label: string; // "", "p. 3", "slide 4"
  text: string;
}
interface Doc {
  modified: number;
  parts: Part[];
}
export interface Hit {
  label: string;
  snippet: string;
  start: number; // match offset inside the snippet
  len: number;
}
export interface Result {
  entry: Entry;
  hits: Hit[];
  count: number;
  nameMatch: boolean;
}

const indexable = (e: Entry) => {
  const k = kindOf(e.name);
  if (e.size > MAX_BYTES) return false;
  if (k === "slides") return /\.pptx$/i.test(e.name);
  return k === "markdown" || k === "text" || k === "pdf" || k === "doc";
};

async function extract(e: Entry): Promise<Part[]> {
  const k = kindOf(e.name);
  if (k === "markdown" || k === "text") return [{ label: "", text: await api.readText(e.path) }];
  if (k === "doc") {
    const mammoth = await import("mammoth");
    const b = await api.readBytes(e.path);
    return [{ label: "", text: (await mammoth.extractRawText({ arrayBuffer: b.buffer as ArrayBuffer })).value }];
  }
  if (k === "slides") {
    const JSZip = (await import("jszip")).default;
    const zip = await JSZip.loadAsync(await api.readBytes(e.path));
    const num = (n: string) => Number(/(\d+)\.xml$/.exec(n)?.[1] ?? 0);
    const slides = Object.keys(zip.files)
      .filter((n) => /^ppt\/slides\/slide\d+\.xml$/.test(n))
      .sort((a, b) => num(a) - num(b));
    const parts: Part[] = [];
    for (const n of slides) {
      const xml = await zip.file(n)!.async("string");
      const notes = await zip.file(`ppt/notesSlides/notesSlide${num(n)}.xml`)?.async("string");
      parts.push({ label: `slide ${num(n)}`, text: [xmlText(xml), notes ? xmlText(notes) : ""].filter(Boolean).join("\n") });
    }
    return parts;
  }
  // PDF: one part per page.
  const pdfjs = await import("pdfjs-dist");
  if (!pdfjs.GlobalWorkerOptions.workerSrc) {
    pdfjs.GlobalWorkerOptions.workerSrc = (await import("pdfjs-dist/build/pdf.worker.min.mjs?url")).default;
  }
  const doc = await pdfjs.getDocument({ data: await api.readBytes(e.path), isEvalSupported: false }).promise;
  try {
    const parts: Part[] = [];
    for (let i = 1; i <= doc.numPages; i++) {
      const tc = await (await doc.getPage(i)).getTextContent();
      const text = tc.items.map((it) => ("str" in it ? it.str + (it.hasEOL ? "\n" : "") : "")).join("");
      parts.push({ label: `p. ${i}`, text });
    }
    return parts;
  } finally {
    doc.destroy();
  }
}

/** Text runs of a DrawingML part, one paragraph per line. */
function xmlText(xml: string) {
  return xml
    .split(/<\/a:p>/)
    .map((p) => [...p.matchAll(/<a:t>([^<]*)<\/a:t>/g)].map((m) => m[1]).join(""))
    .filter((l) => l.trim())
    .join("\n")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'")
    .replace(/&amp;/g, "&");
}

class SearchIndex {
  docs: Record<string, Doc> = {};
  files: Entry[] = [];
  /** Files still to (re)extract in the current pass; 0 when the index is current. */
  pending = $state(0);
  /** Bumped when the index content changes. */
  version = $state(0);
  private loaded = false;
  private running: Promise<void> | null = null;
  private again = false;

  /** Bring the index up to date with the workspace (coalesces concurrent calls). */
  update(): Promise<void> {
    if (this.running) {
      this.again = true;
      return this.running;
    }
    this.running = this.pass().finally(() => {
      this.running = null;
      if (this.again) {
        this.again = false;
        this.update();
      }
    });
    return this.running;
  }

  reset() {
    clearTimeout(this.persistTimer);
    this.docs = {};
    this.files = [];
    this.loaded = false;
    this.version++;
  }

  private async pass() {
    if (!this.loaded) {
      this.loaded = true;
      try {
        this.docs = JSON.parse(await api.readText(INDEX_FILE));
      } catch {
        this.docs = {};
      }
    }
    this.files = await api.listAll();
    const live = new Set(this.files.map((f) => f.path));
    let changed = false;
    for (const p of Object.keys(this.docs)) {
      if (!live.has(p)) (delete this.docs[p], (changed = true));
    }
    const todo = this.files.filter((f) => indexable(f) && this.docs[f.path]?.modified !== f.modified);
    this.pending = todo.length;
    for (const f of todo) {
      try {
        this.docs[f.path] = { modified: f.modified, parts: await extract(f) };
      } catch {
        this.docs[f.path] = { modified: f.modified, parts: [] }; // unreadable: don't retry until it changes
      }
      changed = true;
      this.pending--;
      if (this.pending % 5 === 0) this.version++;
    }
    if (changed) {
      this.version++;
      this.persist();
    }
  }

  /** Write the cache at most every few seconds (saves while typing re-index often). */
  private persistTimer: ReturnType<typeof setTimeout> | undefined;
  private persist() {
    clearTimeout(this.persistTimer);
    this.persistTimer = setTimeout(() => api.writeText(INDEX_FILE, JSON.stringify(this.docs)).catch(() => {}), 5000);
  }

  /** Files whose text (or name) contains every query word; exact phrase hits first. */
  search(q: string, limit = 60): Result[] {
    const query = q.trim().toLowerCase();
    const words = query.split(/\s+/).filter(Boolean);
    if (!words.length) return [];
    const byPath = new Map(this.files.map((f) => [f.path, f]));
    const out: (Result & { score: number })[] = [];
    for (const f of this.files) {
      const nameMatch = words.every((w) => f.path.toLowerCase().includes(w));
      const doc = this.docs[f.path];
      const hits: Hit[] = [];
      let count = 0;
      let phrase = 0;
      for (const part of doc?.parts ?? []) {
        const low = part.text.toLowerCase();
        if (!words.every((w) => low.includes(w))) continue;
        // Highlight the phrase when present, else the first word.
        const needle = low.includes(query) ? query : words[0];
        if (needle === query) phrase++;
        let i = low.indexOf(needle);
        while (i >= 0) {
          count++;
          if (hits.length < 4) hits.push(snippet(part, i, needle.length));
          i = low.indexOf(needle, i + needle.length);
        }
      }
      if (!count && !nameMatch) continue;
      out.push({ entry: byPath.get(f.path)!, hits, count, nameMatch, score: (nameMatch ? 1000 : 0) + phrase * 50 + count });
    }
    return out.sort((a, b) => b.score - a.score || b.entry.modified - a.entry.modified).slice(0, limit);
  }

  /** Markdown text by path (for backlinks). */
  markdown(): [string, string][] {
    return Object.entries(this.docs)
      .filter(([p]) => /\.(md|markdown)$/i.test(p))
      .map(([p, d]) => [p, d.parts[0]?.text ?? ""]);
  }
}

function snippet(part: Part, i: number, len: number): Hit {
  const from = Math.max(0, i - 70);
  const to = Math.min(part.text.length, i + len + 90);
  const pre = (from > 0 ? "…" : "") + part.text.slice(from, i);
  const text = (pre + part.text.slice(i, to) + (to < part.text.length ? "…" : "")).replace(/\s+/g, " ");
  // Whitespace collapsing shifts offsets: recompute from the collapsed prefix.
  const start = pre.replace(/\s+/g, " ").length;
  return { label: part.label, snippet: text, start, len: part.text.slice(i, i + len).replace(/\s+/g, " ").length };
}

export const index = new SearchIndex();
