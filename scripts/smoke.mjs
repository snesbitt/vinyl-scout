#!/usr/bin/env node
// scripts/smoke.mjs — post-deploy health check for the LIVE site.
//
// Asserts the deployed site is actually healthy, not just that the build went
// green. Uses ZERO secrets: positive reads + negative auth checks (writes must
// be REJECTED when unauthenticated). Safe to run against production any time.
//
// Usage:  npm run smoke                 (defaults to https://vinylscout.org)
//         node scripts/smoke.mjs <baseUrl>
//
// Exits 0 if every check passes, 1 otherwise. Node 18+ (global fetch).

const BASE = (process.argv[2] || 'https://vinylscout.org').replace(/\/$/, '');

let pass = 0, fail = 0;
const ok  = (m) => { pass++; console.log('  ok   ' + m); };
const bad = (m) => { fail++; console.log('  FAIL ' + m); };

async function check(name, fn) {
  try { await fn(); }
  catch (err) { bad(name + ' — ' + err.message); }
}

function assert(cond, msg) { if (!cond) throw new Error(msg); }

console.log('Vinyl Scout smoke test → ' + BASE + '\n');

// 1. Home page loads and wires the cache-busted app.
await check('home page', async () => {
  const res = await fetch(BASE + '/');
  assert(res.ok, 'GET / returned ' + res.status);
  assert((res.headers.get('content-type') || '').includes('text/html'), 'not text/html');
  const html = await res.text();
  assert(html.includes('The Vinyl Scout'), 'title text missing');
  assert(/\/app\.js\?v=\d+/.test(html), 'app.js?v=N not referenced');
  ok('home page loads and references app.js?v=N');
});

// 2. noindex + security headers (locked convention).
await check('security headers', async () => {
  const res = await fetch(BASE + '/');
  assert(/noindex/i.test(res.headers.get('x-robots-tag') || ''), 'X-Robots-Tag not noindex');
  assert((res.headers.get('x-frame-options') || '').toUpperCase() === 'DENY', 'X-Frame-Options not DENY');
  ok('noindex + X-Frame-Options headers present');
});

// 3. Records API returns the catalog.
await check('records API', async () => {
  const res = await fetch(BASE + '/api/records');
  assert(res.ok, 'GET /api/records returned ' + res.status);
  const data = await res.json();
  assert(Array.isArray(data), 'response is not an array');
  assert(data.length > 0, 'catalog is EMPTY (expected records)');
  const r = data[0];
  assert(r && r.id && 'artist' in r && 'title' in r, 'record missing id/artist/title');
  ok('GET /api/records → ' + data.length + ' records, shape valid');
});

// 4. Write endpoints reject unauthenticated writes (no secret sent).
await check('write protection', async () => {
  const res = await fetch(BASE + '/api/records', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ id: 'rec_smoketest_should_never_write' }),
  });
  assert(res.status === 401, 'unauthenticated POST returned ' + res.status + ' (expected 401)');
  ok('unauthenticated POST /api/records → 401');
});

await check('save-cover protection', async () => {
  const res = await fetch(BASE + '/api/save-cover', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({}),
  });
  assert(res.status === 401, 'unauthenticated save-cover returned ' + res.status + ' (expected 401)');
  ok('unauthenticated POST /api/save-cover → 401');
});

// 5. Discogs lookup is wired (400 on missing params = reachable, no token spent).
await check('discogs lookup wired', async () => {
  const res = await fetch(BASE + '/api/discogs/lookup');
  assert(res.status === 400, 'GET /api/discogs/lookup returned ' + res.status + ' (expected 400)');
  ok('GET /api/discogs/lookup (no params) → 400 (endpoint reachable)');
});

// 6. robots.txt disallows crawlers.
await check('robots.txt', async () => {
  const res = await fetch(BASE + '/robots.txt');
  assert(res.ok, 'GET /robots.txt returned ' + res.status);
  const txt = await res.text();
  assert(/disallow:\s*\//i.test(txt), 'robots.txt does not Disallow: /');
  ok('robots.txt disallows crawlers');
});

console.log('\n' + pass + ' passed, ' + fail + ' failed');
process.exit(fail ? 1 : 0);
