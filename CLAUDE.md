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
      backup-http.mjs    /api/backup         GET  gated (manual backup;
                         nightly automation retired off this Netlify
                         function 2026-08-26, `bdd16c0` — see
                         .github/workflows/backup-catalog.yml +
                         scripts/backup-catalog.mjs, GitHub-Actions-
                         scheduled, below)
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
                         12, 2026-08-04 — scrapes 6 hand-picked Bay Area
                         venues' own public event pages server-side, no API
                         key needed for any of them; one of the 6 fetches
                         covers 6 Another Planet Entertainment venues at
                         once. Catches box-office-only shows SeatGeek's
                         index doesn't carry — see the file's own header
                         comment for the full per-venue platform breakdown
                         and the 3 venues deliberately left out)
      watching.mjs       /api/watching/:id?  GET public · POST/DELETE
                         UNGATED (Phase 11, 2026-08-04, v16 — Watching
                         panel storage, moved server-side after Susan's
                         browser lost it from localStorage; separate
                         `watching` Blobs store; seeds 3 named artists once
                         via a sentinel record — see 2026-08-04 v16 note)
      catalog-cache.mjs  /api/catalog-cache  GET ungated · pure read
                         (v2, 2026-08-19: serves data/catalog-cache.json,
                         committed weekly by the Actions job, NOT the
                         Blobs store any more; used
                         by concert-radar.html only as a first-paint
                         fallback for a browser with no local cache yet —
                         see 2026-08-04 v18 note. The Netlify Scheduled
                         Function that used to write that Blobs store,
                         `scheduled-sweep.mjs`, was deleted 2026-08-25
                         [`bd65e35`] once this read side had run clean for
                         a week — the sweep itself now lives only as
                         scripts/scheduled-sweep.mjs +
                         .github/workflows/scheduled-sweep.yml, below)
    netlify/lib/run-backup.mjs  Shared backup logic (pure read → git commit;
                       still used by backup-http.mjs's manual trigger —
                       the nightly automation moved to
                       scripts/backup-catalog.mjs, below)
    covers/            Album art committed by save-cover
    backups/           Daily JSON snapshots committed by scripts/backup-catalog.mjs (Actions; run-backup only for the manual /api/backup)
    scripts/           netlify-ignore.sh (deploy gate) + smoke.mjs +
                       scheduled-sweep.mjs (weekly Concert Radar sweep,
                       GitHub-Actions-scheduled) + backup-catalog.mjs
                       (nightly catalog backup, GitHub-Actions-scheduled)
                       + backup-watching.mjs + helpers
    Also present (added to this map 2026-11-14; it had fallen behind):
      netlify/functions/artists-playing.mjs  /api/artists-playing (Phase 10, Travel Intelligence hook)
      netlify/functions/jambase-shows.mjs    /api/jambase-shows (third Concert Radar feed)
      netlify/functions/discogs-cover.mjs    /api/discogs/cover (server-side cover fetch, companion to save-cover)
      netlify/functions/backup-watching-http.mjs  /api/backup-watching (manual, BACKUP_SECRET-gated)
      scripts/check-freshness.mjs, check-deploy-fresh.mjs, check-content-drift.mjs   health checks (npm run check:freshness / check:deploy; drift runs inside npm test)
      scripts/concert-radar-health-check.mjs  weekly feed check (Actions)
      scripts/e2e-concert-radar.mjs, test-*.mjs   test suites, all run by `npm test`
      scripts/wire-netlify-ignore.mjs  one-shot, already applied; safe to ignore
      .github/workflows/  backup-catalog (daily 18:05 UTC), backup-watching (18:10 UTC),
                          daily-freshness (18:30 UTC), scheduled-sweep (Sun 19:00 UTC),
                          concert-radar-health-check (Mon 18:00 UTC), test (push + Mon 19:00 UTC)
      data/catalog-cache.json  weekly sweep output, committed by Actions
      sync-state.json, watching-state.json, enriched-seed.json, vinyl-scout-seed-clean.json
                          tracked state and seed files, 404ed by netlify.toml
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
| EDIT_SECRET    | records.mjs, save-cover.mjs, discogs-pricing.mjs, discogs-cover.mjs, wishlist.mjs | Gates POST/DELETE writes (X-Edit-Key)      | All writes / covers / pricing refresh |
| BACKUP_SECRET  | backup-http.mjs                  | Gates manual GET /api/backup (X-Backup-Key)| Manual backup          |
| DISCOGS_TOKEN  | discogs-lookup, discogs-pricing  | Discogs auth, server-side only             | Pressing/market lookup |
| GITHUB_TOKEN   | save-cover, run-backup           | Commits covers + backups via GitHub API    | Covers + backups       |
| GITHUB_REPO    | save-cover, run-backup           | Target repo (default snesbitt/vinyl-scout) | optional               |
| GITHUB_BRANCH  | save-cover, run-backup           | Target branch (default main)               | optional               |
| YOUTUBE_API_KEY       | audio-preview.mjs         | YouTube Data API v3 key, API-key-only (no OAuth) | Audio preview's YouTube tier is a last-resort that is still not configured (`_debug.youtube.configured: false`, rechecked 2026-11-23). As of that run, 97 of 98 owned records resolve via Deezer; the one miss is The Scientist, *Rids the World of the Evil Curse of the Vampires* (`no_match_pending_youtube` since 2026-10-19), so setting this key, or adding a `KNOWN_COMPILATION_TRACKS` override for that record, would close the last gap; get one free from Google Cloud Console if you do need to set it (enable "YouTube Data API v3", create an API key, no OAuth consent screen needed for public search). Until set, this tier gracefully reports "not configured" with zero effect on the rest of the pipeline. |
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
pending gap-record sweep (now 1 record, The Scientist) the moment the key is set), a rotating cover-art
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
  pattern as `save-cover.mjs`/`run-backup.mjs`). The weekly scheduled job
  now checks both `auto_added` and `deleted` before adding (confirmed
  2026-11-23), so deletions are recorded and enforced.
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
  degrading, not an acceptable shortcut). Whenever the run raises PROJECT.md's `**Version:**`, it must set
  `about.html`'s kicker (`vN charter`) to the same N in the same commit;
  `scripts/check-content-drift.mjs` Check 3 fails the build if they differ
  (it did on 2026-10-19, after v56). (2) A QA/health pass — as of Job
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
  Piano Sonatas, The Scientist), escalating to a full-catalog (98-record) sweep if
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

