import { getStore } from '@netlify/blobs';

// netlify/functions/scheduled-sweep.mjs
// version: 1
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
// /api/tour-dates, /api/venue-shows) rather than re-implementing any of
// their logic here — tour-dates.mjs in particular carries four rounds of
// hard-won tribute-act/exact-match fixes (see its own version history) that
// have no business being duplicated into a second copy that can drift out
// of sync. This function is pure orchestration: figure out which artists to
// check, call the existing endpoints (server-to-server, same as any other
// caller of these already-public routes), merge, cache.
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
// root-cause story this traces back to.
function normalizeVenueShows(venueShows) {
  return venueShows.map(function (s) {
    return s && !s.artist ? Object.assign({}, s, { artist: s.title || '' }) : s;
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

async function fetchDistinctArtists(base) {
  var records = await fetchJSON(base + '/api/records', []);
  var wishlist = await fetchJSON(base + '/api/wishlist', []);
  records = Array.isArray(records) ? records : [];
  wishlist = Array.isArray(wishlist) ? wishlist : [];
  var seen = {};
  var names = [];
  records.concat(wishlist).forEach(function (item) {
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

    var perArtistShows = await mapLimit(artists, SWEEP_CONCURRENCY, async function (artist) {
      var data = await fetchJSON(base + '/api/tour-dates?artist=' + encodeURIComponent(artist), { shows: [] });
      return Array.isArray(data.shows) ? data.shows : [];
    });

    var all = normalizeVenueShows(venueShows);
    perArtistShows.forEach(function (list) { if (list) all = all.concat(list); });
    var shows = dedupeById(all);

    await store.set('latest', JSON.stringify({
      shows: shows,
      artistCount: artists.length,
      at: Date.now()
    }));

    console.log('scheduled-sweep.mjs: cached ' + shows.length + ' shows across ' + artists.length + ' artists');
  } catch (err) {
    console.error('scheduled-sweep.mjs error:', err.message, err.stack);
  }
};
