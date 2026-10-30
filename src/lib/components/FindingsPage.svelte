<!--
  Papers and news from a digest feed. All text comes from an
  external feed: it is rendered as plain text (never HTML), and only
  validated http(s) links can be opened.
-->
<script lang="ts">
  import { onMount } from "svelte";
  import { open as pickFolder } from "@tauri-apps/plugin-dialog";
  import { openUrl } from "@tauri-apps/plugin-opener";
  import { findings, DEFAULT_REPO } from "$lib/findings.svelte";
  import { app } from "$lib/state.svelte";
  import type { ReadStatus, Stored } from "$lib/findings";

  // Seeded by global search; consumed once.
  let q = $state(findings.query);
  findings.query = "";
  let section = $state("all");
  let kind = $state("all");
  let show = $state<"inbox" | ReadStatus | "all">("inbox");
  let minScore = $state(0);
  let sort = $state<"newest" | "relevance">("newest");
  let expanded = $state<Record<string, boolean>>({});
  let repoInput = $state(DEFAULT_REPO);

  onMount(() => void findings.open());

  const sections = $derived([...new Set(findings.list.map((f) => f.section))].sort());
  const kinds = $derived([...new Set(findings.list.map((f) => f.type))].sort());
  const latest = (f: Stored) => f.digests.at(-1) ?? "";

  const shown = $derived.by(() => {
    const words = q.toLowerCase().split(/\s+/).filter(Boolean);
    return findings.list
      .filter((f) => {
        const st = findings.status(f.id);
        if (show === "inbox" ? st === "archived" : show !== "all" && st !== show) return false;
        if (section !== "all" && f.section !== section) return false;
        if (kind !== "all" && f.type !== kind) return false;
        if (minScore && (f.score ?? -1) < minScore) return false;
        if (words.length) {
          const hay = `${f.title} ${f.summary} ${f.relevance}`.toLowerCase();
          if (!words.every((w) => hay.includes(w))) return false;
        }
        return true;
      })
      .sort((a, b) =>
        sort === "relevance"
          ? (b.score ?? -1) - (a.score ?? -1) || latest(b).localeCompare(latest(a))
          : latest(b).localeCompare(latest(a)) || (b.score ?? -1) - (a.score ?? -1),
      );
  });

  async function choose() {
    const dir = await pickFolder({ directory: true, title: "Folder with the digest files (YYYY-MM-DD.json)" });
    if (typeof dir === "string") await findings.setFolder(dir);
  }

  function source(f: Stored) {
    if (!f.url) return;
    openUrl(f.url).catch((e) => app.fail("Couldn't open the link", e));
    if (findings.status(f.id) === "unread") findings.setStatus(f.id, "read");
  }

  const host = (url: string | null) => {
    try {
      return url ? new URL(url).hostname.replace(/^www\./, "") : "";
    } catch {
      return "";
    }
  };
  const day = (s: string | null) =>
    s ? new Date(s.length === 10 ? s + "T12:00:00" : s).toLocaleDateString([], { day: "numeric", month: "short", year: "numeric" }) : "";
  const ago = (iso: string) => {
    const m = Math.round((Date.now() - Date.parse(iso)) / 60_000);
    return m < 1 ? "just now" : m < 60 ? `${m} min ago` : m < 1440 ? `${Math.round(m / 60)} h ago` : day(iso);
  };
  const statusOf = (f: Stored) => findings.archive.digests[latest(f)]?.status;
</script>

