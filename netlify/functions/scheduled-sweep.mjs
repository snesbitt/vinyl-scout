import { getStore } from '@netlify/blobs';

// netlify/functions/scheduled-sweep.mjs
// version: 2
//
// Phase 11 — Concert Radar. Weekly server-side catalog refresh, added
// 2026-08-04 (v18).
//
// Susan asked to remove the manual "Refresh" link, the "Checked N artists
// · N minutes ago" status line, and the "+ Add a show Radar can't find"
// form from the Coming Soon header — decluttering the page now that
// venue-shows.mjs (v16) and the tour-dates/venue-shows merge (v17) do the
// real matching work automatically. But the client-side sweep in
// concert-radar.html only ever runs when a browser actually loads the page
// (on a stale/missing localStorage cache) — with the Refresh button gone,
// there was no way left to force fresh data in without waiting for someone
// to visit. This function is the replacement: a genuine Netlify Scheduled
// Function (the `schedule` key below), running on Netlify's own
// infrastructure once a week regardless of whether anyone visits, so Coming
// Soon data never goes stale just because nobody happened to open the page.
//
// Deliberately reuses the SAME public endpoints concert-radar.html's own
// client-side sweepCatalog() already calls (/api/records, /api/wishlist,
// /api/watching, /api/tour-dates, /api/venue-shows, /api/jambase-shows)
// rather than re-implementing any of their logic here — tour-dates.mjs in
// particular carries four rounds of hard-won tribute-act/exact-match fixes
// (see its own version history) that have no business being duplicated
// into a second copy that can drift out of sync. This function is pure
// orchestration: figure out which artists to check, call the existing
// endpoints (server-to-server, same as any other caller of these
// already-public routes), merge, cache.
//
// Writes the merged result to a new 'catalog-cache' Blobs store (key
// 'latest') as { shows, artistCount, at }. The new catalog-cache.mjs
// endpoint (/api/catalog-cache) reads this so a browser with no local cache
// yet (a new device, a cleared profile) gets an instant, real answer
// instead of sitting through a live sweep with nothing to show for it — the
// exact gap left by removing the old status text.
//
// Best-effort background job: any failure is logged and swallowed rather
// than thrown, so one bad week doesn't leave an unhandled rejection for
// Netlify's scheduler to choke on — next week's run just tries again, and
// whatever cache already exists (stale or not) stays in place rather than
// being wiped by a partial/failed run.
//
// v2 (2026-08-13): two changes, same pass.
//   (1) Wired in jambase-shows.mjs as a third source (see that file's own
//       header for the full story — JamBase Data, free tier, a real
//       geoRadiusAmount bug found and worked around via pagination
//       instead). Called with ?allPages=true here specifically — this is
//       the ONE place in the app that should pay the full ~21-call cost
//       of a complete Bay Area sweep (well inside the 1,000/month free
//       tier budget at once a week), unlike concert-radar.html's own
//       client-side sweepCatalog(), which deliberately calls the fast
//       single-page default on every live visit instead.
//   (2) Closed a latent gap this same wiring exposed: this file's own
//       artist list was built from /api/records + /api/wishlist only,
//       never /api/watching — unlike concert-radar.html's client-side
//       fetchDistinctArtists(), which picked up /api/watching back at
//       v18.5 (2026-08-04). A watched-only artist with no catalog/
//       wishlist entry (e.g. Black Uhuru) was therefore never part of
//       this file's relevance filtering. Also closed: venue-shows.mjs's
//       output was previously merged into the cache completely
//       UNFILTERED here (unlike the client, which has filtered it since
//       v18.5) — harmless when venue-shows.mjs's own calendars were
//       small, but clearly wrong once JamBase's much larger raw sweep
//       (2,038 total Bay Area events in one real test, see
//       jambase-shows.mjs's header) needed filtering anyway. Rather than
//       filter only the new source and leave the old inconsistency in
//       place, both non-artist-scoped sources (venue-shows.mjs and
//       jambase-shows.mjs) now go through the same relevance filter,
//       matching what the client already does. normalizeArtistKey()/
//       artistIsRelevant() below are a deliberate duplicate of
//       concert-radar.html's own versions (v18.4/v18.5) — same
//       one-small-file-per-endpoint precedent this repo already uses for
//       TRIBUTE_WORDS between tour-dates.mjs/venue-shows.mjs; keep both
//       copies in sync if the matching rule ever changes.

