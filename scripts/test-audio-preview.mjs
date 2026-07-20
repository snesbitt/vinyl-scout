// scripts/test-audio-preview.mjs
// Local Node regression fixture for netlify/functions/audio-preview.mjs's
// matching/scoring logic. Plain Node, no new dependencies, NO network calls
// — every case below mocks `global.fetch` with canned Deezer-shaped JSON
// fixtures and calls the actual exported functions from audio-preview.mjs
// (not a copy of them), so this stays honest as that file changes.
//
// Why this exists: PROJECT.md's changelog references a "local Node
// regression suite (4-12 cases)" run before nearly every audio-preview.mjs
// deploy (v6/v7, v11, v15, and others), but none of those suites were ever
// committed to the repo — only scripts/smoke.mjs exists, and that's a live
// black-box check against the deployed site, not unit coverage of the
// matching functions themselves. This fixture is the first committed,
// permanent version of that discipline. Run before any deploy that touches
// audio-preview.mjs's matching logic — not a replacement for a full
// 93-record live sweep (see CLAUDE.md), but a fast, free, no-API-key check
// that catches the specific bug shapes this file has hit before.
//
// Run: node scripts/test-audio-preview.mjs
//   or: npm run test:audio-preview

import {
  containsWholeWords,
  artistsOverlap,
  isGenericArtist,
  tryDeezerByAlbumTitleSearch,
  tryDeezer,
} from "../netlify/functions/audio-preview.mjs";

let passed = 0;
let failed = 0;
const failures = [];

function ok(cond, name, detail) {
  if (cond) {
    passed++;
  } else {
    failed++;
    failures.push(detail ? `${name} — ${detail}` : name);
  }
}

function eq(actual, expected, name) {
  const cond = actual === expected;
  ok(cond, name, cond ? "" : `expected ${JSON.stringify(expected)}, got ${JSON.stringify(actual)}`);
}

// --- fetch mocking helper ---------------------------------------------------
// Swaps global.fetch for the duration of one async test, restores it
// afterward (even on throw), and records every URL requested so a test can
// assert on call patterns (e.g. "this pass was never even attempted").
async function withMockFetch(handler, run) {
  const calls = [];
  const realFetch = globalThis.fetch;
  globalThis.fetch = async (url, init) => {
    calls.push(String(url));
    return handler(String(url), init);
  };
  try {
    return await run(calls);
  } finally {
    globalThis.fetch = realFetch;
  }
}

function jsonResponse(body, okFlag = true) {
  return {
    ok: okFlag,
    status: okFlag ? 200 : 500,
    json: async () => body,
  };
}

// =============================================================================
// Case 1: Led Zeppelin "IV" vs "Live" — whole-word containment bug (v6).
// A raw `.includes()`/letter-substring check would match "iv" inside the
// letters of "Live" ("L-IV-e"). containsWholeWords must reject that while
// still accepting "IV" as a genuine standalone word (e.g. "Led Zeppelin IV
// (Deluxe Edition)").
// =============================================================================
{
  eq(
    containsWholeWords(normalize("led zeppelin iv deluxe edition"), "iv"),
    true,
    "containsWholeWords: 'iv' is a real whole word in 'Led Zeppelin IV (Deluxe Edition)'"
  );
  eq(
    containsWholeWords(normalize("live ep"), "iv"),
    false,
    "containsWholeWords: 'iv' must NOT match inside the letters of 'Live EP' (the v6 bug)"
  );
  eq(
    containsWholeWords(normalize("led zeppelin iv remaster"), "iv"),
    true,
    "containsWholeWords: 'iv' is a real whole word in 'Led Zeppelin IV (Remaster)'"
  );
}

function normalize(s) {
  // Mirrors audio-preview.mjs's own normalizeTitle() closely enough for
  // this fixture's purposes (lowercase, punctuation to spaces) — kept
  // local and tiny rather than importing an internal helper that isn't
  // part of the file's public testing surface.
  return String(s).toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();
}

