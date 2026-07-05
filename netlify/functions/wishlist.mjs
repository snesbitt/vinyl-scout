import { getStore } from '@netlify/blobs';

export const config = {
  path: "/api/wishlist/:id?"
};

// Phase 3 — Wishlist. Same contract as records.mjs: GET is public, POST and
// DELETE require X-Edit-Key === EDIT_SECRET (fails closed if unset). Separate
// Blobs store ('wishlist') so wishlist writes can never touch the catalog.
// Hard Rules apply here too: single-item upserts and deletes only — no bulk
// code paths, no dedup, no background mutation.
function checkWriteAuth(req) {
  const expected = process.env.EDIT_SECRET;
  const provided = req.headers.get('x-edit-key');
  return !!(expected && provided && provided === expected);
}

export default async (req, context) => {
  try {
    const method = (req.method || '').toUpperCase();

    if (method === 'POST' || method === 'DELETE') {
      if (!checkWriteAuth(req)) {
        return new Response(JSON.stringify({ error: 'unauthorized — wrong or missing edit passphrase' }), {
          status: 401,
          headers: { 'Content-Type': 'application/json' }
        });
      }
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
