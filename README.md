# ToMate

A local-first workspace for any folder. Open a folder and ToMate gives you a file tree with tabs, viewers for Markdown, PDF, slides, spreadsheets and Word files, a week-by-week view of your work, notes and a calendar, full-text search, `[[wiki links]]` and a focus timer. Your files stay plain files where they are. There's no account and no server.

> **Status: early alpha.** Windows and macOS builds are supported. Expect rough edges, and please report them.

## Why

Most tools want you to move your work into them. ToMate works on the folder you already have, synced by OneDrive, Dropbox or nothing at all, and keeps its own data in a small `.board/` folder next to your files.

It is also meant to be **made yours**. The core is a small skeleton: a workspace, its files, its weeks, a design system. Everything around it is either configuration you (or your AI agent) can edit as plain JSON, or code that is documented for agents to change safely. See [AGENTS.md](AGENTS.md) and [docs/DESIGN.md](docs/DESIGN.md).

## Features

- **Files:** a tree with drag-and-drop, preview and kept tabs (VS Code style), pins, quick open (`Ctrl P` / `⌘P`)
- **Viewers:** Markdown (read, split and edit; math, Mermaid, task lists), PDF, PowerPoint (rendered through PowerPoint when installed), Excel/CSV, Word, images, text
- **Weeks:** your rhythm (any start day, 1 or 2 weeks) with a week page and a one-click report draft
- **Notes and calendar:** meeting notes, events and deadlines, open tasks collected from your files
- **Search:** full text across Markdown, PDF pages, slides and Word (`Ctrl Shift F` / `⌘⇧F`); `[[wiki links]]` with backlinks
- **Focus:** Pomodoro sessions per topic, with a small notch at the top of the screen while you work elsewhere
- **Findings (optional):** papers and news imported from a JSON digest feed (see [AGENTS.md](AGENTS.md))
- **Make it yours:** light, dark or system theme, every colour, the logo, which modules are on

## Install

Download the installer for your platform from [Releases](../../releases): `.exe` on Windows or `.dmg` on macOS.

The installers are not code-signed yet. Windows may show *"Windows protected your PC"*; macOS may require **System Settings → Privacy & Security → Open Anyway**. The source is all here if you'd rather build it yourself.

## Build from source

Requirements: Node 20+, Rust (stable), Xcode Command Line Tools on macOS, or the MSVC build tools on Windows.

```bash
npm ci
npm run tauri dev     # run with hot reload
npm run tauri build   # installer in src-tauri/target/release/bundle/nsis
npm run check         # type check
```

On macOS the build creates an `.app` and `.dmg` under `src-tauri/target/release/bundle/`.
PowerPoint previews use Microsoft PowerPoint when available, then fall back to LibreOffice (`brew install --cask libreoffice`).

## Where things live

| What | Where |
|---|---|
| Your files | wherever they are, untouched |
| Workspace settings | `<folder>/.board/config.json` (documented in [AGENTS.md](AGENTS.md)) |
| Calendar, weeks, pins, focus log | `<folder>/.board/*.json` and `*.jsonl` |
| Caches (search index, slide renders) | `<folder>/.board/cache/` (safe to delete) |
| App preferences (theme, logo, timer) | the app's local storage |

## Feedback

Open an issue with what you did, what you expected and what happened. **Settings → About → Copy diagnostics** puts versions, settings and recent error messages on your clipboard (no file contents) for you to paste in.

## License

[MIT](LICENSE) © 2026 ToMate contributors
