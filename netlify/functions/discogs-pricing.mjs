// netlify/functions/discogs-pricing.mjs
// Vinyl Scout — Phase 3.1: on-demand market pricing from Discogs.
//
// v15: FIX for stubborn 401s with valid-shaped PATs.
//      - Auth via BOTH the Authorization header (`Discogs token=<X>`) AND
//        the `?token=<X>` query string. This is what the official Python
//        discogs_client (joalla) does in production. Per the Discogs forum,
//        sending only one of the two will fail intermittently on certain
//        endpoints. Belt + suspenders is the working pattern.
//      - Identity preflight: every request starts with GET /oauth/identity.
//        If THAT fails 401, the token itself is bad — fail fast with a
//        precise message before any search/marketplace calls. If identity
//        succeeds but a downstream call fails, we know it's endpoint-
//        specific (rate limit, missing release, etc.) and report that.
//      - Discogs response body is now included in error messages. Discogs
//        often returns useful text in 401/403 responses (e.g.
//        "Invalid consumer key", "You must authenticate", etc.).
//      - Error text explicitly mentions that env var changes on Netlify
//        require a redeploy. Shipping v15 itself triggers that redeploy,
//        so this codepath should clear on first run.
//
// v14: token shape diagnostic in 401 response (length + alnum + classification).
// v13: token trim, strip wrapping quotes, query-string auth, 429 message.
//
// Hard rules (unchanged):
//   - On-demand only. No cron, no polling, no batch. One record per call.
//   - Upserts the existing record. Never replaces; never bulk-deletes.

import { getStore } from '@netlify/blobs';

const USER_AGENT = 'VinylScout/1.0 +https://vinylscout.org';

function jsonResponse(payload, status = 200) {
  return new Response(JSON.stringify(payload), {
    status,
    headers: { 'Content-Type': 'application/json' }
  });
}

// Build a Discogs URL with the token in the query string.
// We ALSO send the Authorization header in discogsFetch — both at once.
function discogsUrl(path, extraParams, token) {
  const params = new URLSearchParams(extraParams || {});
  params.set('token', token);
  return `https://api.discogs.com${path}?${params.toString()}`;
}

function discogsHeaders(token) {
  return {
    'User-Agent': USER_AGENT,
    'Accept': 'application/json',
    'Authorization': 'Discogs token=' + token
  };
}

// Safe shape description — LENGTH and CLASSIFICATION only. Never returns
// any chars of the token. Public-endpoint-safe.
function describeTokenShape(token) {
  const len = token.length;
  const isAlnum = /^[A-Za-z0-9]+$/.test(token);
  let likely;
  if (len === 40 && isAlnum) {
    likely = 'looks like a Personal Access Token (40 alphanumeric chars)';
  } else if (len >= 8 && len <= 16 && isAlnum) {
    likely = 'looks like a Consumer Key (too short for a Personal Access Token)';
  } else if (!isAlnum) {
    likely = 'contains non-alphanumeric chars (Personal Access Tokens are alphanumeric only)';
  } else if (len > 0 && len < 40) {
    likely = `is ${len} chars (Personal Access Tokens are 40 chars)`;
  } else if (len > 40) {
    likely = `is ${len} chars — longer than a Personal Access Token; may include extra wrapping`;
  } else {
    likely = 'is empty';
  }
  return { length: len, isAlphanumeric: isAlnum, classification: likely };
}

async function discogsFetch(url, token) {
  const res = await fetch(url, { headers: discogsHeaders(token) });
  if (!res.ok) {
    let body = '';
    try { body = (await res.text()).slice(0, 300); } catch (_) {}

    if (res.status === 401) {
      const err = new Error(
        `Discogs 401 — ${body || 'no body'}`
      );
      err.status = 401;
      err.discogsBody = body;
      throw err;
    }
    if (res.status === 429) {
      const err = new Error('Discogs rate limit hit (60 req/min). Try again shortly.');
      err.status = 429;
      throw err;
    }
    const err = new Error(`Discogs ${res.status}${body ? ' — ' + body : ''}`);
    err.status = res.status;
    err.discogsBody = body;
    throw err;
  }
  return res.json();
}

