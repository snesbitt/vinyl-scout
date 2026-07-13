// netlify/functions/audio-preview.mjs
// version: 12
// v12 (2026-07-13): simplified to Deezer-only (+ YouTube last resort) per
// Susan's explicit request. Removed the Spotify tier and the iTunes tier —
// neither had ever contributed a single playable preview across the whole
// 93-record catalog (Spotify: its own preview_url restriction affects 100%
// of this catalog, confirmed 2026-07-11; iTunes: confirmed dead the same
// day, its legacy /search endpoint now unconditionally redirects to HTML
// regardless of caller). Spotify's ONE real remaining job — supplying an
// artist-corroboration signal so Deezer's title-only pass (c) doesn't
// accept a same-titled cover by a completely different performer (the
// Sidney Bechet/Cyrille Aimée bug fixed in v11) — is now done entirely
// within Deezer's own data instead: tryDeezerByAlbumTitleSearch considers
// EVERY album Deezer returns for the title (not just the first), prefers
// whichever candidate's credited artist overlaps ours, and additionally
// corroborates at the track level within whichever album it settles on —
// falling back to accepting an uncorroborated album/track only when it's
// the SOLE candidate at all (this is exactly what keeps the two legitimate
// producer/backing-band-credit cases working: Errol Brown & The
// Revolutionaries -> Deezer's "The Revolutionaries", The Scientist ->
// Deezer's "Roots Radics" — both have only one matching album on Deezer, so
// no reordering or refusal ever applies to them). This is strictly more
// capable than the v11 Spotify-gated version: it can now pick the CORRECT
// album when multiple same-titled releases exist, not just refuse to guess.
// Also preserves the "matched but no preview clip" attribution UX (used by
// 2 records — Various Artists' "The Blues Volume 2" and Sidney Bechet's
// "Petite Fleur") natively from Deezer's own best-guess match instead of
// Spotify's, so no metadata is lost by removing the Spotify tier. Verified
// via a full 93-record re-sweep post-deploy: same 85/93 available, same 6
// pending-YouTube, same 2 correctly-attributed no-preview records, 0
// regressions. See PROJECT.md v23 for the full changelog + sweep results.
// v11 (2026-07-13): fixed a real wrong-artist bug found during a full
// 93-record accuracy sweep (prompted by Susan asking whether the Ellington
// '65 issue had siblings). Sidney Bechet's "Petite Fleur" was serving a
// completely different artist's cover of the same jazz standard (Cyrille
// Aimée) as if it were Bechet's own recording — Spotify correctly matched
// Bechet's real track (no preview_url, per the known tier-1 restriction),
// but Deezer's artist-scoped passes (a)/(b) found nothing, and pass (c) —
// a title-only search with no artist check at all, by design, for the
// producer/backing-band-credit cases — accepted an unrelated same-titled
// album by a different, unrelated performer. Fixed by gating pass (c)'s
// corroboration requirement on whether Spotify already confirmed the
// artist/title combo is real: see tryDeezer/tryDeezerByAlbumTitleSearch
// below for the exact mechanism and why the two already-verified legitimate
// pass (c) fixes (Errol Brown & The Revolutionaries, The Scientist/Roots
// Radics) are unaffected (both have a null Spotify match, confirmed live).
// v10 (2026-07-13): new `reason: "no_match_pending_youtube"` distinguishes
// "genuinely absent everywhere" from "not found on Spotify/Deezer/iTunes,
// but YouTube — the tier that would cover this — isn't configured yet".
// Prompted by Susan hitting a bare "No matching track found" for Duke
// Ellington's "Ellington '65", one of the 7 records already documented
// below as absent from Deezer (independently re-confirmed live via a full
// artist-catalog walk across all 5 Deezer "Duke Ellington" profiles before
// this fix — not a matching-logic bug, a real gap) pending only the
// YOUTUBE_API_KEY setup step. The old code returned the exact same
// `reason: "no_match"` regardless of whether that pending step was the
// actual cause, so the frontend had no way to render anything better than
// a generic dead-end message. See app.js for the corresponding copy change.
// Phase 4 — Audio preview. Given an artist + album title, finds the most
// popular track on that album and returns a playable 30-second preview clip,
// trying providers in this order:
//
//   1. Deezer    — NO auth/API key required. The sole preview source as of
//                  v12 — Spotify and iTunes were removed here (see the v12
//                  changelog note above): across the whole 93-record
//                  catalog, Spotify never once returned a preview_url (its
//                  own platform-wide restriction) and iTunes' legacy search
//                  endpoint has been confirmed dead since 2026-07-11. Every
//                  one of the 85 currently-playable previews already came
//                  from Deezer before this simplification — removing the
//                  other two tiers changes no user-visible behavior, just
//                  the code that was doing nothing. Three-pass lookup, each
//                  pass only run if the previous one didn't yield a preview:
//                  (a) fast free-text /search hit;
//                  (b) artist-catalog walk: search/artist -> that artist's
//                      full /albums list -> match the album title -> that
//                      album's /tracks, picking the highest-`rank` track
//                      with a preview. Recovers matches pass (a)'s relevance
//                      ranking buries under more "popular" generic tracks —
//                      confirmed live for The Cure's "The Head on the Door",
//                      "Japanese Whispers", and k.d. lang's "Absolute Torch
//                      and Twang" (all three genuinely on Deezer, none
//                      surfaced by free-text search).
//                  (c) title-only album search, ignoring our stored artist
//                      name entirely. Exists because some vinyl-era reggae/
//                      dub albums are catalogued under a producer or
//                      backing-band credit rather than the mixing-engineer
//                      name on our sleeve — confirmed live for "Errol Brown
//                      & The Revolutionaries" (Deezer: just "The
//                      Revolutionaries") and "The Scientist"'s "...Evil
//                      Curse of the Vampires" (Deezer: "Junjo Presents: The
//                      Evil Curse Of The Vampires" by "Roots Radics").
//                  All three passes use the same title-matching function:
//                  exact/substring match first, then a guarded fuzzy overlap
//                  match (>=2 shared significant words AND >=50% overlap of
//                  the shorter title's words, AND rejected outright if both
//                  titles name different specific years) for cases like a
//                  classical recording repackaged with a different pairing
//                  piece (Karajan's Mozart Requiem: our "...in D Minor K626"
//                  vs Deezer's "...; Coronation Mass" — same recording,
//                  different sleeve), plus a narrow "ignore the word live"
//                  pass for the common "Live in X" vs "In X" naming gap
//                  (Oscar Peterson: our "Live in Russia" vs Deezer's "Oscar
//                  Peterson In Russia"). The year-conflict guard specifically
//                  exists because a looser match would have wrongly recovered
//                  a *different* 1966 Horowitz Carnegie Hall recital against
//                  our catalog's 1967-1968 one — confirmed as a real near-miss
//                  during testing, not a hypothetical. Preview URLs are
//                  signed and expire after a few hours — fine here since we
//                  only ever fetch fresh, on tap, never cache them. Pass (c)
//                  additionally corroborates by artist across however many
//                  same-titled album candidates Deezer returns — see the v12
//                  changelog note and tryDeezerByAlbumTitleSearch below for
//                  the exact mechanism (this replaced the v11 Spotify-gated
//                  version, which is no longer possible since Spotify itself
//                  was removed as a tier).
//   2. YouTube   — LAST RESORT, added 2026-07-12. Only reached if Deezer
//                  misses entirely. Requires a free YOUTUBE_API_KEY (Google Cloud
//                  Console, YouTube Data API v3, API-key-only — no OAuth).
//                  Unlike the other tiers, returns no `preview_url` — YouTube
//                  gives no direct audio file, only an `embed_url` (a YouTube
//                  iframe embed with `start`/`end` params) that the frontend
//                  renders instead of the native <audio> element, capped at
//                  the same 30-second convention via the embed's own
//                  start/end params (which actually stop playback there, not
//                  just a UI suggestion). Confirmed via direct research
//                  2026-07-12 that Deezer, Bandcamp, and Spotify all
//                  genuinely lack the 7 records below — this tier exists
//                  specifically to recover those. See tryYouTube for the
//                  matching/quality filters (title-token corroboration,
//                  view-count ranking, duration window excluding full-album/
//                  DJ-set uploads).
//
// Known real gaps (not bugs, confirmed absent everywhere including YouTube's
// public catalog as of 2026-07-12): none currently identified — all 93
// records now resolve on at least one provider once YouTube is configured.
// Before YouTube was added, 7/93 were genuine gaps on Spotify/Deezer/iTunes:
// Maria Callas' "The Incomparable Maria Callas", Duke Ellington's "Ellington
// '65", Rob Garza's "The Dust Ups (Remix Album)", two "Various Artists"
// compilations ("The Blues Volume 2", "Verve // Remixed" — Deezer has other,
// unrelated releases under similar names, confirmed by direct search, not a
// naming-mismatch bug), The Swingle Singers' "Christmastime", and The Cure's
// "Standing on a Beach" (checked its full 74-album Deezer discography under
// every plausible title including the UK "Staring at the Sea" name — not
// there; also confirmed absent from Bandcamp's public search). See
// PROJECT.md's Phase 4 section for the full per-record history.
//
// Diagnostic mode: append &debug=1 to any request to get a `_debug` key in
// the response showing what each pass/tier actually returned or errored on.
// Pure read, changes no behavior, just makes matching-logic bugs visible
// without needing Netlify's server log dashboard.
//
// PURE READ. Never touches the Netlify Blobs "records" store, never writes
// anything. Not gated by the edit secret — same reasoning as
// discogs-lookup.mjs: this exposes no catalog data and writes nothing.
//
// Graceful degradation: no match on Deezer, or YouTube not configured,
// returns a normal 200 with available:false + a reason — never an error.
//
// Env vars expected (optional — YouTube degrades gracefully if unset; Deezer
// needs no key at all):
//   YOUTUBE_API_KEY        — YouTube Data API v3 key (server-side only, tier 2)
//
// Removed in v12: SPOTIFY_CLIENT_ID / SPOTIFY_CLIENT_SECRET are no longer
// read by this file (the Spotify tier was removed). Safe to leave the values
// set in the Netlify UI — unused env vars are harmless — or clear them later;
// not required for anything here.

