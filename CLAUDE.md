# CLAUDE.md — Vinyl Scout

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
    wishlist.html      Hunt list — add/delete are UNGATED (no edit secret, see below)
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
      wishlist.mjs       /api/wishlist/:id?  GET public · POST/DELETE UNGATED (see below)
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
  **Exception: `/api/wishlist` POST/DELETE are deliberately ungated** (no
  X-Edit-Key check) — removed 2026-07-11 at Susan's explicit request, because
  typing the edit passphrase on mobile every session wasn't practical for a
  page she uses casually. This is scoped to the wishlist store only; the
  catalog (`/api/records`) and covers (`/api/save-cover`) remain fully gated.
  Don't "fix" the wishlist gate back in without asking Susan first.
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
| YOUTUBE_API_KEY       | audio-preview.mjs         | YouTube Data API v3 key, API-key-only (no OAuth) | Audio preview's YouTube tier is currently a dormant last-resort — all 93 records already resolve via Deezer, so this key's status doesn't affect coverage today. Status not independently reconfirmed this pass; get one free from Google Cloud Console if you do need to set it (enable "YouTube Data API v3", create an API key, no OAuth consent screen needed for public search). Until set, this tier gracefully reports "not configured" with zero effect on the rest of the pipeline. |
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

**Current state (as of `audio-preview.mjs` version 15, 2026-07-13):** all
93 records resolve to a real, individually-verified-correct playable
preview, 100% served via Deezer. Spotify and iTunes tiers were tried and
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
