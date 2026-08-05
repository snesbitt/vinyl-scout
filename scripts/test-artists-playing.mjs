// scripts/test-artists-playing.mjs
// Regression suite for netlify/functions/artists-playing.mjs's pure
// exported functions (buildArtistIndex, matchSeatGeekEvents,
// matchVenueShows, milesBetween). Same pattern as
// scripts/test-audio-preview.mjs: imports the real exported functions
// directly, no live network, no API key, no Blobs mocking needed since
// none of these four functions touch @netlify/blobs.
//
// Run: node scripts/test-artists-playing.mjs

import {
  buildArtistIndex,
  matchSeatGeekEvents,
  matchVenueShows,
  milesBetween,
  VENUE_COORDS,
} from "../netlify/functions/artists-playing.mjs";

var passed = 0;
var failed = 0;

function assertEqual(actual, expected, label) {
  var ok = JSON.stringify(actual) === JSON.stringify(expected);
  if (ok) {
    passed++;
  } else {
    failed++;
    console.error("FAIL: " + label);
    console.error("  expected: " + JSON.stringify(expected));
    console.error("  actual:   " + JSON.stringify(actual));
  }
}

function assertTrue(actual, label) {
  assertEqual(!!actual, true, label);
}

// --- milesBetween ---------------------------------------------------------

// Berkeley to San Francisco is a real, roughly-known distance (~10-11mi as
// the crow flies) — sanity-checks the formula isn't wildly wrong, not an
// exact pin.
var berkeleyToSf = milesBetween(37.8715, -122.273, 37.7749, -122.4194);
assertTrue(berkeleyToSf > 8 && berkeleyToSf < 13, "milesBetween: Berkeley->SF lands in the ~8-13mi sanity range");

assertEqual(Math.round(milesBetween(37.8, -122.2, 37.8, -122.2)), 0, "milesBetween: same point is 0mi");

// --- buildArtistIndex ------------------------------------------------------

var idx = buildArtistIndex(
  [{ artist: "Kruder & Dorfmeister" }, { artist: "The Rolling Stones" }],
  [{ artist: "Thievery Corporation" }],
  [{ artist: "Black Uhuru" }]
);
assertTrue(idx.set.has("kruder dorfmeister"), "buildArtistIndex: catalog artist normalized and present");
assertTrue(idx.set.has("thievery corporation"), "buildArtistIndex: wishlist artist normalized and present");
assertTrue(idx.set.has("black uhuru"), "buildArtistIndex: watching-only artist counted too (v18.5 consistency)");
assertTrue(idx.set.has("rolling stones"), "buildArtistIndex: leading 'The' stripped by normalization");
assertEqual(idx.display["kruder dorfmeister"], "Kruder & Dorfmeister", "buildArtistIndex: display map keeps original casing/punctuation");
assertEqual(idx.set.has("some random band"), false, "buildArtistIndex: an unrelated artist is not present");

var idxEmpty = buildArtistIndex([{ artist: "" }, {}], null, undefined);
assertEqual(idxEmpty.set.size, 0, "buildArtistIndex: blank/missing artist fields and null/undefined lists don't throw or add entries");

// --- matchSeatGeekEvents ----------------------------------------------------

var fakeEvents = [
  {
    id: 111,
    title: "Kruder & Dorfmeister",
    datetime_local: "2026-09-10T20:00:00",
    performers: [{ name: "Kruder & Dorfmeister", primary: true }],
    venue: { name: "The Fillmore", city: "San Francisco", state: "CA", lat: 37.784, lon: -122.433 },
    stats: { lowest_price: 45, highest_price: 120 },
    url: "https://seatgeek.com/example",
  },
  {
    id: 222,
    title: "Unauthorized Rolling Stones",
    datetime_local: "2026-09-12T19:00:00",
    performers: [{ name: "Unauthorized Rolling Stones", primary: true }],
    venue: { name: "Some Bar", city: "Oakland", state: "CA", lat: 37.8, lon: -122.27 },
    stats: {},
  },
  {
    id: 333,
    title: "A Random Unrelated Band",
    datetime_local: "2026-09-13T19:00:00",
    performers: [{ name: "A Random Unrelated Band", primary: true }],
    venue: { name: "Some Club", city: "SF", lat: 37.77, lon: -122.42 },
    stats: {},
  },
];
var seatgeekMatches = matchSeatGeekEvents(fakeEvents, idx, 37.7749, -122.4194);
assertEqual(seatgeekMatches.length, 1, "matchSeatGeekEvents: only the real, catalog-matching, non-tribute event survives");
assertEqual(seatgeekMatches[0].artist, "Kruder & Dorfmeister", "matchSeatGeekEvents: matched event carries the display-cased artist name");
assertTrue(typeof seatgeekMatches[0].distanceMi === "number", "matchSeatGeekEvents: distance computed from venue lat/lon");

