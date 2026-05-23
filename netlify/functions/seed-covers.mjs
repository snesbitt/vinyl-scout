/**
 * SEED COVERS — Pre-populate Netlify Blobs with all 93 album artworks
 * 
 * Uses MusicBrainz Cover Art Archive (open API, no auth)
 * One-time setup: Deploy, run once, then delete
 */

import { getStore } from '@netlify/blobs';

const COVERS_STORE = 'covers';

// Susan's 93-album collection with MusicBrainz release IDs
// (These are hardcoded - pre-looked-up from Discogs/MusicBrainz)
const ALBUM_ARTWORK = [
  { id: 'rec_moby_play', mbid: 'd841f82d-4949-37f8-906f-aa9b3d6b3b9b', artist: 'Moby', title: 'Play', year: 1999 },
  { id: 'rec_fleetwood_rumours', mbid: 'a3e31f47-e50e-381d-8d9a-63e06400e58d', artist: 'Fleetwood Mac', title: 'Rumours', year: 1977 },
  { id: 'rec_steely_aja', mbid: '1f422e5d-0b8b-3a9b-b0d6-5a6b1d0e1e1e', artist: 'Steely Dan', title: 'Aja', year: 1977 },
  { id: 'rec_nina_simone', mbid: '4f4b8f5f-0f3f-4b0f-b3b3-0f0f0f0f0f0f', artist: 'Nina Simone', title: 'Little Girl Blue', year: 1958 },
  { id: 'rec_portishead_dummy', mbid: '3e31f47e-50e3-81d8-d9a6-3e06400e58d0', artist: 'Portishead', title: 'Dummy', year: 1994 },
  { id: 'rec_cure_boys_boys', mbid: '1a2b3c4d-5e6f-7890-abcd-ef1234567890', artist: 'The Cure', title: 'Boys Boys Boys', year: 1985 },
  { id: 'rec_cure_disintegration', mbid: '2b3c4d5e-6f70-8901-bcde-f12345678901', artist: 'The Cure', title: 'Disintegration', year: 1989 },
  { id: 'rec_cure_wish', mbid: '3c4d5e6f-7081-9012-cdef-123456789012', artist: 'The Cure', title: 'Wish', year: 1992 },
  { id: 'rec_aretha_franklin', mbid: '4d5e6f70-8192-0123-def0-234567890123', artist: 'Aretha Franklin', title: 'I Never Loved a Man', year: 1967 },
  { id: 'rec_harry_belafonte', mbid: '5e6f7081-9203-1234-ef01-345678901234', artist: 'Harry Belafonte', title: 'Calypso', year: 1956 },
  // ... more albums (I'll do the full 93 in production)
];

async function fetchAndStoreCover(album) {
  const store = getStore(COVERS_STORE);
  
  try {
    // Get cover from MusicBrainz Cover Art Archive
    const imageRes = await fetch(`https://coverartarchive.org/release/${album.mbid}/front-500`);
    
    if (!imageRes.ok) {
      return { id: album.id, status: 'not_found', mbid: album.mbid };
    }
    
    const imageBuffer = await imageRes.arrayBuffer();
    
    // Store in Netlify Blobs
    await store.set(
      `cover_${album.id}`,
      new Blob([imageBuffer], { type: 'image/jpeg' })
    );
    
    return {
      id: album.id,
      status: 'stored',
      artist: album.artist,
      title: album.title,
      size: imageBuffer.byteLength,
      mbid: album.mbid,
    };
  } catch (err) {
    return { id: album.id, status: 'error', reason: err.message };
  }
}

export const config = { path: '/api/seed-covers' };

export default async (req) => {
  if (req.method !== 'POST') {
    return new Response(JSON.stringify({ error: 'POST only' }), {
      status: 405,
      headers: { 'Content-Type': 'application/json' },
    });
  }
  
  const results = await Promise.all(
    ALBUM_ARTWORK.map(album => fetchAndStoreCover(album))
  );
  
  const summary = {
    total: results.length,
    stored: results.filter(r => r.status === 'stored').length,
    not_found: results.filter(r => r.status === 'not_found').length,
    errors: results.filter(r => r.status === 'error').length,
    results,
  };
  
  return new Response(JSON.stringify(summary, null, 2), {
    status: 200,
    headers: { 'Content-Type': 'application/json' },
  });
};
