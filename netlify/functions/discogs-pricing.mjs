// netlify/functions/discogs-pricing.mjs
// Vinyl Scout — Phase 3.1: on-demand market pricing from Discogs.
//
// v14: when Discogs returns 401, the error now includes a SAFE description
//      of the token's shape — length and alphanumeric flag, NO actual chars —
//      so we can tell from the client whether the value in DISCOGS_TOKEN even
//      looks like a Personal Access Token (which are 40 alphanumeric chars)
//      vs. a Consumer Key (typically much shorter, sometimes with non-alnum).
//
// v13 fixes still in place:
//   - Token is .trim()'d. Surrounding quotes stripped.
//   - After trim, an empty token short-circuits to a clear 503.
//   - Auth via query string (?token=...).
//   - 429 (rate limit) returns a friendly retry message.
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

// Build a Discogs URL with auth in the query string. Discogs's documented
// alternative to the Authorization header for Personal Access Tokens.
function discogsUrl(path, extraParams, token) {
  const params = new URLSearchParams(extraParams || {});
  params.set('token', token);
  return `https://api.discogs.com${path}?${params.toString()}`;
}

// Safe shape description — emits LENGTH and CLASSIFICATION only.
// Never returns any actual characters of the token. Public-endpoint-safe.
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

    if (res.status === 401) {
      const err = new Error(
        'Discogs rejected the token (401). Set DISCOGS_TOKEN on Netlify to a ' +
        'Personal Access Token from https://www.discogs.com/settings/developers ' +
        '— click "Generate new token" under your account.'
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

  // Pre-compute token shape so the 401 path can include it without re-reading.
  const tokenShape = describeTokenShape(token);

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

  // Helper to build a 401 payload — used in any of the three downstream calls.
  function badTokenResponse(underlying) {
    return jsonResponse({
      error: underlying.message +
             ' Token currently in DISCOGS_TOKEN: ' + tokenShape.classification +
             ' (source: ' + tokenSource + ', length: ' + tokenShape.length + ').',
      code: 'BAD_TOKEN',
      tokenInfo: {
        length: tokenShape.length,
        isAlphanumeric: tokenShape.isAlphanumeric,
        classification: tokenShape.classification,
        source: tokenSource
      }
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
      search = await discogsFetch(url);
    } catch (err) {
      if (err.status === 401) return badTokenResponse(err);
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

  if (priceLow == null && priceHigh == null && copiesAvailable == null) {
    const statsErr = statsResult.status === 'rejected' ? statsResult.reason : null;
    const suggErr  = suggestResult.status === 'rejected' ? suggestResult.reason : null;
    if ((statsErr && statsErr.status === 401) || (suggErr && suggErr.status === 401)) {
      return badTokenResponse(statsErr || suggErr);
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
    discogs_match: releaseTitle
  });
};

export const config = {
  path: '/api/discogs-pricing'
};
