// Netlify Function: Wikipedia Album Cover Lookup (v2)
// Improved: Better error handling, validate image URLs

export const config = {
  path: '/api/wikipedia-cover',
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

    // Search Wikipedia for album
    const searchUrl = new URL('https://en.wikipedia.org/w/api.php');
    searchUrl.searchParams.set('action', 'query');
    searchUrl.searchParams.set('format', 'json');
    searchUrl.searchParams.set('srsearch', `${artist} ${title} album`);
    searchUrl.searchParams.set('srnamespace', '0');
    searchUrl.searchParams.set('srlimit', '10');

    const searchRes = await fetch(searchUrl.toString(), {
      headers: {
        'User-Agent': 'VinylScout/1.0 (+https://vinylscout.org)',
      },
      timeout: 5000,
    });

    if (!searchRes.ok) {
      return new Response(
        JSON.stringify({ error: 'Wikipedia search failed', cover_url: null }),
        { status: 404, headers: { 'Content-Type': 'application/json' } }
      );
    }

    const searchData = await searchRes.json();
    const results = searchData.query?.search || [];

    if (!results.length) {
      return new Response(
        JSON.stringify({ error: 'Album not found', cover_url: null }),
        { status: 404, headers: { 'Content-Type': 'application/json' } }
      );
    }

    // Try each result to find one with a valid image
    for (const result of results.slice(0, 5)) {
      const pageTitle = result.title;
      const pageUrl = new URL('https://en.wikipedia.org/w/api.php');
      pageUrl.searchParams.set('action', 'query');
      pageUrl.searchParams.set('format', 'json');
      pageUrl.searchParams.set('titles', pageTitle);
      pageUrl.searchParams.set('prop', 'pageimages');
      pageUrl.searchParams.set('pithumbsize', '300');

      const pageRes = await fetch(pageUrl.toString(), {
        headers: {
          'User-Agent': 'VinylScout/1.0 (+https://vinylscout.org)',
        },
        timeout: 5000,
      });

      if (!pageRes.ok) continue;

      const pageData = await pageRes.json();
      const pages = pageData.query?.pages || {};
      const page = Object.values(pages)[0];

      const coverUrl = page?.thumbnail?.source;
      
      // Return if we found a valid URL
      if (coverUrl && coverUrl.includes('http')) {
        return new Response(
          JSON.stringify({
            title: pageTitle,
            cover_url: coverUrl,
            wikipedia_url: `https://en.wikipedia.org/wiki/${pageTitle.replace(/ /g, '_')}`,
          }),
          { status: 200, headers: { 'Content-Type': 'application/json' } }
        );
      }
    }

    // No valid image found on Wikipedia
    return new Response(
      JSON.stringify({ error: 'No cover image found', cover_url: null }),
      { status: 404, headers: { 'Content-Type': 'application/json' } }
    );

  } catch (err) {
    console.error('Wikipedia lookup error:', err);
    return new Response(
      JSON.stringify({ error: err.message || 'Internal server error', cover_url: null }),
      { status: 500, headers: { 'Content-Type': 'application/json' } }
    );
  }
};
