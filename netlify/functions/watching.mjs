import { getStore } from '@netlify/blobs';

export const config = {
  path: "/api/watching/:id?"
};

// version: 2
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
//
// v2 (2026-08-09): DELETE now records the removed artist into a `deleted`
// list in watching-state.json (committed via the GitHub Contents API, same
// pattern wishlist.mjs's v3 already uses for its own sync-state.json — a
// deliberate copy, not a shared file, so a bug in one feature's
// no-re-add tracking can never touch the other's). Direct cause: the night
// this shipped, Susan restored three artists to this store by hand after a
// data-loss incident, then deliberately removed them again herself moments
// later via the live Remove button — nothing recorded that second removal
// anywhere, so a future backup-restore (see netlify/lib/run-watching-backup.mjs,
// added the same night) would have silently brought them right back,
// indistinguishable from genuine data loss. Susan asked directly: "remember
// when i click it." This is what makes that true going forward. This
// endpoint itself does NOT block Susan's own re-adds through the UI — she
// can always change her mind and re-add anything herself. What this closes
// is a FUTURE AUTOMATED RESTORE silently undoing a deliberate removal;
// any future backup-restore action (human or Claude-driven) must check
// watching-state.json's `deleted` list before restoring any artist from a
// backup snapshot and skip anything that appears there. This write is
// best-effort and non-fatal, same as wishlist.mjs's recordDeletion: if it
// fails (e.g. GITHUB_TOKEN missing), the delete itself still succeeds.

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

// Same normalization convention wishlist.mjs's recordDeletion uses:
// lowercase, non a-z0-9 becomes a space (not deleted — matters for accented
// names), collapse runs of spaces, trim. Keyed on artist name only (not
// city) — re-adding the same artist under a different city is still the
// same "Susan removed this artist" fact.
function normalizeKey(s) {
  return String(s || '')
    .toLowerCase()
    .replace(/[^a-z0-9]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

async function recordDeletion(artist) {
  const key = normalizeKey(artist);
  if (!key) return { ok: false, reason: 'empty key' };

  const token = process.env.GITHUB_TOKEN;
  const repo = process.env.GITHUB_REPO || 'snesbitt/vinyl-scout';
  const branch = process.env.GITHUB_BRANCH || 'main';
  if (!token) return { ok: false, reason: 'GITHUB_TOKEN not configured' };

  const path = 'watching-state.json';
  const ghHeaders = {
    'Authorization': 'Bearer ' + token,
    'Accept': 'application/vnd.github+json',
    'User-Agent': 'vinyl-scout-watching',
  };

  try {
    const getRes = await fetch(
      'https://api.github.com/repos/' + repo + '/contents/' + path + '?ref=' + branch,
      { headers: ghHeaders }
    );
    let state = { deleted: [] };
    let sha = null;
    if (getRes.ok) {
      const file = await getRes.json();
      sha = file.sha;
      state = JSON.parse(Buffer.from(file.content, 'base64').toString('utf-8'));
    }
    if (!Array.isArray(state.deleted)) state.deleted = [];
    if (state.deleted.some(function (e) { return e.key === key; })) {
      return { ok: true, already_present: true };
    }

    state.deleted.push({ key: key, artist: artist, deletedAt: new Date().toISOString() });

    const body = {
      message: 'watching: record deletion "' + key + '"',
      content: Buffer.from(JSON.stringify(state, null, 2), 'utf-8').toString('base64'),
      branch: branch,
    };
    if (sha) body.sha = sha;

    const putRes = await fetch(
      'https://api.github.com/repos/' + repo + '/contents/' + path,
      {
        method: 'PUT',
        headers: Object.assign({}, ghHeaders, { 'Content-Type': 'application/json' }),
        body: JSON.stringify(body),
      }
    );
    if (!putRes.ok) {
      const detail = await putRes.text();
      return { ok: false, reason: 'GitHub commit failed: ' + putRes.status + ' ' + detail.slice(0, 200) };
    }
    return { ok: true };
  } catch (e) {
    return { ok: false, reason: e.message };
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

      // Read the item BEFORE deleting so we can record its artist name --
      // once it's gone from the store there's nothing left to key on.
      let item = null;
      try {
        const raw = await store.get(id);
        if (raw) item = JSON.parse(raw);
      } catch (e) { /* malformed stored item; deletion still proceeds below */ }

      await store.delete(id);

      let deletionRecord = { ok: false, reason: 'no artist on stored item' };
      if (item && item.artist) {
        deletionRecord = await recordDeletion(item.artist);
        if (!deletionRecord.ok) {
          console.warn('watching.mjs: could not record deletion for no-re-add tracking:', deletionRecord.reason);
        }
      }

      return json({ ok: true, deleted: id, no_readd_recorded: !!deletionRecord.ok });
    }

    return json({ error: 'Method not allowed' }, 405);
  } catch (err) {
    console.error('watching.mjs error:', err.message, err.stack);
    return json({ error: err.message }, 500);
  }
};