**Current state (as of 2026-11-23 weekly run):** 97 of 98 records resolve to a playable preview, all served via Deezer. Verve // Remixed and the other former gap records now match on Deezer. The one record left pending the YouTube fallback is The Scientist, *Rids the World of the Evil Curse of the Vampires* (no match since 2026-10-19; key still not configured). Open issue found 2026-11-23, not fixed: Deezer search no longer returns the original albums for some records, and the matcher accepts a same-artist remix album instead. The Air *Moon Safari* canary now plays "Kelly Watch the Stars (Moog Cookbook Remix)" from *Moon Safari Remixes, Rarities and Radio Sessions*; St Germain *Tourist* (Travel Versions), Donna Summer *Bad Girls* (Scandal Remix EP) and Tosca *J.A.C. Reissue* (J.A.C. Remixes) likewise resolve to remix-album tracks. Spotify and iTunes tiers were tried and
removed — neither ever contributed a single playable preview across the
whole catalog. A YouTube tier 4 exists in the code as a last-resort
fallback (needs `YOUTUBE_API_KEY`, confirmed still unset 2026-11-23) and so
cannot serve The Scientist yet: every other record resolves via Deezer directly or via
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
re-run the full-catalog (98-record) sweep (not just the specific records touched)
after any matching-logic change. Two separate wrong-track bugs and one
same-session regression were only caught this way.

## Archived dated notes (2026-07-26 to 2026-09-14)

The day-by-day notes for this period moved to `CLAUDE_DATED_NOTES_ARCHIVE.md` on 2026-11-14. Titles, so you can tell whether to open it:

