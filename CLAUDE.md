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
                         preview, multi-provider: Spotify -> Deezer -> iTunes
                         -> YouTube last-resort, needs YOUTUBE_API_KEY)
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
  releases are skipped). Never deletes. Respects a persistent no-re-add
  rule via `sync-state.json` — once Susan deletes a wishlist item, this job
  will never re-add it, regardless of how many times it resurfaces in her
  playlists.
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
Audio preview currently covers the collection detail modal only; wishlist
playback was mentioned in the original roadmap sketch but is not yet built.
`PROJECT.md` documents both as their own phases. When in doubt about what's
actually live vs. what a phase label says, read the repo (or ask Susan)
rather than trusting a "parked"/"planned" status by itself.

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
