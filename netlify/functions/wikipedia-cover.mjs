// Netlify Function: Wikipedia Album Cover Lookup
// POST /api/wikipedia-cover
// Searches Wikipedia for album cover images

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
        JSON.stringify({ error: 'Missing artist or title' }),
        { status: 400, headers: { 'Content-Type': 'application/json' } }
      );
    }

    // Search Wikipedia for album page
    const albumTitle = `${title} (album)`;
    const searchUrl = new URL('https://en.wikipedia.org/w/api.php');
    searchUrl.searchParams.set('action', 'query');
    searchUrl.searchParams.set('format', 'json');
    searchUrl.searchParams.set('srsearch', `${artist} ${title} album`);
    searchUrl.searchParams.set('srnamespace', '0');
    searchUrl.searchParams.set('srlimit', '5');

    const searchRes = await fetch(searchUrl.toString(), {
      headers: {
        'User-Agent': 'VinylScout/1.0 (+https://vinylscout.org)',
      },
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
        JSON.stringify({ error: 'No album found on Wikipedia', cover_url: null }),
        { status: 404, headers: { 'Content-Type': 'application/json' } }
      );
    }

    // Get page content from first result
    const pageTitle = results[0].title;
    const pageUrl = new URL('https://en.wikipedia.org/w/api.php');
    pageUrl.searchParams.set('action', 'query');
    pageUrl.searchParams.set('format', 'json');
    pageUrl.searchParams.set('titles', pageTitle);
    pageUrl.searchParams.set('prop', 'pageimages|extracts');
    pageUrl.searchParams.set('pithumbsize', '400');

    const pageRes = await fetch(pageUrl.toString(), {
      headers: {
        'User-Agent': 'VinylScout/1.0 (+https://vinylscout.org)',
      },
    });

    if (!pageRes.ok) {
      return new Response(
        JSON.stringify({ error: 'Failed to fetch page', cover_url: null }),
        { status: 500, headers: { 'Content-Type': 'application/json' } }
      );
    }

    const pageData = await pageRes.json();
    const pages = pageData.query?.pages || {};
    const page = Object.values(pages)[0];

    const coverUrl = page?.thumbnail?.source || null;

    return new Response(
      JSON.stringify({
        title: pageTitle,
        cover_url: coverUrl,
        wikipedia_url: `https://en.wikipedia.org/wiki/${pageTitle.replace(/ /g, '_')}`,
      }),
      { status: 200, headers: { 'Content-Type': 'application/json' } }
    );
  } catch (err) {
    console.error('Wikipedia lookup error:', err);
    return new Response(
      JSON.stringify({ error: err.message || 'Internal server error', cover_url: null }),
      { status: 500, headers: { 'Content-Type': 'application/json' } }
    );
  }
};
