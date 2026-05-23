import { getStore } from '@netlify/blobs';

// TEMPORARY: One-time admin endpoint to clear all records
// Usage: POST /api/admin-clear with body { "confirm": true }
// DELETE THIS AFTER USE

export const config = {
  path: '/api/admin-clear',
};

export default async (req, context) => {
  if (req.method !== 'POST') {
    return new Response(JSON.stringify({ error: 'Method not allowed' }), { status: 405, headers: { 'Content-Type': 'application/json' } });
  }

  try {
    const { confirm } = await req.json();
    if (!confirm) {
      return new Response(JSON.stringify({ error: 'Must set confirm: true' }), { status: 400, headers: { 'Content-Type': 'application/json' } });
    }

    // Get Netlify Blobs store and list all records
    const store = getStore('records');
    const { blobs } = await store.list();

    let deleted = 0;
    for (const blob of blobs) {
      await store.delete(blob.key);
      deleted++;
    }

    return new Response(
      JSON.stringify({ success: true, deleted, message: `Deleted ${deleted} records. REMOVE THIS ENDPOINT FROM CODE.` }),
      { status: 200, headers: { 'Content-Type': 'application/json' } }
    );
  } catch (err) {
    console.error('Admin clear error:', err);
    return new Response(
      JSON.stringify({ error: err.message || 'Internal server error' }),
      { status: 500, headers: { 'Content-Type': 'application/json' } }
    );
  }
};
