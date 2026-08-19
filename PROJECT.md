 # Vinyl Scout — Project Charter

**Version:** 50 · **Last revised:** 2026-08-19

**Changelog**
- **v50 (2026-08-19)** — The `scheduled-sweep` Actions migration is done, and it turned out not to need the thing it had been blocked on. Since 2026-08-13 this has been carried as an architecture decision between two options: give GitHub Actions a Netlify Blobs API token (works against the "less Netlify" goal), or build a new `EDIT_SECRET`-gated write endpoint for Actions to POST to (real new surface area). Both assume the sweep still has to get data *into* Blobs. It does not, and has not since 2026-08-14, when `scripts/scheduled-sweep.mjs` + `.github/workflows/scheduled-sweep.yml` shipped: that job runs in Actions, reads the same public endpoints, and commits its merged result to `data/catalog-cache.json` with no Netlify credential at all. It has been running on its Sunday 10:00 UTC cron and its output is real (`source: "github-actions"`, 36 shows across 132 artists, last written 2026-08-16 10:30 UTC). The only thing still pointing at Blobs was the *read* side. `netlify/functions/catalog-cache.mjs` v2 now serves that committed file instead of `getStore('catalog-cache')`, which closes the item as a read change adding zero secrets, rather than as the authenticated write path either original option required. Response shape is unchanged apart from an additive `source` field. `scripts/test-catalog-cache.mjs` (new, 21 assertions, wired into `npm test`) pins the contract `concert-radar.html`'s first paint depends on, including that `at` stays a number so `concert-radar-health-check.mjs`'s 9-day freshness check keeps working, and that no `@netlify/blobs` import survives in the file. **Deliberately not done in the same change:** `netlify/functions/scheduled-sweep.mjs` still exists and still writes the Blobs store, now with no reader. That is harmless and keeps a fallback while the read side is verified; retire it in a follow-up. **Needs one live check:** this is a bundler-boundary change, and this repo's own rule is that an import across a deployment boundary can pass every local test and still fail in the real bundle. After deploy, confirm `https://vinylscout.org/api/catalog-cache` returns a non-empty `shows` array with `source: "github-actions"`. If it returns the empty placeholder, the fix is `included_files` in `netlify.toml` plus a runtime read, not a revert.
- **v49 (2026-08-19)** — JamBase attribution compliance closed, after being carried as an open risk since 2026-08-13. The blocker was never the fix, it was the doc: `data.jambase.com/api/docs/attribution` is client-side rendered, so three consecutive sessions' fetch attempts returned page metadata and no body text, and v21.1 shipped a clearly-labelled placeholder rather than guessing. Read this session in a real browser. Their rules: a visible credit near the data or at page bottom, linking to JamBase.com with `rel="nofollow"`, using an official mark or the explicitly-permitted plain-text "Powered by JamBase"; and all ticket/event links must carry `rel="nofollow"` and use the primary Ticket Link URL from the API response unmodified, falling back to the JamBase event URL. Measured against that, the placeholder was non-compliant on two counts — "via JamBase" is not an accepted format, and the link carried only `rel="noopener"`. Both fixed in concert-radar.html v21.4, plus `nofollow` on all four "Get tickets" CTAs. The URL half of the rule turned out to already be satisfied by `jambase-shows.mjs` (it prefers the `ticketingLinkPrimary` offer, falls back to the JamBase event URL, and rewrites neither) — verified rather than assumed, and now documented in that file so nobody "tidies" it into a tracking wrapper later. Their doc states non-compliance may result in API access revocation, so this was a live risk to the Concert Radar feed, not a cosmetic one. `npm test` passes clean, with four new assertions in `scripts/e2e-concert-radar.mjs` that check the wording and the `nofollow` specifically — the old test asserted only "is it a link," which is exactly why it passed all along while non-compliant.
- **v48 (2026-08-17)** — Weekly automated maintenance run (Jobs A/B/C/C2/E/D), and it surfaced two real parser bugs that had been silently corrupting data. **Job A:** refreshed Discogs market data for all 94 records; 93 written (one release still has no sales history and was left untouched), 75 medians moved, all small. Collection value €2,219.77 — the site's ≈€2,220 tile and its "most valuable" pick (Bob Marley & The Wailers, In Dub, Vol. 1, €147.89) were both recomputed independently and match. **Job B:** median, cheapest listing, and cover scouted for all 76 wishlist items. *Bug found and fixed:* the cheapest-listing parser was a regex sweep over the stripped sell-page text, so it was picking up shipping amounts and the Statistics block's own Low/Median/High figures as if they were listings — Goldie "Timeless" read €44.50 (a shipping line) against a true cheapest of €209.19; Freddie Hubbard "Hub-Tones" read €60.20 against a true €385.83. Replaced with a structural parse (`td.item_price` → `.converted_price`) against `?sort=price&sort_order=asc&limit=250`, verified against three live pages, and all 76 asks rewritten. Two notes: the new figure is Discogs' own EUR conversion, which includes shipping where Discogs knows it; and 5 items now carry no ask at all because those releases genuinely have zero live listings (they previously held stale values from the broken parser). **Job C:** *bug found and fixed:* the playlist reader was scraping the web player's virtualised DOM rows, so it saw 11 of 329 tracks on "heat it :: cool it" and 2 of 370 on "classical" — and it was also treating Spotify's "Recommended" rows as playlist contents (that is where the phantom 13-track read of the 3-track "kitchen dancing" came from). Rewritten against the player's own `fetchPlaylistContents` GraphQL call; all eight designated playlists now read in full — 1,694 tracks, 614 unique albums. After dedupe against catalog, wishlist, and the no-re-add list, **479 new albums remain outstanding**. That is a backlog created by the reader bug rather than a week of listening, so nothing was auto-added; it is Susan's call. Also: no "Your Top Songs"/Wrapped playlist exists in her library, so source (i) is currently empty. **Job C2:** Amazon cart read-only (8 active, 10 saved-for-later) — no vinyl present, nothing added. **Job E:** no cache-bust drift between pages (though the `v=` query strings now run ahead of the files' own `// version:` headers — app.js?v=37 vs header 36, style.css?v=32 vs header 28 — which is bookkeeping, not user-facing staleness, so it was left alone); all five audio canaries pass; a full 94-record audio sweep resolves **94/94** via Deezer, better than the 93/94 recorded here; `YOUTUBE_API_KEY` still unset but now needed by nothing; cover-art sample found no real link rot (three apparent failures were raw.githubusercontent.com rate-limiting, all loading on retry) — though 18 catalog covers are hotlinked to raw.githubusercontent.com, which does throttle, while 18 others use the relative `/covers/` path that does not. **Job D:** all eight pages 200; every write endpoint (`/api/records`, `/api/save-cover`, `/api/wishlist`, `DELETE /api/wishlist/:id`) correctly 401s unauthenticated — wishlist writes are gated now, per Phase 8, so the old "intentionally ungated" note is obsolete; delete round-trip clean; 94/94 records have covers, 93 have medians; wishlist 76 items, 74 medians, 71 asks, 76 covers.
- **v47 (2026-08-15)** — Three punch-list items closed. (1) `netlify-ignore.sh` parity for the Actions `deploy` job — a docs-only push previously still triggered a real (wasted) Actions deploy even though Netlify's own build correctly skipped itself for the same push; fixed by having the Actions job literally reuse the existing script (verified against two real commit ranges before shipping) rather than duplicating its path list. (2) JamBase wired into the manual Search panel / "Check live →" (`runLiveSearch()`) — previously only SeatGeek + the venue scrape queried there, a gap flagged in `jambase-shows.mjs`'s own TODO since 2026-08-13; the combined result now also runs through `dedupeSameShow()`. (3) Going-state UI simplified per direct request ("if i'm going to a show, remove hide this show and get tickets / be way smarter") — a confirmed-going venue's block now omits both "Hide this show" and "Get tickets," since both are dead weight or actively risky once a booking is confirmed; a not-going venue on the same watched artist is untouched. New "Riverside" e2e fixture confirms no cross-venue leakage. `concert-radar.html` reaches v21.3. `npm test` passes clean. Full detail in CLAUDE.md's 2026-08-15 entry.
- **v46 (2026-08-14)** — Corrected the deploy-noise fix from earlier today after it broke the whole GitHub Actions workflow (putting `secrets.NETLIFY_AUTH_TOKEN != ''` directly in a job-level `if:` isn't reliably supported — the fix now checks the secret inside a `test` step and passes the result to `deploy` as a job output instead, verified this time with a real GitHub Actions schema validator). Also fixed two real cross-source Concert Radar bugs Susan live-caught the same day: Herbie Hancock's Aug 17 show at Davies Symphony Hall was rendering as two separate Coming Soon cards (JamBase and SeatGeek named the venue slightly differently, so the existing exact-id dedup never caught it — new `dedupeSameShow()` collapses same-artist/same-date/substring-matching-venue duplicates, applied both client-side and in the weekly `scheduled-sweep.mjs` job); and the Watching panel was showing Thievery Corporation's summary at the wrong venue with a fabricated-looking multi-date range, because it had no per-venue grouping at all and flattened every real match for an artist into one composite — fixed by reusing the same artist+venue grouping Coming Soon cards already use. Both fixes have new, real regression coverage in `scripts/e2e-concert-radar.mjs` exercising the actual shipped code against fixtures mirroring the exact real bugs reported; `npm test` passes clean. `concert-radar.html` reaches v21.2. Full detail in CLAUDE.md's 2026-08-14 "later" entry.
- **v45 (2026-08-13)** — "GitHub Actions Phase 1," the actual resolution of the architecture-review recommendation to give Claude direct GitHub push access: instead of a PAT/SSH deploy key (considered, not adopted this round), work moves onto `main` via a branch delivered as a git bundle to Susan's own Terminal, which she reviews and pushes herself — same standing rule as every other change, just with GitHub Actions now doing more of the CI/deploy work that used to live only on Netlify. Two concrete pieces shipped: (1) `scripts/backup-watching.mjs` + `.github/workflows/backup-watching.yml` (new), a GitHub Actions-native daily snapshot of `/api/watching`, mirroring the `backup-catalog.mjs` pattern from 2026-08-09 — zero new secrets, additive alongside the existing Netlify-scheduled `backup-watching.mjs`/`run-watching-backup.mjs` until a real Actions run is confirmed to match. (2) `.github/workflows/test.yml` gained a `deploy` job that runs `netlify-cli deploy --prod` after tests pass on a push to `main`, needing a `NETLIFY_AUTH_TOKEN` repo secret. `netlify/functions/scheduled-sweep.mjs` was investigated and deliberately NOT migrated — it writes to Netlify Blobs directly (`getStore('catalog-cache')`), and Actions has no public write path for that without either a Blobs token in GH Actions secrets (works against the "less Netlify" goal) or a new gated write endpoint (not built yet). Full rationale, the auto-deploy-coexistence caveat (Netlify's own git-integration auto-deploy is NOT disabled by this — both fire on a push to `main` until Susan turns off "auto publishing" in Netlify's site settings), and the `netlify-ignore.sh` gap (its docs-only-change skip doesn't apply to the new Actions deploy path yet) are all in CLAUDE.md's 2026-08-13 "later still" entry. **Known issue, found the same day, not yet root-caused:** the new `deploy` job's first real run (triggered by this same push) failed — `test` passed, `deploy` failed in ~30s with 2 annotations. Leading hypothesis, not yet confirmed with the actual log text: the `NETLIFY_AUTH_TOKEN` secret was never actually added to the repo, since Susan chose the bundle-delivery path tonight rather than completing that setup step. First item on tomorrow's punch list.
- **v44 (2026-08-13)** — Tried to close v43's one remaining JamBase gap: pulled the exact required attribution wording from `https://data.jambase.com/api/docs/attribution`. Couldn't — that page is client-side rendered and every fetch variant tried (the page itself, a `.md` suffix, `llms.txt`, `llms-full.txt`) returned only metadata, never the body text; consistently confirmed the free tier is "Attribution required" (vs. Pro's "appreciated"), just not the literal copy. Shipped a reasonable interim measure rather than leaving it fully unaddressed a second time: `concert-radar.html` (v21.1) now renders JamBase-sourced cards' existing `via {source}` tag as a real hyperlink to jambase.com (`sourceCreditHtml()`), rather than plain text — every other source's tag is untouched. Explicitly flagged, in the code and here, as NOT confirmed to satisfy JamBase's actual requirement — Susan needs to open that page herself (renders fine in a real browser) and correct this if the real wording differs. New e2e assertion confirms the link renders correctly; `npm test` passes clean. Full detail in CLAUDE.md's 2026-08-13 "later" entry.
- **v43 (2026-08-13)** — Phase 11 gains a third Concert Radar feed: JamBase Data (`netlify/functions/jambase-shows.mjs`, new), a genuinely free/permanent ticketing API discovered after re-ruling-out every other option (Ticketmaster still stalled on Susan's account, Bandsintown/Songkick/Eventbrite/Dice/PredictHQ all re-confirmed non-viable). Two real JamBase-side bugs found via live curl testing from Susan's own Terminal (a wrong base URL in their prose docs; a broken `geoRadiusAmount` parameter, worked around by omitting it) — full detail in the new "JamBase Data feed" subsection under Phase 11 below and CLAUDE.md's 2026-08-11–13 entry. Wired into both `concert-radar.html` (v21) and `scheduled-sweep.mjs` (v2), which also closed two latent gaps this wiring surfaced (scheduled-sweep.mjs's artist list was missing `/api/watching`; `venue-shows.mjs`'s output was merging into the weekly cache unfiltered). `scripts/test-jambase-shows.mjs` (new, 46 assertions) and `scripts/e2e-concert-radar.mjs` extended; `npm test` passes clean. Still open: JamBase's attribution requirement isn't satisfied yet (wording not pulled), `runLiveSearch()` doesn't query this feed yet, and `JAMBASE_API_KEY` isn't yet set in Netlify. **Note on changelog continuity:** this repo's day-to-day work between v40 (2026-08-07) and this entry was tracked in CLAUDE.md's own dated sections (2026-08-08 content-drift check, 2026-08-08 doc alignment pass, 2026-08-08 city-geocoding fix, 2026-08-09 watching.mjs v2 deletion-tracking, 2026-08-09 backup-catalog GitHub Actions migration) but this changelog's own version counter wasn't bumped for any of them — flagging that gap here rather than silently skipping from v40 to v41 as if nothing happened in between; a future pass should backfill v numbers for that work if a clean sequential record matters going forward.
- **v42 (2026-08-12)** — Performance fix on `/api/artists-playing`: Netlify's request log showed occasional 499s (client aborts) from Travel Intelligence's `checkConcertMatches()`, which gives up after 6s (`AbortSignal.timeout(6000)`, that repo's `index.html`) — e.g. 09:35:29 the same day, two requests at 6200ms and 4177ms, both aborted. Root cause: three sequential Blobs-store reads (records/wishlist/watching, ~170 keys total across the 94-record catalog + 127-item wishlist), each looping through individual `store.get()` calls one at a time, followed by a sequential SeatGeek fetch with no timeout at all, then a sequential `venue-shows` fetch — pure wasted latency, since nothing here actually depends on anything else finishing first. `artists-playing.mjs` reaches **v2**: all three store reads now run via `Promise.all`, each store's own per-key `get()` calls parallelized the same way; the SeatGeek and venue-shows fetches also now run concurrently via `Promise.all`; SeatGeek additionally gets its own 4.5s `AbortController` timeout (shorter than the client's 6s ceiling) so a slow SeatGeek response degrades to `seatgeekError` — same shape as the existing missing-`SEATGEEK_CLIENT_ID` degrade path — instead of silently eating the whole client-side budget. Every existing behavior (skip `_meta_` sentinels in `watching`, swallow per-key parse errors, log-and-degrade-to-`[]` on a whole-store failure, the dedupe/sort logic downstream) is unchanged — concurrency only, no logic change. Verified: `node scripts/test-artists-playing.mjs` (20/20) and full `npm test` pass clean pre-push; live smoke test against the deployed endpoint post-push (three real lat/lon/date-window requests, none previously-cached) returned 200s in 875ms–2.4s with no `seatgeek_error`/`venue_error`, down from the 4.2–6.2s range that had been triggering the 499s.
- **v41 (2026-08-10)** — Weekly automated maintenance run (Jobs A/B/C/C2/E/D). Job A: refreshed Discogs market data for 93/94 records (1 has no sales history, left unchanged); collection value ≈€2,233.80. Job B: refreshed median + cheapest current listing for all 76 pre-existing wishlist items (fixed a scraper bug this run where shipping-cost lines were being misread as item prices — corrected before any wishlist writes went out). Job C: synced 9 Spotify sources (Top Songs 2025, 7 named playlists, Rudy Van Gelder jazz playlist) — added 51 new vinyl-confirmed albums to the wishlist after dedup/no-re-add-rule/format checks; sync-state.json grew from 230→280 tracked keys. Job C2: reviewed Amazon cart (active + saved-for-later, 10 items) — no vinyl/music items found, nothing added. Job E: cache-bust versions consistent across all 7 static pages (no stale-cache drift); all 5 audio-preview canaries pass; YouTube fallback key still not configured, but 6 of the 7 previously-gapped catalog records (Maria Callas, Duke Ellington, Rob Garza, The Blues Volume 2, Swingle Singers, The Cure) now resolve via Deezer — only "Verve // Remixed" remains pending; cover-art spot check (12 records + 12 wishlist items) found zero broken images; full smoke-test parity 8/8 pass. Job D: found /api/wishlist POST now requires X-Edit-Key (previously documented as intentionally ungated) — flagged for Susan to confirm whether this was an intentional tightening; delete round-trip verified clean; fixed a stale "93 records / 100% Deezer" claim in CLAUDE.md.
- **v40 (2026-08-07)** — Roadmap Phase 6, "Editorial polish pass," built at Susan's go-ahead (scoped earlier via AskUserQuestion: subtle nav tightening, tighter/darker Audit rows, taller wishlist prices, one small recurring mark). Four changes, all page-scoped except the nav gap: (1) `.masthead__nav` gap 22px&rarr;18px (desktop only; the &le;720px scrollable-row gap was already tightened in v28 for a different reason and is untouched). (2) `.audit-row` padding 18px&rarr;13px (12px on mobile, was 16px) and its bottom rule switched from `--rule-soft` to the darker `--rule`, so the Audit page reads as a working table. (3) `.wl-nums` (the wishlist price) went 11px/`--ink-soft`&rarr;16px/bold/`--ink` &mdash; it now stands taller than the artist/title text next to it instead of being the quietest thing in the row. (4) A new `.audit-row__index` catalog stamp ("&#8470;001", "&#8470;002", ...) on every Audit row &mdash; the row's position in the current sorted/filtered view, computed client-side in `render()`, not a stored field; absolutely positioned over the cover's corner, `pointer-events:none` so it never blocks the upload click target. This is the one recurring mark the phase settles on, and Audit is the only page that uses it, per the roadmap's own "no other page borrows it" framing. `style.css` bumped to v32 (cache-bust bumped across all 8 pages); `audit.html`/`seed.html`'s own version comments bumped to match. `roadmap.html`'s Phase 6 card flipped Future &rarr; Live. Verified via a minimal local render harness reproducing the exact new CSS rules (screenshot-checked, catalog stamp and price sizing both read as intended) plus HTML-balance and `node --check` syntax verification against the real delivered files &mdash; **not verified against the live site with real records** (no browser/API access this session); worth a visual once-over after this deploys, same as the Concert Radar mobile-gap fix needed in 2026-08-06.
- **v39 (2026-08-06)** — Roadmap Phase 8, "Close the wishlist gap," built at Susan's go-ahead. The catalog's own `POST`/`DELETE /api/records` has required an edit key since Phase 1; the Wishlist's equivalent endpoints were deliberately opened up 2026-07-11 (v-unnumbered doc note above) because re-entering the passphrase on mobile every session wasn't practical for a casual hunting list. As links get shared more widely that gap was worth closing, so `wishlist.mjs` reaches **v4**: `POST`/`DELETE` now run through the same `checkWriteAuth()` gate `records.mjs` uses, checked against the same `EDIT_SECRET` env var (no separate wishlist-only secret). The frontend difference from the catalog's own key prompt is deliberate: `audit.html`/`seed.html` cache the key in `sessionStorage` (one entry per tab session); `wishlist.html`'s new `getEditSecret()`/`clearEditSecret()` pair (same prompt-once-then-cache shape) uses `localStorage` instead, so it costs one entry per device, not one per visit — closing the 2026-07-11 gap without reintroducing the mobile friction that opened it. A real ordering bug was caught before shipping, not after: the handler's first draft called `getStore('wishlist')` before checking auth, so an unauthorized request in an environment where the Blobs store can't initialize would 500 instead of 401 — reordered to match `records.mjs`'s own auth-before-store pattern, and a regression test (`scripts/test-wishlist.mjs`, new, 6 assertions, wired into `npm test`) exercises exactly the unauthorized-write paths this ordering affects, mirroring `test-artists-playing.mjs`'s "exercise the real exported handler, no Blobs mocking" convention. `roadmap.html`'s Phase 8 card flipped Future → Live; `about.html` updated in three places (Wishlist page-card description, the `/api/wishlist` endpoint bullet, and the Wishlist section's own prose) to describe the new gated-but-remembered behavior instead of the retired "no edit key" one. Verified: `npm run check` (syntax) and `node scripts/test-wishlist.mjs` (6/6 passing) both run clean against the exact bytes delivered — confirmed via md5 match between the local working copy and what shipped, not assumed from a successful write. Not independently pixel/browser-verified this round (no live Netlify Blobs environment available from this session to exercise the authorized-write or GET paths) — worth Susan doing one real add/delete round-trip on `/wishlist.html` after this deploys, entering the key once and confirming it's remembered on reload.
- **v38 (2026-08-04)** — Susan, back briefly: "it seems to be putting the entire sweetwater calendar in coming soon / use the logic in place to filter for relevancy." Real bug, and it wasn't new — `venue-shows.mjs` has always returned every show at its 7 scraped venues with no artist filtering server-side (deliberate, documented in that file's own header), but nothing on the client ever filtered it back down before merging into Coming Soon, so every venue's full calendar had been reaching Coming Soon unfiltered since the venue scraper shipped. Susan noticed it via Sweetwater specifically, but it affected all 7 venues equally. Fixed by reusing "the logic in place" she pointed at — `runLiveSearch()` (the ad-hoc Search panel) already filtered venue-shows results down to whatever matched one typed-in artist name; that same filter (now a shared `artistIsRelevant()`, built on v18.4's `normalizeArtistKey()`) now runs in `sweepCatalog()` too, scoped to the full list of artists Susan actually cares about. `fetchDistinctArtists()` was extended to also pull `/api/watching`, not just catalog/wishlist, so a watched-only artist like Black Uhuru counts as relevant (and, as a side benefit, now gets its own direct SeatGeek sweep for the first time). `runLiveSearch()`'s own venue filter was also upgraded from a raw lowercase compare to the same normalized match, closing the same punctuation-drift gap v18.4 fixed for Watching. Verified by extending `scripts/e2e-concert-radar.mjs` with fixture shows for two irrelevant Sweetwater listings (confirmed filtered out of Coming Soon) and one relevant-but-unwatched match (confirmed still shows), alongside re-confirming Watching-panel matches still work — full trail in CLAUDE.md's 2026-08-04 "v18.5" entry. `concert-radar.html` bumped to v18.5. Not verified against the live site (no browser/API access this session, same standing caveat as v18.4).
- **v37 (2026-08-04)** — Susan reported v36's cache fix still didn't surface Black Uhuru/Easy Star All-Stars, then headed out for the day, so the rest of this entry ran unattended per her standing instructions. (1) Re-examined the match logic instead of assuming another cache issue (three stale-cache "fixes" in one day was itself a signal something else was wrong): `findWatchMatches`/`isWatching`/`isShowWatched` compared raw-lowercased artist strings with no tolerance for punctuation/spacing drift, so "Easy Star All-Stars" (this file's own spelling) could silently fail to match a watching-list entry saved as "Easy Star Allstars" or "Easy Star All Stars." Added `normalizeArtistKey()` (folds hyphens/commas to spaces, strips apostrophes/periods, "&" → "and", collapses whitespace) and every artist comparison now runs through it. `concert-radar.html` bumped to v18.4. Honest caveat, since this session had no way to check Susan's actual stored watching-list data: this closes the punctuation/spacing class of mismatch, not a genuinely different name. (2) Built a real end-to-end regression harness (`scripts/e2e-concert-radar.mjs`, jsdom-based, `npm run test:concert-radar-e2e`) that loads the actual shipped `concert-radar.html` into a real DOM, mocks every API call, and inspects the real rendered Watching panel — the first genuine E2E check for this feature (everything before it was either a live browser check this session didn't have, or a reimplementation-based Node reproduction). Confirmed Black Uhuru and both Easy Star All-Stars spellings now render with venue detail under both exact and drifted spellings, and Burning Spear still honestly shows "Check live" (no fabrication). (3) Added a "Feeds roadmap" subsection consolidating Ticketmaster/Bandsintown/Songkick/Eventbrite/Dice/PredictHQ/Spotify research to date, per Susan's direct request. (4) Wrote a full technical plan for Phase 10 (Travel Intelligence hooks) per Susan's request to plan "our big feature tomorrow" — see the new subsection under Phase 5+ below; a standalone copy for the Travel Intelligence side of the repo was sent to Susan directly since this session's sandbox has no write access to that project. (5) Corrected the "Concert Radar feed health check" scheduled task's prompt, which incorrectly claimed vinylscout.org's robots.txt allows a "Claude-User" exception — confirmed this session (again) that the block is total, site-wide, no exceptions; the task now goes straight to Claude-in-Chrome instead of trying WebFetch first. **What could not be verified this session, flagged honestly:** no live browser or API access was available (Claude-in-Chrome not connected, WebFetch blocked, no outbound curl), so none of today's fixes — v18.3's cache fix or v18.4's matching fix — were confirmed against the actual live site or Susan's actual stored data. The next live session (or the weekly health-check task) should check the deployed site directly once Susan pushes this commit.
- **v36 (2026-08-04)** — Susan reported "neither show up" — same stale-cache bug as v33, recurring a third time: her browser's one v33-forced fresh sweep predated v35's two rounds of new MANUAL_SHOWS data, and with a 12h staleness window and no manual Refresh, nothing forced a re-check. Bumped `LS_CACHE` again (v3 -> v4) to clear it immediately, and this time fixed the actual recurring cause instead of just patching the symptom again: `CACHE_MAX_AGE_MS` cut from 12h to 1h, so future same-day server-data changes reach an already-cached browser on their own. `concert-radar.html` bumped to v18.3. Full narrative in CLAUDE.md's 2026-08-04 "v18.3" entry.
- **v35 (2026-08-04)** — Susan flagged directly: "easy star all stars is at the cornerstone." v34's research had actually already found this exact date/venue (Oct 22, 2026, Cornerstone Berkeley) on Songkick's artist calendar, but left it out since Cornerstone's own site didn't confirm it. Re-checked three more ways at Susan's prompt (Cornerstone's own site again, its SeatGeek page, its Songkick venue page) — still not corroborated anywhere except Songkick's own specific dated event page for this show, which does exist and shows tickets on sale. Asked Susan for her source; she confirmed the same date. Added as a second, distinct `MANUAL_SHOWS` entry for Easy Star All-Stars (a real second Bay Area date five days apart from the Guild Theatre one, not a duplicate), tagged transparently in the data itself as Songkick-sourced rather than venue-confirmed since no direct vendor ticket link could be found. Also now the second known real show a venue-shows.mjs parser (this time Cornerstone's) should have caught and didn't — flagged for follow-up alongside the Sweetwater gap from v34. `netlify/functions/venue-shows.mjs` bumped to v4. Full narrative in CLAUDE.md's 2026-08-04 "venue-shows.mjs v4" entry.
- **v34 (2026-08-04)** — Two more things right after v33 deployed, full narrative in CLAUDE.md's 2026-08-04 "v18.2" entry. (1) Susan reported "you also killed all the detail in coming soon" — a screenshot showed the whole Coming Soon panel at "(0)", including artists with real matches minutes earlier. Root cause: v33's forced cache-refresh combined with v32's removal of the "Checking N of M artists…" status text meant a page load with no cache had zero visible signal while a sweep was in flight — an empty panel looked identical whether it was still loading or genuinely empty, and Susan happened to screenshot mid-sweep (a follow-up screenshot showed it recovered on its own). Fixed by having `sweepCatalog()` return its own promise chain and adding an `initialLoadInFlight` flag that only clears once a load has actually settled, so the empty-state message can honestly say "Loading…" instead of "nothing found" until that's actually known — verified with a Node reproduction mocking a slow network. (2) Direct instruction: "go out and scrape the details for black u, easy star and burning spear. add them to coming soon." Researched each artist's real Bay Area tour status against outside sources (Songkick, Bandsintown, general search, then each venue's own official site for verification) since vinylscout.org's own API can't be queried by this session (robots.txt). Found real, venue-confirmed shows for 2 of 3: Black Uhuru at Sweetwater Music Hall, Mill Valley, Sep 13, 2026 (confirmed on sweetwatermusichall.org — notably a venue venue-shows.mjs already scrapes, so its parser missing this real show is a separate bug flagged for follow-up); Easy Star All-Stars at The Guild Theatre, Menlo Park, Oct 24, 2026 (confirmed on guildtheatre.com). Burning Spear: no real Bay Area date exists anywhere right now, verified across multiple sources — reported honestly rather than fabricated. Both real shows added as tagged `MANUAL_SHOWS` entries in `netlify/functions/venue-shows.mjs` (v3), verified via Node reproduction of the merge logic. `concert-radar.html` bumped to v18.2.
- **v33 (2026-08-04)** — Live-caught via screenshot hours after v32 shipped: Black Uhuru, Easy Star All-Stars, and Burning Spear were all still stuck on "Check live" in the Watching panel despite v32's own confirmed Black Uhuru match. Full narrative in CLAUDE.md's 2026-08-04 "v18.1" entry. Two problems, both introduced by v32 itself: (1) v32 removed the manual Refresh button in the same pass that shipped the Black Uhuru match, so a browser with a cache from before that match was found had no way left to force a re-sweep short of waiting out the 12h staleness window — fixed by bumping `LS_CACHE` again (v2 -> v3), forcing one fresh sweep everywhere on next load, same fix shape as the earlier v16.1 poisoned-cache incident. (2) Removing the "+ Add a show Radar can't find" form the same day also removed the only fallback for an artist the automated pipeline genuinely can't find yet (true for Easy Star All-Stars and Burning Spear as of this build) — fixed with a narrower, scoped "+ Add show details" action on any unmatched Watching row, saving into the same `addedShows` mechanism the removed form used, so a hand-entered show renders with the identical layout an automated match gets, no new display path. Verified with a standalone Node reproduction of `renderWatchList()` covering the no-match state, a simulated manual save, and confirming an untouched artist (Burning Spear) still honestly shows "Check live" rather than fabricating anything. `concert-radar.html` bumped to v18.1.
- **v32 (2026-08-04)** — Two requests right after v31 shipped, full narrative in CLAUDE.md's 2026-08-04 "v18" entry. (1) Watching panel's matched-show rows added a venue = "Venue — City, State" line (same format `renderCard()` uses on Coming Soon), for every listing including the three previously-gap artists (Black Uhuru, Easy Star All-Stars, Burning Spear) — verified via a standalone Node reproduction that a real match (Black Uhuru) renders venue/city correctly and a no-match artist (Burning Spear) still honestly shows "Check live" rather than a fabricated venue. (2) Decluttered the Coming Soon header per Susan: removed the manual "Refresh" link, the "Checked N artists · ago" status line, and the "+ Add a show Radar can't find" form (HTML/CSS/JS all removed, not just hidden). Since that removed the only way to force fresh data without a visit, shipped the real replacement: `netlify/functions/scheduled-sweep.mjs`, a genuine Netlify Scheduled Function (`schedule: '@weekly'`, runs on Netlify's own infrastructure) that re-sweeps every catalog/wishlist artist plus the venue scrape and caches the result server-side; new `netlify/functions/catalog-cache.mjs` (`GET /api/catalog-cache`) serves it as an instant first-paint fallback for a browser with no local cache yet. This directly closes a gap the v31 entry's own "Concert Radar feed health check" scheduled task explicitly flagged as *not* achievable ("cannot refresh Susan's own browser's localStorage cache remotely") — that task has been updated with a new step verifying the new job is actually firing weekly, rather than creating a second, redundant scheduled task. `concert-radar.html` bumped to v18.
- **v31 (2026-08-04)** — Susan asked to expand free concert coverage automatically rather than rely on the v30 manual-add fallback. Researched and ruled out every other free ticketing API (Eventbrite's public search API confirmed still dead since 2020; Dice.fm has no discovery API; PredictHQ has no free tier; Bandsintown refuses hobby access; Songkick's application page is currently closed to new applicants entirely) — Ticketmaster signup is in progress separately, blocked on an account issue now with their support directly (no account creation/login attempted on Susan's behalf, per this project's hard rule). Shipped `netlify/functions/venue-shows.mjs` (v1): a server-side scrape of 7 Bay Area venues' own event pages, no API key needed, one fetch covering 6 Another Planet Entertainment venues at once. Every venue individually verified live before being added; 2 of Susan's requested venues (Ashkenaz, The New Parish) were tested and excluded since both render client-side with no data in the raw HTML a server-side fetch sees. `concert-radar.html` (v15) now merges this with the existing SeatGeek sweep. Concretely validated: this build's own reconnaissance surfaced a real, previously-unknown second Black Uhuru date (Sep 13, 2026, Sweetwater Music Hall) neither SeatGeek nor the manual-add fallback had found. Also created a new weekly scheduled task ("Vinyl Scout — Concert Radar feed health check") since the `weekly-vinyl-median-refresh` task referenced elsewhere in this charter still could not be located among Susan's live scheduled tasks (same gap first flagged in the v29-adjacent Job C bug-fix note) — full trail in CLAUDE.md's 2026-08-04 entry and the Phase 11 section's "Venue scraper" subsection.
- **v30 (2026-08-04)** — Susan named 3 real shows Coming Soon was missing (Easy Star All-Stars at Cornerstone Berkeley, Black Uhuru, Burning Spear). Investigated each against live data rather than guessing: 2 of the 3 turned out to have no confirmed real Bay Area 2026 date on independent check and were flagged back to Susan rather than added; the third (Black Uhuru, Feb 21 2026, The Freight & Salvage, Berkeley) is real and verified, but exposed a genuine SeatGeek coverage gap (not a matching bug) — the venue's inventory isn't on SeatGeek at all, and the artist wasn't in the catalog/wishlist either, so it was never even swept. Shipped a scoped fix: a "+ Add a show Radar can't find" manual-pin form on Concert Radar (`concert-radar.html` v14), tagged "Manual entry" so it's never confused with real SeatGeek data — full trail in CLAUDE.md's 2026-08-04 entry and the Phase 11 section below. Same pass: mobile masthead nav (7 links wrapping to a cramped second row) switched to a single horizontally-scrollable row (`style.css` v28), and a defensive `overflow-wrap` fix for a reported off-center/cut-off mobile footer on Concert Radar (not independently reproduced — flagged for Susan to confirm).
- **v29 (2026-08-03)** — Doc-only correction: roadmap.html's Phase 7 (iOS app) said "Not started; parked until scoped," which Susan flagged as wrong — she already has home-screen icons on iOS launching Vinyl Scout and each of her four other Claude-built projects directly (iOS's own "Add to Home Screen," not a native app or a wrapper around all five). Phase 7 status flipped to Live, description corrected to describe exactly what's live (the home-screen launch icon) versus what's still ahead and unbuilt (a native, camera-first record-adding flow replacing the current Safari-based photo-upload workflow) — not overclaiming the whole phase is done.
- **v28 (2026-08-03)** — Phase 11 (Concert Radar) went from a static sample-data mock to a real, live, SeatGeek-backed feature, all in one day of direct back-and-forth against the deployed site. New endpoint `netlify/functions/tour-dates.mjs` (`GET /api/tour-dates?artist=…&range=…`, ungated pure read) resolves an artist name to a real SeatGeek performer (exact-normalized match first, then a guarded fuzzy fallback requiring every query token present and no tribute/cover keyword), queries events scoped to that performer's slug, and filters every event's own title against a tribute/cover-act blocklist regardless of match tier. That last check exists because of a real bug Susan caught live, not a hypothetical: `?artist=Sade` initially returned "Ultimate Sade Tribute Concert" — a tribute act registered on SeatGeek under the bare artist name with no qualifier anywhere except the event's own title, which v3 of the function fetched but never checked. Susan asked directly, "is that Sade listing REAL? is she actually on tour or are u hallucinating?" — verified live via the raw API response rather than reassuring without checking, confirmed it was a real bug (not a hallucination, but wrong), and fixed it generally (event-title filtering, widened blocklist) rather than special-casing Sade. `concert-radar.html` (now v12) rebuilt around this endpoint: Coming Soon sweeps every distinct artist across the catalog and wishlist through the endpoint (concurrency-capped at 5, cached in `localStorage` with a 12h staleness window); same-artist/same-venue multi-date shows group into one card with a date range instead of one row per date (fixing a 7-night Buena Vista Social Club residency that was rendering as 7 near-identical cards); Watching and Coming Soon became mutually exclusive by Susan's explicit "either/or" rule — watching an artist pulls its show(s) out of Coming Soon immediately, since the Watching panel now shows that artist's real date/price/ticket-link inline instead of a static badge; the "Restore hidden shows" undo link was removed (hiding a real show is final now); a site footer was added (the page never had one); and a Watching-row layout bug was fixed where a long date range pushed the row's × delete button onto its own orphaned line. Separately investigated, not fixed: every currently-matched real show returns null price data straight from SeatGeek's own API (live-verified across 10 different shows) — the code already renders price whenever SeatGeek provides it, so this is a data-availability gap upstream, not a bug; left as-is per Susan's "put aside for now." See the new Phase 11 section below for the full narrative, and CLAUDE.md's 2026-08-03 note for the current-state summary.
- **v27 (2026-08-03)** — Weekly maintenance run: refreshed Discogs market data for all 94 catalog records (collection value ≈€2,232); scouted median/cheapest-listing prices for all 76 wishlist items; synced new vinyl-available albums into the wishlist from Spotify listening (Spring!, work in progress, classical, kitchen dancing playlists — 11 net-new adds after the no-re-add filter, sync-state.json updated) — no vinyl found in the Amazon cart this week; Job E health checks all green (cache-bust versions consistent site-wide aside from a minor app.js query-string/header-comment mismatch — see below; all 5 audio-preview canaries pass; YouTube fallback key still not configured, but 0 records are currently blocked on it — the 7 records once listed as YouTube-pending were already resolved by the Deezer override-table fix shipped in v25, confirmed live this run); cover-art spot check (12 records + 12 wishlist items) all resolve; full smoke-test parity 8/8 green. Minor drift noted, not yet fixed: index.html requests `app.js?v=37` but app.js's own header comment still says `version: 36` with no v37 changelog entry — functionally harmless (no stale-cache risk since 37 > 36) but the bookkeeping should be reconciled.
- **v25 (2026-07-20)** — Two rounds in one day: a security audit that found and fixed a real, live gap, and a regression from that very fix — caught live via a screenshot Susan sent after deploying — fixed the same day. **Round 1 (audit fixes):** (1) **[Security, critical]** `discogs-pricing.mjs` (`POST /api/discogs-pricing`) had **zero server-side auth check** — despite this charter's own endpoint table and CLAUDE.md's repo-layout comment already (incorrectly) documenting it as edit-secret-gated, the code never actually verified `X-Edit-Key` against `EDIT_SECRET`. Confirmed by reading the file end to end before touching it: no auth reference existed anywhere. This mattered in practice, not just on paper — it's reachable from the public, unauthenticated "Refresh pricing" button in every record's detail modal, and a successful call writes real fields (`price_low`/`price_median`/`price_high`/`have_count`/`want_count`/rating) onto the record and burns a real Discogs API call, so any site visitor could trigger writes and quota burn at will. Fixed (function reaches **v20**) by copying `records.mjs`'s `checkWriteAuth()` verbatim rather than inventing a new gate: same `X-Edit-Key` header, same fail-closed comparison (rejects if `EDIT_SECRET` is unset), same 401 JSON shape. Every POST here is inherently a write (no public-read path exists in this file, unlike `records.mjs`), so the check runs unconditionally, before the `DISCOGS_TOKEN` read. Confirmed `/api/discogs/lookup` (genuinely public read) and `/api/wishlist` (deliberately ungated per Susan's 2026-07-11 request) are untouched. (2) `audio-preview.mjs` reaches **v18**: fixed a debug/production drift bug where `?debug=1` mode called the Deezer free-text and artist-catalog-walk passes unconditionally — even for generic-artist ("Various Artists"/"Various"/"VA") records — while `tryDeezer()`, what production actually calls, has always skipped both passes for generic artists via `isGenericArtist()` (neither pass has a real artist identity to corroborate a title match against for those records). Net effect: a `debug=1` request against a generic-artist record could report a different, less-safe candidate than production actually serves — exactly backwards for a diagnostic mode whose whole purpose is showing what production did. Fixed by threading an optional `debugInfo` param through `tryDeezer()` itself instead of keeping a second, separately-maintained copy of the generic-artist guard in the request handler, so debug and production now make the literal same call. (3) Mobile touch-target/zoom-on-focus fixes on the two pages Susan edits from most on her phone: `audit.html`'s inline-edit fields (**v17**, paired with `style.css?v=27`) — base `.audit-input` font-size 14px→16px (with per-field overrides as low as 12px removed, since they'd otherwise still override the new 16px base back below the iOS-zoom threshold) and min-height 36px→44px; `.audit-select.js-condition` (the Goldmine condition dropdown) got the identical fix even though the originating report named only "`.audit-input` and related classes" — same inline-edit surface, same tap-and-type interaction, leaving it out would have been an inconsistent half-fix. `seed.html`'s textarea (**v5**, no version bump — its own internal numbering already didn't match its latest dated entry before this edit, a pre-existing drift left alone rather than guessed at) — base font-size 14px→16px; the existing ≤640px mobile query already correctly set 16px but only covers viewports up to 640px, so an iPhone in landscape (852px on an iPhone 15) fell through to the un-fixed 14px base rule. (4) `style.css` reaches **v27**: `.chip` (genre filter pills) and `.vbtn` (List/Gallery toggle) raised from 34px (38px even inside the ≤720px mobile query) to the 44px minimum this charter's own Working Agreement specifies, scoped to the mobile breakpoint only — desktop deliberately stays 34px, since the 44px rule is framed as a mobile-Safari concern and bumping the pointer-driven desktop rule too would add visual bulk for no accessibility benefit there. `wishlist.html`'s `.wl-play` inline preview button (**v16**) got the same fix, 36px→44px. (5) Two stale-comment bugs fixed in the same pass: `audit.html`'s and `seed.html`'s internal `// version: N (paired with style.css?v=…)` comments had drifted from their own `<link>` tags — audit.html's said `?v=25` against an actual `?v=26`, seed.html's said `?v=23` against the same actual `?v=26` (three versions stale) — both now track the link tag exactly, `?v=27`. `app.js`'s `buildAudioBlock()` inline comment still described the retired three-provider (Spotify→Deezer→iTunes) architecture, more than a week after `audio-preview.mjs` v12 (2026-07-13) removed Spotify and iTunes entirely — corrected to describe the actual current architecture (Deezer multi-pass, YouTube last resort); no functional change, no version bump. (6) Added `scripts/test-audio-preview.mjs` — the first *committed, permanent* regression fixture for `audio-preview.mjs`'s matching/scoring logic. Nearly every prior fix in this file's history (v3–v7, v11, v15, and others) mentions being "verified with a local Node regression suite" before deploy, but none of those suites were ever committed — only `scripts/smoke.mjs` existed, and that's a live black-box check against the deployed site, not unit coverage of the matching functions. The new fixture imports the real exported functions (`containsWholeWords`, `artistsOverlap`, `isGenericArtist`, `tryDeezerByAlbumTitleSearch`, `tryDeezer` — newly exported as named exports in `audio-preview.mjs` **v19**, additive and inert to the deployed default-export handler) with a mocked `global.fetch`, no live network calls, no API key needed: 17 assertions covering the Bechet/Aimée wrong-artist bug (v11), the Led Zeppelin whole-word-containment bug (v6), the Scott Joplin composer-fallback regression (v15), and the generic-artist skip-guard fix (2) above exercises directly. `npm run test:audio-preview` added to `package.json`. Verified: `node scripts/test-audio-preview.mjs` → **17 passed, 0 failed**. (7) Added a consolidated "Weekly automation (Jobs A–E)" reference section to CLAUDE.md, synthesized entirely from this changelog's v6/v7/v9/v20/v21 entries and CLAUDE.md's own existing prose (no invented details) — before this, the external `weekly-vinyl-median-refresh` scheduled task's full spec was only reconstructable by cross-referencing all of those against each other. Explicit about which job letters (C2, D, E) are actually named in the source material versus which (A, B, C) are the section's own inferred sequential labels. **Round 2 (a real regression, found live via a screenshot, fixed same day):** Round 1 item (1)'s fix was correct on the server — but broke the "Refresh pricing" button for Susan herself. `app.js`'s client-side `refreshPricing()` was never updated to actually send a passphrase with its `POST /api/discogs-pricing` call, so once the endpoint was correctly gated, the button 401'd for everyone, including its own intended user — a fail-closed gate rejecting a request that never carried a credential at all, working exactly as designed on the server side, while leaving Susan stuck with no way to use a button she was supposed to have. Caught live: Susan deployed round 1, tried the button, hit the 401, and sent a screenshot. Root-caused rather than just patched around: the server-side gate itself was re-verified correct (re-read `checkWriteAuth()` side by side with `records.mjs`'s), which narrowed the bug to the one caller inside this repo that actually depends on it. Fixed by mirroring `audit.html`'s existing `getEditSecret()`/`clearEditSecret()` pattern verbatim rather than inventing a new one — same `sessionStorage` key (`vs_edit_secret`), same prompt-once-then-cache behavior, so a passphrase entered on either page carries over within the same browser tab — wired into `refreshPricing()`'s fetch call as an `X-Edit-Key` header. A 401 response now calls `clearEditSecret()` (in case the cached passphrase itself was the wrong one) and flips the button to "Retry" instead of leaving it stuck disabled with no path forward. `app.js` bumped to **v36**. Verified by re-reading `refreshPricing()` end-to-end post-fix and confirming the request now actually carries the header before it reaches the server. **The lesson this exposes:** a server-side auth fix and its in-repo caller are two separate pieces of surface area even when they land in the same session — round 1's own QA (syntax check, code-level checklist) confirmed the gate itself worked, but nothing in that pass exercised the one place in this repo that calls it, which is exactly the kind of gap "diagnose, then fix" and a live post-deploy check exist to catch. Documented here in full, not glossed over, per this charter's own "Honesty over confidence" rule and the precedent set by v15's and v21's same-session regression writeups. **Also fixed as part of this pass, doc-accuracy only, no behavior change:** CLAUDE.md's repo-layout table didn't say `discogs-pricing.mjs` was gated at all (unlike every other row, which explicitly states `gated`/`ungated`) — now says so explicitly, and the `EDIT_SECRET` environment-variable table row now lists `discogs-pricing.mjs` among the files it gates, matching what the code has actually done since Round 1 item (1). This charter's own endpoint table (below) already correctly stated `/api/discogs-pricing` as edit-secret-required before today — that claim was simply false until Round 1 item (1) made it true; confirmed accurate now, no change needed there.
- **v26 (2026-07-20, changelog backfill for code shipped 2026-07-14 & 2026-07-16)** — `audio-preview.mjs` drifted to v16 and v17 in an out-of-scope session that never wrote a changelog entry; backfilling now for changelog parity, verified against the actual commits and the file's own inline comments, nothing invented. **v16 (2026-07-14): wishlist coverage sweep**, per Susan's request for 100% wishlist preview coverage (this endpoint already serves `wishlist.html` as well as the catalog detail modal — same code, no separate wishlist path). Audited all 73 wishlist items live: 69/73 already resolved correctly, 4 gaps found and fixed. Three were genuine "filed under a different release" cases resolved via new `KNOWN_COMPILATION_TRACKS` entries (each confirmed against Deezer's raw API first, per this file's standing discipline): Dimitri From Paris x Sister Sledge's *Le Chic Remix* box -> Sister Sledge's "Thinking of You (Dimitri from Paris Remix)"; Statik Sound System's "Revolutionary Pilot" -> the same track, correctly credited, just filed under the album *DJ-Kicks: Kruder & Dorfmeister* rather than any album titled "Revolutionary Pilot"; Rachmaninoff's "Fantasia" -> the wishlist entry itself is mislabeled, the actual paired piece is Vaughan Williams' "Fantasia on a Theme by Thomas Tallis" (confirmed via Discogs). The fourth (Adele's *25*) was a real matching-logic bug, not a content gap: `tryDeezerByArtistCatalog`'s `/search/artist?q=Adele` call doesn't return the real Adele at all (confirmed live — four small unrelated artists instead, even at `limit=15`). Fixed generally, not just for Adele, by supplementing the artist-search candidate pool with whatever artist a same-query free-text track search turns up, gated by `artistsOverlap` so an unrelated artist can never slip in — a best-effort supplement only, so no previously-working match can regress. **v17 (2026-07-16): one `KNOWN_COMPILATION_TRACKS` override for Crosby, Stills & Nash's *CSN* -> "Dark Star"**, added after Susan reported the detail modal playing "For What It's Worth" instead. Root-caused: the stored title "CSN" normalizes to a single token, which fails this file's "specific enough for containment" gate and falls through to an unrelated same-artist result — not a real content gap (the actual 1977 *CSN* album, Discogs release 3904782, is genuinely on Deezer, and "Dark Star" is its obvious representative track, confirmed via Wikipedia/AllMusic). **Flagged honestly in the code itself and repeated here:** this is the one entry in the whole map that was never confirmed live against Deezer's raw API before shipping — cross-origin fetches to `api.deezer.com` failed in the sandbox it was written in. Ships safely regardless because the override mechanism fails closed to the existing (broken) behavior if the query doesn't corroborate, so it cannot make anything worse — but per the code's own note, this specific record's preview button still wants a live tap-and-listen confirmation from Susan.
- **v24 (2026-07-13)** — Closed out all 7 remaining Deezer gaps (9 record-entries across 7 titles) plus a regression found along the way — **93/93 records now resolve, 100% via Deezer, 0 pending-YouTube, 0 no-preview, 0 errors.** Built at Susan's explicit direction, starting with The Cure: "its a best of album so choose a track like boys don't cry that is on another album too via Deezer," then "use this tactic for the other 8 albums." **`audio-preview.mjs` v13:** added a small, explicit `KNOWN_COMPILATION_TRACKS` override map — not a general heuristic, a per-record table mapping a compilation/best-of title to one specific, real, verified-on-Deezer-under-a-different-release track by the same artist (or an explicitly-named different artist, for generic "Various Artists" credits). The Cure's *Standing on a Beach* now resolves via "Boys Don't Cry" from Deezer's own *Greatest Hits*. **v14:** researched and added the remaining 6 titles the same way (never guessed a track — looked up each real tracklist via web search/Discogs first, then confirmed live on Deezer before adding): Duke Ellington's *Ellington '65* → "Hello Dolly"; Maria Callas' *The Incomparable Maria Callas* → "Casta Diva"; Rob Garza's *The Dust Ups* → "Summer Is Ours"; The Swingle Singers' *Christmastime* → "Jingle Bells"; Various Artists' *The Blues Volume 2* → Muddy Waters' "Got My Mojo Working"; Various' *Verve // Remixed* → Willie Bobo's "Spanish Grease." Two silent-failure bugs found and fixed in the same pass: (1) map keys must be pre-normalized exactly as `normalizeTitle()` produces them — literal apostrophes/parens/slashes left in by hand (e.g. `"ellington '65"`, `"the dust ups (remix album)"`, `"verve // remixed"`) caused the lookup to silently miss and fall through with no error, not a crash — caught by computing the real normalized key for all 7 pairs and diffing against the map; (2) Deezer's free-text search returns zero results for certain multi-term/parenthetical queries (confirmed live: `"Rob Garza" + "Summer Is Ours (G's Dust Up)"` and even the same query without parens both return nothing; only the shortened `"Garza" + "Summer Is Ours"` works) — fixed by giving Garza's entry an explicit shortened artist/track pair rather than the literal credited strings. **v15: found and fixed a genuine regression this same session introduced.** A full 93-record re-sweep after the above fixes turned up a NEW gap not present before this session — Scott Joplin's *Red Back Book* (previously a documented-working classical composer-vs-performer case) started failing. Root cause: this session's earlier v12 rewrite of `tryDeezerByAlbumTitleSearch` (the Deezer-only corroboration rebuild, see v23) added a branch that skips every title-matching candidate and returns null when more than one candidate exists and none corroborates against the stored artist — which is exactly what happens for a composer with no recordings of his own (2 Deezer albums match "Red Back Book" by title; neither has any track credited to "Scott Joplin"). Fixed by restructuring the function to compute whether ANY candidate corroborates before deciding to filter at all — only rejects uncorroborated candidates when corroboration has proven to be a real, available signal somewhere among the candidates; otherwise falls back to trusting the first/best-ranked match, same as pre-v12 behavior. Verified with a 4-case local Node regression suite (Bechet-preferred-over-cover, Errol-Brown-sole-candidate-trust, Scott-Joplin-fallback, best-guess-with-no-preview) before deploy, then live via `debug=1`: *Red Back Book* now correctly resolves to "Joplin: Maple Leaf Rag" by the New England Conservatory Ragtime Ensemble. **Final re-sweep after all of v13/v14/v15: 93/93 available, 100% Deezer, 0 pending, 0 no-preview, 0 true no-match, 0 errors** — a clean, fully-explained catalog for the first time since audio preview shipped.
- **v23 (2026-07-13)** — Simplified audio preview to Deezer-only + a YouTube last resort, per Susan's explicit request ("I want the previews all from Deezer"). Removed the Spotify and iTunes tiers from `audio-preview.mjs` (now v12): neither had ever contributed a single playable preview across the whole 93-record catalog (Spotify's own `preview_url` restriction affects 100% of this catalog; iTunes' legacy search endpoint has been confirmed dead since 2026-07-11). Spotify's one remaining real job — supplying an artist-corroboration signal so Deezer's title-only pass doesn't accept a same-titled cover by a different performer (the v11 Sidney Bechet fix) — was rebuilt entirely on Deezer's own data instead: `tryDeezerByAlbumTitleSearch` now considers every album Deezer returns for a title (not just the first), prefers whichever candidate's credited artist overlaps ours, and corroborates again at the track level within whichever album it settles on, trusting an uncorroborated match only when it's the sole candidate — which is what still keeps the two legitimate producer/backing-band-credit cases working (Errol Brown & The Revolutionaries → Deezer's "The Revolutionaries"; The Scientist → Deezer's "Roots Radics"). This is strictly more capable than the v11 version, not just a like-for-like swap: verified live post-deploy that Sidney Bechet's *Petite Fleur* now resolves to a genuine, correctly-attributed Deezer preview (previously it could only show a no-clip Spotify-sourced attribution). Ran a full clean 93-record re-sweep post-deploy: **84/93 available, 100% from Deezer** (confirmed programmatically — zero non-Deezer providers among the available set), **9 entries correctly `no_match_pending_youtube`** covering **7 distinct titles** (the catalog holds two separate pressings each of *The Blues Volume 2* and *Christmastime* — The Cure's *Standing on a Beach*, Maria Callas' *The Incomparable Maria Callas*, Duke Ellington's *Ellington '65*, Rob Garza's *The Dust Ups*, Various Artists' *The Blues Volume 2* (×2), The Swingle Singers' *Christmastime* (×2), Various' *Verve // Remixed*), **0 `no_preview`**, **0 true `no_match`**, **0 errors**. One expected, honestly-disclosed side effect: *The Blues Volume 2* moves from "matched via Spotify, no clip" to "pending YouTube" — Deezer's own title-search guard was already blocking a match for this generic-enough title on its own (a pre-existing limitation, not something this change introduced), so removing Spotify's lucky independent match just means this record is now categorized the same honest way as the other 6 known Deezer gaps, rather than showing a richer-but-Spotify-dependent detail. `app.js` bumped to v35 to match: provider-name map and no-match copy now say "Deezer and YouTube" instead of listing three retired providers.
- Older entries (v1–v22) moved to [CHANGELOG_ARCHIVE.md](./CHANGELOG_ARCHIVE.md) to keep this charter's context footprint down for future sessions — full history preserved there, nothing deleted.

---

## Identity

**Vinyl Scout** is Susan's personal vinyl record cataloging app. Lives at vinylscout.org on Netlify. The catalog currently holds **94 records** (live-verified via `/api/records`, 2026-08-03). She works primarily from mobile (iPhone, Safari).

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

**How it works:** Items live in their own Blobs store (`wishlist`), separate from the catalog store so wishlist writes can never touch it. Between 2026-07-11 and 2026-08-06, wishlist POST/DELETE were ungated (no edit-secret check) — Susan asked for this because typing a passphrase on mobile every session wasn't practical for a page she uses casually. **As of 2026-08-06 (Phase 8, see v39), writes are gated again** by the same edit-secret used everywhere else, but the browser remembers it in `localStorage` after one entry rather than re-prompting every session — closing the gap the 2026-07-11 exception opened without reintroducing the friction that caused it. Susan adds items on the page (artist + title only, as of v13 — see below). The weekly Claude-driven scout reads each item's Discogs sell page through Susan's browser (server-side scrapes get 403'd) and writes back `current_ask`/`price_median`. Adds come two ways: manual on the page, and a weekly Spotify sync that imports her most-played albums (vinyl-matchable only; never deletes).

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

