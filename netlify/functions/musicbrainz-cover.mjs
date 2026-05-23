// Netlify Function: MusicBrainz Cover Art Lookup
// POST /api/musicbrainz-cover
// Searches MusicBrainz for album, returns cover art from Cover Art Archive

export const config = {
  path: '/api/musicbrainz-cover',
};

export default async (req, context) => {
  if (req.method !== 'POST') {
    return new Response(
      JSON.stringify({ error: 'Method not allowed' }),
      { status: 405, headers: { 'Content-Type': 'application/json' } }
    );
  }

  try {
    const { artist, title } = await req.json();

    if (!artist || !title) {
      return new Response(
        JSON.stringify({ error: 'Missing artist or title', cover_url: null }),
        { status: 400, headers: { 'Content-Type': 'application/json' } }
      );
    }

    // Search MusicBrainz for release
    const searchUrl = new URL('https://musicbrainz.org/ws/2/release');
    searchUrl.searchParams.set('query', `artist:"${artist}" release:"${title}"`);
    searchUrl.searchParams.set('fmt', 'json');
    searchUrl.searchParams.set('limit', '5');

    const searchRes = await fetch(searchUrl.toString(), {
      headers: {
        'User-Agent': 'VinylScout/1.0 (+https://vinylscout.org)',
      },
    });

    if (!searchRes.ok) {
      return new Response(
        JSON.stringify({ error: 'MusicBrainz search failed', cover_url: null }),
        { status: 404, headers: { 'Content-Type': 'application/json' } }
      );
    }

    const searchData = await searchRes.json();
    const releases = searchData.releases || [];

    if (!releases.length) {
      return new Response(
        JSON.stringify({ error: 'Album not found on MusicBrainz', cover_url: null }),
        { status: 404, headers: { 'Content-Type': 'application/json' } }
      );
    }

    // Try each release to find cover art
    for (const release of releases.slice(0, 5)) {
      const releaseId = release.id;
      
      // Query Cover Art Archive
      const caaUrl = `https://coverartarchive.org/release/${releaseId}/front-500`;
      const caaRes = await fetch(caaUrl, { timeout: 5000 });

      if (caaRes.ok) {
        // Cover Art Archive returns the image directly with 307 redirect
        // Get the actual URL
        const contentType = caaRes.headers.get('content-type');
        if (contentType && contentType.includes('image')) {
          return new Response(
            JSON.stringify({
              title: release.title,
              cover_url: caaUrl,
              musicbrainz_url: `https://musicbrainz.org/release/${releaseId}`,
              release_id: releaseId,
            }),
            { status: 200, headers: { 'Content-Type': 'application/json' } }
          );
        }
      }
    }

    // No cover art found
    return new Response(
      JSON.stringify({ error: 'No cover art found', cover_url: null }),
      { status: 404, headers: { 'Content-Type': 'application/json' } }
    );

  } catch (err) {
    console.error('MusicBrainz lookup error:', err);
    return new Response(
      JSON.stringify({ error: err.message || 'Internal server error', cover_url: null }),
      { status: 500, headers: { 'Content-Type': 'application/json' } }
    );
  }
};
