// netlify/functions/catalog-cache.mjs
// version: 2
//
// Phase 11 — Concert Radar. Read-only endpoint for the weekly catalog sweep's
// output, added 2026-08-04 (v18).
//
// v2 (2026-08-19): READS data/catalog-cache.json INSTEAD OF NETLIFY BLOBS.
// This is the read half of the cutover that .github/workflows/scheduled-sweep.yml
// has been asking for since 2026-08-14, and it is what actually closes the
// long-standing "scheduled-sweep can't migrate to Actions, Blobs has no public
// write path" item.
//
// That item was framed as a choice between giving Actions a Netlify Blobs
// token and building a new EDIT_SECRET-gated write endpoint for it to POST to.
// Neither is needed, because the write side already stopped using Blobs.
// scripts/scheduled-sweep.mjs (2026-08-14) runs in Actions, reads the same
// public endpoints, and commits its merged result to data/catalog-cache.json
// with no Netlify credential of any kind. It has been running on schedule and
// its output is real: `source: "github-actions"`, 36 shows across 132 artists,
// last written 2026-08-16 10:30 UTC, matching its Sunday 10:00 UTC cron. The
// only thing still pointing at Blobs was this file. So the cutover is a read
// change, not a new authenticated write path, and it adds zero secrets rather
// than the one either original option required.
//
// PURE READ, unchanged. Same response shape as v1 — { shows, artistCount, at }
// — plus the `source` field the Actions writer already includes, which is
// additive and ignored by concert-radar.html. Same empty placeholder when
// there is no data.
//
// Why a static import and not a runtime file read: `publish = "."` means the
// repo root is the deploy, so esbuild inlines this JSON into the function
// bundle at build time. No filesystem access at runtime, no included_files
// config to keep in sync, and a missing or malformed file fails the BUILD
// rather than every request. Freshness comes from redeploys: the Actions job
// commits, Netlify's git integration deploys, the bundle carries the new data.
//
// Staleness is deliberately NOT this endpoint's problem, same as v1. The
// client calls it once on first paint when it has no local cache, then always
// runs its own live sweepCatalog() regardless, so this only has to be
// non-empty rather than current. Actual staleness monitoring already exists
// and is unaffected: scripts/concert-radar-health-check.mjs's
// checkCatalogCacheFreshness flags this endpoint's `at` past 9 days.
//
// NOT done in this change, on purpose: netlify/functions/scheduled-sweep.mjs
// still exists and still writes the 'catalog-cache' Blobs store on its own
// Netlify schedule. That write now has no reader, which is harmless, and
// leaving it in place keeps a working fallback while the read side is
// confirmed live. Retire it in a follow-up once /api/catalog-cache has been
// checked against production, not before. The Blobs store itself is left
// intact for the same reason.
//
// ONE THING THAT NEEDS A LIVE CHECK. This is a bundler-boundary change, and
// this repo's own standing rule says a dynamic import across a deployment
// boundary can pass every local test and still fail in the real bundle. The
// tests in scripts/test-catalog-cache.mjs run the real handler against the
// real data file and prove the logic, not the deploy. After this ships, hit
// https://vinylscout.org/api/catalog-cache and confirm it returns a non-empty
// `shows` array with `source: "github-actions"`. If it returns the empty
// placeholder, the JSON did not make it into the bundle and the fix is
// `included_files` in netlify.toml plus a runtime read, not a revert.

import cache from '../../data/catalog-cache.json' with { type: 'json' };

function json(body, status) {
  return new Response(JSON.stringify(body), {
    status: status || 200,
    headers: { 'Content-Type': 'application/json' },
  });
}

const EMPTY = { shows: [], artistCount: 0, at: null };

export const config = {
  path: '/api/catalog-cache'
};

export default async (req) => {
  try {
    const method = (req.method || '').toUpperCase();
    if (method !== 'GET') {
      return json({ error: 'Method not allowed' }, 405);
    }

    // A bundled import cannot be absent at runtime, but it CAN be the wrong
    // shape if the sweep ever writes something unexpected, and serving a
    // half-formed object is worse than serving the placeholder: Coming Soon's
    // first paint would render from garbage. Same defensive posture v1 had
    // around JSON.parse, kept rather than dropped because the failure mode it
    // guards is the same one.
    if (!cache || !Array.isArray(cache.shows)) {
      return json(EMPTY);
    }

    return json({
      shows: cache.shows,
      artistCount: typeof cache.artistCount === 'number' ? cache.artistCount : 0,
      at: cache.at || null,
      source: cache.source || null,
    });
  } catch (err) {
    console.error('catalog-cache.mjs error:', err.message, err.stack);
    return json({ error: err.message }, 500);
  }
};
