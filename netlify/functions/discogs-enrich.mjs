// Netlify Function: Discogs API Enrichment Proxy
// POST /api/discogs-enrich
// Lookup album on Discogs, return cover_url + metadata

export const config = {
  path: '/api/discogs-enrich',
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
        JSON.stringify({ error: 'Missing artist or title' }),
        { status: 400, headers: { 'Content-Type': 'application/json' } }
      );
    }

    // Search Discogs for release
    const searchQuery = `${artist} ${title}`;
    const searchUrl = new URL('https://api.discogs.com/database/search');
    searchUrl.searchParams.set('q', searchQuery);
    searchUrl.searchParams.set('type', 'release');

    // Add user agent (required by Discogs)
    const searchRes = await fetch(searchUrl.toString(), {
      headers: {
        'User-Agent': 'VinylScout/1.0 (+https://vinylscout.org)',
      },
    });

    if (!searchRes.ok) {
      return new Response(
        JSON.stringify({ error: `Discogs search failed: ${searchRes.status}` }),
        { status: 500, headers: { 'Content-Type': 'application/json' } }
      );
    }

    const searchData = await searchRes.json();

    if (!searchData.results || searchData.results.length === 0) {
      return new Response(
        JSON.stringify({
          error: 'Not found on Discogs',
          cover_url: null,
          discogs_id: null,
        }),
        { status: 404, headers: { 'Content-Type': 'application/json' } }
      );
    }

    // Get top result
    const topResult = searchData.results[0];
    const releaseId = topResult.id;

    // Fetch full release details
    const detailsUrl = `https://api.discogs.com/releases/${releaseId}`;
    const detailsRes = await fetch(detailsUrl, {
      headers: {
        'User-Agent': 'VinylScout/1.0 (+https://vinylscout.org)',
      },
    });

    if (!detailsRes.ok) {
      return new Response(
        JSON.stringify({ error: `Failed to fetch details: ${detailsRes.status}` }),
        { status: 500, headers: { 'Content-Type': 'application/json' } }
      );
    }

    const details = await detailsRes.json();

    // Extract enrichment data
    return new Response(
      JSON.stringify({
        discogs_id: details.id,
        discogs_url: details.uri,
        cover_url: details.cover_image || null,
        year: details.year || null,
        label: details.labels?.[0]?.name || null,
        catno: details.catalog_number || null,
      }),
      {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      }
    );
  } catch (err) {
    console.error('Discogs enrichment error:', err);
    return new Response(
      JSON.stringify({ error: err.message || 'Internal server error' }),
      { status: 500, headers: { 'Content-Type': 'application/json' } }
    );
  }
};
