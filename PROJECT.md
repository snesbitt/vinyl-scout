# Vinyl Scout — Project Charter

**Version:** 27 · **Last revised:** 2026-08-03

**Changelog**
- **v27 (2026-08-03)** — Weekly maintenance run: refreshed Discogs market data for all 94 catalog records (collection value ≈€2,232); scouted median/cheapest-listing prices for all 76 wishlist items; synced new vinyl-available albums into the wishlist from Spotify listening (Spring!, work in progress, classical, kitchen dancing playlists — 11 net-new adds after the no-re-add filter, sync-state.json updated) — no vinyl found in the Amazon cart this week; Job E health checks all green (cache-bust versions consistent site-wide aside from a minor app.js query-string/header-comment mismatch — see below; all 5 audio-preview canaries pass; YouTube fallback key still not configured, but 0 records are currently blocked on it — the 7 records once listed as YouTube-pending were already resolved by the Deezer override-table fix shipped in v25, confirmed live this run); cover-art spot check (12 records + 12 wishlist items) all resolve; full smoke-test parity 8/8 green. Minor drift noted, not yet fixed: index.html requests `app.js?v=37` but app.js's own header comment still says `version: 36` with no v37 changelog entry — functionally harmless (no stale-cache risk since 37 > 36) but the bookkeeping should be reconciled.
- **v25 (2026-07-20)** — Two rounds in one day: a security audit that found and fixed a real, live gap, and a regression from that very fix — caught live via a screenshot Susan sent after deploying — fixed the same day. **Round 1 (audit fixes):** (1) **[Security, critical]** `discogs-pricing.mjs` (`POST /api/discogs-pricing`) had **zero server-side auth check** — despite this charter's own endpoint table and CLAUDE.md's repo-layout comment already (incorrectly) documenting it as edit-secret-gated, the code never actually verified `X-Edit-Key` against `EDIT_SECRET`. Confirmed by reading the file end to end before touching it: no auth reference existed anywhere. This mattered in practice, not just on paper — it's reachable from the public, unauthenticated "Refresh pricing" button in every record's detail modal, and a successful call writes real fields (`price_low`/`price_median`/`price_high`/`have_count`/`want_count`/rating) onto the record and burns a real Discogs API call, so any site visitor could trigger writes and quota burn at will. Fixed (function reaches **v20**) by copying `records.mjs`'s `checkWriteAuth()` verbatim rather than inventing a new gate: same `X-Edit-Key` header, same fail-closed comparison (rejects if `EDIT_SECRET` is unset), same 401 JSON shape. Every POST here is inherently a write (no public-read path exists in this file, unlike `records.mjs`), so the check runs unconditionally, before the `DISCOGS_TOKEN` read. Confirmed `/api/discogs/lookup` (genuinely public read) and `/api/wishlist` (deliberately ungated per Susan's 2026-07-11 request) are untouched. (2) `audio-preview.mjs` reaches **v18**: fixed a debug/production drift bug where `?debug=1` mode called the Deezer free-text and artist-catalog-walk passes unconditionally — even for generic-artist ("Various Artists"/"Various"/"VA") records — while `tryDeezer()`, what production actually calls, has always skipped both passes for generic artists via `isGenericArtist()` (neither pass has a real artist identity to corroborate a title match against for those records). Net effect: a `debug=1` request against a generic-artist record could report a different, less-safe candidate than production actually serves — exactly backwards for a diagnostic mode whose whole purpose is showing what production did. Fixed by threading an optional `debugInfo` param through `tryDeezer()` itself instead of keeping a second, separately-maintained copy of the generic-artist guard in the request handler, so debug and production now make the literal same call. (3) Mobile touch-target/zoom-on-focus fixes on the two pages Susan edits from most on her phone: `audit.html`'s inline-edit fields (**v17**, paired with `style.css?v=27`) — base `.audit-input` font-size 14px→16px (with per-field overrides as low as 12px removed, since they'd otherwise still override the new 16px base back below the iOS-zoom threshold) and min-height 36px→44px; `.audit-select.js-condition` (the Goldmine condition dropdown) got the identical fix even though the originating report named only "`.audit-input` and related classes" — same inline-edit surface, same tap-and-type interaction, leaving it out would have been an inconsistent half-fix. `seed.html`'s textarea (**v5**, no version bump — its own internal numbering already didn't match its latest dated entry before this edit, a pre-existing drift left alone rather than guessed at) — base font-size 14px→16px; the existing ≤640px mobile query already correctly set 16px but only covers viewports up to 640px, so an iPhone in landscape (852px on an iPhone 15) fell through to the un-fixed 14px base rule. (4) `style.css` reaches **v27**: `.chip` (genre filter pills) and `.vbtn` (List/Gallery toggle) raised from 34px (38px even inside the ≤720px mobile query) to the 44px minimum this charter's own Working Agreement specifies, scoped to the mobile breakpoint only — desktop deliberately stays 34px, since the 44px rule is framed as a mobile-Safari concern and bumping the pointer-driven desktop rule too would add visual bulk for no accessibility benefit there. `wishlist.html`'s `.wl-play` inline preview button (**v16**) got the same fix, 36px→44px. (5) Two stale-comment bugs fixed in the same pass: `audit.html`'s and `seed.html`'s internal `// version: N (paired with style.css?v=…)` comments had drifted from their own `<link>` tags — audit.html's said `?v=25` against an actual `?v=26`, seed.html's said `?v=23` against the same actual `?v=26` (three versions stale) — both now track the link tag exactly, `?v=27`. `app.js`'s `buildAudioBlock()` inline comment still described the retired three-provider (Spotify→Deezer→iTunes) architecture, more than a week after `audio-preview.mjs` v12 (2026-07-13) removed Spotify and iTunes entirely — corrected to describe the actual current architecture (Deezer multi-pass, YouTube last resort); no functional change, no version bump. (6) Added `scripts/test-audio-preview.mjs` — the first *committed, permanent* regression fixture for `audio-preview.mjs`'s matching/scoring logic. Nearly every prior fix in this file's history (v3–v7, v11, v15, and others) mentions being "verified with a local Node regression suite" before deploy, but none of those suites were ever committed — only `scripts/smoke.mjs` existed, and that's a live black-box check against the deployed site, not unit coverage of the matching functions. The new fixture imports the real exported functions (`containsWholeWords`, `artistsOverlap`, `isGenericArtist`, `tryDeezerByAlbumTitleSearch`, `tryDeezer` — newly exported as named exports in `audio-preview.mjs` **v19**, additive and inert to the deployed default-export handler) with a mocked `global.fetch`, no live network calls, no API key needed: 17 assertions covering the Bechet/Aimée wrong-artist bug (v11), the Led Zeppelin whole-word-containment bug (v6), the Scott Joplin composer-fallback regression (v15), and the generic-artist skip-guard fix (2) above exercises directly. `npm run test:audio-preview` added to `package.json`. Verified: `node scripts/test-audio-preview.mjs` → **17 passed, 0 failed**. (7) Added a consolidated "Weekly automation (Jobs A–E)" reference section to CLAUDE.md, synthesized entirely from this changelog's v6/v7/v9/v20/v21 entries and CLAUDE.md's own existing prose (no invented details) — before this, the external `weekly-vinyl-median-refresh` scheduled task's full spec was only reconstructable by cross-referencing all of those against each other. Explicit about which job letters (C2, D, E) are actually named in the source material versus which (A, B, C) are the section's own inferred sequential labels. **Round 2 (a real regression, found live via a screenshot, fixed same day):** Round 1 item (1)'s fix was correct on the server — but broke the "Refresh pricing" button for Susan herself. `app.js`'s client-side `refreshPricing()` was never updated to actually send a passphrase with its `POST /api/discogs-pricing` call, so once the endpoint was correctly gated, the button 401'd for everyone, including its own intended user — a fail-closed gate rejecting a request that never carried a credential at all, working exactly as designed on the server side, while leaving Susan stuck with no way to use a button she was supposed to have. Caught live: Susan deployed round 1, tried the button, hit the 401, and sent a screenshot. Root-caused rather than just patched around: the server-side gate itself was re-verified correct (re-read `checkWriteAuth()` side by side with `records.mjs`'s), which narrowed the bug to the one caller inside this repo that actually depends on it. Fixed by mirroring `audit.html`'s existing `getEditSecret()`/`clearEditSecret()` pattern verbatim rather than inventing a new one — same `sessionStorage` key (`vs_edit_secret`), same prompt-once-then-cache behavior, so a passphrase entered on either page carries over within the same browser tab — wired into `refreshPricing()`'s fetch call as an `X-Edit-Key` header. A 401 response now calls `clearEditSecret()` (in case the cached passphrase itself was the wrong one) and flips the button to "Retry" instead of leaving it stuck disabled with no path forward. `app.js` bumped to **v36**. Verified by re-reading `refreshPricing()` end-to-end post-fix and confirming the request now actually carries the header before it reaches the server. **The lesson this exposes:** a server-side auth fix and its in-repo caller are two separate pieces of surface area even when they land in the same session — round 1's own QA (syntax check, code-level checklist) confirmed the gate itself worked, but nothing in that pass exercised the one place in this repo that calls it, which is exactly the kind of gap "diagnose, then fix" and a live post-deploy check exist to catch. Documented here in full, not glossed over, per this charter's own "Honesty over confidence" rule and the precedent set by v15's and v21's same-session regression writeups. **Also fixed as part of this pass, doc-accuracy only, no behavior change:** CLAUDE.md's repo-layout table didn't say `discogs-pricing.mjs` was gated at all (unlike every other row, which explicitly states `gated`/`ungated`) — now says so explicitly, and the `EDIT_SECRET` environment-variable table row now lists `discogs-pricing.mjs` among the files it gates, matching what the code has actually done since Round 1 item (1). This charter's own endpoint table (below) already correctly stated `/api/discogs-pricing` as edit-secret-required before today — that claim was simply false until Round 1 item (1) made it true; confirmed accurate now, no change needed there.
- **v26 (2026-07-20, changelog backfill for code shipped 2026-07-14 & 2026-07-16)** — `audio-preview.mjs` drifted to v16 and v17 in an out-of-scope session that never wrote a changelog entry; backfilling now for changelog parity, verified against the actual commits and the file's own inline comments, nothing invented. **v16 (2026-07-14): wishlist coverage sweep**, per Susan's request for 100% wishlist preview coverage (this endpoint already serves `wishlist.html` as well as the catalog detail modal — same code, no separate wishlist path). Audited all 73 wishlist items live: 69/73 already resolved correctly, 4 gaps found and fixed. Three were genuine "filed under a different release" cases resolved via new `KNOWN_COMPILATION_TRACKS` entries (each confirmed against Deezer's raw API first, per this file's standing discipline): Dimitri From Paris x Sister Sledge's *Le Chic Remix* box -> Sister Sledge's "Thinking of You (Dimitri from Paris Remix)"; Statik Sound System's "Revolutionary Pilot" -> the same track, correctly credited, just filed under the album *DJ-Kicks: Kruder & Dorfmeister* rather than any album titled "Revolutionary Pilot"; Rachmaninoff's "Fantasia" -> the wishlist entry itself is mislabeled, the actual paired piece is Vaughan Williams' "Fantasia on a Theme by Thomas Tallis" (confirmed via Discogs). The fourth (Adele's *25*) was a real matching-logic bug, not a content gap: `tryDeezerByArtistCatalog`'s `/search/artist?q=Adele` call doesn't return the real Adele at all (confirmed live — four small unrelated artists instead, even at `limit=15`). Fixed generally, not just for Adele, by supplementing the artist-search candidate pool with whatever artist a same-query free-text track search turns up, gated by `artistsOverlap` so an unrelated artist can never slip in — a best-effort supplement only, so no previously-working match can regress. **v17 (2026-07-16): one `KNOWN_COMPILATION_TRACKS` override for Crosby, Stills & Nash's *CSN* -> "Dark Star"**, added after Susan reported the detail modal playing "For What It's Worth" instead. Root-caused: the stored title "CSN" normalizes to a single token, which fails this file's "specific enough for containment" gate and falls through to an unrelated same-artist result — not a real content gap (the actual 1977 *CSN* album, Discogs release 3904782, is genuinely on Deezer, and "Dark Star" is its obvious representative track, confirmed via Wikipedia/AllMusic). **Flagged honestly in the code itself and repeated here:** this is the one entry in the whole map that was never confirmed live against Deezer's raw API before shipping — cross-origin fetches to `api.deezer.com` failed in the sandbox it was written in. Ships safely regardless because the override mechanism fails closed to the existing (broken) behavior if the query doesn't corroborate, so it cannot make anything worse — but per the code's own note, this specific record's preview button still wants a live tap-and-listen confirmation from Susan.
- **v24 (2026-07-13)** — Closed out all 7 remaining Deezer gaps (9 record-entries across 7 titles) plus a regression found along the way — **93/93 records now resolve, 100% via Deezer, 0 pending-YouTube, 0 no-preview, 0 errors.** Built at Susan's explicit direction, starting with The Cure: "its a best of album so choose a track like boys don't cry that is on another album too via Deezer," then "use this tactic for the other 8 albums." **`audio-preview.mjs` v13:** added a small, explicit `KNOWN_COMPILATION_TRACKS` override map — not a general heuristic, a per-record table mapping a compilation/best-of title to one specific, real, verified-on-Deezer-under-a-different-release track by the same artist (or an explicitly-named different artist, for generic "Various Artists" credits). The Cure's *Standing on a Beach* now resolves via "Boys Don't Cry" from Deezer's own *Greatest Hits*. **v14:** researched and added the remaining 6 titles the same way (never guessed a track — looked up each real tracklist via web search/Discogs first, then confirmed live on Deezer before adding): Duke Ellington's *Ellington '65* → "Hello Dolly"; Maria Callas' *The Incomparable Maria Callas* → "Casta Diva"; Rob Garza's *The Dust Ups* → "Summer Is Ours"; The Swingle Singers' *Christmastime* → "Jingle Bells"; Various Artists' *The Blues Volume 2* → Muddy Waters' "Got My Mojo Working"; Various' *Verve // Remixed* → Willie Bobo's "Spanish Grease." Two silent-failure bugs found and fixed in the same pass: (1) map keys must be pre-normalized exactly as `normalizeTitle()` produces them — literal apostrophes/parens/slashes left in by hand (e.g. `"ellington '65"`, `"the dust ups (remix album)"`, `"verve // remixed"`) caused the lookup to silently miss and fall through with no error, not a crash — caught by computing the real normalized key for all 7 pairs and diffing against the map; (2) Deezer's free-text search returns zero results for certain multi-term/parenthetical queries (confirmed live: `"Rob Garza" + "Summer Is Ours (G's Dust Up)"` and even the same query without parens both return nothing; only the shortened `"Garza" + "Summer Is Ours"` works) — fixed by giving Garza's entry an explicit shortened artist/track pair rather than the literal credited strings. **v15: found and fixed a genuine regression this same session introduced.** A full 93-record re-sweep after the above fixes turned up a NEW gap not present before this session — Scott Joplin's *Red Back Book* (previously a documented-working classical composer-vs-performer case) started failing. Root cause: this session's earlier v12 rewrite of `tryDeezerByAlbumTitleSearch` (the Deezer-only corroboration rebuild, see v23) added a branch that skips every title-matching candidate and returns null when more than one candidate exists and none corroborates against the stored artist — which is exactly what happens for a composer with no recordings of his own (2 Deezer albums match "Red Back Book" by title; neither has any track credited to "Scott Joplin"). Fixed by restructuring the function to compute whether ANY candidate corroborates before deciding to filter at all — only rejects uncorroborated candidates when corroboration has proven to be a real, available signal somewhere among the candidates; otherwise falls back to trusting the first/best-ranked match, same as pre-v12 behavior. Verified with a 4-case local Node regression suite (Bechet-preferred-over-cover, Errol-Brown-sole-candidate-trust, Scott-Joplin-fallback, best-guess-with-no-preview) before deploy, then live via `debug=1`: *Red Back Book* now correctly resolves to "Joplin: Maple Leaf Rag" by the New England Conservatory Ragtime Ensemble. **Final re-sweep after all of v13/v14/v15: 93/93 available, 100% Deezer, 0 pending, 0 no-preview, 0 true no-match, 0 errors** — a clean, fully-explained catalog for the first time since audio preview shipped.
- **v23 (2026-07-13)** — Simplified audio preview to Deezer-only + a YouTube last resort, per Susan's explicit request ("I want the previews all from Deezer"). Removed the Spotify and iTunes tiers from `audio-preview.mjs` (now v12): neither had ever contributed a single playable preview across the whole 93-record catalog (Spotify's own `preview_url` restriction affects 100% of this catalog; iTunes' legacy search endpoint has been confirmed dead since 2026-07-11). Spotify's one remaining real job — supplying an artist-corroboration signal so Deezer's title-only pass doesn't accept a same-titled cover by a different performer (the v11 Sidney Bechet fix) — was rebuilt entirely on Deezer's own data instead: `tryDeezerByAlbumTitleSearch` now considers every album Deezer returns for a title (not just the first), prefers whichever candidate's credited artist overlaps ours, and corroborates again at the track level within whichever album it settles on, trusting an uncorroborated match only when it's the sole candidate — which is what still keeps the two legitimate producer/backing-band-credit cases working (Errol Brown & The Revolutionaries → Deezer's "The Revolutionaries"; The Scientist → Deezer's "Roots Radics"). This is strictly more capable than the v11 version, not just a like-for-like swap: verified live post-deploy that Sidney Bechet's *Petite Fleur* now resolves to a genuine, correctly-attributed Deezer preview (previously it could only show a no-clip Spotify-sourced attribution). Ran a full clean 93-record re-sweep post-deploy: **84/93 available, 100% from Deezer** (confirmed programmatically — zero non-Deezer providers among the available set), **9 entries correctly `no_match_pending_youtube`** covering **7 distinct titles** (the catalog holds two separate pressings each of *The Blues Volume 2* and *Christmastime* — The Cure's *Standing on a Beach*, Maria Callas' *The Incomparable Maria Callas*, Duke Ellington's *Ellington '65*, Rob Garza's *The Dust Ups*, Various Artists' *The Blues Volume 2* (×2), The Swingle Singers' *Christmastime* (×2), Various' *Verve // Remixed*), **0 `no_preview`**, **0 true `no_match`**, **0 errors**. One expected, honestly-disclosed side effect: *The Blues Volume 2* moves from "matched via Spotify, no clip" to "pending YouTube" — Deezer's own title-search guard was already blocking a match for this generic-enough title on its own (a pre-existing limitation, not something this change introduced), so removing Spotify's lucky independent match just means this record is now categorized the same honest way as the other 6 known Deezer gaps, rather than showing a richer-but-Spotify-dependent detail. `app.js` bumped to v35 to match: provider-name map and no-match copy now say "Deezer and YouTube" instead of listing three retired providers.
- Older entries (v1–v22) moved to [CHANGELOG_ARCHIVE.md](./CHANGELOG_ARCHIVE.md) to keep this charter's context footprint down for future sessions — full history preserved there, nothing deleted.

---

## Identity

**Vinyl Scout** is Susan's personal vinyl record cataloging app. Lives at vinylscout.org on Netlify. Susan has ~75 LPs; the catalog currently holds **93 records**. She works primarily from mobile (iPhone, Safari).

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

### Phase 2 completion summary (snapshot at first completion, 2026-07-01 — superseded by the current figures in the Phase 2 status line above)

- **Enrichment state at that point:**
  - 90/92 records have Discogs release IDs
  - 89/92 have market prices (EUR/USD from Discogs marketplace)
  - 3 unmatched or no-data releases at the time:
    - Bob Marley & The Wailers — In Dub: ID found (3804112) but Discogs release page returns 403 on scrape (likely a Discogs archive issue)
    - Verve Remixed — Volume 4: multiple title variations, still unmatched after title refinements
    - Tosca — J.A.C.: no pricing data on Discogs (ID matched, but no marketplace data)
  - Collection value total at that snapshot: ~€1,443.73 (displayed on home page with "X of Y priced" coverage label). Enrichment continued after this snapshot — see the Phase 2 status line above for the current total (≈€2,178.21) and current coverage (92/92 priced).
- **Display:** Detail modal shows Market section with pricing, copies available, community data, and ratings
- **Backup:** Full snapshot of enriched data available at `backups/2026-07-01.json`

---

## Phase 3 — COMPLETE: Wishlist

**Status:** ✓ Live (2026-07-04). `/wishlist.html` + `/api/wishlist`.

**The whole thing in one sentence:** A separate page tracking records Susan is hunting for, with a weekly scout that checks Discogs asking prices and keeps cover art and medians current (the original max-price/FIND-flagging behavior was removed at Susan's request — see v10).

**How it works:** Items live in their own Blobs store (`wishlist`), separate from the catalog store so wishlist writes can never touch it. **As of 2026-07-11, wishlist POST/DELETE are ungated** (no edit-secret check) — Susan asked for this because typing a passphrase on mobile every session wasn't practical for a page she uses casually. This is a deliberate exception to the edit-secret pattern used everywhere else; anyone with the site URL can add or remove wishlist items. Susan adds items on the page (artist + title only, as of v13 — see below). The weekly Claude-driven scout reads each item's Discogs sell page through Susan's browser (server-side scrapes get 403'd) and writes back `current_ask`/`price_median`. Adds come two ways: manual on the page, and a weekly Spotify sync that imports her most-played albums (vinyl-matchable only; never deletes).

**v13 (2026-07-12): manual-add form simplified + cover-art bug fixed.** Susan asked to drop the Discogs URL and Notes fields from the manual add form — now just artist + title. Separately, while looking at the wishlist, Susan flagged a record with no cover art (Anita Baker's *Rapture*); investigating found the actual bug: the manual-add path never called `/api/discogs/lookup` at all, so every manually-added item got no `cover_url` unless Susan happened to paste a Discogs URL herself (confirmed live: 1/56 items affected — the automated Spotify/Amazon-cart sync path already looked this up, so the gap was specific to manual adds). Fixed by having `addItem()` call the lookup itself at add-time (best-effort — a failed lookup still lets the item get added, just with no cover, same graceful behavior as before) and backfilled Anita Baker's record directly (release 2655338, confirmed the cover image actually loads). Also separately backfilled two records showing "NEVER SOLD" that actually had live Discogs listings (Andrés Segovia's *Granada* → €18.45, Anita Baker's *Rapture* → €8.61) — both were added since the last weekly scout run and simply hadn't been touched yet; `current_ask`/`price_median` are populated by that external weekly process, not by any code in this repo, so a newly-added item will always show "NEVER SOLD" until the following Monday unless manually backfilled like this.

---

## Phase 4 — LIVE: Audio Preview

**Status:** ✓ Built, deployed, and verified live against the full catalog (2026-07-11), out of the normal phase order, at Susan's direct request. Rebuilt same-day as a multi-provider lookup after Spotify's own preview restriction turned out to affect the entire catalog (see "Why multi-provider" below), then went through five further same-day matching-logic revisions (v3–v7) after diagnosing first a batch of real false positives, then two further false-positive bugs found only by deliberately re-checking what "available:true" results actually played rather than trusting the count. Simplified to Deezer-only + YouTube last resort on 2026-07-12 (v23). **As of 2026-07-13 (v13–v15 below): 93/93 records (100%) resolve to a real, individually-verified-correct playable preview, 100% via Deezer, 0 gaps, 0 known bugs.**

**The whole thing in one sentence (current, post-v12):** A "Preview" section in the collection detail modal — and, since 2026-07-14, on each wishlist row too (`wishlist.html` v15, commit `83b56ec`) — with a Play button that fetches the most popular track on that album, trying Deezer first, then a small hand-picked override table for compilations Deezer doesn't carry under their own title, then YouTube as a last resort, and plays whichever provider actually has a clip in-app (a native `<audio>` element, or an embedded YouTube iframe for the YouTube tier, which has no direct audio file).

**How it works (originally built 2026-07-11 as three tiers; corrected below — Spotify and iTunes were removed at v12, 2026-07-13, see the v23 changelog entry above; kept here for historical context since neither ever contributed a single playable preview):**
- `GET /api/audio/preview?artist=&title=` (`netlify/functions/audio-preview.mjs`) — pure read, ungated, same reasoning as `discogs-lookup.mjs`
- Originally tried three providers in order, stopping at the first one with a real preview clip:
  1. **Spotify (retired v12, 2026-07-13)** — client-credentials flow (`SPOTIFY_CLIENT_ID`/`SPOTIFY_CLIENT_SECRET`, Netlify env vars), searches `artist:"…" album:"…"`, ranks by `popularity`. Best match quality when it has a clip, which as of 2026-07-11 is never (see below) — kept as tier 1 since the credentials are already configured and it's occasionally the richest data source.
  2. **Deezer (still current, now tier 1)** — public `/search` endpoint, **no API key/registration needed**. Free-text query (field-filtered `artist:"" album:""` syntax is much stricter and misses near-matches — e.g. "Temple of I and I" vs. Deezer's "Temple Of I & I"). Ranks candidates by Deezer's own `rank` field, a genuine popularity score. Preview URLs are signed and expire after a few hours, which is fine since they're only ever fetched fresh on tap, never cached.
  3. **iTunes (retired v12, 2026-07-13)** — Apple's public Search API, also no key needed. Wrapped defensively (try/catch, checks `content-type` is JSON before parsing) because a live browser check redirected `itunes.apple.com/search` to an Apple marketing page rather than JSON — status genuinely uncertain, so any failure here just no-ops rather than erroring. **No popularity signal exists on this API** — it picks the first track under the matched album rather than a verified most-popular one, so the "most popular track" guarantee is best-effort only at this tier.
  - **Current tier 2 (still active): a `KNOWN_COMPILATION_TRACKS` override table** — added v13/v14 (2026-07-13), resolves compilation/best-of albums Deezer doesn't carry under their own title by pointing at one specific, Deezer-verified representative track. See the v24 changelog entry above.
- Frontend (`app.js` `buildAudioBlock`/`playPreview`) lazy-fetches only when Susan taps Play. Shows a small "via Deezer"/"via YouTube" credit line under a playing clip (updated at `app.js` v35, 2026-07-13, when the provider-name map dropped the retired Spotify/Apple Music entries).
- **Graceful degradation, not an error:** if nothing anywhere has a preview or match, the UI shows a quiet muted note — never the persistent error-banner treatment reserved for actual failures. If a track matched on some provider but nothing had a playable clip, a "Listen on {Provider} ↗" link opens that provider's own page for the track.
- **Scope note:** the original roadmap sketch for this phase mentioned playback from both the collection and the wishlist. Both now have it: the collection detail modal shipped first, and wishlist preview clips shipped separately (commit `83b56ec`, "Phase 4: wishlist preview clips + roadmap update").

**Setup: done (2026-07-11).** `SPOTIFY_CLIENT_ID`/`SPOTIFY_CLIENT_SECRET` are set on the **vinylscout** Netlify project (Deezer and iTunes need no credentials at all). Several real bugs were found and fixed getting here:
1. Susan's local Netlify CLI link (`netlify link`) was pointed at the wrong project the whole time — site id `rainbow-conkies-19e527` is actually **thefitnesslog.org**, a separate Netlify project on the same account, not vinylscout.org. Every `netlify env:set` run from a terminal in this repo was silently setting vars on the wrong site. Fixed by setting the vars directly in the **vinylscout** project's dashboard instead. If CLI-based env var work is attempted again here, verify `netlify status` / the admin URL actually says vinylscout before trusting it.
2. Spotify tightened the `/v1/search` `limit` parameter from a 0–50 range down to **0–10** (undocumented-to-us until it broke). The Spotify tier was requesting `limit=50` and got a hard 400 "Invalid limit" for every request. Fixed by capping at 10.

**Why multi-provider (2026-07-11 investigation):** After fixing both bugs above, a full sweep of all 93 catalog records against Spotify showed **0 of 93 with a playable preview** — 78 matched a track but got `preview_url: null` (Spotify's platform-wide restriction on preview clips for apps outside "extended quota mode," in effect since late 2024 — confirmed even on top hits like "Sexy Boy" (Air) and "Dreams" (Fleetwood Mac), so it isn't a matching-quality problem), and 15 didn't match any track at all (mostly reissues, remix compilations, and classical recordings whose vinyl-edition titles don't line up with Spotify's digital catalog naming). Susan asked for a genuine in-app preview and to look at "creative industry standard" alternatives. Researched and empirically validated (live API calls, not just documentation) before building:
- **Deezer** — confirmed working end-to-end on 3/3 tested albums that failed on Spotify (Moon Safari, Rumours, Thievery Corporation's "Temple of I and I"), including a real popularity ranking via its `rank` field. No registration required.
- **iTunes Search API** — documentation and recent forum activity suggest it's still active, but a live test redirected the browser to an Apple marketing page instead of returning JSON. Included anyway as a defensive, best-effort third tier (can only add coverage, can't break anything if it's actually down) since it costs nothing to try and needs no credentials.
- **Considered and not implemented:** YouTube (Data API v3 needs a key + has a ~100-search/day free quota, and embeds are video, not audio, plus subject to the video owner pulling it anytime — meaningfully different product than an audio-only preview); SoundCloud (no longer issuing public API keys to new developers); Bandcamp (no public API, would require scraping); Tidal (business-partnership-only developer access). None of these fit a low-effort, no-registration, audio-first, single-user hobby app the way Deezer and iTunes do.

**Live verification sweep (2026-07-11, post-deploy):** Every one of the 93 catalog records was queried against the live `/api/audio/preview` endpoint on vinylscout.org.
- **First pass: 75/93 (81%) available**, all via Deezer, 0 via Spotify, 0 via iTunes, 18 `no_match`.
- **Diagnosis of the 18:** rather than accept "no match" at face value, each was checked directly against Deezer's catalog (artist search, artist album list, album search) outside the function to see whether the gap was a real absence or a matching-logic failure. Two of three spot-checked Cure titles (*The Head on the Door*, *Japanese Whispers*) turned out to be genuinely on Deezer — the function's free-text search just never surfaced them, buried under higher-"relevance" unrelated tracks. k.d. lang's *Absolute Torch and Twang* had the same problem. This proved the gap was partly a software bug, not a data gap.
- **Fix shipped (v2, same day):** Deezer tier gained an artist-catalog-walk fallback (see v15 changelog). **Second pass: 81/93 (87%) available**, still all via Deezer, 0 bugs — 6 of the 18 recovered (Kruder & Dorfmeister *Conversions*, Tosca *J.A.C. Reissue*, The Benny Goodman Quartet *Together Again*, k.d. lang *Absolute Torch and Twang*, The Cure *The Head on the Door* and *Japanese Whispers*).
- **Remaining 12/93 `no_match`** at that point — each checked directly against Deezer's catalog (not just through the function): most confirmed genuinely absent, but this round of research (see v3–v5 below) recovered several more via better matching logic, and separately, deliberately re-checking what a handful of "recovered" `available:true` results actually played turned up two more real bugs (see next section) rather than genuine gaps.

**v3–v5 (2026-07-11, same day): three more false positives found, one regression found and reverted.** Rather than stop at "the count went up," every fix in this round was verified by tracing the actual matched track back to its real Deezer album/artist, not just checking `available:true`:
- **v3 — three false positives fixed:** (1) Maria Callas' *The Incomparable Maria Callas* had matched an unrelated Bellini opera excerpt purely because both titles contained "Maria Callas" — fixed by requiring fuzzy-overlap matches to include at least one non-artist-name word as evidence. (2) *The Blues Volume 2* (Various Artists) and (3) The Swingle Singers' *Christmastime* and *Verve // Remixed* had all matched unrelated releases purely on generic words ("blues"/"volume", "christmastime", "remix") — fixed with a generic-compilation-word stoplist excluded from fuzzy scoring, plus a "Various Artists" placeholder detector that routes those records to a stricter, title-only match path.
- **v4 regression, caught and reverted the same day:** a specificity gate meant only for the free-text pass got applied universally, which broke short-but-real album titles across the whole catalog (Led Zeppelin's *IV*, Kraftwerk's *Autobahn*, Joy Division's *Closer*, Moby's *Play*, Peter Gabriel's *Security*, and others) — caught by re-running the FULL 93-record sweep after deploying, not just the originally-reported problem records, which is what surfaced albums going missing that had nothing to do with the fix. Reverted in v5 by scoping the gate back to only the one pass that actually needed it.

**v6/v7 (2026-07-11, same day): two more false positives found and fixed — this time by not trusting "available:true" at face value.** After v5 restored the short-title matches, spot-checking what Led Zeppelin's *IV* actually played (rather than just confirming `available:true`) surfaced a genuinely wrong track, which led to two more real bugs:
- **v6 — letter-substring containment bug:** Led Zeppelin's *IV* was matching a 2025 Deezer release called *Live EP* — not because of any word-level relevance, but because the plain JavaScript `.includes()` check used for "is this album title a match" was doing raw letter-substring matching, and the letters "iv" literally appear inside the word "Live". Any short 2-3 letter title was at risk of matching any unrelated album whose title happened to contain those letters in sequence (e.g. "Live", "Arrival", "Drive"). Fixed with a proper whole-word containment check (`containsWholeWords`) so "iv" only matches when it appears as its own word — confirmed against Led Zeppelin's real Deezer catalog, which has "Led Zeppelin IV (Deluxe Edition)" and "Led Zeppelin IV (Remaster)", both of which contain "IV" as a genuine word.
- **v7 — wrong-artist compilation/remix bug:** Air's *Moon Safari* was matching a Vegyn remix cover, credited entirely to a different artist ("Vegyn"), filed on an unrelated 2008-era tribute album called *Blue Moon Safari* that happens to contain the words "Moon Safari" — the free-text and artist-catalog passes both checked the ALBUM title but never checked WHO actually performed the candidate track. Fixed by requiring the track's own credited artist to plausibly correspond to our stored artist whenever the title match isn't an exact (or near-exact, artist-name/generic-wrapper-only) one. Verified this fix does NOT break the legitimate cases where a classical/jazz recording is credited to the performer rather than the composer (Karajan's Mozart Requiem → credited to "Berliner Philharmoniker"; Beethoven's Piano Sonatas → credited to "Daniel Barenboim"; Scott Joplin's Red Back Book → credited to a ragtime ensemble) — those all pass because their album titles are exact or near-exact matches (composer-name-as-prefix, e.g. "Beethoven: Complete Piano Sonatas", is treated as a benign wrapper, not a mismatch signal), so they never needed the new artist check to begin with. Re-ran the full 93-record sweep after this fix: same 86/93 available, same 7 genuine gaps, and every one of the 86 was individually checked for a plausible artist/title correspondence — the only remaining artist-credit differences are the already-understood, legitimate categories (classical composer→performer, reggae producer→backing-band, and one same-standard-different-performer case for Sidney Bechet's "Petite Fleur," a widely-covered jazz standard where Deezer's catalog under Bechet's own name didn't surface a matching album title — documented as a known best-effort limitation, not a bug, since it's the same song and a real recording, just not independently verified to be the exact same performance as Susan's specific pressing).
- **Both v6 and v7 fixes were verified with a local Node regression suite (12 cases covering every previously-fixed bug plus the two new ones) before each deploy, and against the live site after deploy** — including re-confirming the specific broken tracks now resolve to the correct release, and that all previously-correct matches (Beethoven, Karajan, Joplin, Scientist, Oscar Peterson, Kruder & Dorfmeister) still resolve exactly as before.

**Final tally before tier 4 (v3–v7): 86/93 (92%) available, 0 known bugs.** The remaining 7 `no_match` records were each individually checked directly against Deezer's catalog (not just through the function) and confirmed genuinely absent under any title: Maria Callas' *The Incomparable Maria Callas*, Duke Ellington's *Ellington '65*, Rob Garza's *The Dust Ups (Remix Album)*, two "Various Artists" compilations (*The Blues Volume 2*, *Verve // Remixed* — Deezer has other, unrelated releases under similar titles, not Susan's specific pressing), The Swingle Singers' *Christmastime*, and The Cure's *Standing on a Beach* (confirmed absent from Deezer's full 74-album Cure catalog under any title, including the alternate "Staring at the Sea" title used in some regions). Every `available:true` result across the full sweep was HTTP 200 with a non-empty `preview_url`; sampled preview URLs were independently fetched and confirmed to return real audio (`206 Partial Content`, `audio/mpeg`) — not dead links.

**v8 (2026-07-12): tier 4, YouTube — last resort.** Susan asked whether any other source could cover the remaining 7. Researched empirically rather than from memory before building: checked Deezer directly for the real "Verve Remixed" compilation series (confirmed genuinely absent, ruling out a naming-mismatch theory) and queried Bandcamp's public (undocumented, no-key) search API directly — zero results for Rob Garza, The Cure, and Swingle Singers; some unrelated archival Callas material but not the specific record. Concluded YouTube was the one remaining option with real odds of covering all 7, reversing the earlier "considered and not implemented" call now that it only needs to cover a handful of last-resort lookups (quota is a non-issue at this volume).
- **How it works:** `tryYouTube(artist, title)` — search.list for candidates (needs `YOUTUBE_API_KEY`, a free API-key-only Google Cloud Console credential, no OAuth), filtered to videos whose title contains at least one artist token AND one title token (YouTube's own relevance ranking is noisy — an unfiltered top hit is often a cover, reaction video, or unrelated same-named track), then videos.list for view counts + durations on those candidates, picking the highest-viewed one within a 30s–12min duration window (excludes full-album uploads, DJ sets, bootleg concert videos — all common false "matches" for an album-title search specifically on YouTube).
- **No `preview_url`** — YouTube gives no direct audio file, only an `embed_url` (a YouTube iframe embed with `start`/`end` params that actually stop playback there, not just a UI suggestion). Capped at the same 30-second convention as the other three tiers. Frontend (`app.js` v32) renders an `<iframe class="detail__audio-youtube">` in place of the native `<audio>` element when `provider === "youtube"`; `stopAnyPreview()` clears the iframe's `src` to stop it (iframes have no `.pause()`).
- **Setup still pending as of 2026-07-12:** `YOUTUBE_API_KEY` is not yet set on the vinylscout Netlify project — getting one requires a Google Cloud Console project, which is account-setup territory outside what an agent should do unattended. Until Susan sets it, this tier gracefully reports "not configured" (confirmed live: `_debug.youtube.configured === false`, zero effect on the other three tiers) exactly like Spotify's own graceful-degradation pattern. Once set, re-run the 7 gap records to confirm real coverage before calling this phase fully closed.

**v13–v15 (2026-07-13): closed out all 7 remaining gaps, plus a same-session regression.** See v24 changelog entry above for the full narrative. Summary: `KNOWN_COMPILATION_TRACKS`, a small explicit override map (never a general heuristic — each entry is a specific, real, Deezer-verified track researched per-record before being added), resolves compilation/best-of albums that aren't themselves on Deezer by pointing at one representative single that IS, corroborated the same way every other pass corroborates artist identity. All 7 previously-documented gaps (The Cure, Maria Callas, Duke Ellington, Rob Garza, Various *The Blues Volume 2* ×2, The Swingle Singers *Christmastime* ×2, Various *Verve // Remixed*) now resolve this way. Along the way, a genuine regression in the v12 Deezer-only corroboration rebuild was found (Scott Joplin's *Red Back Book*, previously working, started failing) and fixed by only rejecting uncorroborated title-matches when corroboration succeeds on at least one candidate anywhere, rather than whenever more than one candidate exists. **Final tally: 93/93 (100%) available, 100% via Deezer, 0 pending-YouTube, 0 no-preview, 0 true no-match, 0 errors.**

**v9 (2026-07-12): guarantee the "most popular track" promise, not just usually deliver it.** Susan asked to make sure the preview is genuinely the most popular track on each album whenever possible. Investigated empirically before touching anything: spot-checked 5 real multi-track albums already being served via Deezer's free-text pass (Madonna's *Veronica Electronica*, Buena Vista Social Club, Crosby Stills & Nash's *CSN*, Fleetwood Mac's *Rumours*) by independently fetching each album's REAL, complete Deezer tracklist and comparing — all 5 already happened to be serving the true highest-`rank` track. But that was incidental: the free-text pass only ever ranked among whichever tracks happened to surface in a relevance-ranked search, not the album's actual full tracklist, so nothing guaranteed it would keep being right for every record. Fixed by having the free-text pass, once it identifies the correct album, fetch that album's complete tracklist and pick the true top-rank track with a preview — the same authoritative method the artist-catalog-walk and title-only passes already use — falling back to the original free-text hit only if that lookup fails. Re-ran the full 93-record sweep after deploying: same 86/93 available, same 7 genuine gaps, zero regressions (Fleetwood Mac's *Rumours* re-confirmed still serving "The Chain," Deezer's own #1-ranked track on that album). Also widened the YouTube tier's candidate pool (10 → up to 50, merging a relevance-ordered search with a separate `order=viewCount` search before scoring) for the same reason — a single 10-result relevance search wasn't guaranteed to surface the objectively most-viewed genuine upload.

---

## UI polish — Highlight the highest-value record (2026-07-12)

Not a phase — a small, low-risk addition to the existing collection view, at
Susan's request ("highlight the highest value album without screwing up the
design"). Three options were sketched (a quiet text callout, a small badge
on the gallery tile, sorting the record to the front of the grid) and the
text callout was recommended and built, given Susan's track record of
pulling back from decoration on this page (see Phase 3/`app.js` v10 and v26
notes above).

**What it does:** `app.js` v33 adds `mostValuableRecord()` — scans all
loaded records for the highest `price_median` (falling back to `price_low`),
compared as a raw number regardless of currency, since only one record's own
price in its own currency is ever displayed, never a cross-currency sum.
`renderHighlight()` writes a one-line callout (`#collection-highlight`) under
the existing `#collection-value` stat: a 22px thumbnail, "Most valuable —
**Artist**, *Title* · €price" (price in gold, matching the existing metadata
color token). `style.css` v25 adds `.controls__highlight` and gives
`.controls__heading` `flex-wrap` so the new line breaks onto its own row
without disturbing the existing title/count/value baseline row. Pure
client-side read of already-stored fields — no new endpoint, no network
call, recomputed on every `render()` pass alongside the existing collection
value.

## QA sweep (2026-07-12, post-deploy)

Full end-to-end pass against the live site, covering everything shipped in
the last two sessions, not just the newest change:
- All 7 static pages (`/`, `/seed.html`, `/audit.html`, `/wishlist.html`,
  `/roadmap.html`, `/guide.html`, `/about.html`) return 200.
- `GET /api/records` → 93 records, valid shape (`id`/`artist`/`title` present).
- `POST /api/records` and `POST /api/save-cover` both correctly reject
  unauthenticated requests with 401.
- `GET /api/discogs/lookup` with no params correctly 400 (endpoint reachable,
  no token spent).
- `GET /api/audio/preview` reachable, returns a real Deezer preview for a
  generic query; the YouTube tier 4 still correctly reports "not configured"
  (`YOUTUBE_API_KEY` still unset); re-spot-checked Fleetwood Mac's *Rumours*
  still serves "The Chain" (confirms the v9 most-popular-track guarantee is
  holding, not just working by chance at ship time).
- `GET /api/wishlist` → 56 items; both prior backfills (Anita Baker's cover
  art, Anita Baker's and Andrés Segovia's `current_ask`) still present.
- Wishlist's ungated POST/DELETE round-trip re-verified live: added a test
  item, confirmed it appeared, deleted it, confirmed it was gone, confirmed
  no test junk left behind afterward. One early read attempt came back
  "not found" after the previously-documented ~2.5s Blobs propagation delay —
  a slower retry found it within 2 seconds on the very next check, so this
  was a one-off timing blip on that particular request, not a regression in
  the write path itself.
- `noindex` / `X-Frame-Options: DENY` headers and a crawler-disallowing
  `robots.txt` all present.
- `npm run smoke` could not be run directly (this environment's sandboxed
  shell has no outbound access to arbitrary internet hosts) — its assertions
  were replicated via browser-side `fetch` against the live site instead,
  which is what the results above are drawn from.

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

**Wishlist item schema (Phase 3, store `wishlist`):** `id` (`wish_<8-byte-hex>`), `artist`, `title`, `max_price` (nullable — set by Susan; no longer drives any FIND-badge UI, that feature was removed per v10), `currency`, `discogs_release_id`, `discogs_url`, `cover_url`, `notes` (source playlist), `current_ask` (cheapest listing, scout-written), `ask_updated_at`, `price_median` (scout-written), `created_at`. Note: the manual-add form (`wishlist.html` v13, per v17) collects only `artist`/`title` — `discogs_url` and `notes` are populated only for items added via the Spotify/Amazon-cart sync paths, not manual adds.

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
- `GET  /api/audio/preview?artist=…&title=…` — public; pure read; tries Deezer first (plus a small hand-picked override table for compilation/best-of albums not on Deezer under their own title), then YouTube as a last resort — Spotify and iTunes tiers were removed at v12 (2026-07-13), see the v23 changelog entry; returns whichever provider's most-popular-track preview is playable, or a graceful `available:false` reason. Also serves `wishlist.html`'s per-row preview buttons (shipped 2026-07-14, commit `83b56ec`), same endpoint.

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
