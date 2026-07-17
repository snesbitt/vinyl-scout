# Vinyl Scout — Project Charter

**Version:** 24 · **Last revised:** 2026-07-13

**Changelog**
- **v24 (2026-07-13)** — Closed out all 7 remaining Deezer gaps (9 record-entries across 7 titles) plus a regression found along the way — **93/93 records now resolve, 100% via Deezer, 0 pending-YouTube, 0 no-preview, 0 errors.** Built at Susan's explicit direction, starting with The Cure: "its a best of album so choose a track like boys don't cry that is on another album too via Deezer," then "use this tactic for the other 8 albums." **`audio-preview.mjs` v13:** added a small, explicit `KNOWN_COMPILATION_TRACKS` override map — not a general heuristic, a per-record table mapping a compilation/best-of title to one specific, real, verified-on-Deezer-under-a-different-release track by the same artist (or an explicitly-named different artist, for generic "Various Artists" credits). The Cure's *Standing on a Beach* now resolves via "Boys Don't Cry" from Deezer's own *Greatest Hits*. **v14:** researched and added the remaining 6 titles the same way (never guessed a track — looked up each real tracklist via web search/Discogs first, then confirmed live on Deezer before adding): Duke Ellington's *Ellington '65* → "Hello Dolly"; Maria Callas' *The Incomparable Maria Callas* → "Casta Diva"; Rob Garza's *The Dust Ups* → "Summer Is Ours"; The Swingle Singers' *Christmastime* → "Jingle Bells"; Various Artists' *The Blues Volume 2* → Muddy Waters' "Got My Mojo Working"; Various' *Verve // Remixed* → Willie Bobo's "Spanish Grease." Two silent-failure bugs found and fixed in the same pass: (1) map keys must be pre-normalized exactly as `normalizeTitle()` produces them — literal apostrophes/parens/slashes left in by hand (e.g. `"ellington '65"`, `"the dust ups (remix album)"`, `"verve // remixed"`) caused the lookup to silently miss and fall through with no error, not a crash — caught by computing the real normalized key for all 7 pairs and diffing against the map; (2) Deezer's free-text search returns zero results for certain multi-term/parenthetical queries (confirmed live: `"Rob Garza" + "Summer Is Ours (G's Dust Up)"` and even the same query without parens both return nothing; only the shortened `"Garza" + "Summer Is Ours"` works) — fixed by giving Garza's entry an explicit shortened artist/track pair rather than the literal credited strings. **v15: found and fixed a genuine regression this same session introduced.** A full 93-record re-sweep after the above fixes turned up a NEW gap not present before this session — Scott Joplin's *Red Back Book* (previously a documented-working classical composer-vs-performer case) started failing. Root cause: this session's earlier v12 rewrite of `tryDeezerByAlbumTitleSearch` (the Deezer-only corroboration rebuild, see v23) added a branch that skips every title-matching candidate and returns null when more than one candidate exists and none corroborates against the stored artist — which is exactly what happens for a composer with no recordings of his own (2 Deezer albums match "Red Back Book" by title; neither has any track credited to "Scott Joplin"). Fixed by restructuring the function to compute whether ANY candidate corroborates before deciding to filter at all — only rejects uncorroborated candidates when corroboration has proven to be a real, available signal somewhere among the candidates; otherwise falls back to trusting the first/best-ranked match, same as pre-v12 behavior. Verified with a 4-case local Node regression suite (Bechet-preferred-over-cover, Errol-Brown-sole-candidate-trust, Scott-Joplin-fallback, best-guess-with-no-preview) before deploy, then live via `debug=1`: *Red Back Book* now correctly resolves to "Joplin: Maple Leaf Rag" by the New England Conservatory Ragtime Ensemble. **Final re-sweep after all of v13/v14/v15: 93/93 available, 100% Deezer, 0 pending, 0 no-preview, 0 true no-match, 0 errors** — a clean, fully-explained catalog for the first time since audio preview shipped.
- **v23 (2026-07-13)** — Simplified audio preview to Deezer-only + a YouTube last resort, per Susan's explicit request ("I want the previews all from Deezer"). Removed the Spotify and iTunes tiers from `audio-preview.mjs` (now v12): neither had ever contributed a single playable preview across the whole 93-record catalog (Spotify's own `preview_url` restriction affects 100% of this catalog; iTunes' legacy search endpoint has been confirmed dead since 2026-07-11). Spotify's one remaining real job — supplying an artist-corroboration signal so Deezer's title-only pass doesn't accept a same-titled cover by a different performer (the v11 Sidney Bechet fix) — was rebuilt entirely on Deezer's own data instead: `tryDeezerByAlbumTitleSearch` now considers every album Deezer returns for a title (not just the first), prefers whichever candidate's credited artist overlaps ours, and corroborates again at the track level within whichever album it settles on, trusting an uncorroborated match only when it's the sole candidate — which is what still keeps the two legitimate producer/backing-band-credit cases working (Errol Brown & The Revolutionaries → Deezer's "The Revolutionaries"; The Scientist → Deezer's "Roots Radics"). This is strictly more capable than the v11 version, not just a like-for-like swap: verified live post-deploy that Sidney Bechet's *Petite Fleur* now resolves to a genuine, correctly-attributed Deezer preview (previously it could only show a no-clip Spotify-sourced attribution). Ran a full clean 93-record re-sweep post-deploy: **84/93 available, 100% from Deezer** (confirmed programmatically — zero non-Deezer providers among the available set), **9 entries correctly `no_match_pending_youtube`** covering **7 distinct titles** (the catalog holds two separate pressings each of *The Blues Volume 2* and *Christmastime* — The Cure's *Standing on a Beach*, Maria Callas' *The Incomparable Maria Callas*, Duke Ellington's *Ellington '65*, Rob Garza's *The Dust Ups*, Various Artists' *The Blues Volume 2* (×2), The Swingle Singers' *Christmastime* (×2), Various' *Verve // Remixed*), **0 `no_preview`**, **0 true `no_match`**, **0 errors**. One expected, honestly-disclosed side effect: *The Blues Volume 2* moves from "matched via Spotify, no clip" to "pending YouTube" — Deezer's own title-search guard was already blocking a match for this generic-enough title on its own (a pre-existing limitation, not something this change introduced), so removing Spotify's lucky independent match just means this record is now categorized the same honest way as the other 6 known Deezer gaps, rather than showing a richer-but-Spotify-dependent detail. `app.js` bumped to v35 to match: provider-name map and no-match copy now say "Deezer and YouTube" instead of listing three retired providers.
- **v22 (2026-07-13)** — Full 93-record audio-preview accuracy sweep, per Susan's explicit request to review the whole catalog (not just presence/reason-checking, but whether the returned track is actually correctly attributed). Found and fixed a genuine wrong-artist bug: Sidney Bechet's *Petite Fleur* LP was serving Cyrille Aimée's unrelated vocal cover of the same jazz standard — Deezer's album-title-search pass (the third of three Deezer passes) had no way to check the returned track's artist against the record's actual artist, so it picked the top-ranked "Petite Fleur" match regardless of who performed it. Fixed in `audio-preview.mjs` v11: `tryDeezerByAlbumTitleSearch` now accepts an optional corroboration artist and, when Spotify has already found a plausible-artist match for the same record, filters the album's tracklist down to tracks whose credited artist overlaps that artist before picking the top-ranked one — refusing to return a track at all if none plausibly match, rather than guessing wrong. Gated narrowly (only fires when Spotify already agrees on the artist) specifically to avoid regressing two known-legitimate exceptions where this same pass correctly serves a different-looking artist: compilation-curator credits (Kruder & Dorfmeister's *Conversions* correctly credited to K&D on Deezer even though individual tracks are by other artists) and classical composer-vs-performer credits (Beethoven→Barenboim, Karajan→Berliner Philharmoniker, Scott Joplin→New England Conservatory Ragtime Ensemble) — confirmed via live `debug=1` checks that both cases have `spotify: {track: null}`, so the new corroboration filter never engages for them. Verified with a local Node regression test against the real observed buggy Cyrille Aimée data before deploy. Ran a full clean re-sweep of all 93 records post-fix (a batch harness via the live site, not 93 manual checks) for one internally-consistent final accounting: **85/93 available** with a verified plausible-artist preview, **6 correctly labeled `no_match_pending_youtube`** (The Cure – *Standing on a Beach*, Maria Callas – *The Incomparable Maria Callas*, Duke Ellington – *Ellington '65*, Rob Garza – *The Dust Ups*, The Swingle Singers – *Christmastime*, Various – *Verve // Remixed*), **2 correctly `no_preview`** with an accurate artist match but no playable clip (Various Artists' *The Blues Volume 2* → Robert Johnson's own "Love In Vain"; Sidney Bechet's *Petite Fleur* → now correctly matched to Bechet's own recording, just no preview clip currently available), **0 true unexplained `no_match`**, **0 errors**. This closes out the "review the whole catalog" request with a clean bill of health across every record.
- **v21 (2026-07-13)** — Fixed a real UX bug Susan hit directly: the detail-modal Play button showed a bare "No matching track found" for Duke Ellington's *Ellington '65*, which read like a broken feature. Root-caused, not just patched: independently re-confirmed live (a fresh Deezer artist-catalog walk across all 5 "Duke Ellington" profiles, 43+44 albums checked, plus a direct title search) that this album genuinely isn't on Deezer under any name — it's one of the 7 records already documented as absent from Spotify/Deezer/iTunes, pending only the (still-unset) `YOUTUBE_API_KEY`. The actual bug was that this "pending a one-time setup step" state was indistinguishable from a genuine, fully-checked absence — both returned the same generic `reason: "no_match"`. Fixed in `audio-preview.mjs` v10: a new `reason: "no_match_pending_youtube"` fires only when tiers 1–3 all miss AND `YOUTUBE_API_KEY` isn't set (i.e., tier 4 was never actually attempted); `app.js` v34 renders this honestly ("Not found on Spotify, Deezer, or Apple Music — a YouTube fallback is planned but not turned on yet.") instead of the old dead-end copy. No matching-logic changed — this is purely a truthful-messaging fix, so no regression risk to the other 86 already-resolving records. Also addressed the process gap this exposed: Job E's weekly YouTube-key-activation check (below) previously only acted when the key flipped on; it now also reports the pending state and affected record count every week so this never sits silently unmentioned again. See CLAUDE.md for the Job E prompt update.
- **v20 (2026-07-12)** — Expanded the external weekly automation (`weekly-vinyl-median-refresh`, Mondays ~9:08am, lives outside this repo in Susan's Claude app scheduled tasks) with a new **Job E — code & data health checks**, run every week ahead of the existing Job D QA pass, per Susan's standing goal of "pristine code, no issues, everything as current as possible": (1) **cache-bust drift check** — compares every static page's `style.css?v=`/`app.js?v=` reference against the actual current version and fixes any page caught lagging (this is exactly the bug that let `roadmap.html`/`about.html`/`guide.html` sit at `style.css?v=23` for weeks after it moved to v24 — see v19's E2E QA note); (2) **audio-preview canary check** — re-tests a fixed set of 5 records that each previously exposed a real `audio-preview.mjs` matching bug (Led Zeppelin *IV*, Air *Moon Safari*, Fleetwood Mac *Rumours*, Beethoven's Piano Sonatas, The Scientist), escalating to a full 93-record sweep if any canary fails; (3) **YouTube key activation check** — detects if `YOUTUBE_API_KEY` has been set since the last run and, if so, automatically re-verifies the 7 previously-confirmed gap records and updates this charter + CLAUDE.md to close out the long-open "not yet set" note; (4) **cover-art link-rot spot check** — a rotating ~12+12 sample of record/wishlist cover URLs checked for actual reachability each week; (5) **full smoke-test parity** — Job D's QA previously checked only a subset of what `scripts/smoke.mjs` checks; Job E now runs every one of smoke.mjs's assertions directly against the live site. Job D's documentation-reconcile step was also changed from conditional ("only if something changed") to **unconditional every week** — read `CLAUDE.md`, `PROJECT.md`, `README.md`, `about.html`, `guide.html`, `roadmap.html` in full every run, matching the standing instruction added to CLAUDE.md same day.
- **v19 (2026-07-12)** — Two things: (1) **Highlight the highest-value record** (`app.js` v33, `style.css` v25) — a quiet one-line "Most valuable — Artist, Title · €price" callout with a small thumbnail, rendered under the existing collection-value stat in the controls heading. Deliberately restrained rather than a badge on the tile grid: Susan has twice pulled back from decorative additions here (the green FIND badge removed per v10, pricing/metadata stripped off gallery tiles per app.js v26), so three mockup options were presented (text callout / tile badge / sort-to-front) and the safest, most reversible one was built — pure client-side read of already-stored `price_median`/`price_low`, no new endpoint. Currently: Bob Marley & The Wailers, *In Dub, Vol. 1* · €148.77. (2) **Full end-to-end QA sweep** run against the live site post-deploy, covering every endpoint and page shipped across this and the two prior sessions (Phase 3 Wishlist ungating, Phase 4 Audio Preview through its v9/YouTube-tier state, and this highlight feature) — see the QA sweep note below. All green; one apparent wishlist read-after-write miss traced to a one-off propagation blip (confirmed via retry), not a regression.
- **v18 (2026-07-12)** — `audio-preview.mjs` v9: made the "most popular track on the album" guarantee provable rather than incidental. The Deezer free-text pass previously ranked only among whichever tracks a relevance search happened to surface — verified 5/5 real albums were already correct by chance (Madonna, Buena Vista Social Club, CSN, Fleetwood Mac), but nothing guaranteed the 6th would be. Fixed: once the correct album is identified, fetch its real complete tracklist and pick the true top-rank track with a preview (same method the other two Deezer passes already use). Also widened the YouTube tier's search from 10 to up to 50 merged candidates (relevance + `order=viewCount`) for the same reason. Re-ran the full 93-record sweep: same 86/93, same 7 gaps, zero regressions.
- **v17 (2026-07-12)** — Three changes: (1) **Audio preview tier 4, YouTube** (`audio-preview.mjs` v8) — last-resort fallback for the 7 records confirmed genuinely absent from Spotify/Deezer/iTunes; needs `YOUTUBE_API_KEY` (not yet set — Susan needs to create a free Google Cloud Console API key, an account-setup step outside what an agent does unattended); gracefully reports "not configured" until then. No `preview_url` — renders a 30-second-capped YouTube iframe (`app.js` v32, `style.css` v24) instead of the native `<audio>` element. (2) **Wishlist manual-add form simplified** (`wishlist.html` v13) — dropped the Discogs URL and Notes fields per Susan's request, now just artist + title. (3) **Wishlist cover-art bug found and fixed**: the manual-add path never called the Discogs lookup at all, so manually-added items never got `cover_url` (confirmed live: 1/56 items affected, Anita Baker's *Rapture*) — fixed going forward by having the add flow call `/api/discogs/lookup` itself, and backfilled the one existing gap. Also backfilled `current_ask` for two items that were showing "NEVER SOLD" despite live Discogs listings existing (both added since the last weekly scout run — that field is populated by an external weekly process, not by any code in this repo, so newly-added items always show "NEVER SOLD" until the following Monday unless backfilled manually like this).
- **v16 (2026-07-11)** — Chased down the last of the Phase 4 audio-preview matching bugs through five more `audio-preview.mjs` revisions (v3–v7), verifying by tracing the actual matched track/album on Deezer's own API rather than trusting `available:true` at face value. **v3:** fixed three real false positives (Maria Callas matched an unrelated Bellini excerpt on shared artist-name overlap alone; *The Blues Volume 2* and *Christmastime*/*Verve // Remixed* matched unrelated releases on generic-word overlap alone) — added an artist-name-can't-be-the-only-evidence guard and a generic-compilation-word stoplist. **v4 regression, caught same-day via a full re-sweep (not just the reported records) and reverted in v5:** a specificity gate meant for one pass only got applied everywhere, breaking short real titles (Led Zeppelin *IV*, Kraftwerk *Autobahn*, Joy Division *Closer*, Moby *Play*, Peter Gabriel *Security*). **v6:** found a genuinely wrong track behind a "fixed" *IV* result — a raw `.includes()` containment check was letter-substring matching, so "iv" matched inside the word "Live"; fixed with a whole-word containment check. **v7:** found a second wrong-track case — Air's *Moon Safari* was matching a totally different artist's ("Vegyn") remix filed on an unrelated tribute album that happened to contain the words "Moon Safari"; fixed by requiring the actual track's credited artist to correspond to our stored artist whenever a match isn't exact (or an artist-name/generic-wrapper-only variant), verified this doesn't break the legitimate classical composer→performer and reggae producer→backing-band credit differences already relied on. **Final result: 86/93 (92%) with an individually-verified-correct playable preview**, 7 confirmed genuine catalog gaps, 0 known bugs. Full details in the Phase 4 section below.
- **v15 (2026-07-11)** — Diagnosed the 18 `no_match` records from v14 and fixed the fixable half. Root cause: Deezer's free-text `/search` relevance ranking sometimes buries a real match under more "popular" generic tracks — confirmed live for The Cure's *The Head on the Door* and *Japanese Whispers*, both genuinely on Deezer but never surfaced by free-text search. **Fix (`audio-preview.mjs` v2):** Deezer tier now falls back to an artist-catalog walk (search artist → that artist's full album list → fuzzy-match the title → that album's tracklist, picking the highest-rank track with a preview) whenever free-text search misses. **Result: 6 of the 18 recovered** — Kruder & Dorfmeister *Conversions*, Tosca *J.A.C. Reissue*, The Benny Goodman Quartet *Together Again*, k.d. lang *Absolute Torch and Twang*, and both remaining Cure titles. **New total: 81/93 (87%) with a real, verified-playable preview**, still 0 via Spotify / 0 via iTunes, all via Deezer, 0 bugs (every recovered preview independently fetch-checked as real playable audio). The remaining 12 were individually checked against Deezer's catalog directly (not just through the function) and are genuinely absent under any title — mostly classical/orchestral recordings (Callas, von Karajan, Horowitz, Ellington, Peterson), niche reggae/remix titles, and two "Various Artists" compilations whose specific pressing isn't the same as any Deezer-catalog release by a similar name. No further code fix recovers a title that was never digitized under any name.
- **v14 (2026-07-11)** — Deployed v13's multi-provider `audio-preview.mjs` and ran a full live sweep of all 93 catalog records against it. Result: **75/93 (81%) have a real, verified-playable preview** — all 75 via Deezer (0 via Spotify, confirming the tier-1 restriction is total; 0 via iTunes, consistent with its uncertain live status). The remaining 18 are `no_match` — no provider found a matching track at all, mostly classical/orchestral recordings, dub/reggae deep cuts, and remix compilations whose titles don't line up cleanly with any streaming catalog (e.g. Maria Callas, Duke Ellington, Oscar Peterson, Kruder & Dorfmeister's *Conversions*, three separate Cure titles). Zero bugs found: every "available" result returned HTTP 200 with a real `preview_url`, and 5 spot-checked URLs across the list all returned actual playable audio (206 Partial Content, `audio/mpeg`) on direct fetch. No silent failures, no broken links.
- **v13 (2026-07-11)** — **Phase 4 rebuilt: multi-provider Audio Preview.** Replaced `spotify-preview.mjs` with `netlify/functions/audio-preview.mjs` (`GET /api/audio/preview?artist=&title=`) after discovering Spotify's own preview restriction affected 100% of the catalog (0/93 records). Now tries Spotify, then Deezer, then iTunes in sequence, playing whichever provider actually has a clip (app.js v31, style.css v23). See Phase 4 section below for the full investigation, empirical validation, and alternatives considered.
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

**The whole thing in one sentence:** A separate page tracking records Susan is hunting for, with a weekly scout that checks Discogs asking prices and keeps cover art and medians current (the original max-price/FIND-flagging behavior was removed at Susan's request — see v10).

**How it works:** Items live in their own Blobs store (`wishlist`), separate from the catalog store so wishlist writes can never touch it. **As of 2026-07-11, wishlist POST/DELETE are ungated** (no edit-secret check) — Susan asked for this because typing a passphrase on mobile every session wasn't practical for a page she uses casually. This is a deliberate exception to the edit-secret pattern used everywhere else; anyone with the site URL can add or remove wishlist items. Susan adds items on the page (artist + title only, as of v13 — see below). The weekly Claude-driven scout reads each item's Discogs sell page through Susan's browser (server-side scrapes get 403'd) and writes back `current_ask`/`price_median`. Adds come two ways: manual on the page, and a weekly Spotify sync that imports her most-played albums (vinyl-matchable only; never deletes).

**v13 (2026-07-12): manual-add form simplified + cover-art bug fixed.** Susan asked to drop the Discogs URL and Notes fields from the manual add form — now just artist + title. Separately, while looking at the wishlist, Susan flagged a record with no cover art (Anita Baker's *Rapture*); investigating found the actual bug: the manual-add path never called `/api/discogs/lookup` at all, so every manually-added item got no `cover_url` unless Susan happened to paste a Discogs URL herself (confirmed live: 1/56 items affected — the automated Spotify/Amazon-cart sync path already looked this up, so the gap was specific to manual adds). Fixed by having `addItem()` call the lookup itself at add-time (best-effort — a failed lookup still lets the item get added, just with no cover, same graceful behavior as before) and backfilled Anita Baker's record directly (release 2655338, confirmed the cover image actually loads). Also separately backfilled two records showing "NEVER SOLD" that actually had live Discogs listings (Andrés Segovia's *Granada* → €18.45, Anita Baker's *Rapture* → €8.61) — both were added since the last weekly scout run and simply hadn't been touched yet; `current_ask`/`price_median` are populated by that external weekly process, not by any code in this repo, so a newly-added item will always show "NEVER SOLD" until the following Monday unless manually backfilled like this.

---

## Phase 4 — LIVE: Audio Preview

**Status:** ✓ Built, deployed, and verified live against the full catalog (2026-07-11), out of the normal phase order, at Susan's direct request. Rebuilt same-day as a multi-provider lookup after Spotify's own preview restriction turned out to affect the entire catalog (see "Why multi-provider" below), then went through five further same-day matching-logic revisions (v3–v7) after diagnosing first a batch of real false positives, then two further false-positive bugs found only by deliberately re-checking what "available:true" results actually played rather than trusting the count. Simplified to Deezer-only + YouTube last resort on 2026-07-12 (v23). **As of 2026-07-13 (v13–v15 below): 93/93 records (100%) resolve to a real, individually-verified-correct playable preview, 100% via Deezer, 0 gaps, 0 known bugs.**

**The whole thing in one sentence:** A "Preview" section in the collection detail modal with a Play button that fetches the most popular track on that album — trying Spotify, then Deezer, then iTunes — and plays whichever provider actually has a clip, in-app, via a native `<audio>` element.

**How it works:**
- `GET /api/audio/preview?artist=&title=` (`netlify/functions/audio-preview.mjs`) — pure read, ungated, same reasoning as `discogs-lookup.mjs`
- Tries three providers in order, stopping at the first one with a real preview clip:
  1. **Spotify** — client-credentials flow (`SPOTIFY_CLIENT_ID`/`SPOTIFY_CLIENT_SECRET`, Netlify env vars), searches `artist:"…" album:"…"`, ranks by `popularity`. Best match quality when it has a clip, which as of 2026-07-11 is never (see below) — kept as tier 1 since the credentials are already configured and it's occasionally the richest data source.
  2. **Deezer** — public `/search` endpoint, **no API key/registration needed**. Free-text query (field-filtered `artist:"" album:""` syntax is much stricter and misses near-matches — e.g. "Temple of I and I" vs. Deezer's "Temple Of I & I"). Ranks candidates by Deezer's own `rank` field, a genuine popularity score. Preview URLs are signed and expire after a few hours, which is fine since they're only ever fetched fresh on tap, never cached.
  3. **iTunes** — Apple's public Search API, also no key needed. Wrapped defensively (try/catch, checks `content-type` is JSON before parsing) because a live browser check redirected `itunes.apple.com/search` to an Apple marketing page rather than JSON — status genuinely uncertain, so any failure here just no-ops rather than erroring. **No popularity signal exists on this API** — it picks the first track under the matched album rather than a verified most-popular one, so the "most popular track" guarantee is best-effort only at this tier.
- Frontend (`app.js` `buildAudioBlock`/`playPreview`) lazy-fetches only when Susan taps Play. Shows a small "via Deezer"/"via Apple Music" credit line under a playing clip when it didn't come from Spotify.
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
- `GET  /api/audio/preview?artist=…&title=…` — public; pure read; tries Spotify, then Deezer, then iTunes; returns whichever provider's most-popular-track preview is playable, or a graceful `available:false` reason

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