## Phase 11 — LIVE: Concert Radar

**Status:** ✓ Live (2026-08-03), pulled forward ahead of Phase 10 at Susan's
explicit request, the same way Phases 4 and 9 were — built in one day from
a static sample-data mock (v1) to a real, live, SeatGeek-backed feature,
through several rounds of direct feedback against the deployed site.

**The whole thing in one sentence:** A page (`/concert-radar.html`) that
matches artists from the catalog and wishlist against real upcoming tour
dates near Berkeley, CA, plus a Watching panel for artists worth tracking
even before a confirmed date exists.

**How it works:**
- `GET /api/tour-dates?artist=…&range=…` (`netlify/functions/tour-
  dates.mjs`) — pure read, ungated, same reasoning as `discogs-lookup.mjs`
  and `audio-preview.mjs`. SeatGeek Platform API, by artist. As of
  2026-08-04, complemented by `GET /api/venue-shows` (`netlify/functions/
  venue-shows.mjs`) — a direct scrape of 7 hand-picked Bay Area venues, by
  venue, no API key needed — see the "Venue scraper" subsection below.
  Ticketmaster signup is in progress separately; a Spotify layer stays
  parked, added later only if a real coverage gap shows up.
- **Artist resolution is strict.** The queried name is resolved to a real
  SeatGeek *performer* first — an exact normalized-name match, then a
  guarded fuzzy fallback only if every query token is present in the
  candidate's name AND it doesn't read as a tribute/cover act. Events are
  then queried scoped to that performer's exact slug — never a loose
  free-text search across events, which is what let a tribute act
  ("Unauthorized Rolling Stones") slip through in an early version.
