# Vinyl Scout — Project Charter

**Version:** 12 · **Last revised:** 2026-07-11

**Changelog**
- **v12 (2026-07-11)** — **Phase 4 shipped: Audio Preview.** Added `netlify/functions/spotify-preview.mjs` (`GET /api/spotify/preview?artist=&title=`, pure read, ungated) and a "Preview" section with a Play button in the collection detail modal (app.js v29, style.css v21). Spotify client-credentials search finds the most popular track on the matched album and returns its preview clip; gracefully reports `available:false` (not an error) when Spotify isn't configured, no track matches, or Spotify has no preview clip for that track. Built ahead of the phase queue at Susan's direct request — wishlist playback (mentioned in the original roadmap sketch) is not yet built, collection-only for now. Also: removed the forced edit-secret gate on `/api/wishlist` POST/DELETE and the matching secret-entry UI on `/wishlist.html`, per Susan's request (impractical to type a passphrase on mobile every session) — wishlist writes are now open to anyone with the URL, same public-but-unadvertised posture as the rest of the site; the catalog's own edit-secret gate (`/api/records`) is unchanged.
- **v11 (2026-07-06)** — Weekly maintenance run. Discogs market data refreshed for all 93 records (92 with sales history updated; Rob Garza *Dust Ups* still never-sold, left unchanged); collection value ≈ €2,228 (sum of medians). All 48 pre-existing wishlist items re-scouted (median + cheapest ask + timestamps). Spotify sync added 18 albums, all verified vinyl pressings with median/ask/cover populated at creation: Röyksopp *Junior* & *Melody A.M.*, Goldfrapp *Supernature* & *Black Cherry*, Sade *Lovers Rock*, Massive Attack *Heligoland*, Talvin Singh *OK*, Kruder & Dorfmeister *1995* & *G-Stoned*, Thievery Corporation *Babylon Rewound*, *Radio Retaliation* & *Symphonik*, plus six from the Rudy Van Gelder playlist (Wayne Shorter *Speak No Evil*, Lee Morgan *The Sidewinder*, Eric Dolphy *Out To Lunch*, Herbie Hancock *Empyrean Isles*, Tina Brooks *True Blue*, Kenny Dorham *Quiet Kenny*). Skipped: Pitch Black *Rhythm, Sound and Movement* and Michael Gray *Take Me Back* (no confirmed vinyl pressing). Wishlist now 68 items (68 covers, 67 asks, 65 medians). E2E QA green: six pages 200, unauthorized writes/deletes 401, delete round-trip clean. No user-facing feature changes.
- **v10 (2026-07-06)** — Removed the max-price / green-FIND feature at Susan’s request (wishlist v11): max-price input, FIND badge, and green-card styling deleted; new items store max_price:null. The weekly scout still refreshes medians, cheapest asks, and covers — it just no longer computes FIND matches. about.html updated to match.
- **v9 (2026-07-06)** — Amazon cart becomes a wishlist source. One-time import with Susan added 12 records from her Amazon saved-for-later (Sade Diamond Life, Bill Evans Portrait In Jazz + Bill Evans Trio Sunday At The Village Vanguard (OJC), Aphex Twin SAW 85-92, Tania Maria Wild!, Adam F Circles (F-Jams), Goldie Timeless gold-on-clear splatter, Segovia Granada, Marvin Gaye I Want You, Weather Report Heavy Weather, Afro-Cuban All Stars A Toda Cuba Le Gusta, Thievery Corporation The Cosmic Game 20th Anniv) — each matched to the specific pressing the Amazon listing names, priced and artworked; skipped books and the unofficial-only Miles Davis/Bill Evans Master Takes box. Weekly Monday job gains Job C2: read-only Amazon cart sync (active cart + saved-for-later, never modifies the cart). Sync rules tightened per Susan: Spotify sweep limited to her designated playlists only (no full-library enumeration), and a persistent no-re-add rule via sync-state.json — items Susan deletes are never auto-re-added. Wishlist: 50 items, 100% artwork, 48 medians / 49 asks. E2E QA green: 6 pages 200, auth gate all 401, delete round-trip clean; collection 93 records / 92 medians / ≈€2,227.79.
- **v8 (2026-07-04)** — Wishlist matured through v10 in one sitting with Susan: album-art thumbnails on every row (Discogs lookup thumb at import; release-page og:image backfill); MEDIAN sale price is the bare headline number (cheapest listing ‘€x listed’ for never-sold releases); compact single-line rows (titles ellipsize, price block never wraps); optimistic add/delete (fixes the double-click-to-delete illusion caused by Netlify Blobs read-lag — the UI now updates its own list on success instead of re-fetching); intro copy clarified (max price is optional and explained). Wishlist sources now: Your Top Songs 2025 top-50, seven of Susan's playlists, and the ‘Rudy Van Gelder (minus the crap)’ jazz list — ~50 items, 100% artwork, ~95% priced. Format lesson encoded: a ‘12"’ in a release TITLE is not vinyl (the Dimitri From Paris ‘Thinking Of You 12" Remixes’ releases are digital Files); the remix rule now verifies the actual format and hunts remixer vinyl compilations (Le Chic Remix 2×12 carries those mixes). E2E QA: all six pages 200; unauthorized writes 401 on records and wishlist; 93 records / 92 medians / ≈€2,233; wishlist 50 items.
- **v7 (2026-07-04)** — Wishlist is now Spotify-fed. One-time import + weekly sync pull Susan's 50 most-played tracks (Spotify 'Your Top Songs' playlist, read via her browser), collapse them to unique albums, exclude albums already owned or already wishlisted, and add only releases that exist on vinyl (Discogs lookup; digital-only releases are skipped). First import: 13 albums added, 1 skipped as owned, 33 skipped digital-only. Sync never deletes wishlist items — pruning is manual. Also: record #93 added (Madonna — Confessions II, 2xLP Pink Translucent, Mint, fully enriched; collection ≈ €2,233).
- **v6 (2026-07-04)** — **Phase 3 shipped: Wishlist.** New `/wishlist.html` page and `/api/wishlist` function (separate Blobs store `wishlist`; GET public, POST/DELETE gated by the same edit secret; single-item operations only, per Hard Rules). Items carry artist, title, max_price, discogs_release_id, notes, and scout-written current_ask. Agentic layer (lives outside the repo, in Susan's Claude app): a weekly Claude-driven run refreshes record medians AND scans Discogs sell pages for wishlist items, flagging any ask ≤ max_price as a FIND; a daily read-only watchdog checks record count vs. latest backup, median presence, and site availability, alerting Susan on anomalies. Hard-Rules note: these are Susan-sanctioned automations (approved 2026-07-04) — enrichment writes remain single-item upserts through the gated API, and the watchdog never writes.
- **v5 (2026-07-04)** — Median-wipe incident diagnosed and fixed. The Jul 1–2 batch enrichment run overwrote every stored median and community stat with nulls: Discogs 403-blocks Netlify's datacenter IPs, so the server-side release-page scrape always fails in production, and pricing v18 wrote its (null) scrape variables unconditionally. **Function v19:** a failed or empty scrape now preserves the record's existing enrichment; API-sourced fields (`price_low`, `copies_available`) update only when the API returns data. Full dataset restored via browser-side re-scrape: 91/92 records carry median/high/have/want/rating/last-sold (one release has no Discogs sales history at all). **UI v24/v25 + CSS v20:** gallery tiles and list rows show Low/Median/High plus Have/Want; detail modal adds the community Rating row; header shows collection value only. Collection value ≈ €2,178.21.
- **v4 (2026-07-01)** — Phase 2 complete. All 92 records enriched with Discogs IDs and pricing (89/92 have market prices; 3 have no Discogs marketplace data or exact match). Collection value total displayed on home page. Updated roadmap.html and about.html to reflect Phase 2 live status. Next phase: Wishlist (intentionally parked).
- **v3 (2026-07-01)** — Phase 2 enrichment is now executable. Added `vs-enrich-batch.py` for batch Discogs ID lookup and pricing fetch. All 92 records can now be enriched (57 pending IDs, 88 pending pricing updates). The display already exists in the detail modal. Enrichment is on-demand only (no cron, no background mutation).
- **v2 (2026-05-28)** — Reconciled the charter with what's actually deployed: added `/audit.html` (inline edit / delete / cover-upload) and git backups to Phase 1 scope; documented the `/api/backup` endpoints; updated catalog state (~91 records, covers applied). Adopted two new Phase 1 items: SEO suppression (noindex) and write-protection (shared edit secret on `POST`/`DELETE`). Added this version header.
- **v1 (2026-05-21)** — Phase 1 reset after the May 2026 data-loss incident.

---

## Identity

**Vinyl Scout** is Susan's personal vinyl record cataloging app. Lives at vinylscout.org on Netlify. Susan has ~75 LPs; the catalog currently holds **92 records**. She works primarily from mobile (iPhone, Safari).

The site is **publicly viewable but not advertised**: it's excluded from search engines (noindex), and the only people who edit it are those who hold the edit secret. It is not a private/login-walled site — anyone with the URL can view the gallery.

Aesthetic: editorial / record-shop / library catalog card.
- Fraunces italic display serif · IBM Plex Sans body · IBM Plex Mono for catalog numbers
- Cream `#f1ebdc` ground · ink `#1c2018` text · vinyl-red `#b53026` accent · gold `#a8801c` for metadata
- Subtle paper-noise radial gradients
- No emoji in UI chrome (the camera 📷 icon is the only exception)

---

## Phase 1 — COMPLETE: barebones cataloging via vision

**Status:** ✓ Seeding done (92 records live). All Phase 1 features deployed.

**The whole thing in one sentence**: A static site that displays Susan's vinyl collection, with new records added by Claude looking at photos Susan uploads in chat, plus an audit page for hand-edits — protected so only Susan can write.

### In scope (Phase 1)

- One persistent record store (Netlify Blobs, store name: `records`) — 92 records
- One read endpoint (`GET /api/records`) — strictly read-only, **public**
- One write endpoint (`POST /api/records`) — upsert by ID only, **requires the edit secret**
- One delete endpoint (`DELETE /api/records/:id`) — single ID only, no bulk variant, **requires the edit secret**
- Backup endpoint (`GET /api/backup?key=…`) — reads the whole store and commits a JSON snapshot to `backups/YYYY-MM-DD.json` in the repo. **Pure read of the store; never mutates it.** A scheduled function performs the same backup nightly.
- One static page (`/`) showing the collection as a gallery + list view
- One static page (`/seed.html`) where Claude-generated JSON gets pasted in to bulk-add (writes use the edit secret)
- One static page (`/audit.html`) for hand-edits: inline edit of artist/title/year/genre, single-record delete (confirm-gated), and per-record cover upload (browser-compressed to a data URL). Uses only the existing `/api/records` endpoint (writes use the edit secret). **This was explicitly requested by Susan — a sanctioned expansion, not creep.**
- **SEO suppression** — `noindex` on every page and a disallow-all `robots.txt`
- **Write-protection** — `POST` and `DELETE` reject any request without the correct edit secret (sent as a request header, never in the URL).
- Record fields: `id`, `artist`, `title`, `year` (optional), `genre` (optional), `cover_url` (optional), `notes` (optional), `created_at`

### OUT of scope for Phase 1

- ❌ Discogs API of any kind (moved to Phase 2 — now complete)
- ❌ OCR / Tesseract
- ❌ Grading / Goldmine pricing / marketplace
- ❌ User accounts / per-user login
- ❌ Dedup of any kind (banned — see Hard Rules)
- ❌ Background enrichment / auto-backfill
- ❌ Triage views (Inbox / Accepted / Passed)
- ❌ "Nice to have" features Susan didn't ask for

---

## Phase 2 — COMPLETE: Discogs enrichment

**Status:** ✓ All 92 records enriched — 92/92 priced, 91/92 with median/high sales history (one release has never sold on Discogs). Collection value ≈ €2,178.21 displayed on home page.

**Median data caveat (v19):** median/high/have/want/rating/last-sold come from the Discogs release *page*, which Discogs serves only to real browsers — server-side scrapes get 403. That data is collected browser-side (Claude-assisted session). The pricing function (v19) preserves it: when the scrape fails, a refresh only updates `price_low` and `copies_available`, never nulling stored enrichment.

**The whole thing in one sentence**: Fetch missing Discogs release IDs for 57 records, and pricing + marketplace stats for all 92.

### How it works

1. **Batch lookup script** (`vs-enrich-batch.py`):
   - Reads all 92 live records
   - For each record without `discogs_release_id`: searches Discogs API (by artist + title) to find the release ID
   - For each record: calls `/api/discogs-pricing` (on-demand pricing function) to fetch:
     - `price_low`, `price_high`, `price_median` (sales history range)
     - `price_last_sold` (date string, e.g., "Apr 23, 2026")
     - `copies_available` (active listings on Discogs marketplace)
     - `have_count`, `want_count` (community collection/wishlist counts)
     - `rating_avg`, `rating_count` (average rating out of 5)
     - `price_currency` (usually EUR or USD, inferred from marketplace data)
   - Handles Discogs rate limits (60 req/min), retries, partial success
   - Upserts each record via the API (one at a time, never bulk-replace)
   - Prints a summary: X ID lookups succeeded, Y pricing fetches succeeded, Z failed

2. **Display** (already deployed):
   - The detail modal shows all fetched data in a "Market" section
   - Layout: cover on left, artist/title/metadata on right, then pricing block below
   - No code change needed — the display endpoints exist and work

3. **Rate limits & resilience**:
   - Discogs API: 60 requests/minute (enforced server-side)
   - Script auto-retries on 429 (rate limit) with 30-second backoff
   - Partial success is OK: if pricing fails for a record, we keep going
   - No data loss: backups are automatic

### Running the enrichment

**Prerequisites:**
- Edit secret (shared with Susan via secure channel — NOT in the repo)
- Python 3.7+
- Internet connection

**Steps:**
1. Download the script from the repo: `vs-enrich-batch.py`
2. Run: `python3 vs-enrich-batch.py`
3. When prompted, enter your edit secret (input is hidden)
4. Script will:
   - Print progress for each record
   - Pause and retry if Discogs rate-limits it
   - Summary at the end
5. Check the gallery at https://vinylscout.org (allow 30-60s for Netlify to refresh)

**If something goes wrong:**
- Restore from a backup: `git show <backup-commit>:backups/YYYY-MM-DD.json > restore.json`
- Paste that JSON into `/seed.html` to reseed
- Or manually re-run the script to retry failed records

### Phase 2 completion summary

- **Enrichment state (final):**
  - 90/92 records have Discogs release IDs
  - 89/92 have market prices (EUR/USD from Discogs marketplace)
  - 3 unmatched or no-data releases:
    - Bob Marley & The Wailers — In Dub: ID found (3804112) but Discogs release page returns 403 on scrape (likely a Discogs archive issue)
    - Verve Remixed — Volume 4: multiple title variations, still unmatched after title refinements
    - Tosca — J.A.C.: no pricing data on Discogs (ID matched, but no marketplace data)
  - Collection value total: ~€1,443.73 (displayed on home page with "X of Y priced" coverage label)
- **Display:** Detail modal shows Market section with pricing, copies available, community data, and ratings
- **Backup:** Full snapshot of enriched data available at `backups/2026-07-01.json`

---

## Phase 3 — COMPLETE: Wishlist

**Status:** ✓ Live (2026-07-04). `/wishlist.html` + `/api/wishlist`.

**The whole thing in one sentence:** A separate page tracking records Susan is hunting for, each with a max price, with a weekly scout that checks Discogs asking prices and flags finds.

**How it works:** Items live in their own Blobs store (`wishlist`), separate from the catalog store so wishlist writes can never touch it. **As of 2026-07-11, wishlist POST/DELETE are ungated** (no edit-secret check) — Susan asked for this because typing a passphrase on mobile every session wasn't practical for a page she uses casually. This is a deliberate exception to the edit-secret pattern used everywhere else; anyone with the site URL can add or remove wishlist items. Susan adds items on the page (artist, title, optional Discogs release URL, notes). The weekly Claude-driven scout reads each item's Discogs sell page through Susan's browser (server-side scrapes get 403'd) and writes back `current_ask`/`price_median`. Adds come two ways: manual on the page, and a weekly Spotify sync that imports her most-played albums (vinyl-matchable only; never deletes).

