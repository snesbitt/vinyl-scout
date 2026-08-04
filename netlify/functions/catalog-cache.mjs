import { getStore } from '@netlify/blobs';

// netlify/functions/catalog-cache.mjs
// version: 1
//
// Phase 11 — Concert Radar. Read-only endpoint for scheduled-sweep.mjs's
// weekly output, added 2026-08-04 (v18).
//
// PURE READ. Returns whatever scheduled-sweep.mjs last wrote to the
// 'catalog-cache' Blobs store — { shows, artistCount, at } — or an empty
// placeholder if the scheduled job hasn't run yet (e.g. right after first
// deploy, before the first weekly firing). concert-radar.html calls this
// once, on page load, ONLY when it has no local catalog cache of its own
// (a new device or cleared profile) — it's a fast, real first paint in
// place of the removed "Checking 0 of N artists…" wait. The client always
// still runs its own live sweepCatalog() afterward regardless, so this
// endpoint never has to be perfectly fresh — it just has to not be empty.

function json(body, status) {
  return new Response(JSON.stringify(body), {
    status: status || 200,
    headers: { 'Content-Type': 'application/json' },
  });
}

export const config = {
  path: '/api/catalog-cache'
};

export default async (req) => {
  try {
    const method = (req.method || '').toUpperCase();
    if (method !== 'GET') {
      return json({ error: 'Method not allowed' }, 405);
    }

    const store = getStore('catalog-cache');
    const data = await store.get('latest');
    if (!data) {
      return json({ shows: [], artistCount: 0, at: null });
    }
    try {
      return json(JSON.parse(data));
    } catch (e) {
      return json({ shows: [], artistCount: 0, at: null });
    }
  } catch (err) {
    console.error('catalog-cache.mjs error:', err.message, err.stack);
    return json({ error: err.message }, 500);
  }
};