<div class="page">
  <div class="inner">
    <header>
      <div class="title">
        <h1>Findings</h1>
        <span class="sub">Papers and news from your digest feed</span>
      </div>
      <div class="sync">
        {#if findings.connected}
          <span class="meta" title={findings.repo ? `GitHub: ${findings.repo} (data/findings)` : findings.folder}>
            {findings.repo || "Local folder"} ·
            {findings.busy ? "Importing…" : findings.report ? `Imported ${ago(findings.report.at)}` : findings.archive.lastImport ? `Imported ${ago(findings.archive.lastImport)}` : ""}
          </span>
          <button onclick={() => findings.import()} disabled={findings.busy}>Refresh</button>
          <button onclick={() => findings.disconnect()}>Change source</button>
        {/if}
      </div>
    </header>

    {#if !findings.connected}
      <div class="setup">
        <h2>Connect a digest feed</h2>
        <p>
          Each digest the bot publishes is also saved in its GitHub repository (<code>data/findings/</code>). ToMate downloads
          those files when it starts and when you press Refresh, using the GitHub sign-in git already has on this PC. Your read,
          saved and archived marks and your notes stay here and are never overwritten.
        </p>
        <form class="connect" onsubmit={(e) => (e.preventDefault(), findings.setRepo(repoInput))}>
          <input bind:value={repoInput} spellcheck="false" aria-label="GitHub repository" placeholder="owner/repository" />
          <button class="primary" type="submit" disabled={!repoInput.trim()}>Connect</button>
        </form>
        <p class="hint">Or <button class="inline" onclick={choose}>import from a local folder</button> of <code>YYYY-MM-DD.json</code> files.</p>
      </div>
    {:else}
      {#if findings.report?.syncError}
        <div class="banner error">
          <span>Couldn't update from GitHub: {findings.report.syncError}. Showing the last downloaded copy.</span>
          <button onclick={() => findings.import()}>Retry</button>
        </div>
      {/if}
      {#if findings.report?.error}
        <div class="banner error">
          <span>Couldn't import: {findings.report.error}. Showing what was imported before.</span>
          <button onclick={() => findings.import()}>Retry</button>
          <button onclick={choose}>Change folder</button>
        </div>
      {:else if findings.report?.problems.length}
        <details class="banner warn">
          <summary>
            {findings.report.problems.length} {findings.report.problems.length === 1 ? "problem" : "problems"} in the last import (the rest was imported)
          </summary>
          <ul>
            {#each findings.report.problems.slice(0, 30) as p}<li>{p}</li>{/each}
          </ul>
        </details>
      {/if}

      <div class="filters">
        <input class="search" bind:value={q} placeholder="Search titles and summaries…" spellcheck="false" />
        <select bind:value={show} aria-label="Status">
          <option value="inbox">Inbox</option>
          <option value="unread">Unread</option>
          <option value="saved">Saved</option>
          <option value="read">Read</option>
          <option value="archived">Archived</option>
          <option value="all">All</option>
        </select>
        <select bind:value={section} aria-label="Section">
          <option value="all">All sections</option>
          {#each sections as s}<option value={s}>{s}</option>{/each}
        </select>
        {#if kinds.length > 1}
          <select bind:value={kind} aria-label="Type">
            <option value="all">Papers and news</option>
            {#each kinds as k}<option value={k}>{k}</option>{/each}
          </select>
        {/if}
        <select bind:value={minScore} aria-label="Minimum fit">
          <option value={0}>Any fit</option>
          <option value={5}>Fit ≥ 5</option>
          <option value={7}>Fit ≥ 7</option>
          <option value={9}>Fit ≥ 9</option>
        </select>
        <select bind:value={sort} aria-label="Sort">
          <option value="newest">Newest</option>
          <option value="relevance">Most relevant</option>
        </select>
      </div>

      <ul class="cards">
        {#each shown as f (f.id)}
          {@const st = findings.status(f.id)}
          <li class="card" class:unread={st === "unread"}>
            {#if f.visual}
              <img
                src={f.visual.url}
                alt={f.visual.label ?? "Figure from the paper"}
                loading="lazy"
                referrerpolicy="no-referrer"
                onerror={(e) => ((e.currentTarget as HTMLElement).style.display = "none")}
              />
            {/if}
            <div class="body">
              <div class="top">
                <span class="badge">{f.section}</span>
                {#if f.type !== "paper" && f.type !== "unknown"}<span class="badge muted">{f.type}</span>{/if}
                {#if statusOf(f) && statusOf(f) !== "delivered"}<span class="badge pending" title="The digest was exported before delivery finished">{statusOf(f)}</span>{/if}
                <span class="dates">
                  {#if f.published}Published {day(f.published)} ·{/if} Digest {day(latest(f))}
                  {#if host(f.url)} · {host(f.url)}{/if}
                </span>
                <span class="fit" title="AI estimate of relevance, from the abstract or feed excerpt only">
                  {f.score === null ? "Fit n/a" : `Fit ${f.score}/10`}
                </span>
              </div>
              <h3>
                {#if f.url}<button class="link" onclick={() => source(f)}>{f.title}</button>{:else}{f.title}{/if}
              </h3>
              {#if f.summary}<p>{f.summary}</p>{/if}
              {#if f.relevance}<p class="why"><b>Why it matters:</b> {f.relevance}</p>{/if}
              {#if f.limitations || f.evidence}
                <button class="more" onclick={() => (expanded[f.id] = !expanded[f.id])}>{expanded[f.id] ? "Less" : "Limitations and source excerpt"}</button>
                {#if expanded[f.id]}
                  {#if f.limitations}<p class="small"><b>Limitations:</b> {f.limitations}</p>{/if}
                  {#if f.evidence}<blockquote>{f.evidence}</blockquote>{/if}
                {/if}
              {/if}
              <div class="foot">
                <span class="ai">AI estimate from abstract/excerpt · not verified</span>
                <div class="acts">
                  {#if f.url}<button onclick={() => source(f)}>Open source</button>{/if}
                  <button onclick={() => findings.setStatus(f.id, st === "unread" ? "read" : "unread")}>{st === "unread" ? "Mark read" : "Mark unread"}</button>
                  <button class:on={st === "saved"} onclick={() => findings.setStatus(f.id, st === "saved" ? "read" : "saved")}>{st === "saved" ? "Saved" : "Save"}</button>
                  <button onclick={() => findings.note(f)}>{findings.user[f.id]?.note ? "Open note" : "Add note"}</button>
                  <button title={st === "archived" ? "Back to the inbox" : "Hide from the inbox"} onclick={() => findings.setStatus(f.id, st === "archived" ? "read" : "archived")}>
                    {st === "archived" ? "Unarchive" : "Archive"}
                  </button>
                </div>
              </div>
            </div>
          </li>
        {:else}
          <li class="empty">
            {findings.list.length
              ? "Nothing matches these filters."
              : findings.repo
                ? "No digests exported yet. They appear here once the feed publishes them."
                : "No digests in this folder yet."}
          </li>
        {/each}
      </ul>
    {/if}
  </div>
</div>

<style>
  .page {
    flex: 1;
    min-height: 0;
    overflow: auto;
    padding: 28px 36px 60px;
  }
  .inner {
    max-width: 860px;
    margin: 0 auto;
  }
  header {
    display: flex;
    align-items: flex-end;
    justify-content: space-between;
    gap: 16px;
    margin-bottom: 16px;
  }
  h1 {
    margin: 0;
    font-size: 20px;
    font-weight: 650;
  }
  .sub,
  .meta {
    color: var(--muted);
    font-size: 12.5px;
  }
  .sync {
    display: flex;
    align-items: center;
    gap: 8px;
  }
  button {
    padding: 4px 10px;
    border: 1px solid var(--border);
    border-radius: var(--r);
    background: var(--panel);
    color: var(--text);
    font: inherit;
    font-size: 12.5px;
  }
  button:hover:not(:disabled) {
    border-color: var(--accent);
  }
  button:disabled {
    opacity: 0.5;
  }
  .setup {
    padding: 22px 24px;
    border: 1px solid var(--border);
    border-radius: var(--r-lg);
    background: var(--panel);
  }
  .setup h2 {
    margin: 0 0 8px;
    font-size: 15px;
  }
  .setup p {
    margin: 0 0 10px;
    color: var(--text);
    font-size: 13px;
    line-height: 1.55;
  }
  .setup .hint {
    color: var(--muted);
  }
  code {
    padding: 0.05em 0.35em;
    border-radius: var(--r-sm);
    background: var(--code-bg);
    font-family: var(--mono);
    font-size: 0.9em;
  }
  .connect {
    display: flex;
    gap: 6px;
    margin: 4px 0 10px;
  }
  .connect input {
    flex: 1;
    max-width: 320px;
    height: 32px;
    padding: 0 10px;
    border: 1px solid var(--border);
    border-radius: var(--r);
    outline: none;
    background: var(--bg);
    color: var(--text);
    font-family: var(--mono);
    font-size: 12.5px;
  }
  .connect input:focus {
    border-color: var(--accent);
  }
  .inline {
    padding: 0;
    border: 0;
    background: none;
    color: var(--accent);
    font-size: inherit;
  }
  .inline:hover {
    text-decoration: underline;
  }
  .primary {
    margin-top: 4px;
    border-color: var(--accent);
    background: var(--accent);
    color: white;
  }
  .banner {
    display: flex;
    align-items: center;
    gap: 8px;
    margin-bottom: 14px;
    padding: 9px 12px;
    border-radius: var(--r);
    font-size: 13px;
  }
  .banner span {
    flex: 1;
  }
  .banner.error {
    border: 1px solid color-mix(in srgb, var(--danger) 40%, transparent);
    background: color-mix(in srgb, var(--danger) 10%, var(--panel));
  }
  .banner.warn {
    display: block;
    border: 1px solid var(--border);
    background: var(--panel);
    color: var(--muted);
  }
  .banner ul {
    margin: 8px 0 0;
    padding-left: 18px;
    font-size: 12px;
  }
  .filters {
    display: flex;
    flex-wrap: wrap;
    gap: 6px;
    margin-bottom: 16px;
  }
  .filters input,
  .filters select {
    height: 30px;
    padding: 0 8px;
    border: 1px solid var(--border);
    border-radius: var(--r);
    background: var(--panel);
    color: var(--text);
    font: inherit;
    font-size: 12.5px;
  }
  .search {
    flex: 1;
    min-width: 200px;
    outline: none;
  }
  .search:focus {
    border-color: var(--accent);
  }
  .cards {
    display: flex;
    flex-direction: column;
    gap: 12px;
    margin: 0;
    padding: 0;
    list-style: none;
  }
  .card {
    display: flex;
    gap: 16px;
    padding: 14px 16px;
    border: 1px solid var(--border);
    border-radius: var(--r-lg);
    background: var(--panel);
  }
  .card.unread {
    box-shadow: inset 3px 0 0 var(--accent);
  }
  .card img {
    flex: none;
    width: 150px;
    max-height: 120px;
    border-radius: var(--r);
    background: var(--code-bg);
    object-fit: contain;
  }
  .body {
    flex: 1;
    min-width: 0;
  }
  .top {
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    gap: 6px;
    font-size: 11.5px;
  }
  .badge {
    padding: 1px 7px;
    border-radius: var(--r-sm);
    background: var(--accent-soft);
    color: var(--selected-text);
    font-weight: 600;
  }
  .badge.muted {
    background: var(--hover);
    color: var(--muted);
  }
  .badge.pending {
    background: color-mix(in srgb, var(--k-ppt) 16%, transparent);
    color: var(--k-ppt);
  }
  .dates {
    color: var(--muted);
  }
  .fit {
    margin-left: auto;
    color: var(--muted);
    font-weight: 600;
    font-variant-numeric: tabular-nums;
  }
  h3 {
    margin: 6px 0 4px;
    font-size: 14.5px;
    font-weight: 650;
    line-height: 1.35;
  }
  .link {
    padding: 0;
    border: 0;
    background: none;
    font: inherit;
    text-align: left;
  }
  .link:hover {
    color: var(--accent);
    text-decoration: underline;
  }
  p {
    margin: 0 0 6px;
    font-size: 13px;
    line-height: 1.55;
  }
  .why {
    color: var(--text);
  }
  .small {
    color: var(--muted);
    font-size: 12.5px;
  }
  blockquote {
    margin: 4px 0 8px;
    padding: 6px 10px;
    border-left: 3px solid var(--border);
    color: var(--muted);
    font-size: 12.5px;
    line-height: 1.5;
    white-space: pre-wrap;
  }
  .more {
    margin: 2px 0 6px;
    padding: 0;
    border: 0;
    background: none;
    color: var(--accent);
    font-size: 12px;
  }
  .foot {
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    gap: 8px;
    margin-top: 6px;
  }
  .ai {
    color: var(--muted);
    font-size: 11px;
  }
  .acts {
    display: flex;
    flex-wrap: wrap;
    gap: 4px;
    margin-left: auto;
  }
  .acts button {
    padding: 2px 8px;
    font-size: 12px;
  }
  .acts button.on {
    border-color: var(--accent);
    color: var(--accent);
  }
  .empty {
    padding: 24px;
    border: 1px dashed var(--border);
    border-radius: var(--r-lg);
    color: var(--muted);
    font-size: 13px;
    text-align: center;
  }
</style>
