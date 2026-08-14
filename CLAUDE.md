# CLAUDE.md — Vinyl Scout

## Standing operating rules (read first)

Portfolio-wide checklist distilled from incident history across travel-intelligence, vinyl-scout-repo, streaming-scout, and fitness-log. Full narrative and the canonical version of this checklist live in the Travel Intelligence Claude project's `claude/standing-rules.md` and `claude/travel-intelligence-build-log.md` — keep this block in sync with that source if it drifts.

**Before claiming anything is done:** never say "pushed," "fixed," "deleted," or "live" based on a tool's success signal or Susan's own report alone — verify independently, every time. Push landed: `git rev-parse HEAD` vs `git rev-parse origin/main`. Deploy is live: check the actual URL (cache-bust if the response could be cached) or the platform's own deploy record. Deletion happened: re-fetch the resource directly. A UI fix "worked": check it in a live browser, not just the source diff.

**Before delivering a multi-file change:** read the target file fresh from disk right now — never from a copy staged earlier in the session. Grep the about-to-deliver files for markers of every recent feature touching the same files, to catch an accidental revert before it ships. Treat any documented delivery convention (e.g. a cache-bust `?v=N` bump) as a literal checklist gate before calling something delivered, not a fact to remember.

**git via device_bash:** safe, no lock risk — `git rev-parse HEAD`, `git rev-parse origin/main`, `git log`, `git show <ref>:<path>`. Unsafe — reliably creates a stale `.git/index.lock` — `git status`, `git diff`, `git branch -vv`. Never run any git command here while Susan says she's actively committing in this repo, regardless of which command it is.

**Cross-origin/cross-site features:** any endpoint called from a different origin needs an explicit `Access-Control-Allow-Origin` header with its own test assertion in the endpoint's suite — same-origin or server-side checks passing does not prove this. Verify any two-site feature with an actual two-origin browser check before calling it done.

**Testing that actually proves something:** passing unit tests proves the logic is right, not that it runs in production — dynamic `require()`/`import()` reaching across a deployment boundary can pass every local test and still fail in the real bundle. "Deploy is ready" on the platform doesn't mean the custom domain is serving correctly — check the deploy's own permalink URL first.

**Trusting reads:** a tool reporting success (a stage/read returning a plausible byte count) isn't the same as it returning current data. If a "bug" is discovered purely by reading a file rather than an independent signal (error message, screenshot, deploy record, git history), diff the claim against git history before writing it down as fact.

Operating guide for agents working in this repo. **`PROJECT.md` is the charter
and the source of truth** for scope, hard rules, the record schema, and the QA
checklist. This file is the *how it runs* layer; when the two disagree about
scope, `PROJECT.md` wins. Read both before changing anything.

## What this is

Vinyl Scout (vinylscout.org) is Susan's single-user vinyl catalog: a **no-build
static site** on Netlify with a handful of Netlify Functions over one Netlify
Blobs store. Publicly viewable, `noindex`, writes gated by a shared secret.
Susan works mostly from an iPhone in Safari — mobile-first, always.