export const config = {
  schedule: '@weekly'
};

var SWEEP_CONCURRENCY = 5;

// Netlify sets URL to the site's primary production URL inside Functions,
// including scheduled ones. Falls back to the known production domain so
// this can't silently no-op if that env var is ever missing in some
// execution context.
function siteUrl() {
  return process.env.URL || 'https://vinylscout.org';
}

// Same null-guard/default-to-title normalization concert-radar.html's own
// normalizeVenueShows() does client-side — see that function's comment in
// concert-radar.html (v16) for the full "Cannot read properties of null"
// root-cause story this traces back to. Generic enough to reuse for
// jambase-shows.mjs's output too (v2) — same reasoning as
// concert-radar.html's own v21 reuse, see that file's comment.
function normalizeShowsArtist(shows) {
  return shows.map(function (s) {
    return s && !s.artist ? Object.assign({}, s, { artist: s.title || '' }) : s;
  });
}

// Deliberate duplicate of concert-radar.html's normalizeArtistKey() —
// see this file's v2 header note above for why.
function normalizeArtistKey(s) {
  return String(s || '')
    .toLowerCase()
    .replace(/[-,]/g, ' ')
    .replace(/[''.]/g, '')
    .replace(/&/g, 'and')
    .replace(/\s+/g, ' ')
    .trim();
}

// Deliberate duplicate of concert-radar.html's artistIsRelevant() — see
// this file's v2 header note above for why.
function artistIsRelevant(showArtist, relevantNames) {
  var a = normalizeArtistKey(showArtist);
  if (!a) return false;
  return relevantNames.some(function (name) {
    var q = normalizeArtistKey(name);
    return !!q && (a.indexOf(q) !== -1 || q.indexOf(a) !== -1);
  });
}

function dedupeById(list) {
  var seenIds = {};
  return list.filter(function (s) {
    if (!s || !s.id || seenIds[s.id]) return false;
    seenIds[s.id] = true;
    return true;
  });
}

