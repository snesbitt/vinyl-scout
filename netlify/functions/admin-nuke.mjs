// ONE-TIME NUKE: Delete all records. Use once, then delete file.
import { getStore } from '@netlify/blobs';

export const config = { path: '/api/admin-nuke' };

export default async (req) => {
  if (req.method !== 'POST') {
    return new Response(JSON.stringify({ error: 'POST only' }), { status: 405, headers: { 'Content-Type': 'application/json' } });
  }
  try {
    const { confirm } = await req.json();
    if (confirm !== 'DELETE_ALL_RECORDS_NOW') {
      return new Response(JSON.stringify({ error: 'Pass confirm: "DELETE_ALL_RECORDS_NOW"' }), { status: 400, headers: { 'Content-Type': 'application/json' } });
    }
    const store = getStore('records');
    const { blobs } = await store.list();
    let count = 0;
    for (const blob of blobs) {
      await store.delete(blob.key);
      count++;
    }
    return new Response(JSON.stringify({ deleted: count }), { status: 200, headers: { 'Content-Type': 'application/json' } });
  } catch (err) {
    return new Response(JSON.stringify({ error: err.message }), { status: 500, headers: { 'Content-Type': 'application/json' } });
  }
};
