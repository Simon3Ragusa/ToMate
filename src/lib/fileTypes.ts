import { extOf } from "./api";

export type Kind = "markdown" | "pdf" | "slides" | "sheet" | "doc" | "image" | "text" | "other";

const byExt: Record<string, Kind> = {
  md: "markdown", markdown: "markdown",
  pdf: "pdf",
  pptx: "slides", ppt: "slides", potx: "slides",
  xlsx: "sheet", xls: "sheet", xlsm: "sheet", csv: "sheet", tsv: "sheet",
  docx: "doc",
  png: "image", jpg: "image", jpeg: "image", gif: "image", webp: "image", svg: "image", bmp: "image",
  txt: "text", json: "text", jsonl: "text", yaml: "text", yml: "text", toml: "text", py: "text",
  ts: "text", js: "text", rs: "text", tex: "text", bib: "text", log: "text", ini: "text", html: "text", css: "text",
};

export const kindOf = (name: string): Kind => byExt[extOf(name)] ?? "other";

/** Short label + tint used by file icons. */
export const kindStyle: Record<Kind, { label: string; tint: string }> = {
  markdown: { label: "MD", tint: "var(--k-md)" },
  pdf: { label: "PDF", tint: "var(--k-pdf)" },
  slides: { label: "PPT", tint: "var(--k-ppt)" },
  sheet: { label: "XLS", tint: "var(--k-xls)" },
  doc: { label: "DOC", tint: "var(--k-doc)" },
  image: { label: "IMG", tint: "var(--k-img)" },
  text: { label: "TXT", tint: "var(--k-txt)" },
  other: { label: "FILE", tint: "var(--k-txt)" },
};

export const mimeOf = (name: string) => {
  const e = extOf(name);
  return e === "svg" ? "image/svg+xml" : e === "jpg" ? "image/jpeg" : `image/${e}`;
};

export const fmtSize = (n: number) =>
  n < 1024 ? `${n} B` : n < 1024 ** 2 ? `${(n / 1024).toFixed(0)} KB` : `${(n / 1024 ** 2).toFixed(1)} MB`;

export const fmtDate = (ms: number) => {
  const d = new Date(ms);
  const today = new Date();
  const sameDay = d.toDateString() === today.toDateString();
  return sameDay
    ? d.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })
    : d.toLocaleDateString([], { day: "numeric", month: "short", year: d.getFullYear() === today.getFullYear() ? undefined : "numeric" });
};
