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
      discogs-pricing.mjs/api/discogs-pricing POST · writes record · scrapes
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
| EDIT_SECRET    | records.mjs, save-cover.mjs      | Gates POST/DELETE writes (X-Edit-Key)      | All writes / covers    |
| BACKUP_SECRET  | backup-http.mjs                  | Gates manual GET /api/backup (X-Backup-Key)| Manual backup          |
| DISCOGS_TOKEN  | discogs-lookup, discogs-pricing  | Discogs auth, server-side only             | Pressing/market lookup |
| GITHUB_TOKEN   | save-cover, run-backup           | Commits covers + backups via GitHub API    | Covers + backups       |
| GITHUB_REPO    | save-cover, run-backup           | Target repo (default snesbitt/vinyl-scout) | optional               |
| GITHUB_BRANCH  | save-cover, run-backup           | Target branch (default main)               | optional               |
| SPOTIFY_CLIENT_ID     | audio-preview.mjs         | Spotify client-credentials auth (tier 1 only)| Audio preview (Spotify tier) |
| SPOTIFY_CLIENT_SECRET | audio-preview.mjs         | Spotify client-credentials auth (tier 1 only)| Audio preview (Spotify tier) |
| YOUTUBE_API_KEY       | audio-preview.mjs         | YouTube Data API v3 key, API-key-only (no OAuth) | Audio preview (YouTube tier 4, last resort) — **not yet set as of 2026-07-12**; get one free from Google Cloud Console (enable "YouTube Data API v3", create an API key, no OAuth consent screen needed for public search). Until set, tier 4 gracefully reports "not configured" with zero effect on the other three tiers. |

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

Audio preview went through two implementations on 2026-07-11: an initial
Spotify-only `spotify-preview.mjs` (retired), then `audio-preview.mjs`, which
tries Spotify, then Deezer, then iTunes in sequence and returns whichever
provider actually has a playable clip. This happened because Spotify's own
`preview_url` restriction turned out to affect 100% of this catalog (0/93
records) — see PROJECT.md's Phase 4 section for the full investigation and
the empirical Deezer/iTunes validation behind the switch.

`audio-preview.mjs` went through five further same-day matching-logic
revisions (v3–v7) on 2026-07-11 — see PROJECT.md's Phase 4 section for the
full changelog. The short version: don't trust an `available:true` count
increase by itself. Every fix in that round (and every fix that will follow
it) was verified by tracing the actual matched track back to its real Deezer
album/artist via direct API calls, not just checking that the count went up
— that discipline is what caught two separate wrong-track bugs (v6, v7) that
a plain "did the number improve" check would have missed entirely, including
one (v7) that was hiding behind a result that LOOKED like a successful fix
from an earlier revision (v5's Led Zeppelin *IV* "recovery" was actually
still playing the wrong track, just from a different unrelated album, until
v6 caught it). If this file is touched again, re-run the full 93-record
sweep (not just the specific records you're working on) after any matching-
logic change — two of this session's regressions/bugs (v4's regression, v6's
own discovery) were only found because of records outside the original
target list. A local Node regression-test harness (extract the matching
functions with `sed`, append test cases, run with plain `node`) was used
before every deploy this session and is cheap enough to be worth recreating.

