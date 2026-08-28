// scripts/test-jambase-shows.mjs
// Regression suite for netlify/functions/jambase-shows.mjs.
//
// IMPORTANT — see that file's own "NOT YET LIVE-VERIFIED" header note.
// This fixture (FAKE_JAMBASE_RESPONSE below) was hand-built field-by-field
// from JamBase's own published Concert schema (screenshotted off
// data.jambase.com/api/reference, 2026-08-12) — NOT captured from a real
// API response, because this session had no network path to
// data.jambase.com. Once a real request has been made (device-bridge/
// browser session), diff a real response against this fixture and update
// both it and jambase-shows.mjs's parsing if anything doesn't match —
// this suite proves the parsing logic is internally consistent with the
// documented shape, not that it's correct against the live API.
//
// Pattern matches scripts/test-artists-playing.mjs: imports the real
// exported pure functions directly (no live network), plus one
// end-to-end pass through the default handler with global.fetch mocked.
//
// Run: node scripts/test-jambase-shows.mjs

import {
  isTribute,
  dateLabelFromIso,
  parseEnvelope,
  primaryPerformerName,
  firstUsableOffer,
  addressCityState,
} from "../netlify/functions/jambase-shows.mjs";
import handler from "../netlify/functions/jambase-shows.mjs";

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

function assert(cond, label) {
  if (cond) {
    passed++;
  } else {
    failed++;
    console.error("FAIL: " + label);
  }
}

// --- Unit tests: pure helper functions -------------------------------

assert(isTribute("Ultimate Sade Tribute Concert"), "isTribute catches 'Tribute'");
assert(isTribute("The Unauthorized Rolling Stones"), "isTribute catches 'Unauthorized'");
assert(!isTribute("Black Uhuru"), "isTribute leaves a real act alone");

assertEqual(dateLabelFromIso("2026-09-13T20:00:00"), "Sun, Sep 13, 2026", "dateLabelFromIso formats correctly");
assertEqual(dateLabelFromIso(null), null, "dateLabelFromIso(null) is null, not a throw");
assertEqual(dateLabelFromIso("not-a-date"), null, "dateLabelFromIso rejects unparseable input");

assertEqual(parseEnvelope({ events: [{ a: 1 }] }).envelopeKey, "events", "parseEnvelope finds body.events");
assertEqual(parseEnvelope({ data: [{ a: 1 }] }).envelopeKey, "data", "parseEnvelope falls back to body.data");
assertEqual(parseEnvelope([{ a: 1 }]).envelopeKey, "(bare array)", "parseEnvelope handles a bare array body");
assertEqual(parseEnvelope({ nothingUseful: true }).envelopeKey, null, "parseEnvelope reports null when nothing matches — loud, not silent");
assertEqual(parseEnvelope({ nothingUseful: true }).events, [], "parseEnvelope still returns an array on no-match");

assertEqual(
  primaryPerformerName([{ name: "Support Act" }, { name: "Black Uhuru", "x-isHeadliner": true }]),
  "Black Uhuru",
  "primaryPerformerName prefers the explicit headliner over array order"
);
assertEqual(
  primaryPerformerName([{ name: "Only Act" }]),
  "Only Act",
  "primaryPerformerName falls back to performer[0] with no headliner flag"
);
assertEqual(primaryPerformerName([]), null, "primaryPerformerName(empty) is null");
assertEqual(primaryPerformerName(null), null, "primaryPerformerName(null) doesn't throw");

assertEqual(
  firstUsableOffer([{ url: null, priceSpecification: null }, { url: "https://tix.example/2", priceSpecification: { price: 40 } }]),
  { url: "https://tix.example/2", priceSpecification: { price: 40 } },
  "firstUsableOffer skips an offer with neither url nor price"
);
assertEqual(firstUsableOffer([]), null, "firstUsableOffer([]) is null (coerced by the || null fallback), not a throw");
assertEqual(firstUsableOffer(null), null, "firstUsableOffer(null) doesn't throw");

