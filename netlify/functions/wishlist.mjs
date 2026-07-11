import { getStore } from '@netlify/blobs';

export const config = {
  path: "/api/wishlist/:id?"
};

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

export default async (req, context) => {
  try {
    const method = (req.method || '').toUpperCase();

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
      await store.delete(id);
      return new Response(JSON.stringify({ ok: true, deleted: id }), {
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
