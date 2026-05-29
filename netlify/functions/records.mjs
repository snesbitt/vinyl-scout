import { getStore } from '@netlify/blobs';

export const config = {
  path: "/api/records/:id?"
};

// Edit-secret gate. GET is public (anyone can view the gallery).
// POST and DELETE require X-Edit-Key to equal EDIT_SECRET (set via netlify env).
// Fails closed: if EDIT_SECRET is unset, all writes are rejected.
function checkWriteAuth(req) {
  const expected = process.env.EDIT_SECRET;
  const provided = req.headers.get('x-edit-key');
  return !!(expected && provided && provided === expected);
}

export default async (req, context) => {
  try {
    const method = (req.method || '').toUpperCase();

    // Gate writes. Reads stay public.
    if (method === 'POST' || method === 'DELETE') {
      if (!checkWriteAuth(req)) {
        return new Response(JSON.stringify({ error: 'unauthorized — wrong or missing edit passphrase' }), {
          status: 401,
          headers: { 'Content-Type': 'application/json' }
        });
      }
    }

    if (method === 'POST') {
      const store = getStore('records');
      const body = await req.json();
      if (!body || !body.id) {
        return new Response(JSON.stringify({ error: 'record id required' }), {
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
      const store = getStore('records');
      const { blobs } = await store.list();
      const records = [];
      for (const blob of blobs) {
        const data = await store.get(blob.key);
        if (data) records.push(JSON.parse(data));
      }
      return new Response(JSON.stringify(records), {
        status: 200,
        headers: { 'Content-Type': 'application/json' }
      });
    }

    if (method === 'DELETE') {
      const id = new URL(req.url).pathname.split('/').pop();
      if (!id || id === 'records') {
        return new Response(JSON.stringify({ error: 'ID required' }), {
          status: 400,
          headers: { 'Content-Type': 'application/json' }
        });
      }
      const store = getStore('records');
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
    console.error('records.mjs error:', err.message, err.stack);
    return new Response(JSON.stringify({ error: err.message }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' }
    });
  }
};