export default async (req, context) => {
  if (req.method !== 'POST') {
    return jsonResponse({ error: 'POST only' }, 405);
  }

  // Read env var. Trim. Strip accidental wrapping quotes.
  let rawToken = null;
  let tokenSource = null;
  try {
    if (typeof Netlify !== 'undefined' && Netlify.env && Netlify.env.get) {
      rawToken = Netlify.env.get('DISCOGS_TOKEN');
      if (rawToken) tokenSource = 'Netlify.env';
    }
  } catch (_) { /* fall through */ }
  if (!rawToken && typeof process !== 'undefined' && process.env) {
    rawToken = process.env.DISCOGS_TOKEN;
    if (rawToken) tokenSource = 'process.env';
  }

  let token = (rawToken || '').trim();
  if (
    token.length >= 2 &&
    ((token.startsWith('"') && token.endsWith('"')) ||
     (token.startsWith("'") && token.endsWith("'")))
  ) {
    token = token.slice(1, -1).trim();
  }

  if (!token) {
    return jsonResponse({
      error: 'DISCOGS_TOKEN is not set (or is empty/whitespace) on this Netlify site. Create a Personal Access Token at https://www.discogs.com/settings/developers, then set it under Site Settings → Environment Variables.',
      code: 'NO_TOKEN'
    }, 503);
  }

  const tokenShape = describeTokenShape(token);

  // Parse body.
  let body;
  try {
    body = await req.json();
  } catch (_) {
    return jsonResponse({ error: 'Invalid JSON body' }, 400);
  }
  const recordId = body && body.recordId;
  if (!recordId || typeof recordId !== 'string') {
    return jsonResponse({ error: 'recordId (string) is required' }, 400);
  }

  // STEP 0 — identity preflight. If the token itself is rejected, find out
  // here before doing anything else. /oauth/identity is the cheapest call
  // that requires auth and returns the authenticated username on success.
  let identityUsername = null;
  try {
    const idUrl = discogsUrl('/oauth/identity', {}, token);
    const identity = await discogsFetch(idUrl, token);
    identityUsername = identity && (identity.username || identity.consumer_name) || null;
  } catch (err) {
    if (err.status === 401) {
      return jsonResponse({
        error:
          'Discogs identity check failed (401). The token is rejected outright. ' +
          'Discogs said: ' + (err.discogsBody || '(no body)') + '. ' +
          '(1) If you just updated DISCOGS_TOKEN on Netlify, env var changes require a redeploy to reach the running function — this deploy itself should have triggered one. ' +
          '(2) If you have not yet regenerated, do so at https://www.discogs.com/settings/developers ("Generate new token" under your account), paste, and redeploy. ' +
          'Token shape: ' + tokenShape.classification +
          ' (source: ' + tokenSource + ', length: ' + tokenShape.length + ').',
        code: 'BAD_TOKEN_IDENTITY',
        tokenInfo: {
          length: tokenShape.length,
          isAlphanumeric: tokenShape.isAlphanumeric,
          classification: tokenShape.classification,
          source: tokenSource
        },
        discogsBody: err.discogsBody || null
      }, 401);
    }
    // Non-401 identity error: surface but continue with caution — could be
    // a transient Discogs outage. Most callers will want to retry.
    return jsonResponse({
      error: 'Discogs identity preflight failed: ' + err.message,
      code: 'IDENTITY_FAILED'
    }, 502);
  }

  // Load the record.
  const store = getStore('records');
  let recordJson;
  try {
    recordJson = await store.get(recordId);
  } catch (err) {
    return jsonResponse({ error: 'Storage read failed: ' + err.message }, 500);
  }
  if (!recordJson) {
    return jsonResponse({ error: 'Record not found: ' + recordId }, 404);
  }
  let record;
  try {
    record = JSON.parse(recordJson);
  } catch (err) {
    return jsonResponse({ error: 'Stored record is not JSON' }, 500);
  }
  if (!record.artist || !record.title) {
    return jsonResponse({ error: 'Record is missing artist or title' }, 400);
  }

  // Helper to wrap unexpected late-stage 401s.
  function badTokenResponse(underlying, stage) {
    return jsonResponse({
      error:
        'Discogs ' + stage + ' rejected the token (401), but identity preflight passed as user "' +
        (identityUsername || 'unknown') + '". This is unusual and may indicate a Discogs-side ACL on ' +
        'that endpoint. Underlying: ' + underlying.message,
      code: 'BAD_TOKEN_LATE',
      identityUsername: identityUsername
    }, 401);
  }

  let releaseId = record.discogs_release_id || null;
  let releaseTitle = null;

  if (!releaseId) {
    const url = discogsUrl('/database/search', {
      q: `${record.artist} ${record.title}`,
      type: 'release',
      format: 'Vinyl',
      per_page: '5'
    }, token);

    let search;
    try {
      search = await discogsFetch(url, token);
    } catch (err) {
      if (err.status === 401) return badTokenResponse(err, 'search');
      return jsonResponse({
        error: 'Discogs search failed: ' + err.message,
        code: 'SEARCH_FAILED'
      }, 502);
    }
    const results = (search && search.results) || [];
    if (results.length === 0) {
      return jsonResponse({
        error: `No Discogs match for "${record.artist} — ${record.title}". Try adjusting the artist or title on /audit.html.`,
        code: 'NO_MATCH'
      }, 404);
    }
    releaseId = results[0].id;
    releaseTitle = results[0].title || null;
  }

  // Fetch stats and price suggestions in parallel.
  const statsUrl = discogsUrl(`/marketplace/stats/${releaseId}`, {}, token);
  const suggestUrl = discogsUrl(`/marketplace/price_suggestions/${releaseId}`, {}, token);
  const [statsResult, suggestResult] = await Promise.allSettled([
    discogsFetch(statsUrl, token),
    discogsFetch(suggestUrl, token)
  ]);

  let priceLow = null;
  let copiesAvailable = null;
  let currency = null;
  if (statsResult.status === 'fulfilled') {
    const s = statsResult.value || {};
    if (s.lowest_price && typeof s.lowest_price.value === 'number') {
      priceLow = s.lowest_price.value;
      currency = s.lowest_price.currency || null;
    }
    if (typeof s.num_for_sale === 'number') {
      copiesAvailable = s.num_for_sale;
    }
  }

  let priceHigh = null;
  if (suggestResult.status === 'fulfilled' && suggestResult.value) {
    const sugg = suggestResult.value;
    const high = sugg['Mint (M)'] || sugg['Near Mint (NM or M-)'];
    if (high && typeof high.value === 'number') {
      priceHigh = high.value;
      if (!currency && high.currency) currency = high.currency;
    }
  }

  if (priceLow == null && priceHigh == null && copiesAvailable == null) {
    const statsErr = statsResult.status === 'rejected' ? statsResult.reason : null;
    const suggErr  = suggestResult.status === 'rejected' ? suggestResult.reason : null;
    if ((statsErr && statsErr.status === 401) || (suggErr && suggErr.status === 401)) {
      return badTokenResponse(statsErr || suggErr, 'marketplace');
    }
    return jsonResponse({
      error: 'No marketplace data found for this release on Discogs.' +
             (statsErr ? ' Stats: ' + statsErr.message : '') +
             (suggErr ? ' Suggestions: ' + suggErr.message : ''),
      code: 'NO_DATA',
      discogs_release_id: releaseId
    }, 502);
  }

  const updated = Object.assign({}, record, {
    discogs_release_id: releaseId,
    price_low: priceLow,
    price_high: priceHigh,
    price_last_sold: null,
    copies_available: copiesAvailable,
    price_currency: currency || 'USD',
    price_updated_at: new Date().toISOString()
  });

  try {
    await store.set(recordId, JSON.stringify(updated));
  } catch (err) {
    return jsonResponse({ error: 'Storage write failed: ' + err.message }, 500);
  }

  return jsonResponse({
    ok: true,
    record: updated,
    discogs_match: releaseTitle,
    identityUsername: identityUsername
  });
};

export const config = {
  path: '/api/discogs-pricing'
};
