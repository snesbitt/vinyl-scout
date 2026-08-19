#!/usr/bin/env node
// scripts/test-concert-radar-health-check.mjs
// version: 1
//
// Offline unit tests for scripts/concert-radar-health-check.mjs's text-
// manipulation and verification helpers, run against the REAL
// netlify/functions/venue-shows.mjs source (not a copy) so a future change
// to that file's structure gets caught here rather than silently breaking
// the health-check script's ability to parse/patch it. No network calls —
// mocks `fetch` where the code under test needs it, same pattern as this
// repo's other test-*.mjs files. Zero secrets used or needed.
//
// Run via `npm run test:concert-radar-health-check` (wired into `npm test`).

import { readFile } from 'node:fs/promises';
import { execFileSync } from 'node:child_process';
import { writeFile, mkdtemp } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import {
  extractFunction, extractHelperBlock, replaceFunction, disableVenueLine,
  bumpVersion, verifyParserAgainstHtml, checkVenueShows,
  checkSeatGeekSpotCheck, checkCatalogCacheFreshness, VENUE_FUNCTION, CANARY,
} from './concert-radar-health-check.mjs';

const VENUE_FILE = 'netlify/functions/venue-shows.mjs';
let pass = 0, fail = 0;

function ok(msg) { pass++; console.log('  ok   ' + msg); }
function bad(msg) { fail++; console.log('  FAIL ' + msg); }
async function check(name, fn) {
  try { await fn(); }
  catch (err) { bad(name + ' — ' + (err && err.stack || err)); }
}
function assert(cond, msg) { if (!cond) throw new Error(msg); }

const source = await readFile(VENUE_FILE, 'utf-8');

console.log('Concert Radar health-check helper tests\n');

// --- extractHelperBlock --------------------------------------------------

let helperBlock;
await check('extractHelperBlock finds the shared helper functions', async () => {
  helperBlock = extractHelperBlock(source);
  for (const needle of ['toIsoDate', 'decodeEntities', 'TRIBUTE_WORDS', 'NON_MUSIC_WORDS', 'fetchText']) {
    assert(helperBlock.includes(needle), 'helper block missing ' + needle);
  }
  ok('helper block contains all expected shared helpers');
});

// --- extractFunction: every parser function is extractable & balanced ---

const ALL_FN_NAMES = [...new Set(Object.values(VENUE_FUNCTION))];
for (const fnName of ALL_FN_NAMES) {
  await check('extractFunction(' + fnName + ') extracts valid, balanced source', async () => {
    const { code } = extractFunction(source, fnName);
    assert(code.startsWith('function ' + fnName) || code.startsWith('async function ' + fnName), 'does not start with function signature');
    assert(code.trim().endsWith('}'), 'does not end with closing brace');
    const openCount = (code.match(/\{/g) || []).length;
    const closeCount = (code.match(/\}/g) || []).length;
    assert(openCount === closeCount, 'unbalanced braces: ' + openCount + ' open vs ' + closeCount + ' close');
    ok(fnName + ' extracted cleanly (' + code.length + ' chars)');
  });
}

// --- replaceFunction + node --check on the result -----------------------

await check('replaceFunction swaps a function and result still passes node --check', async () => {
  const stub = 'function parseFreight(html) {\n  return [];\n}';
  const patched = replaceFunction(source, 'parseFreight', stub);
  assert(patched.includes('return [];'), 'stub not spliced in');
  assert(patched.length < source.length, 'patched source unexpectedly not shorter');
  const dir = await mkdtemp(path.join(tmpdir(), 'cr-test-'));
  const p = path.join(dir, 'patched.mjs');
  await writeFile(p, patched, 'utf-8');
  execFileSync(process.execPath, ['--check', p], { stdio: 'pipe' });
  ok('patched file is valid JS');
});

// --- disableVenueLine -----------------------------------------------------

