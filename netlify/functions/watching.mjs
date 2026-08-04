import { getStore } from '@netlify/blobs';

export const config = {
  path: "/api/watching/:id?"
};

// version: 1
//
// Phase 11 — Concert Radar. Watching panel storage, added 2026-08-04 (v16).
//
// Was pure client-side localStorage (key cr_watching_v1) since Watching
// shipped — that broke for Susan the same day: she reported the Watching
// panel (4 artists: Thievery Corporation, Kruder & Dorfmeister, Steel
// Pulse, Buena Vista Social Club) had gone empty within about 10 minutes of
// normal use, in the same browser/profile she always uses. No code path in
// concert-radar.html ever calls localStorage.clear() or overwrites
// cr_watching_v1 with an empty array — so whatever cleared it (private
// window, a browser/OS-level storage eviction, Safari-style tracking-
// prevention purges, a manual clear) was outside this app's control, which
// is exactly the risk of keeping the only copy of real user data in one
// browser's local storage with nothing durable behind it. Susan asked
// directly for this to move server-side, same as the wishlist did.
//
// Ungated, same rationale + same exception as wishlist.mjs (v2, 2026-07-11):
// this is casual state Susan adds to from her phone; typing the edit
// passphrase every time isn't practical here either. Deliberately narrower
// than the catalog gate — the catalog (`/api/records`) and covers
// (`/api/save-cover`) remain fully gated. Separate Blobs store ('watching')
// so a bug here can never touch the catalog or wishlist stores.
//
// A watched item has no server-verified show/date attached — it's just
// "artist (+ optional city) Susan wants to hear about." concert-radar.html
// still does the actual show-matching client-side against the existing
// Coming Soon list, same as it always did; this endpoint only persists the
// artist+city pairs themselves.
//
// Sentinel records: `_meta_seed_v16_done` marks that the 2026-08-04
// one-time seed (Easy Star All-Stars, Black Uhuru, Burning Spear — named
// directly by Susan, outside every automated SeatGeek/venue match) has
// already run, so a page load in a NEW browser/profile doesn't re-run the
// seed and silently re-add something Susan deliberately deleted elsewhere.
// This lives in the same store as real watched artists (simplest thing that
// works for one flag) but is filtered out of every GET response below by
// id prefix, so it never renders as a card and never counts toward
// anything client-side sees.

function isSentinel(id) {
  return typeof id === 'string' && id.indexOf('_meta_') === 0;
}

function json(body, status) {
  return new Response(JSON.stringify(body), {
    status: status || 200,
    headers: { 'Content-Type': 'application/json' },
  });
}

var SEED_SENTINEL_KEY = '_meta_seed_v16_done';
var SEED_ARTISTS = [
  { artist: 'Black Uhuru', city: 'Berkeley, CA' }, // verified Feb 21, 2026, Freight & Salvage
  { artist: 'Easy Star All-Stars', city: '' }, // no confirmed current Bay Area date — don't guess a city
  { artist: 'Burning Spear', city: '' }, // no confirmed current Bay Area date — don't guess a city
];

// Runs once, ever, for this store — server-side rather than a per-browser
// localStorage flag, specifically so it can't re-fire in a browser/device
// that never happened to run it before and re-add something Susan already
// deleted from a different browser. Best-effort: a failure here shouldn't
// break a normal GET, so errors are swallowed and logged, not thrown.
async function seedIfNeeded(store) {
  try {
    var already = await store.get(SEED_SENTINEL_KEY);
    if (already) return;
    for (var i = 0; i < SEED_ARTISTS.length; i++) {
      var s = SEED_ARTISTS[i];
      var id = 'watch_seed_v16_' + i;
      await store.set(id, JSON.stringify({ id: id, artist: s.artist, city: s.city }));
    }
    await store.set(SEED_SENTINEL_KEY, JSON.stringify({ at: new Date().toISOString() }));
  } catch (e) {
    console.error('watching.mjs seedIfNeeded failed:', e.message);
  }
}

export default async (req) => {
  try {
    const method = (req.method || '').toUpperCase();
    const store = getStore('watching');

    if (method === 'POST') {
      const body = await req.json();
      if (!body || !body.id || !body.artist) {
        return json({ error: 'id and artist are required' }, 400);
      }
      await store.set(body.id, JSON.stringify(body));
      return json({ ok: true, id: body.id });
    }

    if (method === 'GET') {
      await seedIfNeeded(store);
      const { blobs } = await store.list();
      const items = [];
      for (const blob of blobs) {
        if (isSentinel(blob.key)) continue;
        const data = await store.get(blob.key);
        if (data) {
          try { items.push(JSON.parse(data)); } catch (e) { /* skip malformed entry */ }
        }
      }
      return json(items);
    }

    if (method === 'DELETE') {
      const id = new URL(req.url).pathname.split('/').pop();
      if (!id || id === 'watching') {
        return json({ error: 'ID required' }, 400);
      }
      await store.delete(id);
      return json({ ok: true, deleted: id });
    }

    return json({ error: 'Method not allowed' }, 405);
  } catch (err) {
    console.error('watching.mjs error:', err.message, err.stack);
    return json({ error: err.message }, 500);
  }
};