- **Every event's own title is checked against a tribute/cover-act
  blocklist, regardless of which tier matched the performer.** This is
  the fix for a real bug Susan caught live: `?artist=Sade` returned
  "Ultimate Sade Tribute Concert" — a tribute act registered on SeatGeek
  under the bare artist name "Sade," no qualifier anywhere except the
  event's own title, which an earlier version fetched but never checked.
  Susan asked directly, "is that Sade listing REAL? is she actually on
  tour or are u hallucinating?" — verified live against the raw API
  response before answering (not reassurance without checking), confirmed
  it was a real bug, and fixed it generally rather than special-casing
  Sade: every event's title/short_title is now filtered against a
  tribute/unauthorized/cover-band/salute/"the music of"/"a celebration
  of" blocklist regardless of match tier. Same discipline as the
  audio-preview matching saga: never trust a match without verifying what
  actually got matched.
- **Coming Soon** sweeps every distinct artist name across the catalog
  (`/api/records`) and wishlist (`/api/wishlist`) through `/api/tour-
  dates` on load (concurrency-capped at 5 in flight) and every 12h after,
  or on demand via Refresh. Results cache in `localStorage`
  (`cr_catalog_cache_v1`) so a normal visit is instant. An artist with no
  confirmed match is silently omitted — same graceful-degradation rule
  audio preview established.
