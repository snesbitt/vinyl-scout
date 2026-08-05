// netlify/functions/artists-playing.mjs
// version: 1
// Phase 10 — Travel Intelligence hooks (2026-08-05). The Vinyl Scout half of
// the bidirectional Concert Radar <-> Travel Intelligence integration Susan
// asked for 2026-08-04 ("if i'm watching a fare like Chicago you check the
// feeds to see who i am interested in that is also playing in town during
// those dates when i'll be there"), built 2026-08-05 after her three
// resolved answers: fixed ~25mi radius, matching scope = full catalog +
// wishlists + the venue scrape this repo already runs (not just the
// curated Watching list), and documentation-only that day — this is the
// actual build, the day after.
//
// GET /api/artists-playing?lat=&lon=&date_start=&date_end=
//   lat, lon        — required, the travel destination's coordinates
//                      (Travel Intelligence's /api/watched-trips supplies
//                      these via its own IATA->lat/lon table).
//   date_start,
//   date_end        — required, YYYY-MM-DD, the trip's date window.
//
// WHY THIS DOESN'T JUST SWEEP tour-dates.mjs PER ARTIST: concert-radar.html's
// own Coming Soon feature already does exactly that — one /api/tour-dates
// call per distinct catalog/wishlist/watching artist, concurrency-capped at
// 5 — but it's scoped to a fixed HOME location and runs client-side with a
// 1h cache specifically because a ~170-artist sweep (94 catalog + 76
// wishlist, per PROJECT.md's latest count) is too slow to do live, on every
// request, for an ARBITRARY travel destination. Doing that here — synchronously,
// inside one Netlify Function call, for a location that could be anywhere —
// would risk the function timeout and make Travel Intelligence's homepage
// feel broken. Instead this queries SeatGeek's /events endpoint by
// LOCATION + DATE WINDOW ONLY (no performer filter — a natural extension of
// the same API tour-dates.mjs already calls, just used the other direction),
// getting back every event near the destination during the trip regardless
// of artist, then cross-references the (small, in-memory) list of performer
// names against the catalog/wishlist/watching artist set. That's a small,
// bounded number of calls regardless of catalog size — the actual match
// scope Susan asked for, without the O(catalog) SeatGeek fan-out.
//
// Second show source: this site's own /api/venue-shows (the 7-venue Bay
// Area scrape + the hand-verified MANUAL_SHOWS entries) — Susan's explicit
// answer included "venue site scraping u set up" in the matching scope.
// venue-shows.mjs doesn't carry lat/lon per show, so a small hardcoded
// VENUE_COORDS table (below) maps each of its known venue names to
// approximate public coordinates, filtered the same way. This source only
// contributes matches near the Bay Area (its own venues are all
// Bay-Area-only) — an honest, inherited limitation, not a bug: a trip to
// a city with no Bay Area overlap just won't get anything from this half.
//
// Artist universe = catalog (getStore('records')) union wishlist
// (getStore('wishlist')) union watching (getStore('watching')). Susan's
// literal answer named catalog + wishlist + venue scraping; watching is
// included too for consistency with venue-shows.mjs v18.5's own precedent
// (Coming Soon's relevancy filter already treats a watched-only artist,
// e.g. Black Uhuru pre-catalog, as equally "an artist I'm interested in" —
// excluding it here while including it there would be an inconsistent
// definition of "my artists" between the two features).
//
// PURE READ. Never touches Netlify Blobs' write paths, never writes
// anything. Not gated: same rationale as tour-dates.mjs/venue-shows.mjs —
// exposes only public event data plus artist names already public via
// /api/records and /api/wishlist.
//
// Env vars: SEATGEEK_CLIENT_ID / SEATGEEK_CLIENT_SECRET (same as
// tour-dates.mjs — required for the SeatGeek half; the venue-shows half
// still works without it, so a missing key degrades rather than 500s the
// whole response).

import { getStore } from "@netlify/blobs";

export const config = { path: "/api/artists-playing" };

var MATCH_RANGE_MI = 25; // fixed, per Susan's explicit 2026-08-05 answer — not user-adjustable

function json(body, status) {
  return new Response(JSON.stringify(body), {
    status: status || 200,
    headers: { "Content-Type": "application/json" },
  });
}

