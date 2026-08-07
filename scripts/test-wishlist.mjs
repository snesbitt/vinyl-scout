// scripts/test-wishlist.mjs
// Regression suite for netlify/functions/wishlist.mjs's v4 edit-key gate
// (Phase 8, "Close the wishlist gap", 2026-08-06). Same pattern as
// scripts/test-artists-playing.mjs: exercises the exported default handler
// directly with real Request objects, no live network.
//
// Scope, deliberately narrow: only the unauthorized-write paths are tested
// here (missing key, wrong key on POST/DELETE) -- those return a 401 before
// the handler ever touches @netlify/blobs' getStore(), so they run cleanly
// in a bare Node process with no Netlify Blobs context configured. The
// authorized-write and GET paths both call getStore('wishlist'), which
// needs real Netlify Blobs environment (siteID/token) to not throw --
// exercising those isn't attempted here, matching this repo's established
// "never mock Blobs" convention (see artists-playing's own test file and
// CLAUDE.md's testing-that-actually-proves-something notes).
//
// Run: EDIT_SECRET=test-secret node scripts/test-wishlist.mjs
//   (EDIT_SECRET is set below in-process so this also runs plain via
//   `node scripts/test-wishlist.mjs` with no env setup needed.)

import handler from "../netlify/functions/wishlist.mjs";

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

// --- POST with no X-Edit-Key header at all --------------------------------

var reqPostNoKey = new Request("https://vinylscout.org/api/wishlist", {
  method: "POST",
  headers: { "Content-Type": "application/json" },
  body: JSON.stringify({ id: "wish_test1", artist: "Test Artist", title: "Test Title" }),
});
var resPostNoKey = await handler(reqPostNoKey);
assertEqual(resPostNoKey.status, 401, "POST with no X-Edit-Key returns 401");

// --- POST with the wrong key ------------------------------------------------

var reqPostWrongKey = new Request("https://vinylscout.org/api/wishlist", {
  method: "POST",
  headers: { "Content-Type": "application/json", "X-Edit-Key": "definitely-not-it" },
  body: JSON.stringify({ id: "wish_test2", artist: "Test Artist", title: "Test Title" }),
});
var resPostWrongKey = await handler(reqPostWrongKey);
assertEqual(resPostWrongKey.status, 401, "POST with wrong X-Edit-Key returns 401");

// --- DELETE with no X-Edit-Key header ---------------------------------------

var reqDelNoKey = new Request("https://vinylscout.org/api/wishlist/wish_test1", {
  method: "DELETE",
});
var resDelNoKey = await handler(reqDelNoKey);
assertEqual(resDelNoKey.status, 401, "DELETE with no X-Edit-Key returns 401");

// --- DELETE with the wrong key ----------------------------------------------

var reqDelWrongKey = new Request("https://vinylscout.org/api/wishlist/wish_test1", {
  method: "DELETE",
  headers: { "X-Edit-Key": "definitely-not-it" },
});
var resDelWrongKey = await handler(reqDelWrongKey);
assertEqual(resDelWrongKey.status, 401, "DELETE with wrong X-Edit-Key returns 401");

// --- fails closed when EDIT_SECRET is unset ---------------------------------

var savedSecret = process.env.EDIT_SECRET;
delete process.env.EDIT_SECRET;
var reqPostNoEnv = new Request("https://vinylscout.org/api/wishlist", {
  method: "POST",
  headers: { "Content-Type": "application/json", "X-Edit-Key": "anything-at-all" },
  body: JSON.stringify({ id: "wish_test3", artist: "Test Artist", title: "Test Title" }),
});
var resPostNoEnv = await handler(reqPostNoEnv);
assertEqual(resPostNoEnv.status, 401, "POST fails closed (401) when EDIT_SECRET env var is unset, even with a key supplied");
process.env.EDIT_SECRET = savedSecret;

// --- unauthorized responses are real JSON error bodies, not empty ----------

var errBody = await resPostNoKey.json();
assertEqual(typeof errBody.error, "string", "401 response carries a JSON {error: string} body, not an empty response");

console.log("wishlist.mjs: " + passed + " passed, " + failed + " failed");
if (failed > 0) process.exit(1);