---

## Phase 4 — LIVE: Audio Preview

**Status:** ✓ Built and deployed (2026-07-11), out of the normal phase order, at Susan's direct request.

**The whole thing in one sentence:** A "Preview" section in the collection detail modal with a Play button that fetches the most popular track on that album from Spotify and plays its preview clip.

**How it works:**
- `GET /api/spotify/preview?artist=&title=` (`netlify/functions/spotify-preview.mjs`) — pure read, ungated, same reasoning as `discogs-lookup.mjs`
- Uses Spotify's client-credentials flow (`SPOTIFY_CLIENT_ID` / `SPOTIFY_CLIENT_SECRET`, set in the Netlify UI) — no user-facing Spotify login
- Searches Spotify tracks scoped to `artist:"…" album:"…"`, ranks by `popularity` (most popular track on the album, not random), returns that track's `preview_url`
- Frontend (`app.js` `buildAudioBlock`/`playPreview`) lazy-fetches only when Susan taps Play. A native `<audio controls>` element plays the clip; closing the modal pauses it.
- **Graceful degradation, not an error:** if `SPOTIFY_CLIENT_ID`/`SECRET` aren't set yet, no track matches, or Spotify has no preview clip for the matched track (Spotify has restricted `preview_url` availability for many API apps since late 2024), the UI shows a quiet muted note — never the persistent error-banner treatment reserved for actual failures.
- **Scope note:** the original roadmap sketch for this phase mentioned playback from both the collection and the wishlist. Only the collection detail modal has it so far — wishlist playback is a possible follow-up, not yet built.