- 2026-07-26 — self-hosted fonts
- 2026-07-29 — Wishlist priority (Phase 9, pulled forward)
- 2026-07-29 — serif swap: Instrument Serif to Lora
- 2026-07-30 — Wishlist sort clarity + automatic Discogs cover art
- 2026-07-31 — Security audit fixes + Discogs token rotation
- 2026-08-03 — Concert Radar (Phase 11): mock → real, live, SeatGeek-backed
- 2026-08-04 — Concert Radar: manual-add fallback, verified a real SeatGeek gap, mobile nav fix
- 2026-08-04 — Concert Radar Phase 12: venue scraper (`venue-shows.mjs`), Ticketmaster signup in progress, weekly feed health check
- 2026-08-04 — v16: live crash, Refresh coverage gap, Watching moved server-side
- 2026-08-04 — v16.1: poisoned cache showing "null" cards, movie screenings in Coming Soon
- 2026-08-04 — v17: "Check live →" and manual Search only ever checked SeatGeek
- 2026-08-04 — v18: Watching venue detail, Coming Soon decluttered, real weekly server-side refresh
- 2026-08-04 — v18.1: stale cache + no fallback for genuinely-unmatched watched artists
- 2026-08-04 — v18.2: ambiguous loading state + real shows for the 3 gap artists
- 2026-08-04 — venue-shows.mjs v4: a second real Easy Star All-Stars show, flagged directly by Susan
- 2026-08-04 — concert-radar.html v18.3: same stale-cache bug, third time today, fixed at the root
- 2026-08-04 — v18.4: artist-name normalization fix, real E2E harness, feeds roadmap, Phase 10 plan (unattended, Susan headed out)
- 2026-08-04 — v18.5: venue-scraped calendars were showing unfiltered in Coming Soon
- 2026-08-05 — Phase 10 live: `/api/artists-playing` shipped without CORS headers, silently broke the whole cross-site feature
- 2026-08-06 — Concert Radar E2E harness gains real Travel Intelligence coverage; package.json wiring gap closed
- 2026-08-06, later — real Chicago show entered; concert-radar.html gains a deep-link entry point
- 2026-08-07 — GitHub Actions CI wired for real, and it caught a genuine Node-version incompatibility
- 2026-08-08 — second content-drift check: about.html's "records tracked" vs. the latest catalog backup
- 2026-08-08 — doc alignment pass: a removed design element and two unshipped-on-paper features
- 2026-08-08, later still: the manual Search panel's free-text city geocoding gap is closed, no geocoder added
- 2026-08-09: watching.mjs reaches v2 — deletions now remembered permanently, closing the exact gap that made tonight's data-loss incident confusing to diagnose
- 2026-08-09, later: catalog backup migrated off Netlify onto GitHub Actions (first move in the weekend cost-reduction plan)
- 2026-08-11 to 2026-08-13 — Concert Radar Phase 13: JamBase Data wired in as a third feed, plus the venue-scraper attribution gap this surfaced
- 2026-08-12 — `/api/artists-playing` reaches v2: parallelized store reads and outbound fetches, SeatGeek gets its own timeout
- 2026-08-13, later — JamBase attribution: partial, honestly flagged as such
- 2026-08-13, later still — GitHub Actions Phase 1: watching-list backup migrated, deploy now Actions-driven, PR-based workflow starts
- 2026-08-14 — deploy job stopped spamming failure emails; JamBase drift fixed in about.html/roadmap.html
- 2026-08-14, later — corrected the deploy-noise fix; two real cross-source Concert Radar bugs, live-caught by Susan, fixed with regression coverage
- 2026-08-14, later still — "Going" and dismiss are now per-venue, not per-artist
- 2026-08-14, later still — the new per-venue dismiss × was rendering as a stray, disconnected control
- 2026-08-14, later still — the per-venue dismiss stopped looking like a second, redundant delete button
- 2026-08-15 — netlify-ignore.sh parity for Actions deploy; JamBase wired into manual search; going-state UI simplified
- 2026-08-14, later — retired the old Netlify-scheduled `backup-watching.mjs` now that the Actions equivalent is confirmed matching
- 2026-08-14, later still — fixed a stale smoke-test assertion (false "title text missing" failure)
- 2026-08-19, later still: the scheduled-sweep migration was blocked on a question that had already been answered
- 2026-08-19, after the push: the cutover quietly broke the deploy trigger, and nothing would have said so
- 2026-08-21 — Outside-in audit follow-up (PROJECT v52)
- 2026-08-21, later — the Guide had been describing a system that stopped existing in early August
- 2026-08-21 (later still) — deploy-freshness check
- 2026-08-25: Freight & Salvage is not broken, it is blocked, and the health check could not tell the difference
- 2026-08-31 — Freight & Salvage: Susan picked an option, and the health check's 3-for-3 losing streak was the reason to ask
- 2026-09-01 — Freight & Salvage: the browser-like headers deployed clean and did not work
- 2026-09-01, later — Freight & Salvage dropped from active scraping
- 2026-09-09 — check:freshness shipped; the Sunday sweep missed a week
- 2026-09-14, later: the freshness check was wired into nothing, and about.html still said seven venues

