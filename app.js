// Vinyl Scout — app.js
// version: 36
// v36 (2026-07-20): refreshPricing() now sends the edit passphrase (X-Edit-Key)
// with its request, prompting once via getEditSecret() (same sessionStorage-
// cached pattern as audit.html) -- required after discogs-pricing.mjs was
// correctly gated server-side (2026-07-20 security fix). Before this change
// the button would 401 for everyone, including Susan, since the client never
// sent any credential. See PROJECT.md for the security-fix writeup.
// v35 (2026-07-13): audio-preview.mjs v12 simplified to Deezer-only + a
// YouTube last resort (Spotify and iTunes tiers removed — neither ever
// contributed a playable preview across the 93-record catalog, per Susan's
// explicit request to make previews "all from Deezer"). Updated the
// provider-name map and the no-match/pending-YouTube copy to match: no more
// "checked Spotify, Deezer, Apple Music, and YouTube" — now just "Deezer and
// YouTube". One record ("The Blues Volume 2") loses a Spotify-sourced
// "matched, no clip" attribution detail it had picked up as a side effect of
// Spotify's independent search — Deezer's own title-search guard was already
// blocking a match for this generic a title on its own, so it now honestly
// shows as pending-YouTube instead, alongside the other 6 known gaps. See
// PROJECT.md v23 for the full changelog + re-sweep results.
// v34 (2026-07-13): the detail-modal "no track found" message now
// distinguishes a genuine, fully-checked absence from the specific,
// documented "pending YouTube setup" state (new `no_match_pending_youtube`
// reason from audio-preview.mjs v10) — e.g. Duke Ellington's "Ellington
// '65", one of 7 records confirmed absent from Spotify/Deezer/Apple Music
// but not yet re-checked against YouTube because YOUTUBE_API_KEY isn't set.
// Previously both cases rendered the identical "No matching track found.",
// which read as a bug rather than a known, already-tracked gap.
// v33: highlights the single highest-value record in the collection — a
//      quiet one-line callout ("Most valuable — Artist, Title · €price")
//      with a small thumbnail, rendered under the existing collection-value
//      stat in the controls heading. Deliberately text-first, no badge and
//      no change to the tile grid itself: Susan has twice pulled back from
//      decorative additions here (the green "FIND" badge removed per v10,
//      and pricing/metadata stripped off gallery tiles per v26), so this
//      stays inside the header's existing typographic language instead of
//      adding new visual weight to the collection view. Pure read of
//      already-stored price_median/price_low fields, no network calls;
//      recomputed alongside renderCollectionValue() on every render() pass.
// v32: Audio preview handles the new tier-4 YouTube fallback (last resort,
//      only reached when Spotify/Deezer/iTunes all miss — see
//      netlify/functions/audio-preview.mjs v8). YouTube gives no direct
//      audio file (no preview_url), only an embeddable video (embed_url) —
//      renders a capped-at-30s <iframe> instead of the native <audio>
//      element in that case. stopAnyPreview() clears the iframe's src to
//      actually stop playback (iframes have no .pause()).
// v31: Audio preview now calls /api/audio/preview (multi-provider: Spotify ->
//      Deezer -> iTunes, see netlify/functions/audio-preview.mjs) instead of
//      the Spotify-only /api/spotify/preview. Handles the new `provider`
//      field: shows "via Deezer"/"via Apple Music" under a playing clip, and
//      "Listen on <Provider> ↗" (not hardcoded Spotify) when a track matched
//      but had no preview anywhere.
// v30: When Spotify has no preview clip for the matched track (its own
//      platform-wide preview_url restriction — confirmed 2026-07-11 to affect
//      all 93 catalog records, not a bug in this code), show a "Listen on
//      Spotify" link using the track's spotify_url instead of a dead end.
// v29: Phase 4 — audio preview. Detail modal gets a "Play preview" button that
//      lazy-fetches /api/spotify/preview (most-popular track on the album, not
//      random) and plays it with a native <audio controls> element. No fetch
//      happens until Susan taps play. Gracefully quiet if Spotify isn't
//      configured yet, no match is found, or Spotify has no preview clip for
//      the track. Any playing preview is paused when the modal closes.
// v27: collection value also shown in US dollars — converts the EUR
// total at the day's ECB rate (api.frankfurter.dev), fetched client-side
// on load. If the rate fetch fails, the EUR figure shows alone.
// v26: gallery tiles show artist + album only — year/genre, pricing, and
// Have/Want counts removed from tiles; all of it still lives in the
// detail modal (Market + Release Info). List view unchanged.
// v25: header shows collection value only — dropped the 'X of Y priced'
//      coverage label per Susan's ask.
// v24: pricing on cards — gallery tiles and list rows show Low/Median/High
//      plus Have/Want counts; detail modal Market block gains the community
//      Rating row. Pure render of already-stored fields; no network calls.
// v23: added Release Info section to detail modal — shows label, catalog number,
//      country, format, and Discogs release ID (all already stored from Phase 2
//      enrichment). Renders only non-null fields; field presence checked before
//      writing any row.
// v21: soft collection value on home page — sums stored prices (price_median,
//      price_low fallback) grouped by currency, shows "X of Y priced" coverage.
//      Pure read of already-stored data; no network, no re-pricing.
// v20: genre browse rolled up to parent categories (text before "/"),
//      collapsing the long tail of sub-genres into their lead genre.
//      Chips + filter match by parent; cards show the parent genre;
//      the detail modal still shows the full sub-genre. Search is
//      unchanged (still matches the full genre string).
// v19: docs-only deploy. /about.html and PROJECT.md rewritten to match v18
//      reality (full Statistics block; scrape architecture; plain-text seed).
//      No functional code changes. Cache-bust bumped so the corrected docs
//      reach the exec without a stale browser cache.
// v18: full Statistics block in Market panel — range, median, last sold,
//      copies, Have/Want — sourced from scraped Discogs release page since
//      their API doesn't expose historical-sales data.
// v16: market block no longer shows the 'Updated' stamp or 'Matched' hint.
// v15: no app.js changes — the Discogs fetch fix is purely server-side.
// v14: meta line reads "CONDITION: VERY GOOD · 1976 · ..." (labeled).
// v13: Goldmine grades are spelled out in the detail modal.

