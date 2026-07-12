// netlify/functions/audio-preview.mjs
// version: 3
// Phase 4 — Audio preview, multi-provider. Given an artist + album title,
// finds the most popular track on that album and returns a playable 30-second
// preview clip, trying providers in this order:
//
//   1. Spotify   — client-credentials search, ranked by `popularity`.
//                  Matches best, but Spotify has restricted `preview_url`
//                  availability for most non-extended-quota apps since late
//                  2024 — confirmed 2026-07-11 to return preview_url:null for
//                  every one of this catalog's 93 records, even top hits like
//                  "Sexy Boy" (Air) and "Dreams" (Fleetwood Mac). Kept as the
//                  first attempt because when it DOES have a preview, its
//                  match quality and popularity data are the best of the
//                  three; and because SPOTIFY_CLIENT_ID/SECRET are already
//                  configured.
//   2. Deezer    — NO auth/API key required. Three-pass lookup, each pass
//                  only run if the previous one didn't yield a preview:
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
//                  only ever fetch fresh, on tap, never cache them.
//   3. iTunes    — Apple's public Search API (itunes.apple.com/search), also
//                  no auth required. Tried last and wrapped defensively.
//                  CONFIRMED DEAD as of 2026-07-11 (not just suspected): a
//                  direct server-side request — including with a real
//                  browser User-Agent header — returns HTTP 200 but a
//                  non-JSON (HTML) body every time, meaning Apple's legacy
//                  /search endpoint now unconditionally redirects regardless
//                  of caller. The defensive content-type check correctly
//                  no-ops this rather than throwing, so it can never break
//                  anything, but it will also never contribute a match
//                  as currently implemented. Left in place (cost-free,
//                  might revive) rather than removed.
//
// Known real gaps (not bugs): after the v3 matching improvements above, 12
// of 93 catalog records still have no match on any provider — individually
// verified live against Deezer's actual catalog (not just through this
// function) to confirm genuine absence rather than a matching-logic miss.
// Mostly classical recordings under specific compilation titles that were
// never digitized (Maria Callas, Duke Ellington's "Ellington '65"), a
// handful of ultra-niche titles (Rob Garza's "The Dust Ups", The Swingle
// Singers' "Christmastime"), two "Various Artists" compilations where
// Deezer has different, unrelated releases under similar names, and The
// Cure's "Standing on a Beach" (checked its full 74-album Deezer discography
// under every plausible title including the UK "Staring at the Sea" name —
// not there). See PROJECT.md's Phase 4 section for the full per-record list.
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
// Graceful degradation: no match on any provider, or Spotify not configured,
// returns a normal 200 with available:false + a reason — never an error.
//
// Env vars expected (optional — only Spotify needs them, and only for tier 1):
//   SPOTIFY_CLIENT_ID      — Spotify app client ID (server-side only)
//   SPOTIFY_CLIENT_SECRET  — Spotify app client secret (server-side only)

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

function significantTokens(s) {
  return normalizeTitle(s).split(" ").filter(function (w) {
    return w.length > 0 && !TITLE_STOPWORDS.has(w);
  });
}

// Distinct 4-digit numbers 1500-2099 in a string — used to catch "same
// wording, different specific recording" cases (e.g. two different live
// concerts by the same artist with near-identical titles but different
// years). If both titles carry a year and none match, treat as different
// recordings regardless of how similar the rest of the wording is.
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
// AND at least half of the shorter title's significant words to overlap,
// AND rejects outright if both titles name different specific years (guards
// against matching a different concert/performance that happens to share
// most of its wording — confirmed necessary via a real near-miss: a 1966
// Horowitz Carnegie Hall recital vs. our catalog's 1967-1968 one).
function fuzzyTitlesMatch(a, b) {
  if (yearsConflict(a, b)) return false;
  var ta = significantTokens(a);
  var tb = significantTokens(b);
  if (!ta.length || !tb.length) return false;
  var setA = new Set(ta), setB = new Set(tb);
  var overlap = 0;
  setA.forEach(function (t) { if (setB.has(t)) overlap++; });
  var minSize = Math.min(setA.size, setB.size);
  var ratio = overlap / minSize;
  return overlap >= 2 && ratio >= 0.5;
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
  return na === nb || na.includes(nb) || nb.includes(na);
}

