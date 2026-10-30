// Findings from a digest feed: validation of exported digests and merging them
// into the local archive. Pure functions (no I/O), so they can be tested.
//
// Digest files (`YYYY-MM-DD.json`) follow schema v1 (documented in
// AGENTS.md). Their content is untrusted: every field is type- and
// length-checked, links must be http(s), and text is only ever rendered as
// text, never as HTML.

export const SCHEMA_VERSION = 1;

export interface Visual {
  url: string;
  label: string | null;
  source: string | null;
}

/** Source metadata of one finding, as exported (never edited locally). */
export interface Finding {
  id: string;
  title: string;
  url: string | null;
  published: string | null;
  type: string;
  section: string;
  summary: string;
  relevance: string;
  limitations: string;
  evidence: string;
  /** Relevance 0–10 as estimated by the feed's model; null when missing (never 0 by default). */
  score: number | null;
  visual: Visual | null;
}

/** A finding in the local archive, with the digests it appeared in. */
export interface Stored extends Finding {
  digests: string[]; // digest dates
  firstSeen: string; // ISO time of first import
}

export interface DigestInfo {
  date: string;
  status: string; // "prepared" | "delivered" | other future values, shown as-is
  generatedAt: string | null;
  evidenceBasis: string | null;
  count: number;
}

export interface Archive {
  version: 1;
  records: Record<string, Stored>;
  digests: Record<string, DigestInfo>;
  lastImport: string | null;
}

export const emptyArchive = (): Archive => ({ version: 1, records: {}, digests: {}, lastImport: null });

export type ReadStatus = "unread" | "read" | "saved" | "archived";
/** User-owned state, kept apart from the archive so re-imports never touch it. */
export interface UserState {
  status: ReadStatus;
  note?: string; // workspace path of the linked note
  updated: string;
}

const LIMITS = { id: 300, title: 600, type: 40, section: 40, summary: 6000, relevance: 4000, limitations: 4000, evidence: 8000, label: 300 };

const str = (v: unknown, max: number): string | null => {
  if (typeof v !== "string") return null;
  const s = v.trim();
  return s ? s.slice(0, max) : null;
};

/** Only absolute http(s) URLs survive; anything else (javascript:, file:, relative) is dropped. */
export function safeUrl(v: unknown): string | null {
  if (typeof v !== "string" || v.length > 2000) return null;
  try {
    const u = new URL(v);
    return u.protocol === "https:" || u.protocol === "http:" ? u.href : null;
  } catch {
    return null;
  }
}

/** Dates may be plain days or full ISO timestamps; keep anything Date can parse. */
function safeDate(v: unknown): string | null {
  if (typeof v !== "string" || v.length > 40) return null;
  return Number.isNaN(Date.parse(v)) ? null : v;
}

function item(raw: unknown): Finding | string {
  if (!raw || typeof raw !== "object") return "not an object";
  const r = raw as Record<string, unknown>;
  const id = str(r.id, LIMITS.id);
  const title = str(r.title, LIMITS.title);
  if (!id) return "missing id";
  if (!title) return `${id}: missing title`;
  let score: number | null = null;
  // `score` is the field name; `thesis_score` is accepted as an older alias.
  const rawScore = r.score ?? r.thesis_score;
  if (rawScore !== null && rawScore !== undefined) {
    const n = Number(rawScore);
    if (!Number.isFinite(n) || n < 0 || n > 10) return `${id}: score out of range`;
    score = n;
  }
  let visual: Visual | null = null;
  if (r.visual && typeof r.visual === "object") {
    const v = r.visual as Record<string, unknown>;
    const url = safeUrl(v.url);
    if (url) visual = { url, label: str(v.label, LIMITS.label), source: safeUrl(v.source) };
  }
  return {
    id,
    title,
    url: safeUrl(r.url),
    published: safeDate(r.published),
    type: str(r.type, LIMITS.type) ?? "unknown",
    section: str(r.section, LIMITS.section) ?? "unknown",
    summary: str(r.summary, LIMITS.summary) ?? "",
    relevance: str(r.relevance, LIMITS.relevance) ?? "",
    limitations: str(r.limitations, LIMITS.limitations) ?? "",
    evidence: str(r.evidence, LIMITS.evidence) ?? "",
    score,
    visual,
  };
}