await check('disableVenueLine disables sweetwater without touching other venues', async () => {
  const disabled = disableVenueLine(source, 'sweetwater', 'test disable reason');
  assert(disabled.includes('test disable reason'), 'reason string not present');
  assert(disabled.includes('key: "sweetwater"'), 'sweetwater entry line was removed, not just disabled');
  assert(disabled.includes('key: "cornerstone", label: "Cornerstone"'), 'unrelated venue entry got mangled');
  assert(disabled.includes('function parseCornerstone'), 'unrelated parser function got mangled');
  const dir = await mkdtemp(path.join(tmpdir(), 'cr-test-'));
  const p = path.join(dir, 'disabled.mjs');
  await writeFile(p, disabled, 'utf-8');
  execFileSync(process.execPath, ['--check', p], { stdio: 'pipe' });
  ok('disabled file is valid JS and sweetwater alone was targeted');
});

await check('disableVenueLine on gamh does not affect chapel (shared parser, separate VENUES entries)', async () => {
  const disabled = disableVenueLine(source, 'gamh', 'gamh test disable');
  assert(disabled.includes('key: "gamh"') && disabled.includes('gamh test disable'), 'gamh not disabled correctly');
  assert(!disabled.includes('chapel test disable'), 'sanity: no cross-contamination string');
  assert(disabled.includes('key: "chapel", label: "The Chapel"'), 'chapel entry line untouched');
  // chapel's own VENUES line should still reference parseSeeTickets, not a throw
  const chapelLineMatch = /\{ key: "chapel".*?\},?/.exec(disabled);
  assert(chapelLineMatch && chapelLineMatch[0].includes('parseSeeTickets'), 'chapel wiring was unexpectedly changed');
  ok('disabling gamh leaves chapel (shared-parser sibling) fully functional');
});

// --- bumpVersion ------------------------------------------------------------

await check('bumpVersion increments version and adds a changelog line', async () => {
  const before = /^\/\/ version: (\d+)$/m.exec(source);
  assert(before, 'could not find current version line in source');
  const bumped = bumpVersion(source, 'test change', '2099-01-01');
  const after = /^\/\/ version: (\d+)$/m.exec(bumped);
  assert(after && parseInt(after[1], 10) === parseInt(before[1], 10) + 1, 'version did not increment by exactly 1');
  assert(bumped.includes('v' + after[1] + ' (2099-01-01): test change'), 'changelog line missing/malformed');
  ok('version bumped ' + before[1] + ' -> ' + after[1] + ' with changelog note');
});

// --- verifyParserAgainstHtml: end-to-end against a synthetic fixture ------

await check('verifyParserAgainstHtml runs the REAL parseCornerstone against a synthetic fixture and extracts it correctly', async () => {
  const fixtureHtml = '<html><body>' +
    '<script type="application/ld+json">' +
    JSON.stringify({
      '@type': 'Event',
      name: 'Test Fixture Show',
      startDate: '2099-06-01T20:00:00Z',
      location: { name: 'Cornerstone' },
      offers: [{ url: 'https://example.com/tickets/test' }],
    }) +
    '</script></body></html>';
  const { code } = extractFunction(source, 'parseCornerstone');
  const shows = await verifyParserAgainstHtml(helperBlock, code, 'parseCornerstone', fixtureHtml, 'parseCornerstone(html)');
  assert(shows.length === 1, 'expected exactly 1 show, got ' + shows.length);
  assert(shows[0].title === 'Test Fixture Show', 'title mismatch: ' + shows[0].title);
  assert(shows[0].date === '2099-06-01', 'date mismatch: ' + shows[0].date);
  ok('real parseCornerstone correctly parsed a synthetic JSON-LD fixture end to end');
});

await check('verifyParserAgainstHtml throws when a parser finds nothing (simulates an unfixed/broken parser)', async () => {
  const { code } = extractFunction(source, 'parseCornerstone');
  let threw = false;
  try {
    await verifyParserAgainstHtml(helperBlock, code, 'parseCornerstone', '<html><body>no events here</body></html>', 'parseCornerstone(html)');
  } catch (err) {
    threw = true;
  }
  assert(threw, 'expected verifyParserAgainstHtml to throw on empty results');
  ok('correctly refuses to accept a zero-result parse as a verified fix');
});

// --- checkVenueShows / checkSeatGeekSpotCheck / checkCatalogCacheFreshness (mocked fetch) ---

function withMockFetch(responses, fn) {
  const real = globalThis.fetch;
  let i = 0;
  globalThis.fetch = async (url) => {
    const r = responses[i] || responses[responses.length - 1];
    i++;
    return { ok: r.ok !== false, status: r.status || 200, text: async () => r.text };
  };
  return fn().finally(() => { globalThis.fetch = real; });
}

