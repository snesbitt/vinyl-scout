#!/usr/bin/env node
// scripts/test-catalog-cache.mjs
//
// Regression suite for netlify/functions/catalog-cache.mjs v2, the read half
// of the scheduled-sweep Actions cutover (2026-08-19).
//
// v1 read the 'catalog-cache' Netlify Blobs store. v2 reads
// data/catalog-cache.json, which scripts/scheduled-sweep.mjs commits from
// GitHub Actions. The externally visible contract must not have changed,
// because concert-radar.html's first paint depends on it, so most of what is
// asserted here is sameness rather than newness.
//
// The handler is imported and called directly with real Request objects, the
// same approach scripts/test-jambase-shows.mjs uses. No network, no Netlify.
//
// What this CANNOT prove, stated plainly rather than left implied: that the
// JSON import survives esbuild's bundling on Netlify. Node resolves the import
// here from disk; Netlify inlines it at build time. Per this repo's own
// standing rule about deployment boundaries, that needs a live check against
// https://vinylscout.org/api/catalog-cache after deploy. See the note at the
// top of the function.
//
// Run: node scripts/test-catalog-cache.mjs

import { readFileSync } from 'node:fs';
import handler from '../netlify/functions/catalog-cache.mjs';

let passed = 0;
let failed = 0;

function assert(cond, label) {
  if (cond) {
    passed += 1;
    console.log('  ok   ' + label);
  } else {
    failed += 1;
    console.error('  FAIL ' + label);
  }
}
function assertEqual(actual, expected, label) {
  assert(
    actual === expected,
    label + (actual === expected ? '' : ` (expected ${JSON.stringify(expected)}, got ${JSON.stringify(actual)})`),
  );
}

const raw = JSON.parse(readFileSync(new URL('../data/catalog-cache.json', import.meta.url), 'utf-8'));
const req = (method) =>
  new Request('https://vinylscout.org/api/catalog-cache', method ? { method } : undefined);

// ---------------------------------------------------------------------------
// The contract concert-radar.html depends on
// ---------------------------------------------------------------------------
const res = await handler(req());
assertEqual(res.status, 200, 'GET returns 200');
assertEqual(res.headers.get('Content-Type'), 'application/json', 'GET returns JSON');

const payload = await res.json();
assert(Array.isArray(payload.shows), 'response carries a shows array');
assertEqual(payload.shows.length, raw.shows.length, 'every show in the committed file is served');
assertEqual(payload.artistCount, raw.artistCount, 'artistCount matches the committed file');
assertEqual(payload.at, raw.at, 'the sweep timestamp is passed through unchanged');

// The freshness monitor in scripts/concert-radar-health-check.mjs reads `at`
// off this endpoint and flags anything older than 9 days. A null or reshaped
// timestamp would not fail that check, it would silently disable it.
assertEqual(typeof payload.at, 'number', '`at` is a number, which the 9-day freshness check needs');

// Shape of an individual show, since a first paint renders straight from these.
const sample = payload.shows[0];
assert(sample && typeof sample === 'object', 'shows contain objects');
for (const field of ['artist', 'venue', 'date']) {
  assert(sample && field in sample, `a served show carries "${field}"`);
}

// ---------------------------------------------------------------------------
// v2-specific
// ---------------------------------------------------------------------------
assertEqual(
  payload.source,
  'github-actions',
  'source identifies the Actions writer, confirming this is not Blobs data',
);

// The whole point of the cutover: no Netlify Blobs dependency left in this file.
const src = readFileSync(new URL('../netlify/functions/catalog-cache.mjs', import.meta.url), 'utf-8');
assert(!/@netlify\/blobs/.test(src), 'the function no longer imports @netlify/blobs');
assert(!/getStore\s*\(/.test(src), 'the function no longer calls getStore()');

// ---------------------------------------------------------------------------
// Method handling, unchanged from v1
// ---------------------------------------------------------------------------
for (const method of ['POST', 'PUT', 'DELETE', 'PATCH']) {
  const r = await handler(req(method));
  assertEqual(r.status, 405, `${method} is rejected with 405`);
}

// ---------------------------------------------------------------------------
// The committed file itself has to stay usable, or the endpoint serves an
// empty placeholder in production while every assertion above still passes
// against a stale checkout.
// ---------------------------------------------------------------------------
assert(raw.shows.length > 0, 'data/catalog-cache.json is not empty');
assertEqual(typeof raw.artistCount, 'number', 'data/catalog-cache.json carries a numeric artistCount');
assert(
  Number.isFinite(raw.at) && raw.at > 1_700_000_000_000,
  'data/catalog-cache.json carries a plausible epoch-ms timestamp',
);

console.log(`\n${passed} passed, ${failed} failed`);
if (failed) process.exit(1);
