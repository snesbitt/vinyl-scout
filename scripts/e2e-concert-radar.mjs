// scripts/e2e-concert-radar.mjs — one-off E2E harness, not committed to the
// deploy path. Loads the REAL concert-radar.html into a jsdom document,
// mocks every fetch() endpoint it calls with representative fixture data
// (including realistic watching-list artist-name spelling variants for
// Black Uhuru / Easy Star All-Stars / Burning Spear), lets the page's own
// script run its real init sequence, and inspects the real rendered DOM —
// not a reimplementation of the matching logic, the actual shipped code.
//
// Why this exists: 2026-08-04, no live browser/API access was available
// this session (Claude-in-Chrome not connected, vinylscout.org blocked by
// its own robots.txt for WebFetch, no outbound curl). This is the closest
// thing to a real end-to-end check achievable without those — it will NOT
// catch a live deploy/build failure or a genuine mismatch in Susan's own
// stored watching-list data, only bugs in the client-side logic itself.

import { JSDOM } from "jsdom";
import fs from "node:fs";

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

async function run(label, watchingList) {
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
    if (u.startsWith("/api/venue-shows")) return ok({ shows: manualShows, meta: { venues: [] } });
    if (u.startsWith("/api/catalog-cache")) return ok({ shows: [], artistCount: 0, at: null });
    if (u.startsWith("/api/tour-dates")) return ok({ shows: [] });
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
  window.close();
}

await run("Exact spelling match (watching list = MANUAL_SHOWS spelling exactly)", watching);
await run("Realistic spelling drift (Easy Star Allstars / Easy Star All Stars)", [
  { id: "w1", artist: "black uhuru" },
  { id: "w2", artist: "Easy Star All Stars" },
  { id: "w3", artist: "Burning Spear" },
]);
