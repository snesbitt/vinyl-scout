import { getStore } from '@netlify/blobs';
import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

// netlify/functions/catalog-cache.mjs
// version: 2
//
// Phase 11 — Concert Radar. Read-only endpoint for scheduled-sweep.mjs's
// weekly output, added 2026-08-04 (v18). Updated 2026-08-15 as the second
// half of the GitHub Actions catalog-sweep migration (see
// scripts/scheduled-sweep.mjs and .github/workflows/scheduled-sweep.yml,
// added 2026-08-14): this endpoint now reads the git-committed
// data/catalog-cache.json the Actions workflow writes every Sunday,
// instead of the Blobs store the OLD Netlify-scheduled scheduled-sweep.mjs
// writes to. Falls back to Blobs if the committed file is ever missing or
// fails to parse — a deliberate safety net, not dead code, so a bad or
// stale deploy of this file can't turn a working endpoint into a broken
// one. Once the git-committed source has a solid track record (a few
// clean weekly Actions runs with no fallback ever firing), the Blobs
// fallback path and the old Netlify-scheduled scheduled-sweep.mjs +
// backing Blobs store can be removed together — not yet, this deploy.
//
// PURE READ, same contract as before: { shows, artistCount, at } (now
// also carries `source`, either 'github-actions' or 'netlify-blobs',
// so a live response makes it obvious which path served it — useful
// while both are still in play during the transition window). Returns
// an empty placeholder only if BOTH sources are unavailable.
// concert-radar.html calls this once, on page load, ONLY when it has no
// local catalog cache of its own — the client always still runs its own
// live sweepCatalog() afterward regardless, so this endpoint never has to
// be perfectly fresh, just not empty when both sources should have data.

function json(body, status) {
  return new Response(JSON.stringify(body), {
    status: status || 200,
    headers: { 'Content-Type': 'application/json' },
  });
}

export const config = {
  path: '/api/catalog-cache'
};

async function readCommittedCache() {
  // Resolves relative to this file's own location inside the deployed
  // function bundle, not the repo root or cwd — deliberate, since a
  // Netlify Function's working directory at runtime is not guaranteed to
  // be the repo root. netlify.toml must list data/catalog-cache.json under
  // this function's included_files for esbuild's bundler to actually ship
  // the file — verify that config is in place before trusting this path
  // to work in a real deploy, not just locally.
  const here = path.dirname(fileURLToPath(import.meta.url));
  const jsonPath = path.join(here, '..', '..', 'data', 'catalog-cache.json');
  const raw = await readFile(jsonPath, 'utf-8');
  const parsed = JSON.parse(raw);
  if (!parsed || !Array.isArray(parsed.shows)) {
    throw new Error('committed catalog-cache.json missing a shows array');
  }
  return parsed;
}

async function readBlobsCache() {
  const store = getStore('catalog-cache');
  const data = await store.get('latest');
  if (!data) return null;
  const parsed = JSON.parse(data);
  if (!parsed || !Array.isArray(parsed.shows)) return null;
  return Object.assign({ source: 'netlify-blobs' }, parsed);
}

export default async (req) => {
  try {
    const method = (req.method || '').toUpperCase();
    if (method !== 'GET') {
      return json({ error: 'Method not allowed' }, 405);
    }

    try {
      const committed = await readCommittedCache();
      return json(committed);
    } catch (committedErr) {
      console.warn('catalog-cache.mjs: committed file read failed, falling back to Blobs:', committedErr.message);
    }

    try {
      const blobsResult = await readBlobsCache();
      if (blobsResult) return json(blobsResult);
    } catch (blobsErr) {
      console.warn('catalog-cache.mjs: Blobs fallback also failed:', blobsErr.message);
    }

    return json({ shows: [], artistCount: 0, at: null, source: null });
  } catch (err) {
    console.error('catalog-cache.mjs error:', err.message, err.stack);
    return json({ error: err.message }, 500);
  }
};