function titlesMatch(a, b) {
  const na = normalizeTitle(a);
  const nb = normalizeTitle(b);
  if (!na || !nb) return false;
  if (na === nb || na.includes(nb) || nb.includes(na)) return true;
  if (fuzzyTitlesMatch(a, b)) return true;
  return titlesMatchIgnoringLive(a, b);
}

// ---------------------------------------------------------------------------
// Tier 1: Spotify
// ---------------------------------------------------------------------------

let cachedSpotifyToken = null;
let cachedSpotifyTokenExpiresAt = 0;

async function getSpotifyToken(clientId, clientSecret) {
  const now = Date.now();
  if (cachedSpotifyToken && now < cachedSpotifyTokenExpiresAt) return cachedSpotifyToken;

  const basic = Buffer.from(clientId + ":" + clientSecret).toString("base64");
  const res = await fetch("https://accounts.spotify.com/api/token", {
    method: "POST",
    headers: {
      "Authorization": "Basic " + basic,
      "Content-Type": "application/x-www-form-urlencoded",
    },
    body: "grant_type=client_credentials",
  });
  if (!res.ok) throw new Error("Spotify auth returned HTTP " + res.status);
  const data = await res.json();
  cachedSpotifyToken = data.access_token;
  cachedSpotifyTokenExpiresAt = now + Math.max(0, (data.expires_in || 3600) - 60) * 1000;
  return cachedSpotifyToken;
}

async function trySpotify(artist, title) {
  const clientId = process.env.SPOTIFY_CLIENT_ID;
  const clientSecret = process.env.SPOTIFY_CLIENT_SECRET;
  if (!clientId || !clientSecret) return { configured: false, track: null };

  const token = await getSpotifyToken(clientId, clientSecret);

  // Spotify's /v1/search `limit` range is 0-10 (tightened from 0-50 at some
  // point before 2026-07-11) — anything above 10 fails with 400 "Invalid limit".
  const q = 'artist:"' + artist.replace(/"/g, "") + '" album:"' + title.replace(/"/g, "") + '"';
  const search = new URLSearchParams();
  search.set("q", q);
  search.set("type", "track");
  search.set("limit", "10");

  const res = await fetch("https://api.spotify.com/v1/search?" + search.toString(), {
    headers: { "Authorization": "Bearer " + token },
  });
  if (!res.ok) throw new Error("Spotify search returned HTTP " + res.status);
  const data = await res.json();
  const tracks = (data && data.tracks && Array.isArray(data.tracks.items)) ? data.tracks.items : [];
  if (!tracks.length) return { configured: true, track: null };

  tracks.sort(function (a, b) { return (b.popularity || 0) - (a.popularity || 0); });
  const best = tracks[0];
  const artists = Array.isArray(best.artists) ? best.artists.map(function (a) { return a.name; }).join(", ") : null;

  return {
    configured: true,
    track: {
      provider: "spotify",
      name: best.name || null,
      artists: artists,
      preview_url: best.preview_url || null,
      external_url: (best.external_urls && best.external_urls.spotify) || null,
      popularity: (typeof best.popularity === "number") ? best.popularity : null,
    },
  };
}

// ---------------------------------------------------------------------------
// Tier 2: Deezer — no auth required. Two-pass: fast free-text search first,
// then (if that misses) a slower but more accurate artist-catalog walk.
// ---------------------------------------------------------------------------