export interface ParsedDigest {
  info: DigestInfo;
  items: Finding[];
  /** Records that failed validation, with the reason. */
  rejected: string[];
}

/** Validate one digest file. Throws with a readable reason when the whole file is unusable. */
export function parseDigest(fileName: string, text: string): ParsedDigest {
  let env: Record<string, unknown>;
  try {
    env = JSON.parse(text);
  } catch {
    throw new Error(`${fileName}: not valid JSON`);
  }
  if (!env || typeof env !== "object") throw new Error(`${fileName}: not a digest object`);
  if (env.schema_version !== SCHEMA_VERSION) {
    throw new Error(`${fileName}: schema version ${String(env.schema_version)} is not supported (this app reads v${SCHEMA_VERSION}; update ToMate)`);
  }
  const date = str(env.digest_date, 10);
  if (!date || !/^\d{4}-\d{2}-\d{2}$/.test(date)) throw new Error(`${fileName}: missing or malformed digest_date`);
  if (!Array.isArray(env.items)) throw new Error(`${fileName}: items is not a list`);
  const items: Finding[] = [];
  const rejected: string[] = [];
  const seen = new Set<string>();
  for (const raw of env.items.slice(0, 200)) {
    const r = item(raw);
    if (typeof r === "string") rejected.push(r);
    else if (seen.has(r.id)) rejected.push(`${r.id}: duplicate in this digest`);
    else (seen.add(r.id), items.push(r));
  }
  return {
    info: {
      date,
      status: str(env.status, 30) ?? "unknown",
      generatedAt: safeDate(env.generated_at),
      evidenceBasis: str(env.evidence_basis, 60),
      count: items.length,
    },
    items,
    rejected,
  };
}

/**
 * Merge digests into the archive, upserting by canonical id. Source fields
 * take the newest digest's values; digest membership accumulates. Records
 * are never deleted here: a digest missing from the folder is not a reason
 * to drop what was imported before.
 */
export function merge(archive: Archive, digests: ParsedDigest[], now = new Date().toISOString()): { archive: Archive; added: number; updated: number } {
  const out: Archive = { ...archive, records: { ...archive.records }, digests: { ...archive.digests }, lastImport: now };
  let added = 0;
  let updated = 0;
  for (const d of [...digests].sort((a, b) => a.info.date.localeCompare(b.info.date))) {
    out.digests[d.info.date] = d.info;
    for (const f of d.items) {
      const prev = out.records[f.id];
      if (!prev) {
        out.records[f.id] = { ...f, digests: [d.info.date], firstSeen: now };
        added++;
      } else {
        const newer = d.info.date >= (prev.digests.at(-1) ?? "");
        const digestsList = [...new Set([...prev.digests, d.info.date])].sort();
        const next: Stored = newer ? { ...f, digests: digestsList, firstSeen: prev.firstSeen } : { ...prev, digests: digestsList };
        if (JSON.stringify(next) !== JSON.stringify(prev)) updated++;
        out.records[f.id] = next;
      }
    }
  }
  return { archive: out, added, updated };
}

/** Findings that appeared in a digest within [start, end] (YYYY-MM-DD), most relevant first. */
export const inRange = (records: Stored[], start: string, end: string) =>
  records
    .filter((f) => f.digests.some((d) => d >= start && d <= end))
    .sort((a, b) => (b.score ?? -1) - (a.score ?? -1) || a.title.localeCompare(b.title));

/** Digest files in a folder listing: `YYYY-MM-DD.json` (the index file is not needed). */
export const isDigestFile = (name: string) => /^\d{4}-\d{2}-\d{2}\.json$/i.test(name);