// =============================================================================
// Case 2: Sidney Bechet vs Cyrille Aimée — wrong-artist false positive (v11).
// artistsOverlap is the primitive that closed this gap: a candidate track
// credited to a completely different performer of the same jazz standard
// must NOT be treated as a match for our stored artist.
// =============================================================================
{
  eq(
    artistsOverlap("Cyrille Aimée", "Sidney Bechet"),
    false,
    "artistsOverlap: Cyrille Aimée's cover must not overlap Sidney Bechet"
  );
  eq(
    artistsOverlap("Sidney Bechet", "Sidney Bechet"),
    true,
    "artistsOverlap: Sidney Bechet trivially overlaps himself"
  );
}

// =============================================================================
// Case 2b: the same Bechet/Aimée bug, exercised end-to-end through
// tryDeezerByAlbumTitleSearch (pass c) with a mocked Deezer response shaped
// like the real historical case — two albums titled "Petite Fleur", one
// genuinely by Sidney Bechet, one an unrelated Cyrille Aimée cover. Before
// the v11/v12 fix, this pass took the first title match with no artist
// check at all and would have returned the Aimée cover here.
// =============================================================================
await (async () => {
  const result = await withMockFetch(
    (url) => {
      if (url.includes("/search/album")) {
        return jsonResponse({
          data: [
            // Deezer's own relevance ranking puts the wrong-artist cover
            // first — this is the exact shape of the real historical bug.
            { id: 501, title: "Petite Fleur", artist: { name: "Cyrille Aimée" } },
            { id: 502, title: "Petite Fleur", artist: { name: "Sidney Bechet" } },
          ],
        });
      }
      if (url.includes("/album/501/tracks")) {
        return jsonResponse({
          data: [
            { id: 9001, title: "Petite Fleur", preview: "https://example.test/aimee.mp3", rank: 900000, artist: { name: "Cyrille Aimée" }, link: "https://example.test/aimee" },
          ],
        });
      }
      if (url.includes("/album/502/tracks")) {
        return jsonResponse({
          data: [
            { id: 9002, title: "Petite Fleur", preview: "https://example.test/bechet.mp3", rank: 500000, artist: { name: "Sidney Bechet" }, link: "https://example.test/bechet" },
          ],
        });
      }
      return jsonResponse({ data: [] });
    },
    async () => tryDeezerByAlbumTitleSearch("Petite Fleur", "Sidney Bechet")
  );

  ok(!!result, "tryDeezerByAlbumTitleSearch (Bechet): returns a match at all");
  if (result) {
    eq(result.artists, "Sidney Bechet", "tryDeezerByAlbumTitleSearch (Bechet): must corroborate to Bechet's own recording, not Cyrille Aimée's cover");
  }
})();

// =============================================================================
// Case 3: Scott Joplin composer-vs-performer fallback (v15 regression).
// Joplin made no recordings himself (died 1917) — every real Deezer album
// under "Red Back Book" is credited to a PERFORMER, never to "Scott
// Joplin". Two candidates here, neither corroborates. The v12 rewrite's bug
// was treating "multiple candidates, zero corroborated" as "refuse to
// guess, return null" — the v15 fix restructured this to only start
// rejecting uncorroborated candidates once corroboration has proven
// possible for at least one of them; when it never does, fall back to the
// first/best-ranked candidate, same as the function's pre-v12 behavior.
// =============================================================================
await (async () => {
  const result = await withMockFetch(
    (url) => {
      if (url.includes("/search/album")) {
        return jsonResponse({
          data: [
            { id: 601, title: "Red Back Book", artist: { name: "New England Conservatory Ragtime Ensemble" } },
            { id: 602, title: "Red Back Book", artist: { name: "Ferruccio Busoni" } },
          ],
        });
      }
      if (url.includes("/album/601/tracks")) {
        return jsonResponse({
          data: [
            { id: 7001, title: "Joplin: Maple Leaf Rag", preview: "https://example.test/ragtime.mp3", rank: 700000, artist: { name: "New England Conservatory Ragtime Ensemble" }, link: "https://example.test/ragtime" },
          ],
        });
      }
      if (url.includes("/album/602/tracks")) {
        return jsonResponse({
          data: [
            { id: 7002, title: "Sonatina", preview: "https://example.test/busoni.mp3", rank: 900000, artist: { name: "Ferruccio Busoni" }, link: "https://example.test/busoni" },
          ],
        });
      }
      return jsonResponse({ data: [] });
    },
    async () => tryDeezerByAlbumTitleSearch("Red Back Book", "Scott Joplin")
  );

  ok(
    !!result && !!result.preview_url,
    "tryDeezerByAlbumTitleSearch (Joplin): falls back to a best-ranked candidate instead of refusing to guess (the v15 regression)",
    result ? "" : "got null — this is exactly the v12/v15 regression: a composer with no recordings of his own can never corroborate against his own name, so refusing to guess wrongly rejects every real match"
  );
})();

