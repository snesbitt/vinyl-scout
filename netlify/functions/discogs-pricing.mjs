// netlify/functions/discogs-pricing.mjs
// Vinyl Scout — Phase 3.1: on-demand market pricing from Discogs.
//
// v18: get the FULL Statistics block (Have, Want, Last Sold, Low/Median/High)
//      by scraping the public release page. Discogs's documented API exposes
//      only the current lowest asking price via /marketplace/stats — they
//      do NOT expose historical sale data (low/median/high/last sold) on any
//      endpoint, confirmed by their forum (there's an open feature request
//      asking for it). The data IS in the rendered HTML of the public release
//      page at https://www.discogs.com/release/<id>, so we fetch and parse it.
//      The price_suggestions endpoint from v15-v17 is gone — it never gave us
//      what users actually want (recent-sales range), and its silent failures
//      made the UI look broken.
//
//      Schema additions (all optional, all on the record): price_median,
//      have_count, want_count, rating_avg, rating_count, price_last_sold
//      (reinstated as a string date like "Apr 23, 2026" or null if Never).
//
// v17: dropped first attempt at price_last_sold (was always null because
//      I was on the wrong endpoint). v18 reinstates it correctly via scrape.
// v15: dual-auth (header + query string) on Discogs API calls. Identity
//      preflight catches bad tokens fast. (Scrape uses no auth — release
//      pages are public — but sends the same UA.)
//
// Hard rules unchanged:
//   - On-demand only. No cron, no polling, no batch. One record per call.
//   - Upserts the existing record. Never replaces; never bulk-deletes.
//   - If Discogs blocks the scrape (UA-blocked, 403, 429), we fall back
//     to whatever the API gave us and log the failure in scrape_debug.

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

// --- v18: Statistics block scraping ----------------------------------------
//
// Discogs renders the release page server-side; the Statistics block is in
// the static HTML, NOT JS-injected (verified by reading their robots-
// accessible cached version). Format is consistent across releases:
//
//   Have:N · Want:N · Avg Rating:X.XX / 5 · Ratings:N ·
//   Last Sold:MMM DD, YYYY · Low:€X.XX · Median:€X.XX · High:€X.XX
//
// When a release has no sales history, Low/Median/High show "--" and
// Last Sold shows "Never". We treat both as null.
//
// We don't try to be clever about HTML structure (Discogs could change
// their layout). We strip tags first, then field-extract from the
// resulting text. That's resilient.

