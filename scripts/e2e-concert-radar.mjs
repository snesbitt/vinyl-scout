// scripts/e2e-concert-radar.mjs — real E2E regression harness, committed
// and run via `npm run test:concert-radar-e2e`. Loads the REAL
// concert-radar.html into a jsdom document, mocks every fetch() endpoint it
// calls with representative fixture data, lets the page's own script run
// its real init sequence, and inspects the real rendered DOM — not a
// reimplementation of the matching logic, the actual shipped code.
//
// Covers two bug classes found live by Susan the same day (2026-08-04):
// (1) v18.4 — artist-name punctuation/spacing drift ("Easy Star All-Stars"
// vs "Easy Star Allstars") silently breaking Watching-panel matches.
// (2) v18.5 — venue-shows.mjs's full per-venue calendar (irrelevant shows
// included) leaking into Coming Soon unfiltered, instead of being scoped to
// artists Susan actually cares about (catalog/wishlist/watching).
// (3) 2026-08-06 — checkTravelMatches() (Phase 10, the Concert Radar half
// of the Travel Intelligence integration): a real cross-site hit against
// travelintelligence.org/api/watched-trips + this site's own
// /api/artists-playing should append a .travel-match note onto the correct
// watching row, an unmatched artist should get no note, and a failed/empty
// travel fetch should silently leave every row exactly as it already
// rendered — this file never had a fixture for any of the three until now,
// so a regression here (e.g. a future CORS-header or selector change)
// previously had no test coverage in this repo at all.
//
// Why a jsdom harness exists at all: no live browser/API access was
// available in the session that wrote this (Claude-in-Chrome not
// connected, vinylscout.org blocked by its own robots.txt for WebFetch, no
// outbound curl). This is the closest thing to a real end-to-end check
// achievable without those — it will NOT catch a live deploy/build failure
// or a genuine mismatch in Susan's own stored watching-list data, only bugs
// in the client-side logic itself.

import { JSDOM } from "jsdom";
import fs from "node:fs";

// Lightweight pass/fail tracking so this harness can act as a real
// regression gate (non-zero exit on any FAIL), not just a printout someone
// has to read closely. Only wraps assertions that already self-report as
// "pass"/"FAIL" in their own message text — the original MATCHED/NO MATCH/
// unclear watch-list lines are left as plain diagnostic output, unchanged,
// since "NO MATCH (Check live)" is the CORRECT outcome for an artist with
// no fixture show (Burning Spear) and collapsing that nuance into a binary
// pass/fail here risked asserting something this file's author never
// actually claimed.
let failCount = 0;
function report(message) {
  if (/\bFAIL\b/.test(message)) failCount++;
  console.log(message);
}

const html = fs.readFileSync(new URL("../concert-radar.html", import.meta.url), "utf8");

// --- Fixture data -----------------------------------------------------
const records = [{ artist: "Kruder & Dorfmeister" }, { artist: "Thievery Corporation" }];
const wishlist = [{ artist: "Fleetwood Mac" }];

// Susan's actual watching list is server-side (Netlify Blobs) and not
// reachable from this session — these three spellings are plausible real
// variants to stress-test the v18.4 normalizeArtistKey fix against, since
// the exact stored spelling is the one thing this harness cannot verify.
const watching = [
  { id: "w1", artist: "Black Uhuru" },
  { id: "w2", artist: "Easy Star All-Stars" }, // exact MANUAL_SHOWS spelling
  { id: "w3", artist: "Burning Spear" },
];

