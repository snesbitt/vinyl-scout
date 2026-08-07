import { getStore } from '@netlify/blobs';

export const config = {
  path: "/api/wishlist/:id?"
};

// Edit-secret gate — added v4 (2026-08-06). Same pattern as records.mjs:
// GET stays public, POST/DELETE require X-Edit-Key to equal EDIT_SECRET
// (same Netlify env var the catalog uses — Phase 8 explicitly reuses the
// catalog's own key, not a separate wishlist-only one). Fails closed: if
// EDIT_SECRET is unset, all writes are rejected.
function checkWriteAuth(req) {
  const expected = process.env.EDIT_SECRET;
  const provided = req.headers.get('x-edit-key');
  return !!(expected && provided && provided === expected);
}

// version: 4
//
// Phase 3 — Wishlist. Separate Blobs store ('wishlist') so wishlist writes
// can never touch the catalog store.
//
// v2 (2026-07-11): POST/DELETE are UNGATED — no X-Edit-Key check — per
// Susan's explicit request: typing the edit passphrase on mobile every
// session wasn't practical for a page she uses casually and often. This is
// a deliberate, requested exception to the edit-secret pattern used
// elsewhere (records.mjs, save-cover.mjs still require it). Anyone with the
// site URL can add/remove wishlist items; the catalog itself is unaffected
// and remains fully gated. Hard Rules still apply regardless of auth:
// single-item upserts and deletes only — no bulk code paths, no dedup, no
// background mutation.
//
// v3 (2026-07-29): DELETE now records the removed item into a `deleted` list
// in sync-state.json (committed via the GitHub Contents API, same pattern as
// save-cover.mjs / run-backup.mjs). BUG FIX: sync-state.json previously only
// tracked `auto_added` — nothing ever recorded what Susan deleted, so the
// weekly Spotify/Amazon-cart sync had no way to honor a deletion and would
// re-add the same item the next time it resurfaced in her playlists/cart.
// CLAUDE.md has documented a "persistent no-re-add rule via sync-state.json"
// since v9 — this change is what actually makes that true; before it, the
// rule was aspirational. The sync job itself (external to this repo, in
// Susan's Claude scheduled tasks) must skip anything whose normalized key
// appears in `deleted` — that's a prompt-side change outside this codebase.
// This write is best-effort and non-fatal: if it fails (e.g. GITHUB_TOKEN
// missing), the delete itself still succeeds — bookkeeping should never
// block the primary action.
//
// v4 (2026-08-06, roadmap Phase 8, "Close the wishlist gap"): supersedes
// v2's decision above. POST/DELETE are now gated by the same X-Edit-Key /
// EDIT_SECRET check records.mjs uses (see checkWriteAuth below) — but the
// frontend (wishlist.html) remembers the key in localStorage after it's
// entered once, rather than sessionStorage (which the catalog's own
// audit.html/seed.html use, costing one entry per tab session). That
// difference is deliberate: v2's whole reason for opening this up was that
// re-entering a key on mobile every session wasn't practical for a casual
// list. A device-remembered key costs one entry per device, not one per
// visit, closing the gap without reintroducing that friction.