// Deliberate duplicate of concert-radar.html's normalizeVenueKey()/
// dedupeSameShow() — see that file's 2026-08-14 comment for the full
// story (Susan live-caught Herbie Hancock at Davies Symphony Hall, Aug 17
// 2026, showing up twice: once via JamBase naming the venue "Davies
// Symphony Hall", once via SeatGeek naming it "Louise M. Davies Symphony
// Hall" — same real show, same date, dedupeById() above can't catch it
// since each source mints its own id independently). This weekly job
// feeds catalog-cache.mjs, which concert-radar.html reads as its
// first-paint fallback before its own live sweep (which has the matching
// client-side fix) replaces it — without this fix here too, a browser
// with no local cache yet would flash the same duplicate on first paint.
function normalizeVenueKey(v) {
  return String(v || '')
    .toLowerCase()
    .replace(/['’.]/g, '')
    .replace(/[^a-z0-9]+/g, ' ')
    .trim();
}

function sourceRank(source) {
  if (source === 'SeatGeek') return 0;
  if (source === 'JamBase') return 1;
  return 2;
}

function dedupeSameShow(list) {
  var groups = [];
  list.forEach(function (s) {
    if (!s) return;
    if (String(s.source || '').indexOf('Manual entry') === 0) {
      groups.push([s]);
      return;
    }
    var aKey = normalizeArtistKey(s.artist);
    var vKey = normalizeVenueKey(s.venue);
    var dKey = s.date || '';
    var target = null;
    for (var i = 0; i < groups.length; i++) {
      var rep = groups[i][0];
      if (String(rep.source || '').indexOf('Manual entry') === 0) continue;
      if (normalizeArtistKey(rep.artist) !== aKey || (rep.date || '') !== dKey) continue;
      var repVKey = normalizeVenueKey(rep.venue);
      if (vKey && repVKey && (vKey.indexOf(repVKey) !== -1 || repVKey.indexOf(vKey) !== -1)) {
        target = groups[i];
        break;
      }
    }
    if (target) { target.push(s); } else { groups.push([s]); }
  });
  return groups.map(function (g) {
    if (g.length === 1) return g[0];
    var sorted = g.slice().sort(function (a, b) { return sourceRank(a.source) - sourceRank(b.source); });
    var winner = Object.assign({}, sorted[0]);
    if (typeof winner.priceLow !== 'number' || typeof winner.priceHigh !== 'number') {
      var withPrice = sorted.filter(function (s) { return typeof s.priceLow === 'number' && typeof s.priceHigh === 'number'; })[0];
      if (withPrice) { winner.priceLow = withPrice.priceLow; winner.priceHigh = withPrice.priceHigh; }
    }
    if (!winner.url) {
      var withUrl = sorted.filter(function (s) { return s.url; })[0];
      if (withUrl) winner.url = withUrl.url;
    }
    return winner;
  });
}

// Same bounded-concurrency worker-pool shape as concert-radar.html's own
// mapLimit(), minus the progress callback (nothing renders this server-side).
async function mapLimit(items, limit, iterator) {
  var results = new Array(items.length);
  var nextIndex = 0;
  async function runNext() {
    while (nextIndex < items.length) {
      var i = nextIndex++;
      try {
        results[i] = await iterator(items[i], i);
      } catch (e) {
        results[i] = null;
      }
    }
  }
  var workers = [];
  for (var k = 0; k < Math.min(limit, items.length); k++) workers.push(runNext());
  await Promise.all(workers);
  return results;
}

async function fetchJSON(url, fallback) {
  try {
    var res = await fetch(url);
    if (!res.ok) return fallback;
    return await res.json();
  } catch (e) {
    return fallback;
  }
}

// v2: also fetches /api/watching now — see this file's own v2 header note.
async function fetchDistinctArtists(base) {
  var records = await fetchJSON(base + '/api/records', []);
  var wishlist = await fetchJSON(base + '/api/wishlist', []);
  var watchingList = await fetchJSON(base + '/api/watching', []);
  records = Array.isArray(records) ? records : [];
  wishlist = Array.isArray(wishlist) ? wishlist : [];
  watchingList = Array.isArray(watchingList) ? watchingList : [];
  var seen = {};
  var names = [];
  records.concat(wishlist).concat(watchingList).forEach(function (item) {
    var name = (item && item.artist ? String(item.artist) : '').trim();
    if (!name) return;
    var key = name.toLowerCase();
    if (seen[key]) return;
    seen[key] = true;
    names.push(name);
  });
  return names;
}

export default async () => {
  var base = siteUrl();
  var store = getStore('catalog-cache');

  try {
    var artists = await fetchDistinctArtists(base);

    var venueShowsData = await fetchJSON(base + '/api/venue-shows', { shows: [] });
    var venueShows = Array.isArray(venueShowsData.shows) ? venueShowsData.shows : [];

    // v2: allPages=true — this IS the weekly full sweep jambase-shows.mjs's
    // own header describes as the intended use of that flag (~21 calls for
    // a complete Bay Area sweep at the time this was written, well inside
    // the free tier's 1,000/month budget for a once-a-week job).
    var jambaseShowsData = await fetchJSON(base + '/api/jambase-shows?allPages=true', { shows: [] });
    var jambaseShows = Array.isArray(jambaseShowsData.shows) ? jambaseShowsData.shows : [];

    var perArtistShows = await mapLimit(artists, SWEEP_CONCURRENCY, async function (artist) {
      var data = await fetchJSON(base + '/api/tour-dates?artist=' + encodeURIComponent(artist), { shows: [] });
      return Array.isArray(data.shows) ? data.shows : [];
    });

    // v2: both non-artist-scoped sources now filtered to relevance before
    // merging — see this file's own v2 header note for why venue-shows.mjs
    // wasn't already filtered here even though the client has done this
    // since v18.5.
    var relevantVenueShows = normalizeShowsArtist(venueShows).filter(function (s) {
      return artistIsRelevant(s.artist, artists);
    });
    var relevantJambaseShows = normalizeShowsArtist(jambaseShows).filter(function (s) {
      return artistIsRelevant(s.artist, artists);
    });

    var all = relevantVenueShows.concat(relevantJambaseShows);
    perArtistShows.forEach(function (list) { if (list) all = all.concat(list); });
    var shows = dedupeSameShow(dedupeById(all));

    await store.set('latest', JSON.stringify({
      shows: shows,
      artistCount: artists.length,
      at: Date.now()
    }));

    console.log('scheduled-sweep.mjs: cached ' + shows.length + ' shows across ' + artists.length + ' artists (venue raw=' + venueShows.length + '/relevant=' + relevantVenueShows.length + ', jambase raw=' + jambaseShows.length + '/relevant=' + relevantJambaseShows.length + ')');
  } catch (err) {
    console.error('scheduled-sweep.mjs error:', err.message, err.stack);
  }
};
