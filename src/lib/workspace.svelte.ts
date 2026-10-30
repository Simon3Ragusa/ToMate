// Per-workspace configuration, stored in `.board/config.json` inside the
// workspace folder. It is plain, documented JSON on purpose: the Settings
// page edits it, and so can the user (or their AI agent) by hand.
// Unknown keys are kept, so agents can add their own.

import { api } from "./api";

const FILE = ".board/config.json";

export interface WorkspaceConfig {
  version: 1;
  weeks: {
    /** Weekday a new week starts on: 0 = Sunday … 6 = Saturday. */
    startDay: number;
    /** Days per week (7 for weekly rhythms, 14 for sprints). */
    length: number;
    /** Prefix of week ids and week folders: "W" gives W1, W2… */
    prefix: string;
  };
  log: {
    /** Workspace-relative log file whose `## [YYYY-MM-DD] [TAG] Title` headings feed weeks and reports. */
    file: string;
  };
  modules: {
    focus: boolean;
    notch: boolean;
    findings: boolean;
    platform: boolean;
  };
  [extra: string]: unknown;
}

export const DEFAULTS: WorkspaceConfig = {
  version: 1,
  weeks: { startDay: 1, length: 7, prefix: "W" },
  log: { file: "log.md" },
  modules: { focus: true, notch: true, findings: false, platform: true },
};

const clampInt = (v: unknown, lo: number, hi: number, d: number) => {
  const n = Math.round(Number(v));
  return Number.isFinite(n) ? Math.min(hi, Math.max(lo, n)) : d;
};

/** Fill gaps and fix out-of-range values, keeping any extra keys. */
export function normalize(raw: unknown): WorkspaceConfig {
  const r = (raw && typeof raw === "object" ? raw : {}) as Record<string, any>;
  const prefix = typeof r.weeks?.prefix === "string" && /^[A-Za-z]{0,6}$/.test(r.weeks.prefix) ? r.weeks.prefix : DEFAULTS.weeks.prefix;
  const file = typeof r.log?.file === "string" && r.log.file.trim() && !/\.\.|^[\\/]|:/.test(r.log.file) ? r.log.file.trim() : DEFAULTS.log.file;
  const mod = (k: keyof WorkspaceConfig["modules"]) => (typeof r.modules?.[k] === "boolean" ? r.modules[k] : DEFAULTS.modules[k]);
  return {
    ...r,
    version: 1,
    weeks: { startDay: clampInt(r.weeks?.startDay, 0, 6, DEFAULTS.weeks.startDay), length: clampInt(r.weeks?.length, 1, 28, 7), prefix },
    log: { file },
    modules: { focus: mod("focus"), notch: mod("notch"), findings: mod("findings"), platform: mod("platform") },
  };
}

class Workspace {
  config = $state<WorkspaceConfig>(structuredClone(DEFAULTS));
  /** True for a folder ToMate has never set up: the first-run setup is shown. */
  needsSetup = $state(false);

  /**
   * Load the config. A folder that already has ToMate data but no config
   * (created by an older version) gets one inferred from its saved weeks,
   * so nothing changes for it; a brand-new folder asks for setup.
   */
  async load() {
    this.needsSetup = false;
    try {
      this.config = normalize(JSON.parse(await api.readText(FILE)));
      return;
    } catch {
      /* no config yet */
    }
    const weeks = await api.readText(".board/weeks.json").then(JSON.parse, () => null);
    if (weeks?.weeks?.length) {
      const last = weeks.weeks.at(-1);
      const startDay = new Date(last.start + "T12:00:00").getDay();
      this.config = normalize({ weeks: { startDay, length: 7, prefix: "W" } });
      await this.save();
    } else {
      this.config = structuredClone(DEFAULTS);
      this.needsSetup = true;
    }
  }

  async save(next: WorkspaceConfig = this.config) {
    this.config = normalize(next);
    await api.createDir(".board").catch(() => {});
    await api.writeText(FILE, JSON.stringify(this.config, null, 2) + "\n");
  }

  /** Change part of the config and save it. */
  update(fn: (c: WorkspaceConfig) => void) {
    const c = structuredClone($state.snapshot(this.config)) as WorkspaceConfig;
    fn(c);
    return this.save(c);
  }
}

export const workspace = new Workspace();

export const WEEKDAYS = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];