assertEqual(
  addressCityState({ addressLocality: "Mill Valley", addressRegion: "CA" }),
  "Mill Valley, CA",
  "addressCityState handles addressRegion as a plain string"
);
assertEqual(
  addressCityState({ addressLocality: "Mill Valley", addressRegion: { name: "CA" } }),
  "Mill Valley, CA",
  "addressCityState handles addressRegion as an object with .name (schema says addressRegion is an object — exact shape unconfirmed live)"
);
assertEqual(
  addressCityState({ addressLocality: "Berkeley" }),
  "Berkeley",
  "addressCityState falls back to city-only with no region"
);
assertEqual(addressCityState(null), null, "addressCityState(null) doesn't throw");

// --- End-to-end: default handler against a mocked fetch --------------

// LIVE-VERIFIED 2026-08-12: this fixture was rebuilt from a REAL captured
// response (a real curl from Susan's own Terminal, real key, real Bay Area
// sweep) rather than hand-guessed from the schema — see jambase-shows.mjs's
// own header for the full story. Real, confirmed shapes used here:
// addressRegion is an object ({alternateName, name, identifier}, not a bare
// string), offer category is "ticketingLinkPrimary"/"ticketingLinkSecondary"
// (not "primary"/"secondary"), and priceSpecification is frequently an EMPTY
// object `{}` on real events (not null, not populated) — the third fixture
// event below models that. Three events: one real show (should survive),
// one cancelled show (should be dropped), one tribute act (should be
// dropped by the title filter).
var FAKE_JAMBASE_RESPONSE = {
  events: [
    {
      "@type": "Concert",
      name: "Black Uhuru",
      identifier: "jambase:99001",
      url: "https://www.jambase.com/show/black-uhuru-99001",
      eventStatus: "scheduled",
      startDate: "2026-09-13T20:00:00",
      location: {
        name: "Sweetwater Music Hall",
        address: {
          addressLocality: "Mill Valley",
          addressRegion: { "@type": "State", alternateName: "CA", identifier: "US-CA", name: "California" },
        },
        geo: { latitude: 37.906, longitude: -122.545 },
      },
      offers: [
        {
          url: "https://www.etix.com/ticket/p/93358603/black-uhuru-mill-valley-sweetwater-music-hall",
          category: "ticketingLinkPrimary",
          priceSpecification: { minPrice: 28, maxPrice: 45, price: 28, priceCurrency: "USD" },
        },
        {
          url: "https://www.stubhub.com/black-uhuru-tickets",
          category: "ticketingLinkSecondary",
          priceSpecification: {},
        },
      ],
      performer: [{ name: "Black Uhuru", "x-isHeadliner": true }],
    },
    {
      "@type": "Concert",
      name: "Cancelled Show",
      identifier: "jambase:99002",
      url: "https://www.jambase.com/show/cancelled-99002",
      eventStatus: "cancelled",
      startDate: "2026-09-20T20:00:00",
      location: { name: "Some Venue", address: { addressLocality: "Oakland", addressRegion: { alternateName: "CA", name: "California" } } },
      offers: [],
      performer: [{ name: "Some Artist", "x-isHeadliner": true }],
    },
    {
      "@type": "Concert",
      name: "Ultimate Sade Tribute Concert",
      identifier: "jambase:99003",
      url: "https://www.jambase.com/show/sade-tribute-99003",
      eventStatus: "scheduled",
      startDate: "2026-10-01T20:00:00",
      location: { name: "Small Theater", address: { addressLocality: "San Leandro", addressRegion: { alternateName: "CA", name: "California" } } },
      // Real events frequently have an empty priceSpecification object —
      // confirmed live (every offer in a real 3-event sample had {}), not
      // just a theoretical edge case. This event would be dropped by the
      // tribute filter regardless, but models the shape correctly anyway.
      offers: [{ url: "https://tix.example/3", category: "ticketingLinkPrimary", priceSpecification: {} }],
      performer: [{ name: "Sade", "x-isHeadliner": true }],
    },
  ],
  pagination: { page: 1, perPage: 100, totalItems: 3, totalPages: 1, nextPage: null, previousPage: null },
};