// =============================================================================
// Case 4: generic-artist ("Various Artists") skip-guard — the fix #2 bug.
// tryDeezer() must skip the artist-scoped passes (free-text, artist-catalog
// walk) entirely for a generic-artist record and go straight to the
// title-only pass with a null artist. Asserted here by checking which
// debugInfo keys got populated: deezerFreeText/deezerCatalog must stay
// untouched (never even attempted) while deezerAlbumTitle must be set.
// =============================================================================
await (async () => {
  const debugInfo = {};
  const result = await withMockFetch(
    (url) => {
      // A title deliberately absent from KNOWN_COMPILATION_TRACKS so pass
      // (d) short-circuits to null without an HTTP call, isolating this
      // test to the generic-artist branch itself.
      if (url.includes("/search/album")) {
        return jsonResponse({ data: [] });
      }
      return jsonResponse({ data: [] });
    },
    async () => tryDeezer("Various Artists", "A Totally Fictional Test Compilation Not In The Map", debugInfo)
  );

  ok(
    debugInfo.deezerFreeText === undefined,
    "tryDeezer (generic artist): free-text pass (a) must never run for 'Various Artists'",
    `debugInfo.deezerFreeText = ${JSON.stringify(debugInfo.deezerFreeText)}`
  );
  ok(
    debugInfo.deezerCatalog === undefined,
    "tryDeezer (generic artist): artist-catalog-walk pass (b) must never run for 'Various Artists'",
    `debugInfo.deezerCatalog = ${JSON.stringify(debugInfo.deezerCatalog)}`
  );
  ok(
    Object.prototype.hasOwnProperty.call(debugInfo, "deezerAlbumTitle"),
    "tryDeezer (generic artist): title-only pass (c) must still run (with a null artist)"
  );
  eq(result, null, "tryDeezer (generic artist): no match found in this fixture, so the overall result is null (not a thrown error)");
})();

// Positive control for the same guard: a REAL, non-generic artist must
// still reach the free-text pass — proves the generic-artist skip isn't
// accidentally swallowing everyone.
await (async () => {
  const debugInfo = {};
  await withMockFetch(
    (url) => jsonResponse({ data: [] }),
    async () => tryDeezer("Fleetwood Mac", "Rumours", debugInfo)
  );
  ok(
    Object.prototype.hasOwnProperty.call(debugInfo, "deezerFreeText"),
    "tryDeezer (real artist): free-text pass (a) must run normally for a non-generic artist"
  );
});

// =============================================================================
// Bonus: isGenericArtist coverage, since every case above depends on it.
// =============================================================================
{
  eq(isGenericArtist("Various Artists"), true, "isGenericArtist: 'Various Artists'");
  eq(isGenericArtist("Various"), true, "isGenericArtist: 'Various'");
  eq(isGenericArtist("VA"), true, "isGenericArtist: 'VA'");
  eq(isGenericArtist("The Cure"), false, "isGenericArtist: a real artist name is not generic");
  eq(isGenericArtist("Scott Joplin"), false, "isGenericArtist: a real (if recording-less) composer is not generic");
}

// --- summary -----------------------------------------------------------------
console.log(`\n${passed} passed, ${failed} failed`);
if (failed) {
  console.log("\nFAILURES:");
  for (const f of failures) console.log("  - " + f);
  process.exit(1);
}
process.exit(0);