(function () {
  'use strict';

  var allRecords = [];
  var currentView = 'gallery';   // v11: default to gallery
  var currentGenre = null;
  var currentSearch = '';
  var detailReturnFocus = null;
  var detailOpen = false;
  var suppressHashHandler = false;

  // Goldmine grades — see /about.html for full legend.
  var GRADES = ['M', 'NM', 'VG+', 'VG', 'G+', 'G', 'F', 'P'];
  var CONDITION_NAMES = {
    'M':   'Mint',
    'NM':  'Near Mint',
    'VG+': 'Very Good Plus',
    'VG':  'Very Good',
    'G+':  'Good Plus',
    'G':   'Good',
    'F':   'Fair',
    'P':   'Poor'
  };
  function normalizeCondition(c) {
    if (!c) return 'VG';
    var s = String(c).trim().toUpperCase();
    return GRADES.indexOf(s) !== -1 ? s : 'VG';
  }
  function conditionLabel(code) {
    return CONDITION_NAMES[code] || code;
  }

  function $(id) { return document.getElementById(id); }

  function escapeHtml(s) {
    if (s == null) return '';
    var d = document.createElement('div');
    d.textContent = String(s);
    return d.innerHTML;
  }
  function escapeAttr(s) {
    if (s == null) return '';
    return String(s).replace(/[&<>"']/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
    });
  }

  // v25: refreshPricing() now requires the edit secret (discogs-pricing.mjs
  // is gated server-side as of the 2026-07-20 security fix -- previously it
  // had no auth check at all, so anyone with the page open could trigger a
  // write + burn Discogs API quota). This mirrors audit.html's existing
  // getEditSecret()/clearEditSecret() pattern exactly, including the same
  // sessionStorage key, so a passphrase entered on either page carries over
  // within the same browser tab.
  function getEditSecret() {
    var s = '';
    try { s = sessionStorage.getItem('vs_edit_secret') || ''; } catch (e) {}
    if (s) return s;
    s = prompt('Enter edit passphrase (writes are protected):') || '';
    if (s) { try { sessionStorage.setItem('vs_edit_secret', s); } catch (e) {} }
    return s;
  }
  function clearEditSecret() {
    try { sessionStorage.removeItem('vs_edit_secret'); } catch (e) {}
  }

  function showError(msg) {
    var el = $('error-banner');
    el.textContent = msg;
    el.hidden = false;
  }
  function clearError() {
    var el = $('error-banner');
    el.textContent = '';
    el.hidden = true;
  }

  function normalizeGenre(g) {
    if (!g) return '';
    return String(g).toLowerCase().trim();
  }
  function genreLabel(g) {
    if (!g) return '—';
    return g.replace(/\b\w/g, function (c) { return c.toUpperCase(); });
  }
  // v20: the lead category — text before the first slash.
  // 'jazz / gypsy jazz' -> 'jazz'; 'reggae' -> 'reggae'.
  function parentGenre(g) {
    if (!g) return '';
    var s = String(g);
    var i = s.indexOf('/');
    return (i === -1 ? s : s.slice(0, i)).trim();
  }

  function formatPrice(amount, currency) {
    if (amount == null || isNaN(amount)) return null;
    var cur = currency || 'USD';
    var symbol = cur === 'EUR' ? '€' : '$';
    var n = Number(amount);
    return symbol + n.toFixed(2);
  }

  // v24: compact price + community strings for cards (gallery tiles, list rows).
  function cardPriceParts(r) {
    var cur = r.price_currency;
    var lo = formatPrice(r.price_low, cur);
    var med = formatPrice(r.price_median, cur);
    var hi = formatPrice(r.price_high, cur);
    var parts = [];
    if (lo) parts.push('L ' + lo);
    if (med) parts.push('M ' + med);
    if (hi) parts.push('H ' + hi);
    var hw = [];
    if (r.have_count != null && !isNaN(r.have_count)) hw.push(Number(r.have_count) + ' HAVE');
    if (r.want_count != null && !isNaN(r.want_count)) hw.push(Number(r.want_count) + ' WANT');
    return { price: parts.join(' · '), community: hw.join(' · ') };
  }

  var fxUsd = null; // EUR -> USD, today's ECB rate (v27)
async function loadFx() {
try {
var res = await fetch('https://api.frankfurter.dev/v1/latest?base=EUR&symbols=USD');
if (!res.ok) return;
var data = await res.json();
if (data && data.rates && data.rates.USD) {
fxUsd = Number(data.rates.USD);
renderCollectionValue();
}
} catch (e) { /* EUR-only display is fine */ }
}

// Soft collection value: sum stored prices across the catalog. Pure read of
  // already-stored data (no network, no re-pricing). Prefers price_median,
  // falls back to price_low. Groups by currency so we never add across them.
  function collectionValue() {
    var byCur = {};      // currency -> summed amount
    var priced = 0;      // how many records contributed
    for (var i = 0; i < allRecords.length; i++) {
      var r = allRecords[i];
      var amt = (r.price_median != null && !isNaN(r.price_median)) ? Number(r.price_median)
              : (r.price_low != null && !isNaN(r.price_low)) ? Number(r.price_low)
              : null;
      if (amt == null) continue;
      var cur = r.price_currency || 'USD';
      byCur[cur] = (byCur[cur] || 0) + amt;
      priced++;
    }
    return { byCur: byCur, priced: priced, total: allRecords.length };
  }

  function renderCollectionValue() {
    var el = $('collection-value');
    if (!el) return;
    var v = collectionValue();
    if (v.priced === 0) { el.hidden = true; el.textContent = ''; return; }
    var parts = [];
    for (var cur in v.byCur) {
      if (Object.prototype.hasOwnProperty.call(v.byCur, cur)) {
        parts.push('\u2248 ' + (cur === 'EUR' ? '€' : '$') + Math.round(v.byCur[cur]).toLocaleString('en-US'));
      }
    }
    var txt = parts.join(' + ');
if (fxUsd && v.byCur.EUR) {
txt += ' \u00b7 \u2248 $' + Math.round(v.byCur.EUR * fxUsd).toLocaleString('en-US') + ' USD';
}
el.textContent = txt;
    el.hidden = false;
  }

  // v33: the single highest-value record in the collection, by its own
  // stored price (price_median, falling back to price_low) — compared as
  // raw numbers regardless of currency, since we're only ever displaying
  // one record's own price in its own currency, never summing across them.
  function mostValuableRecord() {
    var best = null;
    var bestAmt = -Infinity;
    for (var i = 0; i < allRecords.length; i++) {
      var r = allRecords[i];
      var amt = (r.price_median != null && !isNaN(r.price_median)) ? Number(r.price_median)
              : (r.price_low != null && !isNaN(r.price_low)) ? Number(r.price_low)
              : null;
      if (amt == null) continue;
      if (amt > bestAmt) { bestAmt = amt; best = r; }
    }
    return best ? { record: best, amount: bestAmt } : null;
  }

  function renderHighlight() {
    var el = $('collection-highlight');
    if (!el) return;
    var top = mostValuableRecord();
    if (!top) { el.hidden = true; el.innerHTML = ''; return; }
    var r = top.record;
    var price = formatPrice(top.amount, r.price_currency);
    var cover = r.cover_url ? '<img src="' + escapeAttr(r.cover_url) + '" alt="">' : '';
    el.innerHTML = cover
      + '<span>Most valuable: <strong>' + escapeHtml(r.artist || 'Unknown') + '</strong>, '
      + '<em>' + escapeHtml(r.title || 'Untitled') + '</em>'
      + (price ? ' &middot; <span class="controls__highlight-price">' + escapeHtml(price) + '</span>' : '')
      + '</span>';
    el.hidden = false;
  }

  async function load() {
    try {
      var res = await fetch('/api/records?bust=' + Date.now());
      if (!res.ok) throw new Error('HTTP ' + res.status);
      var data = await res.json();
      allRecords = Array.isArray(data) ? data : [];
      clearError();
      renderChips();
      render();
      maybeOpenFromHash();
    } catch (err) {
      showError('Failed to load: ' + err.message);
      $('main').innerHTML = '<div class="empty">Failed to load. Check banner above.</div>';
    }
  }

  function filtered() {
    var q = currentSearch.toLowerCase().trim();
    var out = allRecords.filter(function (r) {
      if (currentGenre !== null && parentGenre(normalizeGenre(r.genre)) !== currentGenre) return false;
      if (q) {
        var hay = [r.artist, r.title, r.genre, r.year]
          .filter(Boolean).join(' ').toLowerCase();
        if (hay.indexOf(q) === -1) return false;
      }
      return true;
    });
    out.sort(function (a, b) {
      var ax = (a.artist || '').toLowerCase();
      var bx = (b.artist || '').toLowerCase();
      if (ax !== bx) return ax.localeCompare(bx);
      return (a.title || '').toLowerCase().localeCompare((b.title || '').toLowerCase());
    });
    return out;
  }

  function renderChips() {
    var counts = new Map();
    for (var i = 0; i < allRecords.length; i++) {
      var g = parentGenre(normalizeGenre(allRecords[i].genre));
      if (!g) continue;
      counts.set(g, (counts.get(g) || 0) + 1);
    }
    var entries = Array.from(counts.entries()).sort(function (a, b) {
      if (b[1] !== a[1]) return b[1] - a[1];
      return a[0].localeCompare(b[0]);
    });

    var html = ''
      + '<button type="button" class="chip' + (currentGenre === null ? ' is-on' : '') + '" '
      +   'data-g="" aria-pressed="' + (currentGenre === null ? 'true' : 'false') + '">'
      +   'All <span class="chip__n">' + allRecords.length + '</span>'
      + '</button>';
    for (var j = 0; j < entries.length; j++) {
      var key = entries[j][0];
      var n = entries[j][1];
      var on = currentGenre === key;
      html += ''
        + '<button type="button" class="chip' + (on ? ' is-on' : '') + '" '
        +   'data-g="' + escapeAttr(key) + '" '
        +   'aria-pressed="' + (on ? 'true' : 'false') + '">'
        +   escapeHtml(genreLabel(key))
        +   ' <span class="chip__n">' + n + '</span>'
        + '</button>';
    }
    $('chips').innerHTML = html;
  }

  function render() {
    document.body.dataset.view = currentView;

    var records = filtered();
    var total = allRecords.length;
    $('count').textContent = (records.length === total)
      ? total + (total === 1 ? ' record' : ' records')
      : records.length + ' of ' + total;

    renderCollectionValue();
    renderHighlight();

    var main = $('main');
    if (records.length === 0) {
      main.className = currentView;
      main.innerHTML = '<div class="empty">No matches.</div>';
      return;
    }

    if (currentView === 'list') {
      main.className = 'list';
      main.innerHTML = records.map(function (r) {
        var label = (r.artist || 'Unknown') + ': ' + (r.title || 'Untitled');
        return ''
          + '<button type="button" class="row" '
          +   'data-id="' + escapeAttr(r.id) + '" '
          +   'aria-label="' + escapeAttr(label) + '. Open details.">'
          +   '<span class="row__artist">' + escapeHtml(r.artist || '—') + '</span>'
          +   '<span class="row__title">'  + escapeHtml(r.title  || '—') + '</span>'
          +   '<span class="row__year">'   + (r.year != null ? r.year : '') + '</span>'
          +   '<span class="row__genre">'  + escapeHtml(r.genre ? genreLabel(parentGenre(normalizeGenre(r.genre))) : '') + '</span>'
          +   '<span class="row__price">'  + escapeHtml(cardPriceParts(r).price) + '</span>'
          + '</button>';
      }).join('');
    } else {
      main.className = 'gallery';
      main.innerHTML = records.map(function (r) {
        var initial = (r.artist || '?').trim().charAt(0).toUpperCase() || '?';
        var cover = r.cover_url
          ? '<img src="' + escapeAttr(r.cover_url) + '" alt="" loading="lazy">'
          : '<div class="tile__nocover" aria-hidden="true">' + escapeHtml(initial) + '</div>';
        var label = (r.artist || 'Unknown') + ': ' + (r.title || 'Untitled');
        return ''
          + '<button type="button" class="tile" '
          +   'data-id="' + escapeAttr(r.id) + '" '
          +   'aria-label="' + escapeAttr(label) + '. Open details.">'
          +   '<span class="tile__cover">' + cover + '</span>'
          +   '<span class="tile__text">'
          +     '<span class="tile__artist">' + escapeHtml(r.artist || '—') + '</span>'
          +     '<span class="tile__title">'  + escapeHtml(r.title  || '—') + '</span>'
          +   '</span>'
          + '</button>';
      }).join('');
    }
  }

  function setView(v) {
    if (v !== 'list' && v !== 'gallery') return;
    currentView = v;
    var listBtn = $('view-list');
    var galBtn = $('view-gallery');
    listBtn.classList.toggle('is-on', v === 'list');
    galBtn.classList.toggle('is-on',  v === 'gallery');
    listBtn.setAttribute('aria-pressed', v === 'list' ? 'true' : 'false');
    galBtn.setAttribute('aria-pressed',  v === 'gallery' ? 'true' : 'false');
    render();
  }

  // --- Detail modal ---

  function buildPricingBlock(r) {
    var lo  = formatPrice(r.price_low,        r.price_currency);
    var med = formatPrice(r.price_median,     r.price_currency);
    var hi  = formatPrice(r.price_high,       r.price_currency);
    var cnt = (r.copies_available != null && !isNaN(r.copies_available))
              ? Number(r.copies_available) : null;
    var lastSold = r.price_last_sold || null;   // v18: string date, not currency
    var haveN = (r.have_count != null && !isNaN(r.have_count)) ? Number(r.have_count) : null;
    var wantN = (r.want_count != null && !isNaN(r.want_count)) ? Number(r.want_count) : null;

    var hasAny = (lo != null || med != null || hi != null || cnt != null || lastSold != null || haveN != null);

    var dataHtml;
    if (hasAny) {
      // v18: full Statistics block from scraped release page.
      // Range from sales history (low – high), median, last sold date,
      // copies for sale, and the Have/Want community counts.
      var rows = '';

      // Range: show low–high if we have both, low alone, or high alone.
      if (lo != null && hi != null) {
        rows += '<dt>Range</dt><dd>' + escapeHtml(lo + ' – ' + hi) + '</dd>';
      } else if (lo != null) {
        rows += '<dt>Cheapest</dt><dd>' + escapeHtml(lo) + '</dd>';
      } else if (hi != null) {
        rows += '<dt>High</dt><dd>' + escapeHtml(hi) + '</dd>';
      }

      if (med != null) {
        rows += '<dt>Median</dt><dd>' + escapeHtml(med) + '</dd>';
      }
      if (lastSold) {
        rows += '<dt>Last sold</dt><dd>' + escapeHtml(lastSold) + '</dd>';
      }
      if (cnt != null) {
        rows += '<dt>Copies for sale</dt><dd>' + cnt + '</dd>';
      }
      if (haveN != null || wantN != null) {
        var hwParts = [];
        if (haveN != null) hwParts.push(haveN + ' have');
        if (wantN != null) hwParts.push(wantN + ' want');
        rows += '<dt>Community</dt><dd>' + hwParts.join(' · ') + '</dd>';
      }
      var ratingAvgV = (r.rating_avg != null && !isNaN(r.rating_avg)) ? Number(r.rating_avg) : null;
      var ratingCntV = (r.rating_count != null && !isNaN(r.rating_count)) ? Number(r.rating_count) : null;
      if (ratingAvgV != null) {
        rows += '<dt>Rating</dt><dd>' + ratingAvgV.toFixed(2) + ' / 5' + (ratingCntV ? ' · ' + ratingCntV + ' ratings' : '') + '</dd>';
      }

      dataHtml = '<dl class="detail__prices">' + rows + '</dl>';
    } else {
      dataHtml = '<p class="detail__prices-empty">No market data yet.</p>';
    }

    return ''
      + '<section class="detail__pricing" aria-label="Pricing">'
      +   '<div class="detail__pricing-head">'
      +     '<h3 class="detail__h3">Market</h3>'
      +     '<button type="button" class="detail__pricing-refresh js-pricing-refresh" data-id="' + escapeAttr(r.id) + '">'
      +       (hasAny ? 'Refresh from Discogs' : 'Fetch from Discogs')
      +     '</button>'
      +   '</div>'
      +   '<div class="detail__pricing-body" id="detail-pricing-body">' + dataHtml + '</div>'
      + '</section>';
  }

  function buildCatalogBlock(r) {
    // v23: Release Info section — shows label, catalog number, country, format,
    // and Discogs release ID. Only renders if there's at least one field present.
    var label = (r.label && String(r.label).trim()) || null;
    var catNo = (r.catalog_no && String(r.catalog_no).trim()) || null;
    var country = (r.country && String(r.country).trim()) || null;
    var format = (r.format && String(r.format).trim()) || null;
    var discogsId = (r.discogs_release_id != null) ? r.discogs_release_id : null;

    var hasAny = (label || catNo || country || format || discogsId);
    if (!hasAny) return '';

    var rows = '';
    if (label) {
      rows += '<dt>Label</dt><dd>' + escapeHtml(label) + '</dd>';
    }
    if (catNo) {
      rows += '<dt>Catalog</dt><dd>' + escapeHtml(catNo) + '</dd>';
    }
    if (country) {
      rows += '<dt>Country</dt><dd>' + escapeHtml(country) + '</dd>';
    }
    if (format) {
      rows += '<dt>Format</dt><dd>' + escapeHtml(format) + '</dd>';
    }
    if (discogsId) {
      var discogsUrl = 'https://www.discogs.com/release/' + escapeAttr(String(discogsId));
      rows += '<dt>Discogs</dt><dd><a href="' + discogsUrl + '" target="_blank" rel="noopener">Release ' + escapeHtml(String(discogsId)) + '</a></dd>';
    }

    return ''
      + '<section class="detail__catalog" aria-label="Release Info">'
      +   '<h3 class="detail__h3">Release Info</h3>'
      +   '<dl class="detail__prices">' + rows + '</dl>'
      + '</section>';
  }

  function buildAudioBlock(r) {
    // v29: Phase 4 audio preview. Renders a placeholder with a Play button;
    // the actual /api/audio/preview fetch is lazy (only on tap) so opening
    // the modal never spends a lookup nobody asked for.
    // Stale-comment fix (2026-07-20, no functional change, no version bump
    // — see the commit message for why): this used to say "v31: multi-
    // provider (Spotify -> Deezer -> iTunes)", which stopped being true as
    // of audio-preview.mjs v12 (2026-07-13) — Spotify and iTunes were both
    // removed there (neither ever contributed a single playable preview
    // across the whole catalog). Current architecture: Deezer (multi-pass —
    // known-compilation override, free-text, artist-catalog walk, then a
    // title-only pass with artist corroboration) as the sole preview
    // source, with YouTube as a last-resort fallback (needs
    // YOUTUBE_API_KEY) when Deezer misses entirely. See audio-preview.mjs's
    // own header comment for the full per-pass description.
    return ''
      + '<section class="detail__audio" aria-label="Preview">'
      +   '<h3 class="detail__h3">Preview</h3>'
      +   '<div class="detail__audio-body" id="detail-audio-body">'
      +     '<button type="button" class="detail__audio-play js-audio-play" '
      +       'data-artist="' + escapeAttr(r.artist || '') + '" '
      +       'data-title="' + escapeAttr(r.title || '') + '">'
      +       '▶ Play preview'
      +     '</button>'
      +   '</div>'
      + '</section>';
  }

  async function playPreview(artist, title, btn) {
    var body = document.getElementById('detail-audio-body');
    var origText = btn.textContent;
    btn.disabled = true;
    btn.textContent = 'Looking up…';

    try {
      var qs = '?artist=' + encodeURIComponent(artist) + '&title=' + encodeURIComponent(title);
      var res = await fetch('/api/audio/preview' + qs);
      var payload;
      try { payload = await res.json(); }
      catch (_) { payload = { error: 'HTTP ' + res.status }; }

      if (!res.ok) {
        var msg = (payload && payload.error) || ('HTTP ' + res.status);
        if (body) body.innerHTML = '<p class="detail__audio-error">' + escapeHtml(msg) + '</p>';
        return;
      }

      var providerNames = { deezer: 'Deezer', youtube: 'YouTube' };
      var providerLabel = providerNames[payload.provider] || null;

      if (!payload.available) {
        var note = payload.reason === 'not_configured'
          ? 'Audio preview isn’t set up yet.'
          : payload.reason === 'no_preview'
            ? 'No preview clip available for this track.'
            : payload.reason === 'no_match_pending_youtube'
              ? 'Not found on Deezer: a YouTube fallback is planned but not turned on yet.'
              : 'No matching track found: checked Deezer and YouTube.';
        var t2 = payload.track || {};
        var link = (payload.reason === 'no_preview' && t2.external_url && providerLabel)
          ? '<a class="detail__audio-spotify-link" href="' + escapeAttr(t2.external_url) + '" target="_blank" rel="noopener">Listen on ' + escapeHtml(providerLabel) + ' ↗</a>'
          : '';
        var label2 = [t2.artists, t2.name].filter(Boolean).join(': ');
        if (body) {
          body.innerHTML = ''
            + (label2 ? '<p class="detail__audio-track">' + escapeHtml(label2) + '</p>' : '')
            + '<p class="detail__audio-empty">' + escapeHtml(note) + '</p>'
            + link;
        }
        return;
      }

      var t = payload.track || {};
      var label = [t.artists, t.name].filter(Boolean).join(': ');
      // YouTube (tier 4, last resort) never has a preview_url — it gives no
      // direct audio file, only an embeddable video. Render an iframe capped
      // to the same ~30s clip convention (via the embed_url's own start/end
      // params, which actually stop playback there) instead of the native
      // <audio> element used by the other three providers.
      var playerHtml = (payload.provider === 'youtube' && t.embed_url)
        ? '<iframe class="detail__audio-player detail__audio-youtube" id="detail-audio-player" '
          + 'src="' + escapeAttr(t.embed_url) + '" '
          + 'title="YouTube preview" frameborder="0" '
          + 'allow="autoplay; encrypted-media" allowfullscreen></iframe>'
        : '<audio class="detail__audio-player" id="detail-audio-player" controls autoplay preload="auto" src="' + escapeAttr(t.preview_url) + '"></audio>';
      if (body) {
        body.innerHTML = ''
          + (label ? '<p class="detail__audio-track">' + escapeHtml(label) + '</p>' : '')
          + playerHtml
          + (providerLabel ? '<p class="detail__audio-provider">via ' + escapeHtml(providerLabel) + '</p>' : '');
      }
    } catch (err) {
      if (body) body.innerHTML = '<p class="detail__audio-error">Network error: ' + escapeHtml(err.message) + '</p>';
      btn.disabled = false;
      btn.textContent = origText;
    }
  }

  function stopAnyPreview() {
    var player = document.getElementById('detail-audio-player');
    if (player) {
      // <iframe> (YouTube) has no .pause() — the only reliable stop is to
      // clear its src so the embedded player unloads entirely.
      if (player.tagName === 'IFRAME') {
        try { player.src = ''; } catch (e) {}
      } else {
        try { player.pause(); } catch (e) {}
      }
    }
  }

  async function refreshPricing(id, btn) {
    var body = document.getElementById('detail-pricing-body');
    var origBtnText = btn.textContent;
    btn.disabled = true;
    btn.textContent = 'Fetching…';
    if (body) {
      body.innerHTML = '<p class="detail__prices-empty">Looking up on Discogs… (a few seconds)</p>';
    }

    try {
      var secret = getEditSecret();
      if (!secret) {
        if (body) {
          body.innerHTML = '<p class="detail__prices-error">Edit passphrase required to refresh pricing.</p>';
        }
        btn.disabled = false;
        btn.textContent = origBtnText;
        return;
      }
      var res = await fetch('/api/discogs-pricing', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'X-Edit-Key': secret },
        body: JSON.stringify({ recordId: id })
      });
      var payload;
      try { payload = await res.json(); }
      catch (_) { payload = { error: 'HTTP ' + res.status }; }

      if (res.status === 401) {
        clearEditSecret();
        if (body) {
          body.innerHTML = '<p class="detail__prices-error">Unauthorized: wrong passphrase. Click Retry to try again.</p>';
        }
        btn.disabled = false;
        btn.textContent = 'Retry';
        return;
      }

      if (!res.ok) {
        var msg = (payload && payload.error) || ('HTTP ' + res.status);
        if (body) {
          body.innerHTML = '<p class="detail__prices-error">' + escapeHtml(msg) + '</p>';
        }
        btn.disabled = false;
        btn.textContent = 'Retry';
        return;
      }

      // Update the in-memory record and re-render the modal so the new
      // values appear immediately. Closes + reopens to refresh the DOM
      // cleanly without bespoke patching logic.
      var updated = payload.record;
      if (updated && updated.id) {
        var idx = allRecords.findIndex(function (x) { return x.id === updated.id; });
        if (idx >= 0) allRecords[idx] = updated;
      }
      // v18: log scrape_debug to console so we can diagnose missing data.
      // The Discogs release-page scrape is fragile — Discogs could change
      // their layout. If fields_found is unexpectedly low or status is
      // 'rejected', this tells us why before the user files a complaint.
      if (payload && payload.scrape_debug) {
        try { console.log('[VinylScout] scrape_debug', payload.scrape_debug); } catch (_) {}
      }
      // v16: 'Matched: <release title>' hint removed per Susan's ask.
      // payload.discogs_match is still returned by the function for any
      // future use; the UI just doesn't render it.
      closeDetail();
      openDetail(id, null);
    } catch (err) {
      if (body) {
        body.innerHTML = '<p class="detail__prices-error">Network error: ' + escapeHtml(err.message) + '</p>';
      }
      btn.disabled = false;
      btn.textContent = origBtnText;
    }
  }

  function openDetail(id, triggerEl) {
    var r = allRecords.find(function (x) { return x.id === id; });
    if (!r) return;

    var inner = $('detail-inner');
    var initial = (r.artist || '?').trim().charAt(0).toUpperCase() || '?';
    var cover = r.cover_url
      ? '<img class="detail__img" src="' + escapeAttr(r.cover_url) + '" alt="">'
      : '<div class="detail__nocover" aria-hidden="true">' + escapeHtml(initial) + '</div>';

    var condition = normalizeCondition(r.condition);
    var conditionText = conditionLabel(condition);

    // v14: prefix grade with "CONDITION:" so the meta reads as labeled.
    // Combined meta line: "CONDITION: VERY GOOD · 1976 · REGGAE / ROOTS"
    var metaParts = ['CONDITION: ' + escapeHtml(conditionText)];
    if (r.year != null) metaParts.push(escapeHtml(r.year));
    if (r.genre) metaParts.push(escapeHtml(r.genre));
    var meta = '<p class="detail__meta">' + metaParts.join(' &middot; ') + '</p>';

    var notes = (r.notes && String(r.notes).trim())
      ? '<p class="detail__notes">' + escapeHtml(r.notes) + '</p>'
      : '';

    var pricing = buildPricingBlock(r);
    var catalog = buildCatalogBlock(r);
    var audio = buildAudioBlock(r);

    inner.innerHTML = ''
      + '<div class="detail__cover">' + cover + '</div>'
      + '<div class="detail__info">'
      +   '<p class="detail__artist">' + escapeHtml(r.artist || 'Unknown') + '</p>'
      +   '<h2 class="detail__title" id="detail-title">' + escapeHtml(r.title || 'Untitled') + '</h2>'
      +   meta
      +   audio
      +   pricing
      +   catalog
      +   notes
      + '</div>';

    detailReturnFocus = triggerEl || document.activeElement;

    var modal = $('detail');
    modal.hidden = false;
    document.body.classList.add('has-detail');
    detailOpen = true;

    requestAnimationFrame(function () {
      try { $('detail-close').focus({ preventScroll: true }); }
      catch (e) { $('detail-close').focus(); }
    });

    if (location.hash !== '#' + id) {
      suppressHashHandler = true;
      try { history.replaceState(null, '', '#' + id); } catch (e) {}
      setTimeout(function () { suppressHashHandler = false; }, 0);
    }
  }

  function closeDetail() {
    if (!detailOpen) return;
    stopAnyPreview();
    var modal = $('detail');
    modal.hidden = true;
    document.body.classList.remove('has-detail');
    detailOpen = false;

    if (detailReturnFocus && document.body.contains(detailReturnFocus)) {
      try { detailReturnFocus.focus({ preventScroll: true }); }
      catch (e) { try { detailReturnFocus.focus(); } catch (e2) {} }
    }
    detailReturnFocus = null;

    if (location.hash) {
      suppressHashHandler = true;
      try {
        history.replaceState(null, '',
          location.pathname + location.search);
      } catch (e) {}
      setTimeout(function () { suppressHashHandler = false; }, 0);
    }
  }

  function maybeOpenFromHash() {
    var raw = location.hash.replace(/^#/, '');
    if (!raw) return;
    if (!allRecords.length) return;
    var r = allRecords.find(function (x) { return x.id === raw; });
    if (r) openDetail(r.id, null);
  }

  // --- Wiring ---

  document.addEventListener('DOMContentLoaded', function () {
    $('search').addEventListener('input', function (e) {
      currentSearch = e.target.value;
      render();
    });

    $('chips').addEventListener('click', function (e) {
      var chip = e.target.closest && e.target.closest('.chip');
      if (!chip) return;
      var g = chip.dataset.g || '';
      currentGenre = g === '' ? null : g;
      renderChips();
      render();
    });

    $('view-list').addEventListener('click',    function () { setView('list'); });
    $('view-gallery').addEventListener('click', function () { setView('gallery'); });

    $('main').addEventListener('click', function (e) {
      var trigger = e.target.closest && e.target.closest('.row, .tile');
      if (!trigger) return;
      var id = trigger.dataset.id;
      if (id) openDetail(id, trigger);
    });

    $('detail-close').addEventListener('click', closeDetail);
    $('detail').addEventListener('click', function (e) {
      var refreshBtn = e.target.closest && e.target.closest('.js-pricing-refresh');
      if (refreshBtn) {
        var id = refreshBtn.dataset.id;
        if (id) refreshPricing(id, refreshBtn);
        return;
      }
      var playBtn = e.target.closest && e.target.closest('.js-audio-play');
      if (playBtn) {
        playPreview(playBtn.dataset.artist || '', playBtn.dataset.title || '', playBtn);
        return;
      }
      if (e.target && e.target.getAttribute && e.target.getAttribute('data-close') === '1') {
        closeDetail();
      }
    });

    document.addEventListener('keydown', function (e) {
      if (e.key === 'Escape' && detailOpen) {
        e.preventDefault();
        closeDetail();
      }
    });

    window.addEventListener('hashchange', function () {
      if (suppressHashHandler) return;
      if (!location.hash) {
        if (detailOpen) closeDetail();
      } else {
        maybeOpenFromHash();
      }
    });

    load();
    loadFx();
  });
})();