**Setup: done (2026-07-11).** `SPOTIFY_CLIENT_ID`/`SPOTIFY_CLIENT_SECRET` are set on the **vinylscout** Netlify project. Two real bugs were found and fixed getting here, both worth knowing about:
1. Susan's local Netlify CLI link (`netlify link`) was pointed at the wrong project the whole time — site id `rainbow-conkies-19e527` is actually **thefitnesslog.org**, a separate Netlify project on the same account, not vinylscout.org. Every `netlify env:set` run from a terminal in this repo was silently setting vars on the wrong site. Fixed by setting the vars directly in the **vinylscout** project's dashboard instead. If CLI-based env var work is attempted again here, verify `netlify status` / the admin URL actually says vinylscout before trusting it.
2. Spotify tightened the `/v1/search` `limit` parameter from a 0–50 range down to **0–10** (undocumented-to-us until it broke). `spotify-preview.mjs` was requesting `limit=50` and got a hard 400 "Invalid limit" for every request. Fixed in v3 by capping at 10.
- Confirmed against several high-popularity real albums (Moon Safari, Rumours, Thriller): matching and popularity-ranking work correctly, but Spotify returns `preview_url: null` for all of them — this is Spotify's known platform-wide restriction on preview clips for apps outside "extended quota mode" (rolled out since late 2024), not a bug in this code. In practice this likely means most/all records will show "no preview available" rather than a playable clip. This is handled as the documented graceful-degradation case, not an error.