## 2026-10-24 — Tests red since v56; About and Guide figures made live

**Cause.** `scripts/check-content-drift.mjs` failed every run from 2026-10-19
(Tests #182 to #185). about.html said 95 records and "v55 charter" against 97
records and v56, and the newest backup mixed currencies (95 USD, 1 EUR, 1
unpriced) while both pages printed one euro total. The 2026-10-19 patch had
been delivered and never committed. The weekly run raised PROJECT.md to v56 and
did not touch the kicker. Run #186 onward is green.

**Why live figures.** The catalog changes daily and a typed number cannot keep
up, so the record count and collection value stopped being typed. about.html
and guide.html mark them `data-live="..."` and an inline
`<script id="live-figures">` fills them from `/api/records` (USD records only,
`collectionValue()` rule). The text inside each element is only the
no-JavaScript fallback. Check 2 now runs that script against the newest backup
with a fake fetch and document, and fails if it renders anything other than an
independent calculation, if a hook is missing, or if a hand-typed catalog size
or four-figure dollar amount comes back. The June 2026 "Bad day" example is
marked `data-example` and exempt. If the value rule in app.js changes, change it
in both page scripts and in the check.

**Also shipped.** The app header shows USD only (app.js v38, Frankfurter fetch
removed). The "accounts or logins" About tile is gone (style.css v33,
`.stat-strip--three`). audit.html v19 saves the auto-fetched `cover_url` when a
pressing is accepted: before, `/api/discogs/cover` committed the image and the
record kept no `cover_url`, so the cover vanished on reload.

**Charter version.** The About kicker cannot be derived (no build step), so the
rule is a paired edit: raise PROJECT.md's version and the kicker together. It is
now written into Job D above. The weekly scheduled task's own prompt lives
outside this repo and was not visible this session; if it bumps the version it
needs the same line.

**Delivered:** about.html, guide.html, audit.html, app.js, index.html,
style.css, the other pages' `style.css?v=33`, scripts/check-content-drift.mjs,
PROJECT.md (v57), this file.

- 2026-10-28: Moved all six Actions crons so no run starts before 10 am Pacific (Susan's standing rule, already applied to Travel Intelligence and The Fitness Log on 2026-10-26/27). New UTC times: backup-catalog 18:05 daily, backup-watching 18:10 daily, daily-freshness 18:30 daily, scheduled-sweep 19:00 Sundays, concert-radar-health-check 18:00 Mondays, test 19:00 Mondays. 18:00 UTC is 10:00 PST and 11:00 PDT, so the rule holds all year. Kept the orderings that matter: freshness after both backups; the sweep about an hour clear of the catalog backup so the two never commit to main together; the Monday health check after the Sunday sweep. check-freshness thresholds are in days, so none of them move. Public pages now say "daily" instead of "nightly" or "overnight" for the backups, because 18:05 UTC is mid-morning in Pacific time; check-content-drift.mjs phrases updated to match. History lines that say "nightly" in the past tense were left alone. The Guide says an older Netlify-scheduled backup still runs; no schedule for it exists in this repo, so if it is set in the Netlify UI its time still needs checking. Not pushed.

- 2026-11-09: Concert Radar showed expired shows, including ones Susan had already attended. Cause: `comingSoonShows()` in concert-radar.html (also read by the Watching panel) sorted by date and never filtered by it, so a past show stayed until a sweep dropped it, and a fresh localStorage cache (CACHE_MAX_AGE_MS is 1h) or a manually added show was never dropped at all. A fix written 2026-10-12 was never applied to this repo, so concert-radar.html was still v21.4. Now v21.5: `isPastShowDate()` filters both the catalog and added lists at read time (nothing deleted from storage; today's shows stay; a malformed date is kept). scripts/e2e-concert-radar.mjs: every `run()` pins the page clock to 2026-08-10 because its fixtures carry hardcoded 2026 dates, and `runPastShowRegression()` uses the real clock with relative dates, so it cannot go stale. Lesson: any date-based filter makes absolute-date test fixtures expire, so pin the clock or use relative dates. PROJECT.md v59, about.html kicker v59. `npm test` passes. Live site not checked (no browser access that session). Not pushed.
