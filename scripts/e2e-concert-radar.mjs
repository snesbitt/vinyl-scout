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
const records = [{ artist: "Kruder & Dorfmeister" }, { artist: "Thievery Corporation" }, { artist: "Herbie Hancock" }];
const wishlist = [{ artist: "Fleetwood Mac" }];

// Susan's actual watching list is server-side (Netlify Blobs) and not
// reachable from this session — these three spellings are plausible real
// variants to stress-test the v18.4 normalizeArtistKey fix against, since
// the exact stored spelling is the one thing this harness cannot verify.
const watching = [
  { id: "w1", artist: "Black Uhuru" },
  { id: "w2", artist: "Easy Star All-Stars" }, // exact MANUAL_SHOWS spelling
  { id: "w3", artist: "Burning Spear" },
  // 2026-08-14 regression fixture — Susan live-caught this exact shape:
  // Thievery Corporation's Watching-panel summary named the wrong venue
  // (The Masonic, SF) and a fabricated-looking "2 dates" range when she
  // actually holds a ticket to a single date at The Fox in Oakland — two
  // genuinely different real bookings silently merged into one composite.
  // "Poolside" here is a fictional stand-in artist with the same shape:
  // two real matches at two genuinely DIFFERENT venues (see
  // poolsideVenueShows below) — the fix must render each as its own
  // venue line, never blended into one range.
  // 2026-08-15 (Susan, direct: "if i'm going to a show, remove hide this
  // show and get tickets / be way smarter"): a separate watched artist
  // (not Poolside, so its existing not-going assertions stay meaningful)
  // with goingShowId pre-set to one of its two real venue matches — see
  // riversideVenueShows below. Lets the assertions confirm the going
  // venue's block drops "Hide this show" and "Get tickets" while the
  // still-not-going venue keeps both. Placed BEFORE Poolside so Poolside
  // stays the last row — its own assertions below slice watchHtml from
  // Poolside's name to the end of the list, which only stays valid if
  // nothing else follows it.
  { id: "w5", artist: "Riverside", going: true, goingShowId: "venue-crest-riverside-2026-08-20" },
  { id: "w4", artist: "Poolside" },
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

// 2026-08-14 regression fixtures for the two bugs Susan live-caught the
// same day — see the watching[]/hancockJambaseShow/hancockSeatGeekShow
// comments alongside each for the specific real-world shape each mirrors.
const poolsideVenueShows = [
  {
    id: "venue-fox-poolside-2026-08-15",
    artist: "Poolside",
    title: "Poolside",
    venue: "The Fox Theater",
    city: "Oakland, CA",
    date: "2026-08-15",
    dateLabel: "Sat, Aug 15, 2026",
    source: "Venue: Another Planet Entertainment",
    priceLow: null,
    priceHigh: null,
    url: "https://apeconcerts.com/events/poolside-fox",
  },
  {
    id: "venue-masonic-poolside-2026-09-12",
    artist: "Poolside",
    title: "Poolside",
    venue: "The Masonic",
    city: "San Francisco, CA",
    date: "2026-09-12",
    dateLabel: "Sat, Sep 12, 2026",
    source: "Venue: Another Planet Entertainment",
    priceLow: null,
    priceHigh: null,
    url: "https://apeconcerts.com/events/poolside-masonic",
  },
];

// dedupeSameShow() regression fixture — Susan live-caught Herbie Hancock
// at Davies Symphony Hall, Aug 17 2026, rendering as two separate Coming
// Soon cards: one via JamBase naming the venue "Davies Symphony Hall",
// one via SeatGeek naming it "Louise M. Davies Symphony Hall" — literally
// the same real show, same date, same building, dedupeById() can't catch
// it since each source mints its own id. SeatGeek's fixture deliberately
// has no price so this also exercises dedupeSameShow()'s price-backfill
// path (SeatGeek wins on source priority but should inherit JamBase's
// price since its own is null).
const hancockJambaseShow = {
  id: "jambase-hancock-1",
  artist: "Herbie Hancock",
  title: "Herbie Hancock at Davies Symphony Hall",
  venue: "Davies Symphony Hall",
  city: "San Francisco, CA",
  date: "2026-08-17",
  dateLabel: "Mon, Aug 17, 2026",
  source: "JamBase",
  priceLow: 60,
  priceHigh: 150,
  url: "https://www.jambase.com/show/herbie-hancock-1",
};
const hancockSeatGeekShow = {
  id: "seatgeek-hancock-1",
  artist: "Herbie Hancock",
  title: "Herbie Hancock",
  venue: "Louise M. Davies Symphony Hall",
  city: "San Francisco, CA",
  date: "2026-08-17",
  dateLabel: "Mon, Aug 17, 2026",
  source: "SeatGeek",
  priceLow: null,
  priceHigh: null,
  url: "https://seatgeek.com/herbie-hancock-tickets",
};

// 2026-08-15 regression fixture — same two-genuinely-different-real-venues
// shape as poolsideVenueShows above, for a watched artist ("Riverside")
// whose watching[] entry (above) already has going/goingShowId pre-set to
// the first of these two. Confirms the going venue's block hides "Hide
// this show"/"Get tickets" while the second, still-not-going venue keeps
// both — see the assertions below.
const riversideVenueShows = [
  {
    id: "venue-crest-riverside-2026-08-20",
    artist: "Riverside",
    title: "Riverside",
    venue: "The Crest Theatre",
    city: "Sacramento, CA",
    date: "2026-08-20",
    dateLabel: "Thu, Aug 20, 2026",
    source: "Venue: Another Planet Entertainment",
    priceLow: null,
    priceHigh: null,
    url: "https://apeconcerts.com/events/riverside-crest",
  },
  {
    id: "venue-warfield-riverside-2026-10-03",
    artist: "Riverside",
    title: "Riverside",
    venue: "The Warfield",
    city: "San Francisco, CA",
    date: "2026-10-03",
    dateLabel: "Sat, Oct 3, 2026",
    source: "Venue: Another Planet Entertainment",
    priceLow: null,
    priceHigh: null,
    url: "https://apeconcerts.com/events/riverside-warfield",
  },
];

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
      return ok({ shows: manualShows.concat(irrelevantVenueShows).concat([relevantUnwatchedVenueShow]).concat(poolsideVenueShows).concat(riversideVenueShows), meta: { venues: [] } });
    }
    // v21: jambase-shows.mjs, third source — same shape/filtering contract
    // as venue-shows.mjs above, deliberately mirrored fixtures.
    if (u.startsWith("/api/jambase-shows")) {
      return ok({ shows: irrelevantJambaseShows.concat([relevantUnwatchedJambaseShow, hancockJambaseShow]), meta: {} });
    }
    if (u.startsWith("/api/catalog-cache")) return ok({ shows: [], artistCount: 0, at: null });
    if (u.startsWith("/api/tour-dates")) {
      // 2026-08-14 dedup fixture: only "Herbie Hancock" gets a real
      // SeatGeek match here — every other per-artist query stays empty,
      // same as before this fixture was added.
      if (u.includes("Herbie")) return ok({ shows: [hancockSeatGeekShow] });
      return ok({ shows: [] });
    }
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

  // 2026-08-14: dedupeSameShow() regression — the same real Herbie Hancock
  // show, reported by both JamBase ("Davies Symphony Hall") and SeatGeek
  // ("Louise M. Davies Symphony Hall"), must collapse into exactly ONE
  // Coming Soon card, not two. Counts literal <div class="cr-artist">
  // occurrences rather than a plain substring count, since the artist name
  // could otherwise also match inside a venue/city string coincidentally.
  const hancockCardCount = (soonHtml.match(/<div class="cr-artist">Herbie Hancock<\/div>/g) || []).length;
  report("  Herbie Hancock (JamBase + SeatGeek, same real show) should render as exactly ONE Coming Soon card: " +
    (hancockCardCount === 1 ? "pass" : "FAIL (rendered " + hancockCardCount + " cards, expected 1)"));
  // The merged card should also carry a real price — SeatGeek wins on
  // source priority but its own fixture has no price, so this only
  // passes if dedupeSameShow() actually backfills JamBase's $60 – $150.
  const hancockPricePresent = hancockCardCount === 1 && /Herbie Hancock[\s\S]{0,400}\$60.{0,3}\$150/.test(soonHtml);
  report("  Herbie Hancock's merged card should show the backfilled $60 – $150 price: " +
    (hancockPricePresent ? "pass" : "FAIL (price missing or not backfilled from the lower-priority source)"));

  // 2026-08-15 (Susan, direct: "if i'm going to a show, remove hide this
  // show and get tickets / be way smarter"): "Riverside" is watched with
  // going/goingShowId pre-set to its Crest Theatre (Sacramento) match, and
  // has a second, still-not-going match at The Warfield (SF) — see
  // riversideVenueShows above. The going venue's block should drop "Hide
  // this show" and "Get tickets"; the not-going venue should keep both.
  // Sliced strictly between "Riverside" and "Poolside" (the next row in
  // watching[]) so a check here can never accidentally read past its own
  // row into another artist's markup.
  const expectsRiverside = watchingList.some((w) => w.artist === "Riverside");
  const riversideIdx = watchHtml.indexOf("Riverside");
  const poolsideBoundaryIdx = watchHtml.indexOf("Poolside");
  if (!expectsRiverside) {
    // Not every scenario's watchingList includes the Riverside fixture
    // (e.g. the spelling-drift scenario uses its own separate list) —
    // nothing to check here for those, same guard Poolside's own block
    // uses below.
  } else if (riversideIdx === -1) {
    report("  Riverside row: FAIL (not rendered at all)");
  } else {
    const riversideHtml = watchHtml.slice(riversideIdx, poolsideBoundaryIdx === -1 ? undefined : poolsideBoundaryIdx);
    const crestIdx = riversideHtml.indexOf("The Crest Theatre");
    const warfieldIdx = riversideHtml.indexOf("The Warfield");
    report("  Riverside's going (Crest Theatre) block should show the GOING state: " +
      (/cr-watch-going--active/.test(riversideHtml) ? "pass" : "FAIL (no active going button found anywhere in the row)"));
    if (crestIdx === -1 || warfieldIdx === -1) {
      report("  Riverside row: FAIL (missing an expected venue block — Crest at " + crestIdx + ", Warfield at " + warfieldIdx + ")");
    } else {
      // Each venue's own slice runs to the start of the next venue block
      // (or the end of the row for the last one), so a check here can't
      // accidentally read the OTHER venue's controls.
      const crestFirst = crestIdx < warfieldIdx;
      const crestBlock = crestFirst ? riversideHtml.slice(crestIdx, warfieldIdx) : riversideHtml.slice(crestIdx);
      const warfieldBlock = crestFirst ? riversideHtml.slice(warfieldIdx) : riversideHtml.slice(warfieldIdx, crestIdx);
      report("  Going venue (Crest Theatre) should NOT show \"Hide this show\": " +
        (crestBlock.includes("Hide this show") ? "FAIL (still shown for a confirmed-going venue)" : "pass"));
      report("  Going venue (Crest Theatre) should NOT show \"Get tickets\": " +
        (crestBlock.includes("Get tickets") ? "FAIL (still shown for a confirmed-going venue)" : "pass"));
      report("  Not-going venue (The Warfield) should STILL show \"Hide this show\": " +
        (warfieldBlock.includes("Hide this show") ? "pass" : "FAIL (missing — over-suppressed onto the wrong venue?)"));
      report("  Not-going venue (The Warfield) should STILL show \"Get tickets\": " +
        (warfieldBlock.includes("Get tickets") ? "pass" : "FAIL (missing — over-suppressed onto the wrong venue?)"));
    }
  }

  // 2026-08-14: Watching-panel per-venue grouping regression — "Poolside"
  // has two matches at two genuinely DIFFERENT real venues (The Fox
  // Theater, Oakland; The Masonic, San Francisco). The fix must render
  // both venue lines separately within Poolside's row, never blend them
  // into one composite date range the way Thievery Corporation's real
  // bug did (wrong venue shown, a fabricated-looking multi-date span).
  const expectsPoolside = watchingList.some((w) => w.artist === "Poolside");
  const poolsideIdx = watchHtml.indexOf("Poolside");
  if (!expectsPoolside) {
    // Not every scenario's watchingList includes the Poolside fixture
    // (e.g. the spelling-drift scenario uses its own separate list) —
    // nothing to check here for those.
  } else if (poolsideIdx === -1) {
    report("  Poolside row: FAIL (not rendered at all)");
  } else {
    // Poolside is the last row in `watching`, so its own markup runs to
    // the end of #cr-watch-list — safe to slice from its name to the end.
    const poolsideHtml = watchHtml.slice(poolsideIdx);
    const hasFox = /The Fox Theater.{0,20}Oakland, CA/.test(poolsideHtml);
    const hasMasonic = /The Masonic.{0,20}San Francisco, CA/.test(poolsideHtml);
    report("  Poolside row SHOULD show The Fox Theater — Oakland, CA as its own venue line: " + (hasFox ? "pass" : "FAIL (missing)"));
    report("  Poolside row SHOULD ALSO show The Masonic — San Francisco, CA as its own venue line: " + (hasMasonic ? "pass" : "FAIL (missing — likely merged/lost instead of shown separately)"));
    // The real bug rendered a fabricated "2 dates" range spanning both
    // venues — with the fix, neither venue has more than one date, so
    // that composite phrasing should never appear anywhere in this row.
    const hasFabricatedRange = /\d dates/.test(poolsideHtml);
    report("  Poolside row should NOT show a merged multi-date range across different venues: " + (hasFabricatedRange ? "FAIL (found a fabricated N-dates range)" : "pass"));

    // 2026-08-14, same-day follow-up: Susan's real Thievery Corporation
    // case exposed that "going" was per-ARTIST, not per-venue — she was
    // only going to the Fox Oakland show but the single going toggle had
    // no way to say that, and no way to say "not interested in the other
    // one" either. Both are now per-venue-group controls; confirm each
    // of Poolside's two venue blocks renders its OWN going button (with a
    // distinct data-watch-going-show id) and its own dismiss control,
    // rather than one shared pair for the whole row.
    const goingBtnCount = (poolsideHtml.match(/data-watch-going-show="[^"]+"/g) || []).length;
    report("  Poolside row SHOULD have its own \"I'm going\" button per venue (2 expected): " + (goingBtnCount === 2 ? "pass" : "FAIL (found " + goingBtnCount + ", expected 2 — going may still be merged per-artist)"));
    const dismissBtnCount = (poolsideHtml.match(/class="cr-watch-dismiss"/g) || []).length;
    report("  Poolside row SHOULD have its own dismiss (\"not going to this one\") control per venue (2 expected): " + (dismissBtnCount === 2 ? "pass" : "FAIL (found " + dismissBtnCount + ", expected 2)"));
  }

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