---

## Phase 5+ — Future / Parked

Not in scope. When asked about: "that's Phase N, parked" and stop.

---

## Hard Rules — NON-NEGOTIABLE

### 1. The catalog is sacred

The previous version lost 29 records to a dedup race condition, with no restore path. The catalog now has **nightly + on-demand git backups** (`backups/YYYY-MM-DD.json`), so there is finally a real restore path — but the rules below still hold as defense in depth. A backup is a safety net, not a license to be careless.

- **No bulk-delete code paths.** Ever. No function may call delete on more than one record per invocation.
- **No auto-dedup.** Banned from the codebase. If duplicates appear, they appear. Susan deletes them manually one at a time.
- **No background mutation.** List/read endpoints — including `/api/backup` — are pure reads. They cannot write to the records store under any circumstance.
- **All writes are upserts by ID.** Never "replace all records with this array."
- **Single-record delete only**, gated by a UI `confirm()` dialog.
- **Enrichment is on-demand only.** No cron jobs, no background polling, no automated retries. Susan runs the batch script manually.

### 2. Scope is sacred

If a feature wasn't explicitly requested in this charter or in a current ask, don't build it. When tempted to add a "nice to have," ask first.

### 3. Deploys are versioned

Every code change bumps the cache-bust version in `/app.js?v=N` and `/style.css?v=N`. The current `N` is documented at the top of `app.js` in a `// version: N` comment. `/audit.html` carries its own internal `// version: N` for its inline script.

