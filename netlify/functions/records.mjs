import { getStore } from '@netlify/blobs';

export const config = {
  path: "/api/records/:id?"
};

export default async (req, context) => {
  console.log('=== HANDLER CALLED ===');
  console.log('Method:', req.method);
  console.log('Path:', req.path);
  
  try {
    const method = (req.method || '').toUpperCase();
    
    if (method === 'POST') {
      console.log('POST detected, parsing body');
      const store = getStore('records');
      const body = await req.json();
      console.log('Upserting record:', body.id);
      
      await store.set(body.id, JSON.stringify(body));
      return new Response(JSON.stringify({ ok: true, id: body.id }), { 
        status: 200,
        headers: { 'Content-Type': 'application/json' }
      });
    }
    
    if (method === 'GET') {
      console.log('GET detected, fetching all records');
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
      console.log('DELETE detected');
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
    console.error('ERROR:', err.message, err.stack);
    return new Response(JSON.stringify({ error: err.message }), { 
      status: 500,
      headers: { 'Content-Type': 'application/json' }
    });
  }
};
