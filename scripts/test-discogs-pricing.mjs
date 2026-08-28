// scripts/test-discogs-pricing.mjs
// Regression suite for netlify/functions/discogs-pricing.mjs.
//
// Scope, deliberately narrow, matching this repo's established "never mock
// Blobs" convention (see test-wishlist.mjs's own header note): the handler
// reaches getStore('records') only AFTER the edit-key gate, the
// DISCOGS_TOKEN check, body parsing, and the identity-preflight network
// call all pass — so only the paths that return before any of that (401
// unauthorized, 503 no token, 400 bad body/missing recordId) are exercised
// against the real default handler here. Those run cleanly in a bare Node
// process with no Netlify Blobs context and no network.
//
// The actual regression this file exists to catch — the v21 fix in
// discogs-pricing.mjs's changelog — lives in the pure, exported
// mergePricingFields()/keepValue() helpers, which is why most of this suite
// is unit tests against those directly. That's where the bug was (a single
// all-or-nothing `scrapeUsable` flag nulling out price_median/price_high on
// a partial scrape) and it's fully testable without touching Blobs or the
// network at all — same pattern as jambase-shows.mjs's exported pure
// helpers (see test-jambase-shows.mjs).
//
// Run: node scripts/test-discogs-pricing.mjs
//   (EDIT_SECRET is set below in-process so this also runs plain via
//   `node scripts/test-discogs-pricing.mjs` with no env setup needed.)

import handler, { keepValue, mergePricingFields } from "../netlify/functions/discogs-pricing.mjs";

process.env.EDIT_SECRET = process.env.EDIT_SECRET || "test-secret-for-ci";

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

// =============================================================================
// keepValue() — the primitive the whole fix rests on
// =============================================================================

assertEqual(keepValue(45.5, 40), 45.5, "keepValue prefers a fresh non-null value over the existing one");
assertEqual(keepValue(null, 40), 40, "keepValue falls back to the existing value when fresh is null");
assertEqual(keepValue(undefined, 40), 40, "keepValue treats undefined fresh the same as null");
assertEqual(keepValue(null, null), null, "keepValue is null when both fresh and existing are null");
assertEqual(keepValue(0, 40), 0, "keepValue keeps a fresh 0 (falsy but not null/undefined), doesn't fall back");
assertEqual(keepValue(null, 0), 0, "keepValue keeps an existing 0, doesn't collapse it to null");

// =============================================================================
// mergePricingFields() — the actual v21 regression
// =============================================================================

// --- THE bug scenario from the audit: a scrape that finds have/want but ----
// --- misses median/high must leave stored median/high untouched. ----------
var existingRecord = {
  id: "rec_test0001",
  artist: "Test Artist",
  title: "Test Album",
  price_low: 12.5,
  price_median: 45.5,
  price_high: 60,
  price_last_sold: "Apr 1, 2026",
  have_count: 100,
  want_count: 50,
  rating_avg: 4.5,
  rating_count: 12,
  price_currency: "EUR",
  copies_available: 3,
};

var partialScrapeFresh = {
  releaseId: 123456,
  priceLow: 15,          // found
  copiesAvailable: 5,    // found (from /marketplace/stats)
  currency: "EUR",
  priceHigh: null,       // NOT found this time
  priceMedian: null,     // NOT found this time
  priceLastSold: null,   // NOT found this time
  haveCount: 110,        // found
  wantCount: 55,         // found
  ratingAvg: null,       // NOT found this time
  ratingCount: null,     // NOT found this time
};

var afterPartialScrape = mergePricingFields(existingRecord, partialScrapeFresh);

assertEqual(afterPartialScrape.price_median, 45.5, "THE FIX: price_median survives a scrape that found have/want but not median — not nulled out");
assertEqual(afterPartialScrape.price_high, 60, "THE FIX: price_high survives a scrape that found have/want but not high — not nulled out");
assertEqual(afterPartialScrape.price_last_sold, "Apr 1, 2026", "THE FIX: price_last_sold survives a scrape that found have/want but not last_sold");
assertEqual(afterPartialScrape.rating_avg, 4.5, "THE FIX: rating_avg survives a scrape that found have/want but not rating_avg");
assertEqual(afterPartialScrape.rating_count, 12, "THE FIX: rating_count survives a scrape that found have/want but not rating_count");
// And the fields that WERE found this time should update, independently.
assertEqual(afterPartialScrape.price_low, 15, "fields the scrape DID find still update (price_low)");
assertEqual(afterPartialScrape.copies_available, 5, "fields the scrape DID find still update (copies_available)");
assertEqual(afterPartialScrape.have_count, 110, "fields the scrape DID find still update (have_count)");
assertEqual(afterPartialScrape.want_count, 55, "fields the scrape DID find still update (want_count)");
assertEqual(afterPartialScrape.discogs_release_id, 123456, "discogs_release_id is always set from this call's resolved release");