// A tribute act sharing the exact catalog artist's normalized name (no
// qualifier in the performer name itself) must still be dropped via the
// event-title check — same defense tour-dates.mjs already relies on.
var tributeIdx = buildArtistIndex([{ artist: "Sade" }], [], []);
var tributeEvents = [{
  id: 444,
  title: "Ultimate Sade Tribute Concert",
  datetime_local: "2026-10-01T20:00:00",
  performers: [{ name: "Sade", primary: true }],
  venue: { name: "Small Theater", city: "San Leandro", lat: 37.7, lon: -122.15 },
  stats: {},
}];
assertEqual(matchSeatGeekEvents(tributeEvents, tributeIdx, 37.7749, -122.4194).length, 0, "matchSeatGeekEvents: tribute event title blocks a match even with bare performer name");

// --- matchVenueShows ---------------------------------------------------------

var venueIdx = buildArtistIndex([{ artist: "Black Uhuru" }], [], []);
var fakeVenueShows = [
  {
    id: "manual-black-uhuru-2026-09-13",
    artist: "Black Uhuru",
    venue: "Sweetwater Music Hall",
    city: "Mill Valley, CA",
    date: "2026-09-13",
    dateLabel: "Sun, Sep 13, 2026",
    source: "Manual entry — verified 2026-08-04",
    url: "https://example.com/tix",
  },
  {
    // same artist, real show, but outside the trip's date window
    id: "manual-black-uhuru-2027-01-01",
    artist: "Black Uhuru",
    venue: "Sweetwater Music Hall",
    city: "Mill Valley, CA",
    date: "2027-01-01",
    source: "Manual entry",
  },
  {
    // an artist not in the index at all
    id: "venue-x-0",
    artist: "Some Other Act",
    venue: "Cornerstone",
    city: "Berkeley, CA",
    date: "2026-09-13",
    source: "Venue: Cornerstone",
  },
  {
    // real artist, real date, but an unknown venue with no coords -> skip, don't guess
    id: "venue-x-1",
    artist: "Black Uhuru",
    venue: "Some Unmapped Venue",
    city: "Nowhere, CA",
    date: "2026-09-13",
    source: "Venue: Some Unmapped Venue",
  },
];
// Destination near Mill Valley (Sweetwater's own coordinates) so the
// within-25mi check passes for the real match.
var sweetwater = VENUE_COORDS["sweetwater music hall"];
var venueMatches = matchVenueShows(fakeVenueShows, venueIdx, sweetwater.lat, sweetwater.lon, "2026-09-01", "2026-09-20");
assertEqual(venueMatches.length, 1, "matchVenueShows: only the in-window, in-radius, catalog-matching, known-venue show survives");
assertEqual(venueMatches[0].venue, "Sweetwater Music Hall", "matchVenueShows: surviving match is the expected Sweetwater show");

// Same real show, but the trip destination is far away (e.g. near Denver) —
// should NOT match even though everything else lines up, since venue-shows
// is Bay-Area-only and this is the honest "no overlap" case.
var farMatches = matchVenueShows(fakeVenueShows, venueIdx, 39.7392, -104.9903, "2026-09-01", "2026-09-20");
assertEqual(farMatches.length, 0, "matchVenueShows: a real Bay Area match correctly does not surface for a far-away destination");

// --- summary ----------------------------------------------------------------

console.log(passed + " passed, " + failed + " failed");
if (failed > 0) process.exit(1);