// Pass (a): fast free-text track search. NOT field-filtered (artist:""
// album:"") — empirically much more forgiving of naming differences between
// our vinyl-edition titles and Deezer's digital catalog titles. But its
// relevance ranking sometimes buries a real match under more "popular"
// generic tracks that also contain the query words — see pass (b).
async function tryDeezerFreeText(artist, title) {
  const q = new URLSearchParams();
  q.set("q", artist + " " + title);
  q.set("limit", "50");

  const res = await fetch("https://api.deezer.com/search?" + q.toString());
  if (!res.ok) throw new Error("Deezer search returned HTTP " + res.status);
  const data = await res.json();
  const items = Array.isArray(data && data.data) ? data.data : [];

  const matches = items.filter(function (t) {
    return t && t.album && titlesMatch(t.album.title, title);
  });
  if (!matches.length) return null;

  matches.sort(function (a, b) { return (b.rank || 0) - (a.rank || 0); });
  const best = matches[0];

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

    const albumMatch = albums.find(function (a) { return a && titlesMatch(a.title, title); });
    if (!albumMatch) continue;

    const tracksRes = await fetch("https://api.deezer.com/album/" + albumMatch.id + "/tracks");
    if (!tracksRes.ok) continue;
    const tracksData = await tracksRes.json();
    const tracks = Array.isArray(tracksData && tracksData.data) ? tracksData.data : [];
    const withPreview = tracks.filter(function (t) { return t && t.preview; });
    if (!withPreview.length) continue;

    withPreview.sort(function (a, b) { return (b.rank || 0) - (a.rank || 0); });
    const best = withPreview[0];

    return {
      provider: "deezer",
      name: best.title || null,
      artists: candidate.name || null,
      preview_url: best.preview || null,
      external_url: best.link || null,
      popularity: (typeof best.rank === "number") ? best.rank : null,
    };
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
// name. Confirmed live 2026-07-11 for both examples above. Uses the same
// titlesMatch (containment + guarded fuzzy overlap) as the other passes, so
// carries the same false-positive protections (year-conflict guard, minimum
// 2-word overlap) — a title-only search is inherently less constrained than
// an artist-scoped one, so precision here matters more, not less.
async function tryDeezerByAlbumTitleSearch(title) {
  const q = new URLSearchParams();
  q.set("q", title);
  q.set("limit", "25");

  const res = await fetch("https://api.deezer.com/search/album?" + q.toString());
  if (!res.ok) throw new Error("Deezer album search returned HTTP " + res.status);
  const data = await res.json();
  const albums = Array.isArray(data && data.data) ? data.data : [];

  const albumMatch = albums.find(function (a) { return a && titlesMatch(a.title, title); });
  if (!albumMatch) return null;

  const tracksRes = await fetch("https://api.deezer.com/album/" + albumMatch.id + "/tracks");
  if (!tracksRes.ok) return null;
  const tracksData = await tracksRes.json();
  const tracks = Array.isArray(tracksData && tracksData.data) ? tracksData.data : [];
  const withPreview = tracks.filter(function (t) { return t && t.preview; });
  if (!withPreview.length) return null;

  withPreview.sort(function (a, b) { return (b.rank || 0) - (a.rank || 0); });
  const best = withPreview[0];

  return {
    provider: "deezer",
    name: best.title || null,
    artists: (albumMatch.artist && albumMatch.artist.name) || null,
    preview_url: best.preview || null,
    external_url: best.link || null,
    popularity: (typeof best.rank === "number") ? best.rank : null,
  };
}

async function tryDeezer(artist, title) {
  const freeText = await tryDeezerFreeText(artist, title);
  if (freeText && freeText.preview_url) return freeText;

  const byCatalog = await tryDeezerByArtistCatalog(artist, title);
  if (byCatalog && byCatalog.preview_url) return byCatalog;

  const byAlbumTitle = await tryDeezerByAlbumTitleSearch(title);
  if (byAlbumTitle && byAlbumTitle.preview_url) return byAlbumTitle;

  return freeText || byCatalog || byAlbumTitle || null;
}

// ---------------------------------------------------------------------------
// Tier 3: iTunes Search API — no auth required, best-effort only.
// No popularity field exists on this API, so this picks the first matching
// track rather than a verified "most popular" one. Defensive by design: any
// failure here (network error, redirect, non-JSON body) is swallowed and
// treated as "no result", never surfaced as an error.
// ---------------------------------------------------------------------------

async function tryItunes(artist, title, debugInfo) {
  try {
    const q = new URLSearchParams();
    q.set("term", artist + " " + title);
    q.set("entity", "song");
    q.set("limit", "25");

    const res = await fetch("https://itunes.apple.com/search?" + q.toString(), {
      headers: {
        "User-Agent": "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0 Safari/537.36",
        "Accept": "application/json",
      },
    });
    if (debugInfo) debugInfo.httpStatus = res.status;
    if (!res.ok) return null;
    const contentType = res.headers.get("content-type") || "";
    if (debugInfo) debugInfo.contentType = contentType;
    if (!contentType.includes("json")) return null; // redirected to an HTML page, etc.

    const data = await res.json();
    const items = Array.isArray(data && data.results) ? data.results : [];
    if (debugInfo) debugInfo.resultCount = items.length;
    if (debugInfo) debugInfo.collectionNames = items.slice(0, 10).map(function (t) { return t && t.collectionName; });
    const match = items.find(function (t) {
      return t && titlesMatch(t.collectionName, title);
    });
    if (!match || !match.previewUrl) return null;

    return {
      provider: "itunes",
      name: match.trackName || null,
      artists: match.artistName || null,
      preview_url: match.previewUrl,
      external_url: match.trackViewUrl || null,
      popularity: null, // iTunes exposes no popularity/play-count signal
    };
  } catch (e) {
    if (debugInfo) debugInfo.error = e.message;
    return null; // best-effort tier — never throw
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
  const debug = debugMode ? { spotify: {}, deezerFreeText: {}, deezerCatalog: {}, deezerAlbumTitle: {}, itunes: {} } : null;

  // Tier 1: Spotify. A hard failure here (auth/network) degrades to
  // "not attempted" rather than aborting the whole lookup — Deezer/iTunes
  // can still succeed even if Spotify's credentials or API are having a bad
  // day.
  let spotifyTrack = null;
  let spotifyConfigured = true;
  try {
    const spotifyResult = await trySpotify(artist, title);
    spotifyConfigured = spotifyResult.configured;
    spotifyTrack = spotifyResult.track;
    if (debug) debug.spotify = { configured: spotifyConfigured, track: spotifyTrack };
  } catch (e) {
    console.error("Spotify tier failed", e.message);
    if (debug) debug.spotify = { error: e.message };
  }

  if (spotifyTrack && spotifyTrack.preview_url) {
    return json({ available: true, reason: null, provider: "spotify", track: spotifyTrack, _debug: debug }, 200);
  }

  // Tier 2: Deezer.
  let deezerTrack = null;
  try {
    if (debug) {
      const freeText = await tryDeezerFreeText(artist, title);
      debug.deezerFreeText = { track: freeText };
      const byCatalog = await tryDeezerByArtistCatalog(artist, title);
      debug.deezerCatalog = { track: byCatalog };
      const byAlbumTitle = await tryDeezerByAlbumTitleSearch(title);
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

  // Tier 3: iTunes (best-effort, never throws).
  const itunesTrack = await tryItunes(artist, title, debug ? debug.itunes : null);
  if (debug) debug.itunes.track = itunesTrack;
  if (itunesTrack && itunesTrack.preview_url) {
    return json({ available: true, reason: null, provider: "itunes", track: itunesTrack, _debug: debug }, 200);
  }

  // Nothing playable anywhere. Prefer whichever tier at least matched a
  // track (for the "Listen elsewhere" link), Spotify first since its
  // external_url/popularity data is the richest when present.
  const bestMatchOnly = spotifyTrack || deezerTrack || itunesTrack;
  if (bestMatchOnly) {
    return json({ available: false, reason: "no_preview", provider: bestMatchOnly.provider, track: bestMatchOnly, _debug: debug }, 200);
  }

  if (!spotifyConfigured) {
    // Spotify unconfigured AND no other provider matched at all — still not
    // an error; Deezer/iTunes not matching is a real (if rare) outcome.
    return json({ available: false, reason: "no_match", provider: null, track: null, _debug: debug }, 200);
  }

  return json({ available: false, reason: "no_match", provider: null, track: null, _debug: debug }, 200);
};