- **Same-artist/same-venue multi-date shows group into one card** with a
  date range ("Feb 6–20, 2027 · 7 dates") instead of one row per date —
  fixed after Susan flagged a 7-night Buena Vista Social Club residency
  rendering as 7 near-identical cards. Ticket link points at the earliest
  date; price shows the min/max across the group; deleting hides every
  date in the group, not just the first.
- **Watching and Coming Soon are mutually exclusive ("either/or"), per
  Susan's explicit rule** ("if i'm watching an artist/concert, remove the
  instance from coming soon. its either or."). Watching an artist removes
  its card(s) from Coming Soon immediately; the Watching panel shows that
  artist's real date/price/ticket-link inline instead, so nothing ever
  renders in both places. Un-watching brings the card(s) back.
- Home location is hardcoded to **Berkeley, CA** (`HOME_LAT`/`HOME_LON` in
  `tour-dates.mjs`) per Susan's explicit 2026-08-03 choice — not an env
  var yet; would move there if/when a second home location is ever needed.

**Known, verified gap — not a bug:** every currently-matched real show
returns `priceLow`/`priceHigh: null` straight from SeatGeek's own API
(live-checked directly across 10 different real shows spanning different
artists, venues, and dates months apart — not assumed). The code reads
the correct documented fields (`stats.lowest_price`/`stats.highest_price`)
and already renders them whenever populated, proven by the Watching
panel's own price line working correctly against test data. Most likely
explanation: these particular shows are far enough out that secondary-
market listings haven't opened yet, or the API key's access tier doesn't
include pricing/stats — not independently confirmed which. Left as-is per
Susan's "put aside for now" (2026-08-03); don't fabricate a number here
without new information, and don't re-attempt a "fix" that isn't a fix.

