// netlify/functions/discogs-pricing.mjs
// Vinyl Scout — Phase 3.1: on-demand market pricing from Discogs.
//
// v13 fixes vs v12:
//   - Token is .trim()'d. Surrounding quotes stripped (paste artifacts).
//   - After trim, an empty token short-circuits to a clear 503.
//   - Auth via query string (?token=...) instead of Authorization header.
//     Sidesteps any header parsing weirdness across Netlify edge / Discogs.
//   - 401 from Discogs now returns a precise error about the token's
//     identity (must be a Personal Access Token, not a Consumer Key).
//   - 429 (rate limit) returns a friendly retry message.
//
// Hard rules (unchanged):
//   - On-demand only. No cron, no polling, no batch. One record per call.
//   - Upserts the existing record. Never replaces; never bulk-deletes.
//   - If DISCOGS_TOKEN is missing, returns a helpful 503. Never crashes.

import { getStore } from '@netlify/blobs';

const USER_AGENT = 'VinylScout/1.0 +https://vinylscout.org';

function jsonResponse(payload, status = 200) {
  return new Response(JSON.stringify(payload), {
    status,
    headers: { 'Content-Type': 'application/json' }
  });
}

// Build a Discogs URL with auth in the query string. URLSearchParams handles
// encoding for us. The token is included as ?token=... — Discogs's documented
// alternative to the Authorization header for Personal Access Tokens.
function discogsUrl(path, extraParams, token) {
  const params = new URLSearchParams(extraParams || {});
  params.set('token', token);
  return `https://api.discogs.com${path}?${params.toString()}`;
}

async function discogsFetch(url) {
  const res = await fetch(url, {
    headers: {
      'User-Agent': USER_AGENT,
      'Accept': 'application/json'
    }
  });
  if (!res.ok) {
    let body = '';
    try { body = (await res.text()).slice(0, 300); } catch (_) {}

    // Translate the most common failures into actionable messages.
    if (res.status === 401) {
      const err = new Error(
        'Discogs rejected the token. Make sure DISCOGS_TOKEN on Netlify is a ' +
        'Personal Access Token from https://www.discogs.com/settings/developers ' +
        '(NOT a Consumer Key/Secret), with no trailing whitespace.'
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
    throw err;
  }
  return res.json();
}

export default async (req, context) => {
  if (req.method !== 'POST') {
    return jsonResponse({ error: 'POST only' }, 405);
  }

  // 1. Read env var. Trim. Strip accidental wrapping quotes (paste artifact).
  let rawToken = null;
  try {
    if (typeof Netlify !== 'undefined' && Netlify.env && Netlify.env.get) {
      rawToken = Netlify.env.get('DISCOGS_TOKEN');
    }
  } catch (_) { /* fall through */ }
  if (!rawToken && typeof process !== 'undefined' && process.env) {
    rawToken = process.env.DISCOGS_TOKEN;
  }

  let token = (rawToken || '').trim();
  // Strip surrounding single or double quotes if someone pasted them in.
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

  // 2. Parse body.
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

  // 3. Load the record. Bail if missing.
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

  // 4. Resolve a Discogs release_id.
  //    Prefer a stored discogs_release_id if we already have one.
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
      search = await discogsFetch(url);
    } catch (err) {
      return jsonResponse({
        error: 'Discogs search failed: ' + err.message,
        code: err.status === 401 ? 'BAD_TOKEN' : 'SEARCH_FAILED'
      }, err.status === 401 ? 401 : 502);
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

  // 5. Fetch stats and price suggestions in parallel.
  const statsUrl = discogsUrl(`/marketplace/stats/${releaseId}`, {}, token);
  const suggestUrl = discogsUrl(`/marketplace/price_suggestions/${releaseId}`, {}, token);
  const [statsResult, suggestResult] = await Promise.allSettled([
    discogsFetch(statsUrl),
    discogsFetch(suggestUrl)
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

  // If we got nothing useful at all, report instead of writing nulls.
  if (priceLow == null && priceHigh == null && copiesAvailable == null) {
    // Bubble up an auth error from the parallel calls if that's why we have nothing.
    const statsErr = statsResult.status === 'rejected' ? statsResult.reason : null;
    const suggErr  = suggestResult.status === 'rejected' ? suggestResult.reason : null;
    if ((statsErr && statsErr.status === 401) || (suggErr && suggErr.status === 401)) {
      return jsonResponse({
        error: (statsErr || suggErr).message,
        code: 'BAD_TOKEN'
      }, 401);
    }
    return jsonResponse({
      error: 'No marketplace data found for this release on Discogs.' +
             (statsErr ? ' Stats: ' + statsErr.message : '') +
             (suggErr ? ' Suggestions: ' + suggErr.message : ''),
      code: 'NO_DATA',
      discogs_release_id: releaseId
    }, 502);
  }

  // 6. Upsert the record. Preserve all existing fields.
  const updated = Object.assign({}, record, {
    discogs_release_id: releaseId,
    price_low: priceLow,
    price_high: priceHigh,
    price_last_sold: null,             // Not exposed by Discogs API.
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
    discogs_match: releaseTitle
  });
};

export const config = {
  path: '/api/discogs-pricing'
};