// Same normalization used to build the `auto_added` keys already in
// sync-state.json: lowercase, any non a-z0-9 char becomes a space (not
// deleted — this matters for accented characters, e.g. "L'Impératrice" ->
// "l imp ratrice"), then collapse runs of spaces and trim.
function normalizeKey(s) {
  return String(s || '')
    .toLowerCase()
    .replace(/[^a-z0-9]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

async function recordDeletion(artist, title) {
  const key = (normalizeKey(artist) + ' ' + normalizeKey(title)).trim();
  if (!key) return { ok: false, reason: 'empty key' };

  const token = process.env.GITHUB_TOKEN;
  const repo = process.env.GITHUB_REPO || 'snesbitt/vinyl-scout';
  const branch = process.env.GITHUB_BRANCH || 'main';
  if (!token) return { ok: false, reason: 'GITHUB_TOKEN not configured' };

  const path = 'sync-state.json';
  const ghHeaders = {
    'Authorization': 'Bearer ' + token,
    'Accept': 'application/vnd.github+json',
    'User-Agent': 'vinyl-scout-wishlist',
  };

  try {
    const getRes = await fetch(
      'https://api.github.com/repos/' + repo + '/contents/' + path + '?ref=' + branch,
      { headers: ghHeaders }
    );
    let state = { auto_added: [], deleted: [] };
    let sha = null;
    if (getRes.ok) {
      const file = await getRes.json();
      sha = file.sha;
      state = JSON.parse(Buffer.from(file.content, 'base64').toString('utf-8'));
    }
    if (!Array.isArray(state.deleted)) state.deleted = [];
    if (state.deleted.includes(key)) return { ok: true, already_present: true };

    state.deleted.push(key);

    const body = {
      message: 'wishlist: record deletion "' + key + '"',
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

export default async (req, context) => {
  try {
    const method = (req.method || '').toUpperCase();

    // Auth gate runs BEFORE getStore() -- same order records.mjs uses.
    // Checked here, ahead of any Blobs call, so an unauthorized/misconfigured
    // request always gets a clean 401 rather than depending on getStore()
    // not throwing first (it throws if the Blobs environment isn't
    // configured, which would surface as a 500 instead of a 401 if this
    // check ran after store creation -- caught by scripts/test-wishlist.mjs
    // during Phase 8 review, fixed before it ever shipped this way).
    if ((method === 'POST' || method === 'DELETE') && !checkWriteAuth(req)) {
      return new Response(JSON.stringify({ error: 'unauthorized — wrong or missing edit passphrase' }), {
        status: 401,
        headers: { 'Content-Type': 'application/json' }
      });
    }

    const store = getStore('wishlist');

    if (method === 'POST') {
      const body = await req.json();
      if (!body || !body.id) {
        return new Response(JSON.stringify({ error: 'item id required' }), {
          status: 400,
          headers: { 'Content-Type': 'application/json' }
        });
      }
      await store.set(body.id, JSON.stringify(body));
      return new Response(JSON.stringify({ ok: true, id: body.id }), {
        status: 200,
        headers: { 'Content-Type': 'application/json' }
      });
    }

    if (method === 'GET') {
      const { blobs } = await store.list();
      const items = [];
      for (const blob of blobs) {
        const data = await store.get(blob.key);
        if (data) items.push(JSON.parse(data));
      }
      return new Response(JSON.stringify(items), {
        status: 200,
        headers: { 'Content-Type': 'application/json' }
      });
    }

    if (method === 'DELETE') {
      const id = new URL(req.url).pathname.split('/').pop();
      if (!id || id === 'wishlist') {
        return new Response(JSON.stringify({ error: 'ID required' }), {
          status: 400,
          headers: { 'Content-Type': 'application/json' }
        });
      }

      // Read the item BEFORE deleting so we can record its artist/title —
      // once it's gone from the store there's nothing left to key on.
      let item = null;
      try {
        const raw = await store.get(id);
        if (raw) item = JSON.parse(raw);
      } catch (e) { /* malformed stored item; deletion still proceeds below */ }

      await store.delete(id);

      let deletionRecord = { ok: false, reason: 'no artist/title on stored item' };
      if (item && (item.artist || item.title)) {
        deletionRecord = await recordDeletion(item.artist, item.title);
        if (!deletionRecord.ok) {
          console.warn('wishlist.mjs: could not record deletion for no-re-add tracking:', deletionRecord.reason);
        }
      }

      return new Response(JSON.stringify({
        ok: true,
        deleted: id,
        no_readd_recorded: !!deletionRecord.ok
      }), {
        status: 200,
        headers: { 'Content-Type': 'application/json' }
      });
    }

    return new Response(JSON.stringify({ error: 'Method not allowed' }), {
      status: 405,
      headers: { 'Content-Type': 'application/json' }
    });
  } catch (err) {
    console.error('wishlist.mjs error:', err.message, err.stack);
    return new Response(JSON.stringify({ error: err.message }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' }
    });
  }
};
