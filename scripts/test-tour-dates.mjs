// scripts/test-tour-dates.mjs
// Regression suite for netlify/functions/tour-dates.mjs.
//
// This endpoint had no dedicated test file before now, unlike every other
// comparably risky Concert Radar feed (jambase-shows.mjs, artists-playing.mjs).
// Scope here is the same bounded-retry + distinct-error-code work added
// alongside it (see the file's own "Small bounded retry" comment and the
// seatGeekGet() classification comment) — auth/rate-limit/network/parse
// failures each get their own `code`, matching the shape discogs-pricing.mjs
// and concert-radar-health-check.mjs's classifyVenueFailure() already use
// elsewhere in this repo, instead of collapsing every failure into one
// generic "could not reach SeatGeek" message.
//
// Same approach as scripts/test-jambase-shows.mjs: imports the real default
// handler and calls it directly with global.fetch mocked. No live network,
// no Netlify Blobs (this file never touches @netlify/blobs at all).
//
// Run: node scripts/test-tour-dates.mjs

import handler from "../netlify/functions/tour-dates.mjs";

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

process.env.SEATGEEK_CLIENT_ID = "test-client-id";

// --- Basic request validation, no fetch involved ---------------------------

var resWrongMethod = await handler(new Request("https://vinylscout.org/api/tour-dates?artist=Kraftwerk", { method: "POST" }));
assertEqual(resWrongMethod.status, 405, "POST is rejected with 405 (read-only endpoint)");

var resNoArtist = await handler(new Request("https://vinylscout.org/api/tour-dates"));
assertEqual(resNoArtist.status, 400, "no ?artist= param returns 400");

var savedClientId = process.env.SEATGEEK_CLIENT_ID;
delete process.env.SEATGEEK_CLIENT_ID;
var resNoClientId = await handler(new Request("https://vinylscout.org/api/tour-dates?artist=Kraftwerk"));
assertEqual(resNoClientId.status, 500, "no SEATGEEK_CLIENT_ID set returns 500");
process.env.SEATGEEK_CLIENT_ID = savedClientId;

// --- v7: bounded retry + distinct-code error classification ---------------

// A network-level failure (fetch() itself throwing) on the first two
// attempts, succeeding on the third, should still produce a normal 200 —
// proving the retry actually retries, not just that it exists in the code.
// Third call succeeds with an empty performer list (simplest valid shape),
// which is enough to reach a clean 200 with zero shows.
var netCallCount = 0;
global.fetch = async () => {
  netCallCount++;
  if (netCallCount < 3) throw new Error("simulated network failure");
  return { ok: true, status: 200, json: async () => ({ performers: [] }) };
};
var resRetrySucceeds = await handler(new Request("https://vinylscout.org/api/tour-dates?artist=Kraftwerk"));
assertEqual(resRetrySucceeds.status, 200, "a network error on attempts 1-2 that succeeds on attempt 3 still returns 200");
assertEqual(netCallCount, 3, "exactly 3 fetch attempts were made (2 failures + 1 success), proving the retry loop actually ran");

// A network failure on every attempt exhausts the retry budget (3 attempts
// per seatGeekGet() call) and surfaces as NETWORK_ERROR, not a generic
// "could not reach SeatGeek" string with no machine-readable code.
var netFailCount = 0;
global.fetch = async () => { netFailCount++; throw new Error("simulated permanent network failure"); };
var resNetFail = await handler(new Request("https://vinylscout.org/api/tour-dates?artist=Kraftwerk"));
var bodyNetFail = await resNetFail.json();
assertEqual(resNetFail.status, 502, "a network error on every attempt returns 502");
assertEqual(bodyNetFail.code, "NETWORK_ERROR", "a network error carries code NETWORK_ERROR, distinct from an auth or parse failure");
assertEqual(netFailCount, 3, "the retry loop stops at 3 attempts for the one seatGeekGet() call that failed, not fewer or more");

// A 401 from SeatGeek is an auth failure — NOT retried (retrying a bad
// client_id wastes time and will never succeed) — and gets its own code.
var authCallCount = 0;
global.fetch = async () => { authCallCount++; return { ok: false, status: 401, json: async () => ({ message: "invalid client_id" }) }; };
var resAuth = await handler(new Request("https://vinylscout.org/api/tour-dates?artist=Kraftwerk"));
var bodyAuth = await resAuth.json();
assertEqual(resAuth.status, 401, "a 401 from SeatGeek surfaces as 401, not a generic 502");
assertEqual(bodyAuth.code, "AUTH_FAILED", "a 401 carries code AUTH_FAILED");
assertEqual(authCallCount, 1, "a 401 is NOT retried — retrying a bad client_id can't succeed");

// A 429 IS retried (rate limits are transient) — exhausting the budget
// surfaces as RATE_LIMITED, distinct from a generic upstream error.
var rateLimitCallCount = 0;
global.fetch = async () => { rateLimitCallCount++; return { ok: false, status: 429, json: async () => ({ message: "rate limited" }) }; };
var resRateLimit = await handler(new Request("https://vinylscout.org/api/tour-dates?artist=Kraftwerk"));
var bodyRateLimit = await resRateLimit.json();
assertEqual(resRateLimit.status, 429, "a 429 from SeatGeek surfaces as 429");
assertEqual(bodyRateLimit.code, "RATE_LIMITED", "a 429 carries code RATE_LIMITED, distinct from AUTH_FAILED or NETWORK_ERROR");
assertEqual(rateLimitCallCount, 3, "a 429 IS retried up to the full attempt budget, unlike a 401");

// A response that claims 200 but whose body isn't valid JSON is a parse
// failure, not a network or auth one.
global.fetch = async () => ({ ok: true, status: 200, json: async () => { throw new SyntaxError("Unexpected token"); } });
var resParse = await handler(new Request("https://vinylscout.org/api/tour-dates?artist=Kraftwerk"));
var bodyParse = await resParse.json();
assertEqual(resParse.status, 502, "an unparseable 200 response returns 502");
assertEqual(bodyParse.code, "PARSE_ERROR", "an unparseable response body carries code PARSE_ERROR, distinct from NETWORK_ERROR/AUTH_FAILED");

// --- A clean, fully-successful call still returns the documented shape ----

global.fetch = async (url) => {
  var u = String(url);
  if (u.indexOf("/performers") !== -1) {
    return {
      ok: true, status: 200,
      json: async () => ({ performers: [{ name: "Kraftwerk", slug: "kraftwerk" }] }),
    };
  }
  return {
    ok: true, status: 200,
    json: async () => ({
      events: [{
        id: 555,
        title: "Kraftwerk",
        venue: { name: "Fox Theater", city: "Oakland", state: "CA" },
        datetime_local: "2026-10-01T20:00:00",
        performers: [{ name: "Kraftwerk", primary: true }],
        stats: { lowest_price: 60, highest_price: 150 },
        url: "https://seatgeek.com/kraftwerk-tickets",
      }] }),
  };
};
var resOk = await handler(new Request("https://vinylscout.org/api/tour-dates?artist=Kraftwerk"));
var bodyOk = await resOk.json();
assertEqual(resOk.status, 200, "a fully successful lookup returns 200");
assertEqual(bodyOk.shows.length, 1, "a fully successful lookup returns the one real show");
assertEqual(bodyOk.shows[0].artist, "Kraftwerk", "the returned show has the correct artist");
assertEqual(bodyOk.meta.match_tier, "exact", "an exact performer-name match is reported as such");

console.log("tour-dates.mjs: " + passed + " passed, " + failed + " failed");
if (failed > 0) process.exit(1);
