// Spotify album art lookup via Web API
// Uses public token (no secrets needed for search)

let spotifyToken = null;
let tokenExpiry = 0;

async function getSpotifyToken() {
  const now = Date.now();
  if (spotifyToken && tokenExpiry > now) {
    return spotifyToken;
  }

  const clientId = 'f6891e1ad13f4ba094073a8ee64c6a94';
  const clientSecret = '8d6c3cd4cc7847a2a83048e1f6e627f3';
  
  const auth = Buffer.from(`${clientId}:${clientSecret}`).toString('base64');
  const res = await fetch('https://accounts.spotify.com/api/token', {
    method: 'POST',
    headers: {
      'Authorization': `Basic ${auth}`,
      'Content-Type': 'application/x-www-form-urlencoded'
    },
    body: 'grant_type=client_credentials'
  });

  const data = await res.json();
  spotifyToken = data.access_token;
  tokenExpiry = now + (data.expires_in * 1000);
  return spotifyToken;
}

async function searchSpotify(artist, title) {
  try {
    const token = await getSpotifyToken();
    const query = encodeURIComponent(`artist:${artist} album:${title}`);
    
    const res = await fetch(`https://api.spotify.com/v1/search?q=${query}&type=album&limit=1`, {
      headers: { 'Authorization': `Bearer ${token}` }
    });

    const data = await res.json();
    
    if (data.albums?.items?.length > 0) {
      const album = data.albums.items[0];
      const images = album.images;
      
      if (images && images.length > 0) {
        // Return largest image (usually index 0)
        return {
          cover_url: images[0].url,
          year: album.release_date?.split('-')[0] || null
        };
      }
    }
    
    return null;
  } catch (err) {
    console.error('Spotify lookup failed:', err.message);
    return null;
  }
}

export const config = { path: '/api/spotify-art' };

export default async (req) => {
  if (req.method !== 'POST') {
    return new Response(JSON.stringify({ error: 'POST only' }), { 
      status: 405, 
      headers: { 'Content-Type': 'application/json' } 
    });
  }

  try {
    const { artist, title } = await req.json();
    
    if (!artist || !title) {
      return new Response(JSON.stringify({ error: 'Need artist and title' }), { 
        status: 400, 
        headers: { 'Content-Type': 'application/json' } 
      });
    }

    const result = await searchSpotify(artist, title);
    
    if (!result) {
      return new Response(JSON.stringify({ error: 'Not found on Spotify' }), { 
        status: 404, 
        headers: { 'Content-Type': 'application/json' } 
      });
    }

    return new Response(JSON.stringify(result), { 
      status: 200, 
      headers: { 'Content-Type': 'application/json' } 
    });
  } catch (err) {
    return new Response(JSON.stringify({ error: err.message }), { 
      status: 500, 
      headers: { 'Content-Type': 'application/json' } 
    });
  }
};