**QA discipline applied:** every round shipped only after a local jsdom
test suite passed (mocked `fetch`, no live network calls from the sandbox
— confirmed the sandbox cannot reach external hosts directly), `npm run
check` passed, and — critically — live verification against the real
deployed site via browser tools after each push, not just a green build.
Two self-caught bugs never shipped broken: a dangling reference to a
just-removed DOM element (would have thrown on page load and broken the
whole page, caught via a grep sweep before testing), and an un-watch
handler that didn't restore a card to Coming Soon (caught by a test
written specifically to check the round-trip, not just the one-way
action).

**Manual-add fallback (added 2026-08-04):** Coming Soon and the Search
panel only ever surface shows SeatGeek itself has indexed. Susan flagged a
real, verified show (Black Uhuru, Feb 21 2026, The Freight & Salvage,
Berkeley) that SeatGeek's API doesn't carry at all — confirmed a real
coverage gap, not a matching bug (see CLAUDE.md's 2026-08-04 entry for the
full verification trail, including two other named shows that turned out
NOT to be real/Bay-Area on independent check, correctly flagged back
rather than added). Fix, scoped to the actual gap rather than a new ticket
API integration: a "+ Add a show Radar can't find" form under Coming Soon
(concert-radar.html v14) lets Susan pin a real show with a real ticket URL
directly — same manual, propose-and-confirm spirit as every other write
path here, tagged "Manual entry" so it's never confused with SeatGeek
data.