### 4. No silent failures

Every error path renders a visible, persistent error in the UI with the actual error text. No `setTimeout(hideError, …)` cleanup that swallows diagnostics. Mobile has no console. A rejected write (wrong/missing edit secret) must surface a clear, visible message — not fail quietly.

### 5. Honesty over confidence

If a release ID, identification, or fact is uncertain, say so. Don't fabricate confidence Susan can't verify.

---

## QA discipline — required for every iteration

Before delivering ANY code change, Claude runs this checklist explicitly in the response:

### Pre-flight (state these upfront)
- [ ] One-sentence scope of the change
- [ ] Files that will be modified (by name)
- [ ] Confirmed in-scope for Phase 1 (or asked Susan if not)

### Code-level
- [ ] Every modified file passes `node --check` (or equivalent syntax check)
- [ ] No `deleteRecord`, `.delete(`, bulk-delete, or dedup logic added anywhere
- [ ] No new function mutates storage from a read endpoint
- [ ] Cache-bust version bumped in `index.html` and `seed.html` (and `audit.html` if its script changed)
- [ ] Cross-file references verified: imports resolve, CSS classes match selectors, frontend API paths match backend `export const config = { path }`
- [ ] Secrets are sent as headers, never in URLs; never committed to the repo or baked into served HTML
- [ ] Dead code removed (unused functions, abandoned imports)
- [ ] No `setTimeout` patterns that hide errors