global.fetch = async (url, opts) => {
  assert(String(url).indexOf("api.data.jambase.com/v3/events") !== -1, "handler calls the real api.data.jambase.com v3 /events endpoint (confirmed via the real OpenAPI spec's servers field, 2026-08-12)");
  assert(String(url).indexOf("geoLatitude=37.8715") !== -1, "handler sends the Berkeley home latitude by default");
  assert(String(url).indexOf("eventType=concert") !== -1, "handler scopes to eventType=concert");
  assert(String(url).indexOf("geoRadiusAmount") === -1, "handler does NOT send geoRadiusAmount — confirmed broken on this account's tier live, 2026-08-12 (every value 60/25/10/1 failed identically)");
  var authHeader = opts && opts.headers && opts.headers.Authorization;
  assert(authHeader === "Bearer test-key-123", "handler sends Authorization: Bearer <key>");
  return {
    ok: true,
    status: 200,
    json: async () => FAKE_JAMBASE_RESPONSE,
  };
};

process.env.JAMBASE_API_KEY = "test-key-123";

var req = new Request("https://vinylscout.org/api/jambase-shows");
var res = await handler(req);
var body = await res.json();

assertEqual(res.status, 200, "handler returns 200 on a successful mocked fetch");
assertEqual(body.shows.length, 1, "handler returns exactly 1 show — cancelled + tribute both correctly dropped");
assertEqual(body.meta.all_pages, false, "allPages defaults to false (fast single-page path) when not explicitly requested");
assertEqual(body.meta.pages_fetched, 1, "single-page default only fetches page 1");

var show = body.shows[0];
assertEqual(show.artist, "Black Uhuru", "surviving show has the correct artist (headliner-preferred)");
assertEqual(show.title, "Black Uhuru", "surviving show has the correct title");
assertEqual(show.venue, "Sweetwater Music Hall", "surviving show has the correct venue");
assertEqual(show.city, "Mill Valley, CA", "surviving show has the correct city");
assertEqual(show.date, "2026-09-13", "surviving show has the correct ISO date");
assertEqual(show.source, "JamBase", "surviving show is tagged source: JamBase");
assertEqual(show.priceLow, 28, "surviving show has the correct priceLow from offers[0].priceSpecification.minPrice");
assertEqual(show.priceHigh, 45, "surviving show has the correct priceHigh from offers[0].priceSpecification.maxPrice");
assertEqual(show.url, "https://www.etix.com/ticket/p/93358603/black-uhuru-mill-valley-sweetwater-music-hall", "surviving show links the real ticket URL from offers[0], not the bare JamBase event page");
assertEqual(body.meta.envelope_key_used, "events", "meta reports which envelope key actually matched");
assertEqual(body.meta.raw_event_count, 3, "meta reports the raw pre-filter count");
assertEqual(body.meta.returned_count, 1, "meta reports the post-filter count");

// Missing API key
delete process.env.JAMBASE_API_KEY;
var res2 = await handler(new Request("https://vinylscout.org/api/jambase-shows"));
assertEqual(res2.status, 500, "handler 500s cleanly with no JAMBASE_API_KEY set, per this repo's no-silent-failures rule");
process.env.JAMBASE_API_KEY = "test-key-123";

// Wrong-shape envelope — proves the "loud, not silent" contract from the
// header note actually holds end-to-end, not just in the unit test above.
global.fetch = async () => ({ ok: true, status: 200, json: async () => ({ somethingElse: [] }) });
var res3 = await handler(new Request("https://vinylscout.org/api/jambase-shows"));
var body3 = await res3.json();
assertEqual(body3.shows, [], "an unrecognized envelope shape returns an empty (honest) list, not a throw");
assertEqual(body3.meta.envelope_key_used, null, "and meta.envelope_key_used is null — visible in the response, not swallowed");

// --- v2: bounded retry + distinct-code error classification ---------------
// (see jambase-shows.mjs's own "Small bounded retry" comment). Matches the
// pattern discogs-pricing.mjs's error codes and
// concert-radar-health-check.mjs's classifyVenueFailure() already use
// elsewhere in this repo: auth/rate-limit/network/parse get distinct codes
// instead of collapsing into one generic "could not reach JamBase" message.