export const config = { path: "/api/audio/preview" };

function json(body, status) {
  if (body && body._debug === null) delete body._debug; // omit when not in debug mode
  return new Response(JSON.stringify(body), {
    status: status || 200,
    headers: { "Content-Type": "application/json" },
  });
}

// Loose normalization for fuzzy album-title matching across providers whose
// catalog titles don't always match ours verbatim (e.g. "Temple of I and I"
// on our label vs. "Temple Of I & I" on Deezer's).
function normalizeTitle(s) {
  return String(s || "")
    .toLowerCase()
    .replace(/&/g, "and")
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

// Common English filler words stripped before fuzzy overlap scoring. Kept
// deliberately small — anything that could be a meaningful distinguishing
// word (an artist name, a place, "live", a number) is NOT in this list.
var TITLE_STOPWORDS = new Set([
  "the", "a", "an", "of", "in", "on", "at", "and", "or", "to", "by",
  "with", "for", "is", "are", "this", "that", "from",
]);

// Words that are common filler *specifically in compilation/reissue titles*
// rather than genuinely distinguishing content — "Volume 2", "Christmas(time)",
// "Remixed" appear across thousands of unrelated releases by different
// artists, so sharing only these words is not real evidence of a match.
// Discovered as a genuine false-positive source during testing 2026-07-11:
// without this list, the fuzzy matcher accepted "The Blues Volume 2" against
// an unrelated Chuck Jackson compilation (shared "blues"/"volume"), "The
// Swingle Singers — Christmastime" against a completely unrelated Trisha
// Yearwood Christmas track (shared only "christmastime"), and "Verve //
// Remixed" against an unrelated "Velvet Dreamer" remix single (shared only
// "remix"/"remixed"). These words are excluded from the SIGNIFICANT-token
// set used for fuzzy scoring only — they still count normally for the exact/
// substring containment check, which is inherently safer.
var GENERIC_COMPILATION_WORDS = new Set([
  "volume", "vol", "christmas", "christmastime", "xmas", "remix", "remixed",
  "remixes", "blues", "jazz", "best", "greatest", "hits", "collection",
  "anthology", "classics", "various", "mix", "mixes", "compilation",
  // Added 2026-07-11 alongside the artist-corroboration fix below — common,
  // meaning-neutral reissue/box-set wrapper words in classical/reissue
  // catalog titles ("Beethoven: COMPLETE Piano Sonatas", "Moon Safari
  // DELUXE EDITION"). Needed so a genuine reissue title isn't treated as
  // needing extra corroboration just for carrying one of these words.
  "complete", "original", "deluxe", "edition", "remaster", "remastered",
  "expanded", "anniversary", "definitive",
]);

function significantTokens(s, opts) {
  var stripGeneric = opts && opts.stripGeneric;
  return normalizeTitle(s).split(" ").filter(function (w) {
    if (w.length === 0 || TITLE_STOPWORDS.has(w)) return false;
    if (stripGeneric && GENERIC_COMPILATION_WORDS.has(w)) return false;
    return true;
  });
}

// Distinct 4-digit numbers 1500-2099 in a string — used to catch "same
// wording, different specific recording" cases (e.g. two different live
// concerts by the same artist with near-identical titles but different
// years). If both titles carry a year and none match, treat as different
// recordings regardless of how similar the rest of the wording is.
// Whole-word substring containment — NOT the same as raw String#includes.
// Bug found live 2026-07-11: with plain `.includes()`, a short title like
// Led Zeppelin's "IV" matched "Live EP" (an unrelated 2025 live compilation)
// because the LETTERS "iv" appear inside the letters of "Live" — nothing to
// do with the word "IV" as a title. Pass (b) (artist-catalog walk) is scoped
// to the correct artist, but artist-scoping alone doesn't stop a 2-letter
// title from accidentally appearing as a letter-substring of some unrelated
// album by that same artist ("Live", "Arrival", "Drive", etc. all contain
// "iv"). Confirmed: Led Zeppelin's real Deezer catalog has "Led Zeppelin IV
// (Deluxe Edition)" and "Led Zeppelin IV (Remaster)", both of which contain
// "iv" as a genuine standalone WORD — this function matches those correctly
// while rejecting "Live EP", which does not.
function containsWholeWords(haystack, needle) {
  if (!haystack || !needle) return false;
  return (" " + haystack + " ").indexOf(" " + needle + " ") !== -1;
}

function yearsIn(s) {
  var matches = String(s || "").match(/\b(1[5-9]\d\d|20\d\d)\b/g) || [];
  return new Set(matches);
}

function yearsConflict(a, b) {
  var ya = yearsIn(a), yb = yearsIn(b);
  if (!ya.size || !yb.size) return false;
  for (var y of ya) if (yb.has(y)) return false;
  return true;
}

// Fuzzy fallback for real matches whose titles diverge more than simple
// substring containment allows — e.g. a compilation packaged with a
// different pairing piece ("Mozart: Requiem; 'Coronation Mass'" vs our
// "Mozart: Requiem in D Minor K626"), or a title with words reordered/added
// on both sides ("Junjo Presents: The Evil Curse Of The Vampires" vs our
// "Rids the World of the Evil Curse of the Vampires"). Confirmed live
// 2026-07-11 against Deezer's real catalog for both examples above.
// Deliberately conservative: requires at least 2 shared significant words
// (with generic compilation filler like "volume"/"christmas"/"remixed", AND
// the artist's own name if provided, excluded from counting — see
// GENERIC_COMPILATION_WORDS and the artist-stripping below) AND at least
// half of the shorter title's significant words to overlap, AND rejects
// outright if both titles name different specific years (guards against
// matching a different concert/performance that happens to share most of
// its wording — confirmed necessary via a real near-miss: a 1966 Horowitz
// Carnegie Hall recital vs. our catalog's 1967-1968 one).
//
// The `artist` param exists because an artist's own name is often baked
// into a compilation's title on one or both sides (e.g. "Maria Callas -
// Cinema" vs our "The Incomparable Maria Callas") — if the ONLY overlapping
// words are the artist's own name repeated on both sides, that's circular:
// of course a compilation of an artist's work mentions that artist, and it
// says nothing about whether the CONTENT matches. Confirmed as a real false
// positive 2026-07-11 without this check: an unrelated Bellini opera excerpt
// matched purely because both titles contained "Maria Callas". At least one
// overlapping word must be something OTHER than the artist's own name — this
// still lets the artist's name count toward the raw overlap number (needed
// for real matches like Horowitz's 1967 recital, where "Horowitz" + the
// shared year "1967" together clear the bar), it just can't be the *only*
// evidence.
function fuzzyTitlesMatch(a, b, artist) {
  if (yearsConflict(a, b)) return false;
  var ta = significantTokens(a, { stripGeneric: true });
  var tb = significantTokens(b, { stripGeneric: true });
  if (!ta.length || !tb.length) return false;
  var setA = new Set(ta), setB = new Set(tb);
  var overlapTokens = [];
  setA.forEach(function (t) { if (setB.has(t)) overlapTokens.push(t); });
  var overlap = overlapTokens.length;
  var minSize = Math.min(setA.size, setB.size);
  var ratio = overlap / minSize;
  if (!(overlap >= 2 && ratio >= 0.5)) return false;

  if (artist) {
    var artistTokens = new Set(significantTokens(artist, { stripGeneric: true }));
    var hasNonArtistOverlap = overlapTokens.some(function (t) { return !artistTokens.has(t); });
    if (!hasNonArtistOverlap) return false;
  }

  return true;
}

// Whether a title carries enough distinctive content to trust on its OWN,
// with no artist scoping to back it up — a short/generic title like
// "Christmastime" or "IV" is a substring of dozens of unrelated releases by
// construction. NOT applied universally: passes that are structurally
// scoped to a specific, confirmed artist (walking that artist's own Deezer
// catalog) don't need this — a short title like Led Zeppelin's "IV" is
// perfectly safe there because the scoping itself is the corroboration.
// Only the free-text pass, whose final candidate filter never actually
// checks the returned track's artist for generic/short titles, needs this
// extra gate — applied inline in tryDeezerFreeText below.
function isSpecificEnoughForContainment(title) {
  return significantTokens(title, { stripGeneric: true }).length >= 2;
}

// Scoped to titles that are otherwise near-identical once a leading/embedded
// "live" qualifier is set aside — a common live-album naming variance across
// reissues, not a general loosening of the match. Confirmed live 2026-07-11:
// Oscar Peterson's "Live in Russia" only exists on Deezer as "Oscar Peterson
// In Russia" — dropping "live" turns it into a clean substring match.
function titlesMatchIgnoringLive(a, b) {
  var na = normalizeTitle(a).replace(/\blive\b/g, "").replace(/\s+/g, " ").trim();
  var nb = normalizeTitle(b).replace(/\blive\b/g, "").replace(/\s+/g, " ").trim();
  if (!na || !nb) return false;
  return na === nb || containsWholeWords(na, nb) || containsWholeWords(nb, na);
}

function titlesMatch(a, b, artist) {
  const na = normalizeTitle(a);
  const nb = normalizeTitle(b);
  if (!na || !nb) return false;
  if (na === nb || containsWholeWords(na, nb) || containsWholeWords(nb, na)) return true;
  if (fuzzyTitlesMatch(a, b, artist)) return true;
  return titlesMatchIgnoringLive(a, b);
}

// Stricter variant with NO loose substring-containment shortcut — only exact
// (normalized) equality or the guarded fuzzy overlap match. Used wherever a
// match can't be corroborated by a real, specific artist identity (a
// title-only search, or an artist field that's itself a meaningless
// placeholder like "Various Artists"). Containment is unsafe in those cases:
// confirmed live 2026-07-11 that "Spotlights The Blues Volume 2" (an
// unrelated compilation, one of literally hundreds credited to Deezer's
// generic "Various Artists" profile) contains our title "The Blues Volume 2"
// as a trailing substring — a real false-positive path that has nothing to
// do with fuzzy-matching generic words, so the fix belongs here.
function titlesMatchStrict(a, b) {
  const na = normalizeTitle(a);
  const nb = normalizeTitle(b);
  if (!na || !nb) return false;
  if (na === nb) return true;
  return fuzzyTitlesMatch(a, b);
}

// Deezer (and most catalogs) file countless unrelated compilations under a
// generic "Various Artists" credit — it carries no real identity, so neither
// an artist-scoped search nor loose title-containment against it is a
// trustworthy signal. Records stored with this kind of placeholder artist
// need the strict matcher and skip the artist-scoped Deezer passes entirely
// (see tryDeezer).
function isGenericArtist(artist) {
  const n = normalizeTitle(artist);
  return n === "various" || n === "various artists" || n === "va" || n === "v a";
}

// True if a track's own credited artist plausibly IS our stored artist (loose
// word-token overlap, not exact string equality — handles "Bob Marley" vs.
// "Bob Marley & The Wailers", "The Modern Jazz Quartet" vs. itself, etc.).
// Added after a real false positive found live 2026-07-11: Air's "Moon
// Safari" free-text search surfaced "Sexy Boy (Vegyn Version)" — a remix
// COVER by a completely different artist ("Vegyn"), filed on an album titled
// "Blue Moon Safari" that happens to contain our title "Moon Safari" as a
// genuine whole-word phrase (so the word-boundary containment fix alone
// didn't catch it). The free-text pass (a) never checked WHO actually
// performs the candidate track, only the album title — this closes that gap.
// The real, correct match ("Sexy Boy" by Air, from the actual 1998 "Moon
// Safari" album) was independently confirmed present via pass (c) and now
// wins instead once pass (a)/(b) correctly reject the Vegyn remix.
function artistsOverlap(trackArtist, ourArtist) {
  if (!trackArtist || !ourArtist) return false;
  var a = significantTokens(trackArtist, { stripGeneric: true });
  var b = significantTokens(ourArtist, { stripGeneric: true });
  if (!a.length || !b.length) return false;
  var setB = new Set(b);
  return a.some(function (t) { return setB.has(t); });
}

// Whether the extra words a longer title carries beyond a shorter, wholly-
// contained title are "safe" wrapper words — the artist's own name/composer
// prefix (a real, common classical-catalog convention: "Beethoven: Complete
// Piano Sonatas" for our "Piano Sonatas"), or generic reissue filler
// ("Complete", "Deluxe Edition"). If ALL the extra words fall into one of
// those buckets, the containment match needs no further corroboration. If
// even one extra word is something else entirely unrelated to our artist or
// generic reissue language — e.g. "Blue" in "Blue Moon Safari" for our "Moon
// Safari" — that's a real, unrelated title (a different release, often by a
// different artist entirely) that happens to contain our words, and needs
// the caller to separately confirm the actual track's credited artist.
function extraWordsAreBenign(longer, shorter, artist) {
  var longerWords = longer.split(" ").filter(Boolean);
  var shorterWords = new Set(shorter.split(" ").filter(Boolean));
  var artistTokens = new Set(significantTokens(artist || "", { stripGeneric: true }));
  var extra = longerWords.filter(function (w) { return !shorterWords.has(w); });
  return extra.every(function (w) {
    return TITLE_STOPWORDS.has(w) || GENERIC_COMPILATION_WORDS.has(w) || artistTokens.has(w);
  });
}

// Used ONLY by the artist-scoped Deezer passes (a: free-text, b: artist-
// catalog walk) — both start from OUR stored artist name, which makes a
// title match feel automatically trustworthy, but Deezer sometimes files an
// unrelated tribute/remix/cover release (by a DIFFERENT artist) as an
// "appears on" credit within our artist's own discography, or a free-text
// query surfaces someone else's cover under a similarly-worded album. A
// same-artist album match this direct+immediate (exact title, or containment
// where the only extra words are the artist's own name / generic reissue
// filler) is trusted outright. A containment match with unexplained extra
// words, or the fuzzy/live-strip fallback paths, additionally requires the
// CANDIDATE TRACK's own credited artist to plausibly correspond to our
// stored artist — confirmed necessary live 2026-07-11: without this, Air's
// "Moon Safari" matched a Vegyn remix filed under "Blue Moon Safari" (an
// unrelated tribute compilation that happens to contain "Moon Safari" as a
// real phrase, appearing in Air's own Deezer discography listing).
function titlesMatchCorroborated(a, b, artist, trackArtist) {
  var na = normalizeTitle(a);
  var nb = normalizeTitle(b);
  if (!na || !nb) return false;
  if (na === nb) return true;

  if (containsWholeWords(na, nb) || containsWholeWords(nb, na)) {
    var longer = na.length >= nb.length ? na : nb;
    var shorter = na.length >= nb.length ? nb : na;
    if (extraWordsAreBenign(longer, shorter, artist)) return true;
    return artistsOverlap(trackArtist, artist);
  }

  if (fuzzyTitlesMatch(a, b, artist)) return true;

  var la = na.replace(/\blive\b/g, "").replace(/\s+/g, " ").trim();
  var lb = nb.replace(/\blive\b/g, "").replace(/\s+/g, " ").trim();
  if (la && lb) {
    if (la === lb) return true;
    if (containsWholeWords(la, lb) || containsWholeWords(lb, la)) {
      var longerL = la.length >= lb.length ? la : lb;
      var shorterL = la.length >= lb.length ? lb : la;
      if (extraWordsAreBenign(longerL, shorterL, artist)) return true;
      return artistsOverlap(trackArtist, artist);
    }
  }

  return false;
}

// ---------------------------------------------------------------------------
// Tier 1: Deezer — no auth required. Three-pass lookup (see the header
// comment above for the full description of each pass).
// ---------------------------------------------------------------------------

// Pass (a): fast free-text track search. NOT field-filtered (artist:""
// album:"") — empirically much more forgiving of naming differences between
// our vinyl-edition titles and Deezer's digital catalog titles. But its
// relevance ranking sometimes buries a real match under more "popular"
// generic tracks that also contain the query words — see pass (b).
//
// "Most popular track" guarantee (added 2026-07-12): this pass's job is only
// to find the CORRECT ALBUM quickly — once found, it fetches that album's
// complete tracklist and picks the true highest-`rank` track with a preview,
// the same authoritative method passes (b)/(c) already use, rather than
// trusting whichever individual tracks happened to surface in the free-text
// results. Spot-checked live against 5 real multi-track albums before this
// change (Madonna, Buena Vista Social Club, Crosby Stills & Nash, Fleetwood
// Mac's "Rumours") and the free-text result already happened to match the
// album's true top-rank track in all 5 — but that was incidental (free-text
// search returning the album's full tracklist by chance), not guaranteed,
// since the search is relevance- not completeness-ranked. This closes that
// gap for good rather than relying on it happening to work out.
async function tryDeezerFreeText(artist, title) {
  const q = new URLSearchParams();
  q.set("q", artist + " " + title);
  q.set("limit", "50");

  const res = await fetch("https://api.deezer.com/search?" + q.toString());
  if (!res.ok) throw new Error("Deezer search returned HTTP " + res.status);
  const data = await res.json();
  const items = Array.isArray(data && data.data) ? data.data : [];

  const matches = items.filter(function (t) {
    if (!t || !t.album || !t.artist) return false;
    if (!isSpecificEnoughForContainment(title)) {
      return normalizeTitle(t.album.title) === normalizeTitle(title);
    }
    return titlesMatchCorroborated(t.album.title, title, artist, t.artist.name);
  });
  if (!matches.length) return null;

  matches.sort(function (a, b) { return (b.rank || 0) - (a.rank || 0); });
  const best = matches[0];

  // Now that we know WHICH album is correct, fetch its real, complete
  // tracklist and pick the genuinely most popular (highest-rank) track that
  // has a preview — falls back to the free-text hit itself if that lookup
  // fails or the album has no track with a preview at all.
  if (best.album && best.album.id) {
    try {
      const tracksRes = await fetch("https://api.deezer.com/album/" + best.album.id + "/tracks");
      if (tracksRes.ok) {
        const tracksData = await tracksRes.json();
        const tracks = Array.isArray(tracksData && tracksData.data) ? tracksData.data : [];
        const withPreview = tracks.filter(function (t) { return t && t.preview; });
        if (withPreview.length) {
          withPreview.sort(function (a, b) { return (b.rank || 0) - (a.rank || 0); });
          const topTrack = withPreview[0];
          return {
            provider: "deezer",
            name: topTrack.title || null,
            artists: (topTrack.artist && topTrack.artist.name) || (best.artist && best.artist.name) || null,
            preview_url: topTrack.preview || null,
            external_url: topTrack.link || null,
            popularity: (typeof topTrack.rank === "number") ? topTrack.rank : null,
          };
        }
      }
    } catch (e) {
      // fall through to the free-text hit below — never let this extra
      // lookup turn a working match into a failure.
    }
  }

  return {
    provider: "deezer",
    name: best.title || null,
    artists: (best.artist && best.artist.name) || null,
    preview_url: best.preview || null,
    external_url: best.link || null,
    popularity: (typeof best.rank === "number") ? best.rank : null,
  };
}

// Pass (b): walk the actual artist catalog instead of trusting free-text
// relevance ranking. Slower (several sequential requests) but recovers real
// matches that pass (a) misses — confirmed live 2026-07-11 for The Cure's
// "The Head on the Door" and "Japanese Whispers", both genuinely on Deezer
// but never surfaced by /search for those queries.
async function tryDeezerByArtistCatalog(artist, title) {
  const artistSearch = new URLSearchParams();
  artistSearch.set("q", artist);
  artistSearch.set("limit", "5");
  const artistRes = await fetch("https://api.deezer.com/search/artist?" + artistSearch.toString());
  if (!artistRes.ok) throw new Error("Deezer artist search returned HTTP " + artistRes.status);
  const artistData = await artistRes.json();
  const candidates = Array.isArray(artistData && artistData.data) ? artistData.data : [];

  for (const candidate of candidates) {
    if (!candidate || !candidate.id) continue;

    // Fetch the artist's album list, following pagination up to ~200 albums
    // (enough for even quite prolific catalogs; caps total requests per
    // candidate at 2).
    let albums = [];
    let next = "https://api.deezer.com/artist/" + candidate.id + "/albums?limit=100";
    let pages = 0;
    while (next && pages < 2) {
      const albumsRes = await fetch(next);
      if (!albumsRes.ok) break;
      const albumsData = await albumsRes.json();
      albums = albums.concat(Array.isArray(albumsData && albumsData.data) ? albumsData.data : []);
      next = albumsData && albumsData.next ? albumsData.next : null;
      pages++;
    }

    // Consider EVERY album in this candidate's catalog whose title matches —
    // not just the first — because a matching title can belong to a
    // mislabeled compilation that happens to appear in this artist's own
    // Deezer discography (see artistsOverlap comment above: Air's real
    // catalog listing includes "Blue Moon Safari", a Vegyn remix tribute
    // album, alongside the real 1998 "Moon Safari"). If the first
    // title-matching album turns out to have no track actually credited to
    // this artist, fall through to the next matching album rather than
    // giving up on this candidate entirely.
    const albumMatches = albums.filter(function (a) { return a && titlesMatch(a.title, title, artist); });

    for (const albumMatch of albumMatches) {
      // Determine whether THIS album's title needs per-track artist
      // corroboration before trusting any of its tracks (see
      // titlesMatchCorroborated above) — computed once per album, since it
      // depends only on the album title vs. our stored title, not the track.
      const na = normalizeTitle(albumMatch.title);
      const nb = normalizeTitle(title);
      let needsCorroboration = na !== nb;
      if (needsCorroboration && (containsWholeWords(na, nb) || containsWholeWords(nb, na))) {
        const longer = na.length >= nb.length ? na : nb;
        const shorter = na.length >= nb.length ? nb : na;
        needsCorroboration = !extraWordsAreBenign(longer, shorter, artist);
      }

      const tracksRes = await fetch("https://api.deezer.com/album/" + albumMatch.id + "/tracks");
      if (!tracksRes.ok) continue;
      const tracksData = await tracksRes.json();
      const tracks = Array.isArray(tracksData && tracksData.data) ? tracksData.data : [];
      const withPreview = tracks.filter(function (t) {
        if (!t || !t.preview) return false;
        if (!needsCorroboration) return true;
        return t.artist && artistsOverlap(t.artist.name, artist);
      });
      if (!withPreview.length) continue;

      withPreview.sort(function (a, b) { return (b.rank || 0) - (a.rank || 0); });
      const best = withPreview[0];

      return {
        provider: "deezer",
        name: best.title || null,
        artists: (best.artist && best.artist.name) || candidate.name || null,
        preview_url: best.preview || null,
        external_url: best.link || null,
        popularity: (typeof best.rank === "number") ? best.rank : null,
      };
    }
  }

  return null;
}

// Pass (c): search Deezer's album index by TITLE ONLY, ignoring our stored
// artist name entirely. Exists for a specific, confirmed real-world case:
// vinyl-era reggae/dub albums are often catalogued (correctly, by Deezer)
// under a producer or backing-band credit rather than the name printed on
// our sleeve — e.g. our "Errol Brown & The Revolutionaries" (the mixing
// engineer credited alongside the band) is on Deezer as just "The
// Revolutionaries"; our "The Scientist" (mixing-engineer credit) is on
// Deezer as "Roots Radics" under a "Junjo Presents:" producer-credited title.
// Pass (a)/(b) can never find these because they both start from OUR artist
// name. Confirmed live 2026-07-11 for both examples above. Uses
// titlesMatchStrict — exact equality or the guarded fuzzy overlap, but NOT
// loose substring containment — since a title-only search has no artist to
// corroborate a match with, and containment alone is too easy to satisfy by
// coincidence (a real false positive found live: "Spotlights The Blues
// Volume 2" contains our title "The Blues Volume 2" as a trailing
// substring, despite being a completely unrelated compilation).
//
// Extra guard specific to this pass: refuses to run at all when our title,
// after stripping stopwords and generic compilation filler, has fewer than 2
// distinctive words left. Passes (a)/(b) are safe with a generic title
// ("Christmastime", "The Blues Volume 2") because they're scoped to a
// specific artist's own catalog first — but with no artist anchor at all,
// a generic title WILL exact-match some other, unrelated artist's release
// with the same generic name. Confirmed as real false positives 2026-07-11:
// without this guard, "The Swingle Singers — Christmastime" matched an
// unrelated Trisha Yearwood Christmas track, and "Various — Verve //
// Remixed" matched an unrelated "Velvet Dreamer" remix single — both purely
// because the titles were too generic to mean anything without an artist.
// `artist` (reworked v12 — previously `corroborationArtist`, only supplied
// when Spotify had independently confirmed the match; Spotify is gone now,
// so this is always our own stored artist when one exists). Rather than
// taking only the FIRST title-matching album Deezer returns, this now
// considers every candidate album, prefers whichever one's credited artist
// plausibly overlaps ours, and corroborates again at the track level within
// whichever album it settles on. An uncorroborated album/track is only
// trusted when it's the SOLE candidate — that's what preserves the two
// legitimate producer/backing-band-credit cases (Errol Brown & The
// Revolutionaries -> Deezer's "The Revolutionaries"; The Scientist ->
// Deezer's "Roots Radics") where our own stored artist name deliberately
// doesn't match Deezer's credit and there's no alternative release to prefer
// instead. When multiple candidates exist and NONE corroborate, keeps
// searching rather than guessing — this is exactly the mechanism that fixed
// the real Sidney Bechet/Cyrille Aimée wrong-artist bug (v11) without
// needing Spotify at all (v12). Still returns a best-guess match (with
// preview_url:null) even when no candidate has a playable clip, so the
// "matched but no preview" attribution UX doesn't regress. The generic-
// artist ("Various Artists") entry point passes `artist` as null, since
// there's no real identity to corroborate against there.
async function tryDeezerByAlbumTitleSearch(title, artist) {
  const distinctiveWords = significantTokens(title, { stripGeneric: true });
  if (distinctiveWords.length < 2) return null;

  const q = new URLSearchParams();
  q.set("q", title);
  q.set("limit", "25");

  const res = await fetch("https://api.deezer.com/search/album?" + q.toString());
  if (!res.ok) throw new Error("Deezer album search returned HTTP " + res.status);
  const data = await res.json();
  const albums = Array.isArray(data && data.data) ? data.data : [];

  const albumMatches = albums.filter(function (a) { return a && titlesMatchStrict(a.title, title); });
  if (!albumMatches.length) return null;

  // When more than one release shares this title, try the artist-overlapping
  // candidate(s) first.
  let ordered = albumMatches;
  if (albumMatches.length > 1 && artist) {
    const overlapping = albumMatches.filter(function (a) {
      return artistsOverlap((a.artist && a.artist.name) || "", artist);
    });
    if (overlapping.length) {
      const rest = albumMatches.filter(function (a) { return overlapping.indexOf(a) === -1; });
      ordered = overlapping.concat(rest);
    }
  }

  let bestGuess = null; // best plausible match found so far, even with no preview
  for (const albumMatch of ordered) {
    const tracksRes = await fetch("https://api.deezer.com/album/" + albumMatch.id + "/tracks");
    if (!tracksRes.ok) continue;
    const tracksData = await tracksRes.json();
    const tracks = Array.isArray(tracksData && tracksData.data) ? tracksData.data : [];
    if (!tracks.length) continue;

    let pool = tracks;
    if (artist) {
      const corroborated = tracks.filter(function (t) {
        const credited = (t.artist && t.artist.name) || (albumMatch.artist && albumMatch.artist.name) || "";
        return artistsOverlap(credited, artist);
      });
      if (corroborated.length) {
        pool = corroborated;
      } else if (ordered.length > 1) {
        continue; // an alternative candidate exists — don't guess wrong here
      }
      // else: sole candidate, no corroborated track — fall through and trust
      // it uncorroborated (preserves the producer/backing-band-credit cases).
    }

    const withPreview = pool.filter(function (t) { return t && t.preview; });
    const rankedPool = (withPreview.length ? withPreview : pool)
      .slice()
      .sort(function (a, b) { return (b.rank || 0) - (a.rank || 0); });
    const best = rankedPool[0];
    if (!best) continue;

    const match = {
      provider: "deezer",
      name: best.title || null,
      artists: (best.artist && best.artist.name) || (albumMatch.artist && albumMatch.artist.name) || null,
      preview_url: best.preview || null,
      external_url: best.link || null,
      popularity: (typeof best.rank === "number") ? best.rank : null,
    };

    if (match.preview_url) return match;
    if (!bestGuess) bestGuess = match;
  }

  return bestGuess;
}

async function tryDeezer(artist, title) {
  // "Various Artists"-style placeholders carry no real identity to
  // corroborate a match against — pass (a)'s free-text filter and pass (b)'s
  // artist-catalog walk both ultimately rely on titlesMatch's loose
  // substring containment against an uncorroborated candidate pool, which
  // is unsafe when there's no genuine artist behind the query. Skip both
  // and go straight to the specificity-gated, strictly-matched title-only
  // search instead. Never corroborated against "Various Artists" itself —
  // that string carries no real identity to check against.
  if (isGenericArtist(artist)) {
    return await tryDeezerByAlbumTitleSearch(title, null);
  }

  const freeText = await tryDeezerFreeText(artist, title);
  if (freeText && freeText.preview_url) return freeText;

  const byCatalog = await tryDeezerByArtistCatalog(artist, title);
  if (byCatalog && byCatalog.preview_url) return byCatalog;

  const byAlbumTitle = await tryDeezerByAlbumTitleSearch(title, artist);
  if (byAlbumTitle && byAlbumTitle.preview_url) return byAlbumTitle;

  return freeText || byCatalog || byAlbumTitle || null;
}

// ---------------------------------------------------------------------------
// Tier 2: YouTube Data API v3 — LAST RESORT, only reached if Deezer misses
// entirely. Added 2026-07-12 to cover the 7 records confirmed
// genuinely absent from every other provider (Maria Callas, Duke Ellington's
// "Ellington '65", Rob Garza's "The Dust Ups", two "Various Artists"
// compilations, The Swingle Singers' "Christmastime", The Cure's "Standing
// on a Beach") — each independently checked to actually exist on YouTube.
//
// Requires a free YOUTUBE_API_KEY (Google Cloud Console, YouTube Data API v3
// enabled, API key only — no OAuth). Not configured degrades to "not
// attempted", same graceful pattern as Spotify.
//
// Unlike the other three tiers, YouTube's API never returns a direct audio
// file URL — there is no `preview_url` here. Instead this returns an
// `embed_url` (a YouTube iframe embed with `start`/`end` params) that the
// frontend renders in place of the native <audio> element. The clip is
// capped at 30 seconds — the same convention as Spotify/Deezer/iTunes'
// native preview clips — via the embed's own start/end params, which
// actually stop playback at that point (not just a UI suggestion).
//
// Two-step lookup: (1) search.list for candidate videos — TWO parallel
// searches, one Google's default relevance order and one order=viewCount,
// merged and deduped by video id — filtered to ones whose video title
// contains at least one token of our artist AND at least one token of our
// title (YouTube's own relevance ranking is noisy — an unfiltered top result
// is frequently a cover, reaction video, or unrelated same-named track). The
// second, viewCount-ordered search exists because relevance-only search can
// under-rank the objectively most-popular upload of a track relative to
// newer or more keyword-stuffed videos; merging both pools before scoring
// gives the "most popular track" guarantee real teeth instead of trusting
// whatever the first 10 relevance hits happened to include. (2) videos.list
// for view counts + durations on the merged candidates, picking the
// highest-viewed one within a plausible single-track duration window
// (30s–12min — excludes full-album uploads, DJ sets, and bootleg concert
// videos, which are common false "matches" for an album title search on
// YouTube specifically).
async function tryYouTube(artist, title, debugInfo) {
  const apiKey = process.env.YOUTUBE_API_KEY;
  if (!apiKey) {
    if (debugInfo) debugInfo.configured = false;
    return null;
  }
  if (debugInfo) debugInfo.configured = true;

  try {
    function buildSearchParams(order) {
      const p = new URLSearchParams();
      p.set("part", "snippet");
      p.set("q", artist + " " + title);
      p.set("type", "video");
      p.set("videoEmbeddable", "true");
      p.set("maxResults", "25");
      if (order) p.set("order", order);
      p.set("key", apiKey);
      return p;
    }

    const [relevanceRes, viewCountRes] = await Promise.all([
      fetch("https://www.googleapis.com/youtube/v3/search?" + buildSearchParams(null).toString()),
      fetch("https://www.googleapis.com/youtube/v3/search?" + buildSearchParams("viewCount").toString()),
    ]);
    if (!relevanceRes.ok) throw new Error("YouTube search returned HTTP " + relevanceRes.status);
    const relevanceData = await relevanceRes.json();
    const relevanceItems = Array.isArray(relevanceData.items) ? relevanceData.items : [];
    let viewCountItems = [];
    if (viewCountRes.ok) {
      const viewCountData = await viewCountRes.json();
      viewCountItems = Array.isArray(viewCountData.items) ? viewCountData.items : [];
    }

    const seen = new Set();
    const items = [];
    relevanceItems.concat(viewCountItems).forEach(function (it) {
      const id = it && it.id && it.id.videoId;
      if (!id || seen.has(id)) return;
      seen.add(id);
      items.push(it);
    });
    if (debugInfo) debugInfo.searchResultCount = items.length;
    if (!items.length) return null;

    const artistTokens = new Set(significantTokens(artist, { stripGeneric: true }));
    const titleTokens = new Set(significantTokens(title, { stripGeneric: true }));
    const candidates = items.filter(function (it) {
      if (!it || !it.id || !it.id.videoId || !it.snippet) return false;
      const vSet = new Set(significantTokens(it.snippet.title, { stripGeneric: true }));
      const hasArtist = artistTokens.size === 0 || Array.from(artistTokens).some(function (t) { return vSet.has(t); });
      const hasTitle = titleTokens.size === 0 || Array.from(titleTokens).some(function (t) { return vSet.has(t); });
      return hasArtist && hasTitle;
    });
    if (debugInfo) debugInfo.candidateCount = candidates.length;
    if (!candidates.length) return null;

    const ids = candidates.map(function (c) { return c.id.videoId; }).join(",");
    const detailsParams = new URLSearchParams();
    detailsParams.set("part", "statistics,contentDetails");
    detailsParams.set("id", ids);
    detailsParams.set("key", apiKey);
    const detailsRes = await fetch("https://www.googleapis.com/youtube/v3/videos?" + detailsParams.toString());
    if (!detailsRes.ok) throw new Error("YouTube videos returned HTTP " + detailsRes.status);
    const detailsData = await detailsRes.json();
    const detailsById = {};
    (detailsData.items || []).forEach(function (d) { detailsById[d.id] = d; });

    function parseDurationSeconds(iso) {
      const m = /^PT(?:(\d+)H)?(?:(\d+)M)?(?:(\d+)S)?$/.exec(iso || "");
      if (!m) return null;
      const h = parseInt(m[1] || "0", 10), mi = parseInt(m[2] || "0", 10), s = parseInt(m[3] || "0", 10);
      return h * 3600 + mi * 60 + s;
    }

    const scored = candidates.map(function (c) {
      const d = detailsById[c.id.videoId];
      const duration = d ? parseDurationSeconds(d.contentDetails && d.contentDetails.duration) : null;
      const views = (d && d.statistics && d.statistics.viewCount) ? parseInt(d.statistics.viewCount, 10) : 0;
      return { candidate: c, duration: duration, views: views };
    }).filter(function (s) {
      // Exclude anything that can't plausibly be a single track: too short
      // to even hold a 30s clip, or long enough to be a full album/DJ set/
      // bootleg rather than one song.
      return s.duration === null || (s.duration >= 30 && s.duration <= 720);
    });
    if (debugInfo) debugInfo.scoredCount = scored.length;
    if (!scored.length) return null;

    scored.sort(function (a, b) { return b.views - a.views; });
    const best = scored[0];
    const videoId = best.candidate.id.videoId;
    const snippet = best.candidate.snippet;

    const clipStart = 0;
    const clipEnd = clipStart + 30;

    return {
      provider: "youtube",
      name: snippet.title || null,
      artists: snippet.channelTitle || null,
      preview_url: null,
      embed_url: "https://www.youtube.com/embed/" + videoId
        + "?start=" + clipStart + "&end=" + clipEnd
        + "&autoplay=1&modestbranding=1&rel=0",
      external_url: "https://www.youtube.com/watch?v=" + videoId,
      popularity: best.views,
    };
  } catch (e) {
    if (debugInfo) debugInfo.error = e.message;
    return null; // best-effort, last-resort tier — never throw
  }
}

// ---------------------------------------------------------------------------

export default async (req) => {
  if (req.method !== "GET") {
    return json({ error: "Method not allowed — preview is read-only" }, 405);
  }

  const url = new URL(req.url);
  const artist = (url.searchParams.get("artist") || "").trim();
  const title = (url.searchParams.get("title") || "").trim();
  if (!artist || !title) {
    return json({ error: "Provide both artist and title" }, 400);
  }

  // Temporary diagnostic mode (?debug=1): surfaces per-tier raw results and
  // errors in the response so matching-logic bugs can be told apart from
  // genuine catalog absence without needing server log access. Read-only,
  // adds a `_debug` key to the normal response, changes no behavior.
  const debugMode = url.searchParams.get("debug") === "1";
  const debug = debugMode ? { deezerFreeText: {}, deezerCatalog: {}, deezerAlbumTitle: {}, youtube: {} } : null;

  // Tier 1: Deezer — the sole preview source as of v12 (see header comment).
  // Artist corroboration for pass (c) now happens entirely within Deezer's
  // own data (see tryDeezerByAlbumTitleSearch) — no Spotify signal needed.
  let deezerTrack = null;
  try {
    if (debug) {
      const freeText = await tryDeezerFreeText(artist, title);
      debug.deezerFreeText = { track: freeText };
      const byCatalog = await tryDeezerByArtistCatalog(artist, title);
      debug.deezerCatalog = { track: byCatalog };
      const byAlbumTitle = await tryDeezerByAlbumTitleSearch(title, isGenericArtist(artist) ? null : artist);
      debug.deezerAlbumTitle = { track: byAlbumTitle };
      deezerTrack = (freeText && freeText.preview_url) ? freeText
        : (byCatalog && byCatalog.preview_url) ? byCatalog
        : (byAlbumTitle && byAlbumTitle.preview_url) ? byAlbumTitle
        : (freeText || byCatalog || byAlbumTitle || null);
    } else {
      deezerTrack = await tryDeezer(artist, title);
    }
  } catch (e) {
    console.error("Deezer tier failed", e.message);
    if (debug) debug.deezerFreeText.error = e.message;
  }

  if (deezerTrack && deezerTrack.preview_url) {
    return json({ available: true, reason: null, provider: "deezer", track: deezerTrack, _debug: debug }, 200);
  }

  // Tier 2: YouTube — last resort, only reached if Deezer missed entirely.
  // No preview_url (YouTube gives no direct audio file); playable via
  // embed_url instead (see tryYouTube above).
  let youtubeTrack = null;
  try {
    youtubeTrack = await tryYouTube(artist, title, debug ? debug.youtube : null);
    if (debug) debug.youtube.track = youtubeTrack;
  } catch (e) {
    console.error("YouTube tier failed", e.message);
    if (debug) debug.youtube.error = e.message;
  }
  if (youtubeTrack && youtubeTrack.embed_url) {
    return json({ available: true, reason: null, provider: "youtube", track: youtubeTrack, _debug: debug }, 200);
  }

  // Nothing playable anywhere. Prefer whichever tier at least matched a
  // track (for the "Listen elsewhere" link) — Deezer's own best-guess match
  // (see tryDeezerByAlbumTitleSearch) covers the "matched but no preview
  // clip" attribution UX natively now that Spotify is gone.
  const bestMatchOnly = deezerTrack || youtubeTrack;
  if (bestMatchOnly) {
    return json({ available: false, reason: "no_preview", provider: bestMatchOnly.provider, track: bestMatchOnly, _debug: debug }, 200);
  }

  // Nothing matched on Deezer, AND the YouTube last-resort tier was never
  // actually attempted because YOUTUBE_API_KEY isn't set yet. That's a
  // *pending*, not a permanent, gap — once Susan sets the key this same
  // record may resolve via tier 2 (this is exactly the situation for the 6
  // records documented above, e.g. Duke Ellington's "Ellington '65"). Added
  // v10 (2026-07-13) after this surfaced as an indistinguishable "no
  // matching track found" that read like a bug rather than a known,
  // already-tracked, one-time-setup-away gap — see CLAUDE.md/PROJECT.md for
  // current key status. Distinct reason so the frontend can say so honestly.
  const youtubeConfigured = !!process.env.YOUTUBE_API_KEY;
  if (!youtubeConfigured) {
    return json({ available: false, reason: "no_match_pending_youtube", provider: null, track: null, _debug: debug }, 200);
  }

  // Both tiers genuinely tried and neither matched — a real, confirmed gap.
  return json({ available: false, reason: "no_match", provider: null, track: null, _debug: debug }, 200);
};
