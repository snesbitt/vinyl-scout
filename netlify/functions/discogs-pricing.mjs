// netlify/functions/discogs-pricing.mjs
// Vinyl Scout — Phase 3.1: on-demand market pricing from Discogs.
//
// Hard rules:
//   - On-demand only. No cron, no polling, no batch. One record per call.
//   - Upserts the existing record (preserves all other fields). Never replaces.
//   - If DISCOGS_TOKEN is not set, returns a helpful 503 — never crashes.
//   - Returns the full updated record so the UI can re-render without a refetch.
//
// What we can get from Discogs:
//   - price_low        ← marketplace/stats/{release_id}.lowest_price.value
//   - copies_available ← marketplace/stats/{release_id}.num_for_sale
//   - price_high       ← marketplace/price_suggestions/{release_id}["Mint (M)" || "Near Mint (NM or M-)"].value
//   - price_currency   ← whichever response carries it
//
// What we CAN'T get (honestly):
//   - price_last_sold — Discogs doesn't expose historical sale prices via API.
//     We leave it null and document the limitation in /about.html.
//
// Discogs API rate limit: 60 req/min for authenticated calls.

import { getStore } from '@netlify/blobs';

const USER_AGENT = 'VinylScout/1.0 +https://vinylscout.org';

function jsonResponse(payload, status = 200) {
  return new Response(JSON.stringify(payload), {
    status,
    headers: { 'Content-Type': 'application/json' }
  });
}

async function discogsFetch(url, token) {
  const res = await fetch(url, {
    headers: {
      'Authorization': `Discogs token=${token}`,
      'User-Agent': USER_AGENT,
      'Accept': 'application/json'
    }
  });
  if (!res.ok) {
    let body = '';
    try { body = (await res.text()).slice(0, 200); } catch (_) {}
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

  // 1. Token check — fail loudly but politely.
  let token = null;
  try {
    if (typeof Netlify !== 'undefined' && Netlify.env && Netlify.env.get) {
      token = Netlify.env.get('DISCOGS_TOKEN');
    }
  } catch (_) { /* fall through */ }
  if (!token && typeof process !== 'undefined' && process.env) {
    token = process.env.DISCOGS_TOKEN;
  }
  if (!token) {
    return jsonResponse({
      error: 'DISCOGS_TOKEN is not set on this Netlify site. Create a personal access token at https://www.discogs.com/settings/developers, then add it on Netlify under Site Settings → Environment Variables.',
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
  //    Prefer a stored discogs_release_id if we already have one (saves a search).
  let releaseId = record.discogs_release_id || null;
  let releaseTitle = null;

  if (!releaseId) {
    const q = `${record.artist} ${record.title}`;
    const params = new URLSearchParams({
      q,
      type: 'release',
      format: 'Vinyl',
      per_page: '5'
    });
    let search;
    try {
      search = await discogsFetch(
        `https://api.discogs.com/database/search?${params}`,
        token
      );
    } catch (err) {
      return jsonResponse({ error: 'Discogs search failed: ' + err.message }, 502);
    }
    const results = (search && search.results) || [];
    if (results.length === 0) {
      return jsonResponse({
        error: `No Discogs match for "${record.artist} — ${record.title}". Try adjusting the artist or title on /audit.html.`,
        code: 'NO_MATCH'
      }, 404);
    }
    // First result is usually the canonical pressing for popular records.
    // We can't be smarter without a per-record disambiguation UI — that's Phase 3.2.
    releaseId = results[0].id;
    releaseTitle = results[0].title || null;
  }

  // 5. Fetch stats and price suggestions in parallel.
  const statsUrl = `https://api.discogs.com/marketplace/stats/${releaseId}`;
  const suggestUrl = `https://api.discogs.com/marketplace/price_suggestions/${releaseId}`;
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
    // Discogs labels conditions verbosely; pick the best available.
    const high = sugg['Mint (M)'] || sugg['Near Mint (NM or M-)'];
    if (high && typeof high.value === 'number') {
      priceHigh = high.value;
      if (!currency && high.currency) currency = high.currency;
    }
  }

  // If we got nothing useful at all, report it instead of writing empty values.
  if (priceLow == null && priceHigh == null && copiesAvailable == null) {
    const statsErr = statsResult.status === 'rejected' ? statsResult.reason.message : null;
    const suggErr = suggestResult.status === 'rejected' ? suggestResult.reason.message : null;
    return jsonResponse({
      error: 'No marketplace data found for this release on Discogs.' +
             (statsErr ? ' Stats: ' + statsErr : '') +
             (suggErr ? ' Suggestions: ' + suggErr : ''),
      code: 'NO_DATA',
      discogs_release_id: releaseId
    }, 502);
  }

  // 6. Upsert the record. Preserve everything else.
  const updated = Object.assign({}, record, {
    discogs_release_id: releaseId,
    price_low: priceLow,
    price_high: priceHigh,
    price_last_sold: null,             // Not exposed by Discogs API. Honest null.
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
    discogs_match: releaseTitle  // human-readable hint of which release we matched
  });
};

export const config = {
  path: '/api/discogs-pricing'
};