// v18.5 regression fixtures: two shows that should NEVER reach Coming Soon
// (irrelevant to Susan — nobody watching/catalog/wishlist has anything to
// do with either), simulating what a venue's full scraped calendar looks
// like once you get past the handful of shows that actually matter. Plus
// one relevant-but-unwatched show (Thievery Corporation, already in the
// `records` fixture above) at a scraped venue, to confirm relevance
// filtering doesn't over-correct into hiding real matches too.
const irrelevantVenueShows = [
  {
    id: "venue-sweetwater-99-2026-09-20",
    artist: "The Wednesday Night Jazz Quartet",
    title: "The Wednesday Night Jazz Quartet",
    venue: "Sweetwater Music Hall",
    city: "Mill Valley, CA",
    date: "2026-09-20",
    dateLabel: "Sun, Sep 20, 2026",
    source: "Venue: Sweetwater Music Hall",
    priceLow: null,
    priceHigh: null,
    url: "https://sweetwatermusichall.org/events/wednesday-jazz",
  },
  {
    id: "venue-sweetwater-100-2026-09-27",
    artist: "Open Mic Night",
    title: "Open Mic Night",
    venue: "Sweetwater Music Hall",
    city: "Mill Valley, CA",
    date: "2026-09-27",
    dateLabel: "Sun, Sep 27, 2026",
    source: "Venue: Sweetwater Music Hall",
    priceLow: null,
    priceHigh: null,
    url: "https://sweetwatermusichall.org/events/open-mic",
  },
];
const relevantUnwatchedVenueShow = {
  id: "venue-fillmore-1-2026-11-01",
  artist: "Thievery Corporation",
  title: "Thievery Corporation",
  venue: "The Independent",
  city: "San Francisco, CA",
  date: "2026-11-01",
  dateLabel: "Sun, Nov 1, 2026",
  source: "Venue: Another Planet Entertainment",
  priceLow: null,
  priceHigh: null,
  url: "https://apeconcerts.com/events/thievery-corporation",
};

// v21 fixtures — JamBase's third feed, same irrelevant/relevant-unwatched
// pattern as the venue-shows fixtures above, since jambase-shows.mjs's
// output goes through the identical artistIsRelevant() filter.
const irrelevantJambaseShows = [
  {
    id: "jambase-88881",
    artist: "Some Unrelated Cover Band",
    title: "Some Unrelated Cover Band at The Warfield",
    venue: "The Warfield",
    city: "San Francisco, CA",
    date: "2026-09-05",
    dateLabel: "Sat, Sep 5, 2026",
    source: "JamBase",
    priceLow: null,
    priceHigh: null,
    url: "https://www.jambase.com/show/unrelated-88881",
  },
];
const relevantUnwatchedJambaseShow = {
  id: "jambase-77771",
  artist: "Kruder & Dorfmeister",
  title: "Kruder & Dorfmeister at The Masonic",
  venue: "The Masonic",
  city: "San Francisco, CA",
  date: "2026-11-15",
  dateLabel: "Sun, Nov 15, 2026",
  source: "JamBase",
  priceLow: 45,
  priceHigh: 85,
  url: "https://www.jambase.com/show/kruder-dorfmeister-77771",
};

const manualShows = [
  {
    id: "manual-black-uhuru-2026-09-13",
    artist: "Black Uhuru",
    title: "Black Uhuru",
    venue: "Sweetwater Music Hall",
    city: "Mill Valley, CA",
    date: "2026-09-13",
    dateLabel: "Sun, Sep 13, 2026",
    source: "Manual entry — verified 2026-08-04",
    priceLow: null,
    priceHigh: null,
    url: "https://www.etix.com/ticket/p/93358603/black-uhuru-mill-valley-sweetwater-music-hall?partner_id=100",
  },
  {
    id: "manual-easy-star-all-stars-2026-10-24",
    artist: "Easy Star All-Stars",
    title: "Easy Star All-Stars",
    venue: "The Guild Theatre",
    city: "Menlo Park, CA",
    date: "2026-10-24",
    dateLabel: "Sat, Oct 24, 2026",
    source: "Manual entry — verified 2026-08-04",
    priceLow: null,
    priceHigh: null,
    url: "https://www.guildtheatre.com/shows/easy-star-all-stars-24-oct",
  },
  {
    id: "manual-easy-star-all-stars-2026-10-22",
    artist: "Easy Star All-Stars",
    title: "Easy Star All-Stars",
    venue: "Cornerstone",
    city: "Berkeley, CA",
    date: "2026-10-22",
    dateLabel: "Thu, Oct 22, 2026",
    source: "Manual entry — verified 2026-08-04 (Songkick, not venue-confirmed)",
    priceLow: null,
    priceHigh: null,
    url: "https://www.songkick.com/concerts/43348377-easy-star-allstars-at-cornerstone-berkeley",
  },
];