// A network-level failure (fetch() itself throwing) on the first two
// attempts, succeeding on the third, should still return a normal 200 —
// proving the retry actually retries, not just that it exists in the code.
var netCallCount = 0;
global.fetch = async () => {
  netCallCount++;
  if (netCallCount < 3) throw new Error("simulated network failure");
  return { ok: true, status: 200, json: async () => FAKE_JAMBASE_RESPONSE };
};
var resRetrySucceeds = await handler(new Request("https://vinylscout.org/api/jambase-shows"));
assertEqual(resRetrySucceeds.status, 200, "a network error on attempts 1-2 that succeeds on attempt 3 still returns 200");
assertEqual(netCallCount, 3, "exactly 3 fetch attempts were made (2 failures + 1 success), proving the retry loop actually ran");

// A network failure on every attempt exhausts the retry budget (3 attempts)
// and surfaces as NETWORK_ERROR, not a generic message.
var netFailCount = 0;
global.fetch = async () => { netFailCount++; throw new Error("simulated permanent network failure"); };
var resNetFail = await handler(new Request("https://vinylscout.org/api/jambase-shows"));
var bodyNetFail = await resNetFail.json();
assertEqual(resNetFail.status, 502, "a network error on every attempt returns 502");
assertEqual(bodyNetFail.code, "NETWORK_ERROR", "a network error carries code NETWORK_ERROR, distinct from an auth or parse failure");
assertEqual(netFailCount, 3, "the retry loop stops at 3 attempts, not fewer or more");

// A 401 from JamBase is an auth failure — NOT retried (retrying a bad key
// wastes budget and will never succeed) — and gets its own code.
var authCallCount = 0;
global.fetch = async () => { authCallCount++; return { ok: false, status: 401, json: async () => ({ message: "invalid key" }) }; };
var resAuth = await handler(new Request("https://vinylscout.org/api/jambase-shows"));
var bodyAuth = await resAuth.json();
assertEqual(resAuth.status, 401, "a 401 from JamBase surfaces as 401, not a generic 502");
assertEqual(bodyAuth.code, "AUTH_FAILED", "a 401 carries code AUTH_FAILED");
assertEqual(authCallCount, 1, "a 401 is NOT retried — retrying a bad key can't succeed and would waste the free-tier budget");

// A 429 IS retried (rate limits are transient) — exhausting the budget
// surfaces as RATE_LIMITED, distinct from a generic upstream error.
var rateLimitCallCount = 0;
global.fetch = async () => { rateLimitCallCount++; return { ok: false, status: 429, json: async () => ({ message: "rate limited" }) }; };
var resRateLimit = await handler(new Request("https://vinylscout.org/api/jambase-shows"));
var bodyRateLimit = await resRateLimit.json();
assertEqual(resRateLimit.status, 429, "a 429 from JamBase surfaces as 429");
assertEqual(bodyRateLimit.code, "RATE_LIMITED", "a 429 carries code RATE_LIMITED, distinct from AUTH_FAILED or NETWORK_ERROR");
assertEqual(rateLimitCallCount, 3, "a 429 IS retried up to the full attempt budget, unlike a 401");

// A response that claims 200 but whose body isn't valid JSON is a parse
// failure, not a network or auth one.
global.fetch = async () => ({ ok: true, status: 200, json: async () => { throw new SyntaxError("Unexpected token"); } });
var resParse = await handler(new Request("https://vinylscout.org/api/jambase-shows"));
var bodyParse = await resParse.json();
assertEqual(resParse.status, 502, "an unparseable 200 response returns 502");
assertEqual(bodyParse.code, "PARSE_ERROR", "an unparseable response body carries code PARSE_ERROR, distinct from NETWORK_ERROR/AUTH_FAILED");

console.log("\n" + passed + " passed, " + failed + " failed");
if (failed > 0) process.exit(1);