**Venue scraper (added 2026-08-04):** Susan asked to expand free coverage
automatically rather than keep relying on the manual-add fallback above.
Every other free/self-serve ticketing API was researched and ruled out
first (Eventbrite's public search API confirmed dead since 2020; Dice.fm
has no discovery API, only a partner ticket-holder API; PredictHQ has no
free tier; Bandsintown refuses hobby access; Songkick's own application
page is currently closed to new applicants entirely) — Ticketmaster
Discovery API signup is in progress separately (self-serve, but Susan's
account hit a signup snag now with their support directly; per this
project's hard rule, no account creation/login was attempted on her
behalf). With no other ticketing API viable, shipped
`netlify/functions/venue-shows.mjs` (v1): a pure-read, ungated,
server-side scrape of 7 hand-picked Bay Area venues' own public event
pages, no API key required for any of them. Susan named the venue list;
each candidate was individually verified live before being added — a
same-origin `fetch()` of the real page checked for a known real show's
name in the RAW response text, since a Netlify function has no JavaScript
engine and sees only what a plain HTTP GET returns. Two of Susan's
requested venues (Ashkenaz, The New Parish) failed that check — both
render their calendars via client-side JS/AJAX — and are deliberately
left out rather than silently wired up to return nothing; documented in
the file itself as a follow-up. Of the 7 that are live, one fetch (Another
Planet Entertainment's own listing page) covers 6 venues at once (Fox
Theater, Greek Theatre, Bill Graham Civic Auditorium, The Castro, Bimbo's
365 Club, The Independent); the rest are Cornerstone, Freight & Salvage,
Sweetwater Music Hall, Great American Music Hall, The Chapel, and UC
Theatre. `concert-radar.html` (v15) now runs the existing per-artist
SeatGeek sweep and one `/api/venue-shows` call in parallel and merges both
into the same Coming Soon list — no schema change needed, since
`venue-shows.mjs` returns shows in the identical shape `tour-dates.mjs`
already used. **Concretely validated, not just theoretical:** this
build's own reconnaissance found a real, previously-unknown second Black
Uhuru date — Sep 13, 2026, Sweetwater Music Hall, Mill Valley — distinct
from the Feb 21 Freight & Salvage date already logged above, that neither
SeatGeek nor the manual-add fallback had ever surfaced. Full per-venue
platform/parser breakdown lives in the file's own header comment; full
narrative in CLAUDE.md's 2026-08-04 entry.

**Feeds roadmap (added 2026-08-04, tracked but not yet built):** Susan asked
directly to "add Ticketmaster and other feeds to the roadmap." Every option
below has been researched at least once this project's history; this is the
consolidated status so a future session doesn't re-research the same ground:
- **Ticketmaster Discovery API** — self-serve, no special access needed once
  signed up. Signup itself is in progress separately, currently blocked on
  an account issue Susan is resolving directly with Ticketmaster's own
  support (per this project's hard rule, no account creation/login was ever
  attempted on her behalf). Highest-priority next feed once unblocked — it's
  the one genuinely general ticketing index this project doesn't already
  have, unlike the other options below.
- **Bandsintown** — re-researched 2026-08-04 per Susan's own suggestion
  ("bands in town could be another feed for you to fold in"). Its real API
  requires a non-self-serve `app_id` Bandsintown grants case-by-case, not
  available for hobby/individual use — confirmed again this session,
  consistent with this project's earlier v31-adjacent research. Its public
  artist pages ARE fetchable without an API key, but most future dates sit
  behind client-side "view more" pagination a plain server-side fetch can't
  see, so a scrape would return an incomplete picture rather than a real
  second source. Not pursued now; offered to prototype a partial-coverage
  version later if Susan wants one despite the gap.
- **Songkick** — its own new-application page is currently closed to new
  API applicants. Notably already a de facto fallback even without API
  access: two `MANUAL_SHOWS` entries above (Easy Star All-Stars, both
  dates) cite specific Songkick event pages as their source when nothing
  else corroborated. Worth revisiting if/when applications reopen.
- **Eventbrite** — public search API confirmed dead since 2020, re-confirmed
  each time this project has checked; not viable.
- **Dice.fm** — no discovery/search API at all, only a partner
  ticket-holder API for venues already using Dice to sell tickets; not
  viable for a personal project with no such relationship.
- **PredictHQ** — no free tier; not viable for a hobby project's budget.
- **Spotify Concerts** — stays parked per Phase 11's original design; would
  only get built if a real coverage gap shows up that Ticketmaster/venue-
  scrape/SeatGeek together still don't close, same discipline that added
  YouTube as audio preview's last-resort tier rather than building it
  speculatively.

**JamBase Data feed (added 2026-08-11 to 2026-08-13):** With Ticketmaster's
signup still stalled and every other option above still ruled out on
re-check, Susan asked to "improve and expand the live concert look ups"
directly, naming Songkick as a candidate worth another look. Discovered
JamBase Data's new self-serve platform (`data.jambase.com`) instead — a
genuinely free, permanent "Developer" tier (1,000 calls/month, 3,600/hr,
non-commercial use, 6-month future event window), unlike every option
already ruled out. Susan signed up and, over two sessions, upgraded to a
real `jbd_live_` production key (the initial `jbd_trial_` key rotates and
expires).

Two real bugs surfaced through live testing from Susan's own Terminal
(this session's sandbox has no outbound network path to JamBase, so every
verification claim below traces back to a real curl Susan ran herself,
not a guess): (1) the base URL in JamBase's own prose docs
(`data.jambase.com/v3`) is wrong — it 200s but serves the marketing
site's HTML, not the API; the real base URL
(`https://api.data.jambase.com/v3`) was confirmed via JamBase's own
static OpenAPI spec file. (2) The `geoRadiusAmount` query parameter is
broken on this account's tier — every value tested failed identically
with a templating-bugged JamBase error message; omitting the parameter
entirely works, and JamBase resolves the bare lat/lon to its containing
metro area automatically, which fits "Bay Area" scoping at least as well
as a radius would have.