## Repo layout

    index.html         Gallery + detail modal (loads app.js, style.css)
    seed.html          Paste Claude-generated JSON to bulk-add (writes gated)
    audit.html         Hand-edit: inline edit, single delete, cover upload
    wishlist.html      Hunt list — add/delete gated by an edit key, remembered per device (Phase 8, 2026-08-06; was UNGATED 2026-07-11 through 2026-08-05, see below)
    guide.html         User-facing how-to guide
    about/roadmap.html Static info pages
    concert-radar.html Phase 11 — LIVE, real SeatGeek-backed feature (see
                        2026-08-03 note below) — "Concerts" in nav
    start.html         "Build Your Own" — copyable starting prompt for replicating this project
    app.js             Frontend (vanilla IIFE). Cache-bust: // version: N
    style.css          Styles. Cache-bust via ?v=N in <link>
    netlify.toml       publish=".", functions dir, security headers, ignore cmd
    netlify/functions/ One file per endpoint; path set by export const config
      records.mjs        /api/records/:id?   GET public · POST/DELETE gated
      save-cover.mjs     /api/save-cover     POST gated · commits covers/<id>
      backup-http.mjs    /api/backup         GET  gated (manual backup)
      backup.mjs         scheduled 09:00 UTC nightly backup (not HTTP-reachable)
      discogs-lookup.mjs /api/discogs/lookup GET ungated · pure read
      discogs-pricing.mjs/api/discogs-pricing POST gated · writes record · scrapes (see PROJECT.md v25 — no auth check at all before 2026-07-20)
      wishlist.mjs       /api/wishlist/:id?  GET public · POST/DELETE gated by EDIT_SECRET, v4 (see below)
      audio-preview.mjs  /api/audio/preview  GET ungated · pure read (audio
                         preview: Deezer first, then a small hand-picked
                         override table for compilations/best-ofs Deezer
                         doesn't carry under their own title, then YouTube
                         last-resort (needs YOUTUBE_API_KEY) — Spotify and
                         iTunes tiers were removed at v12, 2026-07-13; also
                         serves wishlist.html's preview buttons, same code)
      tour-dates.mjs     /api/tour-dates     GET ungated · pure read (Phase
                         11 Concert Radar — SeatGeek-backed; resolves an
                         artist to a real SeatGeek performer first, then
                         queries events scoped to that performer's slug,
                         then filters every event's own title against a
                         tribute/cover-act blocklist — see 2026-08-03 note)
      venue-shows.mjs    /api/venue-shows    GET ungated · pure read (Phase
                         12, 2026-08-04 — scrapes 7 hand-picked Bay Area
                         venues' own public event pages server-side, no API
                         key needed for any of them; one of the 7 fetches
                         covers 6 Another Planet Entertainment venues at
                         once. Catches box-office-only shows SeatGeek's
                         index doesn't carry — see the file's own header
                         comment for the full per-venue platform breakdown
                         and the 2 venues deliberately left out)
      watching.mjs       /api/watching/:id?  GET public · POST/DELETE
                         UNGATED (Phase 11, 2026-08-04, v16 — Watching
                         panel storage, moved server-side after Susan's
                         browser lost it from localStorage; separate
                         `watching` Blobs store; seeds 3 named artists once
                         via a sentinel record — see 2026-08-04 v16 note)
      scheduled-sweep.mjs scheduled '@weekly' (not HTTP-reachable — Phase
                         11, 2026-08-04, v18 — re-sweeps every catalog/
                         wishlist artist + the venue scrape server-side via
                         this site's own /api/tour-dates and /api/venue-
                         shows endpoints, writes merged result to the
                         `catalog-cache` Blobs store; see 2026-08-04 v18
                         note)
      catalog-cache.mjs  /api/catalog-cache  GET ungated · pure read
                         (serves scheduled-sweep.mjs's weekly output; used
                         by concert-radar.html only as a first-paint
                         fallback for a browser with no local cache yet —
                         see 2026-08-04 v18 note)
    netlify/lib/run-backup.mjs  Shared backup logic (pure read → git commit)
    covers/            Album art committed by save-cover
    backups/           Daily JSON snapshots committed by run-backup
    scripts/           netlify-ignore.sh (deploy gate) + smoke.mjs + helpers
    PROJECT.md         The charter (scope, hard rules, schema, QA checklist)

## How it deploys

- Push to `main` → Netlify auto-deploys. No build step (static publish=".").
- `scripts/netlify-ignore.sh` (wired as `[build] ignore`) **skips** a deploy
  when only docs/dev files changed (*.md, scripts/, backups/, .gitignore).
  Touching *.html/*.js/*.css/covers/netlify/** triggers a real deploy.
- Functions bundle with esbuild. Each function declares its own route via
  `export const config = { path: ... }` — there are no redirects in toml.

## Locked conventions (do not break — see PROJECT.md "Hard Rules")

- **Catalog is sacred.** No bulk-delete, no dedup, no background mutation.
  All writes are single-record upserts by `id`. Read endpoints never write.
- **Secrets travel in headers, never in URLs** and are never committed or baked
  into served HTML. Validated server-side against env vars; gates fail closed.
  **`/api/wishlist` POST/DELETE were deliberately ungated 2026-07-11 through
  2026-08-05** (no X-Edit-Key check), because typing the edit passphrase on
  mobile every session wasn't practical for a page Susan uses casually. As of
  2026-08-06 (roadmap Phase 8, "Close the wishlist gap"), the gate is back —
  same X-Edit-Key/EDIT_SECRET check as the catalog — but `wishlist.html`
  remembers the key in `localStorage` after one entry instead of
  `sessionStorage`, so it costs one entry per device rather than one per
  visit. See `wishlist.mjs`'s own v4 header comment and PROJECT.md's v39
  entry for the full rationale.
- **Versioned deploys.** Every functional change bumps the cache-bust `?v=N`
  in index.html/seed.html (and audit.html if its inline script changed) and the
  `// version: N` comment at the top of app.js / the changed function.
- **No silent failures.** Every error path shows visible, persistent error text
  (mobile has no console). No setTimeout-hides-error patterns.
- **Mobile-first.** Check 375px viewport; tap targets ≥44px; inputs ≥16px font.

## Environment variables (set in the Netlify web UI — never on a CLI)

| Var            | Used by                          | Purpose                                    | Required for           |
|----------------|----------------------------------|--------------------------------------------|------------------------|
| EDIT_SECRET    | records.mjs, save-cover.mjs, discogs-pricing.mjs | Gates POST/DELETE writes (X-Edit-Key)      | All writes / covers / pricing refresh |
| BACKUP_SECRET  | backup-http.mjs                  | Gates manual GET /api/backup (X-Backup-Key)| Manual backup          |
| DISCOGS_TOKEN  | discogs-lookup, discogs-pricing  | Discogs auth, server-side only             | Pressing/market lookup |
| GITHUB_TOKEN   | save-cover, run-backup           | Commits covers + backups via GitHub API    | Covers + backups       |
| GITHUB_REPO    | save-cover, run-backup           | Target repo (default snesbitt/vinyl-scout) | optional               |
| GITHUB_BRANCH  | save-cover, run-backup           | Target branch (default main)               | optional               |
| YOUTUBE_API_KEY       | audio-preview.mjs         | YouTube Data API v3 key, API-key-only (no OAuth) | Audio preview's YouTube tier is currently a dormant last-resort — 93 of 94 records resolve via Deezer as of 2026-08-10 (Verve // Remixed is the sole remaining gap, pending YouTube), so this key's status barely affects coverage today. Status not independently reconfirmed this pass; get one free from Google Cloud Console if you do need to set it (enable "YouTube Data API v3", create an API key, no OAuth consent screen needed for public search). Until set, this tier gracefully reports "not configured" with zero effect on the rest of the pipeline. |
| SEATGEEK_CLIENT_ID    | tour-dates.mjs            | SeatGeek Platform API client_id, server-side only | Required for Concert Radar (Phase 11) — without it `/api/tour-dates` returns a 500. Must be scoped to "Functions" (or "All scopes") in Netlify's env var UI; "Builds, Runtime" alone isn't enough for a serverless function to read it at request time (bit us on first deploy, 2026-08-03). Currently set and live. |
| SEATGEEK_CLIENT_SECRET| tour-dates.mjs            | SeatGeek Platform API client_secret, server-side only | Optional — SeatGeek's docs say client_secret isn't required for read-only calls like `/events`, so `tour-dates.mjs` tries `client_id` alone first and only adds the secret if this var is present. |

Spotify and iTunes env vars (`SPOTIFY_CLIENT_ID`, `SPOTIFY_CLIENT_SECRET`) are
no longer used — both tiers were removed from `audio-preview.mjs` at v12
(2026-07-13; see `CLAUDE_HISTORY_ARCHIVE.md`). If they're still set in the
Netlify UI, they're inert and can be removed.

Secrets are managed by Susan in the Netlify UI. Agents never echo, log, or pass
a token value on a command line or in a commit.

## Definition of done

A change is done only when **all** of these hold:

1. **Syntax:** `npm run check` passes (node --check on every function/lib file).
2. **Charter QA checklist** (PROJECT.md → "QA discipline") is satisfied:
   no bulk-delete/dedup added, read endpoints still pure, cache-bust bumped,
   cross-file refs verified, secrets in headers only.
3. **Smoke:** after the deploy goes green, `npm run smoke` passes against the
   live site (asserts the gallery loads, /api/records returns records, write
   endpoints reject unauthenticated writes, security/noindex headers present).
   **Build-green ≠ healthy** — the smoke test is what proves healthy.
4. Susan has the post-flight summary (what changed, files, deploy steps, how to
   verify, how to roll back, new ?v=N).

## Whenever Susan asks for a docs review/update

Treat this as a review of **every** doc in the repo, not just the ones that
seem related to the most recent change — Susan's asked for this explicitly
(2026-07-12) after `about.html` was found to have drifted badly (still
described the retired Spotify-only preview and pricing that had been removed
from gallery tiles months earlier). The full doc set to check every time:

- `CLAUDE.md` (this file) — the *how it runs* layer
- `PROJECT.md` — the charter: version/changelog, phase statuses, hard rules,
  schema, QA checklist
- `README.md`
- `about.html` — user-facing "how it works," most prone to silently drifting
  since nothing fails loudly when it goes stale
- `guide.html` — user-facing how-to; check for stale feature claims even
  though it's mostly methodology, not feature-specific
- `roadmap.html` — phase statuses and per-phase descriptions

Read each one fully rather than assuming a file is fine because it wasn't
touched by the current change — staleness accumulates precisely in the docs
nobody thought to check. Fix drift found in ANY of them as part of the same
pass, not just the one that prompted the ask.

**This is now also automated, not just a rule for live sessions.** The
external `weekly-vinyl-median-refresh` scheduled task (Mondays ~9:08am, lives
outside this repo in Susan's Claude app — see PROJECT.md v20) gained a new
**Job E — code & data health checks** on 2026-07-12: a cache-bust drift check
across all 7 static pages, an audio-preview canary re-test of 5
previously-buggy records, a `YOUTUBE_API_KEY` activation check (auto-runs the
pending 7-gap-record sweep the moment the key is set), a rotating cover-art
link-rot spot check, and full parity with every assertion in
`scripts/smoke.mjs`. Job D's doc-reconcile step also changed from
conditional to **unconditional every week** — the full six-doc read above now
happens on a schedule, not just when a live session happens to be asked for
one. If a Monday report ever says a doc wasn't fully read, that's the
automation degrading, not an acceptable shortcut — flag it if noticed.

## Weekly automation (external, Jobs A-E)

This section is new (2026-07-20) — a consolidated, current-state reference
for the external `weekly-vinyl-median-refresh` scheduled task (Mondays
~9:08am, lives OUTSIDE this repo, in Susan's Claude app scheduled tasks —
not a Netlify scheduled function, not anything deployable from this git
history). Before this section existed, its full spec was only reconstructable
by cross-referencing PROJECT.md's changelog (v6, v7, v9, v20, v21) against
prose scattered through this file. Job letters C2, D, and E are named
explicitly in PROJECT.md/CLAUDE.md's own text; A, B, and C are this
section's own sequential labels for the two sub-tasks v6 describes together
and the sync v7 introduces before v9 named its Amazon-cart sibling "C2" —
they are not literal labels used elsewhere in the source material, and are
called out as inferred here so this section doesn't overstate what's
actually documented. If a job's real letter ever turns up spelled out
somewhere this section didn't find, prefer that over the inferred order
here.

Same day, per Susan's standing goal ("pristine code, no issues, everything
as current as possible"), the run order is **Job E, then Job A/B, then C,
then C2, then Job D** — Job E was added explicitly "ahead of the existing
Job D QA pass" (PROJECT.md v20), and Job D's doc-reconcile step needs
whatever the sync jobs touched to already be current.

- **Job A — record median/pricing refresh.** Re-fetches Discogs market data
  (median/high/low/last-sold, have/want counts, rating) for every catalog
  record via the gated `/api/discogs-pricing` endpoint (single-record
  upserts, same as a manual run — no bulk write path). Introduced alongside
  Job B in PROJECT.md v6.
- **Job B — wishlist price/cover refresh.** Reads each wishlist item's
  Discogs sell page (through a real browser session, since server-side
  scrapes 403) and writes back `current_ask`/`price_median` via
  `/api/wishlist`. Originally also flagged any ask ≤ the item's `max_price`
  as a "FIND" (PROJECT.md v6) — that flagging behavior was removed at
  Susan's request in v10 along with the max-price UI; Job B still refreshes
  price data, it just doesn't flag matches anymore. Never touches
  `cover_url` for items that already have one; a missing cover on a
  manually-added item is a separate, one-time backfill class of fix (see
  the wishlist.html v13 note above), not something this job repairs weekly.
- **Job C — Spotify wishlist sync.** Weekly pull of Susan's "Your Top Songs"
  playlist plus her other designated playlists (PROJECT.md v9: **not** a
  full-library enumeration — scoped to specific playlists only, tightened
  after an early version swept too broadly), collapses to unique albums,
  excludes anything already owned or already wishlisted, and adds only
  releases confirmed to exist on vinyl (Discogs lookup; digital-only
  releases are skipped). Never deletes. Meant to respect a persistent
  no-re-add rule via `sync-state.json` — once Susan deletes a wishlist item,
  this job should never re-add it, regardless of how many times it
  resurfaces in her playlists.
  **BUG, found and half-fixed 2026-07-29:** this rule was aspirational only.
  `sync-state.json` had an `auto_added` list but no `deleted` list, and
  `wishlist.mjs`'s DELETE handler never wrote anywhere — so a deleted item
  had zero record anywhere, and the next sync that saw it in a playlist
  re-added it. `wishlist.mjs` v3 now records every deletion into a new
  `deleted` array in `sync-state.json` (normalized `artist title` key, same
  format as `auto_added`; committed via the GitHub Contents API, same
  pattern as `save-cover.mjs`/`run-backup.mjs`). **This job's own prompt
  (external to this repo, in Susan's Claude scheduled tasks) still needs to
  be updated to actually check `deleted` before adding** — that half of the
  fix isn't done, since this session couldn't locate the live trigger for
  this specific job among Susan's current scheduled tasks to edit it. Until
  that prompt-side check exists, deletions are recorded but not yet
  enforced.
- **Job C2 — Amazon cart sync** (named explicitly in PROJECT.md v9).
  Read-only sweep of Susan's Amazon active cart + saved-for-later, matched
  to the specific pressing each listing names, added to the wishlist the
  same way Job C's finds are. **Never modifies the Amazon cart itself** —
  this is a read source, not a two-way sync.
- **Job D — QA pass.** Two parts: (1) documentation-reconcile — changed
  2026-07-12 from conditional ("only if something changed") to
  **unconditional every week**: read `CLAUDE.md`, `PROJECT.md`, `README.md`,
  `about.html`, `guide.html`, `roadmap.html` in full and fix any drift found
  in any of them, not just the one a recent change touched (this is the
  same discipline "Whenever Susan asks for a docs review/update" above
  describes for a live session, now running on a schedule too — if a
  Monday report ever says a doc wasn't fully read, that's the automation
  degrading, not an acceptable shortcut). (2) A QA/health pass — as of Job
  E's v20 expansion, full `scripts/smoke.mjs` assertion parity now runs
  under Job E (see below) rather than Job D re-implementing a partial
  subset of the same checks; Job D's own remaining job-specific health
  checks beyond doc-reconcile aren't separately itemized in the source
  material available to this section.
- **Job E — code & data health checks** (PROJECT.md v20, 2026-07-12; run
  every week, ahead of Job D). Five parts: (1) **cache-bust drift check** —
  compares every static page's `style.css?v=`/`app.js?v=` reference against
  the actual current version and fixes any page caught lagging (this is
  the exact bug class that let `roadmap.html`/`about.html`/`guide.html` sit
  on a stale `style.css?v=` for weeks — see PROJECT.md v19's E2E QA note);
  (2) **audio-preview canary check** — re-tests a fixed set of 5 records
  that each previously exposed a real `audio-preview.mjs` matching bug (Led
  Zeppelin *IV*, Air *Moon Safari*, Fleetwood Mac *Rumours*, Beethoven's
  Piano Sonatas, The Scientist), escalating to a full 93-record sweep if
  any canary fails; (3) **YouTube key activation check** — detects whether
  `YOUTUBE_API_KEY` has been set since the last run and, if so, auto-runs
  the pending gap-record sweep and updates PROJECT.md/CLAUDE.md to close
  out the "not yet set" note; as of PROJECT.md v21 (2026-07-13) it also
  reports the pending state and affected record count every week
  regardless of whether the key changed, so a record sitting in
  `no_match_pending_youtube` never goes silently unmentioned again; (4)
  **cover-art link-rot spot check** — a rotating ~12+12 sample of
  record/wishlist cover URLs checked for actual reachability each week;
  (5) **full smoke-test parity** — runs every assertion in
  `scripts/smoke.mjs` directly against the live site (superseding the
  partial subset Job D used to check on its own).

**What none of Jobs A-E ever do:** bulk-delete, auto-dedup, or any write
outside a single-record upsert through the existing gated/ungated endpoints
those endpoints already expose (same Hard Rules as a manual/live-session
change — see PROJECT.md's "Hard Rules" section). None of them touch the
catalog's edit secret gate or weaken it. Job A/B/C/C2 write only through
`/api/discogs-pricing`, `/api/wishlist`, or the Amazon/Spotify-sourced
add path already described above — no direct Blobs-store access outside
those endpoints.

**Separate from Jobs A-E:** a **daily read-only watchdog** (PROJECT.md v6,
approved 2026-07-04) checks record count vs. the latest backup, median
presence, and site availability, alerting Susan on anomalies. It is not
part of the weekly `weekly-vinyl-median-refresh` run, has no job letter of
its own in the source material, and **never writes** under any
circumstance — this section doesn't attempt a full spec of it since
PROJECT.md's v6 entry is the only description found; flag to Susan if a
fuller spec surfaces and this note should be expanded.

## Charter drift to be aware of

**Local clones drift from `origin/main` here** — several automations (a
weekly Discogs/Spotify/Amazon-cart sync, a daily health watchdog) commit
straight to GitHub via the API, outside of Susan's local `git` workflow. A
local clone that hasn't pulled in a while can be many commits behind without
any local changes to show for it. **Before starting local work or handing
Susan a `git push` recipe, check `git fetch && git status` (or diff HEAD
against `origin/main`) for divergence** — don't assume a stale local base is
current. (This bit a 2026-07-11 session: a local clone ~9 days behind picked
up the Phase 3 Wishlist build, the weekly scout automation, and `guide.html`
only when the divergence was noticed and manually reconciled file-by-file.)

Phase 4 (Audio Preview, `audio-preview.mjs` + the detail-modal Play button)
was built at Susan's explicit request, ahead of the phase queue — Wishlist,
which was actually next in line, is Phase 3 and shipped earlier (2026-07-04).
Audio preview shipped for the collection detail modal first; wishlist
playback (mentioned in the original roadmap sketch) shipped separately on
2026-07-14 (`wishlist.html` v15, commit `83b56ec`) and is live too — both
surfaces call the same `/api/audio/preview` endpoint. This note previously
said wishlist playback was "not yet built," which stopped being true that
day — corrected here since it's exactly the kind of stale status claim this
section warns about. `PROJECT.md` documents both as their own phases. When
in doubt about what's actually live vs. what a phase label says, read the
repo (or ask Susan) rather than trusting a "parked"/"planned" status by
itself.

**Current state (as of 2026-08-10 weekly run):** 93 of 94 records resolve to a real, individually-verified-correct playable preview, served via Deezer. "Verve // Remixed" remains the sole record pending the YouTube fallback (key still not configured). Spotify and iTunes tiers were tried and
removed — neither ever contributed a single playable preview across the
whole catalog. A YouTube tier 4 exists in the code as a last-resort
fallback (needs `YOUTUBE_API_KEY`, not yet confirmed set) but is currently
unused: every record now resolves via Deezer directly or via
`KNOWN_COMPILATION_TRACKS`, a small hand-researched override table for
records whose canonical release isn't the one Deezer indexes (e.g. The
Cure's *Standing on a Beach* resolves via "Boys Don't Cry" off Deezer's own
*Greatest Hits*). Matching logic went through 15 revisions to get here —
the full blow-by-blow (each bug found, each false fix caught by a
full-catalog re-sweep, not just the reported record) is preserved in
`CLAUDE_HISTORY_ARCHIVE.md`, out of this file to keep its footprint smaller
for future sessions. The one durable lesson worth keeping inline: **never
trust an `available:true` count increase by itself** — verify by tracing
the actual matched track back to its real Deezer album/artist, and always
re-run the full 93-record sweep (not just the specific records touched)
after any matching-logic change. Two separate wrong-track bugs and one
same-session regression were only caught this way.

## 2026-07-26 — self-hosted fonts

Fonts live in `/fonts` (Fraunces variable latin-full normal — covers the
SOFT axis the old Google URL requested — plus IBM Plex Sans/Mono 400–600,
official Fontsource/IBM releases). The Google Fonts link tags are gone;
`@font-face` is inline in index.html's head and netlify.toml serves
`/fonts/*` immutable for a year. Don't reintroduce a Google Fonts request.

## 2026-07-29 — Wishlist priority (Phase 9, pulled forward)

wishlist.html now defaults to a Priority sort instead of pure alphabetical,
with an A-Z toggle to go back. Priority combines two signals that already
existed on every item — discount from current_ask vs price_median, and
age since created_at (capped at 180 days) — via a weight chosen from three
presets (Discount first / Balanced / Longest waiting), since how much a
discount should outweigh waiting time is a taste call, not something to
compute. No server/schema change: no new fields, no new endpoint. State
(sort mode + weight choice) lives in localStorage only. Rows also show a
discount badge (e.g. "▼18%") when current_ask sits meaningfully below
price_median. Still open: no Discogs want/have scarcity data on wishlist
items, so that third signal from the original roadmap copy isn't in v1.

## 2026-07-29 — serif swap: Instrument Serif to Lora

Portfolio-wide taste call: Lora replaces Instrument Serif across all 7
pages + style.css, including the two direct 'Instrument Serif' refs
(audit.html's edit-mode style block, roadmap.html's .phase__name). Same
self-hosted pattern, files at /fonts/lora-latin-400-{normal,italic}.woff2.

## 2026-07-30 — Wishlist sort clarity + automatic Discogs cover art

- Wishlist sort presets replaced: "Discount first / Balanced / Longest
  waiting" (a blended weighted score) is now "Cheapest / Most expensive /
  Longest waiting" (literal sorts on current price or age, no blend). The
  "Balanced" preset tested unclear — a blend of two signals with no visible
  ratio isn't something a person can reason about. The per-row discount %
  badge is unchanged and still shows regardless of sort mode.
- New `netlify/functions/discogs-cover.mjs`: when a pressing match is
  accepted in Audit (`acceptPressing()`), if the record has no `cover_url`
  yet, the accepted release's cover art is now fetched from Discogs and
  committed to `covers/<id>.jpg` automatically — same GitHub-contents-API
  commit path as `save-cover.mjs`, just server-initiated instead of a manual
  upload. Gated by the same `X-Edit-Key`; reuses the existing `DISCOGS_TOKEN`
  and `GITHUB_TOKEN` env vars, no new secrets. Best-effort: a failed fetch
  doesn't block the pressing apply, it just leaves cover_url unset with a
  toast telling Susan to upload one manually.

## 2026-07-31 — Security audit fixes + Discogs token rotation

- `wishlist.html`: `esc()` escaped `&<>` but not quotes, so the cover/data-*
  attributes built from wishlist items (artist, title, cover URL — all
  attacker-writable via the deliberately ungated `POST /api/wishlist`)
  could break out of their attribute and inject arbitrary HTML. Replaced
  with an explicit `&<>"'` character-map escaper. No functional change —
  every legitimate wishlist item renders identically. Committed `ef65e79`,
  landed on `main` at `7ffa854` after a same-day git-merge detour (stray
  `tmp_obj_*`/lock debris in `.git/objects`, unrelated to the fix itself;
  resolved via reset + cherry-pick).
- `enrich-release-info.py` (gitignored, not tracked in git): dropped the
  hardcoded Discogs Personal Access Token in favor of reading
  `DISCOGS_TOKEN` from the environment, with a clear error if unset.
- Discogs token rotated end to end: the old token had been hardcoded in a
  tracked commit before this file was gitignored (recoverable from git
  history, commit `8818453`), so treated as compromised. New Personal
  Access Token generated at discogs.com/settings/developers, `DISCOGS_
  TOKEN` updated in Netlify (Site configuration → Environment variables),
  site redeployed so `discogs-lookup.mjs` / `discogs-pricing.mjs` /
  `discogs-cover.mjs` all pick up the new value.
- Leftover `safety-backup` branch (an insurance branch from the git-merge
  detour above, same diff as `7ffa854`, fully incorporated) — Susan to
  run `git branch -D safety-backup` locally; the device bridge's lock
  handling can't reliably do ref deletes.

## 2026-08-03 — Concert Radar (Phase 11): mock → real, live, SeatGeek-backed

`concert-radar.html` started the day as a static sample-data mock (v1) and
ended it as a **real, live feature** — same day, several rounds of direct
feedback against the deployed site. Full blow-by-blow (each bug, each
fix, each live-verification step) lives in `PROJECT.md`'s Phase 11
section; this note is the current-state summary for a session picking
this file up cold.

**Current state (as of `concert-radar.html` v12 / `tour-dates.mjs` v4):**
- **Coming Soon** is real data, not a mock. On load (and every 12h after,
  or on demand via Refresh), the page collects every distinct artist name
  across the catalog (`/api/records`) and wishlist (`/api/wishlist`), and
  looks each one up through `GET /api/tour-dates?artist=…` (SeatGeek
  Platform API, concurrency-capped at 5 in flight). Results are cached in
  `localStorage` (`cr_catalog_cache_v1`) so a normal visit is instant. An
  artist with no confirmed match is silently omitted — same
  graceful-degradation rule as audio preview.
- **Artist resolution is strict, not loose text search.** `tour-dates.mjs`
  resolves the queried name to a real SeatGeek *performer* first (exact
  normalized match, then a guarded fuzzy fallback only if every query
  token is present and no tribute/cover keyword matches), then queries
  events scoped to that performer's slug — never a free-text search
  across events, which is what let a tribute act slip through early on.
  **Every event's own title is additionally checked against a
  tribute/cover-act blocklist**, regardless of which tier matched the
  performer — added after Susan directly challenged a "Sade" listing
  ("is that real or are you hallucinating?") and it turned out to be
  "Ultimate Sade Tribute Concert," registered on SeatGeek under the bare
  artist name with no qualifier anywhere except the event title itself.
  Never trust a match without checking what actually got matched — same
  lesson as the audio-preview matching saga.
- **Same-artist/same-venue multi-date shows group into one card** with a
  date range (e.g. "Feb 6–20, 2027 · 7 dates") instead of one row per
  date — a 7-night Buena Vista Social Club residency was rendering as 7
  near-identical cards before this.
- **Watching and Coming Soon are mutually exclusive ("either/or"), per
  Susan's explicit rule.** Watching an artist removes its card(s) from
  Coming Soon immediately; the Watching panel shows that artist's real
  date/price/ticket-link inline instead, so nothing renders twice.
  Un-watching brings the card(s) back. The Watching panel layout stacks
  artist+delete-button on one row and date/price/ticket-link on a second
  full-width row below, specifically so a long date range doesn't strand
  the × delete button on its own orphaned line.
- **Price data is a known, verified gap, not a bug.** Every currently
  matched real show returns `priceLow`/`priceHigh: null` straight from
  SeatGeek's own API (live-checked directly, not assumed) — `stats.
  lowest_price`/`stats.highest_price` are the documented, correct fields
  and the code already renders them whenever populated (confirmed working
  via the Watching panel's price line). Most likely cause: these
  particular shows are far enough out that secondary-market listings
  haven't opened yet, or the API key's access tier doesn't include
  pricing/stats — not independently confirmed which. Left as-is per
  Susan's "put aside for now" (2026-08-03); don't fabricate a number here
  if asked again without new information.
- Home location is hardcoded to **Berkeley, CA** (`HOME_LAT`/`HOME_LON` in
  `tour-dates.mjs`) per Susan's explicit 2026-08-03 choice — not an env
  var yet.
- As of 2026-08-04, SeatGeek (`tour-dates.mjs`) and a 7-venue direct scrape
  (`venue-shows.mjs`, see the 2026-08-04 section below) are both wired up.
  Ticketmaster signup is in progress separately. A Spotify layer stays
  parked — add later only if a real coverage gap shows up.

roadmap.html's Phase 11 card status is now **Live**, not Future — see
that file directly for the current phase description.

## 2026-08-04 — Concert Radar: manual-add fallback, verified a real SeatGeek gap, mobile nav fix

Susan named 3 real shows missing from Coming Soon: Easy Star All-Stars at
Cornerstone (Berkeley), Black Uhuru, and Burning Spear (both also Bay
Area). Investigated each against live data before touching any code —
PROJECT.md's "honesty over confidence" rule means verify, don't guess:

- **Easy Star All-Stars** and **Burning Spear** are both already in the
  catalog, so both are already swept by Coming Soon. `/api/tour-dates`
  resolves an exact SeatGeek performer for each but returns zero events
  within 60mi of Berkeley — confirmed live, not assumed. Independent web
  research found no real 2026 Bay Area date for either act (Easy Star's
  closest hit was "School of Rock AllStars," an unrelated act, also
  playing Cornerstone — likely what got conflated; Burning Spear's only
  2026 CA date found was Reggae on the River in Piercy, well north of the
  Bay Area). Flagged back to Susan rather than added as if confirmed.
- **Black Uhuru** is real and verified: Feb 21, 2026, The Freight &
  Salvage, Berkeley (checked across 6 independent sources). Not in the
  catalog or wishlist, so never swept — and separately, SeatGeek's own API
  returns zero events for this exact performer in range too, meaning even
  watching it wouldn't have surfaced the show. This is the real "SeatGeek
  coverage gap" this file's 2026-08-03 entry said would justify a second
  ticket source (Ticketmaster) someday. Logging it here rather than
  quietly wiring up Ticketmaster, since that's a bigger build (slower
  manual-approval signup, per the 2026-08-03 note) Susan hasn't asked for.

**Shipped instead**, scoped to the actual gap: a "+ Add a show Radar can't
find" form on `concert-radar.html` (v14) under Coming Soon — Artist, Date,
and a ticket URL required; venue/city optional. Reuses the existing
`addedShows`/`cr_added_shows_v1` pin mechanism a Live Results "+ Add to
Coming Soon" click already writes to, just without requiring a SeatGeek
hit first. Tagged "Manual entry" (never "SeatGeek") so sourcing stays
honest — same discipline as the Live/Sample tag distinction this page has
kept since v3. Nothing was auto-added on Susan's behalf; she enters real
shows herself, same "propose and confirm, nothing automatic" spirit as
every other write path in this app.

Also addressed, same pass: mobile masthead nav (7 links wrapping to a
cramped second row on a phone — reported live via screenshot) switched to
a single horizontally-scrollable row (`style.css` v28), reusing the
`.controls__chips` pattern. And a reported "copyright looks off-center/cut
off" issue on Concert Radar got a defensive `overflow-wrap: anywhere` on
the venue/artist/watch-row text classes (a long unbroken venue string is
the most likely cause, given html/body's global `overflow-x: hidden`)
— **not independently reproduced** in this pass (no true narrow-viewport
render was available), so this is a best-effort fix flagged for Susan to
confirm after deploy, not a claimed-certain fix.

## 2026-08-04 — Concert Radar Phase 12: venue scraper (`venue-shows.mjs`), Ticketmaster signup in progress, weekly feed health check

Susan pushed back on the 2026-08-04 manual-add fallback above: "that's an
ok feature but i'd rather expand my free feeds for full coverage so that
you id it and naturally add all the relevant upcoming shows to my feed" —
she wants automatic detection, not a manual workaround. Two threads of
work followed, both same day:

**Ticketmaster Discovery API** — self-serve and instant when it works, but
Susan's account signup "stalled out" on a prior attempt. Diagnosed by
walking the live signup/login/password-reset flow directly: the generic
"if this is a valid account, an email will be sent" message on Ticketmaster's
own reset page doesn't confirm or deny an account exists, and no reset
email arrived even after checking spam — consistent with the account never
having actually finished being created. Susan has since contacted
Ticketmaster developer support directly; this remains open. Per this
project's hard rule on account creation, no attempt was made to create,
log into, or complete a signup for Susan's Ticketmaster account on her
behalf at any point — only navigation/diagnosis, with every credential/
form-submission step left for her to do herself.

**Every other free option was researched and ruled out** before landing on
a scraper: Eventbrite's public event-search API has been dead since Feb
2020 (confirmed still 403ing on request in 2026, not assumed from stale
knowledge); Dice.fm only exposes a partner API for ticket-holder
management, not event discovery; PredictHQ has no free/hobby tier;
Bandsintown was already known to refuse hobby API access; Songkick's own
API application page currently reads "we are unable to process new
applications for API keys" — fully closed, not merely a slow manual
review as earlier assumed. No viable second ticketing API exists today
beyond Ticketmaster.

**Shipped: `netlify/functions/venue-shows.mjs` (v1)**, a direct
server-side scrape of 7 hand-picked Bay Area venues' own public event
pages — no API key needed for any of them. Susan named the venue list
(Cornerstone, Fox Theater, Sweetwater Music Hall, "all Another Planet
venues," UC Theatre, the Greek, etc.); every candidate venue was
individually verified live before being added, per PROJECT.md's "honesty
over confidence" rule — a same-origin `fetch()` of each live URL was
checked for a real, currently-listed show's name in the RAW response text
(i.e., what a Netlify function actually sees, with no JavaScript
execution, as opposed to what a browser renders). Two of Susan's requested
venues failed this check and were deliberately left out rather than
silently wired up to return nothing:
- **Ashkenaz** (Berkeley) — calendar renders via client-side JS/AJAX; raw
  HTML has no show data at all.
- **The New Parish** (Oakland) — calendar loads through a lazy iframe with
  an empty `src` in the initial HTML.

Both are documented in `venue-shows.mjs` itself as a follow-up: revisiting
either means finding the actual JSON/XHR endpoint each site's widget calls
client-side, not scraping the page shell.

The 7 that ARE live, and how each is parsed (full detail in the file's own
header comment):
- **Cornerstone** (Berkeley) — clean schema.org Event JSON-LD.
- **Another Planet Entertainment**'s own listing page — one fetch covers
  **six** venues at once (Fox Theater Oakland, Greek Theatre Berkeley,
  Bill Graham Civic Auditorium SF, The Castro SF, Bimbo's 365 Club SF, The
  Independent SF), since APE promotes all of them through one site.
  Non-Bay-Area / merely-co-promoted listings on that same page (Levi's
  Stadium, Channel 24 Sacramento, The Bellwether LA, Golden Gate Park
  festivals, Rickshaw Stop) are filtered out by an explicit venue
  allowlist.
- **Freight & Salvage** (Berkeley) — WordPress theme markup, no JSON-LD.
- **Sweetwater Music Hall** (Mill Valley) — the "RHP Events Calendar"
  WordPress plugin's markup.
- **Great American Music Hall** and **The Chapel** (both SF) — confirmed
  to run the identical "See Tickets" embedded calendar widget; one parser
  covers both.
- **UC Theatre** (Berkeley) — a Webflow site on the Opendate venue
  platform; flagged in the code as the most fragile of the seven, since
  Webflow's auto-generated class names carry no semantic meaning and will
  break silently if the venue ever redesigns via Webflow's visual editor.

Every parser runs in its own try/catch so one venue's markup changing
doesn't take the others down — a per-venue failure surfaces in the
response's `meta.venues[].error` instead of silently vanishing, per this
project's "no silent failures" rule. Two correctness bugs were caught and
fixed during this build, both worth remembering for future scraper work:
(1) parsing a date string that still has a time-of-day attached (e.g.
"August 5, 2026 7:00pm") and round-tripping it through `Date`/UTC can land
on the WRONG calendar day for an evening show — fixed by always stripping
time-of-day before parsing, since only the date is needed; (2) the same
"See Tickets" widget uses a different wrapping CSS class per venue
(`event-title seetickets-calendar-event-title` on GAMH vs.
`title seetickets-calendar-event-title` on The Chapel) even though the
platform is identical — the shared parser matches on the common
`seetickets-calendar-event-title` class fragment rather than either
venue's exact full class string.

**Concrete validation, not just theory**: this build's own reconnaissance
found a real, previously-unknown second Black Uhuru date — **Sep 13, 2026,
Sweetwater Music Hall, Mill Valley** — distinct from the Feb 21 Freight &
Salvage date already logged above. Neither SeatGeek nor a manual pin had
ever surfaced this one. That's direct proof the venue-scraper approach
catches real gaps the artist-based SeatGeek sweep structurally cannot.

**`concert-radar.html` bumped to v15.** The Coming Soon sweep now runs the
existing per-artist `/api/tour-dates` sweep and one call to
`/api/venue-shows` in parallel (`Promise.all`) and merges both into the
same list before the existing de-dupe-by-id step — no schema change was
needed since `venue-shows.mjs` deliberately returns shows in the exact
shape `tour-dates.mjs` already used. `roadmap.html`'s Phase 11 description
updated to match (was still saying "backed by SeatGeek" and "Ticketmaster
...deliberately parked," both stale the moment this shipped).

**New weekly scheduled task**: Susan asked to "schedule a refresh on all
the inbound feeds weekly." This repo's own automation section above
documents a `weekly-vinyl-median-refresh` external scheduled task with
Jobs A-E — but as previously noted in this file's Job C bug-fix entry
(2026-07-29), a live session could not actually locate a trigger by that
name among Susan's current scheduled tasks; that gap is still unresolved
as of this pass (checked again — still not found under that name or
close to it). Rather than guess and edit the wrong existing trigger (risk:
"Weekly full-site review — five sites," a broader UI/UX review across all
five of Susan's projects, is semantically different work and was left
alone), a **new, separate weekly scheduled task** was created:
"Vinyl Scout — Concert Radar feed health check," Mondays. Scope is
deliberately narrow and honest about what's actually achievable
server-side: it verifies `/api/venue-shows` and `/api/tour-dates` are
still returning real data (catches a venue silently redesigning its site,
an expired SeatGeek/Ticketmaster credential, etc.) and reports any broken
venue or regression against the known Black Uhuru canaries. It does
**not** and cannot refresh Susan's own browser's `localStorage` cache
remotely — that stays automatic client-side (12h staleness check, or her
own Refresh click) since each browser's local storage is private to that
browser. *(Superseded in part by the 2026-08-04 "v18" entry below: the
manual Refresh click no longer exists — removed the same day — and a real
weekly server-side refresh now does exist, via
`netlify/functions/scheduled-sweep.mjs`. This task still can't reach into
an already-populated browser's local storage, which is the actual claim
this note was making; see the v18 entry for what changed.)* If the
`weekly-vinyl-median-refresh` trigger is ever actually located, folding
this check into it as a new Job (matching the existing A-E lettering)
would be tidier than two separate vinyl-related scheduled
tasks — flagged here for whoever finds it next.

## 2026-08-04 — v16: live crash, Refresh coverage gap, Watching moved server-side

Three issues, all found or requested in one live-review pass right after
v15 (the venue-shows.mjs build above) deployed — reported directly by
Susan, investigated and fixed in the same session rather than queued up.

**(1) Crash, reported within minutes: "you broke this... fix it."**
`concert-radar.html`'s Coming Soon panel was stuck showing a stale cached
list under the error text `Could not check your collection & wishlist:
Cannot read properties of null (reading 'trim')`. Root cause, traced
rather than guessed: `venue-shows.mjs`'s shape normalizer sets
`artist: s.artist || null` for every scraped show, but only the Another
Planet Entertainment parser (`parseApe`) ever populates `artist` — the
other six parsers (Cornerstone, Freight & Salvage, Sweetwater, both See
Tickets venues, UC Theatre) only ever extract a `title`. So 6 of 7 venues'
shows reached the client with `artist: null`. v15's new merge step concats
those directly into the same list `renderCard()` walks, and `renderCard()`
calls `isWatching(s.artist)` — which did `artist.trim()` with **no null
guard**, unlike `isShowWatched()` right next to it in the same file, which
already did `(artist || '').trim()`. First render after the sweep resolved
threw, the outer `.catch()` on the sweep chain caught it and overwrote the
status line with the raw error message, and because the throw happened
inside `renderList()` itself, the list underneath never got the chance to
update past whatever was cached.
Fixed at the actual source, not just where it threw: the sweep's merge
step now maps every venue show through `s.artist = s.artist || s.title`
before it's concatenated with the SeatGeek results, so a card always has a
real display name (previously it would've rendered the literal string
`"null"`, since `esc()` just calls `String()` on whatever it's given).
`isWatching()` and `findWatchMatches()` also picked up the same
`(x || '')` defensive guard `isShowWatched()` already had — belt and
suspenders, not a single-point fix, matching this file's own repeated
lesson (audio-preview matching saga, the Sade tribute-act bug) that a fix
should hold generally, not just patch the one call site that happened to
throw first.

**(2) Refresh gap, reported the same pass:** "the Refresh link should also
scrape the sites you set up this morning." The `/api/venue-shows` fetch
lived inside the sweep's `if (!artists.length) return …` early-return
branch, so a zero-artists edge case would skip the venue scrape entirely —
and, since the crash above was firing on every sweep including
Refresh-triggered ones, Refresh looked broken for the venue feeds even
though the fetch itself was already wired into the same `Promise.all` as
the SeatGeek sweep. venue-shows.mjs owes the catalog/wishlist nothing
(fixed venue list, not an artist lookup), so the fetch now kicks off
immediately in `sweepCatalog()`, in parallel with the artist lookup, and
merges in on both the empty-artists path and the normal path.

**(3) Data loss, reported by screenshot minutes later:** the Watching
panel (4 real artists — Thievery Corporation, Kruder & Dorfmeister, Steel
Pulse, Buena Vista Social Club) had gone completely empty in the same
Chrome window/profile Susan always uses, confirmed by a live read-only
screenshot of that exact browser roughly 10 minutes earlier showing all 4
still there — "the page should retain info between sessions, today it
seems to remove everything." Checked the code directly rather than
guessing: no path in `concert-radar.html` ever called
`localStorage.clear()` or overwrote `cr_watching_v1` with `[]` — every
write only ever pushes/splices the in-memory array before saving.
Whatever actually cleared it (a private window, a browser/OS-level storage
eviction, a tracking-prevention purge) was outside this app's control,
which is exactly the risk of keeping the only copy of real data in one
browser's local storage with nothing durable behind it. Susan confirmed
directly this was her regular browser/profile (not a different one) and
asked to move Watching server-side, same pattern the wishlist already
uses.
New `netlify/functions/watching.mjs` (ungated, same rationale + same
exception as `wishlist.mjs` v2 — casual state added from mobile, no
passphrase friction; separate `watching` Blobs store so a bug here can
never touch the catalog or wishlist stores) now owns Watching. `GET
/api/watching` returns all watched artists; `POST` upserts one by `id`;
`DELETE /api/watching/:id` removes one — same shape as `wishlist.mjs`.
`concert-radar.html` now loads `watching` via `GET /api/watching` on page
init instead of `loadJSON(LS_WATCH)`, and `addWatch()` / the Watching
panel's delete button now `POST`/`DELETE` against the endpoint instead of
writing localStorage — both surface a failure as visible, persistent text
in the Watching panel itself (a new `watchError` var rendered by
`renderWatchList()`) rather than failing silently, per this project's "no
silent failures" rule. The old `cr_watching_v1` localStorage key is left
alone rather than actively cleared, in case any browser's copy of it
somehow survived and is worth recovering by hand later.

**Same pass, a separate ask, now durable:** Susan named 3 artists from her
own list that fell outside every automated match this page runs
(SeatGeek's per-artist sweep from 2026-08-03, the venue scrape from
earlier today) — Easy Star All-Stars, Black Uhuru, Burning Spear — and
asked for them to be remembered as artists to follow. With Watching now
server-side, `watching.mjs`'s `GET` handler seeds these in itself on the
very first call ever made against the store: a `_meta_seed_v16_done`
sentinel record (filtered out of every response, never rendered as a card)
gates a one-time add of all three, so it fires exactly once regardless of
which browser or device makes that first request — and, being a
server-side gate rather than a per-browser localStorage flag, it can't
re-add one Susan deletes later from a different browser than whichever one
happened to trigger the seed. Black Uhuru seeds with city "Berkeley, CA"
(its verified Freight & Salvage date, logged 2026-08-04 above); Easy Star
All-Stars and Burning Spear seed with no city, since that same
investigation found no confirmed current Bay Area date for either — a
city would be a guess this project's "verify, don't assume" rule doesn't
allow.

`npm run check` passed; the inline `<script>` block in `concert-radar.html`
was also extracted and `node --check`'d directly as an extra syntax gate
before pushing, since there's no build step to catch a mistake here
otherwise. `concert-radar.html` bumped to v16 (in-file version comment;
one version bump covers all three fixes above, plus the new endpoint, in a
single deploy).

## 2026-08-04 — v16.1: poisoned cache showing "null" cards, movie screenings in Coming Soon

Reported live, minutes after v16 deployed: Coming Soon cards showing the
literal word "null" as the artist name, several of them grouped into one
card spanning dozens of "dates" (The Chapel: "Aug 6, 2026 – Jan 23, 2027 ·
77 dates"; Cornerstone: "19 dates") — "you pushed lots of null and lame
artists." Diagnosed by reasoning through the caching code rather than by
inspecting live data (this session's tools can't reach the live site
directly — robots.txt blocks WebFetch site-wide and the sandboxed shell has
no outbound network — so this was verified with a standalone Node
reproduction against the actual `groupCatalogShows()`/`esc()` logic instead,
included below).

**Root cause:** v1 of `venue-shows.mjs` (this morning's build) returned
`artist: null` for every show from 6 of its 7 venue parsers (only
`parseApe()` ever extracts a distinct artist — the rest only ever have a
`title`). Some browsers ran a sweep in the window between v15/v1 shipping
and v16's crash fix landing: that sweep successfully *fetched* real venue
data and called `saveCache()` — which happens **before** `renderList()` in
`sweepCatalog()` — and only crashed afterward, on render. So the browser's
`cr_catalog_cache_v1` genuinely held that raw, never-normalized shape.
`normalizeVenueShows()` (v16's client-side fix) only runs inside a live
sweep's own merge step, never when a cached snapshot is loaded straight off
localStorage — so every subsequent page load kept redisplaying the
poisoned cache, crash and all data quality issues included, until either
12h passed or Refresh was clicked. `esc(null)` stringifies to the literal
text `"null"` (confirmed with a one-line Node check), which is exactly what
rendered. And `groupCatalogShows()` keys each card on
`(artist||'').toLowerCase() + '|' + venue` — every null-artist show from
the same venue collapsed onto the identical `''` key, which is why *every
distinct real show* at a venue merged into one mega-card instead of one
card each. Reproduced standalone: assembling 5 distinct real Chapel shows
the way v1 did (`artist: s.artist || null`) produces exactly 1 grouped
card; assembling them the way v2 now does (`artist: s.artist || s.title`)
produces 5 separate cards, one per show — confirms the mechanism, not just
a plausible story.

**Fixed at the actual source this time, not just defensively client-side:**
`venue-shows.mjs` bumped to v2 — the final response shape now sets
`artist: s.artist || s.title || null` itself, so the API contract never
requires a caller to separately guess a display name (v16's client-side
`normalizeVenueShows()` guard stays in place too, belt and suspenders).
`concert-radar.html`'s cache key bumped `cr_catalog_cache_v1` ->
`cr_catalog_cache_v2` — the clean, deterministic fix for "some unknown
subset of browsers have a poisoned snapshot already sitting in
localStorage": every browser's stale cache is simply ignored on next load
instead of trusted, forcing exactly one fresh sweep through the
now-fully-fixed pipeline. No attempt was made to detect/repair the old
cache in place — bumping the key is simpler and certain to work regardless
of what's actually in any given visitor's storage.

**Second bug, same report:** "Aliens (Special Edition)" rendered as a
Coming Soon card. The Castro — one of the 6 venues `parseApe()` covers
through Another Planet Entertainment's shared listing page — is primarily
a repertory movie theater that also hosts concerts; its calendar mixes
film screenings in with real shows, and nothing filtered by event type,
only by venue name. New `NON_MUSIC_WORDS` blocklist (`special edition`,
`anniversary screening`, `screening`, `double feature`, `film festival`,
`movie night`, `q&a`) — same pattern as the existing `TRIBUTE_WORDS`
blocklist, kept as a separate list since this isn't a wrong-performer-match
problem, it's a not-music-at-all problem — filters every venue's results,
not just The Castro's. Verified against the actual regex: matches "Aliens
(Special Edition)", doesn't false-positive on a real act name.

Susan also asked to add real Watching detail (venue/date/ticket link) for
Black Uhuru, Easy Star All-Stars, and Burning Spear rather than leave them
on "Check live →". Investigated rather than complied blindly: Easy Star
All-Stars and Burning Spear still have zero confirmed current Bay Area date
per the 2026-08-04 research logged above — adding one now would be
fabricating data this project's "verify, don't assume" rule explicitly
forbids, so that was declined and flagged rather than done. Black Uhuru's
one *confirmed* date (Feb 21, 2026, Freight & Salvage) is now in the past
as of today (Aug 4, 2026); the *second*, still-upcoming date this morning's
venue-shows.mjs build claimed to find (Sep 13, 2026, Sweetwater Music Hall)
should surface automatically now that the cache-poisoning bug above is
fixed and a fresh sweep can run cleanly — not hand-added, since letting the
real pipeline surface it (or not) is more honest than pinning it in without
re-confirming it's still accurate.

## 2026-08-04 — v17: "Check live →" and manual Search only ever checked SeatGeek

Asked directly to "fix the Watching card and all its contexts." The
Watching panel's card display itself was already correct — `findWatchMatches()`
reads `comingSoonShows()`, which already includes venue-shows results from
the last sweep, so a confirmed match from either source renders inline
date/price/ticket-link the same way. The real gap was the *other* context
sharing this file's UI: `runLiveSearch()` — which powers both the manual
Search panel and the Watching row's own "Check live →" button — only ever
queried `/api/tour-dates` (SeatGeek). That's precisely backwards for Black
Uhuru, Easy Star All-Stars, and Burning Spear: those are exactly the
artists SeatGeek returns zero events for, which is the entire reason
`/api/venue-shows` was built this morning. Clicking "Check live →" for any
of them always came back "No SeatGeek performer found," even after the
venue scraper shipped and even once the cache-poisoning bug above was
fixed — because that code path never looked at venue-shows.mjs at all.

Fixed: `runLiveSearch()` now fires `/api/tour-dates` and `/api/venue-shows`
in parallel (same pattern the Coming Soon sweep already uses) and filters
the venue-shows results to whatever substring-matches the searched artist
— same loose match `findWatchMatches()` uses elsewhere in this file. If
SeatGeek resolves no performer but a venue show matches, the search still
renders that result instead of reporting "not found" — the searched name
becomes the display/watch target rather than requiring a SeatGeek
performer match first. Verified with a standalone Node reproduction:
simulated SeatGeek returning zero results for "Black Uhuru" alongside a
mock venue-shows response containing the real Sweetwater date, confirmed
the merge surfaces it instead of reporting not-found.
`concert-radar.html` bumped to v17.

## 2026-08-04 — v18: Watching venue detail, Coming Soon decluttered, real weekly server-side refresh

Two requests right after v17 deployed.

**(1) Watching panel missing venue/city.** The matched-show branch in
`renderWatchList()` already showed date, price, and a "Get tickets" link
for a confirmed match, but never *where* — asked directly to add "venue =
city, state" for every listing, explicitly including Black Uhuru, Easy
Star All-Stars, and Burning Spear. Added a venue line above the existing
date/price/tickets row, using the earliest match (`matches[0]`, already
sorted ascending — same convention the ticket link already used) and the
exact same "Venue — City, State" format `renderCard()` uses on Coming Soon
(`esc(s.venue || 'Venue TBA') + (s.city ? ' — ' + esc(s.city) : '')`), so a
watched artist's row reads consistently with the rest of the page. New
`.cr-watch-venue` CSS rule, sized between the artist name and the existing
`.cr-watch-info` badge row. Verified with a standalone Node reproduction of
`renderWatchList()` using a fake `findWatchMatches()`: Black Uhuru (real
Freight & Salvage match) renders venue+city+date+price+tickets correctly;
Burning Spear (no real match) still honestly falls back to the "Check
live →" button rather than fabricating a venue — this project doesn't
guess at data it doesn't have.

**(2) Coming Soon header decluttered.** Susan asked to remove the manual
"Refresh" link, the "Checked N artists · N minutes/hours ago" status line,
and the "+ Add a show Radar can't find" form entirely — HTML, CSS, and
every bit of JS that drove them (`els.soonRefresh`, `els.soonStatus`,
`els.manualToggle`/`manualForm`/`manualCancel`/`manualError`/`manualArtist`/
`manualDate`/`manualVenue`/`manualCity`/`manualUrl`, and every listener
attached to any of them — `resetManualForm()` and `fmtAgo()` removed
entirely as now-dead code). `sweepCatalog()` still runs exactly the same
background sweep it always did (triggered automatically on page load when
the local cache is missing or older than the existing 12h staleness
window) — it just no longer writes status text to an element that no
longer exists; a failed sweep now logs to the console instead of
displaying an error, since there's nowhere left to show one. Previously
manually-pinned shows (if any still exist in a browser's
`cr_added_shows_v1`) still display and can still be dismissed via the
existing per-card delete button — only the ability to add *new* ones
through the form is gone, since that's what was actually asked for.

Removing the Refresh button removed the only way to force fresh data
without waiting for a visit, and Susan asked directly for a weekly
scheduled refresh to replace it. Rather than lean on the existing
"Vinyl Scout — Concert Radar feed health check" scheduled task (which
explicitly documented, when it was created, that it "cannot refresh
Susan's own browser's localStorage cache remotely" — true, and still true
today, since a Claude-app scheduled task has no way to write into a
specific browser's local storage), built the real thing: a genuine
**Netlify Scheduled Function**.

New `netlify/functions/scheduled-sweep.mjs` (`export const config = {
schedule: '@weekly' }`) runs weekly on Netlify's own infrastructure,
independent of any visit or any Claude session. It deliberately does NOT
reimplement any matching logic — it calls this site's own already-public
endpoints (`/api/records`, `/api/wishlist`, `/api/tour-dates`,
`/api/venue-shows`) exactly the way the client's `sweepCatalog()` already
does, using `process.env.URL` (Netlify's own site-URL env var, with the
production domain hardcoded as a fallback) to build absolute URLs, so
`tour-dates.mjs`'s four rounds of hard-won tribute-act/exact-match fixes
never get a second, drifting copy. Merges and de-dupes the same way the
client does, and writes `{ shows, artistCount, at }` to a new
`catalog-cache` Blobs store. New `netlify/functions/catalog-cache.mjs`
(`GET /api/catalog-cache`, pure read) serves that back out.
`concert-radar.html` now calls this endpoint, but ONLY as a first-paint
fallback when a browser has no local cache of its own yet (new device,
cleared profile) — it renders that instantly, then still kicks off its own
live `sweepCatalog()` regardless, so the weekly job is a floor, not a
replacement for live freshness on an actual visit. Verified the
merge/dedupe logic (identical in shape to the client's own
`normalizeVenueShows`/`dedupeById`) with a standalone Node reproduction
using fake tour-dates and venue-shows responses, including a
co-headline-bill-style duplicate `id` shared across both sources, and
confirmed `npm run check` (`node --check` on every `.mjs` function,
including the two new ones) passes clean.

Also updated the existing "Vinyl Scout — Concert Radar feed health check"
weekly scheduled task (Mondays, unchanged cadence) with a new step 2.5:
fetch `/api/catalog-cache` and confirm its `at` timestamp is no more than
~9 days old, as a way of catching scheduled-sweep.mjs silently failing to
fire or erroring on Netlify's side — that check has no ability to trigger
or repair Netlify's own scheduler, only to flag it in its weekly report if
the job looks dead. The task's own "what this does NOT do" note was
updated to stop implying no real weekly refresh exists at all — one does
now, it just isn't this trigger.

`concert-radar.html` bumped to v18.

## 2026-08-04 — v18.1: stale cache + no fallback for genuinely-unmatched watched artists

Live-caught via a screenshot Susan sent hours after v18 deployed: Black
Uhuru, Easy Star All-Stars, and Burning Spear were all still stuck showing
"Check live →" in the Watching panel, despite v18's own changelog entry
above documenting a real, confirmed Black Uhuru match (Sweetwater Music
Hall, Sep 13, 2026). Asked directly to either fix the 3 artists' missing
info or give a way to add it manually. Two distinct problems, both
introduced by v18 itself, not by this build's earlier work:

**(1) Stale cache with no way left to force a refresh.** v18 removed the
manual Refresh button in the very same pass that shipped the Black Uhuru
match — a browser whose `cr_catalog_cache_v2` localStorage cache predated
that match being found had no way left to force a re-sweep short of
waiting out the 12h staleness window (`CACHE_MAX_AGE_MS`) or clearing site
data by hand. This is exactly the same failure shape as the v16.1
poisoned-cache incident, just a different root cause (genuinely-stale data
this time, not malformed data) — same fix: `LS_CACHE` bumped again,
`cr_catalog_cache_v2` -> `cr_catalog_cache_v3`, forcing every browser
(including Susan's) through one fresh sweep on next load.

**(2) No fallback when the automated pipeline is honestly empty.**
Bumping the cache only helps if a real match actually exists server-side.
`watching.mjs`'s own seed comment already documents that Easy Star
All-Stars and Burning Spear have "no confirmed current Bay Area date" —
for those two, a fresh sweep legitimately finds nothing, same as before.
Removing the Coming-Soon-wide "+ Add a show Radar can't find" form
earlier the same day (also part of v18) took away the only way to handle
that honestly-empty case by hand. Fixed with something narrower than what
was removed: a scoped "+ Add show details" button now sits next to "Check
live →" on any Watching row with no automated match. It opens one shared
form (`#cr-watch-detail-form`, a single instance reused across every row,
not one form per artist) with the target artist locked in via a
`watchDetailTarget` variable set on open. On submit it pushes into the
exact same `addedShows`/`cr_added_shows_v1` mechanism the old Coming-Soon
form used — deliberately reused rather than reinvented, since
`findWatchMatches()` already reads `comingSoonShows()`, which already
folds in `addedShows`. That means a hand-entered show needs no new
display path at all: it renders in that artist's Watching row immediately
after save, with the identical venue/date/price/tickets layout an
automated match gets, tagged `source: 'Manual entry'` same as before.

Verified with a standalone Node reproduction of `renderWatchList()`: (a)
simulated zero catalog matches for Black Uhuru and confirmed both "Check
live" and "+ Add show details" render on that row; (b) simulated saving
Sweetwater Music Hall / Sep 13, 2026 / a real ticket URL for Black Uhuru
and confirmed the row immediately re-renders with venue "Sweetwater Music
Hall — Mill Valley, CA" and the ticket link, no stale "Check live" left
over; (c) confirmed Burning Spear, untouched by the simulated save,
correctly still shows "Check live" rather than picking up Black Uhuru's
details or fabricating its own — the either/or substring-match logic in
`findWatchMatches()` was not touched by this fix, only what feeds it.
`npm run check` passes clean (no `.mjs` files touched by this fix — it's
entirely within `concert-radar.html`).

`concert-radar.html` bumped to v18.1.

## 2026-08-04 — v18.2: ambiguous loading state + real shows for the 3 gap artists

Two more things, minutes after v18.1's cache-bump fix deployed.

**(1) "You also killed all the detail in coming soon."** Susan sent a
screenshot showing "Coming Soon (0)" / "No upcoming shows found for your
collection & wishlist near Berkeley yet." for the ENTIRE panel — not just
the 3 gap artists, but Kruder & Dorfmeister and Thievery Corporation too,
both of which had real matches minutes earlier in an earlier screenshot
the same session. A follow-up screenshot a minute later showed both back
to normal, which is the tell: this wasn't real data loss, it was a race
made visible by v18.1's own fix. v18 removed the last visible sign a
sweep was in progress ("Checking N of M artists…" status text); v18.1
then made every browser force a fresh sweep on next load (the `LS_CACHE`
v2 -> v3 bump). Combine those two and a page load with no local cache had
*zero* signal while `sweepCatalog()` was still in flight — an empty Coming
Soon rendered identically whether it was "still loading" or "genuinely
nothing found," and Susan happened to screenshot during the loading
window.

Fixed properly rather than just reverting the cache bump: `sweepCatalog()`
now returns its own promise chain (`return fetchDistinctArtists().then(...)`
instead of firing it and returning nothing), so a caller can tell when the
sweep has actually settled, not just when it started. A new
`initialLoadInFlight` flag starts `true`, clears only once the first real
load has settled (either "already had a cache, no ambiguity" or "the
no-cache branch's `fetchServerCatalogCache()` → `sweepCatalog()` chain
resolved"), and `renderList()`'s empty branch checks it: `true` → a plain
"Loading…", `false` → the real "nothing found" message. No per-artist
progress spam brought back — just enough signal that "empty" and "still
working on it" are never visually identical again. Verified with a
standalone Node reproduction mocking a slow network (artificial delay on
`/api/tour-dates` and `/api/venue-shows`): confirmed the very first
`renderList()` call, before anything resolves, lands with the flag still
`true` and zero data (the loading window), and that a genuinely-empty
result (mocked zero records, zero wishlist, zero venue shows) still
resolves the flag to `false` cleanly afterward rather than hanging.

**(2) "Go out and scrape the details for black u, easy star and burning
spear. add them to coming soon."** Direct instruction after the fresh
sweep (v18.1) still came up empty for all three in the Watching panel.
`vinylscout.org`'s own API is off-limits to WebFetch (site-wide
`Disallow: /` in `robots.txt`, confirmed again by testing it directly —
not worked around by any other method, per this project's hard rule), so
this couldn't be diagnosed by asking the live site anything. Researched
each artist's real touring status against outside sources instead —
Songkick, Bandsintown, and a general web search first, then each
*venue's own official site* for anything promising, same verification
bar this whole project already holds venue-shows.mjs to (never trust an
aggregator alone):

- **Black Uhuru** — confirmed for real, directly on
  `sweetwatermusichall.org`'s own events page: Sunday, Sep 13, 2026,
  Sweetwater Music Hall, Mill Valley, CA, with a working ticket link.
  Notable: Sweetwater is already one of venue-shows.mjs's 7 scraped
  venues (`parseSweetwater`) — this show being real, currently listed on
  the venue's own site, and STILL not surfacing through the scraper
  points at an actual bug in `parseSweetwater` or a change to
  Sweetwater's page since it was last verified. Not root-caused today
  (no raw HTML access from this session — WebFetch summarizes rather
  than returning raw markup, and this sandbox's `bash`/`curl` has no
  general outbound network access at all, confirmed by testing) — flagged
  here and in venue-shows.mjs's own header for whoever picks up
  `parseSweetwater` next, ideally the weekly "Concert Radar feed health
  check" scheduled task, which already has real WebFetch access to fetch
  and compare against the live page.
- **Easy Star All-Stars** — confirmed for real, directly on
  `guildtheatre.com`'s own calendar: Saturday, Oct 24, 2026, The Guild
  Theatre, Menlo Park, CA, with a working ticket link. A second possible
  date (Oct 22, Cornerstone Berkeley) showed up on Songkick but is **not**
  listed on Cornerstone's own site (`cornerstoneberkeley.com/events`) as
  of this check — left out rather than added on an aggregator-only claim.
- **Burning Spear** — **not added.** Checked Songkick, Bandsintown, and a
  general web search; no real Bay Area date exists anywhere right now.
  The closest real shows are a European tour and "Reggae on the River"
  (Piercy, CA — roughly 200 miles north of the Bay Area, Aug 14-16, 2026),
  neither of which is honestly "Bay Area." Reported this plainly rather
  than stretching the definition or fabricating something to have an
  answer — Burning Spear's Watching row keeps showing "Check live" / "+
  Add show details" until a real match exists.

Both real shows added as `MANUAL_SHOWS` entries in `venue-shows.mjs`
(**v3**) — a small hardcoded array, clearly tagged `"Manual entry —
verified 2026-08-04"` (never `"Venue: ..."`, so they can never be
confused with the scraper's own live output), merged into the response
after the normal per-venue scrape and run through the exact same
`date >= todayIso` filter everything else gets, so an entry here won't
linger in the response past its own show date. No `concert-radar.html`
code change was needed for this half of the fix — `findWatchMatches()`
already reads whatever `venue-shows.mjs` returns, so both shows appear in
the Watching panel (venue, date, tickets) the moment a browser's next
sweep picks them up, same as any scraped match. Verified with a
standalone Node reproduction of the merge/filter/sort logic added to
`venue-shows.mjs`: confirmed Black Uhuru and Easy Star All-Stars both
appear with the correct venue/city/date/URL, confirmed Burning Spear is
correctly absent (not fabricated), and confirmed both entries carry the
`"Manual entry"` source tag. `npm run check` passes clean.

`concert-radar.html` bumped to v18.2; `venue-shows.mjs` bumped to v3.

## 2026-08-04 — venue-shows.mjs v4: a second real Easy Star All-Stars show, flagged directly by Susan

Susan pushed back on the v3 entry above: "easy star all stars is at the
cornerstone." v3 HAD checked this exact date/venue (Oct 22, 2026,
Cornerstone Berkeley) — it showed up on Songkick's artist-calendar page
during the original research pass, but got left out because
Cornerstone's own site (`cornerstoneberkeley.com/events`) didn't confirm
it, same discipline this whole file already holds itself to. Re-checked
at Susan's prompt, three more ways: Cornerstone's own site again (full
listing, July–November 2026, no Easy Star anywhere), Cornerstone's
SeatGeek venue page (no), Cornerstone's own Songkick venue page (no). But
Songkick's *specific dated event page* for this show
(`songkick.com/concerts/43348377-easy-star-allstars-at-cornerstone-berkeley`)
does exist, names the exact venue and date, and shows "tickets on sale"
via Prekindle — asked Susan directly where she was seeing it (in case it
was showing up somewhere I could verify more directly, like the live
site's own data), and she confirmed the same Oct 22 Cornerstone date.

Given a live, dated, specific third-party event page plus Susan's own
direct confirmation, added it as a second `MANUAL_SHOWS` entry for Easy
Star All-Stars — this is a DIFFERENT real show from the Oct 24 Guild
Theatre one (a band playing two Bay Area dates five days apart on the
same tour swing is completely ordinary, not a duplicate or a correction).
Being straight about what's different here versus every other entry in
this file: no vendor ticket link could be found (Prekindle's own listing
wasn't reachable from this session), so `url` points at the Songkick
event page instead of a direct purchase link, and the `source` field
itself says `"...(Songkick, not venue-confirmed)"` rather than the plain
`"Manual entry — verified..."` every other entry uses — visible in the
actual API response, not just a comment. Also worth another mention: this
is now the SECOND known real show a venue-shows.mjs parser should have
caught and didn't (Sweetwater/Black Uhuru was the first, per v3's own
entry above) — Cornerstone is `VENUES[0]` (`parseCornerstone`), so if this
show is genuinely live and on-sale, that parser has the same kind of gap.
Not root-caused today, same reason as the Sweetwater one: no raw HTML
access from this session to compare against the parser's actual regex.

Verified with a standalone Node reproduction of the merge/filter/sort
logic: confirmed both Easy Star All-Stars entries (Oct 22 Cornerstone,
Oct 24 Guild Theatre) survive with distinct ids, confirmed Black Uhuru is
untouched, confirmed Burning Spear is still correctly absent, confirmed
sort order puts Black Uhuru (Sep 13) first, then Cornerstone (Oct 22),
then Guild Theatre (Oct 24). `npm run check` passes clean.

`venue-shows.mjs` bumped to v4.

## 2026-08-04 — concert-radar.html v18.3: same stale-cache bug, third time today, fixed at the root

Susan reported "neither show up" after venue-shows.mjs v4 deployed. Same
underlying bug as v18.1's entry above, recurring for the third time in one
day: Susan's browser had already run its one v18.1-forced fresh sweep
BEFORE venue-shows.mjs's v3 (Black Uhuru, first Easy Star date) and v4
(second Easy Star date) ever existed server-side. With `CACHE_MAX_AGE_MS`
still at 12h and no manual Refresh left to force a re-check, that stale
sweep just kept being trusted — the exact same failure shape as v18.1,
just triggered by a second and third round of server-side data changes
instead of the first.

v18.1 treated this as a one-time event (bump the cache key, move on).
Today made clear it isn't one-time — this is an ordinary side effect of
actively iterating on `venue-shows.mjs`'s `MANUAL_SHOWS` list the same
day it shipped, and it will keep happening on any day server-side show
data changes more than once. Bumping `LS_CACHE` a third time (`v3` ->
`v4`) clears the immediate problem, same as before. This time also fixed
the actual cause: `CACHE_MAX_AGE_MS` cut from 12h to 1h, so a same-day
server-data change reaches an already-cached browser within the hour on
its own, without needing another manual version bump every time. 1h is a
deliberate middle ground — short enough to match how often this data is
realistically changing right now, long enough not to multiply live
SeatGeek/venue-scrape calls on every ordinary page visit (still bounded
by `SWEEP_CONCURRENCY` regardless).

No new verification needed beyond what v18.1/v18.2/v3/v4 already covered
— this is a pure timing-constant change, not new logic. `npm run check`
and the extracted-script `node --check` both still pass clean.

`concert-radar.html` bumped to v18.3.

## 2026-08-04 — v18.4: artist-name normalization fix, real E2E harness, feeds roadmap, Phase 10 plan (unattended, Susan headed out)

Susan reported the v18.3 cache fix still didn't surface Black Uhuru or
Easy Star All-Stars ("pushed but still don't think its working/showing
up"), then said she needed to head out for the day and listed five more
things to do while she was away — ticketmaster/other feeds on the
roadmap, a full E2E test, a documentation pass covering the whole day,
and a plan for connecting Concert Radar to Travel Intelligence, to be
added to both roadmaps. Everything below ran unattended per this
project's standing "make reasonable judgment calls, proceed" rule for
when Susan isn't available to answer follow-ups.

**Root-cause re-investigation.** Three stale-cache "fixes" in one day
(v18.1, v18.3) and the bug still not resolved was itself a signal the
cache theory was wrong or incomplete — v18.3's `LS_CACHE` bump forces a
guaranteed-fresh sweep on next load, so if the real data was actually
there and still didn't render, the bug had to be in the match logic, not
the cache. Re-read `findWatchMatches()`, `isWatching()`, and
`isShowWatched()` line by line: all three compare raw-lowercased artist
strings via substring match, with zero tolerance for punctuation or
spacing drift. `MANUAL_SHOWS`' own spelling is "Easy Star All-Stars"
(hyphenated) — a watching-list entry saved any other way ("Easy Star
Allstars", "Easy Star All Stars") would silently fail to substring-match
it, with nothing anywhere to flag the mismatch. This is a highly
plausible real bug, not a guess dressed up as one: band names get typed
inconsistently across sources constantly, and this project's own watched-
artist list was seeded at different times from different inputs (see the
v16 entry above — `watching.mjs`'s one-time seed).

**Fix:** added `normalizeArtistKey()` to `concert-radar.html` — folds
hyphens and commas to spaces, strips apostrophes/periods, expands "&" to
"and", collapses whitespace, lowercases. Every artist-name comparison in
the file (`findWatchMatches`, `isWatching`, `isShowWatched`) now runs
both sides through it before comparing, instead of comparing raw
lowercased strings. Verified with a standalone Node unit pass (not the
E2E harness below, a separate quick check first) against 9 cases
including "Easy Star All-Stars" vs "Easy Star Allstars" (deliberately
does NOT match — see the code's own comment on why that boundary was
chosen: collapsing a hyphenated multi-word name into a single fused word
is a bigger change than punctuation drift, and matching it risked new
false positives elsewhere) and "Easy Star All-Stars" vs "Easy Star All
Stars" (matches). `concert-radar.html` bumped to v18.4.

**Honest limit, stated plainly:** this session had no way to see Susan's
actual stored `/api/watching` data (no browser, no API access from this
sandbox), so this fix addresses the single most likely bug class given
everything else already checked out (the data itself is correct per
`venue-shows.mjs`'s MANUAL_SHOWS, the merge/dedup logic is correct, the
cache is now fast-expiring) — but it cannot be verified as THE actual fix
for Susan's specific case without seeing what her watching list actually
has stored for these two artists.

**Real end-to-end regression harness, not another reimplementation.**
Every prior verification pass this project has done for Concert Radar
(v16.1's poisoned-cache reproduction, v18.1's `renderWatchList()`
reproduction, v18.2's slow-network reproduction) worked by re-implementing
the relevant logic in a standalone Node script and testing that
re-implementation — useful, but it can't catch a bug in the ACTUAL shipped
code if the reproduction quietly diverges from it. `jsdom` was installed
(`npm install jsdom`, now a devDependency) and `scripts/e2e-concert-radar.mjs`
loads the real `concert-radar.html` into a real jsdom document, mocks every
`fetch()` call the page makes (`/api/records`, `/api/wishlist`,
`/api/watching`, `/api/venue-shows`, `/api/catalog-cache`, `/api/tour-dates`)
with fixture data, `window.eval()`s the page's actual extracted inline
`<script>` (not a copy) against that mocked environment, waits for the DOM to
settle, then reads the real rendered `#cr-watch-list` HTML. Two runs: one
with watching-list spellings matching `MANUAL_SHOWS` exactly, one with
realistic drifted spellings ("Easy Star All Stars", lowercase "black
uhuru"). Both runs: Black Uhuru and Easy Star All-Stars render with venue
detail (a real match), Burning Spear still honestly renders "Check live"
(no fabricated match — confirms the fix didn't introduce a false
positive). `npm run test:concert-radar-e2e` added to `package.json`. This
is now the standing regression check for this feature's matching logic
going forward — prefer extending this harness over writing another
one-off reproduction script for the next Concert Radar matching bug.

**Feeds roadmap.** Susan asked directly to add Ticketmaster and other feeds
to the roadmap. Added a consolidated subsection to PROJECT.md's Phase 11
(full detail there, not repeated here) covering Ticketmaster (in progress,
blocked on an account issue with their support), Bandsintown (re-researched
this session per Susan's own "bands in town" suggestion — real API needs a
non-self-serve `app_id`, not available for hobby use; public pages exist but
most dates are behind client-side pagination a server fetch can't see, so a
scrape would be incomplete), Songkick (application page currently closed;
already a de facto source via specific event-page URLs in two `MANUAL_SHOWS`
entries even without API access), Eventbrite (dead API, confirmed again),
Dice.fm and PredictHQ (neither viable, no free/self-serve tier), and Spotify
Concerts (stays parked, same discipline as YouTube's audio-preview
last-resort tier — only built if a real gap shows up that nothing else
closes). `roadmap.html`'s Phase 11 description updated to match.

**Phase 10 (Travel Intelligence hooks) — full technical plan drafted.**
Susan asked to "plan for our big feature tomorrow" — connecting Concert
Radar to travelintelligence.org bidirectionally, in her own words: "if i'm
watching a fare like Chicago you check the feeds to see who i am interested
in that is also playing in town during those dates when i'll be there."
Full plan written into PROJECT.md's Phase 5+ section (not duplicated here):
generalizing `tour-dates.mjs` beyond its hardcoded Berkeley lat/lon and
adding a date-window filter it currently lacks, a new
`GET /api/artists-playing?lat=..&lon=..&date_start=..&date_end=..` endpoint
reusing the existing artist-resolution/tribute-filtering pipeline, and a
note that Travel Intelligence's own side needs a matching
`GET /api/watched-trips` read endpoint this repo doesn't own. Recommends a
live-lookup v1 (mirroring how Concert Radar itself started before
`scheduled-sweep.mjs` was added later purely for fast first-paint, not
because live sweeping was too slow to be correct) rather than building a
cross-site caching layer speculatively. Two open questions flagged for
Susan rather than guessed at: geographic radius for non-Bay-Area cities,
and whether a match should draw from the full catalog/wishlist or just the
curated Watching list (this plan defaults to Watching-only as the more
literal reading of "artists i am interested in," pending confirmation).
Since this session's sandbox has no write access to the Travel Intelligence
repo (only `vinyl-scout-repo` is connected via the device bridge this
session), a standalone copy of the Travel-Intelligence-side half of this
plan was written to a file and sent directly to Susan via `SendUserFile`
for her to drop into that project whenever she opens it next, rather than
silently only half-writing "both roadmaps" as asked.

**Weekly health-check trigger prompt corrected.** Separately, re-read the
"Vinyl Scout — Concert Radar feed health check" scheduled task's current
prompt and found it still claimed "robots.txt explicitly allows a
'Claude-User' agent" — directly contradicted by this session's own repeated
direct testing (a fresh `WebFetch` attempt against `vinylscout.org/robots.txt`
this session returned `ROBOTS_DISALLOWED` again). Corrected via
`update_trigger`: the prompt now states the block is total and site-wide
with no agent exception, and instructs going straight to Claude-in-Chrome
browser tools instead of trying WebFetch first.

**What could not be verified this session, stated plainly rather than
glossed over:** no live browser (Claude-in-Chrome never connected this
session) or direct API access (WebFetch blocked, no outbound curl from
either this sandbox or the device bridge) was available at any point.
Nothing in this entry — the v18.4 matching fix, the E2E harness's
fixture-based pass, the feeds/Phase-10 planning — was confirmed against
the actual deployed site or Susan's actual live data. `npm run check`
and the extracted-script `node --check` both pass; the jsdom E2E harness
passes against its own fixtures. The next live session (or the weekly
health-check task once it next fires) should verify directly against
the deployed site once Susan has pushed and deployed this commit.

## 2026-08-04 — v18.5: venue-scraped calendars were showing unfiltered in Coming Soon

Susan, back at her screen briefly: "it seems to be putting the entire
sweetwater calendar in coming soon / use the logic in place to filter for
relevancy."

**Root cause.** `venue-shows.mjs` deliberately returns every show at its 7
scraped venues with zero artist filtering server-side — that's by design
(see that file's own header: "pure read of public event data, no
catalog/wishlist exposure"). The bug was on the client: nothing ever
filtered that response back down before merging it into Coming Soon.
`sweepCatalog()`'s own v16 comment ("has nothing to do with what's in the
catalog/wishlist") was describing the fetch accurately but nobody noticed
the display side never applied a relevancy filter either — so every one of
the 7 venues' full calendars was reaching Coming Soon unfiltered the whole
time this feature has existed. Susan happened to notice it via Sweetwater
specifically (probably because that's the venue she was already looking at
for the Black Uhuru show), but this affected all 7 venues equally.

**"The logic in place," as Susan put it, already existed** — `runLiveSearch()`
(the ad-hoc Search panel) already filtered `venue-shows.mjs`'s results down
to whatever substring-matched the one artist name Susan typed in. The fix
is that same filter, applied to `sweepCatalog()` too, scoped to the full
list of artists Susan actually cares about instead of one typed name.

**What changed:**
- New shared `artistIsRelevant(showArtist, relevantNames)` — same
  normalized substring match `findWatchMatches()`/`isWatching()`/
  `isShowWatched()` already use (v18.4's `normalizeArtistKey()`), reused
  rather than a fourth copy of the same logic.
- `fetchDistinctArtists()` now also fetches `/api/watching`, not just
  `/api/records`/`/api/wishlist` — a watched-only artist with no
  catalog/wishlist entry (Black Uhuru) needs to count as "relevant" too,
  both for this filter and so it finally gets its own direct SeatGeek
  sweep (a real gap that existed before this fix — watched-only artists
  never got queried against `/api/tour-dates` at all until now).
- `sweepCatalog()` now filters `venue-shows.mjs`'s response through
  `artistIsRelevant()` against that full artist list before merging into
  `catalogShows` — an irrelevant venue show (the vast majority of any real
  venue's calendar) never reaches Coming Soon anymore. The old
  zero-artists early-return branch was removed — `artistIsRelevant`/
  `mapLimit` both handle an empty artist list safely (matches/queries
  nothing), so it was redundant and asymmetric with the new filtered path.
- `runLiveSearch()`'s own venue-match filter upgraded from a raw
  lowercase substring compare to `artistIsRelevant()` too, closing the
  same punctuation/spacing gap v18.4 fixed for Watching in this sibling
  code path (a search for "Easy Star All Stars" with no hyphen now finds
  a venue show filed as "Easy Star All-Stars," same as Watching does).

**Verification.** Extended `scripts/e2e-concert-radar.mjs` (real DOM, real
shipped code, not a reimplementation — see v18.4's entry above for why this
harness exists) with three new fixture shows: two irrelevant Sweetwater
listings (an unrelated jazz quartet, an open mic night) and one relevant-
but-unwatched match (Thievery Corporation, already in the `records`
fixture, at a different scraped venue). Confirmed: both irrelevant shows
no longer reach `#cr-list`, the relevant-but-unwatched match still does,
and Black Uhuru/Easy Star All-Stars still match correctly in Watching under
both exact and drifted spellings — the relevancy filter doesn't over-correct
into hiding real matches. `npm run check` and the extracted-script
`node --check` both pass. `concert-radar.html` bumped to v18.5.

**Not verified live** — same standing caveat as v18.4: no browser/API
access this session, so this is confirmed against the E2E harness's
fixtures, not the actual deployed site or Susan's real venue-shows/watching
data. Worth a real look at vinylscout.org/concert-radar next live session.

## 2026-08-05 — Phase 10 live: `/api/artists-playing` shipped without CORS headers, silently broke the whole cross-site feature

Phase 10 (Travel Intelligence hooks, planned 2026-08-04 above) shipped the same day as the plan's write-up, as commit `e3a3815`: `netlify/functions/artists-playing.mjs` (new), `tour-dates.mjs`/`venue-shows.mjs` reused as designed, `concert-radar.html` and Travel Intelligence's own `index.html`/`watched-trips.mjs` wired together. `scripts/test-artists-playing.mjs`'s pure-function tests passed, `node --check` passed, and every direct check of the live endpoint that session (curl-equivalent fetches, this session's own tool calls, even a real browser hitting the URL directly) returned a correct 200 with real JSON. By every test that mattered up to that point, this endpoint was done and working.

**Susan reported the feature doing nothing on the live site** — no `.concert-match` note ever appeared next to her watched Chicago trip, even after an unrelated Travel Intelligence-side bug (a `CITY_COORDS` gap — see that repo's own build log) was found and fixed, and even after Susan confirmed via her own browser that Travel Intelligence's `/api/watched-trips` was returning correct data.

**Root cause: `artists-playing.mjs`'s `json()` helper never set `Access-Control-Allow-Origin`.** This function is called two different ways: (1) directly, server-to-server or via any tool/browser hitting the URL on its own — which is every check that had been run so far, and which never needs a CORS header to succeed; and (2) cross-origin, from inside `travelintelligence.org`'s own client-side JS (`checkConcertMatches()` in that repo's `index.html`), which is the ONLY way this feature is actually used in production. A browser enforces CORS on the *reading* side of a cross-origin fetch: the request still goes out, the server still returns a real 200 with the right data, and then the browser discards it before the calling page's JavaScript ever sees it, specifically because the response never said `travelintelligence.org` was allowed to read it. `checkConcertMatches()` wraps that fetch in a deliberately silent `try/catch` (so a real outage never breaks the watched-trips row) — so this failure produced no visible error anywhere, on either site, for either developer. It looked exactly like "no matches found," which is indistinguishable from "the fetch never even completed" from the UI alone.

**Why every prior verification missed it:** none of curl/WebFetch/a server-side test/Node's own `fetch()`/even a browser hitting the URL directly are cross-origin requests — CORS is a browser-enforced restriction that only applies when the page making the request is a different origin than the page being fetched, and only when JavaScript is doing the reading. Every check run for Phase 10, including "worked fine when I opened it directly in my browser," was structurally incapable of catching this, because none of them were the one specific call pattern (cross-origin `fetch()` from `travelintelligence.org`'s own JS) that actually matters in production.

**Fix:** `json()` now sets `Access-Control-Allow-Origin: https://travelintelligence.org` (the one real caller — allow-listed explicitly rather than `*`, since being precise about the intended consumer costs nothing here; the response body was already public data either way, so this isn't an access-control change) plus `Vary: Origin`. Applies to every response `json()` produces, success and error alike, so a 400/405 during future debugging still carries the header too. `scripts/test-artists-playing.mjs` gained two new asserts that call the exported default handler directly (an invalid-lat/lon 400 and a wrong-method 405, neither of which touch Blobs or SeatGeek) and check `Access-Control-Allow-Origin` on the `Response` object — the header is now under regression test, not just "worked when I looked at it once." Full suite: 20/20 passed (18 original + 2 new).

**Lesson for this project, stated plainly:** for any endpoint whose real caller is a *different origin's browser-side JavaScript* (as opposed to a same-origin page, a server, or a manual/tool check), "I hit the URL directly and got a 200" is not sufficient verification — it structurally cannot catch a missing-CORS-header bug, because that class of bug only manifests for the one call pattern that's hardest to reproduce by hand. The actual test that would have caught this same-day is either a two-origin browser test (a real page on one origin `fetch()`-ing a real endpoint on another, in an actual browser or a tool that enforces CORS) or, more simply, asserting the header exists directly on the `Response` object in a unit test — which is what the fix above now does going forward. Any other cross-origin endpoint this project adds later should get the same header-level assertion from day one, not bolted on after a user reports "it's just not doing anything."

## 2026-08-06 — Concert Radar E2E harness gains real Travel Intelligence coverage; package.json wiring gap closed

Comprehensive verification pass across both this repo and Travel Intelligence's, prompted by Susan asking to confirm everything end-to-end after the CORS fix above went live. Two real, additive findings here (unrelated to the false "bugs" found on the Travel Intelligence side that same night — see that repo's own build log for the correction on those):

**`scripts/e2e-concert-radar.mjs` had no coverage at all for `checkTravelMatches()`** (the Phase 10 function above that fetches `travelintelligence.org/api/watched-trips` then this site's own `/api/artists-playing` and appends a `.travel-match` note to the matching Watching row) — a real gap flagged back in the 2026-08-05 Incident #2 writeup on the Travel Intelligence side ("worth closing next time this file is touched") but never actually closed until now. Note: this file already had a separate, legitimate, *uncommitted* local change sitting in the working tree when this session started — real v18.4/v18.5 regression coverage (documented above) that had apparently been written but never committed. Verified it ran clean (all existing assertions passing) before building on top of it, rather than discarding or overwriting it.

Added three new scenarios to the harness, exercising the real shipped `checkTravelMatches()` code (not a reimplementation) against mocked `fetch()` responses for both cross-site calls:
1. A real hit — a mocked watched trip to Chicago plus a mocked `/api/artists-playing` response naming a watched artist (Black Uhuru) and an unrelated one. Confirms the `.travel-match` note renders on the correct row only, with the correct destination/date/venue text, and that the unrelated artist and other watched artists get no note.
2. No watched trips at all — confirms a clean no-op, no notes anywhere, no throw.
3. `travelintelligence.org` unreachable — confirms `checkTravelMatches()`'s outer `.catch()` swallows the failure silently, matching documented fire-and-forget behavior, with every row rendering exactly as it already did.

Also added lightweight pass/fail tracking (`report()`) so this harness now exits non-zero if any of its self-reporting assertions fail, instead of always exiting 0 regardless of output — makes it usable as a real gate, not just a printout someone has to read. Deliberately left the original v18.4 MATCHED/NO MATCH/unclear watch-list lines as plain diagnostic output, unchanged — collapsing those into a binary pass/fail risked asserting something the harness's original author never actually claimed (Burning Spear correctly getting "NO MATCH" is expected behavior, not a failure).

**`package.json` never wired `scripts/test-artists-playing.mjs` into anything runnable by name** — it existed, passed 20/20 assertions (see the CORS entry above), and was even referenced in this file's own history, but the only way to run it was typing the full `node scripts/test-artists-playing.mjs` command by hand; nothing in `package.json` pointed at it. Added `"test:artists-playing"` (matching the existing `test:audio-preview`/`test:concert-radar-e2e` naming) plus a new combined `"test"` script (`check` + all three named test scripts) so `npm test` runs everything in one command, the same pattern Travel Intelligence's `package.json` already uses.

**Verified:** `npm test` (the new combined script) runs clean — `check` (all functions `node --check`), 17/17 audio-preview, 20/20 artists-playing, and the extended E2E harness's 37 self-reporting assertions all pass, exit code 0.

## 2026-08-06, later — real Chicago show entered; concert-radar.html gains a deep-link entry point

Live-verified via a real browser round trip (Claude-in-Chrome) that the
whole cross-site feature above genuinely works: Ziggy Marley (Hunter
Pavilion, Highland Park IL, Sep 17 2026 — a real Songkick-sourced show,
not indexed by SeatGeek) was added to the Watching panel's "+ Add show
details" manual-entry form, and Travel Intelligence's watched-trips card
picked it up correctly ("🎵 2 artists you follow are playing nearby...
Ziggy Marley, Santigold"). Confirms Incident #4's CORS fix on the Travel
Intelligence side and this repo's `/api/artists-playing` are both live and
actually talking to each other, not just passing unit tests.

Susan then asked for the match note's artist names to link back here.
Travel Intelligence's `index.html` now wraps each name in a link to
`concert-radar.html?artist=<name>&city=<city>` (see that repo's own
2026-08-06 CLAUDE.md entry). This repo's half: a new `initDeepLink()` in
`concert-radar.html`, wired right after the existing search-button/Enter-
key listeners — reads `?artist=`/`?city=` on load, pre-fills the same
`cr-f-artist`/`cr-f-city` fields a manual search would, and calls the
already-existing `runLiveSearch()` once. No new search logic; this only
automates what a visitor would otherwise type by hand.

Also, per Susan's request, confirmed a weekly-check gap did NOT already
exist on the Travel Intelligence side and had one built — full detail in
that repo's own CLAUDE.md ("Concert Radar match links + weekly server-side
check"). Nothing new to build on this repo's side for that: the weekly job
calls this repo's existing `/api/artists-playing` exactly the way the live
client-side check already does, no new endpoint needed here.

**Verified:** extracted `concert-radar.html`'s inline `<script>` block and
ran `node --check` against it — syntax-valid. `initDeepLink()` itself
wasn't added to the jsdom E2E harness (`scripts/e2e-concert-radar.mjs`) —
it's a thin, low-risk wrapper around `runLiveSearch()`, which that harness
already exercises indirectly via its existing scenarios; worth a dedicated
fixture case next time this file is touched, same discipline as every
other "worth closing next time" note in this doc.

## 2026-08-07 — GitHub Actions CI wired for real, and it caught a genuine Node-version incompatibility

Part of a portfolio-wide push (see Travel Intelligence's own CLAUDE.md,
2026-08-07 entry, for the shared write-up across all three repos' Actions
setup) to make every sibling site more GitHub-based rather than relying
on manual `device_bash`/Netlify-only workflows. `.github/workflows/
test.yml` ran for real for the first time this session and failed twice,
for two different reasons layered on top of each other. First, the same
missing-`package-lock.json` issue as the other two repos — fixed by
generating one via `npm install`. Regenerating it surfaced the real
issue: doing that `npm install` under Node 20 reproduced the exact CI
failure (`webidl.util.markAsUncloneable is not a function`) locally, plus
surfaced npm's own `EBADENGINE` warning: `jsdom@30.0.1` requires Node
`^22.14.0 || >=24.0.0`. Node 20, which the workflow was still pinned to,
cannot run this dependency at all, lockfile or no lockfile.

Rather than downgrade `jsdom` for no functional reason (it's a real,
current dependency this repo wants), bumped the workflow's `node-version`
from `'20'` to `'22'` — matching what both Susan's Mac and the cloud
sandbox used for this fix already run. Confirmed via `netlify.toml` that
nothing else in this repo's actual deploy stack is pinned to Node 20, so
this is a CI-only version bump with no production-behavior change.
Verified clean under Node 22 with zero warnings, full local suite still
passing. Delivered and committed by Susan as `b299b47`; Actions run #3
confirmed green (31s).

Nothing user-facing changed — this is CI/dependency-management plumbing
only (the live site's actual runtime was never on Node 20 to begin with),
so no front-end (roadmap/about/PROJECT.md feature) update is needed
alongside this entry.

## 2026-08-08 — second content-drift check: about.html's "records tracked" vs. the latest catalog backup

Same pattern, third instance (after Streaming Scout's services-tracked check and Travel Intelligence's dimension/priority check, both same day). Susan's pick, going slow through the architecture review's recommendation 5 items while recommendation 1 (direct Claude-to-GitHub commits) stays parked on the credential blocker.

`about.html`'s stat strip claims "94 records tracked." The daily scheduled `backup.mjs` function already commits a full catalog snapshot to git as `backups/YYYY-MM-DD.json`, including a `record_count` field — a real, already-existing source of truth, no new infrastructure needed. New `scripts/check-content-drift.mjs` finds the latest dated backup file, cross-checks its own `record_count` against its `records` array length (catching a `backup.mjs` bug distinctly from an `about.html` bug), then compares against the about.html stat tile.

Deliberately did NOT build the same check for the "≈€2,232 collection value" tile — that number is explicitly approximate and tracks live market prices refreshed weekly (see the adjacent "Mon weekly price refresh" tile); summing the latest backup's `price_median` field across all 94 records gives €2,224.72, a few euros off from the page copy purely from ordinary price movement since that copy was last hand-updated. A strict equality check there would fail on completely normal weeks. Left as a note for a future session if a tolerance-band version is ever wanted — not bundled into this check.

Verified both failure modes before shipping: temporarily set the stat tile to 88 (confirmed a clear about.html-drift failure message with the right numbers), separately corrupted the backup file's own `record_count` to 999 (confirmed a distinctly-worded backup.mjs-bug failure, not misattributed to about.html) — both restored and reconfirmed clean afterward. Wired into `package.json`'s `test` script and added the same weekly `schedule:` cron trigger the other two repos got today.

Local verification ran the new check standalone (both passes and both failure modes above, all via real file edits and restores, not simulated) plus a JSON-validity check on `package.json`. Did not attempt a full local `npm test`/`npm install` run this time, having just hit a 45-second command-timeout truncating an install on the travel-intelligence repo minutes earlier — CI's `npm ci` has no such constraint and is the real gate; confirm green after pushing.

## 2026-08-08 — doc alignment pass: a removed design element and two unshipped-on-paper features

Per Susan's "check review align and update as needed all the roadmaps, guides and about pages" request. Three real fixes, all in `roadmap.html` and `about.html`:

`roadmap.html` Phase 6 ("Editorial polish pass") still described the catalog-index stamp ("№001") on Audit rows as "the one small mark this pass settles on" — but that stamp, plus the `.audit-help` instructional text, were removed at Susan's request the same week (commit `9fd5488`). Rewrote the phase to say both were tried and then removed as clutter, rather than leaving a roadmap page actively describing a UI element that no longer exists.

`roadmap.html` Phase 11 (Concert Radar) and `about.html`'s Concert Radar section (07) both predated the "Traveling?" city/date search panel and the "Going" status toggle on Watching rows, both shipped 2026-08-07. Added a paragraph to each describing both features. `about.html`'s API stack list was also missing `/api/watching` entirely — added it, including the `going` field.

Checked `guide.html` against the current `netlify/functions/` directory and the daily-health-check claim in step 5 — found no obvious drift, left unchanged; that page is more a general six-step methodology than a feature-by-feature description, and this session made no changes to the mechanism it describes. Verified: `npm run check` (all functions still syntactically valid) and a manual HTML-parse/div-balance check on both edited pages, both clean.

## 2026-08-08, later still: the manual Search panel's free-text city geocoding gap is closed, no geocoder added

Flagged repeatedly since the 2026-08-06 Santigold+Chicago fix as a known, accepted gap: the single-artist Search panel's City field, when typed by hand with no Travel Intelligence deep link behind it, still fell back to the old Berkeley-radius-plus-client-side-text-filter behavior, since building a real geocoder for arbitrary free-text city input was judged out of scope for that same-session fix.

Turns out the fix already existed, just wired to the wrong panel. `tour-dates.mjs`'s v6 (built 2026-08-07 for the new "Traveling?" panel) added an optional `city` param that SeatGeek resolves server-side against its own `venue.city` field, exactly the missing capability, just never connected to the original single-artist Search panel's own City input. `runLiveSearch()` (`concert-radar.html`) now sends that same `city` param whenever a City is manually typed with no lat/lon override in play, instead of falling back to the Berkeley-radius-plus-text-filter path. No geocoding service was added anywhere; SeatGeek does the real resolution, matching this project's standing rule against ever guessing coordinates from a name.

Also fixed as part of the same change: the venue scrape (Bay Area venues only) and the client-side city-substring filter both now correctly skip themselves for a city-scoped search too, not just a lat/lon-scoped one (previously only the lat/lon case skipped them, since a city-scoped search wasn't a real possibility before this fix). And the "no shows found" message now says "in Chicago" for a city-scoped search rather than the "within [range] of" phrasing that only makes sense for a radius search, since `meta.range` is null when SeatGeek resolved a city directly.

Verified live before delivery: called `/api/tour-dates?artist=Santigold&city=Chicago` directly against the deployed API (already live since v6) and got back a real match, Douglass Park, Chicago, IL, 2026-09-18, status 200, the exact search that used to return "No upcoming Santigold shows found within 60mi of Berkeley matching “Chicago”" before the 2026-08-06 fix and would still have returned nothing useful for Chicago specifically until this change. `node --check` on the extracted inline script passes.

**Delivered:** `concert-radar.html`, this file. Nothing committed or pushed; Susan runs `git add`/`commit`/`push` herself.

## 2026-08-09: watching.mjs reaches v2 — deletions now remembered permanently, closing the exact gap that made tonight's data-loss incident confusing to diagnose

Same night as the Concert Radar data-loss incident (see the "Travel Intelligence Agent" project's own `claude/concert-radar-data-loss-incident-2026-08-09.md` for the full story): after Black Uhuru, Burning Spear, and Ziggy Marley were restored to the live Watching store following the incident, Susan deliberately removed them again herself moments later via the real Remove button on `concert-radar.html` — a legitimate, intentional action, not a repeat of the incident. But nothing in `watching.mjs` recorded that removal anywhere. The new `netlify/lib/run-watching-backup.mjs` daily backup (also added tonight) would have had no way to know those three were removed on purpose rather than lost again — a future restore-from-backup would have silently brought them right back, indistinguishable from the original incident. Susan caught this directly: "remember when i click it."

**Fixed:** `watching.mjs` reaches v2, replicating the exact pattern `wishlist.mjs` has used since v3 (2026-07-29) for its own `sync-state.json`: a `DELETE` now reads the item's artist name before removing it, then best-effort-records it into a new `watching-state.json` (committed via the GitHub Contents API, same as `wishlist.mjs`/`run-backup.mjs`) — a deliberately separate file from wishlist's own `sync-state.json`, so a bug in one feature's no-re-add tracking can never touch the other's. Keyed on normalized artist name only (not city), same normalization convention wishlist already uses.

**What this does and does not change:** Susan can always freely re-add anything herself through the UI, any time she changes her mind — this endpoint never blocks a POST. What it closes is the automated side: any future backup-restore action (a human or a Claude session recovering from `backups/watching/YYYY-MM-DD.json`) must check `watching-state.json`'s `deleted` list first and skip any artist that appears there. This is a documentation/process requirement on whoever performs a future restore, not (yet) code-enforced inside `run-watching-backup.mjs` itself, since that file only ever writes backups today, it has no restore path of its own to gate.

Verified: `node --check` passes on the updated `watching.mjs`. Not live-tested against a real DELETE this session (would require deleting real data again to test the new recording path, judged not worth the risk for a mechanical, low-complexity change that mirrors an already-proven pattern byte-for-byte). Worth a real spot-check the next time Susan removes something from Watching: confirm `watching-state.json` picks up the entry.

**Delivered:** `netlify/functions/watching.mjs`, this file. Nothing committed or pushed; Susan runs `git add`/`commit`/`push` herself, alongside the three new backup files from earlier tonight.

## 2026-08-09, later: catalog backup migrated off Netlify onto GitHub Actions (first move in the weekend cost-reduction plan)

Per `claude/weekend-netlify-github-cost-plan-2026-08-08.md` (in the "Travel Intelligence Agent" Claude project), Susan's request to shift work off Netlify's metered compute and onto GitHub where it's free for a repo this size. Started with the plan's own recommended first candidate: the daily catalog backup, since `netlify/functions/backup.mjs`/`netlify/lib/run-backup.mjs` already proves the commit-to-git pattern works, the only change is where it runs.

**New: `.github/workflows/backup-catalog.yml` + `scripts/backup-catalog.mjs`.** Runs entirely inside a GitHub Actions runner, not inside a Netlify Function — this is the actual credit-saving part, not just moving the trigger. Reads the catalog through the site's own public, unauthenticated `GET /api/records` (same server-to-server pattern `scheduled-sweep.mjs` already uses successfully from inside a Netlify Function), writes `backups/YYYY-MM-DD.json` directly to the checked-out repo, then commits and pushes using Actions' own built-in `GITHUB_TOKEN` — zero new secrets, no Netlify API token needed anywhere. Scheduled 5 minutes after the old job's 09:00 UTC time (`5 9 * * *`) plus a manual `workflow_dispatch` trigger for on-demand testing.

**Deliberately additive, not a swap yet.** The existing Netlify-scheduled `backup.mjs` is untouched and will keep running in parallel until Susan can compare a real Actions run's output against it and confirm both are producing correct, matching snapshots. Once confirmed, removing `backup.mjs`/`run-backup.mjs` and its Netlify schedule is what actually realizes the credit savings — that removal step is intentionally not done yet.

**Honest limitation on verification: this could not be fully tested end-to-end this session.** The script's logic was checked (`node --check` passes) and the fetch pattern is proven elsewhere in this codebase, but a live test run of `scripts/backup-catalog.mjs` against `https://vinylscout.org/api/records` from this session's own cloud sandbox failed with a connection error — the sandbox's own outbound network is allowlisted to a limited set of domains and vinylscout.org isn't on it (confirmed via `curl` failing with a connection-level error, not an HTTP-level rejection from the site itself). This is very likely a sandbox limitation, not a real problem: GitHub Actions runners have full outbound internet access, unlike this restricted sandbox, and the identical pattern already works reliably from inside a real Netlify Function (`scheduled-sweep.mjs`). But this is inference, not confirmation. **The real test is the manual "Run workflow" button in the repo's Actions tab, once this file is pushed** — that will show definitively whether it works, and is the natural next step before removing anything from the Netlify side.

**Also worth checking pre-Actions dashboard usage numbers before doing more of this plan:** attempted to pull Netlify's actual usage/credit breakdown via a live browser check against the team's usage dashboard this session; it's rendered inside an iframe this session's browser tooling couldn't read past a cookie-safety guard. Susan should check `app.netlify.com/teams/susan-nesbitt/usage` herself if she wants the real number before deciding whether to continue this migration further (the plan itself is honest that this is likely a reliability/legibility win more than a large bill reduction either way).

Not committed or pushed; sitting on disk alongside tonight's other uncommitted files.

## 2026-08-11 to 2026-08-13 — Concert Radar Phase 13: JamBase Data wired in as a third feed, plus the venue-scraper attribution gap this surfaced

Susan asked to "improve and expand the live concert look ups" after confirming Ticketmaster's developer signup remains stalled from the venue-shows.mjs (Phase 12) side. Every remaining free option was re-researched before landing on JamBase Data's new self-serve platform (data.jambase.com): Bandsintown, Songkick, Eventbrite, Dice.fm, and PredictHQ were all re-checked and remain non-viable for the same reasons logged in the 2026-08-04 v18.4 entry above (hobby-tier API access closed or nonexistent for all five). JamBase's "Developer" tier is genuinely free and permanent: $0/mo, 1,000 calls/month, 3,600/hr, non-commercial use only, 6-month future event window — Susan signed up and upgraded to a real `jbd_live_` key over two sessions (2026-08-12 evening, resumed 2026-08-13 morning).

**Two real bugs found via live testing from Susan's own Terminal, not guessed:**
1. The base URL in JamBase's own prose docs (`data.jambase.com/v3`) is wrong — a real curl against it returns HTTP 200 but `content-type: text/html` (the marketing site's SSR catch-all, not the API). The real base URL, `https://api.data.jambase.com/v3`, was found by fetching JamBase's static OpenAPI spec (`data.jambase.com/openapi.json`, machine-readable unlike the JS-rendered docs pages) and reading its authoritative `servers` field.
2. `geoRadiusAmount` is broken on this account's Developer-tier key — every value tested (60, 25, 10, 1 miles) failed identically with a templating-bugged JamBase error message ("...too high. Please use a max of  miles" — blank max). Confirmed not a units/scale issue by testing multiple orders of magnitude. Worked around by omitting `geoRadiusAmount`/`geoRadiusUnits` entirely — JamBase resolves a bare lat/lon to its containing metro area automatically (`x-jamBaseMetroId`), which is arguably a better fit for "Bay Area" scoping than an arbitrary radius anyway.

**Shipped: `netlify/functions/jambase-shows.mjs` (v1)** — a third Concert Radar feed, same public-read, no-auth-gate pattern as `tour-dates.mjs`/`venue-shows.mjs`. One geo sweep per invocation (not one call per artist, unlike tour-dates.mjs's SeatGeek pattern) to stay well inside JamBase's 1,000/month budget against Susan's 150+-name artist list. Real pagination added (`fetchAllEvents()`, `MAX_PAGES=25`, `?allPages=true`) after a live unfiltered sweep showed 2,038 total Bay Area events across 680 pages at the default page size — a single page badly undercounts. Field-mapping (`addressCityState()`, `firstUsableOffer()`, `primaryPerformerName()`) was live-verified against a real captured response, not just JamBase's published schema: `addressRegion` is a real object (`{alternateName, name, identifier}` — prefers the 2-letter `alternateName` to match this repo's "City, CA" convention), offer `category` values are `"ticketingLinkPrimary"`/`"ticketingLinkSecondary"` (not the generically-guessed `"primary"`/`"secondary"`), and `priceSpecification` is frequently an empty object on real events. Same `TRIBUTE_WORDS` blocklist and cancelled-event filter as the other two feeds. `scripts/test-jambase-shows.mjs` (new): 46/46 assertions, fixture rebuilt from the real captured response.

**Wired into both the live and scheduled sweep paths, same pass:**
- `concert-radar.html` (v21): new `fetchJambaseShows()`, added to `sweepCatalog()`'s `Promise.all` alongside the existing venue-shows fetch, filtered through the existing `artistIsRelevant()`/`normalizeArtistKey()` pattern (v18.5) before merging into Coming Soon. Uses the fast single-page default (no `allPages`) to keep every live page visit cheap.
- `scheduled-sweep.mjs` (v2): fetches with `?allPages=true` — the one place in the app that should pay the full ~21-call cost of a complete Bay Area sweep, since it only runs once a week (well inside the 1,000/month budget). Closed two latent gaps found while wiring this in: (1) this file's artist list was built from `/api/records`+`/api/wishlist` only, never `/api/watching`, unlike the client's `fetchDistinctArtists()` (which picked this up back at v18.5) — a watched-only artist with no catalog/wishlist entry was never part of this file's relevance filtering; (2) `venue-shows.mjs`'s output was being merged into the weekly cache completely **unfiltered** — harmless while venue-shows.mjs's calendars were small, clearly wrong once JamBase's much larger raw sweep needed filtering anyway. Both non-artist-scoped sources (venue-shows.mjs and jambase-shows.mjs) now go through the same relevance filter server-side, matching what the client has done since v18.5.

**Verification:** `scripts/e2e-concert-radar.mjs` (real jsdom harness, real shipped code — see the 2026-08-04 v18.4 entry for why this harness exists over a standalone reproduction) extended with two new fixtures: an irrelevant JamBase show (should be filtered out of Coming Soon) and a relevant-unwatched JamBase show (Kruder & Dorfmeister — should show). One test-only bug found and fixed in the test itself, not the app: the harness's raw fixture string didn't match `esc()`'s HTML-escaped `&`-to-`&amp;` output for "Kruder & Dorfmeister" — fixed the assertion to check both forms. `npm test` (full suite: `check`, artists-playing, wishlist, jambase-shows, and the extended e2e harness) passes clean.

**Still open, flagged rather than guessed at (see jambase-shows.mjs's own TODO block):**
- JamBase's required attribution credit-line wording hasn't been pulled from their Attribution doc page yet. The free tier's terms mention attribution is required when displaying their data publicly — nothing has been added to concert-radar.html's footer/credit line for this. Do not treat JamBase data as fully compliant-and-shipped until this is closed.
- `runLiveSearch()` (the manual Search panel / a Watching row's "Check live →" button) still only queries `tour-dates.mjs` + `venue-shows.mjs` — it doesn't query jambase-shows.mjs yet, unlike venue-shows.mjs's own v17 parity treatment. A manual search for an artist JamBase has a show for but SeatGeek/the venue scrape don't will still report "not found."
- `JAMBASE_API_KEY` needs to be set in Netlify's env var UI before this goes live — not yet done as of this entry (Susan's real key was generated during Terminal testing but never pasted into chat, per this repo's never-echo-a-secret rule; she sets it herself in the Netlify dashboard, same as every other secret here).

**Delivered:** `netlify/functions/jambase-shows.mjs` (new), `scripts/test-jambase-shows.mjs` (new), `concert-radar.html` (v21), `netlify/functions/scheduled-sweep.mjs` (v2), `scripts/e2e-concert-radar.mjs`. Committed locally across 4 commits (`b1bbae7`, `d3b1523`, `6015a53`, and today's wiring commit) but **not pushed** — this session has no GitHub push credentials for `snesbitt/vinyl-scout` (confirmed via `git push --dry-run`), and this repo's standing rule is Susan always pushes herself from her own Terminal, never an agent. She'll need `git pull` (or a fresh clone) plus `git push` to get this live, then set `JAMBASE_API_KEY` in Netlify before the new endpoint will return real data instead of a 500.

## 2026-08-12 — `/api/artists-playing` reaches v2: parallelized store reads and outbound fetches, SeatGeek gets its own timeout

Netlify's request observability for this project showed a recurring pattern: occasional 499s (client-side abort) on `/api/artists-playing`, e.g. two on 2026-08-12 at 09:35:29 (6200ms and 4177ms). These come from Travel Intelligence's `checkConcertMatches()` (that repo's `index.html`), which fetches this endpoint with `AbortSignal.timeout(6000)` and, by design, fails silently — the watched-trips row just doesn't get a concert-match note, with no visible error anywhere. That silent-failure design (deliberate, see the 2026-08-05 Phase 10 entry above) is exactly why this had gone unnoticed: nothing broke visibly, the feature just occasionally didn't fire.

**Root cause:** the handler did everything sequentially that didn't need to be sequential. Three Blobs-store reads (`records`, `wishlist`, `watching`) ran one after another, and within each store, every individual key's `store.get()` call ran in a plain `for`-loop, awaited one at a time — with 94 catalog records + 127 wishlist items, that's up to ~220 individual awaited reads in series before the function even got to SeatGeek. Then the SeatGeek fetch ran with no timeout at all, and only after that completed did the `venue-shows` fetch start — also sequential, also unnecessary, since neither source depends on the other.

**Fix:** all three store reads now run concurrently via `Promise.all`, and each store's own per-key reads are parallelized the same way (`Promise.all(keys.map(k => store.get(k)))` instead of a `for`-await loop). The SeatGeek and venue-shows fetches now also run concurrently via `Promise.all` instead of sequentially. SeatGeek's fetch additionally gets its own `AbortController` with a 4.5s timeout — deliberately shorter than the client's 6s ceiling — so a slow SeatGeek response degrades to `seatgeekError` (venue-scrape source still checked, exactly like the existing missing-`SEATGEEK_CLIENT_ID` degrade path) instead of silently consuming the entire client-side timeout budget by itself. No behavior changed on any existing path: `_meta_` sentinel-skipping in `watching`, per-key JSON-parse-error swallowing, whole-store failure logging and degrading to `[]`, and the downstream dedupe/sort logic are all untouched — this is a concurrency restructuring only.

**Verified:** `node scripts/test-artists-playing.mjs` (20/20) and the full `npm test` chain both passed clean before push. Post-push, live-smoke-tested against the actual deployed endpoint with three real lat/lon/date-window combinations (none previously cached): all three returned 200 with `seatgeek_error: null` and `venue_error: null`, in 875ms, 887ms, and 2368ms — well under the client's 6s ceiling, down from the 4.2–6.2s range that had been producing the 499s. `netlify/functions/artists-playing.mjs` version header bumped 1 → 2. PROJECT.md's changelog reaches v42 with the same narrative, shortened for that file's format.

Not yet independently re-checked against a real SeatGeek response containing actual matches (all three smoke-test requests happened to return zero matches for their date windows) — the concurrency change touches only how the reads/fetches are scheduled, not the matching logic itself (`matchSeatGeekEvents`/`matchVenueShows`, both untouched), so this is low risk, but worth a real match landing naturally in a future session to close the loop.

## 2026-08-13, later — JamBase attribution: partial, honestly flagged as such

Picked up the one item left open from the JamBase entry above: pull the exact required attribution wording from JamBase's own Attribution doc page and add it to `concert-radar.html`. Tried multiple ways to fetch `https://data.jambase.com/api/docs/attribution` (found via the link on their Getting Started page, itself only reachable via search since the docs site's own in-page navigation isn't crawlable by this session's tools) — the bare page, a `.md` suffix, and both `llms.txt`/`llms-full.txt` summary variants. Every attempt returned only page metadata, never the rendered body — this is a client-side-rendered docs page, same structural limitation this project has hit before with JamBase's other reference pages (see the original 2026-08-12 research note). What WAS confirmed, consistently, across all of those fetches: the free "Developer" tier is unambiguously **"Attribution required"** (Pro tier: "appreciated"; Pro+: "whitelisted attribution") — so this isn't a maybe, it's a real, unmet requirement as of this entry.

Rather than leave it fully open a second time, shipped a reasonable interim measure rather than nothing: `concert-radar.html` already renders a small `via {source}` tag on every Coming Soon/Search-result card (existing markup, unchanged) — for JamBase-sourced cards specifically, that tag is now a real hyperlink to `jambase.com` (new `sourceCreditHtml()` helper, `concert-radar.html` v21.1) instead of plain text, since attribution conventionally means a link back to the source, not just a name. This is explicitly **not** claimed to satisfy JamBase's actual required wording or format — the file's own v21.1 header comment says so directly, and this note does too: Susan should open `https://data.jambase.com/api/docs/attribution` in her own browser (which renders it fine, unlike this session's tools) and confirm or correct the exact text next time she's at a computer. Every other source's tag (SeatGeek, the 7 scraped venues) is untouched — no confirmed attribution requirement exists for either of those.

New regression coverage: `scripts/e2e-concert-radar.mjs` gained an assertion that a JamBase card's source tag actually renders as `<a href="https://www.jambase.com/">via JamBase</a>`, not just plain text — passes across all 5 scenarios. `npm test` (full suite) passes clean.

**Delivered:** `concert-radar.html` (v21.1), `scripts/e2e-concert-radar.mjs`, this file. Committed locally, not pushed — same standing reason as every other entry today.

## 2026-08-13, later still — GitHub Actions Phase 1: watching-list backup migrated, deploy now Actions-driven, PR-based workflow starts

Susan asked to lean further into GitHub and less on Netlify, and — separately — to unblock the architecture review's recommendation 1 (direct Claude-to-GitHub commits, parked on the credential blocker per the 2026-08-08 entry above) by giving an agent a scoped, PR-only GitHub token rather than full push access to `main`. Both land together as this entry, scoped deliberately smaller than "migrate everything at once":

**`backup-watching.mjs` migrated off Netlify, same pattern as the catalog backup.** New `scripts/backup-watching.mjs` + `.github/workflows/backup-watching.yml`, mirroring `scripts/backup-catalog.mjs`/`backup-catalog.yml` byte-for-byte in structure. Reads through the site's own public `GET /api/watching` (already filters out the `_meta_seed_v16_done` sentinel server-side, so no client-side sentinel-filtering needed) rather than touching Netlify Blobs directly — zero new secrets, same as the catalog migration. Deliberately does NOT treat a zero-item result as an error the way the catalog script does for an empty catalog — Susan has genuinely cleared the Watching list before (2026-08-09), so empty is a plausible real state here, not a signal of breakage. Scheduled 09:10 UTC — 5 minutes after both the existing Netlify job and the catalog-backup Actions job, so none of the three race on the same GitHub API window during the comparison period. Additive, not a swap: the Netlify-side `backup-watching.mjs`/`run-watching-backup.mjs` keep running until Susan confirms a real Actions run's output matches.

**`scheduled-sweep.mjs` was investigated for the same migration and deliberately NOT moved.** Its whole job is *writing* to the `catalog-cache` Netlify Blobs store, and there's no public endpoint to write that from outside Netlify — unlike the two backup jobs, which only ever *read* public data. Moving it would mean either handing GitHub Actions a Netlify Blobs API token (trades Netlify compute for a Netlify credential living in GitHub — not actually less Netlify dependency) or adding a new gated write endpoint to `catalog-cache.mjs` using this repo's existing shared-secret pattern (`EDIT_SECRET`/`BACKUP_SECRET`) so Actions authenticates the same way every other write in this app already does. The second option is the right one if this gets built, but it's real new surface area (a write endpoint that doesn't exist today) — scoped out of this pass as its own follow-up rather than folded in here.

**Deploys are now also Actions-driven**, not just Netlify's own git-integration auto-deploy. `.github/workflows/test.yml` gained a `deploy` job (`needs: test`, only on an actual push to `main`) that runs `netlify deploy --prod` via the Netlify CLI, authenticated with a new `NETLIFY_AUTH_TOKEN` repo secret (a Netlify Personal Access Token, unrelated to any of the site's own runtime env vars in the table above). **This does not by itself replace Netlify's own auto-deploy** — both fire on a push to `main` until Susan explicitly turns off "auto publishing" in Netlify's site settings (Site configuration → Build & deploy). Until she does, every push to `main` triggers two redundant, harmless deploys of the same content — wasteful, not unsafe, and flagged here rather than left for someone to notice later. `scripts/netlify-ignore.sh`'s docs-only-changes skip logic is Netlify's own git-integration feature and does NOT apply to this new Actions-driven path yet — a docs-only push currently still triggers a real Actions deploy, a known gap, not yet closed.

**Workflow change, not just infrastructure:** going forward, changes land as a PR against `main` rather than a direct push — branch protection on `main` (require a PR + the `Tests` status check before merge) plus a fine-grained GitHub PAT (scoped to just this repo, `Contents: Read and write` + `Pull requests: Read and write`, no merge capability) let an agent open a PR and Netlify's own Deploy Preview show Susan a live before/after, rather than the file-transfer-via-terminal dance this project has relied on until now. This is the actual resolution of the architecture review's "recommendation 1" note above — not "an agent can push to production," but "an agent can open something Susan reviews and merges herself," which is a materially different and safer thing than what was parked in 2026-08-08.

**Verified:** `node --check` on the new script, a Python `yaml.safe_load()` parse of both new/changed workflow files, and the full local `npm test` (unchanged — nothing in this pass touches any tested application logic) all pass clean. **Not yet verified live** — this entry's own PR hasn't merged yet as of this writing, so none of `backup-watching.yml`'s scheduled run, the new `deploy` job, or the branch-protection/PR flow itself has fired for real. Worth confirming all three directly once merged: check the Actions tab for a green `backup-watching` run (or trigger it manually via "Run workflow"), confirm a push to `main` produces exactly one intentional deploy plus one Netlify auto-deploy (both succeeding) rather than either failing, and confirm the PR itself showed a real Deploy Preview link before merge.

**Delivered:** `scripts/backup-watching.mjs` (new), `.github/workflows/backup-watching.yml` (new), `.github/workflows/test.yml` (deploy job added), this file. Opened as a PR rather than pushed directly to `main` — first change in this repo to go through that path.

## 2026-08-14 — deploy job stopped spamming failure emails; JamBase drift fixed in about.html/roadmap.html

Two follow-ups from the Phase 1 entry above, both real, both shipped without waiting for a live session to notice on its own.

**The new `deploy` job failed its first three real runs**, not zero: once the night it was built (8/13, commit `6043446`), then two more the morning of 8/14 — three separate "some jobs were not successful" emails for a job that could never have succeeded, since `NETLIFY_AUTH_TOKEN` was never actually added as a repo secret. Rather than keep flagging this as an open diagnosis item on a punch list while it kept firing (and kept emailing Susan), fixed it directly: `.github/workflows/test.yml`'s `deploy` job now includes `secrets.NETLIFY_AUTH_TOKEN != ''` in its `if:` condition. Unset secret → the job reports **skipped**, not failed — no more noise for a job that was never going to run. The moment Susan adds the real secret, this condition flips true and the job deploys for real on the very next push, no other change needed. Verified: the workflow file parses clean under `yaml.safe_load()`, `node --check` unaffected (no application code touched).

**Documentation review found real drift, not just staleness:** `about.html` and `roadmap.html` never mentioned JamBase Data at all, despite it going live 8/13 — both described Concert Radar as SeatGeek + venue-scrape only. Fixed both (the `/api/jambase-shows` endpoint entry, the Concert Radar prose, Phase 11's roadmap card, which also dropped the now-stale "Ticketmaster in progress as a third source" framing since JamBase is the third source that actually shipped). `README.md`'s one-line deploy description updated to mention the new Actions deploy job and the still-pending Netlify auto-publish overlap. `PROJECT.md` reaches v45 with its own changelog entry for the Phase 1 GitHub Actions work — previously that only lived here in CLAUDE.md, breaking this repo's own convention that shipped changes get a versioned charter entry too.

**Delivered:** `.github/workflows/test.yml`, `about.html`, `roadmap.html`, `README.md`, `PROJECT.md`, this file. Opened as a PR/bundle, not pushed directly — same path the Phase 1 work went out through.

## 2026-08-14, later — corrected the deploy-noise fix; two real cross-source Concert Radar bugs, live-caught by Susan, fixed with regression coverage

**The deploy-noise fix from earlier today (bf59b96) broke the whole workflow.** Putting `secrets.NETLIFY_AUTH_TOKEN != ''` directly in the `deploy` job's own `if:` isn't reliably supported by GitHub Actions — the next push failed with "No jobs were run," meaning even the `test` job never started, worse than the noisy-email problem it was meant to fix. Corrected: `.github/workflows/test.yml`'s `test` job now checks the secret inside a step (secrets are always safely readable in a step's `env:`) and exposes the result as a job output (`has_netlify_token`); `deploy`'s `if:` references that output instead of touching `secrets` directly — job outputs are unambiguously supported there. Verified this time with `action-validator` (a real GitHub Actions workflow schema checker), not just a YAML parse.

**Susan live-caught two real bugs in the Concert Radar cross-source merge, both stemming from the same gap: multiple feeds can name the same real thing slightly differently, and nothing normalized that before today.**

1. **Herbie Hancock at Davies Symphony Hall, Aug 17 2026, rendered as two separate Coming Soon cards** — one via JamBase ("Davies Symphony Hall"), one via SeatGeek ("Louise M. Davies Symphony Hall"). Same real show; `dedupeById()` only catches an exact `id` collision, and each source mints its own id independently. New `normalizeVenueKey()` + `dedupeSameShow()` (added to both `concert-radar.html`'s client-side merge and `scheduled-sweep.mjs`'s weekly server-side merge, so a fresh browser's first-paint fallback via `catalog-cache.mjs` doesn't flash the same duplicate) collapse same-artist/same-date/substring-matching-venue duplicates into one entry, preferring SeatGeek > JamBase > the venue scrape but backfilling a price from any duplicate that has one. Manual entries are never touched by this — Susan's own hand-verified pins keep their own identity even if an automated source later finds the same show.
2. **The Watching panel showed Thievery Corporation's summary as "The Masonic — San Francisco, CA / Aug 15 – Sep 12, 2026 · 2 dates"** when Susan actually holds a ticket to one date at The Fox in Oakland. `findWatchMatches()`/`renderWatchList()` had no per-venue grouping at all — it flattened every matched show for an artist into one composite date range, using only the earliest match's venue for display. The two matches were two genuinely different real bookings (an artist playing more than one Bay Area venue in a season is ordinary) silently merged into one misleading summary that named the wrong venue and implied dates that were never one continuous booking. Fixed by reusing `groupCatalogShows()` — the same artist+venue grouping Coming Soon cards already use — so the Watching panel now renders each distinct real venue as its own line. `groupCatalogShows()` itself was also upgraded to use the new normalized keys (defense in depth, same "fix at the source, but don't rely on one point of failure" pattern this file's own history follows repeatedly).

**Verified:** both fixes have real regression coverage in `scripts/e2e-concert-radar.mjs` (not a reimplementation — the real shipped code, per this harness's own standing purpose), not just a patch-and-hope: a Herbie Hancock cross-source fixture (JamBase + SeatGeek, same date, different venue strings, SeatGeek deliberately missing a price to exercise the backfill path) asserts exactly one Coming Soon card renders with the backfilled price; a "Poolside" fixture (two genuinely different real venues, mirroring Thievery Corporation's exact shape) asserts the Watching panel renders both venue lines separately with no fabricated multi-date range. Full `npm test` (all six groups + `check` + content-drift) passes clean. `concert-radar.html` bumped to v21.2.

**Delivered:** `.github/workflows/test.yml`, `concert-radar.html` (v21.2), `netlify/functions/scheduled-sweep.mjs`, `scripts/e2e-concert-radar.mjs`, this file. Opened as a PR/bundle, not pushed directly — same path every change has gone out through today.

## 2026-08-14, later still — "Going" and dismiss are now per-venue, not per-artist

Same-day follow-up to the Thievery Corporation venue-grouping fix above. Susan looked at the fixed Watching row and pushed back directly: she's only going to the Fox Oakland show, not the Masonic SF one — and the single artist-level "I'm going" toggle plus the newly-separated venue lines had no way to say that. She also wanted the Masonic show gone from her view of it entirely: "i don't want the other show included."

**Fixed both, reusing existing mechanisms rather than inventing new ones:**

- **"Going" is now per-venue-group.** `w.goingShowId` (new field, same no-schema-change POST pattern `going` itself used) holds the specific matched show's `id` she confirmed. Each venue block in the Watching panel renders its own "I'm going" button, active only when `goingShowId` matches a show in that specific group. The artist-name-row "Going" badge stays keyed off the plain `going` boolean, which is now set/cleared together with `goingShowId` on every toggle, so it needs no separate source of truth.
- **A per-venue "not going to this one" dismiss** reuses the exact same `hidden` array Coming Soon's own per-card × already writes to (same `LS_HIDDEN` localStorage key, same `saveJSON`/`renderList()` call) — no new hide mechanism. `findWatchMatches()` already reads through `hidden`-filtered `comingSoonShows()`, so dismissing a venue here removes it from the Watching row for the same reason it removes a card from Coming Soon. The one new piece of plumbing: `els.watchList`'s own click listener didn't previously handle `data-del` at all (that branch lived only on `els.list`, Coming Soon's container) — added the same branch there too, since a click inside the Watching panel never reaches the other listener.

**Migration note, not code:** Susan's existing stored record for Thievery Corporation already has `going: true` from before this shipped, with no `goingShowId` — neither venue button will render as active until she clicks "I'm going" on the Fox Oakland line again, which sets `goingShowId` correctly going forward. Not worth a server-side migration for one record.

**Verified:** two new render-level assertions in `scripts/e2e-concert-radar.mjs` (Poolside fixture, the same one covering the venue-grouping fix) confirm each of two distinct real venues gets its own "I'm going" button (distinct `data-watch-going-show` ids) and its own dismiss control, not one shared pair for the row. `npm test` passes clean. This harness doesn't simulate clicks (never has, for any of this file's handlers) — the click/POST behavior itself is unverified against a live browser, same standing caveat as every other interactive handler in this file.

**Delivered:** `concert-radar.html`, `scripts/e2e-concert-radar.mjs`, this file. Opened as a PR/bundle, not pushed directly.