function extractInlineScript(htmlText) {
  const m = htmlText.match(/<script>([\s\S]*?)<\/script>\s*<\/body>/);
  if (!m) throw new Error("could not find the page's main inline <script>");
  return m[1];
}

const scriptText = extractInlineScript(html);

async function run(label, watchingList, travelOpts) {
  travelOpts = travelOpts || {};
  // runScripts: "outside-only" parses the document but does NOT
  // auto-execute the inline <script> tag — that lets fetch be wired up
  // first, then the real script text is eval'd into the same window via
  // window.eval below, so it's the actual shipped code running against a
  // real DOM and jsdom's own built-in localStorage, not a reimplementation.
  const dom = new JSDOM(html, { runScripts: "outside-only", resources: "usable", url: "https://vinylscout.org/concert-radar.html" });
  const { window } = dom;

  window.fetch = async (url) => {
    const u = String(url);
    const ok = (body) => ({ ok: true, json: async () => body });
    if (u.startsWith("/api/records")) return ok(records);
    if (u.startsWith("/api/wishlist")) return ok(wishlist);
    if (u.startsWith("/api/watching")) return ok(watchingList);
    if (u.startsWith("/api/venue-shows")) {
      return ok({ shows: manualShows.concat(irrelevantVenueShows).concat([relevantUnwatchedVenueShow]), meta: { venues: [] } });
    }
    // v21: jambase-shows.mjs, third source — same shape/filtering contract
    // as venue-shows.mjs above, deliberately mirrored fixtures.
    if (u.startsWith("/api/jambase-shows")) {
      return ok({ shows: irrelevantJambaseShows.concat([relevantUnwatchedJambaseShow]), meta: {} });
    }
    if (u.startsWith("/api/catalog-cache")) return ok({ shows: [], artistCount: 0, at: null });
    if (u.startsWith("/api/tour-dates")) return ok({ shows: [] });
    // Phase 10 — checkTravelMatches()'s two cross-site calls. Absolute URL
    // for Travel Intelligence's endpoint (hardcoded in concert-radar.html,
    // same as production); this site's own /api/artists-playing resolves
    // relative to the jsdom window's origin (vinylscout.org, set below).
    if (u === "https://travelintelligence.org/api/watched-trips") {
      if (travelOpts.watchedTripsFails) return { ok: false, json: async () => ({}) };
      return ok({ trips: travelOpts.trips || [] });
    }
    if (u.includes("/api/artists-playing")) {
      return ok({ matches: travelOpts.artistsPlaying || [] });
    }
    return { ok: false, json: async () => ({}) };
  };

  window.eval(scriptText);

  // Let the page's init sequence (fetchWatching -> renderList -> sweepCatalog -> ...) settle.
  await new Promise((resolve) => setTimeout(resolve, 300));
  // sweepCatalog's promise chain isn't directly observable from outside the
  // IIFE, so poll a few times for the DOM to stop changing rather than
  // trusting one fixed delay.
  let prev = null;
  for (let i = 0; i < 15; i++) {
    const cur = window.document.getElementById("cr-watch-list")?.innerHTML || "";
    if (cur === prev) break;
    prev = cur;
    await new Promise((resolve) => setTimeout(resolve, 200));
  }

  const watchHtml = window.document.getElementById("cr-watch-list")?.innerHTML || "(missing #cr-watch-list)";
  console.log("=== " + label + " ===");
  watchingList.forEach((w) => {
    const name = w.artist;
    const idx = watchHtml.toLowerCase().indexOf(name.toLowerCase());
    if (idx === -1) {
      console.log("  " + name + ": NOT RENDERED AT ALL (row missing)");
      return;
    }
    const windowText = watchHtml.slice(idx, idx + 400).replace(/\s+/g, " ");
    const hasVenue = /cr-watch-venue/.test(windowText);
    const hasCheckLive = /Check live/.test(windowText);
    console.log("  " + name + ": " + (hasVenue ? "MATCHED (venue shown)" : hasCheckLive ? "NO MATCH (Check live)" : "unclear") );
  });

  // v18.5: Coming Soon relevancy check — a venue's full calendar (irrelevant
  // shows included) should never leak into #cr-list; a real, relevant-but-
  // unwatched match should.
  const soonHtml = window.document.getElementById("cr-list")?.innerHTML || "(missing #cr-list)";
  irrelevantVenueShows.forEach((s) => {
    const leaked = soonHtml.toLowerCase().includes(s.artist.toLowerCase());
    report("  Coming Soon should NOT show \"" + s.artist + "\": " + (leaked ? "FAIL (leaked into Coming Soon)" : "pass (correctly filtered out)"));
  });
  const relevantShown = soonHtml.toLowerCase().includes(relevantUnwatchedVenueShow.artist.toLowerCase());
  report("  Coming Soon SHOULD show \"" + relevantUnwatchedVenueShow.artist + "\" (relevant, unwatched): " + (relevantShown ? "pass" : "FAIL (relevant match missing)"));

  // v21: same relevancy check, now for jambase-shows.mjs's output too —
  // proves sweepCatalog()'s v21 wiring actually filters the new source,
  // not just merges it in unfiltered.
  irrelevantJambaseShows.forEach((s) => {
    const leaked = soonHtml.toLowerCase().includes(s.artist.toLowerCase());
    report("  Coming Soon should NOT show \"" + s.artist + "\" (JamBase, irrelevant): " + (leaked ? "FAIL (leaked into Coming Soon)" : "pass (correctly filtered out)"));
  });
  // esc() HTML-escapes "&" to "&amp;" in the real rendered output — check
  // for the escaped form too, not just the raw fixture string, so this
  // assertion isn't a false negative on an artist name with a "&" in it.
  const jambaseArtistEscaped = relevantUnwatchedJambaseShow.artist.toLowerCase().replace(/&/g, "&amp;");
  const jambaseRelevantShown = soonHtml.toLowerCase().includes(relevantUnwatchedJambaseShow.artist.toLowerCase()) || soonHtml.toLowerCase().includes(jambaseArtistEscaped);
  report("  Coming Soon SHOULD show \"" + relevantUnwatchedJambaseShow.artist + "\" (JamBase, relevant, unwatched): " + (jambaseRelevantShown ? "pass" : "FAIL (relevant JamBase match missing)"));

  // v21.1: JamBase's card should carry a real attribution link to
  // jambase.com (sourceCreditHtml() in concert-radar.html), unlike every
  // other source's plain-text "via {source}" tag — see that file's own
  // v21.1 header note for why. Checks both that the link exists and that
  // it's actually anchored to the JamBase card, not just present anywhere
  // on the page (a Watching-panel .travel-match note or unrelated markup
  // could otherwise produce a false pass).
  const jambaseLinkPresent = /<a class="cr-source" href="https:\/\/www\.jambase\.com\/"[^>]*>via JamBase<\/a>/.test(soonHtml);
  report("  JamBase card's source tag SHOULD be a real link to jambase.com: " + (jambaseLinkPresent ? "pass" : "FAIL (missing or not a link — check sourceCreditHtml())"));

  // Phase 10: checkTravelMatches() is fire-and-forget, appended after the
  // watch list's own render — give its two chained fetches (watched-trips,
  // then per-trip artists-playing) time to settle before inspecting rows.
  if (travelOpts.trips || travelOpts.watchedTripsFails) {
    let prevTravel = null;
    for (let i = 0; i < 15; i++) {
      const cur = window.document.getElementById("cr-watch-list")?.innerHTML || "";
      if (cur === prevTravel) break;
      prevTravel = cur;
      await new Promise((resolve) => setTimeout(resolve, 200));
    }
    const rows = window.document.querySelectorAll(".cr-watch-row");
    (travelOpts.expectMatchFor || []).forEach((artist) => {
      const idx = watchingList.findIndex((w) => w.artist.toLowerCase() === artist.toLowerCase());
      const row = idx === -1 ? null : rows[idx];
      const note = row ? row.querySelector(".travel-match") : null;
      report("  .travel-match note for \"" + artist + "\": " + (note ? "pass (" + note.textContent.trim() + ")" : "FAIL (no note rendered)"));
    });
    (travelOpts.expectNoMatchFor || []).forEach((artist) => {
      const idx = watchingList.findIndex((w) => w.artist.toLowerCase() === artist.toLowerCase());
      const row = idx === -1 ? null : rows[idx];
      const note = row ? row.querySelector(".travel-match") : null;
      report("  \"" + artist + "\" should have NO .travel-match note: " + (note ? "FAIL (unexpected note: " + note.textContent.trim() + ")" : "pass (none rendered)"));
    });
  }

  window.close();
}