// --- Total scrape failure: every fresh field null -> everything falls back -
var afterTotalMiss = mergePricingFields(existingRecord, {
  releaseId: 123456,
  priceLow: null, copiesAvailable: null, currency: null,
  priceHigh: null, priceMedian: null, priceLastSold: null,
  haveCount: null, wantCount: null, ratingAvg: null, ratingCount: null,
});
assertEqual(afterTotalMiss.price_low, 12.5, "total scrape miss: price_low falls back to existing");
assertEqual(afterTotalMiss.price_median, 45.5, "total scrape miss: price_median falls back to existing");
assertEqual(afterTotalMiss.price_high, 60, "total scrape miss: price_high falls back to existing");
assertEqual(afterTotalMiss.have_count, 100, "total scrape miss: have_count falls back to existing");
assertEqual(afterTotalMiss.want_count, 50, "total scrape miss: want_count falls back to existing");
assertEqual(afterTotalMiss.rating_avg, 4.5, "total scrape miss: rating_avg falls back to existing");
assertEqual(afterTotalMiss.rating_count, 12, "total scrape miss: rating_count falls back to existing");
assertEqual(afterTotalMiss.price_last_sold, "Apr 1, 2026", "total scrape miss: price_last_sold falls back to existing");
assertEqual(afterTotalMiss.copies_available, 3, "total scrape miss: copies_available falls back to existing");
assertEqual(afterTotalMiss.price_currency, "EUR", "total scrape miss: price_currency falls back to the existing record's currency");

// --- Full success: every fresh field present -> everything updates --------
var afterFullHit = mergePricingFields(existingRecord, {
  releaseId: 999,
  priceLow: 20, copiesAvailable: 7, currency: "USD",
  priceHigh: 70, priceMedian: 48, priceLastSold: "Aug 1, 2026",
  haveCount: 120, wantCount: 60, ratingAvg: 4.8, ratingCount: 15,
});
assertEqual(afterFullHit.price_low, 20, "full hit: price_low updates");
assertEqual(afterFullHit.price_median, 48, "full hit: price_median updates");
assertEqual(afterFullHit.price_high, 70, "full hit: price_high updates");
assertEqual(afterFullHit.have_count, 120, "full hit: have_count updates");
assertEqual(afterFullHit.want_count, 60, "full hit: want_count updates");
assertEqual(afterFullHit.rating_avg, 4.8, "full hit: rating_avg updates");
assertEqual(afterFullHit.rating_count, 15, "full hit: rating_count updates");
assertEqual(afterFullHit.price_last_sold, "Aug 1, 2026", "full hit: price_last_sold updates");
assertEqual(afterFullHit.price_currency, "USD", "full hit: price_currency updates from the fresh call");
assertEqual(afterFullHit.discogs_release_id, 999, "full hit: discogs_release_id updates to the resolved release");

// --- Currency default: no fresh currency, no existing currency -> USD -----
var noCurrencyRecord = Object.assign({}, existingRecord);
delete noCurrencyRecord.price_currency;
var afterNoCurrency = mergePricingFields(noCurrencyRecord, {
  releaseId: 1, priceLow: 10, copiesAvailable: 1, currency: null,
  priceHigh: null, priceMedian: null, priceLastSold: null,
  haveCount: null, wantCount: null, ratingAvg: null, ratingCount: null,
});
assertEqual(afterNoCurrency.price_currency, "USD", "price_currency defaults to USD when neither fresh nor existing has one");

// --- price_updated_at is always refreshed to a real ISO timestamp ---------
var beforeIso = new Date().toISOString();
var afterAnyMerge = mergePricingFields(existingRecord, partialScrapeFresh);
assert(typeof afterAnyMerge.price_updated_at === "string" && afterAnyMerge.price_updated_at >= beforeIso, "price_updated_at is refreshed to a current ISO timestamp on every merge, even a partial one");

