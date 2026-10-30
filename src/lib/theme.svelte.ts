// Appearance settings: light/dark/system and per-palette colour overrides.
// Stored in localStorage (an app preference, not part of the workspace)
// and applied as CSS custom properties on <html>, so every view and the
// notch window follow them live.

export type Mode = "system" | "light" | "dark";
export type Scheme = "light" | "dark";

export interface Token {
  key: string; // CSS custom property
  label: string;
}
export interface Group {
  title: string;
  tokens: Token[];
}

export const GROUPS: Group[] = [
  {
    title: "Interface",
    tokens: [
      { key: "--accent", label: "Accent" },
      { key: "--bg", label: "Page background" },
      { key: "--panel", label: "Cards and panels" },
      { key: "--sidebar", label: "Sidebar and tab bar" },
      { key: "--border", label: "Borders" },
      { key: "--text", label: "Text" },
      { key: "--muted", label: "Secondary text" },
      { key: "--danger", label: "Errors and warnings" },
      { key: "--bar", label: "Bars and tracks" },
      { key: "--canvas-bg", label: "Slide and PDF backdrop" },
    ],
  },
  {
    title: "Writing",
    tokens: [
      { key: "--code-bg", label: "Code background" },
      { key: "--code-text", label: "Code text" },
    ],
  },
  {
    title: "Calendar",
    tokens: [
      { key: "--ev-meeting", label: "Meetings" },
      { key: "--ev-deadline", label: "Deadlines" },
      { key: "--ev-other", label: "Other events" },
    ],
  },
  {
    title: "Log tags",
    tokens: [
      { key: "--tag-idea", label: "IDEA" },
      { key: "--tag-exp", label: "EXP" },
      { key: "--tag-decision", label: "DECISION" },
      { key: "--tag-recap", label: "RECAP" },
    ],
  },
  {
    title: "File types",
    tokens: [
      { key: "--k-md", label: "Markdown" },
      { key: "--k-pdf", label: "PDF" },
      { key: "--k-ppt", label: "Slides" },
      { key: "--k-xls", label: "Spreadsheets" },
      { key: "--k-doc", label: "Word" },
      { key: "--k-img", label: "Images" },
      { key: "--k-txt", label: "Text and other" },
    ],
  },
  {
    title: "Focus timer",
    tokens: [
      { key: "--focus", label: "Focus" },
      { key: "--break", label: "Break" },
      { key: "--notch-bg", label: "Notch background" },
    ],
  },
];

/** Accent presets: a light and a dark variant each. */
export const ACCENTS: { name: string; light: string; dark: string }[] = [
  { name: "Blue", light: "#2f55d4", dark: "#7e9cff" },
  { name: "Indigo", light: "#5145cd", dark: "#9d94ff" },
  { name: "Violet", light: "#8a3fc7", dark: "#c193f2" },
  { name: "Rose", light: "#c73a6b", dark: "#f28aae" },
  { name: "Orange", light: "#c25a12", dark: "#f5a060" },
  { name: "Green", light: "#2f7d4f", dark: "#6cc495" },
  { name: "Teal", light: "#137a84", dark: "#5cc6cf" },
  { name: "Graphite", light: "#4a4a48", dark: "#b4b3ae" },
];

interface Stored {
  mode: Mode;
  light: Record<string, string>;
  dark: Record<string, string>;
}

const KEY = "tomate.theme";
const ALL = GROUPS.flatMap((g) => g.tokens.map((t) => t.key));

function read(): Stored {
  try {
    const s = JSON.parse(localStorage.getItem(KEY) ?? "");
    return { mode: s.mode ?? "system", light: s.light ?? {}, dark: s.dark ?? {} };
  } catch {
    return { mode: "system", light: {}, dark: {} };
  }
}

class Theme {
  mode = $state<Mode>("system");
  light = $state<Record<string, string>>({});
  dark = $state<Record<string, string>>({});
  /** The palette in effect right now. */
  scheme = $state<Scheme>("light");
  /** Bumped after each apply, so views can re-read computed colours. */
  version = $state(0);

  private media = typeof matchMedia === "function" ? matchMedia("(prefers-color-scheme: dark)") : null;

  init() {
    Object.assign(this, read());
    this.apply();
    this.media?.addEventListener("change", () => this.apply());
    // Another window (the notch) changed the settings: follow along.
    addEventListener("storage", (e) => {
      if (e.key !== KEY) return;
      Object.assign(this, read());
      this.apply();
    });
  }

  get overrides() {
    return this.scheme === "dark" ? this.dark : this.light;
  }

  setMode(m: Mode) {
    this.mode = m;
    this.save();
  }

  /** Set a colour of the palette in effect (null resets it to the default). */
  set(key: string, value: string | null) {
    const o = { ...this.overrides };
    if (value) o[key] = value;
    else delete o[key];
    if (this.scheme === "dark") this.dark = o;
    else this.light = o;
    this.save();
  }

  setAccent(a: { light: string; dark: string }) {
    this.light = { ...this.light, "--accent": a.light };
    this.dark = { ...this.dark, "--accent": a.dark };
    this.save();
  }

  resetScheme() {
    if (this.scheme === "dark") this.dark = {};
    else this.light = {};
    this.save();
  }

  /** Current value of a colour as #rrggbb (resolving defaults like `var(--accent)`). */
  hex(key: string): string {
    this.version;
    const probe = document.createElement("span");
    probe.style.color = `var(${key})`;
    probe.style.display = "none";
    document.body.appendChild(probe);
    const rgb = getComputedStyle(probe).color;
    probe.remove();
    const m = rgb.match(/\d+(\.\d+)?/g);
    if (!m) return "#000000";
    return "#" + m.slice(0, 3).map((n) => Math.round(Number(n)).toString(16).padStart(2, "0")).join("");
  }

  private save() {
    try {
      localStorage.setItem(KEY, JSON.stringify({ mode: this.mode, light: this.light, dark: this.dark }));
    } catch {
      /* storage unavailable: settings last for this session */
    }
    this.apply();
  }

  private apply() {
    const root = document.documentElement;
    if (this.mode === "system") delete root.dataset.theme;
    else root.dataset.theme = this.mode;
    this.scheme = this.mode === "system" ? (this.media?.matches ? "dark" : "light") : this.mode;
    for (const k of ALL) root.style.removeProperty(k);
    for (const [k, v] of Object.entries(this.overrides)) root.style.setProperty(k, v);
    this.version++;
  }
}

export const theme = new Theme();