### Post-flight (the message Susan receives)
- [ ] **What changed** — one paragraph, plain language
- [ ] **Files touched** — bulleted list by name
- [ ] **How to deploy** — exact steps
- [ ] **How to verify it works** — specific test (e.g., "snap a photo of 3 albums, expect modal with 3 rows")
- [ ] **How to roll back** — what to undo if it breaks
- [ ] **New cache-bust version** — e.g., "now at v=9"

If ANY item is in doubt, stop and ask Susan before proceeding.

---

## Working agreement

- **Susan moves fast** — take initiative on design and minor UX, but never on scope additions.
- **Mobile-first** — every layout checked at 375px viewport before shipping. Tap targets ≥44px. Inputs ≥16px font (no iOS zoom).
- **Diagnose, then fix.** When Susan reports a failure, read the code, trace the path, report the actual cause. Only ship a fix after the diagnosis is confirmed.
- **Brevity** — explanations are a paragraph, not an essay. Don't re-explain programming.
- **Ask one clear question, not three speculative ones** when uncertain.
- **Build to spec** — if it's not in this document, it's not in scope.

---

## Record schema (Phase 1, locked)

```json
{
  "id": "rec_<8-byte-hex>",
  "artist": "string",
  "title": "string",
  "year": null | number,
  "genre": null | "string",
  "cover_url": null | "string",
  "notes": "",
  "created_at": "ISO timestamp"
}
```

