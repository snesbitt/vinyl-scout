import { getStore } from '@netlify/blobs';

export default async (req, context) => {
  console.log('=== HANDLER CALLED ===');
  console.log('Method:', req.method);
  console.log('URL:', req.url);
  
  try {
    const method = (req.method || '').toUpperCase();
    
    if (method === 'POST') {
      console.log('POST request detected');
      const store = getStore('records');
      const body = await req.json();
      console.log('Saving record:', body.id);
      
      await store.set(body.id, JSON.stringify(body));
      return new Response(JSON.stringify({ ok: true, id: body.id }), { 
        status: 200,
        headers: { 'Content-Type': 'application/json' }
      });
    }
    
    if (method === 'GET') {
      console.log('GET request detected');
      const store = getStore('records');
      const { blobs } = await store.list();
      const records = [];
      for (const blob of blobs) {
        const data = await store.get(blob.key);
        if (data) records.push(JSON.parse(data));
      }
      console.log('Returning', records.length, 'records');
      return new Response(JSON.stringify(records), { 
        status: 200,
        headers: { 'Content-Type': 'application/json' }
      });
    }
    
    console.log('Method not allowed:', method);
    return new Response(JSON.stringify({ error: 'Method not allowed' }), { 
      status: 405,
      headers: { 'Content-Type': 'application/json' }
    });
  } catch (err) {
    console.error('ERROR:', err.message);
    return new Response(JSON.stringify({ error: err.message }), { 
      status: 500,
      headers: { 'Content-Type': 'application/json' }
    });
  }
};