`audio-preview.mjs` reached **version: 8** (2026-07-12) — added a YouTube
tier 4, last-resort fallback for the 7 records confirmed genuinely absent
from Spotify/Deezer/iTunes (see PROJECT.md's Phase 4 section). Needs
`YOUTUBE_API_KEY`, which is **still not set as of 2026-07-12** (re-confirmed
live via `_debug.youtube.configured === false`) — Susan needs to create a
free Google Cloud Console API key herself (account/credential setup an agent
shouldn't do unattended). Until then this tier gracefully reports "not
configured," same pattern as Spotify when unconfigured, with zero effect on
the other three tiers. Once the key is set, re-run the 7 gap records to
confirm real coverage before treating this as fully closed. Unlike the other
three tiers, YouTube returns no `preview_url` (no direct audio file) — only
an `embed_url` that the frontend (`app.js` v32) renders as a 30-second-capped
`<iframe>` instead of the native `<audio>` element. Bumped to **version: 9**
same day — the "most popular track" promise is now provable rather than
incidental: the Deezer free-text pass fetches the identified album's real,
complete tracklist and picks the true top-`rank` track with a preview,
instead of ranking only among whatever a relevance search happened to
surface. Re-verified live (2026-07-12 QA sweep): Fleetwood Mac's *Rumours*
still serves "The Chain" (Deezer's #1-ranked track); same 86/93 available,
same 7 gaps, zero regressions.

Bumped to **version: 10** (2026-07-13) after Susan hit one of the 7 known
gaps directly — Duke Ellington's *Ellington '65* showed a bare "No matching
track found" in the detail modal, which reads like a bug rather than a
known, already-documented, pending-on-`YOUTUBE_API_KEY` state. Independently
re-confirmed live before touching any code (not just trusted the existing
doc note) that this album genuinely isn't on Deezer: walked all 5 Deezer
"Duke Ellington" artist profiles' full album lists (43 + 44 albums on the
two main ones) and ran a direct title search — no "Ellington '65" or
"Ellington 65" anywhere. So this was never a matching-logic bug; the real
bug was that "genuinely absent everywhere" and "not yet re-checked against
YouTube because the key isn't set" returned the identical generic
`reason: "no_match"`, giving the frontend no way to tell them apart. Fix:
a new `reason: "no_match_pending_youtube"` fires specifically when tiers
1–3 all miss AND `YOUTUBE_API_KEY` is unset (tier 4 never actually
attempted) — `app.js` v34 renders this as "Not found on Spotify, Deezer, or
Apple Music — a YouTube fallback is planned but not turned on yet." instead
of the old dead-end copy. Pure messaging fix, no matching-logic touched, so
no regression risk to the other 86 already-resolving records (spot-checked
Air *Moon Safari* and Fleetwood Mac *Rumours* still resolve normally after
deploy). This also exposed a real gap in the weekly automation: Job E's
YouTube-key-activation check (below) only ever *acted* when the key flipped
from unset to set — it never told Susan, week over week, that the 7 gap
records were still sitting in this pending state in the meantime. Job E's
prompt was updated the same day to report that pending count/list every
week regardless of whether the key changed, so this doesn't go silently
unmentioned again.

Bumped to **version: 11** (2026-07-13) after a full 93-record accuracy sweep
run per Susan's explicit request to review the whole catalog, not just
presence/reason-checking but whether the returned track is actually the
right one. Found a genuine wrong-artist bug: Sidney Bechet's *Petite Fleur*
LP was serving Cyrille Aimée's unrelated vocal cover of the same jazz
standard, because `tryDeezerByAlbumTitleSearch` (the third of three Deezer
passes) picked the top-ranked track matching the album title with no check
on who actually performed it. Fix: the function now accepts an optional
corroboration artist, and when Spotify has already found a plausible-artist
match for the same record, filters the album's tracklist down to tracks
whose credited artist overlaps that artist before ranking — returning
nothing at all rather than a wrong guess if none plausibly match. Gated
narrowly (only engages when Spotify already agrees on the artist) to avoid
regressing two known-legitimate cases where this same pass correctly serves
a different-looking artist on purpose: compilation-curator credits (Kruder
& Dorfmeister's *Conversions*, correctly credited to K&D on Deezer even
though individual tracks are by other artists) and classical
composer-vs-performer credits (Beethoven→Barenboim, Karajan→Berliner
Philharmoniker, Scott Joplin→New England Conservatory Ragtime Ensemble) —
confirmed live via `debug=1` that both have `spotify: {track: null}`, so the
new filter never engages for them. Verified with a local Node regression
test against the real observed buggy Cyrille Aimée data before deploy. Full
clean re-sweep of all 93 records post-fix: **85/93 available** with a
verified plausible-artist preview, **6 correctly `no_match_pending_youtube`**
(same list as before — The Cure, Maria Callas, Duke Ellington, Rob Garza,
The Swingle Singers, Various *Verve // Remixed*), **2 correctly
`no_preview`** with an accurate artist match but no playable clip (Various
Artists' *The Blues Volume 2* → Robert Johnson's own track; Sidney Bechet's
*Petite Fleur* → now correctly matched to Bechet's own recording, just no
preview clip available), **0 true unexplained `no_match`**, **0 errors**.
See PROJECT.md v22 for the full changelog entry.

Bumped to **version: 12** (2026-07-13) same day, per Susan's explicit request
("I want the previews all from Deezer"). Removed the Spotify and iTunes
tiers entirely — across the whole 93-record catalog, neither had ever
contributed a single playable preview (Spotify: its own `preview_url`
restriction affects 100% of this catalog; iTunes: confirmed dead since
2026-07-11, its legacy search endpoint unconditionally redirects to HTML).
The only real complication: Spotify's remaining job was supplying the v11
artist-corroboration signal that fixed the Sidney Bechet/Cyrille Aimée
wrong-artist bug — removing it meant rebuilding that mechanism without
Spotify. Did this entirely within Deezer's own data instead:
`tryDeezerByAlbumTitleSearch` now considers EVERY album Deezer returns for a
title (previously only the first), prefers whichever candidate's credited
artist overlaps ours, and corroborates again at the track level within
whichever album it settles on — trusting an uncorroborated match only when
it's the sole candidate, which is exactly what keeps the two legitimate
producer/backing-band-credit cases working (Errol Brown & The
Revolutionaries → Deezer's "The Revolutionaries"; The Scientist → Deezer's
"Roots Radics" — both have only one matching album on Deezer, so no
reordering or refusal ever applies). Verified this is strictly better than
the v11 mechanism, not just a swap: live `debug=1` check post-deploy shows
Sidney Bechet's *Petite Fleur* now resolves to a genuine, correctly-
attributed Deezer preview (previously it could only surface a no-clip
Spotify-sourced attribution, since Deezer's own pass had refused to guess).
Also preserved the "matched but no preview clip" attribution UX natively
from Deezer's own best-guess match (returned even when no candidate has a
playable clip) so removing Spotify doesn't silently lose that detail for
the cases where Deezer itself does the matching.
Full 93-record re-sweep after deploy: **84/93 available, and confirmed
programmatically that 100% of them come from Deezer** (zero non-Deezer
providers in the available set — directly answers Susan's ask). **9
`no_match_pending_youtube` entries across 7 distinct titles** (the catalog
holds two separate pressings each of *The Blues Volume 2* and
*Christmastime*): The Cure, Maria Callas, Duke Ellington, Rob Garza, Various
*The Blues Volume 2* (×2), The Swingle Singers *Christmastime* (×2), Various
*Verve // Remixed*. **0 `no_preview`, 0 true `no_match`, 0 errors.** One
disclosed, expected change: *The Blues Volume 2* moved from "matched via
Spotify, no clip" to "pending YouTube" — Deezer's own title-search guard
was already blocking a match for this generic-enough title independent of
Spotify (a pre-existing limitation, not something this change introduced),
so this is a more honest categorization, not a regression. `app.js` bumped
to **version: 35** to match: provider-name map and no-match copy now say
"Deezer and YouTube" instead of naming three providers, two of which no
longer run. See PROJECT.md v23 for the full changelog entry.

`app.js` reached **version: 33** / `style.css` **version: 25** (2026-07-12) —
added a quiet one-line "Most valuable" callout under the collection-value
stat in the controls heading, naming the single highest-priced record
(thumbnail + artist + title + price, in the app's existing typography — no
badge, no change to the tile grid). Deliberately restrained: Susan has twice
pulled back from decorative additions here (the green "FIND" badge removed
per PROJECT.md v10, and pricing/metadata stripped off gallery tiles per
app.js v26), so this stays inside the header's existing typographic language.
Pure client-side read of already-stored `price_median`/`price_low` — no new
endpoint, no network call. `mostValuableRecord()` compares raw numeric price
across all records regardless of currency (only ever displays one record's
own price in its own currency, never sums across them).

Also on 2026-07-12: `wishlist.html`'s manual-add form never called the
Discogs lookup at all, so manually-added items got no `cover_url` unless
Susan pasted a Discogs URL herself — confirmed live via 1/56 items affected
(Anita Baker's "Rapture"). Fixed in `wishlist.html` v13 by having the add
flow call `/api/discogs/lookup` itself (best-effort, never blocks the add on
failure); the Discogs URL and Notes fields were also dropped from the form
per Susan's request in the same pass. If a similar "some records are missing
X" report comes in again, check whether the manual-add path independently
duplicates whatever enrichment the automated sync paths do — this bug and
the wishlist's separate `current_ask`/`price_median` gap (populated only by
the external weekly scout, not by anything in this repo, so newly-added
items always start as "NEVER SOLD" until the following Monday) are the same
shape of problem: manual adds bypass enrichment that automated adds get for
free.

**E2E QA sweep (2026-07-12, run against the live site after the v33/v25
highlight deploy):** all 7 static pages return 200; `/api/records` returns
93 records with valid shape; unauthenticated `POST /api/records` and
`POST /api/save-cover` both correctly 401; `/api/discogs/lookup` with no
params correctly 400; `/api/audio/preview` reachable and returning a real
Deezer preview for a generic query; noindex + X-Frame-Options headers and
`robots.txt` disallow all present. Wishlist ungated POST/DELETE round-trip
re-verified end-to-end (add a test item, confirm it appears, delete it,
confirm it's gone, no junk left behind) — one early check came back
"not found" after the previously-documented ~2.5s Blobs read-lag, but a
slower retry (found at 2s on a second attempt) confirmed this was a one-off
propagation blip, not a regression; both backfilled wishlist records
(Anita Baker, Andrés Segovia) still carry their `cover_url`/`current_ask`.
`npm run smoke` cannot run from this environment's sandboxed shell (no
outbound access to arbitrary internet hosts) — the full smoke-test logic was
replicated via browser-side `fetch` instead and is the source of the results
above; if a future agent has a real shell with internet access, prefer
running `npm run smoke` directly.