Shipped `netlify/functions/jambase-shows.mjs` (v1): a third Concert Radar
feed, same pure-read/ungated pattern as `tour-dates.mjs`/`venue-
shows.mjs`. One geo sweep per invocation rather than one call per artist
(unlike `tour-dates.mjs`'s SeatGeek pattern), to stay well inside
JamBase's monthly budget against Susan's 150+-name artist list. Real
pagination (`fetchAllEvents()`, `?allPages=true`) was added after an
unfiltered live sweep showed 2,038 total Bay Area events across 680
pages at the default page size. Field-mapping was live-verified against
a real captured response, not just JamBase's published schema — notably,
`addressRegion` is a real object (not the bare string every doc example
showed) and `offers[].category` uses real values
(`"ticketingLinkPrimary"`/`"ticketingLinkSecondary"`) different from the
generic ones originally guessed. `scripts/test-jambase-shows.mjs` (new,
46 assertions) has its fixture rebuilt from that real response.

Wired into both sweep paths: `concert-radar.html` (v21) added
`fetchJambaseShows()` alongside the existing venue-shows fetch in
`sweepCatalog()`'s `Promise.all`, filtered through the same
`artistIsRelevant()`/`normalizeArtistKey()` pattern (v18.5) before
merging into Coming Soon — fast single-page default, since this runs on
every live visit. `scheduled-sweep.mjs` (v2) calls it with
`?allPages=true` instead, since it's the one place that should pay the
full pagination cost (once a week, well inside budget). Wiring this in
surfaced two latent gaps in `scheduled-sweep.mjs` itself, both closed in
the same pass: its artist list never included `/api/watching` (unlike
the client, since v18.5), and `venue-shows.mjs`'s output was being merged
into the weekly cache completely unfiltered (harmless while its calendars
were small, clearly wrong once JamBase's much larger raw sweep needed
filtering anyway). Both non-artist-scoped sources now go through the same
relevance filter server-side, matching the client.

Verified via `scripts/e2e-concert-radar.mjs` (the real jsdom harness, not
a reimplementation — see the v18.4 entry below), extended with an
irrelevant and a relevant-unwatched JamBase fixture show; `npm test`
(full suite) passes clean.

**Attribution — update, v42 (2026-08-13):** their docs page couldn't be
fetched (client-side rendered; every WebFetch variant tried returned only
metadata) but the free tier's "Attribution required" status was
reconfirmed directly. Rather than leave this fully open, JamBase-sourced
cards' existing `via {source}` tag is now a real hyperlink to
jambase.com (`sourceCreditHtml()`, `concert-radar.html` v21.1) — flagged
explicitly, in the code and in CLAUDE.md, as an honest interim measure
NOT confirmed to match JamBase's actual required wording/format. Susan
still needs to open that page herself and correct this if it differs —
do not treat this feed as fully attribution-compliant based on this
change alone. **Still open:** `runLiveSearch()` (the manual Search panel
/ a Watching row's "Check live →" button) doesn't query this endpoint
yet, unlike `venue-shows.mjs`'s own v17 parity treatment — a manual
search for a JamBase-only artist will still report "not found."
`JAMBASE_API_KEY` also still needs to be set in Netlify's env var UI
before any of this returns real data instead of a 500 — Susan's real key
was never pasted into chat, per this repo's never-echo-a-secret rule; she
sets it herself. Full narrative in CLAUDE.md's 2026-08-11–13 entry.

**v16 (same day, three issues found/reported in one live-review pass right
after v15 deployed):**
(1) Most `venue-shows.mjs` parsers only ever capture a `title`, not a
separate `artist` — so 6 of the 7 venues' shows arrived at the client with
`artist: null`. `concert-radar.html`'s `isWatching()` called `.trim()` on
that with no null guard, throwing `Cannot read properties of null
(reading 'trim')` on the very first render after a sweep, which the outer
`.catch()` surfaced as the page's status line instead of the (stale)
Coming Soon list — reported live as "you broke this." Root-cause fixed at
the merge boundary (`s.artist = s.artist || s.title` for every venue
show, before anything downstream sees it), plus the same defensive
`(x || '')` guard `isShowWatched()` already used added to `isWatching()`
and `findWatchMatches()` too.
(2) The `/api/venue-shows` fetch lived inside the sweep's zero-artists
early-return branch, so Refresh could skip the venue scrape entirely in
that edge case — reported directly ("the Refresh link should also scrape
the sites you set up this morning"). Moved out so it always runs, in
parallel with the artist lookup, on every sweep/Refresh.
(3) The Watching panel (4 real artists) went completely empty in Susan's
regular browser/profile within about 10 minutes of normal use — confirmed
against a live read-only screenshot of that exact browser taken minutes
earlier showing all 4 still present. No code path ever cleared
`cr_watching_v1`; whatever wiped it was outside the app's control, which
is the structural risk of keeping the only copy of real data in
browser-local storage. Susan asked to move Watching server-side, same
pattern as the wishlist. New `netlify/functions/watching.mjs` (ungated,
same rationale as `wishlist.mjs`; separate `watching` Blobs store) now
owns it — `GET/POST/DELETE /api/watching` — and `concert-radar.html` loads
from and writes through it instead of localStorage, surfacing any
load/save/delete failure as visible text in the panel itself instead of
failing silently.
Same pass, now durable: Susan named 3 artists from her own list that no
automated match (SeatGeek sweep or venue scrape) ever caught — Easy Star
All-Stars, Black Uhuru, Burning Spear — and asked for them to be
remembered as artists to follow. `watching.mjs`'s `GET` handler seeds
these itself on the very first request ever made against the store,
gated by a `_meta_seed_v16_done` sentinel record (filtered out of every
response) so it fires exactly once regardless of which browser/device
makes that first call, and can't re-add one Susan deletes later from a
different browser than whichever one happened to trigger the seed.

**v16.1 (same day, minutes after v16):** reported live — Coming Soon
showing cards with the literal artist name "null", several merged into one
card spanning dozens of "dates". Diagnosed without live access to the site
(robots.txt blocks this session's fetch tools) by reasoning through the
caching code and confirming with a standalone reproduction: a sweep that
ran between v1/v15 shipping and v16's crash fix landing saved real,
un-normalized venue data (`artist: null`) to `cr_catalog_cache_v1` — via
`saveCache()`, which runs *before* the crash in `renderList()` — so that
cache stayed poisoned and kept re-displaying on every load regardless of
the crash fix, since normalization only ever ran inside a live sweep, never
on cache load. `esc(null)` literally stringifies to `"null"`, and
`groupCatalogShows()` keys on artist+venue, so every null-artist show from
one venue collapsed into a single card — confirmed by reproducing both
behaviors standalone (old assembly: 5 distinct shows -> 1 card; new
assembly: 5 distinct shows -> 5 cards). Fixed at the actual source this
time: `venue-shows.mjs` v2 sets `artist: s.artist || s.title || null` in
its own response shape, and `concert-radar.html`'s cache key bumped to
`cr_catalog_cache_v2` so every browser's already-poisoned snapshot is
simply ignored rather than needing individual repair. Also fixed in the
same pass: The Castro (one of `parseApe()`'s 6 venues) mixes film
screenings into its listing since it's primarily a movie theater — a new
`NON_MUSIC_WORDS` blocklist (separate from `TRIBUTE_WORDS`, since this
isn't a wrong-performer problem) filters those out of every venue's
results. Declined a related ask to hand-add Watching detail for Easy Star
All-Stars/Burning Spear (still no confirmed date — would be fabricating
data); Black Uhuru's second real date (Sep 13, 2026, Sweetwater) is left to
surface from the now-fixed pipeline rather than pinned in by hand.

---

## Phases 5 through 10: LIVE

All 11 phases are live. This charter documents Phases 1 through 4 and Phase
11 in full. Phases 5 through 10 are lighter-touch additions, documented
primarily in roadmap.html and in this file's own changelog entries above,
which is why they share one section here instead of each getting their own.

Phase 5 (2026 reliability and polish) and Phase 9 (wishlist priority
sorting, shipped 2026-07-29) went live first. Phase 7 (iOS app) flipped to
Live on 2026-08-03 after Susan flagged the roadmap as wrong (v29). Read that
one carefully before repeating it. The home-screen launch icons are real and
in daily use, but the native camera-first record-adding flow meant to
replace the Safari photo upload is still unbuilt and still unscoped, so
Phase 7 is the one phase where "live" covers part of it rather than all of
it. Phase 8, "Close the wishlist gap," shipped 2026-08-06 and put the edit
key back in front of wishlist writes, remembered per device (v39). Phase 6,
"Editorial polish pass," shipped the next day (v40).

Phase 10 (Travel Intelligence hooks) depended on Phase 11 existing first.
Its technical plan was written 2026-08-04, at Susan's direct request ("plan
for our big feature tomorrow... connect the concert radar to the travel
intelligence project and vice versa"), and it was built the following day.
Both the plan and the build are kept below, in that order, because the build
deviated from the plan in one place that matters and the reasoning is worth
keeping.

### Phase 10 — Travel Intelligence hooks: technical plan (drafted 2026-08-04)

**The ask, in Susan's own words:** "i want to connect the concert radar to
the travell intelligence project and visa versa... so if i'm watching a
fare like Chicago you check the feeds to see who i am interested in that is
also playing in town during those dates when i'll be there." Bidirectional:
a match should be visible both on Vinyl Scout ("Bob Marley is playing where
you're headed") and on Travel Intelligence ("your watched Chicago trip has
a concert match"), matching the "surface on both sides" design roadmap.html
has described for this phase since before it was built.

**What already exists on this side, reusable as-is:**
- `netlify/functions/watching.mjs` (`GET/POST/DELETE /api/watching`) — the
  server-side watched-artist list.
- `/api/records` and `/api/wishlist` — catalog + wishlist artist names,
  same distinct-artist sweep `concert-radar.html`'s `fetchDistinctArtists()`
  already does client-side.
- `tour-dates.mjs`'s artist-resolution pipeline (exact-match-then-guarded-
  fuzzy performer lookup, tribute/cover-act filtering on both performer name
  and event title) — this is the hard-won matching logic (the Sade tribute
  bug, the Kruder & Dorfmeister norm() bug) and should be reused, not
  rebuilt, for whatever new endpoint this phase needs.

**What's genuinely new and needs building:**
1. **Generalize `tour-dates.mjs` beyond Berkeley.** Today `HOME_LAT`/
   `HOME_LON` are hardcoded constants (37.8715 / -122.273) and the SeatGeek
   query has no date-window filter — it just returns the performer's next
   10 upcoming events within the geo radius, unfiltered by date. A trip
   check needs both a different location AND a specific date window (e.g.
   "Chicago, Sep 1–5"), not "near Berkeley, next 10 shows." Plan: add
   optional `lat`/`lon`/`date_start`/`date_end` query params that override
   the Berkeley defaults and add SeatGeek's own `datetime_utc.gte`/
   `datetime_utc.lte` event-query params when a date window is given —
   additive, so the existing Concert Radar sweep (no params passed) keeps
   working exactly as it does today.
2. **New endpoint: `GET /api/artists-playing?lat=..&lon=..&range=..&date_start=..&date_end=..`**
   (name tentative) — sweeps the full watched + catalog + wishlist artist
   list (reusing `fetchDistinctArtists`'s server-side equivalent) through
   the now-generalized `tour-dates.mjs` logic, scoped to the given
   location/date window, and returns real matches. Ungated pure read, same
   rationale as every other read endpoint in this repo. This is the piece
   Travel Intelligence (or a shared job) calls with a trip's destination
   coordinates and travel dates.
3. **Travel Intelligence's side needs a matching read endpoint too** —
   something like `GET /api/watched-trips` returning destination city +
   lat/lon + date range ONLY (explicitly no fares or points data, per the
   existing roadmap.html privacy scoping Susan already committed to before
   this plan). This repo doesn't own that code; it's a note for whoever
   picks up Phase 10 on the Travel Intelligence side — **see the
   standalone plan doc sent to Susan the same day this was written, for
   the Travel Intelligence-side half of this spec**, since this session's
   sandbox didn't have write access to that project's own repo.
4. **Where the match actually gets computed and shown.** Two watched lists
   (artists here, trips there) times two feed calls is cheap enough to do
   live rather than needing a new scheduled job on day one — mirrors how
   Concert Radar itself started (live sweep) before `scheduled-sweep.mjs`
   was added later purely as a fast-first-paint cache, not because live
   sweeping was too slow to be correct. Recommended v1: Concert Radar's own
   page calls Travel Intelligence's `/api/watched-trips` the same way it
   already calls its own `/api/watching`, checks each trip against
   `/api/artists-playing` scoped to that trip, and renders a small "playing
   where you're headed" line per matched watched artist. Travel
   Intelligence would do the mirror image: call this repo's new
   `/api/artists-playing` for each watched trip's destination/dates. If
   real-world latency or Netlify cold-starts make either page feel slow
   once built, the existing `scheduled-sweep.mjs`/`catalog-cache.mjs`
   pattern from Concert Radar is the proven fallback shape to copy — not
   worth building preemptively before there's a live-measured reason to.
5. **Cross-site calls are unaffected by vinylscout.org's own robots.txt** —
   that file governs crawler/agent fetches, not server-to-server
   `fetch()` calls between two Netlify Functions, so neither site needs a
   robots.txt exception to call the other.

**Explicitly not decided yet, needs Susan's input before building:** how
"in town during those dates" should be scoped geographically for a
non-Bay-Area destination — a fixed radius (e.g. 25mi) like Berkeley's
`DEFAULT_RANGE`, or does it vary by city size? And should a match include
artists from the full catalog/wishlist (broad, more matches, more noise) or
only the Watching list (narrower, deliberately curated, matches what
"artists i'm interested in" most literally means in her own request)? This
plan defaults to Watching-only as the more literal reading of "who i am
interested in," but that's a judgment call worth confirming before writing
code.

### Phase 10 — built (2026-08-05), one day after the plan above

Susan answered both open questions: radius = fixed ~25mi (not city-size-
scaled); scope = **full catalog + wishlists + the venue scrape this repo
already runs** (broader than the plan's Watching-only default) — watching
is included too, for consistency with `venue-shows.mjs` v18.5's own
precedent of treating a watched-only artist the same as a catalog/wishlist
one. "Document only for now" was the answer that day; this entry is the
actual build the next day.

**One real design deviation from the plan above, worth being explicit
about:** step 2's plan said "sweeps the full watched + catalog + wishlist
artist list... through the now-generalized `tour-dates.mjs` logic" — i.e.
one SeatGeek performer+event lookup PER ARTIST, the same pattern
`sweepCatalog()` already uses for Coming Soon. Building it that way turned
out not to scale to this use case: `sweepCatalog()` gets away with ~170
per-artist calls (94 catalog + 76 wishlist, concurrency-capped at 5)
because it's client-side, runs against a FIXED location (home), and
caches the result for an hour. A cross-site check has none of those
properties — it needs to answer for an ARBITRARY destination, synchronously,
inside one Netlify Function call, with no cache on day one (per the plan's
own "live-lookup v1" recommendation) — and ~170 sequential-ish SeatGeek
round trips risked the function timeout and a visibly slow homepage on
Travel Intelligence's side.

**Built instead:** `netlify/functions/artists-playing.mjs` (new) queries
SeatGeek's `/events` by LOCATION + DATE WINDOW ONLY — no performer filter,
a natural extension of the same endpoint used the other direction — getting
back every event near the destination during the trip regardless of
artist, then cross-references the (small, in-memory) performer list against
the catalog/wishlist/watching artist set. This is a small, bounded number
of calls regardless of catalog size, not O(artists). Second source: this
site's own `/api/venue-shows` (the 7-venue scrape + `MANUAL_SHOWS`), per
Susan's explicit "venue site scraping u set up" — filtered by a small
hand-entered `VENUE_COORDS` lookup (public knowledge, not verified against
a live mapping API; worth a spot-check if a match ever looks geographically
wrong) and the trip's date window. Both sources de-duped and merged.
`tour-dates.mjs` was still generalized as planned (v5: optional `lat`/`lon`/
`date_start`/`date_end`, all backward-compatible, defaulting to the old
Berkeley/no-window behavior) — that generalization just isn't what
`artists-playing.mjs` itself calls; it's there because a future per-artist
use case (e.g. "is this ONE artist playing near my trip") would want it,
and because it was explicitly asked for.

`GET /api/artists-playing?lat=&lon=&date_start=&date_end=` — fixed 25mi
range (not user-adjustable), returns `{ matches: [...], meta: {...} }`.
Pure functions (`buildArtistIndex`, `matchSeatGeekEvents`, `matchVenueShows`,
`milesBetween`) exported and covered by `scripts/test-artists-playing.mjs`
(16 assertions, no live network/API key needed — same pattern
`test-audio-preview.mjs` established), including a tribute-act regression
case (a "Sade" performer with no tribute qualifier, but a tribute event
title — same defense `tour-dates.mjs` already has) and a "real Bay Area
match correctly does NOT surface for a far-away destination" case, proving
the venue-shows half's honest geographic limitation actually holds.

`concert-radar.html` (v19) now calls this chain from each Watching row:
this site's own `/api/artists-playing` is queried once per trip
`travelintelligence.org/api/watched-trips` reports, cross-referenced
against the artists actually rendered, and a real hit appends a green
`.travel-match` note below the row's existing date/price/tickets info.
Best-effort, fire-and-forget, never blocks the row's own real data if
either site is unreachable. `style.css` bumped to v29 (new `.travel-match`
rule) and every page's `style.css?v=` reference bumped in the same pass,
per this repo's own cache-bust discipline.

**Not verified live** — same standing caveat as v18.4/v18.5: no browser or
outbound API access from this session (WebFetch blocked site-wide by
robots.txt, no curl). `npm run check` and the extracted-script
`node --check` both pass; `test-artists-playing.mjs`'s 16 assertions pass
against fixture data. **Not extended:** `scripts/e2e-concert-radar.mjs`
(the real jsdom harness) was NOT updated with a `.travel-match` fixture
case in this pass — `checkTravelMatches()` doesn't touch any of the
existing matching logic that harness covers (`findWatchMatches`/
`isWatching`/`isShowWatched`), but its own DOM-append behavior is only
covered by the fixture-based unit tests above, not a real-DOM E2E pass.
Worth adding a fixture case there next time this file is touched, and
worth a real live check against both deployed sites once Susan has pushed
this commit.

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
- `POST /api/wishlist` — **edit-secret required as of 2026-08-06** (Phase 8; was ungated 2026-07-11 through 2026-08-05); upsert one item by `id`
- `DELETE /api/wishlist/:id` — **edit-secret required as of 2026-08-06** (Phase 8; was ungated 2026-07-11 through 2026-08-05); delete one item by `id`
- `GET  /api/audio/preview?artist=…&title=…` — public; pure read; tries Deezer first (plus a small hand-picked override table for compilation/best-of albums not on Deezer under their own title), then YouTube as a last resort — Spotify and iTunes tiers were removed at v12 (2026-07-13), see the v23 changelog entry; returns whichever provider's most-popular-track preview is playable, or a graceful `available:false` reason. Also serves `wishlist.html`'s per-row preview buttons (shipped 2026-07-14, commit `83b56ec`), same endpoint.
- `GET  /api/tour-dates?artist=…&range=…` — public; pure read; Phase 11 Concert Radar, SeatGeek-backed. Resolves the artist to a real SeatGeek performer first (exact match, then a guarded fuzzy fallback), queries events scoped to that performer's slug, and filters every event's own title against a tribute/cover-act blocklist. Returns upcoming shows near Berkeley, CA (hardcoded) with date, venue, price (when SeatGeek provides it), and a ticket URL. Powers `/concert-radar.html`'s Coming Soon sweep and its ad-hoc Search panel.
- `GET  /api/venue-shows` — public; pure read; Phase 11 Concert Radar, added 2026-08-04. Server-side scrapes 7 hand-picked Bay Area venues' own public event pages (no API key needed for any of them; one fetch covers 6 Another Planet Entertainment venues at once) and returns shows in the same shape `/api/tour-dates` uses. Two requested venues (Ashkenaz, The New Parish) are deliberately excluded — both render client-side, so a plain server fetch sees no data — see the function's own header comment. Powers `/concert-radar.html`'s Coming Soon sweep alongside `/api/tour-dates`.
- `GET  /api/jambase-shows?lat=…&lon=…&perPage=…&allPages=…` — public; pure read; Phase 11 Concert Radar, added 2026-08-13. JamBase Data v3 API, one geo sweep (not per-artist) resolved to the containing metro area — `geoRadiusAmount` is deliberately never sent (confirmed broken on this account's tier live). Returns shows in the same shape `/api/tour-dates`/`/api/venue-shows` use. `allPages=true` fetches every page (used by `scheduled-sweep.mjs`'s weekly job only); omitted, it fetches one fast page (used by `concert-radar.html`'s live sweep). Requires `JAMBASE_API_KEY`, server-side only; returns 500 without it. Powers `/concert-radar.html`'s Coming Soon sweep alongside `/api/tour-dates` and `/api/venue-shows` — not yet wired into the manual Search panel / "Check live" path.
- `GET  /api/watching` — public; returns all watched artists (`{id, artist, city}`) as a JSON array. `POST /api/watching` — **ungated**, same exception as the wishlist; upsert one watched artist by `id`. `DELETE /api/watching/:id` — **ungated**; delete one watched artist by `id`. Added 2026-08-04 (v16) after Watching's previous localStorage-only storage lost real data in Susan's browser; separate `watching` Blobs store, same pattern as `wishlist.mjs`. The very first `GET` ever made against the store seeds 3 artists Susan named directly (Easy Star All-Stars, Black Uhuru, Burning Spear), gated by a sentinel record so it only ever runs once. Powers `/concert-radar.html`'s Watching panel.
- `GET  /api/catalog-cache` — public; pure read; added 2026-08-04 (v18), rewired 2026-08-19 (v2). Serves `data/catalog-cache.json`, which `scripts/scheduled-sweep.mjs` commits from GitHub Actions every Sunday — `{ shows, artistCount, at, source }`, the `source` field being additive and ignored by the client. No longer reads the `catalog-cache` Blobs store; the JSON is inlined into the function bundle at build time, so freshness arrives with the redeploy that the Actions commit triggers. The old Netlify Scheduled Function still writes that Blobs store and nothing reads it, deliberately, until this read path is confirmed against production. `concert-radar.html` calls this only when it has no local catalog cache of its own (a new device or cleared profile), as an instant real-data first paint in place of the manual "Refresh" flow removed the same day; the client's own live sweep still always runs afterward regardless.

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
- **Phase 3**: Wishlist. Live (2026-07-04). Writes ungated 2026-07-11 through 2026-08-05; gated again (device-remembered key) as of 2026-08-06, Phase 8 (see above).
- **Phase 4**: Audio preview. Live (2026-07-11) — built ahead of the queue at Susan's direct request.
- **Phase 11**: Concert Radar. Live (2026-08-03) — built ahead of Phase 10 at Susan's direct request, same day as its own mock-to-real evolution. Artist/tour-date matching (SeatGeek) plus, as of 2026-08-04, a direct 7-venue scrape for box-office-only shows, at `/concert-radar.html`.
- **Catalog**: Susan's full collection. 94 records (reset empty after May 2026; reseeded June–July 2026).
—