await check('checkVenueShows flags a broken venue and detects a missing canary', async () => {
  const fakeBody = {
    shows: [],
    meta: {
      venues: [
        { key: 'cornerstone', label: 'Cornerstone', sourceUrl: 'https://cornerstoneberkeley.com/events', count: 3, error: null },
        { key: 'sweetwater', label: 'Sweetwater Music Hall', sourceUrl: 'https://sweetwatermusichall.org/events/', count: 0, error: 'HTTP 500' },
      ],
    },
  };
  await withMockFetch([{ text: JSON.stringify(fakeBody) }], async () => {
    const result = await checkVenueShows();
    assert(result.broken.length === 1 && result.broken[0].key === 'sweetwater', 'did not correctly identify the broken venue');
    assert(result.canaryOk === false, 'canary should be missing when shows array is empty');
  });
  ok('checkVenueShows correctly identifies broken venues and missing canary from mocked JSON');
});

await check('checkVenueShows recognizes the canary when a real "Venue:"-sourced Black Uhuru/Sweetwater show is present', async () => {
  const fakeBody = {
    shows: [{ venue: CANARY.venueLabel, artist: CANARY.artist, date: CANARY.expectedDate, source: 'Venue: Sweetwater Music Hall' }],
    meta: { venues: [{ key: 'sweetwater', label: 'Sweetwater Music Hall', sourceUrl: 'x', count: 1, error: null }] },
  };
  await withMockFetch([{ text: JSON.stringify(fakeBody) }], async () => {
    const result = await checkVenueShows();
    assert(result.canaryOk === true, 'canary should be recognized as present');
  });
  ok('checkVenueShows correctly recognizes a real venue-sourced canary (not a MANUAL_SHOWS entry)');
});

await check('checkVenueShows does NOT count a MANUAL_SHOWS-sourced canary as proof the scraper works', async () => {
  const fakeBody = {
    shows: [{ venue: CANARY.venueLabel, artist: CANARY.artist, date: CANARY.expectedDate, source: 'Manual entry — verified 2026-08-04' }],
    meta: { venues: [{ key: 'sweetwater', label: 'Sweetwater Music Hall', sourceUrl: 'x', count: 0, error: null }] },
  };
  await withMockFetch([{ text: JSON.stringify(fakeBody) }], async () => {
    const result = await checkVenueShows();
    assert(result.canaryOk === false, 'a MANUAL_SHOWS entry must not be accepted as proof parseSweetwater works');
  });
  ok('correctly distinguishes a real scrape from the MANUAL_SHOWS fallback for the same show');
});

await check('checkSeatGeekSpotCheck reports failure on HTTP 500', async () => {
  await withMockFetch([{ ok: false, status: 500, text: '{"error":"seatgeek down"}' }], async () => {
    const result = await checkSeatGeekSpotCheck();
    assert(result.ok === false && result.status === 500, 'did not correctly report the 500');
  });
  ok('checkSeatGeekSpotCheck correctly reports a 500');
});

await check('checkCatalogCacheFreshness flags a stale timestamp', async () => {
  const staleAt = new Date(Date.now() - 20 * 24 * 60 * 60 * 1000).toISOString();
  await withMockFetch([{ text: JSON.stringify({ at: staleAt }) }], async () => {
    const result = await checkCatalogCacheFreshness();
    assert(result.ok === false, 'a 20-day-old cache should be flagged stale');
  });
  ok('checkCatalogCacheFreshness correctly flags a stale (>9 day) timestamp');
});

await check('checkCatalogCacheFreshness accepts a fresh timestamp', async () => {
  const freshAt = new Date(Date.now() - 2 * 24 * 60 * 60 * 1000).toISOString();
  await withMockFetch([{ text: JSON.stringify({ at: freshAt }) }], async () => {
    const result = await checkCatalogCacheFreshness();
    assert(result.ok === true, 'a 2-day-old cache should be accepted as fresh');
  });
  ok('checkCatalogCacheFreshness correctly accepts a fresh timestamp');
});

console.log('\n' + pass + ' passed, ' + fail + ' failed\n');
process.exit(fail ? 1 : 0);