// Literal copy of tour-dates.mjs's norm() — same reasoning as that file's
// own comment on duplicating TRIBUTE_WORDS into venue-shows.mjs rather than
// sharing a module: two small files felt easier to keep correct than one
// shared import, for a project this size. If this changes in one file,
// change it in the others too.
function norm(s) {
  return (s || "")
    .toLowerCase()
    .replace(/&/g, " and ")
    .replace(/[^a-z0-9 ]+/g, " ")
    .replace(/\bthe\b/g, " ")
    .replace(/\band\b/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

var TRIBUTE_WORDS = /\b(tribute|unauthorized|unauthorised|cover band|coverband|salute|as performed by|homage|allstars|the music of|a celebration of|celebrating the music)\b/i;

// Approximate public coordinates for every venue venue-shows.mjs knows
// about (its 7 scraped venues + every venue named in MANUAL_SHOWS,
// including The Guild Theatre which only ever appears via MANUAL_SHOWS,
// never the scrape). Hand-entered from public knowledge, not looked up
// live against a mapping API this session doesn't have — good enough for
// a 25mi radius check where block-level precision doesn't matter, but
// worth a spot-check against a map if a match here ever looks wrong.
export var VENUE_COORDS = {
  "cornerstone": { lat: 37.8695, lon: -122.2687 },
  "fox theater": { lat: 37.8087, lon: -122.2661 },
  "greek theatre": { lat: 37.8733, lon: -122.2536 },
  "bill graham civic auditorium": { lat: 37.7797, lon: -122.4192 },
  "the castro": { lat: 37.7609, lon: -122.4350 },
  "bimbo's 365 club": { lat: 37.8054, lon: -122.4166 },
  "the independent": { lat: 37.7759, lon: -122.4376 },
  "freight & salvage": { lat: 37.8687, lon: -122.2686 },
  "sweetwater music hall": { lat: 37.9061, lon: -122.5450 },
  "great american music hall": { lat: 37.7847, lon: -122.4192 },
  "the chapel": { lat: 37.7605, lon: -122.4215 },
  "the uc theatre": { lat: 37.8716, lon: -122.2696 },
  "the guild theatre": { lat: 37.4529, lon: -122.1817 },
};

// Standard haversine, miles. Exported for the unit test script.
export function milesBetween(lat1, lon1, lat2, lon2) {
  var R = 3958.8;
  var toRad = function (d) { return (d * Math.PI) / 180; };
  var dLat = toRad(lat2 - lat1);
  var dLon = toRad(lon2 - lon1);
  var a = Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) *
    Math.sin(dLon / 2) * Math.sin(dLon / 2);
  var c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return R * c;
}

// Pure: given the catalog/wishlist/watching item lists (each just needs an
// .artist field — same shape records.mjs/wishlist.mjs/watching.mjs already
// return), build the normalized artist-name set used for matching, plus a
// display-name map (normalized -> first-seen original casing) so results
// can show a real name instead of the normalized form. Exported for the
// unit test script.
export function buildArtistIndex(catalogItems, wishlistItems, watchingItems) {
  var set = new Set();
  var display = {};
  [catalogItems, wishlistItems, watchingItems].forEach(function (list) {
    (list || []).forEach(function (item) {
      var name = item && item.artist ? String(item.artist).trim() : "";
      if (!name) return;
      var key = norm(name);
      if (!key) return;
      set.add(key);
      if (!display[key]) display[key] = name;
    });
  });
  return { set: set, display: display };
}

// Pure: given a raw SeatGeek /events response (no performer filter, scoped
// by lat/lon/range/date window at the query level already), the artist
// index, and the destination point, return matched shows. Exported for the
// unit test script — no live SeatGeek call needed to exercise this.
export function matchSeatGeekEvents(events, artistIndex, lat, lon) {
  var out = [];
  (events || []).forEach(function (e) {
    var titleText = ((e.title || "") + " " + (e.short_title || "")).toLowerCase();
    if (TRIBUTE_WORDS.test(titleText)) return;
    var performers = Array.isArray(e.performers) ? e.performers : [];
    performers.forEach(function (p) {
      var name = p && p.name ? String(p.name).trim() : "";
      if (!name) return;
      var key = norm(name);
      if (!artistIndex.set.has(key)) return;
      if (TRIBUTE_WORDS.test(name.toLowerCase())) return; // belt and suspenders, same as tour-dates.mjs
      var venue = e.venue || {};
      var stats = e.stats || {};
      var venueLat = typeof venue.location === "object" && venue.location ? venue.location.lat : venue.lat;
      var venueLon = typeof venue.location === "object" && venue.location ? venue.location.lon : venue.lon;
      var distanceMi = (typeof venueLat === "number" && typeof venueLon === "number")
        ? Math.round(milesBetween(lat, lon, venueLat, venueLon) * 10) / 10
        : null;
      var dateLabel = null;
      if (e.datetime_local) {
        var d = new Date(e.datetime_local);
        if (!isNaN(d.getTime())) {
          dateLabel = d.toLocaleDateString("en-US", { weekday: "short", month: "short", day: "numeric", year: "numeric" });
        }
      }
      out.push({
        id: "seatgeek-" + (e.id != null ? e.id : "") + "-" + key,
        artist: artistIndex.display[key] || name,
        matchedPerformerName: name,
        title: e.title || e.short_title || null,
        venue: venue.name || null,
        city: venue.city ? (venue.state ? venue.city + ", " + venue.state : venue.city) : null,
        date: e.datetime_local ? e.datetime_local.slice(0, 10) : null,
        dateLabel: dateLabel,
        distanceMi: distanceMi,
        source: "SeatGeek",
        priceLow: typeof stats.lowest_price === "number" ? stats.lowest_price : null,
        priceHigh: typeof stats.highest_price === "number" ? stats.highest_price : null,
        url: e.url || null,
      });
    });
  });
  return out;
}

// Pure: given venue-shows.mjs's already-merged `shows[]` array, the artist
// index, and the trip's location+date window, return matched shows.
// Exported for the unit test script.
export function matchVenueShows(venueShows, artistIndex, lat, lon, dateStart, dateEnd) {
  var out = [];
  (venueShows || []).forEach(function (s) {
    var name = s && s.artist ? String(s.artist).trim() : "";
    if (!name) return;
    var key = norm(name);
    if (!artistIndex.set.has(key)) return;
    if (!s.date || s.date < dateStart || s.date > dateEnd) return;
    var venueKey = norm(s.venue || "");
    var coords = VENUE_COORDS[venueKey];
    if (!coords) return; // unknown venue — can't verify distance, skip rather than guess
    var distanceMi = Math.round(milesBetween(lat, lon, coords.lat, coords.lon) * 10) / 10;
    if (distanceMi > MATCH_RANGE_MI) return;
    out.push({
      id: "venue-" + (s.id || (venueKey + "-" + s.date)) + "-" + key,
      artist: artistIndex.display[key] || name,
      matchedPerformerName: name,
      title: s.title || null,
      venue: s.venue || null,
      city: s.city || null,
      date: s.date,
      dateLabel: s.dateLabel || null,
      distanceMi: distanceMi,
      source: s.source || "Venue scrape",
      priceLow: null,
      priceHigh: null,
      url: s.url || null,
    });
  });
  return out;
}

export default async (req) => {
  if (req.method !== "GET") {
    return json({ error: "Method not allowed — artists-playing is read-only" }, 405);
  }

  const url = new URL(req.url);
  const lat = parseFloat(url.searchParams.get("lat"));
  const lon = parseFloat(url.searchParams.get("lon"));
  const dateStart = (url.searchParams.get("date_start") || "").trim();
  const dateEnd = (url.searchParams.get("date_end") || "").trim();

  if (!isFinite(lat) || !isFinite(lon)) {
    return json({ error: "Provide lat and lon (numbers)" }, 400);
  }
  if (!/^\d{4}-\d{2}-\d{2}$/.test(dateStart) || !/^\d{4}-\d{2}-\d{2}$/.test(dateEnd)) {
    return json({ error: "Provide date_start and date_end (YYYY-MM-DD)" }, 400);
  }
  if (dateEnd < dateStart) {
    return json({ error: "date_end is before date_start" }, 400);
  }

  // Artist universe: direct Blobs reads (fast, in-process — no HTTP
  // round-trip to this site's own /api/records etc).
  var catalogItems = [];
  var wishlistItems = [];
  var watchingItems = [];
  try {
    var recordsStore = getStore("records");
    var recordsList = await recordsStore.list();
    for (const blob of recordsList.blobs) {
      var raw = await recordsStore.get(blob.key);
      if (raw) { try { catalogItems.push(JSON.parse(raw)); } catch (e) {} }
    }
  } catch (e) { console.error("artists-playing.mjs: could not read records store:", e.message); }
  try {
    var wishlistStore = getStore("wishlist");
    var wishlistList = await wishlistStore.list();
    for (const blob of wishlistList.blobs) {
      var raw2 = await wishlistStore.get(blob.key);
      if (raw2) { try { wishlistItems.push(JSON.parse(raw2)); } catch (e) {} }
    }
  } catch (e) { console.error("artists-playing.mjs: could not read wishlist store:", e.message); }
  try {
    var watchingStore = getStore("watching");
    var watchingList = await watchingStore.list();
    for (const blob of watchingList.blobs) {
      if (blob.key.indexOf("_meta_") === 0) continue; // sentinel record, see watching.mjs
      var raw3 = await watchingStore.get(blob.key);
      if (raw3) { try { watchingItems.push(JSON.parse(raw3)); } catch (e) {} }
    }
  } catch (e) { console.error("artists-playing.mjs: could not read watching store:", e.message); }

  var artistIndex = buildArtistIndex(catalogItems, wishlistItems, watchingItems);

  // Source 1: SeatGeek, location + date window, no performer filter.
  var seatgeekMatches = [];
  var seatgeekError = null;
  var clientId = process.env.SEATGEEK_CLIENT_ID;
  if (!clientId) {
    seatgeekError = "SEATGEEK_CLIENT_ID is not set on the server — SeatGeek source skipped, venue-scrape source still checked below";
  } else {
    var clientSecret = process.env.SEATGEEK_CLIENT_SECRET || "";
    try {
      var evParams = new URLSearchParams();
      evParams.set("client_id", clientId);
      if (clientSecret) evParams.set("client_secret", clientSecret);
      evParams.set("lat", String(lat));
      evParams.set("lon", String(lon));
      evParams.set("range", MATCH_RANGE_MI + "mi");
      evParams.set("datetime_utc.gte", dateStart + "T00:00:00");
      evParams.set("datetime_utc.lte", dateEnd + "T23:59:59");
      evParams.set("sort", "datetime_utc.asc");
      evParams.set("per_page", "100"); // day-one cap — see header comment; a single page keeps this fast
      var evRes = await fetch("https://api.seatgeek.com/2/events?" + evParams.toString());
      if (!evRes.ok) {
        var detail = "";
        try { detail = (await evRes.json()).message || ""; } catch (e) {}
        seatgeekError = "SeatGeek returned HTTP " + evRes.status + (detail ? " — " + detail : "");
      } else {
        var evData = await evRes.json();
        var rawEvents = Array.isArray(evData.events) ? evData.events : [];
        seatgeekMatches = matchSeatGeekEvents(rawEvents, artistIndex, lat, lon);
      }
    } catch (err) {
      seatgeekError = "Could not reach SeatGeek: " + err.message;
    }
  }

  // Source 2: this site's own venue scrape (7 Bay Area venues + manual
  // entries) — reused via its own endpoint rather than re-implementing the
  // scrape/parse logic here.
  var venueMatches = [];
  var venueError = null;
  try {
    var venueRes = await fetch(new URL("/api/venue-shows", req.url).toString());
    if (venueRes.ok) {
      var venueData = await venueRes.json();
      var venueShows = Array.isArray(venueData.shows) ? venueData.shows : [];
      venueMatches = matchVenueShows(venueShows, artistIndex, lat, lon, dateStart, dateEnd);
    } else {
      venueError = "venue-shows returned HTTP " + venueRes.status;
    }
  } catch (err) {
    venueError = "Could not reach venue-shows: " + err.message;
  }

  var matches = seatgeekMatches.concat(venueMatches);
  // De-dupe: the same real show can appear from both sources (e.g. a
  // Cornerstone show SeatGeek also indexes) — key on artist+venue+date.
  var seen = new Set();
  matches = matches.filter(function (m) {
    var k = norm(m.artist) + "|" + norm(m.venue || "") + "|" + m.date;
    if (seen.has(k)) return false;
    seen.add(k);
    return true;
  });
  matches.sort(function (a, b) { return (a.date || "").localeCompare(b.date || ""); });

  return json({
    matches: matches,
    meta: {
      lat, lon,
      range_mi: MATCH_RANGE_MI,
      date_start: dateStart,
      date_end: dateEnd,
      catalog_count: catalogItems.length,
      wishlist_count: wishlistItems.length,
      watching_count: watchingItems.length,
      artists_checked: artistIndex.set.size,
      seatgeek_error: seatgeekError,
      venue_error: venueError,
    },
  }, 200);
};