// --- The merge never mutates the original record object in place ---------
assertEqual(existingRecord.price_median, 45.5, "mergePricingFields does not mutate the original record object");

// =============================================================================
// Handler-level: only the paths reachable before Blobs/network are touched,
// per this repo's "never mock Blobs" convention (see test-wishlist.mjs).
// =============================================================================

// --- Wrong method ------------------------------------------------------------
var resWrongMethod = await handler(new Request("https://vinylscout.org/api/discogs-pricing", { method: "GET" }));
assertEqual(resWrongMethod.status, 405, "GET is rejected with 405 (POST only)");

// --- POST with no X-Edit-Key header at all -----------------------------------
var reqPostNoKey = new Request("https://vinylscout.org/api/discogs-pricing", {
  method: "POST",
  headers: { "Content-Type": "application/json" },
  body: JSON.stringify({ recordId: "rec_test0001" }),
});
var resPostNoKey = await handler(reqPostNoKey);
assertEqual(resPostNoKey.status, 401, "POST with no X-Edit-Key returns 401");

// --- POST with the wrong key --------------------------------------------------
var reqPostWrongKey = new Request("https://vinylscout.org/api/discogs-pricing", {
  method: "POST",
  headers: { "Content-Type": "application/json", "X-Edit-Key": "definitely-not-it" },
  body: JSON.stringify({ recordId: "rec_test0001" }),
});
var resPostWrongKey = await handler(reqPostWrongKey);
assertEqual(resPostWrongKey.status, 401, "POST with wrong X-Edit-Key returns 401");

// --- fails closed when EDIT_SECRET is unset ----------------------------------
var savedSecret = process.env.EDIT_SECRET;
delete process.env.EDIT_SECRET;
var reqPostNoEnv = new Request("https://vinylscout.org/api/discogs-pricing", {
  method: "POST",
  headers: { "Content-Type": "application/json", "X-Edit-Key": "anything-at-all" },
  body: JSON.stringify({ recordId: "rec_test0001" }),
});
var resPostNoEnv = await handler(reqPostNoEnv);
assertEqual(resPostNoEnv.status, 401, "POST fails closed (401) when EDIT_SECRET env var is unset, even with a key supplied");
process.env.EDIT_SECRET = savedSecret;

// --- missing DISCOGS_TOKEN --------------------------------------------------
var savedToken = process.env.DISCOGS_TOKEN;
delete process.env.DISCOGS_TOKEN;
var reqNoToken = new Request("https://vinylscout.org/api/discogs-pricing", {
  method: "POST",
  headers: { "Content-Type": "application/json", "X-Edit-Key": "test-secret-for-ci" },
  body: JSON.stringify({ recordId: "rec_test0001" }),
});
var resNoToken = await handler(reqNoToken);
assertEqual(resNoToken.status, 503, "authorized POST with no DISCOGS_TOKEN set returns 503");
var noTokenBody = await resNoToken.json();
assertEqual(noTokenBody.code, "NO_TOKEN", "no-token response carries code NO_TOKEN");

// --- invalid JSON body (token present so we reach body parsing) ------------
process.env.DISCOGS_TOKEN = "x".repeat(40);
var reqBadJson = new Request("https://vinylscout.org/api/discogs-pricing", {
  method: "POST",
  headers: { "Content-Type": "application/json", "X-Edit-Key": "test-secret-for-ci" },
  body: "{not valid json",
});
var resBadJson = await handler(reqBadJson);
assertEqual(resBadJson.status, 400, "authorized POST with invalid JSON body returns 400");

// --- missing recordId --------------------------------------------------------
var reqNoRecordId = new Request("https://vinylscout.org/api/discogs-pricing", {
  method: "POST",
  headers: { "Content-Type": "application/json", "X-Edit-Key": "test-secret-for-ci" },
  body: JSON.stringify({ notRecordId: true }),
});
var resNoRecordId = await handler(reqNoRecordId);
assertEqual(resNoRecordId.status, 400, "authorized POST with no recordId returns 400");
if (savedToken === undefined) delete process.env.DISCOGS_TOKEN; else process.env.DISCOGS_TOKEN = savedToken;

console.log("discogs-pricing.mjs: " + passed + " passed, " + failed + " failed");
if (failed > 0) process.exit(1);
