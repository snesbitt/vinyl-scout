#!/usr/bin/env node
// scripts/scheduled-sweep.mjs
// version: 1
//
// GitHub Actions-native replacement for netlify/functions/scheduled-sweep.mjs,
// following the exact same migration pattern already proven by
// scripts/backup-catalog.mjs (added 2026-08-09, see
// claude/weekend-netlify-github-cost-plan-2026-08-08.md). Moves the weekly
// Coming Soon catalog sweep off Netlify Scheduled Functions + Blobs, onto a
// plain script run by GitHub Actions.
//
// Key difference from the Netlify version: this script has no Netlify Blobs
// execution context (Actions runs outside Netlify entirely), so it cannot
// call getStore('catalog-cache').set(...) directly. Instead, exactly like
// backup-catalog.mjs, it reads the same live public endpoints
// scheduled-sweep.mjs already calls (server-to-server, same as any other
// caller of these already-public routes: /api/records, /api/wishlist,
// /api/watching, /api/venue-shows, /api/jambase-shows, /api/tour-dates) and
// writes the merged result to a git-committed file instead of a Blobs store.
// ZERO new secrets — no Netlify API token, nothing beyond the workflow's own
// built-in GITHUB_TOKEN (used only for git commit/push, handled by the
// workflow file itself, not by this script).
//
// All matching/merge logic below (normalizeArtistKey, artistIsRelevant,
// dedupeById, normalizeVenueKey, dedupeSameShow, mapLimit) is copied
// verbatim from netlify/functions/scheduled-sweep.mjs v2 — deliberately, per
// that file's own stated precedent of keeping small duplicated matching
// helpers in sync across files rather than sharing state across a
// deploy/Actions boundary. If the matching rule ever changes there, mirror
// it here too.
//
// TRANSITION PERIOD: this runs additively alongside the existing
// Netlify-scheduled scheduled-sweep.mjs, same as backup-catalog.mjs did
// alongside backup.mjs — not a replacement yet. Compare a real run's output
// (data/catalog-cache.json) against what the Netlify version currently
// serves via /api/catalog-cache before deciding to cut the read side over.
// See the accompanying doc note for the specific follow-up needed on
// netlify/functions/catalog-cache.mjs once you're ready to retire the
// Blobs-backed write and the Netlify scheduled function itself.
//
// HARD RULES respected, same as backup-catalog.mjs:
//   - Pure read of the live site's public APIs. Never mutates anything.
//   - Fails loudly (non-zero exit) on a bad fetch, so a broken run shows up
//     red in the Actions tab instead of silently writing an empty/stale
//     cache over a good one. This is a deliberate behavior change from the
//     original scheduled-sweep.mjs, which swallows all errors (reasonable
//     there, since a silent Netlify scheduled-function failure has no
//     visible failure surface at all; GitHub Actions gives us one, so we
//     use it).

const SITE_URL = process.env.SWEEP_SITE_URL || 'https://vinylscout.org';
const SWEEP_CONCURRENCY = 5;
const OUTPUT_PATH = 'data/catalog-cache.json';

function normalizeShowsArtist(shows) {
  return shows.map(function (s) {
    return s && !s.artist ? Object.assign({}, s, { artist: s.title || '' }) : s;
  });
}

function normalizeArtistKey(s) {
  return String(s || '')
    .toLowerCase()
    .replace(/[-,]/g, ' ')
    .replace(/[''.]/g, '')
    .replace(/&/g, 'and')
    .replace(/\s+/g, ' ')
    .trim();
}

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

function normalizeVenueKey(v) {
  return String(v || '')
    .toLowerCase()
    .replace(/['\u2019.]/g, '')
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

async function fetchJSON(url) {
  var res = await fetch(url);
  if (!res.ok) throw new Error('GET ' + url + ' failed: HTTP ' + res.status);
  return await res.json();
}

async function fetchDistinctArtists(base) {
  var records = await fetchJSON(base + '/api/records');
  var wishlist = await fetchJSON(base + '/api/wishlist');
  var watchingList = await fetchJSON(base + '/api/watching');
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

async function main() {
  var base = SITE_URL;

  var artists = await fetchDistinctArtists(base);
  if (artists.length === 0) {
    // Mirrors backup-catalog.mjs's "refuse to write an implausible empty
    // result" guard — a zero-artist catalog/wishlist/watching set isn't
    // plausible for this site; treat it as an upstream problem, not a real
    // state to cache over a good previous run.
    throw new Error('fetchDistinctArtists returned zero artists — refusing to write an empty cache; investigate before retrying');
  }

  var venueShowsData = await fetchJSON(base + '/api/venue-shows');
  var venueShows = Array.isArray(venueShowsData.shows) ? venueShowsData.shows : [];

  var jambaseShowsData = await fetchJSON(base + '/api/jambase-shows?allPages=true');
  var jambaseShows = Array.isArray(jambaseShowsData.shows) ? jambaseShowsData.shows : [];

  var perArtistShows = await mapLimit(artists, SWEEP_CONCURRENCY, async function (artist) {
    var data = await fetchJSON(base + '/api/tour-dates?artist=' + encodeURIComponent(artist));
    return Array.isArray(data.shows) ? data.shows : [];
  });

  var relevantVenueShows = normalizeShowsArtist(venueShows).filter(function (s) {
    return artistIsRelevant(s.artist, artists);
  });
  var relevantJambaseShows = normalizeShowsArtist(jambaseShows).filter(function (s) {
    return artistIsRelevant(s.artist, artists);
  });

  var all = relevantVenueShows.concat(relevantJambaseShows);
  perArtistShows.forEach(function (list) { if (list) all = all.concat(list); });
  var shows = dedupeSameShow(dedupeById(all));

  var output = {
    shows: shows,
    artistCount: artists.length,
    at: Date.now(),
    source: 'github-actions', // distinguishes these writes from the older Netlify-scheduled ones during the transition window, same convention as backup-catalog.mjs
  };

  const fs = await import('node:fs/promises');
  const path = await import('node:path');
  await fs.mkdir(path.dirname(OUTPUT_PATH), { recursive: true });
  await fs.writeFile(OUTPUT_PATH, JSON.stringify(output, null, 2) + '\n', 'utf-8');

  console.log('scheduled-sweep.mjs: wrote ' + OUTPUT_PATH + ' — ' + shows.length + ' shows across ' + artists.length + ' artists (venue raw=' + venueShows.length + '/relevant=' + relevantVenueShows.length + ', jambase raw=' + jambaseShows.length + '/relevant=' + relevantJambaseShows.length + ')');

  const ghOutput = process.env.GITHUB_OUTPUT;
  if (ghOutput) {
    await fs.appendFile(ghOutput, 'sweep_path=' + OUTPUT_PATH + '\nshow_count=' + shows.length + '\nartist_count=' + artists.length + '\n', 'utf-8');
  }
}

main().catch((err) => {
  console.error('scheduled-sweep.mjs failed:', err.message);
  process.exit(1);
});