await run("Exact spelling match (watching list = MANUAL_SHOWS spelling exactly)", watching);
await run("Realistic spelling drift (Easy Star Allstars / Easy Star All Stars)", [
  { id: "w1", artist: "black uhuru" },
  { id: "w2", artist: "Easy Star All Stars" },
  { id: "w3", artist: "Burning Spear" },
]);

// --- Phase 10: Travel Intelligence cross-site match --------------------
// A real watched trip (Susan's actual Chicago trip, per travel-intelligence's
// own watched-trips data) plus a real hit from THIS site's own
// /api/artists-playing for one watched artist (Black Uhuru) and a second,
// unrelated artist that should NOT produce a note (not on the watching
// list at all — proves the byArtist cross-reference doesn't over-match).
const chicagoTrip = {
  id: "SFO|ORD|2026-09-14|Economy",
  destination: "Chicago",
  lat: 41.98,
  lon: -87.9,
  dateStart: "2026-09-14",
  dateEnd: "2026-09-16",
};
await run(
  "Travel Intelligence match: a real cross-site hit appends .travel-match to the right row only",
  watching,
  {
    trips: [chicagoTrip],
    artistsPlaying: [
      { artist: "Black Uhuru", venue: "House of Blues Chicago", dateLabel: "Mon, Sep 15, 2026" },
      { artist: "Some Unwatched Band", venue: "Metro Chicago", dateLabel: "Tue, Sep 16, 2026" },
    ],
    expectMatchFor: ["Black Uhuru"],
    expectNoMatchFor: ["Easy Star All-Stars", "Burning Spear"],
  }
);

// No trips at all (Susan has no watched trips, or none with resolved
// coordinates) — checkTravelMatches() should no-op cleanly, no notes
// anywhere, no throw.
await run(
  "Travel Intelligence match: no watched trips at all is a clean no-op",
  watching,
  { trips: [], expectNoMatchFor: ["Black Uhuru", "Easy Star All-Stars", "Burning Spear"] }
);

// travelintelligence.org unreachable (down, CORS regression, offline) —
// checkTravelMatches()'s outer .catch() must swallow it silently, same as
// production behavior; every row should render exactly as it already did.
await run(
  "Travel Intelligence match: a failed cross-site fetch is silently swallowed (fire-and-forget)",
  watching,
  { watchedTripsFails: true, expectNoMatchFor: ["Black Uhuru", "Easy Star All-Stars", "Burning Spear"] }
);

if (failCount > 0) {
  console.log("\n" + failCount + " assertion(s) FAILED — see FAIL lines above.");
  process.exit(1);
} else {
  console.log("\nAll self-reporting assertions passed.");
}