async function scrapeReleaseStats(releaseId) {
  const url = `https://www.discogs.com/release/${releaseId}`;
  const res = await fetch(url, {
    headers: {
      'User-Agent': USER_AGENT,
      'Accept': 'text/html,application/xhtml+xml',
      'Accept-Language': 'en-US,en;q=0.9'
    }
  });
  if (!res.ok) {
    const err = new Error('Release page returned ' + res.status);
    err.status = res.status;
    throw err;
  }
  const html = await res.text();

  // Strip tags, collapse whitespace. Single linear string of text content.
  const text = html.replace(/<[^>]+>/g, ' ').replace(/&nbsp;/g, ' ').replace(/\s+/g, ' ').trim();

  // Each field has a label-colon-value structure. The values never contain
  // whitespace (except the date) so a non-greedy capture works. For the
  // date we accept "MMM DD, YYYY" exactly, or the literal "Never".
  function captureNumber(label) {
    const re = new RegExp('\\b' + label + '\\s*:\\s*(\\d+)\\b');
    const m = text.match(re);
    return m ? parseInt(m[1], 10) : null;
  }
  function captureFloat(label) {
    const re = new RegExp('\\b' + label + '\\s*:\\s*([\\d.]+)');
    const m = text.match(re);
    return m ? parseFloat(m[1]) : null;
  }
  function captureDate() {
    // "Last Sold: Apr 23, 2026" or "Last Sold: Never" or "Last Sold: --"
    const re = /\bLast Sold\s*:\s*([A-Z][a-z]{2} \d{1,2}, \d{4}|Never|--)/;
    const m = text.match(re);
    if (!m) return null;
    const raw = m[1].trim();
    if (raw === 'Never' || raw === '--') return null;
    return raw;
  }
  function capturePrice(label) {
    // Value runs until next whitespace. Can be "--" or "€14.41" or "$1,234.56".
    const re = new RegExp('\\b' + label + '\\s*:\\s*(\\S+)');
    const m = text.match(re);
    if (!m) return null;
    const raw = m[1].trim();
    if (raw === '--' || raw === '') return null;
    // Detect currency symbol
    let currency = null;
    if (raw.startsWith('€')) currency = 'EUR';
    else if (raw.startsWith('$')) currency = 'USD';
    else if (raw.startsWith('£')) currency = 'GBP';
    else if (raw.startsWith('¥')) currency = 'JPY';
    const numStr = raw.replace(/[^0-9.]/g, '');
    const value = parseFloat(numStr);
    if (isNaN(value)) return null;
    return { value: value, currency: currency };
  }

  return {
    have:         captureNumber('Have'),
    want:         captureNumber('Want'),
    rating_avg:   captureFloat('Avg Rating'),
    rating_count: captureNumber('Ratings'),
    last_sold:    captureDate(),
    low:          capturePrice('Low'),
    median:       capturePrice('Median'),
    high:         capturePrice('High')
  };
}
// --- end scrape ------------------------------------------------------------

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

  // v18: Two parallel data sources:
  //   1. /marketplace/stats — the authoritative current lowest_price and
  //      num_for_sale (live marketplace state, API).
  //   2. /release/<id>      — scraped Statistics block for historical
  //      Have/Want/Rating/Last Sold/Low/Median/High (sales history, HTML).
  // We allow either to fail without taking down the whole call. The record
  // gets whatever fields succeeded; scrape_debug tells the UI/console what
  // didn't.
  const statsUrl = discogsUrl(`/marketplace/stats/${releaseId}`, {}, token);
  const [statsResult, scrapeResult] = await Promise.allSettled([
    discogsFetch(statsUrl, token),
    scrapeReleaseStats(releaseId)
  ]);

  // --- From /marketplace/stats API ---
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

  // --- From scraped Statistics block ---
  let priceMedian = null;
  let priceHigh = null;
  let priceLastSold = null;     // string date or null
  let haveCount = null;
  let wantCount = null;
  let ratingAvg = null;
  let ratingCount = null;
  let scrapeDebug;

  if (scrapeResult.status === 'fulfilled') {
    const sc = scrapeResult.value || {};
    haveCount    = sc.have;
    wantCount    = sc.want;
    ratingAvg    = sc.rating_avg;
    ratingCount  = sc.rating_count;
    priceLastSold = sc.last_sold;
    if (sc.median) {
      priceMedian = sc.median.value;
      if (!currency && sc.median.currency) currency = sc.median.currency;
    }
    if (sc.high) {
      priceHigh = sc.high.value;
      if (!currency && sc.high.currency) currency = sc.high.currency;
    }
    // If scrape also surfaced a low and stats didn't, fall back to scrape's low.
    if (priceLow == null && sc.low) {
      priceLow = sc.low.value;
      if (!currency && sc.low.currency) currency = sc.low.currency;
    }
    // Count how many useful fields we got. If zero, the scrape "succeeded"
    // (HTTP 200) but didn't match anything — likely Discogs's layout shifted.
    const fields_found = [haveCount, wantCount, priceLow, priceMedian, priceHigh, priceLastSold]
      .filter(function (v) { return v != null; }).length;
    scrapeDebug = {
      status: 'ok',
      fields_found: fields_found,
      have_count: haveCount,
      want_count: wantCount,
      rating_avg: ratingAvg,
      rating_count: ratingCount,
      last_sold: priceLastSold,
      price_low_from_scrape: sc.low ? sc.low.value : null,
      price_median: priceMedian,
      price_high: priceHigh
    };
  } else {
    // scrape rejected — Discogs blocked us or network failure. Keep API data
    // and tell the caller via scrape_debug. NOT a fatal error.
    const err = scrapeResult.reason;
    scrapeDebug = {
      status: 'rejected',
      error: err ? err.message : 'unknown',
      http_status: err && err.status ? err.status : null
    };
  }

  // Only treat as a hard error if we got NOTHING from either source.
  if (
    priceLow == null &&
    priceMedian == null &&
    priceHigh == null &&
    copiesAvailable == null &&
    haveCount == null
  ) {
    const statsErr = statsResult.status === 'rejected' ? statsResult.reason : null;
    if (statsErr && statsErr.status === 401) {
      return badTokenResponse(statsErr, 'marketplace');
    }
    return jsonResponse({
      error: 'No marketplace or sales-history data found for this release.' +
             (statsErr ? ' Stats: ' + statsErr.message : '') +
             (scrapeDebug.status === 'rejected' ? ' Scrape: ' + scrapeDebug.error : ''),
      code: 'NO_DATA',
      discogs_release_id: releaseId,
      scrape_debug: scrapeDebug
    }, 502);
  }

  // v18: schema additions. price_last_sold is now a STRING date ("Apr 23, 2026")
  // or null, NOT a number. Existing readers expecting a number need to handle
  // the type change — only the detail-modal renderer reads it, and v18 updates
  // that render path to expect a date string.
  const updated = Object.assign({}, record, {
    discogs_release_id: releaseId,
    price_low: priceLow,
    price_high: priceHigh,
    price_median: priceMedian,
    price_last_sold: priceLastSold,
    copies_available: copiesAvailable,
    have_count: haveCount,
    want_count: wantCount,
    rating_avg: ratingAvg,
    rating_count: ratingCount,
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
    identityUsername: identityUsername,
    scrape_debug: scrapeDebug
  });
};

export const config = {
  path: '/api/discogs-pricing'
};
