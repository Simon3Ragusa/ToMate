# ToMate for AI agents

This file is for AI coding agents (Claude, Codex, Copilot and others) that help a user customize ToMate. Read it before changing anything.

ToMate is meant to be a **skeleton**: a workspace model, a file layer, a week model and a design system. Users shape everything around it with their agents. Prefer the lightest layer that does the job:

1. **Configuration.** Edit `.board/config.json` in the user's workspace. No rebuild.
2. **Theme.** Colours and logo live in the app's Settings, and the design tokens are in `src/app.css` (see [docs/DESIGN.md](docs/DESIGN.md)).
3. **Code.** Change the app itself, following the rules below. This needs a rebuild.

## 1. Workspace configuration (`.board/config.json`)

Plain JSON, created on first open. ToMate reads it on every workspace open and normalizes it: bad values are clamped, and **unknown keys are preserved**, so you may add your own keys for your own features.

```json
{
  "version": 1,
  "weeks": { "startDay": 1, "length": 7, "prefix": "W" },
  "log": { "file": "log.md" },
  "modules": { "focus": true, "notch": true, "findings": false, "platform": true }
}
```

| Key | Meaning |
|---|---|
| `weeks.startDay` | Weekday new weeks start on, 0 = Sunday … 6 = Saturday |
| `weeks.length` | Days per week: 7, or 14 for sprints (1–28 allowed) |
| `weeks.prefix` | Week ids and week folder names: `W` gives `W1/`, `W2/`… (letters only, max 6) |
| `log.file` | Workspace-relative Markdown file. Its `## [YYYY-MM-DD] [TAG] Title` headings feed the week page and the report |
| `modules.*` | Turn sidebar features on or off |

Explicit week dates (after the user edits them on a week page) are kept in `.board/weeks.json` as `{"weeks":[{"id","start","end"}]}`. Later weeks are generated from the rule above.

Other workspace data, all plain files:

| File | Format |
|---|---|
| `.board/events.json` | calendar events `[{id, date, title, kind, time?}]` |
| `.board/pins.json` | pinned paths `["W3/notes.md", …]` |
| `.board/focus.jsonl` | one focus block per line `{start, end, minutes, topic}` |
| `.board/findings/` | imported findings archive, plus the user's own status and notes |
| `.board/cache/` | rebuildable caches; never edit, safe to delete |

Notes are ordinary Markdown in `Notes/` with optional front matter (`date:`, `type: meeting | note | report | finding`). Tasks are Markdown checkboxes in any file.

### Digest feed format (Findings module)

The Findings page reads `YYYY-MM-DD.json` files, either from a local folder or from `data/findings/` in a GitHub repository (fetched with the user's own git login). Schema v1:

```json
{
  "schema_version": 1,
  "digest_date": "2026-01-15",
  "generated_at": "2026-01-15T07:00:00Z",
  "status": "delivered",
  "evidence_basis": "abstract_or_feed_excerpt",
  "items": [
    {
      "id": "arxiv:0000.00000",
      "title": "…", "url": "https://…", "published": "2026-01-14",
      "type": "Preprint", "section": "Main",
      "summary": "…", "relevance": "…", "limitations": "…", "evidence": "…",
      "score": 7,
      "visual": { "url": "https://…/figure.png", "label": "Figure 1", "source": "https://…" }
    }
  ]
}
```

`score` (0–10) and `visual` may be `null`. Content is untrusted: ToMate validates every field, keeps only `http(s)` links and renders all text as plain text. The user's read/saved/archived marks and notes are stored separately, so re-imports never overwrite them.

## 2. Architecture

- **Desktop shell:** Tauri 2 (Rust) in `src-tauri/`. All file access goes through commands in `src-tauri/src/fs_cmds.rs`. Paths are workspace-relative and checked by `Workspace::resolve` (no `..`, no absolute paths). Deletes go to the Recycle Bin. A watcher (`watch.rs`) emits `fs-change` and appends to `.board/activity.jsonl`.
- **UI:** SvelteKit with Svelte 5 runes, a static SPA, in `src/`.
  - `src/lib/state.svelte.ts` — app state: workspace, folder cache, tabs (with a VS Code-style preview tab), pins, views, toasts, `app.run(fn, "Couldn't …")` for errors
  - `src/lib/workspace.svelte.ts` — the config above
  - `src/lib/weeks.ts`, `calendar.ts`, `report.ts`, `markdown.ts`, `links.ts`, `search.svelte.ts` — pure-ish logic, the place for new behaviour
  - `src/lib/components/*` — pages and widgets; `src/lib/viewers/*` — file viewers
  - `src/routes/+page.svelte` — the shell; also renders the notch window at `/#notch`

## 3. Rules for code changes

1. **Use the design tokens.** Radii `--r-sm/--r/--r-lg/--r-xl`, motion `--ease`, `--ease-spring` (only for things that open), `--dur`, colours `--bg --panel --text --muted --accent …`. Never hard-code colours or radii. Floating panels use the global `surface` class.
2. **User files are sacred.** Read and write only through `api.*` with workspace-relative paths. Never delete user files except through `api.delete` (Recycle Bin), and only when the user asks. App data goes in `.board/`.
3. **Errors are sentences.** Wrap actions in `app.run(fn, "Couldn't <action>")`. `src/lib/errors.ts` turns OS errors into plain words.
4. **External content is untrusted.** Render it as text, allow only `http(s)` links, validate schemas (see `src/lib/findings.ts`).
5. **Keep the core small.** A new feature should be a module: its own component and store, a `modules.<name>` switch in the config, and a sidebar entry gated on it.
6. **Check before you finish:** `npm run check` must report 0 errors; build with `npm run tauri build`.
7. **Prefer configuration over forks.** If a user's wish can be a config key, add the key (with a default, in `normalize`) rather than special-casing their workflow in code.