Phase 2 adds (all optional/nullable): `discogs_release_id`, `price_low`, `price_high`, `price_median`, `price_last_sold`, `price_currency`, `copies_available`, `have_count`, `want_count`, `rating_avg`, `rating_count`, `price_updated_at`, `condition`.

**Wishlist item schema (Phase 3, store `wishlist`):** `id` (`wish_<8-byte-hex>`), `artist`, `title`, `max_price` (nullable — set by Susan; enables the green FIND state), `currency`, `discogs_release_id`, `discogs_url`, `cover_url`, `notes` (source playlist), `current_ask` (cheapest listing, scout-written), `ask_updated_at`, `price_median` (scout-written), `created_at`.

---

## Catalog seeding & editing workflow (Phase 1+2)

**Seeding (new records):**
1. Susan photographs albums in groups of 3–6 per shot
2. Susan uploads photos to chat
3. Claude (in chat) looks at each photo, identifies each cover, produces a JSON array of record objects
4. Susan visits `/seed.html`, pastes the JSON, taps "Add" (writes use the edit secret)
5. Each record is upserted by its `id` (Claude generates unique IDs)
6. Susan reviews the collection in `/`

**Editing (existing records):** Susan uses `/audit.html` — inline-edit text fields, delete a row (one at a time, confirm-gated), or tap a cover to upload replacement artwork.

**Enriching (Phase 2):** Susan runs `vs-enrich-batch.py` locally; script fetches Discogs data and upserts all records.

No automation between chat and the site. Chat → JSON → paste → add. Every link in this chain is auditable by Susan.

---

## Endpoints (deployed)

- `GET  /api/records` — public; returns all records as a JSON array
- `POST /api/records` — edit-secret required; upsert one record by `id`
- `DELETE /api/records/:id` — edit-secret required; delete one record by `id`
- `GET  /api/backup?key=…` — reads the store, commits `backups/YYYY-MM-DD.json` to the repo; pure read of the store. Scheduled function runs the same nightly.
- `GET  /api/discogs/lookup?artist=…&title=…` — public; returns Discogs candidates
- `POST /api/discogs-pricing` — edit-secret required; body: `{"recordId": "rec_xxx"}`; fetches + stores pricing
- `GET  /api/wishlist` — public; returns all wishlist items as a JSON array
- `POST /api/wishlist` — **ungated as of 2026-07-11** (was edit-secret required); upsert one item by `id`
- `DELETE /api/wishlist/:id` — **ungated as of 2026-07-11** (was edit-secret required); delete one item by `id`
- `GET  /api/spotify/preview?artist=…&title=…` — public; pure read; returns the most-popular-track preview for that album, or a graceful `available:false` reason

---

## Glossary

- **Record**: One row in the catalog. One physical LP.
- **Records store**: The Netlify Blobs store named `records`. One JSON blob per record.
- **Seed**: A chat-generated JSON array Susan pastes into `/seed.html` to bulk-add.
- **Audit page**: `/audit.html` — the hand-edit UI (inline edit, single delete, cover upload).
- **Edit secret**: A single shared passphrase that gates `POST`/`DELETE`. Entered by Susan in the page UI, sent as a request header, validated server-side against an env var. Reads do not require it.
- **Backup**: A JSON snapshot of all records committed to `backups/YYYY-MM-DD.json` in the repo, nightly and on demand.
- **Phase 1**: Cataloguing by photo. Seeding, hand-edits, covers — live.
- **Phase 2**: Market enrichment. Discogs IDs + pricing — live.
- **Phase 3**: Wishlist. Live (2026-07-04). Writes ungated as of 2026-07-11 (see above).
- **Phase 4**: Audio preview. Live (2026-07-11) — built ahead of the queue at Susan's direct request.
- **Catalog**: Susan's full collection. 93 records (reset empty after May 2026; reseeded June–July 2026).
—
